#!/usr/bin/env node
/* eslint-env node */
/** Monorepo cleaner.
 * Usage: node scripts/clean.mjs [--here|--all]
 *  --here (default) cleans current workspace
 *  --all cleans every workspace from root package.json
 * Removes: dist, .cache, coverage, *.tsbuildinfo (workspace root).
 */
import {existsSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync} from 'fs'
import process from 'node:process'
import path from 'path'
import {fileURLToPath} from 'url'

const CWD = process.cwd()
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const args = new Set(process.argv.slice(2))
const modeAll = args.has('--all')
const modeHere = args.has('--here') || !modeAll

const DIRS = ['dist', '.cache', 'coverage']

function log(msg) {
    process.stdout.write(`[clean] ${msg}\n`)
}
function warn(msg) {
    process.stderr.write(`[clean] WARN ${msg}\n`)
}

function cleanWorkspace(wsPath) {
    try {
        const abs = path.resolve(wsPath)
        DIRS.forEach((d) => {
            const target = path.join(abs, d)
            if (existsSync(target)) {
                rmSync(target, {recursive: true, force: true})
                log(`removed ${path.relative(CWD, target)}`)
            }
        })
        readdirSync(abs).forEach((f) => {
            if (f.endsWith('.tsbuildinfo')) {
                const p = path.join(abs, f)
                try {
                    unlinkSync(p)
                    log(`removed ${path.relative(CWD, p)}`)
                } catch (e) {
                    warn(`failed remove ${p}: ${e.message}`)
                }
            }
        })
    } catch (e) {
        warn(`error cleaning ${wsPath}: ${e.message}`)
    }
}

function findRepoRoot(startDir) {
    let dir = startDir
    while (dir !== path.parse(dir).root) {
        const pkgPath = path.join(dir, 'package.json')
        if (existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(String(readFileSync(pkgPath)))
                if (pkg.name === 'the-shifting-atlas-root') return dir
            } catch {
                /* ignore */
            }
        }
        dir = path.dirname(dir)
    }
    return null
}

if (modeAll) {
    const root = findRepoRoot(__dirname)
    if (!root) {
        warn('could not locate repo root for --all; falling back to --here')
    } else {
        const pkg = JSON.parse(String(readFileSync(path.join(root, 'package.json'))))
        const workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : []
        log(`cleaning all workspaces: ${workspaces.join(', ')}`)
        workspaces.forEach((pattern) => {
            const wsPath = path.join(root, pattern)
            if (existsSync(wsPath) && statSync(wsPath).isDirectory()) cleanWorkspace(wsPath)
        })
    }
}

if (modeHere) {
    cleanWorkspace(CWD)
}
