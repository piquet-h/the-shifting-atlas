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
const distRoot = path.join(backendRoot, 'dist')

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
    // Preconditions: shared & backend already built (tsc). We assert dist/src exists.
    const backendSrcOut = path.join(distRoot, 'src')
    if (!(await exists(backendSrcOut))) {
        console.error('Expected compiled backend output at dist/src. Did you run `npm run build -w backend`?')
        process.exit(1)
    }

    // 1. Copy host.json → dist/host.json
    await fs.copyFile(path.join(backendRoot, 'host.json'), path.join(distRoot, 'host.json'))

    // 2. Create deployment package.json derived from backend/package.json
    const backendPkg = JSON.parse(await fs.readFile(path.join(backendRoot, 'package.json'), 'utf8'))
    const deployPkg = { ...backendPkg }
    // Remove workspace/file reference to shared (we vendor it)
    if (deployPkg.dependencies && deployPkg.dependencies['@atlas/shared']) {
        delete deployPkg.dependencies['@atlas/shared']
    }
    // Adjust main to point inside dist structure (optional but clearer)
    deployPkg.main = 'src/index.js'
    // Remove dev scripts not needed at runtime
    delete deployPkg.devDependencies
    // Slim scripts to only what might help in Kudu console
    deployPkg.scripts = {
        start: 'func start',
        diagnostics: 'node -e "console.log(\'Diagnostics OK\')"'
    }
    await fs.writeFile(path.join(distRoot, 'package.json'), JSON.stringify(deployPkg, null, 2) + '\n', 'utf8')

    // 3. Install production dependencies inside dist (excluding vendored shared)
    console.log('Installing production dependencies in dist...')
    await run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], distRoot)

    // 4. Vendor @atlas/shared AFTER npm install so it is not pruned
    const sharedDist = path.join(sharedRoot, 'dist')
    if (!(await exists(sharedDist))) {
        console.error('Expected shared build output at shared/dist. Did you run `npm run build -w shared`?')
        process.exit(1)
    }
    const vendoredSharedRoot = path.join(distRoot, 'node_modules', '@atlas', 'shared')
    await fs.mkdir(vendoredSharedRoot, { recursive: true })
    const sharedPkgRaw = JSON.parse(await fs.readFile(path.join(sharedRoot, 'package.json'), 'utf8'))
    const { name, version, type, main, types, exports: exp, browser, files } = sharedPkgRaw
    const sharedPkg = { name, version, type, main, types, exports: exp, browser, files }
    await fs.writeFile(path.join(vendoredSharedRoot, 'package.json'), JSON.stringify(sharedPkg, null, 2) + '\n', 'utf8')
    await fs.cp(sharedDist, path.join(vendoredSharedRoot, 'dist'), { recursive: true })

    // 5. Sanity check for @azure/functions presence & vendored shared
    const functionsLib = path.join(distRoot, 'node_modules', '@azure', 'functions')
    if (!(await exists(functionsLib))) {
        console.error('Packaging failed: @azure/functions not installed in dist.')
        process.exit(1)
    }
    if (!(await exists(path.join(vendoredSharedRoot, 'dist')))) {
        console.error('Packaging failed: vendored @atlas/shared missing.')
        process.exit(1)
    }

    console.log('✅ Backend package prepared at dist/. Contents:')
    console.log('- host.json')
    console.log('- package.json (production only)')
    console.log('- node_modules (production deps + vendored @atlas/shared)')
    console.log('- src/ (compiled functions)')
}

main().catch((err) => {
    console.error('Packaging error:', err)
    process.exit(1)
})
