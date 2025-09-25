#!/usr/bin/env node
/**
 * Sync static (non-TS) Azure Functions assets into the build output directory.
 * Currently handles:
 *  - host.json (required by Functions runtime)
 *  - (future) proxies.json, extensions.json, etc.
 *
 * This script is idempotent and safe to run multiple times.
 */
import {cpSync, existsSync, mkdirSync} from 'node:fs'
import {resolve} from 'node:path'

const projectRoot = resolve(process.cwd())
const distDir = resolve(projectRoot, 'dist')
const assets = ['host.json']

function ensureDist() {
    if (!existsSync(distDir)) {
        mkdirSync(distDir, {recursive: true})
    }
}

function copyAsset(name) {
    const src = resolve(projectRoot, name)
    const dest = resolve(distDir, name)
    if (!existsSync(src)) {
        console.warn(`[sync-static] Skipping missing asset: ${name}`)
        return
    }
    cpSync(src, dest, {recursive: false})
    console.log(`[sync-static] Copied ${name} -> dist/${name}`)
}

;(function main() {
    ensureDist()
    assets.forEach(copyAsset)
    console.log('[sync-static] Complete.')
})()
