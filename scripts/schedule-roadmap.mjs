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
 * Heuristic (updated to support stable Gantt semantics):
 *  1. Build historical duration samples from CLOSED issues that have both Start & Finish OR fallback to
 *     createdAt->closedAt elapsed whole days (>=1).
 *  2. Compute medians per (scope|type), per scope, global; use DEFAULT_DURATION_DAYS as final fallback.
 *  3. Iterate implementation-order. Skip CLOSED or Status = Done.
 *  4. Status IN PROGRESS semantics:
 *       - Preserve the actual recorded Start date (do NOT rebaseline to today).
 *       - If Start missing, set Start = today (first detection) and compute Finish = Start + plannedDuration - 1.
 *       - If Finish exists but today > Finish, extend Finish to today (work took longer; cannot finish earlier).
 *       - If Finish is missing, compute it from Start + plannedDuration - 1; extend to today if already past.
 *  5. NOT STARTED (e.g., Status = Todo) with existing Start/Finish:
 *       - If their window lies before the current cursor (gap/overdue), shift block forward preserving inclusive duration.
 *       - Overdue windows (Finish < today) are also shifted forward even without weekly reseat.
 *  6. Items missing any date(s): assign projected Start = max(cursor, today) and Finish = Start + plannedDuration - 1.
 *  7. Sequential resource constraint: cursor always advances to (Finish + 1 day); we never pull future work earlier.
 *  8. RESEAT_EXISTING still allows forward shifts for already scheduled future items when earlier blocks grew; it no
 *     longer controls overdue correction (which now always applies).
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
 *   (Fixed) start field name   – 'Start'
 *   (Fixed) finish field name  – 'Finish'
 *   DEFAULT_DURATION_DAYS      – default 2
 *   RESEAT_EXISTING=true       – if true, will shift existing scheduled items forward to remove gaps
 *                                 (while preserving individual durations). Default false.
 *
 * Exit codes: 0 success; non-zero on fatal errors.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
// Field names fixed (simplified per current project convention)
const START_FIELD_NAME = 'Start'
const TARGET_FIELD_NAME = 'Finish'
const DEFAULT_DURATION_DAYS = Number(process.env.DEFAULT_DURATION_DAYS || 2)
const RESEAT_EXISTING = /^(1|true|yes)$/i.test(process.env.RESEAT_EXISTING || '')
const mode = process.argv[2] || 'dry-run'

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/**
 * Execute a GraphQL query, throwing unless all returned errors are explicitly suppressed.
 * @param {string} query
 * @param {object} variables
 * @param {object} [options]
 * @param {Array<string>} [options.suppressPaths] - error paths to suppress (exact first element match)
 */
async function ghGraphQL(query, variables, options = {}) {
    const resp = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
        body: JSON.stringify({ query, variables })
    })
    const json = await resp.json()
    if (json.errors) {
        const suppress = new Set(options.suppressPaths || [])
        const nonSuppressed = json.errors.filter((e) => !suppress.has(e.path?.[0]))
        if (nonSuppressed.length) {
            console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2))
            throw new Error('GraphQL query failed')
        }
    }
    return json.data
}

// (legacy fetchProjectItems removed in favor of unified query implementation below)

async function fetchProjectFields(projectId) {
    // Removed explicit ProjectV2DateField fragment for forward compatibility; FieldCommon yields id/name.
    const data = await ghGraphQL(
        `query($projectId:ID!){node(id:$projectId){... on ProjectV2 { fields(first:50){nodes{ ... on ProjectV2FieldCommon { id name } ... on ProjectV2SingleSelectField { id name options { id name } } }}}}}`,
        { projectId }
    )
    return data.node.fields.nodes
}

async function updateDateField(projectId, itemId, fieldId, date) {
    await ghGraphQL(
        `mutation($p:ID!,$i:ID!,$f:ID!,$d:Date!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{date:$d}}){projectV2Item{id}}}`,
        { p: projectId, i: itemId, f: fieldId, d: date }
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
    return { scope, type }
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
        const { scope, type } = classifyIssue(content)
        samples.push({ scope, type, duration })
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
    return { byKey, byScope, all }
}

// Fetch project items, trying user -> organization -> viewer while suppressing NOT_FOUND on the unused type.
async function fetchProjectItems() {
    const ownerPreference = PROJECT_OWNER_TYPE.toLowerCase()
    const attemptOrder =
        ownerPreference === 'org'
            ? ['org', 'user', 'viewer']
            : ownerPreference === 'user'
              ? ['user', 'org', 'viewer']
              : ['user', 'org', 'viewer']

    let projectId = null
    let ownerType = null
    const allNodes = []

    for (const kind of attemptOrder) {
        let hasNext = true
        let after = null
        while (hasNext) {
            let query = ''
            if (kind === 'user') {
                query = `query($owner:String!,$number:Int!,$after:String){
                  user(login:$owner){ projectV2(number:$number){ id title items(first:100, after:$after){ nodes{ id content{ ... on Issue { id number title state createdAt closedAt labels(first:30){nodes{name}} }} fieldValues(first:50){ nodes { ... on ProjectV2ItemFieldDateValue { field { ... on ProjectV2FieldCommon { id name } } date } ... on ProjectV2ItemFieldSingleSelectValue { field { ... on ProjectV2FieldCommon { id name } } name optionId } } } } pageInfo { hasNextPage endCursor } } } }
                }`
            } else if (kind === 'org') {
                query = `query($owner:String!,$number:Int!,$after:String){
                  organization(login:$owner){ projectV2(number:$number){ id title items(first:100, after:$after){ nodes{ id content{ ... on Issue { id number title state createdAt closedAt labels(first:30){nodes{name}} }} fieldValues(first:50){ nodes { ... on ProjectV2ItemFieldDateValue { field { ... on ProjectV2FieldCommon { id name } } date } ... on ProjectV2ItemFieldSingleSelectValue { field { ... on ProjectV2FieldCommon { id name } } name optionId } } } } pageInfo { hasNextPage endCursor } } } }
                }`
            } else {
                query = `query($number:Int!,$after:String){
                  viewer { projectV2(number:$number){ id title items(first:100, after:$after){ nodes{ id content{ ... on Issue { id number title state createdAt closedAt labels(first:30){nodes{name}} }} fieldValues(first:50){ nodes { ... on ProjectV2ItemFieldDateValue { field { ... on ProjectV2FieldCommon { id name } } date } ... on ProjectV2ItemFieldSingleSelectValue { field { ... on ProjectV2FieldCommon { id name } } name optionId } } } } pageInfo { hasNextPage endCursor } } }
                }`
            }
            let data
            try {
                data = await ghGraphQL(
                    query,
                    kind === 'viewer' ? { number: PROJECT_NUMBER, after } : { owner: PROJECT_OWNER, number: PROJECT_NUMBER, after },
                    {
                        suppressPaths: kind === 'org' ? ['organization'] : kind === 'user' ? ['user'] : []
                    }
                )
            } catch {
                // Non-suppressed errors: break out and try next kind.
                break
            }
            const container = kind === 'user' ? data.user : kind === 'org' ? data.organization : data.viewer
            if (!container || !container.projectV2) break
            if (!projectId) {
                projectId = container.projectV2.id
                ownerType = kind
            }
            const page = container.projectV2.items
            allNodes.push(...page.nodes.filter((n) => n.content && n.content.number))
            hasNext = page.pageInfo.hasNextPage
            after = page.pageInfo.endCursor
        }
        if (projectId) break
    }
    return { projectId, nodes: allNodes, ownerType }
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
    const { projectId, nodes: projectItems, ownerType } = await fetchProjectItems()
    if (!projectId) {
        console.error('Project not found; cannot schedule.')
        process.exit(1)
    }
    console.log(`Project located type=${ownerType} id=${projectId}`)
    const fields = await fetchProjectFields(projectId)
    const startField = fields.find((f) => f.name === START_FIELD_NAME)
    const targetField = fields.find((f) => f.name === TARGET_FIELD_NAME)
    if (!startField || !targetField) {
        console.error(
            `Missing required project date fields. Expected: '${START_FIELD_NAME}' and '${TARGET_FIELD_NAME}'. Found: ${fields.map((f) => f.name).join(', ') || '(none)'}`
        )
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
    // Today (UTC midnight) used for initial cursor; in-progress items retain original Start once set.
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    let cursorDate = new Date(today)
    const changes = []
    for (const entry of ordered) {
        const item = projectMap.get(entry.issue)
        if (!item) continue
        const issue = item.content
        const status = extractFieldValue(item, 'Status') || ''
        if (status === 'Done' || issue.state === 'CLOSED') continue
        const existingStart = extractFieldValue(item, START_FIELD_NAME)
        const existingEnd = extractFieldValue(item, TARGET_FIELD_NAME)
        const { scope, type } = classifyIssue(issue)
        const inProgress = /in progress/i.test(status)

        // Case 1: Both dates already present
        if (existingStart && existingEnd) {
            const sDate = new Date(existingStart + 'T00:00:00Z')
            const eDate = new Date(existingEnd + 'T00:00:00Z')
            const inclusiveDuration = Math.max(1, wholeDayDiff(sDate, eDate))

            if (inProgress) {
                // Preserve actual start; extend finish if overdue (today later than current finish)
                let newStart = sDate
                let newEnd = eDate
                if (today > newEnd) {
                    newEnd = new Date(today) // extend ongoing work
                }
                // No compression: if start lies before cursor (e.g., earlier tasks slipped), we do NOT move it.
                // Instead we allow overlap in historical sense but advance cursor from the *later* of cursor & newEnd.
                // For future scheduling we must ensure next start begins after real finish.
                if (iso(newStart) !== iso(sDate) || iso(newEnd) !== iso(eDate)) {
                    changes.push({
                        issue: issue.number,
                        itemId: item.id,
                        start: iso(newStart),
                        target: iso(newEnd),
                        reason: today > eDate ? 'extend-in-progress' : 'adjust-in-progress'
                    })
                }
                // Cursor must be at least day after finish (sequential capacity constraint)
                cursorDate = addDays(newEnd, 1)
            } else {
                // Not started yet (Todo / Backlog). If scheduled window is in the past or overlaps cursor, shift forward.
                const needsShift = sDate < cursorDate || eDate < today
                if (needsShift || (RESEAT_EXISTING && sDate < cursorDate)) {
                    const dur = inclusiveDuration
                    const newStart = new Date(Math.max(cursorDate.getTime(), today.getTime()))
                    const newEnd = addDays(newStart, dur - 1)
                    const reason = eDate < today ? 'overdue-shift' : 'shift-forward'
                    changes.push({ issue: issue.number, itemId: item.id, start: iso(newStart), target: iso(newEnd), reason })
                    cursorDate = addDays(newEnd, 1)
                } else {
                    cursorDate = addDays(eDate, 1)
                }
            }
            continue
        }

        // Case 2: Missing one or both dates
        const plannedDuration = Math.max(1, Math.round(chooseDuration(medians, scope, type, DEFAULT_DURATION_DAYS)))
        if (inProgress) {
            // If start missing, set it today; else keep existing start if present.
            const startDate = existingStart ? new Date(existingStart + 'T00:00:00Z') : new Date(today)
            let finishDate
            if (existingEnd) {
                finishDate = new Date(existingEnd + 'T00:00:00Z')
            } else {
                finishDate = addDays(startDate, plannedDuration - 1)
            }
            if (today > finishDate) finishDate = new Date(today)
            const needChange = !existingStart || !existingEnd || iso(startDate) !== existingStart || iso(finishDate) !== existingEnd
            if (needChange) {
                changes.push({
                    issue: issue.number,
                    itemId: item.id,
                    start: iso(startDate),
                    target: iso(finishDate),
                    reason: !existingStart ? 'start-in-progress' : !existingEnd ? 'finish-infer' : 'extend-in-progress'
                })
            }
            cursorDate = addDays(finishDate, 1)
            continue
        }

        // Not started & missing dates: project forward.
        const projectedStart = new Date(Math.max(cursorDate.getTime(), today.getTime()))
        const projectedFinish = addDays(projectedStart, plannedDuration - 1)
        changes.push({
            issue: issue.number,
            itemId: item.id,
            start: iso(projectedStart),
            target: iso(projectedFinish),
            reason: existingStart || existingEnd ? 'partial-fill' : 'new'
        })
        cursorDate = addDays(projectedFinish, 1)
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
