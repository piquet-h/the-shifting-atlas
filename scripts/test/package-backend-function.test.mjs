#!/usr/bin/env node
/* eslint-env node */

import assert from 'node:assert/strict'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import {
    assertNoCompiledTests,
    assertStandaloneBackendPackage,
    createDeployManifest,
    packageBackendFunction
} from '../package-backend-function.mjs'

function createFixtureMonorepo({ includeCompiledTestsIn = null } = {}) {
    const root = mkdtempSync(join(tmpdir(), 'atlas-fn-pkg-'))

    mkdirSync(join(root, 'shared', 'dist'), { recursive: true })
    mkdirSync(join(root, 'backend', 'dist', 'src', 'functions'), { recursive: true })
    mkdirSync(join(root, 'node_modules', '@piquet-h'), { recursive: true })
    mkdirSync(join(root, 'node_modules', 'zod'), { recursive: true })

    writeFileSync(
        join(root, 'package.json'),
        JSON.stringify(
            {
                name: 'the-shifting-atlas-root',
                private: true,
                workspaces: ['shared', 'backend', 'frontend']
            },
            null,
            2
        )
    )

    writeFileSync(
        join(root, 'shared', 'package.json'),
        JSON.stringify(
            {
                name: '@piquet-h/shared',
                version: '0.4.0',
                private: true,
                type: 'module',
                main: 'dist/index.js',
                exports: { '.': './dist/index.js' },
                dependencies: { zod: '^4.6.7' },
                devDependencies: { typescript: '^5.9.3' }
            },
            null,
            2
        )
    )
    writeFileSync(join(root, 'shared', 'dist', 'index.js'), 'export const ATLAS_READY = true;\n')

    writeFileSync(
        join(root, 'backend', 'package.json'),
        JSON.stringify(
            {
                name: 'the-shifting-atlas-backend',
                version: '0.1.0',
                private: true,
                type: 'module',
                main: 'dist/src/{index.js,functions/*.js}',
                dependencies: {
                    '@piquet-h/shared': '*',
                    zod: '^4.6.7'
                },
                devDependencies: {
                    typescript: '^5.9.3',
                    sinon: '^21.1.2'
                }
            },
            null,
            2
        )
    )
    writeFileSync(join(root, 'backend', 'host.json'), JSON.stringify({ version: '2.0' }, null, 2))
    writeFileSync(
        join(root, 'backend', 'dist', 'src', 'index.js'),
        "import { ATLAS_READY } from '@piquet-h/shared';\nexport { ATLAS_READY };\n"
    )
    writeFileSync(join(root, 'node_modules', 'zod', 'package.json'), JSON.stringify({ name: 'zod', version: '4.6.7', main: 'index.js' }))
    writeFileSync(join(root, 'node_modules', 'zod', 'index.js'), 'module.exports = {};\n')

    symlinkSync(join(root, 'shared'), join(root, 'node_modules', '@piquet-h', 'shared'), process.platform === 'win32' ? 'junction' : 'dir')

    if (includeCompiledTestsIn === 'backend') {
        mkdirSync(join(root, 'backend', 'dist', 'test'), { recursive: true })
        writeFileSync(join(root, 'backend', 'dist', 'test', 'leak.test.js'), '')
    }
    if (includeCompiledTestsIn === 'shared') {
        mkdirSync(join(root, 'shared', 'dist', 'test'), { recursive: true })
        writeFileSync(join(root, 'shared', 'dist', 'test', 'leak.test.js'), '')
    }

    return root
}

describe('package-backend-function', () => {
    test('packages backend with standalone non-symlinked @piquet-h/shared and stripped devDependencies', () => {
        const root = createFixtureMonorepo()
        try {
            const outputDir = join(root, 'backend', '.deploy')
            packageBackendFunction({
                repositoryRoot: root,
                output: 'backend/.deploy',
                skipNpmPrune: true
            })

            const deployedManifest = JSON.parse(readFileSync(join(outputDir, 'package.json'), 'utf8'))
            assert.equal(deployedManifest.devDependencies, undefined)
            assert.equal(deployedManifest.dependencies['@piquet-h/shared'], '0.4.0')

            const sharedNodeModule = join(outputDir, 'node_modules', '@piquet-h', 'shared')
            assert.equal(lstatSync(sharedNodeModule).isSymbolicLink(), false)
            assertStandaloneBackendPackage(outputDir)
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    })

    test('rejects packaging when compiled test output leaks into backend/dist/test or shared/dist/test', () => {
        const backendLeakRoot = createFixtureMonorepo({ includeCompiledTestsIn: 'backend' })
        try {
            assert.throws(
                () =>
                    packageBackendFunction({
                        repositoryRoot: backendLeakRoot,
                        output: 'backend/.deploy',
                        skipNpmPrune: true
                    }),
                /dist\/test/
            )
        } finally {
            rmSync(backendLeakRoot, { recursive: true, force: true })
        }

        const sharedLeakRoot = createFixtureMonorepo({ includeCompiledTestsIn: 'shared' })
        try {
            assert.throws(() => assertNoCompiledTests(join(sharedLeakRoot, 'shared', 'dist'), 'shared'), /dist\/test/)
        } finally {
            rmSync(sharedLeakRoot, { recursive: true, force: true })
        }
    })

    test('rejects standalone verification when @piquet-h/shared remains a workspace symlink', () => {
        const root = createFixtureMonorepo()
        try {
            const fakeOutput = join(root, 'fake-deploy')
            mkdirSync(join(fakeOutput, 'dist', 'src'), { recursive: true })
            mkdirSync(join(fakeOutput, 'node_modules', '@piquet-h'), { recursive: true })
            writeFileSync(join(fakeOutput, 'host.json'), '{"version":"2.0"}')
            writeFileSync(join(fakeOutput, 'dist', 'src', 'index.js'), '')
            symlinkSync(
                join(root, 'shared'),
                join(fakeOutput, 'node_modules', '@piquet-h', 'shared'),
                process.platform === 'win32' ? 'junction' : 'dir'
            )

            assert.throws(() => assertStandaloneBackendPackage(fakeOutput), /link/i)
        } finally {
            rmSync(root, { recursive: true, force: true })
        }
    })

    test('createDeployManifest removes devDependencies and pins bundled shared version', () => {
        const manifest = createDeployManifest(
            {
                name: 'the-shifting-atlas-backend',
                dependencies: { '@piquet-h/shared': '*', zod: '^4.6.7' },
                devDependencies: { typescript: '^5.9.3' }
            },
            '0.4.0'
        )
        assert.equal(manifest.devDependencies, undefined)
        assert.equal(manifest.dependencies['@piquet-h/shared'], '0.4.0')
    })
})
