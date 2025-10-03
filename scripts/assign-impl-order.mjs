#!/usr/bin/env node
/* eslint-env node */
/* global fetch, console, process */
/**
 * assign-impl-order.mjs
 *
 * Directly assigns or recalculates the Project field 'Implementation order' for a target issue
 * using lightweight, fully Project-native heuristics (no local JSON snapshot).
 *
 * Heuristic approach:
 *  1. Fetch all Project items + their Implementation order numbers.
 *  2. Fetch target issue (labels, milestone, body) – add it to the Project if missing (apply mode only).
 *  3. Compute a priority score per issue (existing + target) from:
 *       - Scope label (scope:core > world > traversal > ai > security > mcp > systems > observability > devx)
 *       - Type label (feature, infra, security, enhancement, spike, refactor, docs/test)
 *       - Milestone precedence (M0 highest down to M9; non-matching = 0)
 *       - Dependency references (#123) — only boosts if referenced issues already have lower order (encourages grouping)
 *  4. Produce a new ordering: sort by (score desc, originalOrder asc, issueNumber asc) and assign contiguous 1..N.
 *  5. If target issue already ordered and its position unchanged, exit with no-op.
 *  6. In dry-run (default) print JSON diff only; in apply mode perform minimal mutations (only changed items).
 *
 * Usage:
 *   node scripts/assign-impl-order.mjs --issue 123                # dry-run recommendation
 *   node scripts/assign-impl-order.mjs --issue 123 --apply        # apply reordering (min changes)
 *   node scripts/assign-impl-order.mjs --issue 123 --strategy append   # force append only
 *   node scripts/assign-impl-order.mjs --issue 123 --artifact decision.json  # save decision artifact
 *
 * Options:
 *   --issue <number>          Required issue number.
 *   --apply                   Persist changes (requires GITHUB_TOKEN with project scope).
 *   --strategy <auto|append|scope-block>  Placement strategy override (default auto).
 *   --project-number <n>      Override project number (default 3).
 *   --owner <login>           Owner login (defaults to repo owner constant).
 *   --owner-type <user|org>   Hint for project owner type.
 *   --artifact <path>         Save ordering decision artifact to JSON file.
 *
 * Exit codes: 0 success / no-op; 1 fatal error; 2 configuration error.
 */

import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

// --- Configuration ---
const REPO_OWNER = 'piquet-h'
const REPO_NAME = 'the-shifting-atlas'
const FIELD_NAME = 'Implementation order'
// const STATUS_FIELD = 'Status' // reserved for future status-aware heuristics

const { values } = parseArgs({
    options: {
        issue: { type: 'string' },
        apply: { type: 'boolean', default: false },
        strategy: { type: 'string', default: 'auto' },
        'project-number': { type: 'string', default: '3' },
        owner: { type: 'string', default: REPO_OWNER },
        'owner-type': { type: 'string', default: '' },
        artifact: { type: 'string', default: '' }
    }
})

if (!values.issue) {
    console.error('Missing --issue <number>')
    process.exit(2)
}
const ISSUE_NUMBER = Number(values.issue)
const APPLY = !!values.apply
const STRATEGY = values.strategy
const PROJECT_NUMBER = Number(values['project-number'])
const PROJECT_OWNER = values.owner
const OWNER_TYPE_HINT = (values['owner-type'] || '').toLowerCase()
const ARTIFACT_PATH = values.artifact || ''

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
if (!token) {
    console.error('Missing GITHUB_TOKEN / GH_TOKEN environment variable.')
    process.exit(2)
}

async function gh(query, variables) {
    const resp = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
        body: JSON.stringify({ query, variables })
    })
    const json = await resp.json()
    if (json.errors) {
        const forbidden = json.errors.find((e) => /access|resource/i.test(e.message))
        if (forbidden) {
            console.error(
                'GraphQL access error. This usually means the token lacks project access (need repository-projects:write or fine-grained PAT with project permissions). Original errors:',
                JSON.stringify(json.errors, null, 2)
            )
        } else {
            console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2))
        }
        throw new Error('GraphQL query failed')
    }
    return json.data
}

async function fetchProjectItems() {
    // Attempt order: explicit hint first, then other owner type, finally viewer fallback.
    const attempts = []
    const pushUnique = (v) => {
        if (!attempts.includes(v)) attempts.push(v)
    }
    if (OWNER_TYPE_HINT === 'org') pushUnique('organization')
    else if (OWNER_TYPE_HINT === 'user') pushUnique('user')
    else {
        // no hint – try user first (most common for personal repos)
        pushUnique('user')
        pushUnique('organization')
    }
    pushUnique('viewer')

    const collectedErrors = []

    // Reusable fragment (kept inline to avoid fragment name collisions across queries)
    const issueFields = `id number title state createdAt closedAt body labels(first:50){nodes{name}} milestone{title}`
    const fieldValueFragments = `... on ProjectV2ItemFieldNumberValue { field { ... on ProjectV2FieldCommon { id name } } number } \n            ... on ProjectV2ItemFieldSingleSelectValue { field { ... on ProjectV2FieldCommon { id name } } name optionId }`

    for (const kind of attempts) {
        let hasNext = true
        let after = null
        const nodes = []
        let projectId = null

        // Build static (multi‑line) query text; avoid dynamic root interpolation mistakes.
        const buildQuery = () => {
            if (kind === 'viewer') {
                return `query($number:Int!,$after:String){\n  viewer {\n    projectV2(number:$number){\n      id title\n      items(first:100, after:$after){\n        nodes{\n          id\n          content{... on Issue { ${issueFields} }}\n          fieldValues(first:50){nodes{${fieldValueFragments}}}\n        }\n        pageInfo{hasNextPage endCursor}\n      }\n    }\n  }\n}`
            }
            const root = kind === 'organization' ? 'organization' : 'user'
            return `query($owner:String!,$number:Int!,$after:String){\n  ${root}(login:$owner){\n    projectV2(number:$number){\n      id title\n      items(first:100, after:$after){\n        nodes{\n          id\n          content{... on Issue { ${issueFields} }}\n          fieldValues(first:50){nodes{${fieldValueFragments}}}\n        }\n        pageInfo{hasNextPage endCursor}\n      }\n    }\n  }\n}`
        }

        const queryText = buildQuery()

        while (hasNext) {
            const vars = kind === 'viewer' ? { number: PROJECT_NUMBER, after } : { owner: PROJECT_OWNER, number: PROJECT_NUMBER, after }
            let data
            try {
                data = await gh(queryText, vars)
            } catch (e) {
                collectedErrors.push({ attempt: kind, page: nodes.length / 100 + 1, message: e.message })
                break // move to next attempt
            }
            const container = kind === 'viewer' ? data.viewer : data[kind === 'organization' ? 'organization' : 'user']
            if (!container || !container.projectV2) {
                // No project under this root; stop trying pages for this kind.
                break
            }
            projectId = container.projectV2.id
            const page = container.projectV2.items
            nodes.push(...page.nodes.filter((n) => n.content && n.content.number))
            hasNext = page.pageInfo.hasNextPage
            after = page.pageInfo.endCursor
        }
        if (projectId) {
            if (collectedErrors.length) {
                console.warn(
                    'fetchProjectItems(): previous attempts produced errors before success:',
                    JSON.stringify(collectedErrors, null, 2)
                )
            }
            return { projectId, nodes }
        }
    }
    if (collectedErrors.length) {
        console.error('fetchProjectItems(): all attempts failed. Errors summary:', JSON.stringify(collectedErrors, null, 2))
    }
    return { projectId: null, nodes: [] }
}

async function fetchProjectFields(projectId) {
    const data = await gh(
        `query($id:ID!){node(id:$id){... on ProjectV2 {fields(first:100){nodes{__typename ... on ProjectV2FieldCommon { id name dataType }}}}}}`,
        { id: projectId }
    )
    const nodes = data.node?.fields?.nodes || []
    return nodes.filter((f) => f.id && f.name)
}

async function fetchIssue(number) {
    const data = await gh(
        `query($owner:String!,$repo:String!,$num:Int!){repository(owner:$owner,name:$repo){issue(number:$num){id number title state body milestone{title} labels(first:50){nodes{name}}}}}`,
        { owner: PROJECT_OWNER, repo: REPO_NAME, num: number }
    )
    return data.repository.issue
}

async function addIssueToProject(projectId, contentId) {
    const data = await gh(`mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}`, {
        p: projectId,
        c: contentId
    })
    return data.addProjectV2ItemById.item.id
}

async function updateNumberField(projectId, itemId, fieldId, number) {
    await gh(
        `mutation($p:ID!,$i:ID!,$f:ID!,$v:Float!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{number:$v}}){projectV2Item{id}}}`,
        { p: projectId, i: itemId, f: fieldId, v: number }
    )
}

function extractFieldId(nodes, name) {
    for (const n of nodes) for (const fv of n.fieldValues.nodes) if (fv.field?.name === name) return fv.field.id
    return null
}

function getFieldNumber(n, name) {
    for (const fv of n.fieldValues.nodes) if (fv.field?.name === name) return fv.number ?? null
    return null
}

function labelSet(issue) {
    return new Set(issue.labels?.nodes?.map((l) => l.name) || [])
}

const SCOPE_PRIORITY = [
    'scope:core',
    'scope:world',
    'scope:traversal',
    'scope:ai',
    'scope:security',
    'scope:mcp',
    'scope:systems',
    'scope:observability',
    'scope:devx'
]
const SCOPE_WEIGHT = Object.fromEntries(SCOPE_PRIORITY.map((s, i) => [s, 100 - i * 8]))
const TYPE_WEIGHT = {
    feature: 50,
    infra: 40,
    security: 45,
    enhancement: 30,
    spike: 25,
    refactor: 20,
    docs: 10,
    documentation: 10,
    test: 10
}

function milestoneWeight(title) {
    if (!title) return 0
    const m = title.match(/^M(\d+)/i)
    if (!m) return 0
    const num = Number(m[1])
    return 120 - num * 10 // M0=120, M1=110, ...
}

// function dependencyRefs(body) { /* reserved for future enhancement */ return [] }

function computeScore(issue) {
    const labels = labelSet(issue)
    const scope = SCOPE_PRIORITY.find((s) => labels.has(s))
    const type = [...labels].find((l) => TYPE_WEIGHT[l.replace(/^type:/, '')] || TYPE_WEIGHT[l]) || ''
    let score = 0
    if (scope) score += SCOPE_WEIGHT[scope]
    const typeKey = type.replace(/^type:/, '')
    if (TYPE_WEIGHT[typeKey]) score += TYPE_WEIGHT[typeKey]
    score += milestoneWeight(issue.milestone?.title)
    // Light boost for short bodies (foundation tasks) vs long (feature narratives) skipped: keep simple.
    return score
}

/**
 * Calculate confidence level for ordering decision
 * Returns: 'high' | 'medium' | 'low'
 *
 * High confidence: Issue has scope label + milestone + type
 * Medium confidence: Issue has scope label + (milestone OR type)
 * Low confidence: Issue missing scope or both milestone and type
 */
function calculateConfidence(issue) {
    const labels = labelSet(issue)
    const hasScope = SCOPE_PRIORITY.some((s) => labels.has(s))
    const hasType = [...labels].some((l) => TYPE_WEIGHT[l.replace(/^type:/, '')] || TYPE_WEIGHT[l])
    const hasMilestone = !!issue.milestone?.title

    if (hasScope && hasMilestone && hasType) {
        return 'high'
    } else if (hasScope && (hasMilestone || hasType)) {
        return 'medium'
    } else {
        return 'low'
    }
}

function applyStrategy(existingOrdered, target, strategy) {
    if (strategy === 'append') {
        return existingOrdered.length + 1
    }
    if (strategy === 'scope-block') {
        const labels = labelSet(target)
        const scope = SCOPE_PRIORITY.find((s) => labels.has(s))
        if (scope) {
            const reversed = [...existingOrdered].reverse()
            const lastSame = reversed.find((o) => labelSet(o.issue).has(scope))
            if (lastSame) return lastSame.desiredOrder + 1
        }
        return existingOrdered.length + 1
    }
    // auto: full recompute based on scores
    return null // signal recompute
}

async function main() {
    const { projectId, nodes } = await fetchProjectItems()
    if (!projectId) {
        console.error('Project not found.')
        process.exit(1)
    }
    let fieldId = extractFieldId(nodes, FIELD_NAME)
    if (!fieldId) {
        // Fallback: query project fields directly (handles case where no existing item has a value yet)
        try {
            const fields = await fetchProjectFields(projectId)
            const match = fields.find((f) => f.name === FIELD_NAME)
            if (match) fieldId = match.id
        } catch (e) {
            console.error('Failed to fetch project fields for fallback:', e.message)
        }
        if (!fieldId) {
            console.error(
                `Field '${FIELD_NAME}' not found in project (after fallback). Ensure the custom number field exists and the token has access.`
            )
            process.exit(1)
        }
    }

    // Locate target issue in current items
    let targetNode = nodes.find((n) => n.content.number === ISSUE_NUMBER)
    let targetIssue = targetNode?.content
    if (!targetIssue) {
        // fetch directly
        targetIssue = await fetchIssue(ISSUE_NUMBER)
        if (!targetIssue) {
            console.error(`Issue #${ISSUE_NUMBER} not found in repo.`)
            process.exit(1)
        }
    }

    // Build ordered list
    const currentOrdered = nodes
        .map((n) => ({ node: n, order: getFieldNumber(n, FIELD_NAME), issue: n.content }))
        .filter((x) => typeof x.order === 'number')
        .sort((a, b) => a.order - b.order)

    const strategyPos = applyStrategy(
        currentOrdered.map((o) => ({ ...o, desiredOrder: o.order })),
        targetIssue,
        STRATEGY
    )
    let finalPlan

    if (strategyPos != null) {
        // Keep existing orders, insert target at strategyPos shifting >= positions
        const plan = []
        let inserted = false
        for (const item of currentOrdered) {
            if (!inserted && item.order >= strategyPos) {
                plan.push({ issue: ISSUE_NUMBER, score: computeScore(targetIssue), desiredOrder: strategyPos })
                inserted = true
            }
            plan.push({
                issue: item.issue.number,
                score: computeScore(item.issue),
                desiredOrder: item.order + (inserted ? 1 : 0),
                node: item.node
            })
        }
        if (!inserted) plan.push({ issue: ISSUE_NUMBER, score: computeScore(targetIssue), desiredOrder: strategyPos, node: targetNode })
        finalPlan = plan
    } else {
        // Recompute: include target (as if new or updating). If target already present, allow repositioning.
        const merged = [...currentOrdered]
        if (!merged.find((m) => m.issue.number === ISSUE_NUMBER)) {
            merged.push({ node: targetNode, order: null, issue: targetIssue })
        }
        const scored = merged.map((m) => ({ issue: m.issue, node: m.node, score: computeScore(m.issue), original: m.order }))
        scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score
            if (a.original != null && b.original != null && a.original !== b.original) return a.original - b.original
            return a.issue.number - b.issue.number
        })
        finalPlan = scored.map((s, idx) => ({ issue: s.issue.number, score: s.score, desiredOrder: idx + 1, node: s.node }))
    }

    // Determine needed updates
    const desiredMap = new Map(finalPlan.map((p) => [p.issue, p.desiredOrder]))
    const diffs = []
    for (const item of nodes) {
        const current = getFieldNumber(item, FIELD_NAME)
        if (current == null) continue
        const desired = desiredMap.get(item.content.number)
        if (desired != null && desired !== current) diffs.push({ issue: item.content.number, from: current, to: desired, itemId: item.id })
    }
    // If target missing and strategy not recompute append pos or recompute: we will set its value
    if (!nodes.find((n) => n.content.number === ISSUE_NUMBER)) {
        diffs.push({ issue: ISSUE_NUMBER, from: null, to: desiredMap.get(ISSUE_NUMBER), itemId: null })
    } else if (targetNode) {
        const cur = getFieldNumber(targetNode, FIELD_NAME)
        const desired = desiredMap.get(ISSUE_NUMBER)
        if (desired !== cur && !diffs.find((d) => d.issue === ISSUE_NUMBER)) {
            diffs.push({ issue: ISSUE_NUMBER, from: cur, to: desired, itemId: targetNode.id })
        }
    }

    // Output summary with confidence and rationale
    const confidence = calculateConfidence(targetIssue)
    const labels = labelSet(targetIssue)
    const scope = SCOPE_PRIORITY.find((s) => labels.has(s)) || 'none'
    const type = [...labels].find((l) => TYPE_WEIGHT[l.replace(/^type:/, '')] || TYPE_WEIGHT[l]) || 'none'
    const milestone = targetIssue.milestone?.title || 'none'

    const rationale = `Issue #${ISSUE_NUMBER}: scope=${scope}, type=${type}, milestone=${milestone}, score=${computeScore(targetIssue)}. Strategy: ${STRATEGY}. Changes required: ${diffs.length}.`

    const result = {
        strategy: STRATEGY,
        issue: ISSUE_NUMBER,
        recommendedOrder: desiredMap.get(ISSUE_NUMBER),
        changes: diffs.length,
        confidence,
        score: computeScore(targetIssue),
        rationale,
        diff: diffs.sort((a, b) => a.to - b.to),
        plan: finalPlan.sort((a, b) => a.desiredOrder - b.desiredOrder),
        metadata: {
            scope,
            type,
            milestone,
            timestamp: new Date().toISOString()
        }
    }

    // Save artifact if requested
    if (ARTIFACT_PATH) {
        try {
            writeFileSync(ARTIFACT_PATH, JSON.stringify(result, null, 2))
            console.error(`Artifact saved to ${ARTIFACT_PATH}`)
        } catch (err) {
            console.error(`Failed to save artifact: ${err.message}`)
        }
    }

    if (!APPLY) {
        console.log(JSON.stringify(result, null, 2))
        return
    }

    if (!diffs.length) {
        console.log(JSON.stringify({ ...result, applied: false, reason: 'no-op' }, null, 2))
        return
    }

    // Ensure target in project if needed
    if (!targetNode) {
        const fresh = await fetchIssue(ISSUE_NUMBER) // fetch ensures we have id
        const newItemId = await addIssueToProject(projectId, fresh.id)
        targetNode = { id: newItemId, content: fresh, fieldValues: { nodes: [] } }
    }

    // Perform updates
    for (const d of diffs) {
        if (d.itemId === null) {
            // newly added target; refresh to find its itemId (simple refetch all items once)
            if (d.issue === ISSUE_NUMBER) {
                const refreshed = await fetchProjectItems()
                const newNode = refreshed.nodes.find((n) => n.content.number === ISSUE_NUMBER)
                if (!newNode) throw new Error('Failed to locate newly added project item for target issue.')
                await updateNumberField(refreshed.projectId, newNode.id, fieldId, d.to)
                d.itemId = newNode.id
            }
        } else {
            await updateNumberField(projectId, d.itemId, fieldId, d.to)
        }
    }
    console.log(JSON.stringify({ ...result, applied: true }, null, 2))
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
