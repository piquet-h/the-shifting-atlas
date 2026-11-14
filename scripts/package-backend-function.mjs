#!/usr/bin/env node
/* eslint-env node */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHARED_PACKAGE_NAME = '@piquet-h/shared'

export function createDeployManifest(manifest, bundledSharedVersion) {
    const deployManifest = structuredClone(manifest)
    delete deployManifest.devDependencies

    if (bundledSharedVersion && deployManifest.dependencies?.[SHARED_PACKAGE_NAME]) {
        deployManifest.dependencies[SHARED_PACKAGE_NAME] = bundledSharedVersion
    }

    return deployManifest
}

export function assertNoCompiledTests(distDir, workspaceName) {
    const compiledTests = join(distDir, 'test')
    if (existsSync(compiledTests)) {
        throw new Error(
            `${workspaceName} dist contains compiled test output at dist/test. ` +
                'Restrict the build tsconfig to src so test code never enters the deployment package.'
        )
    }
}

export function assertStandaloneBackendPackage(packageRoot) {
    const hostJson = join(packageRoot, 'host.json')
    const backendEntry = join(packageRoot, 'dist', 'src', 'index.js')
    if (!existsSync(hostJson)) {
        throw new Error('Function package is missing host.json.')
    }
    if (!existsSync(backendEntry)) {
        throw new Error('Function package is missing built dist/src/index.js.')
    }

    const sharedRoot = join(packageRoot, 'node_modules', '@piquet-h', 'shared')
    if (!existsSync(sharedRoot)) {
        throw new Error(`Function package is missing bundled ${SHARED_PACKAGE_NAME}.`)
    }
    if (lstatSync(sharedRoot).isSymbolicLink()) {
        throw new Error(`Function package contains a workspace symlink/link for ${SHARED_PACKAGE_NAME}.`)
    }
    if (!existsSync(join(sharedRoot, 'dist', 'index.js'))) {
        throw new Error(`Function package is missing built ${SHARED_PACKAGE_NAME}/dist/index.js.`)
    }
}

function resolveInstalledPackageDir(pkgName, searchNodeModulesDirs) {
    const parts = pkgName.split('/')
    for (const nmDir of searchNodeModulesDirs) {
        const candidate = join(nmDir, ...parts)
        if (existsSync(join(candidate, 'package.json'))) {
            return candidate
        }
    }
    return null
}

function copyProductionClosure({ repositoryRoot, backendRoot, sharedRoot, outputRoot, backendManifest, sharedManifest }) {
    const baseSearchDirs = [join(backendRoot, 'node_modules'), join(sharedRoot, 'node_modules'), join(repositoryRoot, 'node_modules')]

    const visitedRealPaths = new Set()
    const copiedTopLevelNames = new Set()
    const queue = []

    const seedDeps = (manifest, isOptional = false) => {
        const deps = isOptional ? manifest.optionalDependencies : manifest.dependencies
        for (const depName of Object.keys(deps ?? {})) {
            if (depName === SHARED_PACKAGE_NAME) continue
            queue.push({ depName, parentDir: null, optional: isOptional })
        }
    }

    seedDeps(backendManifest, false)
    seedDeps(backendManifest, true)
    seedDeps(sharedManifest, false)
    seedDeps(sharedManifest, true)

    while (queue.length > 0) {
        const { depName, parentDir, optional } = queue.shift()

        const searchDirs = []
        if (parentDir) {
            let cursor = parentDir
            while (cursor.startsWith(repositoryRoot) && cursor.length >= repositoryRoot.length) {
                searchDirs.push(join(cursor, 'node_modules'))
                const next = dirname(cursor)
                if (next === cursor) break
                cursor = next
            }
        }
        for (const baseDir of baseSearchDirs) {
            if (!searchDirs.includes(baseDir)) searchDirs.push(baseDir)
        }

        const resolvedDir = resolveInstalledPackageDir(depName, searchDirs)
        if (!resolvedDir) {
            if (optional) continue
            throw new Error(`Required runtime dependency "${depName}" is not installed. Run "npm ci" at repository root before packaging.`)
        }

        const realDir = realpathSync(resolvedDir)
        const isNestedInsideParent = parentDir !== null && realDir.startsWith(`${realpathSync(parentDir)}${sep}node_modules${sep}`)

        if (!isNestedInsideParent && !copiedTopLevelNames.has(depName)) {
            const destDir = join(outputRoot, 'node_modules', ...depName.split('/'))
            mkdirSync(dirname(destDir), { recursive: true })
            cpSync(realDir, destDir, { recursive: true, dereference: true })
            copiedTopLevelNames.add(depName)
        }

        if (visitedRealPaths.has(realDir)) continue
        visitedRealPaths.add(realDir)

        const depManifest = JSON.parse(readFileSync(join(realDir, 'package.json'), 'utf8'))
        for (const childDep of Object.keys(depManifest.dependencies ?? {})) {
            if (childDep === SHARED_PACKAGE_NAME) continue
            queue.push({ depName: childDep, parentDir: realDir, optional: false })
        }
        for (const optDep of Object.keys(depManifest.optionalDependencies ?? {})) {
            if (optDep === SHARED_PACKAGE_NAME) continue
            queue.push({ depName: optDep, parentDir: realDir, optional: true })
        }
        for (const peerDep of Object.keys(depManifest.peerDependencies ?? {})) {
            if (peerDep === SHARED_PACKAGE_NAME) continue
            const peerOptional = Boolean(depManifest.peerDependenciesMeta?.[peerDep]?.optional)
            queue.push({ depName: peerDep, parentDir: realDir, optional: peerOptional })
        }
    }
}

function parseArguments(argv) {
    const values = { output: 'backend/.deploy' }
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--output' && argv[i + 1]) {
            values.output = argv[++i]
        } else if (arg === '--skip-npm-prune') {
            values.skipNpmPrune = true
        } else {
            throw new Error(`Unknown argument "${arg}". Usage: node scripts/package-backend-function.mjs [--output <path>]`)
        }
    }
    return values
}

export function packageBackendFunction({
    repositoryRoot = defaultRepositoryRoot,
    output = 'backend/.deploy',
    skipNpmPrune = false,
    log = console.log
} = {}) {
    const rootManifest = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'))
    if (!Array.isArray(rootManifest.workspaces) || !rootManifest.workspaces.includes('backend')) {
        throw new Error('Root package.json must declare "backend" and "shared" in workspaces.')
    }

    const backendRoot = join(repositoryRoot, 'backend')
    const sharedRoot = join(repositoryRoot, 'shared')
    const outputRoot = resolve(repositoryRoot, output)

    const backendDist = join(backendRoot, 'dist')
    const backendHost = join(backendRoot, 'host.json')
    const sharedDist = join(sharedRoot, 'dist')

    if (!existsSync(backendDist) || !existsSync(backendHost)) {
        throw new Error('backend must be built (backend/dist + backend/host.json) before packaging.')
    }
    if (!existsSync(sharedDist)) {
        throw new Error('shared must be built (shared/dist) before packaging backend.')
    }

    assertNoCompiledTests(backendDist, 'backend')
    assertNoCompiledTests(sharedDist, 'shared')

    const backendManifest = JSON.parse(readFileSync(join(backendRoot, 'package.json'), 'utf8'))
    const sharedManifest = JSON.parse(readFileSync(join(sharedRoot, 'package.json'), 'utf8'))

    log(`[package-backend] Staging standalone Function package at ${output}...`)
    rmSync(outputRoot, { recursive: true, force: true })
    mkdirSync(join(outputRoot, 'node_modules'), { recursive: true })

    cpSync(backendDist, join(outputRoot, 'dist'), { recursive: true })
    cpSync(backendHost, join(outputRoot, 'host.json'))
    writeFileSync(
        join(outputRoot, 'package.json'),
        `${JSON.stringify(createDeployManifest(backendManifest, sharedManifest.version), null, 2)}\n`
    )

    copyProductionClosure({
        repositoryRoot,
        backendRoot,
        sharedRoot,
        outputRoot,
        backendManifest,
        sharedManifest
    })

    const bundledSharedDir = join(outputRoot, 'node_modules', '@piquet-h', 'shared')
    rmSync(bundledSharedDir, { recursive: true, force: true })
    mkdirSync(bundledSharedDir, { recursive: true })
    cpSync(sharedDist, join(bundledSharedDir, 'dist'), { recursive: true })
    writeFileSync(join(bundledSharedDir, 'package.json'), `${JSON.stringify(createDeployManifest(sharedManifest), null, 2)}\n`)

    if (!skipNpmPrune) {
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
        const pruneResult = spawnSync(npmCmd, ['prune', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
            cwd: outputRoot,
            encoding: 'utf8',
            shell: process.platform === 'win32',
            stdio: 'inherit'
        })
        if (pruneResult.status !== 0) {
            throw new Error(`npm prune failed in ${outputRoot} with exit code ${pruneResult.status}`)
        }
    }

    assertStandaloneBackendPackage(outputRoot)
    log(`[package-backend] Standalone Function package ready at ${output}.`)
    return outputRoot
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    packageBackendFunction(parseArguments(process.argv.slice(2)))
}
