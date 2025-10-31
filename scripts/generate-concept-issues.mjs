#!/usr/bin/env node
/**
 * Concept Change Issue Generator
 *
 * Detects changes in concept facet docs and (optionally) creates atomic GitHub issues.
 * Default mode: dry-run (prints proposed issues).
 * Creation mode: set env CREATE_CONCEPT_ISSUES=true and provide GITHUB_TOKEN & GITHUB_REPO.
 *
 * Environment Variables:
 *   GITHUB_REPO=owner/repo
 *   GITHUB_TOKEN=ghp_xxx (required only for creation)
 *   BASE_REF=main (override diff base)
 *   CREATE_CONCEPT_ISSUES=true (to actually create issues)
 *
 * Exit codes:
 *   0 – success (even if no changes)
 *   10 – configuration error
 *   11 – runtime error
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

let Octokit = null
try {
    Octokit = (await import('@octokit/core')).Octokit
} catch {
    /* dry-run without dependency */
}

const conceptDir = 'docs/concept'
const visionFile = 'docs/vision-and-tenets.md'
const baseRef = process.env.BASE_REF || 'main'
const repoFull = process.env.GITHUB_REPO
const token = process.env.GITHUB_TOKEN
const createMode = process.env.CREATE_CONCEPT_ISSUES === 'true'

// Regex heuristics
const LEAK_RE = /\b(implement|sequence|sprint|dependency|milestone|backlog|story\s*points?)\b/i
const TENET_LINE_RE =
    /^\|?\s*Prefer|^\|?\s*Determinism|^\|?\s*Immutable|^\|?\s*Centralized|^\|?\s*Advisory|^\|?\s*Idempotent|^\|?\s*Separation|^\|?\s*Feature flags|^\|?\s*Player clarity|^\|?\s*Extensibility/i // seed known tenets
const INVARIANT_RE = /^[-*]\s+/
const HEADING_RE = /^#{2,}\s+/

function run(cmd) {
    return execSync(cmd, { encoding: 'utf8' })
}

function gitDiff(file) {
    try {
        return run(`git diff ${baseRef} -- ${file}`)
    } catch {
        return ''
    }
}

function listConceptFiles() {
    const files = fs
        .readdirSync(conceptDir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => path.join(conceptDir, f))
    if (fs.existsSync(visionFile)) files.push(visionFile)
    return files
}

function parseEvents(diff, file) {
    const events = []
    if (!diff.trim()) return events
    const lines = diff.split('\n')
    for (const line of lines) {
        if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue
        if (line.startsWith('+')) {
            const content = line.slice(1).trim()
            if (INVARIANT_RE.test(content)) {
                events.push({ type: 'InvariantAdded', content, file })
            } else if (HEADING_RE.test(content)) {
                events.push({ type: 'SystemScopeExpanded', content, file })
            } else if (LEAK_RE.test(content)) {
                events.push({ type: 'CrossFacetLeak', content, file })
            } else if (file === visionFile && TENET_LINE_RE.test(content)) {
                events.push({ type: 'TenetAddedOrModified', content, file })
            }
        } else if (line.startsWith('-')) {
            const content = line.slice(1).trim()
            if (INVARIANT_RE.test(content)) {
                events.push({ type: 'InvariantRemoved', content, file })
            } else if (LEAK_RE.test(content)) {
                // Removal of leak line is not an event (cleanup), unless needed for audit.
            }
        }
    }
    return events
}

function classify(events) {
    return events.map((e) => {
        if (e.type === 'SystemScopeExpanded' && /Dungeon|Hydrology|Faction|Economy|Traversal|Layering/i.test(e.content)) {
            return { ...e, domainHint: 'world' }
        }
        return e
    })
}

function determineScopeLabel(e) {
    if (/direction|traversal|exit/i.test(e.content)) return 'scope:traversal'
    if (/dungeon|room|hydrology|faction|economy|reputation/i.test(e.content)) return 'scope:world'
    if (e.file === visionFile || /tenet/i.test(e.type)) return 'scope:core'
    if (/humor|narration|persona/i.test(e.content)) return 'scope:world'
    return 'scope:core'
}

function determineTypeLabel(e) {
    switch (e.type) {
        case 'InvariantAdded':
        case 'SystemScopeExpanded':
            return 'feature'
        case 'InvariantRemoved':
            return 'refactor'
        case 'CrossFacetLeak':
            return 'refactor'
        case 'TenetAddedOrModified':
            return 'docs'
        default:
            return 'enhancement'
    }
}

function determineRisk(e) {
    if (e.type === 'CrossFacetLeak') return 'BUILD-SCRIPT'
    if (e.type === 'InvariantAdded' || e.type === 'SystemScopeExpanded') return 'RUNTIME-BEHAVIOR'
    return 'LOW'
}

function summarize(e) {
    const base = `[Concept] ${e.type}: ${e.content.replace(/[`]/g, '').slice(0, 60)}`
    return base
}

function buildIssue(e) {
    const title = summarize(e)
    return {
        title,
        body: `Summary: ${title}\nGoal: Stabilize concept change (${e.type}) without planning leakage\nAcceptance Criteria:\n- [ ] ${e.type} reflected in ${e.file} with stable wording\n- [ ] Leak scan passes (no execution verbs)\n- [ ] Architecture cross-reference updated if required\nEdge Cases:\n- Conflicts existing invariant\n- Introduces unmodeled dependency\nRisk: ${determineRisk(e)}\nOut of Scope: Sequencing, telemetry enumeration\nReferences: ${e.file}`,
        labels: [determineScopeLabel(e), determineTypeLabel(e)]
    }
}

function isDuplicate(candidate, existing) {
    const norm = (s) => s.toLowerCase()
    return existing.some((i) => {
        const a = norm(i.title).split(/\s+/)
        const b = norm(candidate.title).split(/\s+/)
        const overlap = b.filter((w) => a.includes(w)).length
        return overlap / b.length > 0.6 // heuristic
    })
}

async function fetchOpenIssues(octokit, owner, repoName) {
    const issues = []
    let page = 1
    while (true) {
        const res = await octokit.request('GET /repos/{owner}/{repo}/issues', {
            owner,
            repo: repoName,
            per_page: 50,
            page
        })
        if (res.data.length === 0) break
        issues.push(...res.data.filter((i) => !i.pull_request))
        page++
    }
    return issues
}

async function createIssues(octokit, owner, repoName, issues) {
    const created = []
    for (const issue of issues) {
        const res = await octokit.request('POST /repos/{owner}/{repo}/issues', {
            owner,
            repo: repoName,
            title: issue.title,
            body: issue.body,
            labels: issue.labels
        })
        created.push(res.data.number)
    }
    return created
}

function printDraft(issues) {
    console.log('--- Concept Change Issue Draft ---')
    for (const i of issues) {
        console.log(`\n# ${i.title}\nLabels: ${i.labels.join(', ')}\n${i.body}\n`)
    }
    console.log('\nTotal proposed:', issues.length)
}

async function main() {
    const files = listConceptFiles()
    const allEvents = []
    for (const f of files) {
        const diff = gitDiff(f)
        const parsed = parseEvents(diff, f)
        const classified = classify(parsed)
        allEvents.push(...classified)
    }

    if (allEvents.length === 0) {
        console.log('No concept changes detected.')
        return
    }

    const candidates = allEvents.map(buildIssue)

    if (!createMode) {
        printDraft(candidates)
        return
    }

    if (!repoFull || !token) {
        console.error('Missing GITHUB_REPO or GITHUB_TOKEN for creation mode.')
        process.exit(10)
    }
    if (!Octokit) {
        console.error('Missing @octokit/core dependency.')
        process.exit(10)
    }
    const [owner, repoName] = repoFull.split('/')
    const octokit = new Octokit({ auth: token })
    const existing = await fetchOpenIssues(octokit, owner, repoName)
    const filtered = candidates.filter((c) => !isDuplicate(c, existing))
    if (filtered.length === 0) {
        console.log('All candidate issues appear to be duplicates; nothing created.')
        return
    }
    const numbers = await createIssues(octokit, owner, repoName, filtered)
    console.log('Created issues:', numbers.join(', '))
}

main().catch((err) => {
    console.error(err)
    process.exit(11)
})
