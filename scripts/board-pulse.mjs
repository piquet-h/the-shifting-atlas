#!/usr/bin/env node
/* eslint-env node */

import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

import { STATE_LABELS, evaluateVerifierOutcome, fingerprintTelemetryCluster, rankOpenMilestones } from './lib/milestone-board.mjs'

function resolveToken() {
    if (process.env.GH_TOKEN) return process.env.GH_TOKEN
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
    try {
        return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
    } catch {
        return ''
    }
}

async function ghApi(repo, path, { method = 'GET', token, body } = {}) {
    const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'the-shifting-atlas-board-pulse'
    }
    if (token) headers.Authorization = `Bearer ${token}`
    if (body) headers['Content-Type'] = 'application/json'

    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {})
    })
    if (res.status === 404) return null
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`GitHub API ${method} ${path} failed (${res.status}): ${text}`)
    }
    if (res.status === 204) return {}
    return res.json()
}

function parseArgs(argv) {
    const [command = 'prove', ...rest] = argv
    const opts = {
        command,
        repo: process.env.GITHUB_REPOSITORY || 'piquet-h/the-shifting-atlas',
        offset: '24h',
        apply: false,
        createBugs: false
    }
    for (let i = 0; i < rest.length; i++) {
        const arg = rest[i]
        if (arg === '--apply') opts.apply = true
        else if (arg === '--create-bugs') opts.createBugs = true
        else if (arg === '--offset' && rest[i + 1]) opts.offset = rest[++i]
        else if (arg === '--repo' && rest[i + 1]) opts.repo = rest[++i]
    }
    return opts
}

function queryAppInsightsExceptions(offset) {
    const appName = process.env.APP_INSIGHTS_APP || ''
    const resourceGroup = process.env.APP_INSIGHTS_RESOURCE_GROUP || 'rg-atlas-game'
    if (!appName) {
        return { configured: false, clusters: [] }
    }

    const azCmd = process.platform === 'win32' ? 'az.cmd' : 'az'
    const kql =
        'exceptions | summarize count=count(), sampleMessage=any(outerMessage) by type, problemId, operation_Name | top 15 by count desc'

    // Always pass --offset explicitly; az monitor app-insights query clips to 1h otherwise.
    const result = spawnSync(
        azCmd,
        [
            'monitor',
            'app-insights',
            'query',
            '--app',
            appName,
            '--resource-group',
            resourceGroup,
            '--offset',
            offset,
            '--analytics-query',
            kql,
            '-o',
            'json'
        ],
        {
            encoding: 'utf8',
            env: { ...process.env, AZURE_CORE_COLLECT_TELEMETRY: 'false', AZURE_CORE_ONLY_SHOW_ERRORS: 'true' },
            shell: process.platform === 'win32'
        }
    )

    if (result.status !== 0 || !result.stdout) {
        return { configured: false, clusters: [] }
    }

    try {
        const parsed = JSON.parse(result.stdout)
        const table = parsed?.tables?.[0]
        const cols = (table?.columns ?? []).map((c) => c.name)
        const clusters = (table?.rows ?? []).map((row) => {
            const obj = Object.fromEntries(cols.map((col, idx) => [col, row[idx]]))
            return {
                type: obj.type || 'exception',
                name: obj.operation_Name || 'unknown',
                problemId: obj.problemId || '',
                outerMessage: obj.sampleMessage || '',
                count: Number(obj.count || 0)
            }
        })
        return { configured: true, clusters }
    } catch {
        return { configured: false, clusters: [] }
    }
}

async function probeLiveBackendHealth() {
    const explicitUrl = process.env.BACKEND_HEALTH_URL
    if (!explicitUrl) return true
    try {
        const res = await fetch(explicitUrl, { signal: AbortSignal.timeout(10_000) })
        return res.ok
    } catch {
        return false
    }
}

async function runProve(opts, token) {
    const testingIssues =
        (await ghApi(opts.repo, `/issues?state=open&labels=${encodeURIComponent(STATE_LABELS.testing.name)}&per_page=100`, { token })) ?? []

    const healthOk = await probeLiveBackendHealth()
    const telemetry = queryAppInsightsExceptions(opts.offset)
    const exceptionCount = telemetry.clusters.reduce((acc, c) => acc + c.count, 0)

    const summaryRows = []
    for (const issue of testingIssues) {
        if (issue.pull_request) continue
        const evaluation = evaluateVerifierOutcome({
            issue,
            healthOk,
            exceptionCount,
            ciGreen: true
        })

        summaryRows.push(`| #${issue.number} | \`${evaluation.disposition}\` | ${evaluation.reason} |`)
        console.log(`[board-pulse:prove] #${issue.number} -> ${evaluation.disposition} (apply=${opts.apply})`)

        if (!opts.apply) continue

        if (evaluation.disposition === 'close-proven') {
            await ghApi(opts.repo, `/issues/${issue.number}/comments`, {
                method: 'POST',
                token,
                body: { body: `✅ **Post-deploy verification passed**: ${evaluation.reason}` }
            })
            await ghApi(opts.repo, `/issues/${issue.number}`, {
                method: 'PATCH',
                token,
                body: {
                    state: 'closed',
                    state_reason: 'completed',
                    labels: evaluation.nextLabels
                }
            })
        } else if (evaluation.disposition === 'await-operator') {
            await ghApi(opts.repo, `/issues/${issue.number}`, {
                method: 'PATCH',
                token,
                body: { labels: evaluation.nextLabels }
            })
        } else if (evaluation.disposition === 'return-in-progress') {
            await ghApi(opts.repo, `/issues/${issue.number}/comments`, {
                method: 'POST',
                token,
                body: { body: `❌ **Returned from \`${STATE_LABELS.testing.name}\`**: ${evaluation.reason}` }
            })
            await ghApi(opts.repo, `/issues/${issue.number}`, {
                method: 'PATCH',
                token,
                body: { labels: evaluation.nextLabels }
            })
        }
    }

    if (process.env.GITHUB_STEP_SUMMARY) {
        const md = [
            `### Board Pulse — Prove (\`--offset ${opts.offset}\`, apply=\`${opts.apply}\`)`,
            `- **App Insights telemetry**: ${telemetry.configured ? `${telemetry.clusters.length} cluster(s), ${exceptionCount} exception(s)` : '_(not configured; endpoint/CI check only)_'}`,
            `- **Issues in \`state:testing\`**: ${summaryRows.length}`,
            ...(summaryRows.length > 0 ? ['', '| Issue | Disposition | Detail |', '| :--- | :--- | :--- |', ...summaryRows] : []),
            ''
        ].join('\n')
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`)
    }
}

async function runSense(opts, token) {
    const telemetry = queryAppInsightsExceptions(opts.offset)
    if (!telemetry.configured) {
        console.log('[board-pulse:sense] APP_INSIGHTS_APP not configured or unreachable; skipping bug synthesis.')
        return
    }

    const openIssues = (await ghApi(opts.repo, '/issues?state=open&per_page=100', { token })) ?? []
    const milestones = (await ghApi(opts.repo, '/milestones?state=open&per_page=50', { token })) ?? []
    const activeMilestone = rankOpenMilestones(milestones)[0]

    let created = 0
    for (const cluster of telemetry.clusters) {
        if (cluster.count < 3) continue
        const fp = fingerprintTelemetryCluster(cluster)
        const marker = `<!-- shifting-atlas-sense-fp:${fp} -->`
        const duplicate = openIssues.some((i) => String(i.body ?? '').includes(marker))
        if (duplicate) continue

        console.log(`[board-pulse:sense] New telemetry cluster fp=${fp} (${cluster.name}: ${cluster.count} hits)`)
        if (!opts.createBugs || !opts.apply) continue

        const body = [
            marker,
            `Summary: Production telemetry detected **${cluster.count}** occurrence(s) of \`${cluster.type}\` in \`${cluster.name}\` over the last \`${opts.offset}\`.`,
            '',
            'Goal: Eliminate unhandled exception regression in production.',
            '',
            '### Telemetry Evidence',
            `- **Operation**: \`${cluster.name}\``,
            `- **Problem ID**: \`${cluster.problemId || 'n/a'}\``,
            `- **Sample**: \`${String(cluster.outerMessage).slice(0, 180)}\``,
            '',
            'Acceptance Criteria:',
            '- [ ] Reproduce failure in a failing unit or integration test',
            '- [ ] Fix root cause and verify zero occurrences post-deploy',
            '',
            'Edge Cases:',
            '- Repeated or malformed upstream event/request inputs',
            '',
            'Risk: RUNTIME-BEHAVIOR',
            'Out of Scope: Unrelated refactoring'
        ].join('\n')

        await ghApi(opts.repo, '/issues', {
            method: 'POST',
            token,
            body: {
                title: `Fix ${cluster.type} in ${cluster.name} (${fp.slice(0, 6)})`,
                body,
                labels: ['scope:observability', 'enhancement', STATE_LABELS.new.name],
                ...(activeMilestone ? { milestone: activeMilestone.number } : {})
            }
        })
        created++
        if (created >= 3) break
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2))
    const token = resolveToken()

    if (opts.command === 'prove') {
        await runProve(opts, token)
        return
    }
    if (opts.command === 'sense') {
        await runSense(opts, token)
        return
    }
    throw new Error(`Unknown subcommand "${opts.command}". Expected: prove | sense`)
}

main().catch((error) => {
    console.error(`[board-pulse] ERROR: ${error.message}`)
    process.exit(1)
})
