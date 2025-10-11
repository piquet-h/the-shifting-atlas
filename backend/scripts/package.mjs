#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * Backend packaging script
 * Goal: Produce a self-contained Azure Functions deployment payload in `dist/` containing:
 *  - Compiled JS (already emitted by tsc into dist/src)
 *  - host.json (copied)
 *  - package.json (production-only, with @atlas/shared inlined / vendored)
 *  - node_modules (production dependencies only + vendored @atlas/shared)
 *
 * We vendor @atlas/shared because the backend declares it as a workspace file dependency (file:../shared)
 * which will not exist inside the trimmed deployment artifact. We copy its built output & package.json
 * (with only fields necessary) directly into dist/node_modules/@atlas/shared.
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, '..')
const sharedRoot = path.resolve(backendRoot, '..', 'shared')
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
    // Remove workspace/file reference to shared (we vendor it)
    if (deployPkg.dependencies && deployPkg.dependencies['@atlas/shared']) {
        delete deployPkg.dependencies['@atlas/shared']
    }
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

    // 3. Copy workspace package-lock.json for deterministic npm ci
    const workspaceRoot = path.resolve(backendRoot, '..')
    const workspaceLockFile = path.join(workspaceRoot, 'package-lock.json')
    if (await exists(workspaceLockFile)) {
        await fs.copyFile(workspaceLockFile, path.join(deployRoot, 'package-lock.json'))
    } else {
        console.warn('Warning: No package-lock.json found in workspace root. Using npm install instead of npm ci.')
    }

    // 4. Install production dependencies inside deploy directory (deterministic with npm ci)
    const hasLock = await exists(path.join(deployRoot, 'package-lock.json'))
    const installCmd = hasLock ? 'ci' : 'install'
    console.log(`Installing production dependencies in deploy directory using: npm ${installCmd}...`)
    await run('npm', [installCmd, '--omit=dev', '--no-audit', '--no-fund'], deployRoot) // 5. Vendor @atlas/shared AFTER npm install so it is not pruned
    const sharedDist = path.join(sharedRoot, 'dist')
    if (!(await exists(sharedDist))) {
        console.error('Expected shared build output at shared/dist. Did you run `npm run build -w shared`?')
        process.exit(1)
    }
    const vendoredSharedRoot = path.join(deployRoot, 'node_modules', '@atlas', 'shared')
    await fs.mkdir(vendoredSharedRoot, { recursive: true })
    const sharedPkgRaw = JSON.parse(await fs.readFile(path.join(sharedRoot, 'package.json'), 'utf8'))
    const { name, version, type, main, types, exports: exp, browser, files } = sharedPkgRaw
    const sharedPkg = { name, version, type, main, types, exports: exp, browser, files }
    await fs.writeFile(path.join(vendoredSharedRoot, 'package.json'), JSON.stringify(sharedPkg, null, 2) + '\n', 'utf8')
    await fs.cp(sharedDist, path.join(vendoredSharedRoot, 'dist'), { recursive: true })

    // 6. Sanity check for @azure/functions presence & vendored shared
    const functionsLib = path.join(deployRoot, 'node_modules', '@azure', 'functions')
    if (!(await exists(functionsLib))) {
        console.error('Packaging failed: @azure/functions not installed in dist.')
        process.exit(1)
    }
    if (!(await exists(path.join(vendoredSharedRoot, 'dist')))) {
        console.error('Packaging failed: vendored @atlas/shared missing.')
        process.exit(1)
    }

    console.log('✅ Backend package prepared at dist-deploy/. Contents:')
    console.log('- host.json')
    console.log('- package.json (production only)')
    console.log('- node_modules (production deps + vendored @atlas/shared)')
    console.log('- src/ (compiled functions)')
}

main().catch((err) => {
    console.error('Packaging error:', err)
    process.exit(1)
})
