#!/usr/bin/env node
/* eslint-env node */
/* global fetch, process, console */
/**
 * export-implementation-order-snapshot.mjs
 *
 * Exports the canonical implementation ordering from the Project v2 numeric field
 * `Implementation order` into the legacy snapshot JSON file `roadmap/implementation-order.json`.
 *
 * The resulting file is READ-ONLY and should not be hand edited. It exists solely for:
 *  - Backward compatibility with older tools/tests
 *  - Offline / local context grepping
 *  - Human diff review when adjusting ordering in the Project UI
 *
 * Usage:
 *   npm run export:impl-order:snapshot
 *
 * Env:
 *   GITHUB_TOKEN / GH_TOKEN   (required)
 *   PROJECT_OWNER              (defaults repo owner hint or explicit)
 *   PROJECT_NUMBER             (defaults 3)
 *   PROJECT_OWNER_TYPE         ('user' | 'org' | '') optional hint
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SNAPSHOT = path.join(ROOT, 'roadmap', 'implementation-order.json')
const REPO_OWNER = 'piquet-h' // update if repository transferred
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
if (!TOKEN) {
  console.error('Missing GITHUB_TOKEN / GH_TOKEN')
  process.exit(2)
}
const PROJECT_OWNER = process.env.PROJECT_OWNER || REPO_OWNER
const PROJECT_NUMBER = Number(process.env.PROJECT_NUMBER || 3)
const OWNER_TYPE_HINT = (process.env.PROJECT_OWNER_TYPE || '').toLowerCase()
const FIELD_NAME = 'Implementation order'

async function gh(query, variables) {
  const resp = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
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
  const order = OWNER_TYPE_HINT === 'org' ? ['organization', 'user', 'viewer'] : OWNER_TYPE_HINT === 'user' ? ['user', 'organization', 'viewer'] : ['user', 'organization', 'viewer']
  for (const kind of order) {
    let hasNext = true
    let after = null
    const nodes = []
    let projectId = null
    while (hasNext) {
      let query
      let vars
      if (kind === 'viewer') {
        query = `query($number:Int!,$after:String){viewer{projectV2(number:$number){id title items(first:100, after:$after){nodes{id content{... on Issue { id number title state }} fieldValues(first:50){nodes{... on ProjectV2ItemFieldNumberValue { field { ... on ProjectV2FieldCommon { id name } } number }}}} pageInfo{hasNextPage endCursor}}}}`
        vars = { number: PROJECT_NUMBER, after }
      } else {
        query = `query($owner:String!,$number:Int!,$after:String){${kind}(login:$owner){projectV2(number:$number){id title items(first:100, after:$after){nodes{id content{... on Issue { id number title state }} fieldValues(first:50){nodes{... on ProjectV2ItemFieldNumberValue { field { ... on ProjectV2FieldCommon { id name } } number }}}} pageInfo{hasNextPage endCursor}}}}`
        vars = { owner: PROJECT_OWNER, number: PROJECT_NUMBER, after }
      }
      let data
      try {
        data = await gh(query, vars)
      } catch {
        break
      }
      const container = kind === 'viewer' ? data.viewer : data[kind]
      if (!container || !container.projectV2) break
      projectId = container.projectV2.id
      const page = container.projectV2.items
      nodes.push(...page.nodes.filter((n) => n.content && n.content.number))
      hasNext = page.pageInfo.hasNextPage
      after = page.pageInfo.endCursor
    }
    if (projectId) return { projectId, nodes }
  }
  return { projectId: null, nodes: [] }
}

function extractFieldId(nodes) {
  for (const n of nodes) {
    for (const fv of n.fieldValues.nodes) {
      if (fv.field?.name === FIELD_NAME) return fv.field.id
    }
  }
  return null
}

async function main() {
  const { projectId, nodes } = await fetchProjectItems()
  if (!projectId) {
    console.error('Project not found; cannot export ordering snapshot.')
    process.exit(1)
  }
  const fieldId = extractFieldId(nodes)
  if (!fieldId) {
    console.error(`Field '${FIELD_NAME}' not found; create numeric field in project.`)
    process.exit(3)
  }
  const ordering = []
  for (const n of nodes) {
    let orderVal = null
    for (const fv of n.fieldValues.nodes) {
      if (fv.field?.name === FIELD_NAME) {
        orderVal = fv.number ?? null
        break
      }
    }
    if (orderVal == null) continue // ignore items without an order yet
    ordering.push({ issue: n.content.number, order: orderVal, title: n.content.title })
  }
  ordering.sort((a, b) => a.order - b.order)
  // Build contiguous assertion (warn if gaps)
  const gaps = ordering.some((o, i) => o.order !== i + 1)
  if (gaps) {
    console.warn('Warning: Non-contiguous order values in project; snapshot will preserve as-is.')
  }
  const snapshot = {
    project: PROJECT_NUMBER,
    fieldId,
    generated: new Date().toISOString(),
    items: ordering
  }
  fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true })
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n')
  console.log(`Exported ${ordering.length} ordered issue(s) to ${SNAPSHOT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
