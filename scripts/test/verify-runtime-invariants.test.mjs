#!/usr/bin/env node
/* eslint-env node */

import assert from 'node:assert'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const scriptPath = resolve(__dirname, '../verify-runtime-invariants.mjs')

async function createFixtureRepo({ backendDependency, frontendDependency }) {
    const root = await mkdtemp(join(tmpdir(), 'verify-runtime-invariants-'))

    await mkdir(resolve(root, '.github'), { recursive: true })
    await mkdir(resolve(root, 'backend'), { recursive: true })
    await mkdir(resolve(root, 'frontend'), { recursive: true })

    await writeFile(resolve(root, 'backend/package.json'), JSON.stringify({
        name: 'fixture-backend',
        dependencies: {
            '@piquet-h/shared': backendDependency
        }
    }, null, 2))

    await writeFile(resolve(root, 'frontend/package.json'), JSON.stringify({
        name: 'fixture-frontend',
        dependencies: {
            '@piquet-h/shared': frontendDependency
        }
    }, null, 2))

    return root
}

async function runVerifier(root, args = []) {
    try {
        const result = await execFileAsync('node', [scriptPath, ...args], {
            env: { ...process.env, VERIFY_RUNTIME_INVARIANTS_ROOT: root },
            timeout: 10000
        })
        return { exitCode: 0, stdout: result.stdout, stderr: result.stderr }
    } catch (error) {
        return {
            exitCode: error.code || 1,
            stdout: error.stdout || '',
            stderr: error.stderr || ''
        }
    }
}

test('verify-runtime-invariants: passes with published shared versions in warn mode', async () => {
    const root = await createFixtureRepo({
        backendDependency: '^0.3.141',
        frontendDependency: '^0.3.141'
    })

    try {
        const result = await runVerifier(root, ['--json'])
        assert.equal(result.exitCode, 0)

        const payload = JSON.parse(result.stdout)
        assert.equal(payload.mode, 'warn')
        assert.equal(payload.counts['shared-file-reference'], 0)
        assert.deepEqual(payload.issues, [])
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('verify-runtime-invariants: reports local shared file reference in warn mode', async () => {
    const root = await createFixtureRepo({
        backendDependency: 'file:../shared',
        frontendDependency: '^0.3.141'
    })

    try {
        const result = await runVerifier(root, ['--json'])
        assert.equal(result.exitCode, 0)

        const payload = JSON.parse(result.stdout)
        assert.equal(payload.counts['shared-file-reference'], 1)
        assert.equal(payload.issues[0].file, 'backend/package.json')
        assert.match(payload.issues[0].message, /forbidden local file reference/)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('verify-runtime-invariants: fails in strict mode when a local shared file reference is present', async () => {
    const root = await createFixtureRepo({
        backendDependency: '^0.3.141',
        frontendDependency: 'file:../shared'
    })

    try {
        const result = await runVerifier(root, ['--strict', '--json'])
        assert.equal(result.exitCode, 1)

        const payload = JSON.parse(result.stdout)
        assert.equal(payload.mode, 'strict')
        assert.equal(payload.status, 'fail')
        assert.equal(payload.counts['shared-file-reference'], 1)
        assert.equal(payload.issues[0].file, 'frontend/package.json')
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})