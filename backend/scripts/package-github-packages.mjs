#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * ALTERNATIVE: Simplified Backend Packaging Script for GitHub Packages
 * 
 * This is a reference implementation showing how the packaging script could be simplified
 * if @atlas/shared is published to GitHub Packages instead of being vendored.
 * 
 * DO NOT USE THIS FILE YET - This is for future migration reference only.
 * Current production script: package.mjs
 * 
 * Benefits over current approach:
 * - ~50 lines shorter
 * - No manual vendoring logic
 * - Standard npm workflow
 * - Same package.json structure in dev and production
 * 
 * Requirements before switching:
 * 1. Set up .npmrc with GitHub Packages authentication
 * 2. Publish @atlas/shared to GitHub Packages
 * 3. Update backend/package.json to use version instead of file:
 * 4. Update CI/CD workflow to publish shared before building backend
 * 
 * See docs/backend-build-walkthrough.md for complete migration guide.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, '..')
const deployRoot = path.join(backendRoot, 'dist-deploy')

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
    // Clean and create deploy directory
    if (await exists(deployRoot)) {
        try {
            await fs.rm(deployRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
        } catch (err) {
            console.error('Failed to clean deployment directory:', err.message)
            process.exit(1)
        }
    }
    await fs.mkdir(deployRoot, { recursive: true })

    // Check compiled output exists
    const originalBuildOutput = path.join(backendRoot, 'dist', 'src')
    if (!(await exists(originalBuildOutput))) {
        console.error('Expected compiled backend output at dist/src. Did you run `npm run build -w backend`?')
        process.exit(1)
    }

    // Copy compiled code
    await fs.cp(originalBuildOutput, path.join(deployRoot, 'src'), { recursive: true })

    // Copy host.json
    await fs.copyFile(path.join(backendRoot, 'host.json'), path.join(deployRoot, 'host.json'))

    // Create deployment package.json
    const backendPkg = JSON.parse(await fs.readFile(path.join(backendRoot, 'package.json'), 'utf8'))
    const deployPkg = {
        name: backendPkg.name,
        version: backendPkg.version,
        private: backendPkg.private,
        type: backendPkg.type,
        // Strip "dist/" prefix from main field for deployment context
        main: backendPkg.main.replace(/^dist\//, ''),
        scripts: {
            start: 'func start',
            diagnostics: 'node -e "console.log(\'Diagnostics OK\')"'
        },
        engines: backendPkg.engines,
        // @atlas/shared will be installed from GitHub Packages as a normal dependency
        dependencies: backendPkg.dependencies
    }
    await fs.writeFile(path.join(deployRoot, 'package.json'), JSON.stringify(deployPkg, null, 2) + '\n', 'utf8')

    // Copy workspace package-lock.json for deterministic npm ci
    const workspaceRoot = path.resolve(backendRoot, '..')
    const workspaceLockFile = path.join(workspaceRoot, 'package-lock.json')
    if (await exists(workspaceLockFile)) {
        await fs.copyFile(workspaceLockFile, path.join(deployRoot, 'package-lock.json'))
    } else {
        console.warn('Warning: No package-lock.json found in workspace root.')
    }

    // Copy .npmrc for GitHub Packages authentication
    const npmrc = path.join(workspaceRoot, '.npmrc')
    if (await exists(npmrc)) {
        await fs.copyFile(npmrc, path.join(deployRoot, '.npmrc'))
    } else {
        console.warn('Warning: No .npmrc found. GitHub Packages authentication may fail.')
    }

    // Install production dependencies
    // With GitHub Packages, @atlas/shared is installed like any other npm package
    const hasLock = await exists(path.join(deployRoot, 'package-lock.json'))
    const installCmd = hasLock ? 'ci' : 'install'
    console.log(`Installing production dependencies using: npm ${installCmd}...`)
    await run('npm', [installCmd, '--omit=dev', '--no-audit', '--no-fund'], deployRoot)

    // Verify @atlas/shared was installed from GitHub Packages
    const sharedPkg = path.join(deployRoot, 'node_modules', '@atlas', 'shared')
    if (!(await exists(sharedPkg))) {
        console.error('Packaging failed: @atlas/shared not installed from GitHub Packages.')
        console.error('Make sure:')
        console.error('  1. @atlas/shared is published to GitHub Packages')
        console.error('  2. .npmrc is configured with proper authentication')
        console.error('  3. backend/package.json uses version (e.g., "^0.1.0") not file:')
        process.exit(1)
    }

    // Verify @azure/functions presence
    const functionsLib = path.join(deployRoot, 'node_modules', '@azure', 'functions')
    if (!(await exists(functionsLib))) {
        console.error('Packaging failed: @azure/functions not installed.')
        process.exit(1)
    }

    console.log('✅ Backend package prepared at dist-deploy/. Contents:')
    console.log('- host.json')
    console.log('- package.json (production only)')
    console.log('- node_modules (production deps including @atlas/shared from GitHub Packages)')
    console.log('- src/ (compiled functions)')
}

main().catch((err) => {
    console.error('Packaging error:', err)
    process.exit(1)
})
