#!/usr/bin/env node
/**
 * Prepare API workspace for deployment when deploying the workspace root as api-location.
 * - Ensures production install done locally (caller responsible)
 * - Vendors the @atlas/shared workspace dependency (replaces symlink) with its built dist JS
 * - Optionally prunes dev-only artifacts from node_modules (light touch)
 */
/* eslint-env node */
/* global process */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Allow invocation from any CWD: derive apiRoot from script location
const scriptDir = dirname(fileURLToPath(import.meta.url))
const apiRoot = resolve(scriptDir, '..') // frontend/api
const sharedRoot = resolve(apiRoot, '../../shared')
const vendored = resolve(apiRoot, 'node_modules/@atlas/shared')
const sharedDist = resolve(sharedRoot, 'dist')

function ensureBuiltShared() {
    if (!existsSync(sharedDist)) {
        throw new Error('Shared package dist not found. Run root build first.')
    }
    if (!existsSync(resolve(sharedDist, 'index.js'))) {
        throw new Error('Shared dist missing index.js; build may have failed.')
    }
}

function vendorShared() {
    try {
        const stat = lstatSync(vendored)
        if (stat.isSymbolicLink()) {
            rmSync(vendored)
        } else {
            // remove existing dir to avoid stale files
            rmSync(vendored, { recursive: true, force: true })
        }
    } catch {
        // ignore missing
    }
    mkdirSync(vendored, { recursive: true })
    // Copy dist JS only
    cpSync(sharedDist, resolve(vendored, 'dist'), { recursive: true })
    // Minimal package.json for runtime resolution
    const pkgPath = resolve(sharedRoot, 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const minimal = {
        name: pkg.name,
        version: pkg.version || '0.0.0',
        type: pkg.type || 'module',
        main: 'dist/index.js',
        exports: {
            '.': './dist/index.js'
        }
    }
    writeFileSync(resolve(vendored, 'package.json'), JSON.stringify(minimal, null, 2))
    process.stdout.write('[prepare-deploy] Vendored @atlas/shared\n')
}

function main() {
    ensureBuiltShared()
    vendorShared()
    process.stdout.write('[prepare-deploy] API deploy folder ready.\n')
}

main()
