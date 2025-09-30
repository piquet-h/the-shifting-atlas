#!/usr/bin/env node
/* eslint-env node */
/* global fetch, process, console */
/**
 * Schedule roadmap issues (Projects v2) by assigning Start / Target (Finish) dates
 * based on historical median durations per (scope,type) label pair and implementation order.
 *
 * Data sources:
 *  - roadmap/implementation-order.json (ordering + titles) — source of truth order
 *  - GitHub Issues + ProjectV2 (labels, state, existing date field values, createdAt/closedAt)
 *
 * Heuristic:
 *  1. Build historical duration samples from CLOSED issues that have both start & target project date
 *     fields OR derive duration = closedAt - createdAt (fallback) in whole days (>=1).
 *  2. Group samples by composite key scopeLabel|typeLabel (scope label starts with 'scope:'; type is first
 *     non-scope label). Compute median per key; also compute per-scope and global median fallback.
 *  3. Walk implementation-order ascending. Skip issues already CLOSED or with Status = Done.
 *  4. For each unscheduled issue, if it already has both start + target dates, retain unless the start
 *     is earlier than the previous chain end (indicates drift) — then shift forward preserving its duration.
 *  5. For issues missing dates, assign start = previous chain end (or TODAY if first) and duration =
 *     median(scope|type) || median(scope) || median(global) || DEFAULT_DURATION_DAYS (2). Target = start + duration - 1 day.
 *  6. Optionally skip assigning dates to items whose Status is not yet 'Todo' (configurable) — current logic
 *     only skips if already Done/Closed.
 *
 * Modes:
 *   dry-run (default)  – prints planned changes, exits 0
 *   apply              – performs mutations to set/update date field values
 *
 * Environment:
 *   GITHUB_TOKEN / GH_TOKEN   – required
 *   PROJECT_OWNER              – defaults to repo owner (user or org)
 *   PROJECT_NUMBER             – defaults 3
 *   PROJECT_OWNER_TYPE         – '', 'user', 'org' (auto-detect order like sync script if unset)
 *   START_FIELD_NAME           – default 'Start date'
 *   TARGET_FIELD_NAME          – default 'Target date'
 *   DEFAULT_DURATION_DAYS      – default 2
 *   RESEAT_EXISTING=true       – if true, will shift existing scheduled items forward to remove gaps
 *                                 (while preserving individual durations). Default false.
 *
 * Exit codes: 0 success; non-zero on fatal errors.
 */

import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ROADMAP_JSON = path.join(ROOT, 'roadmap', 'implementation-order.json')
const REPO_OWNER = 'piquet-h'
// (repo name constant reserved for future use; keep commented to avoid unused var lint)
// const REPO_NAME = 'the-shifting-atlas'

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
if (!token) {
    console.error('Missing GITHUB_TOKEN. Export it or run inside GitHub Actions.')
    process.exit(2)
}

const PROJECT_OWNER = process.env.PROJECT_OWNER || REPO_OWNER
const PROJECT_NUMBER = Number(process.env.PROJECT_NUMBER || 3)
const PROJECT_OWNER_TYPE = process.env.PROJECT_OWNER_TYPE || ''
const START_FIELD_NAME = process.env.START_FIELD_NAME || 'Start date'
const TARGET_FIELD_NAME = process.env.TARGET_FIELD_NAME || 'Target date'
const DEFAULT_DURATION_DAYS = Number(process.env.DEFAULT_DURATION_DAYS || 2)
const RESEAT_EXISTING = /^(1|true|yes)$/i.test(process.env.RESEAT_EXISTING || '')
const mode = process.argv[2] || 'dry-run'

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
}

async function ghGraphQL(query, variables) {
    const resp = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json'},
        body: JSON.stringify({query, variables})
    })
    const json = await resp.json()
    if (json.errors) {
        console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2))
        throw new Error('GraphQL query failed')
    }
    return json.data
}

// (legacy fetchProjectItems removed in favor of unified query implementation below)

async function fetchProjectFields(projectId) {
    const data = await ghGraphQL(
        `query($projectId:ID!){node(id:$projectId){... on ProjectV2 { fields(first:50){nodes{ ... on ProjectV2FieldCommon { id name } ... on ProjectV2DateField { id name } ... on ProjectV2SingleSelectField { id name options { id name } } }}}}}`,
        {projectId}
    )
    return data.node.fields.nodes
}

async function updateDateField(projectId, itemId, fieldId, date) {
    await ghGraphQL(
        `mutation($p:ID!,$i:ID!,$f:ID!,$d:Date!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{date:$d}}){projectV2Item{id}}}`,
        {p: projectId, i: itemId, f: fieldId, d: date}
    )
}

function median(nums) {
    if (!nums.length) return 0
    const s = [...nums].sort((a, b) => a - b)
    const m = Math.floor(s.length / 2)
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function iso(d) {
    return d.toISOString().slice(0, 10)
}

function addDays(date, days) {
    const d = new Date(date.getTime())
    d.setUTCDate(d.getUTCDate() + days)
    return d
}

function wholeDayDiff(a, b) {
    return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)))
}

function extractFieldValue(node, fieldName) {
    for (const fv of node.fieldValues.nodes) {
        if (fv.field?.name === fieldName) {
            return fv.date || fv.name || null
        }
    }
    return null
}

function classifyIssue(issue) {
    const labels = issue.labels?.nodes?.map((l) => l.name) || []
    const scope = labels.find((l) => l.startsWith('scope:')) || ''
    const type = labels.find((l) => !l.startsWith('scope:')) || ''
    return {scope, type}
}

function buildHistoricalDurations(projectItems, startFieldName, targetFieldName) {
    const samples = []
    for (const item of projectItems) {
        const content = item.content
        if (content.state !== 'CLOSED') continue
        const startStr = extractFieldValue(item, startFieldName)
        const endStr = extractFieldValue(item, targetFieldName)
        let duration = null
        if (startStr && endStr) {
            const s = new Date(startStr + 'T00:00:00Z')
            const e = new Date(endStr + 'T00:00:00Z')
            if (!isNaN(s) && !isNaN(e) && e >= s) duration = wholeDayDiff(s, e) + 0 // inclusive days
        }
        if (duration == null && content.createdAt && content.closedAt) {
            const s = new Date(content.createdAt)
            const e = new Date(content.closedAt)
            if (!isNaN(s) && !isNaN(e) && e >= s) duration = wholeDayDiff(s, e)
        }
        if (duration == null) continue
        const {scope, type} = classifyIssue(content)
        samples.push({scope, type, duration})
    }
    const byKey = new Map()
    const byScope = new Map()
    const all = []
    // Populate grouped collections
    for (const s of samples) {
        const key = `${s.scope}|${s.type}`
        if (!byKey.has(key)) byKey.set(key, [])
        byKey.get(key).push(s.duration)
        if (!byScope.has(s.scope)) byScope.set(s.scope, [])
        byScope.get(s.scope).push(s.duration)
        all.push(s.duration)
    }
    return {byKey, byScope, all}
}

// Replacement implementation: unified query to avoid dynamic template parsing issues.
async function fetchProjectItems() {
    let hasNext = true
    let after = null
    const nodes = []
    let projectId = null
    let ownerType = null
    while (hasNext) {
        const data = await ghGraphQL(
            `query($owner:String!,$number:Int!,$after:String){
        user(login:$owner){ projectV2(number:$number){ id title items(first:100, after:$after){
          nodes{ id content{ ... on Issue { id number title state createdAt closedAt labels(first:30){nodes{name}} }} fieldValues(first:50){ nodes { ... on ProjectV2ItemFieldDateValue { field { ... on ProjectV2FieldCommon { id name } } date } ... on ProjectV2ItemFieldSingleSelectValue { field { ... on ProjectV2FieldCommon { id name } } name optionId } } } } pageInfo { hasNextPage endCursor } } } }
        organization(login:$owner){ projectV2(number:$number){ id title items(first:100, after:$after){
          nodes{ id content{ ... on Issue { id number title state createdAt closedAt labels(first:30){nodes{name}} }} fieldValues(first:50){ nodes { ... on ProjectV2ItemFieldDateValue { field { ... on ProjectV2FieldCommon { id name } } date } ... on ProjectV2ItemFieldSingleSelectValue { field { ... on ProjectV2FieldCommon { id name } } name optionId } } } } pageInfo { hasNextPage endCursor } } } }
        viewer { projectV2(number:$number){ id title items(first:100, after:$after){
          nodes{ id content{ ... on Issue { id number title state createdAt closedAt labels(first:30){nodes{name}} }} fieldValues(first:50){ nodes { ... on ProjectV2ItemFieldDateValue { field { ... on ProjectV2FieldCommon { id name } } date } ... on ProjectV2ItemFieldSingleSelectValue { field { ... on ProjectV2FieldCommon { id name } } name optionId } } } } pageInfo { hasNextPage endCursor } } } }
      }`,
            {owner: PROJECT_OWNER, number: PROJECT_NUMBER, after}
        )
        const candidates = [
            {kind: 'user', node: data.user?.projectV2},
            {kind: 'organization', node: data.organization?.projectV2},
            {kind: 'viewer', node: data.viewer?.projectV2}
        ]
        const found = candidates.find((c) => c.node)
        if (!found) break
        if (!projectId) {
            projectId = found.node.id
            ownerType = found.kind
        }
        const page = found.node.items
        nodes.push(...page.nodes.filter((n) => n.content && n.content.number))
        hasNext = page.pageInfo.hasNextPage
        after = page.pageInfo.endCursor
    }
    return {projectId, nodes, ownerType}
}

function chooseDuration(medians, scope, type, fallback) {
    const key = `${scope}|${type}`
    if (medians.byKey.has(key)) return medians.byKey.get(key)
    if (medians.byScope.has(scope)) return medians.byScope.get(scope)
    if (medians.global) return medians.global
    return fallback
}

async function main() {
    const roadmap = readJson(ROADMAP_JSON)
    const {projectId, nodes: projectItems, ownerType} = await fetchProjectItems()
    if (!projectId) {
        console.error('Project not found; cannot schedule.')
        process.exit(1)
    }
    console.log(`Project located type=${ownerType} id=${projectId}`)
    const fields = await fetchProjectFields(projectId)
    const startField = fields.find((f) => f.name === START_FIELD_NAME)
    const targetField = fields.find((f) => f.name === TARGET_FIELD_NAME)
    if (!startField || !targetField) {
        console.error(`Missing required date fields '${START_FIELD_NAME}' and/or '${TARGET_FIELD_NAME}' in project.`)
        process.exit(3)
    }

    const hist = buildHistoricalDurations(projectItems, START_FIELD_NAME, TARGET_FIELD_NAME)
    const medians = {
        byKey: new Map([...hist.byKey.entries()].map(([k, v]) => [k, median(v)])),
        byScope: new Map([...hist.byScope.entries()].map(([k, v]) => [k, median(v)])),
        global: median(hist.all)
    }
    console.log('Historical medians summary:', {
        pairs: [...medians.byKey.entries()].slice(0, 10),
        scopes: [...medians.byScope.entries()],
        global: medians.global
    })

    const projectMap = new Map(projectItems.map((pi) => [pi.content.number, pi]))
    const ordered = [...roadmap.items].sort((a, b) => a.order - b.order)
    let cursorDate = new Date()
    cursorDate.setUTCHours(0, 0, 0, 0)
    const changes = []
    for (const entry of ordered) {
        const item = projectMap.get(entry.issue)
        if (!item) continue
        const issue = item.content
        const status = extractFieldValue(item, 'Status') || ''
        if (status === 'Done' || issue.state === 'CLOSED') continue
        const existingStart = extractFieldValue(item, START_FIELD_NAME)
        const existingEnd = extractFieldValue(item, TARGET_FIELD_NAME)
        const {scope, type} = classifyIssue(issue)
        if (existingStart && existingEnd) {
            const sDate = new Date(existingStart + 'T00:00:00Z')
            const eDate = new Date(existingEnd + 'T00:00:00Z')
            if (RESEAT_EXISTING && sDate < cursorDate) {
                const dur = Math.max(1, wholeDayDiff(sDate, eDate))
                const newStart = new Date(cursorDate)
                const newEnd = addDays(newStart, dur - 1)
                changes.push({issue: issue.number, itemId: item.id, start: iso(newStart), target: iso(newEnd), reason: 'reseat'})
                cursorDate = addDays(newEnd, 1)
            } else {
                cursorDate = addDays(eDate, 1)
            }
            continue
        }
        const dur = Math.max(1, Math.round(chooseDuration(medians, scope, type, DEFAULT_DURATION_DAYS)))
        const start = new Date(cursorDate)
        const target = addDays(start, dur - 1)
        changes.push({issue: issue.number, itemId: item.id, start: iso(start), target: iso(target), reason: existingStart || existingEnd ? 'partial-fill' : 'new'})
        cursorDate = addDays(target, 1)
    }

    if (!changes.length) {
        console.log('No scheduling changes needed.')
        return
    }
    console.log(`${changes.length} scheduling change(s) planned.`)
    for (const ch of changes) {
        console.log(`#${ch.issue} ${ch.start} -> ${ch.target} (${ch.reason})`)
    }
    if (mode === 'apply') {
        for (const ch of changes) {
            await updateDateField(projectId, ch.itemId, startField.id, ch.start)
            await updateDateField(projectId, ch.itemId, targetField.id, ch.target)
            console.log(`Applied #${ch.issue}`)
        }
    } else {
        console.log('Dry-run; re-run with "apply" to persist changes.')
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
