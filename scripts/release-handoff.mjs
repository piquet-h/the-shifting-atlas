#!/usr/bin/env node
/* eslint-env node */

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { TESTING_STATE_LABEL, buildTestingTransitionPlan, extractReferencedIssueNumbers } from './lib/release-handoff.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function git(...args) {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim()
}

function tryGit(...args) {
    try {
        return git(...args)
    } catch {
        return ''
    }
}

function parseArgs(argv) {
    const out = {}
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--unit' && argv[i + 1]) out.unit = argv[++i]
        else if (arg === '--base-sha' && argv[i + 1]) out.baseSha = argv[++i]
        else if (arg === '--dry-run') out.dryRun = true
    }
    if (!out.unit) {
        throw new Error('Usage: node scripts/release-handoff.mjs --unit <backend|frontend|infrastructure> [--base-sha <sha>] [--dry-run]')
    }
    return out
}

async function ghApi(repo, path, { method = 'GET', token, body } = {}) {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
        method,
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'User-Agent': 'the-shifting-atlas-release-handoff',
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    })
    if (response.status === 404) return null
    if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`GitHub API ${method} ${path} failed (${response.status}): ${text}`)
    }
    if (response.status === 204) return {}
    return response.json()
}

async function ensureTestingLabel(repo, token) {
    const existing = await ghApi(repo, `/labels/${encodeURIComponent(TESTING_STATE_LABEL)}`, { token })
    if (existing) return
    await ghApi(repo, '/labels', {
        method: 'POST',
        token,
        body: {
            name: TESTING_STATE_LABEL,
            color: 'fbca04',
            description: 'Deployed to production; awaiting post-deploy verification'
        }
    }).catch(() => {})
}

function updateDeployedTag(unit, headSha, dryRun) {
    const tagName = `deployed-${unit}`
    if (dryRun) {
        console.log(`[release-handoff] (dry-run) Would advance tag ${tagName} -> ${headSha}`)
        return
    }
    git(
        '-c',
        'user.name=Shifting Atlas Release',
        '-c',
        'user.email=release@the-shifting-atlas.invalid',
        'tag',
        '-fa',
        tagName,
        '-m',
        `Deployed ${unit} at ${headSha}`,
        headSha
    )
    git('push', 'origin', `refs/tags/${tagName}`, '--force')
    console.log(`[release-handoff] Updated tag ${tagName} -> ${headSha.slice(0, 8)}`)
}

async function main() {
    const { unit, baseSha, dryRun = false } = parseArgs(process.argv.slice(2))
    const headSha = git('rev-parse', 'HEAD')
    const effectiveBase = baseSha && baseSha !== headSha ? baseSha : tryGit('rev-parse', 'HEAD~1')

    const logRange = effectiveBase ? `${effectiveBase}..${headSha}` : '-n 1'
    const rawLog = effectiveBase ? tryGit('log', '--format=%B%n---COMMIT-BOUNDARY---', logRange) : tryGit('log', '-n', '1', '--format=%B')
    const commitMessages = rawLog
        .split('---COMMIT-BOUNDARY---')
        .map((s) => s.trim())
        .filter(Boolean)
    const issueNumbers = extractReferencedIssueNumbers(commitMessages)

    const repo = process.env.GITHUB_REPOSITORY || 'piquet-h/the-shifting-atlas'
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''
    const runUrl =
        process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
            ? `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
            : ''

    const transitioned = []
    if (issueNumbers.length > 0 && token) {
        if (!dryRun) {
            await ensureTestingLabel(repo, token)
        }
        for (const num of issueNumbers) {
            const issue = await ghApi(repo, `/issues/${num}`, { token }).catch(() => null)
            const plan = buildTestingTransitionPlan({ issue, unit, commitSha: headSha, runUrl })
            if (!plan.eligible) continue

            const comments = (await ghApi(repo, `/issues/${num}/comments?per_page=30`, { token }).catch(() => [])) ?? []
            const alreadyPosted = Array.isArray(comments) && comments.some((c) => String(c?.body ?? '').includes(plan.commentMarker))

            if (dryRun) {
                console.log(`[release-handoff] (dry-run) Would transition #${num} -> ${TESTING_STATE_LABEL}`)
                transitioned.push(num)
                continue
            }

            await ghApi(repo, `/issues/${num}`, {
                method: 'PATCH',
                token,
                body: { labels: plan.nextLabels }
            })
            if (!alreadyPosted) {
                await ghApi(repo, `/issues/${num}/comments`, {
                    method: 'POST',
                    token,
                    body: { body: plan.commentBody }
                })
            }
            console.log(`[release-handoff] Transitioned issue #${num} -> ${TESTING_STATE_LABEL}`)
            transitioned.push(num)
        }
    }

    updateDeployedTag(unit, headSha, dryRun)

    if (process.env.GITHUB_STEP_SUMMARY) {
        const lines = [
            `### Release Handoff (${unit})`,
            `- **Deployed commit**: \`${headSha.slice(0, 8)}\` (\`deployed-${unit}\` tag updated)`,
            `- **Referenced issues transitioned to \`${TESTING_STATE_LABEL}\`**: ${
                transitioned.length > 0 ? transitioned.map((n) => `#${n}`).join(', ') : '_(none)_'
            }`,
            ''
        ]
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'))
    }
}

main().catch((error) => {
    console.error(`[release-handoff] ERROR: ${error.message}`)
    process.exit(1)
})
