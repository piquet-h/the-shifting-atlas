#!/usr/bin/env node
/* eslint-env node */

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const scriptPath = resolve(__dirname, '../verify-docs-policy.mjs')

async function createDocsFixture({ designBody, readmeBody }) {
    const root = await mkdtemp(join(tmpdir(), 'verify-docs-policy-'))
    await mkdir(join(root, '.github', 'instructions'), { recursive: true })
    await mkdir(join(root, 'docs', 'design-modules'), { recursive: true })
    await mkdir(join(root, 'docs', 'concept'), { recursive: true })

    await writeFile(
        join(root, '.github', 'instructions', 'docs.instructions.md'),
        'Planning/leakage indicator verbs:\n`implement, sequence, schedule, sprint, backlog, dependency, milestone, roadmap, optimize, telemetry task, story points, spike`.\n'
    )
    await writeFile(join(root, 'docs', 'design-modules', 'sample.md'), designBody)
    await writeFile(join(root, 'README.md'), readmeBody)

    return root
}

async function runVerifier(root, args = []) {
    try {
        const { stdout, stderr } = await execFileAsync(process.execPath, [scriptPath, ...args], {
            cwd: root,
            env: { ...process.env, VERIFY_DOCS_POLICY_ROOT: root }
        })
        return { exitCode: 0, stdout, stderr }
    } catch (error) {
        return {
            exitCode: error.code ?? 1,
            stdout: error.stdout ?? '',
            stderr: error.stderr ?? ''
        }
    }
}

describe('verify-docs-policy', () => {
    test('passes in --strict --check-links mode when design docs are altitude-clean and relative links resolve', async () => {
        const root = await createDocsFixture({
            designBody: '# Sample Module\n\nGameplay rules stay pure.\n',
            readmeBody: '# Vision\n\nSee [Sample](docs/design-modules/sample.md).\n'
        })
        try {
            const res = await runVerifier(root, ['--strict', '--check-links', '--json'])
            assert.equal(res.exitCode, 0)
            const payload = JSON.parse(res.stdout)
            assert.equal(payload.status, 'pass')
            assert.equal(payload.issues.length, 0)
        } finally {
            await rm(root, { recursive: true, force: true })
        }
    })

    test('fails in --strict --check-links mode on broken relative Markdown links outside code fences', async () => {
        const root = await createDocsFixture({
            designBody: '# Sample Module\n\n```md\n[Ignored example](./does-not-exist-in-fence.md)\n```\n',
            readmeBody: '# Vision\n\nBroken link to [Missing](docs/missing-file.md).\n'
        })
        try {
            const res = await runVerifier(root, ['--strict', '--check-links', '--json'])
            assert.equal(res.exitCode, 1)
            const payload = JSON.parse(res.stdout)
            assert.equal(payload.counts['broken-link'], 1)
            assert.equal(payload.issues[0].file, 'README.md')
        } finally {
            await rm(root, { recursive: true, force: true })
        }
    })
})
