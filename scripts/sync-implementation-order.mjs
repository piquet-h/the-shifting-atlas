#!/usr/bin/env node
/* eslint-env node */
// DEPRECATED: sync-implementation-order.mjs retired. No operation performed.
console.error('sync-implementation-order.mjs deprecated – no action performed.')
process.exit(0)
/* global fetch, process, console */
/**
 * Sync Implementation Order between:
 *  - GitHub Project (Projects v2) numeric field "Implementation order" (canonical)
 *  - docs/roadmap.md (generated summary for Copilot context & readers)
 *
 * Usage:
 *   node scripts/sync-implementation-order.mjs validate          # exits non-zero if drift (project optional)
 *   node scripts/sync-implementation-order.mjs apply             # apply updates to project + regen docs
 *   node scripts/sync-implementation-order.mjs resequence        # resequence orders 1..N directly in project
 *   node scripts/sync-implementation-order.mjs next [N]          # print next N actionable issues (skip Done) as JSON
 *
 * Environment (optional overrides):
 *   GITHUB_TOKEN                  – required for any GitHub API interaction
 *   PROJECT_OWNER                 – login whose project houses the roadmap (user or org). Defaults to repo owner.
 *   PROJECT_NUMBER                – numeric project number. Defaults to 3.
 *   PROJECT_OWNER_TYPE            – 'user' | 'org' (auto‑detect: tries user first then org if unset)
 *   ALLOW_MISSING_PROJECT=true    – do not fail if project not found; treat as documentation‑only mode
 *
 * Notes:
 *  - Previous version hard‑coded user(project #3) and failed when the project did not exist. This version
 *    attempts user, then organization, and can degrade gracefully when ALLOW_MISSING_PROJECT is set.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractStatus } from './shared/project-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DOC_PATH = path.join(ROOT, 'docs', 'roadmap.md')
const REPO_OWNER = 'piquet-h' // adjust if repo transferred
const PROJECT_OWNER = process.env.PROJECT_OWNER || REPO_OWNER
const PROJECT_NUMBER = Number(process.env.PROJECT_NUMBER || 3)
const PROJECT_OWNER_TYPE = process.env.PROJECT_OWNER_TYPE || '' // '', 'user', 'org'
const FIELD_NAME = 'Implementation order'

const mode = process.argv[2] || 'validate'
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
if (!token) {
    console.error('Missing GITHUB_TOKEN. Export it or run inside GitHub Actions.')
    process.exit(2)
}

const allowMissingProject = /^(1|true|yes)$/i.test(process.env.ALLOW_MISSING_PROJECT || '')

// JSON snapshot removed; all ordering derives from live Project field.

async function ghGraphQL(query, variables) {
    const resp = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github+json'
        },
        body: JSON.stringify({ query, variables })
    })
    const json = await resp.json()
    if (json.errors) {
        console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2))
        throw new Error('GraphQL query failed')
    }
    return json.data
}

async function fetchProjectItems() {
    // Try user then org (unless type constrained)
    const attempts = []
    // Try user (personal project) first, then organization, then viewer as a last resort.
    if (!PROJECT_OWNER_TYPE || PROJECT_OWNER_TYPE === 'user') attempts.push('user')
    if (!PROJECT_OWNER_TYPE || PROJECT_OWNER_TYPE === 'org' || PROJECT_OWNER_TYPE === 'organization') attempts.push('organization')
    if (!PROJECT_OWNER_TYPE) attempts.push('viewer')

    for (const kind of attempts) {
        let hasNext = true
        let after = null
        const nodes = []
        let projectId = null
        while (hasNext) {
            let data
            if (kind === 'viewer') {
                data = await ghGraphQL(
                    `query($number:Int!,$after:String){
                        viewer{
                            projectV2(number:$number){
                                id title
                                items(first:100, after:$after){
                                    nodes{
                                        id
                                        content{... on Issue { id number title state }}
                                        fieldValues(first:50){
                                            nodes{
                                                ... on ProjectV2ItemFieldNumberValue { field { ... on ProjectV2FieldCommon { id name } } number }
                                                ... on ProjectV2ItemFieldTextValue { field { ... on ProjectV2FieldCommon { id name } } text }
                                                ... on ProjectV2ItemFieldSingleSelectValue { field { ... on ProjectV2FieldCommon { id name } } name optionId }
                                            }
                                        }
                                    }
                                    pageInfo{hasNextPage endCursor}
                                }
                            }
                        }
                    }`,
                    { number: PROJECT_NUMBER, after }
                ).catch((err) => ({ viewer: null, _error: err }))
            } else {
                const queryOwnerField = kind // 'user' or 'organization'
                data = await ghGraphQL(
                    `query($owner:String!,$number:Int!,$after:String){
                        ${queryOwnerField}(login:$owner){
                            projectV2(number:$number){
                                id title
                                items(first:100, after:$after){
                                    nodes{
                                        id
                                        content{... on Issue { id number title state }}
                                        fieldValues(first:50){
                                            nodes{
                                                ... on ProjectV2ItemFieldNumberValue { field { ... on ProjectV2FieldCommon { id name } } number }
                                                ... on ProjectV2ItemFieldTextValue { field { ... on ProjectV2FieldCommon { id name } } text }
                                                ... on ProjectV2ItemFieldSingleSelectValue { field { ... on ProjectV2FieldCommon { id name } } name optionId }
                                            }
                                        }
                                    }
                                    pageInfo{hasNextPage endCursor}
                                }
                            }
                        }
                    }`,
                    { owner: PROJECT_OWNER, number: PROJECT_NUMBER, after }
                ).catch((err) => ({ [queryOwnerField]: null, _error: err }))
            }
            const project = data?.[kind]?.projectV2
            if (!project) break
            projectId = project.id
            const page = project.items
            nodes.push(...page.nodes)
            hasNext = page.pageInfo.hasNextPage
            after = page.pageInfo.endCursor
        }
        if (projectId) {
            return { projectId, nodes: nodes.filter((n) => n.content && n.content.number), ownerType: kind }
        }
    }
    return { projectId: null, nodes: [], ownerType: null }
}

function extractFieldId(nodes) {
    for (const n of nodes) {
        for (const fv of n.fieldValues.nodes) {
            if (fv.field?.name === FIELD_NAME) {
                return fv.field.id // first occurrence
            }
        }
    }
    return null
}

async function updateNumberField(projectId, itemId, fieldId, number) {
    await ghGraphQL(
        `mutation($p:ID!,$i:ID!,$f:ID!,$v:Float!){
    updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{number:$v}}){ projectV2Item { id } }
  }`,
        { p: projectId, i: itemId, f: fieldId, v: number }
    )
}

function hashOrdering(items) {
    const h = crypto.createHash('sha256')
    h.update(JSON.stringify(items.map((i) => ({ issue: i.issue, order: i.order }))))
    return h.digest('hex').slice(0, 12)
}

// extractStatus imported from shared/project-utils.mjs

// Escapes both backslash and pipe characters for markdown table cells
function escapeMarkdownTableCell(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
}

async function regenerateDocs(items, projectItems) {
    const lines = []
    lines.push('# Roadmap Implementation Order')
    lines.push('')
    lines.push(`Source of truth: Project field 'Implementation order'`)
    lines.push('')
    lines.push('| Order | Issue | Title | Milestone | Scope | Type | Status |')
    lines.push('| ----- | ----- | ----- | --------- | ----- | ---- | ------ |')
    // We'll need issue metadata; project items has title, but not labels/milestone. Fetch per issue lazily.
    const issueMetaCache = new Map()
    async function fetchIssue(num) {
        if (issueMetaCache.has(num)) return issueMetaCache.get(num)
        const data = await ghGraphQL(
            `query($owner:String!,$repo:String!,$num:Int!){
      repository(owner:$owner,name:$repo){ issue(number:$num){ number title milestone{ title } labels(first:20){ nodes{ name } } } }
    }`,
            { owner: REPO_OWNER, repo: 'the-shifting-atlas', num }
        )
        const issue = data.repository.issue
        issueMetaCache.set(num, issue)
        return issue
    }
    for (const item of [...items].sort((a, b) => a.order - b.order)) {
        let issue
        try {
            issue = await fetchIssue(item.issue)
        } catch {
            issue = { title: item.title || '(title unavailable)', milestone: null, labels: { nodes: [] } }
        }
        const labels = issue.labels.nodes.map((l) => l.name)
        const scope = labels.find((l) => l.startsWith('scope:')) || ''
        const type = labels.filter((l) => !l.startsWith('scope:'))[0] || ''
        const milestone = issue.milestone?.title || ''
        const projectItem = projectItems?.find?.((p) => p.content.number === item.issue)
        const status = projectItem ? extractStatus(projectItem.fieldValues) : ''
        lines.push(
            `| ${item.order} | #${item.issue} | ${escapeMarkdownTableCell(issue.title)} | ${milestone} | ${scope} | ${type} | ${status} |`
        )
    }
    lines.push('')
    // Next Up section (skip Done)
    const actionable = [...items]
        .sort((a, b) => a.order - b.order)
        .map((it) => ({
            order: it.order,
            issue: it.issue,
            status: extractStatus(projectItems.find((p) => p.content.number === it.issue)?.fieldValues || { nodes: [] }),
            title: it.title
        }))
        .filter((x) => x.status !== 'Done')
        .slice(0, 5)
    if (actionable.length) {
        lines.push('## Next Up')
        lines.push('')
        lines.push('| Order | Issue | Status | Title |')
        lines.push('| ----- | ----- | ------ | ----- |')
        for (const a of actionable) {
            lines.push(`| ${a.order} | #${a.issue} | ${a.status} | ${escapeMarkdownTableCell(a.title)} |`)
        }
        lines.push('')
    }
    lines.push(`Last sync: ${new Date().toISOString()}`)
    lines.push('')
    fs.writeFileSync(DOC_PATH, lines.join('\n'))
}

async function main() {
    const { projectId, nodes: projectNodes, ownerType } = await fetchProjectItems()
    if (!projectId) {
        const msg =
            `ProjectV2 not found for owner='${PROJECT_OWNER}' number=${PROJECT_NUMBER} (tried user/org).` +
            (allowMissingProject ? ' Continuing without project integration.' : ' Set ALLOW_MISSING_PROJECT=true to skip.')
        if (allowMissingProject) {
            console.warn(msg)
        } else {
            console.error(msg)
            process.exit(1)
        }
    } else {
        console.log(`Project located (type=${ownerType}) id=${projectId}`)
    }
    const fieldId = projectId ? extractFieldId(projectNodes) : null
    if (projectId && !fieldId) {
        console.error('Could not determine field id for Implementation order in project. Ensure the number field exists.')
        process.exit(3)
    }

    // Build maps
    // Build current ordering from project field
    const projectOrdering = []
    if (projectId) {
        for (const n of projectNodes) {
            let orderVal = null
            for (const fv of n.fieldValues.nodes) {
                if (fv.field?.name === FIELD_NAME) orderVal = fv.number ?? null
            }
            if (orderVal != null) projectOrdering.push({ issue: n.content.number, order: orderVal, title: n.content.title })
        }
    }
    // Validate we have contiguous integers
    projectOrdering.sort((a, b) => a.order - b.order)
    const contiguous = projectOrdering.every((it, idx) => it.order === idx + 1)
    if (mode === 'resequence' && projectId) {
        // Resequence in project
        if (!contiguous) {
            console.log('Resequencing project ordering to be contiguous...')
            let next = 1
            for (const entry of projectOrdering) {
                if (entry.order !== next) {
                    const node = projectNodes.find((p) => p.content.number === entry.issue)
                    await updateNumberField(projectId, node.id, extractFieldId(projectNodes), next)
                    entry.order = next
                }
                next++
            }
        } else {
            console.log('Ordering already contiguous.')
        }
    } else if (!contiguous) {
        console.warn('Non-contiguous implementation order detected in Project.')
    }

    // No file diff concept now

    if (mode === 'next') {
        const limit = Number(process.argv[3] || 3)
        const list = [...projectOrdering]
            .map((it) => {
                const node = projectNodes.find((p) => p.content.number === it.issue)
                return {
                    issue: it.issue,
                    order: it.order,
                    title: it.title,
                    status: node ? extractStatus(node.fieldValues) : '',
                    state: node?.content?.state || ''
                }
            })
            .filter((x) => x.status !== 'Done' && x.state !== 'CLOSED')
            .slice(0, limit)
        console.log(JSON.stringify(list, null, 2))
        return
    } else if (mode === 'validate') {
        if (!projectId) {
            console.error('Project not available; cannot validate.')
            process.exit(1)
        }
        if (!contiguous) {
            console.error('Non-contiguous ordering detected.')
            process.exit(2)
        }
        console.log('Project ordering contiguous and valid.')
    } else {
        if (!projectId) {
            console.error('Cannot apply without project.')
            process.exit(1)
        }
        await regenerateDocs(projectOrdering, projectNodes)
        console.log('Docs regenerated at docs/roadmap.md')
    }
    console.log('Ordering hash:', hashOrdering(projectOrdering))
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
