#!/usr/bin/env node
/* eslint-env node */
/* global fetch, process, console */
/**
 * sync-labels.mjs
 * Ensures required "type" labels (feature, enhancement, refactor, infra, docs, spike, test)
 * exist in the repository, creating any that are missing. Safe to run multiple times (idempotent).
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx node scripts/sync-labels.mjs
 *   # or via npm script (added separately): npm run sync:labels
 *
 * Notes:
 * - Only creates labels; does not delete or rename existing ones.
 * - If a label already exists, its description can optionally be patched if it differs.
 * - Colors chosen for distinctiveness and adequate contrast.
 */

const REQUIRED = [
    {
        name: 'feature',
        color: '1f883d', // green (GitHub style success)
        description: 'Net-new player or system capability'
    },
    {
        name: 'enhancement',
        color: '0374b5', // blue
        description: 'Improvement or iteration on existing feature'
    },
    {
        name: 'refactor',
        color: '8250df', // purple
        description: 'Internal code restructure without behavior change'
    },
    {
        name: 'infra',
        color: 'a371f7', // lighter purple
        description: 'Build, tooling, deployment, or platform work'
    },
    {
        name: 'docs',
        color: '0e8a16', // alternate green
        description: 'Documentation authoring or updates'
    },
    {
        name: 'spike',
        color: 'd93f0b', // orange
        description: 'Time-boxed investigation / prototype'
    },
    {
        name: 'test',
        color: 'fbca04', // yellow
        description: 'Automated testing, coverage, or quality harness work'
    }
]

async function main() {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
    if (!token) {
        console.error('Missing GITHUB_TOKEN (or GH_TOKEN). Export a token with repo:write scope.')
        process.exit(2)
    }

    // Infer owner/repo from package repository field if available or fallback from git remote
    const repo = await inferRepo()
    if (!repo) {
        console.error('Unable to infer owner/repo. Configure origin remote or add repository field in package.json.')
        process.exit(3)
    }
    const {owner, name} = repo

    const existing = await listLabels(owner, name, token)
    const existingMap = new Map(existing.map((l) => [l.name.toLowerCase(), l]))

    const create = []
    const update = []
    for (const req of REQUIRED) {
        const found = existingMap.get(req.name.toLowerCase())
        if (!found) create.push(req)
        else if ((found.description || '') !== req.description || found.color.toLowerCase() !== req.color.toLowerCase())
            update.push({...req})
    }

    if (create.length === 0 && update.length === 0) {
        console.log('All required type labels present and up-to-date.')
        return
    }

    for (const c of create) {
        await githubRequest(token, `https://api.github.com/repos/${owner}/${name}/labels`, {
            method: 'POST',
            body: JSON.stringify({name: c.name, color: c.color, description: c.description})
        })
        console.log(`Created label: ${c.name}`)
    }

    for (const u of update) {
        // PATCH /repos/{owner}/{repo}/labels/{name}
        await githubRequest(token, `https://api.github.com/repos/${owner}/${name}/labels/${encodeURIComponent(u.name)}`, {
            method: 'PATCH',
            body: JSON.stringify({name: u.name, color: u.color, description: u.description})
        })
        console.log(`Updated label: ${u.name}`)
    }
}

async function listLabels(owner, name, token) {
    const labels = []
    let page = 1
    while (true) {
        const res = await githubRequest(token, `https://api.github.com/repos/${owner}/${name}/labels?per_page=100&page=${page}`)
        if (!Array.isArray(res) || res.length === 0) break
        labels.push(...res)
        if (res.length < 100) break
        page++
    }
    return labels
}

async function githubRequest(token, url, init = {}) {
    const headers = Object.assign(
        {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'User-Agent': 'sync-labels-script'
        },
        init.headers || {}
    )
    const resp = await fetch(url, {...init, headers})
    if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`GitHub request failed ${resp.status} ${resp.statusText}: ${text}`)
    }
    const ct = resp.headers.get('content-type') || ''
    if (ct.includes('application/json')) return resp.json()
    return resp.text()
}

async function inferRepo() {
    // Try reading package.json repository field from root (assumes script run at root)
    try {
        const fs = await import('node:fs')
        const pkgRaw = fs.readFileSync('package.json', 'utf8')
        const pkg = JSON.parse(pkgRaw)
        if (pkg.repository) {
            if (typeof pkg.repository === 'string') {
                const m = pkg.repository.match(/([\w-]+)\/([\w.-]+)(?:\.git)?$/)
                if (m) return {owner: m[1], name: m[2].replace(/\.git$/, '')}
            } else if (pkg.repository.url) {
                const m = pkg.repository.url.match(/([\w-]+)\/([\w.-]+)(?:\.git)?$/)
                if (m) return {owner: m[1], name: m[2].replace(/\.git$/, '')}
            }
        }
    } catch {
        // ignore – repository field inference is best-effort
    }
    // Fallback: parse from git remote
    try {
        const cp = await import('node:child_process')
        const remote = cp.execSync('git remote get-url origin', {encoding: 'utf8'}).trim()
        const m = remote.match(/[:/]([\w-]+)\/([\w.-]+)(?:\.git)?$/)
        if (m) return {owner: m[1], name: m[2].replace(/\.git$/, '')}
    } catch {
        // ignore – remote parsing best-effort
    }
    return null
}

main().catch((err) => {
    console.error(err.stack || err)
    process.exit(1)
})
