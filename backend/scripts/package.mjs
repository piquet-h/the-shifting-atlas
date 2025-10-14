#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * Backend packaging script
 * Goal: Produce a self-contained Azure Functions deployment payload in `dist/` containing:
 *  - Compiled JS (already emitted by tsc into dist/src)
 *  - host.json (copied)
 *  - package.json (production-only)
 *  - node_modules (production dependencies only fetched from registry, including @piquet-h/shared)
 *
 * NOTE (2025-10-13): Previous implementation vendored the shared package due to a file: workspace dependency.
 * After renaming and publishing as @piquet-h/shared (registry dependency), vendoring is removed.
 * The dependency is installed normally via npm ci, simplifying the artifact.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, '..')
const deployRoot = path.join(backendRoot, 'dist-deploy') // Separate deploy directory

async function exists(p) {
    try {
        await fs.access(p)
        return true
    } catch {
        return false
    }
}

async function run(cmd, args, cwd) {
    await new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: false })
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))))
    })
}

async function main() {
    // Ensure completely clean deploy directory for npm ci (with retry for stubborn files)
    if (await exists(deployRoot)) {
        try {
            await fs.rm(deployRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
        } catch (err) {
            console.warn(`Warning: Could not fully clean ${deployRoot}: ${err.message}. Attempting to continue...`)
            // Try to at least clear the main contents we care about
            try {
                await fs.rm(path.join(deployRoot, 'node_modules'), { recursive: true, force: true })
                await fs.rm(path.join(deployRoot, 'package.json'), { force: true })
                await fs.rm(path.join(deployRoot, 'package-lock.json'), { force: true })
            } catch {
                // If we still can't clean, fail fast
                console.error('Failed to clean deployment directory. Please manually remove backend/dist-deploy/')
                process.exit(1)
            }
        }
    }
    await fs.mkdir(deployRoot, { recursive: true })

    // Preconditions: shared & backend already built (tsc). Check original build output exists.
    const originalBuildOutput = path.join(backendRoot, 'dist', 'src')
    if (!(await exists(originalBuildOutput))) {
        console.error('Expected compiled backend output at dist/src. Did you run `npm run build -w backend`?')
        process.exit(1)
    }
    // Copy compiled output to clean deploy directory
    await fs.cp(originalBuildOutput, path.join(deployRoot, 'src'), { recursive: true })

    // 1. Copy host.json → deploy/host.json
    await fs.copyFile(path.join(backendRoot, 'host.json'), path.join(deployRoot, 'host.json')) // 2. Create deployment package.json derived from backend/package.json
    const backendPkg = JSON.parse(await fs.readFile(path.join(backendRoot, 'package.json'), 'utf8'))
    const deployPkg = { ...backendPkg }
    // Retain @piquet-h/shared dependency so npm ci installs it from GitHub Packages
    // Preserve the main entry point pattern for Azure Functions discovery
    // IMPORTANT: This transformation is intentional and correct (not drift):
    // - Development (backend/package.json): "main": "dist/src/**/*.js"
    //   Functions are at: backend/dist/src/functions/*.js
    // - Deployment (dist-deploy/package.json): "main": "src/**/*.js"
    //   Functions are at: dist-deploy/src/functions/*.js (no nested dist/)
    // We strip "dist/" because the deployment artifact has a flatter structure.
    if (deployPkg.main && deployPkg.main.startsWith('dist/')) {
        deployPkg.main = deployPkg.main.substring(5) // Remove "dist/" prefix
    }
    // Remove dev scripts not needed at runtime
    delete deployPkg.devDependencies
    // Slim scripts to only what might help in Kudu console
    deployPkg.scripts = {
        start: 'func start',
        diagnostics: 'node -e "console.log(\'Diagnostics OK\')"'
    }
    await fs.writeFile(path.join(deployRoot, 'package.json'), JSON.stringify(deployPkg, null, 2) + '\n', 'utf8')

    // 3. Install other production dependencies first (excluding @piquet-h/shared)
    // The workspace package-lock.json contains workspace links which would cause issues.

    // Temporarily remove @piquet-h/shared from dependencies to avoid registry fetch
    const tempPkgJson = JSON.parse(await fs.readFile(path.join(deployRoot, 'package.json'), 'utf8'))
    delete tempPkgJson.dependencies['@piquet-h/shared']
    await fs.writeFile(path.join(deployRoot, 'package.json'), JSON.stringify(tempPkgJson, null, 2), 'utf8')

    console.log('Installing production dependencies (excluding @piquet-h/shared)...')
    await run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], deployRoot)

    // Now manually vendor the shared package since it's not available in public npm registry
    const sharedBuildOutput = path.resolve(backendRoot, '..', 'shared', 'dist')
    if (!(await exists(sharedBuildOutput))) {
        console.error('Expected built shared package at ../shared/dist. Did you run `npm run build -w shared`?')
        process.exit(1)
    }

    // Create a local node_modules/@piquet-h/shared with the built content
    const deploySharedDir = path.join(deployRoot, 'node_modules', '@piquet-h', 'shared')
    await fs.mkdir(deploySharedDir, { recursive: true })

    // Copy the built dist content to the deployed shared package
    await fs.cp(sharedBuildOutput, path.join(deploySharedDir, 'dist'), { recursive: true })

    // Copy the package.json for the shared package
    const sharedPkgJson = path.resolve(backendRoot, '..', 'shared', 'package.json')
    await fs.copyFile(sharedPkgJson, path.join(deploySharedDir, 'package.json'))

    // Restore the original package.json with @piquet-h/shared dependency
    await fs.writeFile(path.join(deployRoot, 'package.json'), JSON.stringify(deployPkg, null, 2) + '\n', 'utf8')

    // 6. Sanity check for @azure/functions presence & vendored shared
    const functionsLib = path.join(deployRoot, 'node_modules', '@azure', 'functions')
    if (!(await exists(functionsLib))) {
        console.error('Packaging failed: @azure/functions not installed in dist.')
        process.exit(1)
    }
    // Verify shared package installed
    const sharedInstalled = path.join(deployRoot, 'node_modules', '@piquet-h', 'shared')
    if (!(await exists(sharedInstalled))) {
        console.error('Packaging failed: @piquet-h/shared not installed (registry fetch failed).')
        process.exit(1)
    }

    console.log('✅ Backend package prepared at dist-deploy/. Contents:')
    console.log('- host.json')
    console.log('- package.json (production only)')
    console.log('- node_modules (production deps including @piquet-h/shared)')
    console.log('- src/ (compiled functions)')
}

main().catch((err) => {
    console.error('Packaging error:', err)
    process.exit(1)
})
