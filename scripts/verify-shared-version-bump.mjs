#!/usr/bin/env node
/*
 * Guard Script: Detect improper cross-package shared version bump.
 * Fails when ALL are true:
 *  1. shared/package.json version changed in this diff
 *  2. shared/src has changes
 *  3. backend/src has changes
 *  4. backend/package.json NOT changed (i.e., backend not prepared to consume new version)
 * Rationale: Enforce two-stage workflow (publish shared first, then backend integration).
 * Safe no-op if git diff base is not available (CI should supply a base ref).
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'

function sh(cmd) {
    try {
        return execSync(cmd, { stdio: 'pipe' }).toString().trim()
    } catch {
        return ''
    }
}

// Determine base reference: prefer environment-provided, fallback to origin/main.
const baseRef = process.env.GIT_BASE_REF || 'origin/main'
let diffList = ''
try {
    // name-status for efficiency; fallback to name-only if needed.
    diffList = sh(`git diff --name-only ${baseRef}...HEAD`)
} catch {
    // If this fails (e.g., shallow clone), degrade gracefully.
    console.log('[verify-shared-version-bump] Unable to compute diff against base; skipping check.')
    process.exit(0)
}

if (!diffList) {
    console.log('[verify-shared-version-bump] Empty diff; nothing to check.')
    process.exit(0)
}

const files = diffList.split(/\n+/).filter(Boolean)
const changed = new Set(files)

const changedSharedVersion = changed.has('shared/package.json')
const sharedSrcChanged = files.some((f) => f.startsWith('shared/src/'))
const backendSrcChanged = files.some((f) => f.startsWith('backend/src/'))
const backendPkgChanged = changed.has('backend/package.json')

if (changedSharedVersion && sharedSrcChanged && backendSrcChanged && !backendPkgChanged) {
    // Extra heuristic: ensure version actually modified (not just formatting)
    try {
        const basePkgRaw = sh(`git show ${baseRef}:shared/package.json`)
        const headPkgRaw = fs.readFileSync('shared/package.json', 'utf8')
        const baseVersion = JSON.parse(basePkgRaw).version
        const headVersion = JSON.parse(headPkgRaw).version
        if (baseVersion !== headVersion) {
            console.error('\n❌ Shared version bump detected alongside backend src changes without backend/package.json update.')
            console.error('   This violates cross-package split policy (publish shared first, then consume).')
            console.error(`   Base version: ${baseVersion}  Head version: ${headVersion}`)
            console.error('\n   Fix:')
            console.error('   1. Revert shared/package.json version change in this PR, OR')
            console.error(
                '   2. Remove backend changes and publish shared-only PR, wait for publish, then update backend/package.json in follow-up PR.'
            )
            process.exit(1)
        }
    } catch (err) {
        console.warn('[verify-shared-version-bump] Could not parse versions for comparison; failing safe.', err)
        process.exit(1)
    }
}

console.log('[verify-shared-version-bump] OK – no invalid cross-package version bump pattern detected.')
