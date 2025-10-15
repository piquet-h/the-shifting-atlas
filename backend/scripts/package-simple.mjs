#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * Simplified Backend Packaging Script
 *
 * Creates a deployment artifact in dist-deploy/ containing:
 *  - Compiled JS from dist/
 *  - host.json
 *  - package.json (production-only, with adjusted main field)
 *  - node_modules (production dependencies installed fresh)
 */
import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
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
    // Clean deploy directory
    if (await exists(deployRoot)) {
        await fs.rm(deployRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
    await fs.mkdir(deployRoot, { recursive: true })

    // Check compiled output exists
    const compiledFunctions = path.join(backendRoot, 'dist', 'functions')
    if (!(await exists(compiledFunctions))) {
        console.error('Error: Compiled output not found at dist/functions. Run "npm run build" first.')
        process.exit(1)
    }

    console.log('Copying compiled code...')
    await fs.cp(path.join(backendRoot, 'dist'), path.join(deployRoot, 'dist'), { recursive: true })

    console.log('Copying host.json...')
    await fs.copyFile(path.join(backendRoot, 'host.json'), path.join(deployRoot, 'host.json'))

    console.log('Creating deployment package.json...')
    const backendPkg = JSON.parse(await fs.readFile(path.join(backendRoot, 'package.json'), 'utf8'))
    const deployPkg = {
        name: backendPkg.name,
        version: backendPkg.version,
        private: backendPkg.private,
        type: backendPkg.type,
        main: backendPkg.main,
        scripts: {
            start: 'func start'
        },
        engines: backendPkg.engines,
        dependencies: backendPkg.dependencies
    }
    await fs.writeFile(path.join(deployRoot, 'package.json'), JSON.stringify(deployPkg, null, 2) + '\n', 'utf8')

    console.log('Installing production dependencies...')
    await run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], deployRoot)

    console.log('Verifying deployment artifact...')
    const functionsLib = path.join(deployRoot, 'node_modules', '@azure', 'functions')
    if (!(await exists(functionsLib))) {
        console.error('Error: @azure/functions not found in deployment artifact.')
        process.exit(1)
    }

    const sharedLib = path.join(deployRoot, 'node_modules', '@piquet-h', 'shared')
    const sharedStat = await fs.lstat(sharedLib).catch(() => null)
    if (!sharedStat || (!sharedStat.isDirectory() && !sharedStat.isSymbolicLink())) {
        console.error('Error: @piquet-h/shared not found in deployment artifact.')
        process.exit(1)
    }

    console.log('✅ Backend deployment artifact ready at dist-deploy/')
    console.log('  - dist/ (compiled functions)')
    console.log('  - host.json')
    console.log('  - package.json (production)')
    console.log('  - node_modules/ (production dependencies)')
}

main().catch((err) => {
    console.error('Packaging error:', err)
    process.exit(1)
})
