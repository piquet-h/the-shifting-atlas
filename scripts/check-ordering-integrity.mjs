#!/usr/bin/env node
/* eslint-env node */
/* global fetch, console, process */
/**
 * check-ordering-integrity.mjs
 *
 * Validates that implementation order has no gaps or duplicates.
 * Exits with non-zero status on violation.
 *
 * Usage:
 *   node scripts/check-ordering-integrity.mjs
 *   GITHUB_TOKEN=xxx node scripts/check-ordering-integrity.mjs --project 3
 *
 * Exit codes:
 *   0: No violations (contiguous ordering)
 *   1: Violations found (gaps or duplicates)
 *   2: Configuration error
 */

import { parseArgs } from 'node:util'
import { emitOrderingEvent } from './shared/build-telemetry.mjs'

const { values } = parseArgs({
    options: {
        'project-number': { type: 'string', default: '3' },
        owner: { type: 'string', default: 'piquet-h' },
        'owner-type': { type: 'string', default: '' }
    }
})

const PROJECT_NUMBER = Number(values['project-number'])
const PROJECT_OWNER = values.owner
const OWNER_TYPE_HINT = (values['owner-type'] || '').toLowerCase()
const FIELD_NAME = 'Implementation order'

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
        console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2))
        throw new Error('GraphQL query failed')
    }
    return json.data
}

async function fetchProjectItems() {
    const attempts = []
    const pushUnique = (v) => {
        if (!attempts.includes(v)) attempts.push(v)
    }
    if (OWNER_TYPE_HINT === 'org') pushUnique('organization')
    else if (OWNER_TYPE_HINT === 'user') pushUnique('user')
    else {
        pushUnique('user')
        pushUnique('organization')
    }
    pushUnique('viewer')

    const issueFields = `id number title state`
    const fieldValueFragments = `... on ProjectV2ItemFieldNumberValue { field { ... on ProjectV2FieldCommon { id name } } number }`

    for (const kind of attempts) {
        let hasNext = true
        let after = null
        const nodes = []
        let projectId = null

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
                break
            }
            const container = kind === 'viewer' ? data.viewer : data[kind === 'organization' ? 'organization' : 'user']
            if (!container || !container.projectV2) {
                break
            }
            projectId = container.projectV2.id
            const page = container.projectV2.items
            nodes.push(...page.nodes.filter((n) => n.content && n.content.number))
            hasNext = page.pageInfo.hasNextPage
            after = page.pageInfo.endCursor
        }
        if (projectId) {
            return { projectId, nodes }
        }
    }
    return { projectId: null, nodes: [] }
}

function getFieldNumber(n, name) {
    for (const fv of n.fieldValues.nodes) if (fv.field?.name === name) return fv.number ?? null
    return null
}

async function main() {
    const { projectId, nodes } = await fetchProjectItems()
    if (!projectId) {
        console.error('Project not found.')
        process.exit(2)
    }

    // Extract all ordering values
    const ordered = nodes
        .map((n) => ({ issue: n.content.number, order: getFieldNumber(n, FIELD_NAME) }))
        .filter((x) => typeof x.order === 'number')
        .sort((a, b) => a.order - b.order)

    if (ordered.length === 0) {
        console.log('No items with implementation order found.')
        emitOrderingEvent('integrity.snapshot', {
            totalIssues: 0,
            gaps: [],
            duplicates: [],
            isContiguous: true
        })
        return
    }

    // Check for duplicates
    const orderValues = ordered.map((o) => o.order)
    const uniqueOrders = new Set(orderValues)
    const duplicates = []
    if (uniqueOrders.size !== orderValues.length) {
        console.error('❌ VIOLATION: Duplicate order values detected')
        const dupValues = orderValues.filter((val, idx) => orderValues.indexOf(val) !== idx)
        duplicates.push(...new Set(dupValues))
        console.error(`   Duplicates: ${duplicates.join(', ')}`)
    }

    // Check for gaps (should be contiguous 1..N)
    const expectedSequence = Array.from({ length: ordered.length }, (_, i) => i + 1)
    const actualSequence = orderValues

    const gaps = []
    for (let i = 0; i < expectedSequence.length; i++) {
        if (actualSequence[i] !== expectedSequence[i]) {
            if (gaps.length === 0) {
                console.error('❌ VIOLATION: Non-contiguous ordering detected')
            }
            gaps.push(expectedSequence[i])
            console.error(`   Expected ${expectedSequence[i]}, found ${actualSequence[i]} (issue #${ordered[i].issue})`)
        }
    }

    const isContiguous = duplicates.length === 0 && gaps.length === 0

    // Emit integrity.snapshot event
    emitOrderingEvent('integrity.snapshot', {
        totalIssues: ordered.length,
        gaps,
        duplicates,
        isContiguous
    })

    if (!isContiguous) {
        process.exit(1)
    }

    console.log(`✅ Ordering integrity check passed: ${ordered.length} issues with contiguous order 1..${ordered.length}`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
