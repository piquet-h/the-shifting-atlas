#!/usr/bin/env node
/* eslint-env node */
/* global fetch, process, console */
/**
 * Sync Implementation Order between:
 *  - roadmap/implementation-order.json (source of truth edited by humans or tools)
 *  - GitHub Project (Projects v2) number (field "Implementation order") – optional / best-effort
 *  - docs/roadmap.md (generated summary for Copilot context & readers)
 *
 * Usage:
 *   node scripts/sync-implementation-order.mjs validate          # exits non-zero if drift (project optional)
 *   node scripts/sync-implementation-order.mjs apply             # apply updates to project + regen docs
 *   node scripts/sync-implementation-order.mjs resequence        # resequence orders 1..N in file then apply
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
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ROADMAP_JSON = path.join(ROOT, 'roadmap', 'implementation-order.json')
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

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
}
function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}

async function ghGraphQL(query, variables) {
    const resp = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github+json'
        },
        body: JSON.stringify({query, variables})
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
        if (!PROJECT_OWNER_TYPE || PROJECT_OWNER_TYPE === 'user') attempts.push('user')
        if (!PROJECT_OWNER_TYPE || PROJECT_OWNER_TYPE === 'org') attempts.push('org')

        for (const kind of attempts) {
                let hasNext = true
                let after = null
                const nodes = []
                let projectId = null
                while (hasNext) {
                        const data = await ghGraphQL(
                                `query($owner:String!,$number:Int!,$after:String){
                    ${kind}(login:$owner){
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
                                {owner: PROJECT_OWNER, number: PROJECT_NUMBER, after}
                        ).catch(() => {
                                // If NOT_FOUND error, break early to try next kind
                                return { [kind]: null }
                        })
                        const project = data?.[kind]?.projectV2
                        if (!project) break
                        projectId = project.id
                        const page = project.items
                        nodes.push(...page.nodes)
                        hasNext = page.pageInfo.hasNextPage
                        after = page.pageInfo.endCursor
                }
                if (projectId) {
                        return {projectId, nodes: nodes.filter((n) => n.content && n.content.number), ownerType: kind}
                }
        }
        return {projectId: null, nodes: [], ownerType: null}
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
        {p: projectId, i: itemId, f: fieldId, v: number}
    )
}

function hashOrdering(items) {
    const h = crypto.createHash('sha256')
    h.update(JSON.stringify(items.map((i) => ({issue: i.issue, order: i.order}))))
    return h.digest('hex').slice(0, 12)
}

function extractStatus(fieldValues) {
    for (const fv of fieldValues.nodes) {
        if (fv.field?.name === 'Status') {
            return fv.name || fv.text || fv.number || ''
        }
    }
    return ''
}

async function regenerateDocs(json, projectItems) {
    const lines = []
    lines.push('# Roadmap Implementation Order')
    lines.push('')
    lines.push(`Source of truth: \`roadmap/implementation-order.json\``)
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
            {owner: REPO_OWNER, repo: 'the-shifting-atlas', num}
        )
        const issue = data.repository.issue
        issueMetaCache.set(num, issue)
        return issue
    }
    for (const item of [...json.items].sort((a, b) => a.order - b.order)) {
        let issue
        try {
            issue = await fetchIssue(item.issue)
    } catch {
            issue = {title: item.title || '(title unavailable)', milestone: null, labels: {nodes: []}}
        }
        const labels = issue.labels.nodes.map((l) => l.name)
        const scope = labels.find((l) => l.startsWith('scope:')) || ''
        const type = labels.filter((l) => !l.startsWith('scope:'))[0] || ''
        const milestone = issue.milestone?.title || ''
        const projectItem = projectItems?.find?.((p) => p.content.number === item.issue)
        const status = projectItem ? extractStatus(projectItem.fieldValues) : ''
        lines.push(`| ${item.order} | #${item.issue} | ${issue.title.replace(/\|/g, '\\|')} | ${milestone} | ${scope} | ${type} | ${status} |`)
    }
    lines.push('')
    // Next Up section (skip Done)
    const actionable = [...json.items]
        .sort((a, b) => a.order - b.order)
        .map((it) => ({
            order: it.order,
            issue: it.issue,
            status: extractStatus(projectItems.find((p) => p.content.number === it.issue)?.fieldValues || {nodes: []}),
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
            lines.push(`| ${a.order} | #${a.issue} | ${a.status} | ${a.title.replace(/\|/g, '\\|')} |`)
        }
        lines.push('')
    }
    lines.push(`Last sync: ${new Date().toISOString()}`)
    lines.push('')
    fs.writeFileSync(DOC_PATH, lines.join('\n'))
}

async function main() {
    const json = readJson(ROADMAP_JSON)
    const {projectId, nodes: projectNodes, ownerType} = await fetchProjectItems()
    if (!projectId) {
        const msg = `ProjectV2 not found for owner='${PROJECT_OWNER}' number=${PROJECT_NUMBER} (tried user/org).` +
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
    const fieldId = projectId ? (extractFieldId(projectNodes) || json.fieldId || json.fieldID || null) : null
    if (projectId && !fieldId) {
        console.error('Could not determine field id for Implementation order in project. Ensure the number field exists.')
        process.exit(3)
    }

    // Build maps
    const fileMap = new Map(json.items.map((i) => [i.issue, i.order]))
    // Resequence if requested
    if (mode === 'resequence') {
        let i = 1
        for (const issue of [...fileMap.keys()].sort((a, b) => fileMap.get(a) - fileMap.get(b))) {
            fileMap.set(issue, i++)
        }
        json.items = [...fileMap.entries()].map(([issue, order]) => ({
            issue,
            order,
            title: json.items.find((it) => it.issue === issue)?.title || ''
        }))
        writeJson(ROADMAP_JSON, json)
    }

    // Detect missing issues present in project but not file (optionally append at end)
    let maxOrder = Math.max(0, ...fileMap.values())
    if (projectId) {
        for (const n of projectNodes) {
            const num = n.content.number
            if (!fileMap.has(num)) {
                maxOrder += 1
                fileMap.set(num, maxOrder)
                json.items.push({issue: num, order: maxOrder, title: n.content.title})
            }
        }
    }

    // Validate contiguous ordering
    const sortedOrders = [...fileMap.values()].sort((a, b) => a - b)
    const contiguous = sortedOrders.every((val, idx) => val === idx + 1)
    if (!contiguous && mode !== 'resequence') {
        console.warn('Non-contiguous implementation order detected. Use resequence to normalize.')
    }

    // Compare with project values
    const diffs = []
    if (projectId) {
        for (const n of projectNodes) {
            const num = n.content.number
            const desired = fileMap.get(num)
            let current = null
            for (const fv of n.fieldValues.nodes) {
                if (fv.field?.name === FIELD_NAME) {
                    current = fv.number ?? fv.text ?? null
                }
            }
            if (String(current) !== String(desired)) {
                diffs.push({num, from: current, to: desired, itemId: n.id})
            }
        }
    }

    if (mode === 'next') {
        const limit = Number(process.argv[3] || 3)
        // Build quick status map
        const list = [...json.items]
            .sort((a, b) => a.order - b.order)
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
        if (projectId) {
            if (diffs.length) {
                console.error(`Drift detected for ${diffs.length} item(s):`)
                for (const d of diffs) console.error(`#${d.num}: ${d.from} -> ${d.to}`)
                process.exit(1)
            } else {
                console.log('Implementation order in project matches file.')
            }
        } else {
            console.log('No project available; validation limited to JSON file only.')
        }
    } else {
        // apply / resequence
        if (projectId) {
            if (diffs.length) {
                console.log(`Applying ${diffs.length} update(s)...`)
                for (const d of diffs) {
                    await updateNumberField(projectId, d.itemId, fieldId, d.to)
                    console.log(`#${d.num} updated ${d.from} -> ${d.to}`)
                }
            } else {
                console.log('No updates needed for project field values.')
            }
        } else {
            console.log('Skipping project field updates (project unavailable).')
        }
        // Update file (ensure consistent ordering & timestamp)
        json.items.sort((a, b) => a.order - b.order)
        json.generated = new Date().toISOString()
        writeJson(ROADMAP_JSON, json)
        await regenerateDocs(json, projectId ? projectNodes : [])
        console.log('Docs regenerated at docs/roadmap.md')
    }

    console.log('Ordering hash:', hashOrdering(json.items))
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
