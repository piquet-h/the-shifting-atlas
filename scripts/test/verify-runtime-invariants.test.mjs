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

async function createFixtureRepo({ backendDependency, frontendDependency, dataFiles = {} }) {
    const root = await mkdtemp(join(tmpdir(), 'verify-runtime-invariants-'))

    await mkdir(resolve(root, '.github'), { recursive: true })
    await mkdir(resolve(root, 'backend'), { recursive: true })
    await mkdir(resolve(root, 'frontend'), { recursive: true })
    await mkdir(resolve(root, 'backend/src/data'), { recursive: true })

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

    for (const [relativePath, content] of Object.entries(dataFiles)) {
        await mkdir(resolve(root, relativePath, '..'), { recursive: true })
        await writeFile(resolve(root, relativePath), JSON.stringify(content, null, 2))
    }

    return root
}

function buildValidAtlasData() {
    return {
        'backend/src/data/villageLocations.json': [
            {
                id: 'a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21',
                name: 'Mosswell River Jetty',
                description: 'Seed location',
                exits: [
                    {
                        direction: 'north',
                        to: 'f7c9b2ad-1e34-4c6f-8d5a-2b7e9c4f1a53'
                    }
                ],
                version: 1
            },
            {
                id: 'f7c9b2ad-1e34-4c6f-8d5a-2b7e9c4f1a53',
                name: 'North Road',
                description: 'Seed location',
                exits: [],
                version: 1
            }
        ],
        'backend/src/data/theLongReachMacroAtlas.json': {
            landmass: {
                id: '5b3d1f95-4f1a-4e2d-8d40-4a49d74d89bc'
            },
            macroGraph: {
                nodes: [
                    { id: 'lr-area-mosswell-fiordhead', name: 'Mosswell Fiordhead Basin', nodeClass: 'area' },
                    { id: 'lr-barrier-fiord-deeps', name: 'Fiord Deeps', nodeClass: 'barrier' }
                ],
                edges: [
                    {
                        from: 'lr-area-mosswell-fiordhead',
                        to: 'lr-area-mosswell-fiordhead',
                        barrierRefs: ['lr-barrier-fiord-deeps']
                    }
                ],
                directionalTrendProfiles: [
                    {
                        anchorNode: 'lr-area-mosswell-fiordhead',
                        trends: { north: 'road continuity persists' }
                    }
                ],
                continuityRoutes: [
                    {
                        id: 'lr-route-mosswell-north-road',
                        name: 'Mosswell North Road Lineage'
                    }
                ]
            },
            mosswellPlacement: {
                macroAreaRef: 'lr-area-mosswell-fiordhead',
                adjacentMacroRefs: ['lr-area-mosswell-fiordhead']
            }
        },
        'backend/src/data/mosswellMacroAtlas.json': {
            settlement: {
                id: 'mosswell-macro-atlas-v1',
                placement: {
                    macroAreaRef: 'lr-area-mosswell-fiordhead'
                }
            },
            macroGraph: {
                nodes: [
                    { id: 'mw-area-fjord-sound-head', name: 'Mosswell Fjord/Sound Head', nodeClass: 'area' },
                    { id: 'mw-barrier-sound-deeps', name: 'Sound Deeps', nodeClass: 'barrier' }
                ],
                edges: [
                    {
                        from: 'mw-area-fjord-sound-head',
                        to: 'mw-area-fjord-sound-head',
                        barrierRefs: ['mw-barrier-sound-deeps']
                    }
                ],
                directionalTrendProfiles: [
                    {
                        anchorNode: 'mw-area-fjord-sound-head',
                        trends: { west: 'terrain steepens' }
                    }
                ],
                continuityRoutes: [
                    {
                        id: 'mw-route-harbor-to-northgate',
                        name: 'Harbor-to-Northgate Route'
                    }
                ]
            }
        }
    }
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

test('verify-runtime-invariants: accepts GUID runtime seed ids and semantic atlas ids together', async () => {
    const root = await createFixtureRepo({
        backendDependency: '^0.3.141',
        frontendDependency: '^0.3.141',
        dataFiles: buildValidAtlasData()
    })

    try {
        const result = await runVerifier(root, ['--strict', '--json'])
        assert.equal(result.exitCode, 0)

        const payload = JSON.parse(result.stdout)
        assert.equal(payload.counts['seed-location-id-format'], 0)
        assert.equal(payload.counts['seed-exit-target-id-format'], 0)
        assert.equal(payload.counts['atlas-semantic-id-format'], 0)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('verify-runtime-invariants: fails when a runtime seed location id is not a GUID', async () => {
    const dataFiles = buildValidAtlasData()
    dataFiles['backend/src/data/villageLocations.json'][0].id = 'north-road'

    const root = await createFixtureRepo({
        backendDependency: '^0.3.141',
        frontendDependency: '^0.3.141',
        dataFiles
    })

    try {
        const result = await runVerifier(root, ['--strict', '--json'])
        assert.equal(result.exitCode, 1)

        const payload = JSON.parse(result.stdout)
        assert.equal(payload.counts['seed-location-id-format'], 1)
        assert.match(payload.issues[0].message, /must use a GUID/i)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})

test('verify-runtime-invariants: fails when an atlas semantic id is replaced with a GUID', async () => {
    const dataFiles = buildValidAtlasData()
    dataFiles['backend/src/data/theLongReachMacroAtlas.json'].macroGraph.nodes[0].id = '11111111-1111-1111-1111-111111111111'
    dataFiles['backend/src/data/theLongReachMacroAtlas.json'].macroGraph.edges[0].from = '11111111-1111-1111-1111-111111111111'
    dataFiles['backend/src/data/theLongReachMacroAtlas.json'].macroGraph.edges[0].to = '11111111-1111-1111-1111-111111111111'
    dataFiles['backend/src/data/theLongReachMacroAtlas.json'].macroGraph.directionalTrendProfiles[0].anchorNode =
        '11111111-1111-1111-1111-111111111111'
    dataFiles['backend/src/data/theLongReachMacroAtlas.json'].mosswellPlacement.macroAreaRef =
        '11111111-1111-1111-1111-111111111111'

    const root = await createFixtureRepo({
        backendDependency: '^0.3.141',
        frontendDependency: '^0.3.141',
        dataFiles
    })

    try {
        const result = await runVerifier(root, ['--strict', '--json'])
        assert.equal(result.exitCode, 1)

        const payload = JSON.parse(result.stdout)
        assert.ok(payload.counts['atlas-semantic-id-format'] >= 1)
        assert.match(payload.issues.find((issue) => issue.type === 'atlas-semantic-id-format').message, /semantic atlas reference/i)
    } finally {
        await rm(root, { recursive: true, force: true })
    }
})