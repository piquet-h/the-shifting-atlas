#!/usr/bin/env node
/* eslint-env node */
// DEPRECATED: ensure-all-issues-in-order.mjs retired.
console.error('ensure-all-issues-in-order.mjs deprecated – no action performed.')
process.exit(0)
/**
 * ensure-all-issues-in-order.mjs
 *
 * Debounced batch finalizer: guarantees every open issue (excluding PRs) appears in
 * roadmap/implementation-order.json after a burst of issue events.
 *
 * Strategy:
 *  - Fetch current implementation-order.json (create baseline if absent)
 *  - List all open issues via REST (paginate)
 *  - Append any missing issues at the end (order = max+1 ..)
 *  - Normalize (resequences contiguous 1..N)
 *  - Update titles for existing entries if changed
 *  - Write file ONLY if changes occurred
 *
 * This script deliberately does NOT remove closed issues (historical ordering is useful);
 * closed issues remain but new open issues still get appended.
 */

console.error('[deprecated] ensure-all-issues-in-order.mjs retired (local ordering file removed).')
process.exit(0)
// Legacy code retained below (inactive)
import console from 'node:console'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
/* global fetch */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ROADMAP_JSON = path.join(ROOT, 'roadmap', 'implementation-order.json')
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
const repo = process.env.GITHUB_REPOSITORY
if (!repo) {
    console.error('Missing GITHUB_REPOSITORY in env')
    process.exit(2)
}
if (!token) {
    console.error('Missing GITHUB_TOKEN / GH_TOKEN in env')
    process.exit(2)
}

function loadOrdering() {
    if (!fs.existsSync(ROADMAP_JSON)) {
        return {
            project: 3,
            fieldId: 'PVTF_lAHOANLlqs4BEJKizg13FDI',
            generated: new Date().toISOString(),
            items: []
        }
    }
    return JSON.parse(fs.readFileSync(ROADMAP_JSON, 'utf8'))
}

async function fetchOpenIssues() {
    const results = []
    const base = `https://api.github.com/repos/${repo}/issues`
    const perPage = 100
    for (let page = 1; page < 20; page++) {
        // hard cap 1900 issues
        const url = `${base}?state=open&per_page=${perPage}&page=${page}`
        const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
        })
        if (!resp.ok) throw new Error(`Failed to fetch issues page ${page}: ${resp.status}`)
        const data = await resp.json()
        // Stop if empty
        if (!data.length) break
        for (const issue of data) {
            if (issue.pull_request) continue // skip PRs
            results.push({ number: issue.number, title: issue.title })
        }
        if (data.length < perPage) break
    }
    return results
}

function resequence(items) {
    items.sort((a, b) => a.order - b.order)
    items.forEach((it, idx) => {
        it.order = idx + 1
    })
    return items
}

async function main() {
    const ordering = loadOrdering()
    const openIssues = await fetchOpenIssues()
    const existingMap = new Map(ordering.items.map((i) => [i.issue, i]))
    let maxOrder = ordering.items.length ? Math.max(...ordering.items.map((i) => i.order)) : 0
    let added = 0
    let titleUpdates = 0

    for (const issue of openIssues) {
        if (!existingMap.has(issue.number)) {
            maxOrder += 1
            const entry = { issue: issue.number, order: maxOrder, title: issue.title }
            ordering.items.push(entry)
            existingMap.set(issue.number, entry)
            added++
        } else {
            const entry = existingMap.get(issue.number)
            if (entry.title !== issue.title) {
                entry.title = issue.title
                titleUpdates++
            }
        }
    }

    // Normalize contiguous ordering (important if manual edits introduced holes)
    resequence(ordering.items)

    if (added || titleUpdates) {
        ordering.generated = new Date().toISOString()
        fs.writeFileSync(ROADMAP_JSON, JSON.stringify(ordering, null, 2) + '\n')
        console.log(`Batch finalize: added ${added} issue(s), updated ${titleUpdates} title(s).`)
        process.exitCode = 0
    } else {
        console.log('Batch finalize: no changes needed.')
    }
}

main &&
    main().catch((err) => {
        console.error(err)
        process.exit(1)
    })
// end legacy
