#!/usr/bin/env node
/* eslint-env node */
/*
 * Shared ordering artifact utilities (build automation only).
 * DRY consolidation of repeated logic in ordering-related scripts:
 *  - Loading/parsing artifact JSON files
 *  - Time window filtering
 *  - Override detection (manual change within 24h of automation apply)
 *  - Pruning old artifacts
 *
 * IMPORTANT: Remains in scripts/shared (build layer). Do NOT import from game domain code.
 */

import { readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

/**
 * List artifact file metadata objects for a directory.
 * @param {string} dir Absolute or relative path to artifacts directory
 * @returns {Array<{name:string,path:string,mtime:Date}>}
 */
export function listArtifactFiles(dir) {
    try {
        return readdirSync(dir)
            .filter((f) => f.endsWith('.json'))
            .map((f) => {
                const path = join(dir, f)
                return { name: f, path, mtime: statSync(path).mtime }
            })
            .sort((a, b) => b.mtime - a.mtime)
    } catch (err) {
        console.error(`ordering-artifacts: Failed to list artifacts in ${dir}: ${err.message}`)
        return []
    }
}

/**
 * Parse artifact JSON files to objects, skipping invalid ones.
 * @param {Array<{name:string,path:string,mtime:Date}>} files
 * @returns {Array<object>} parsed artifacts with _filename/_mtime
 */
export function parseArtifacts(files) {
    const parsed = []
    for (const f of files) {
        try {
            const content = JSON.parse(readFileSync(f.path, 'utf-8'))
            parsed.push({ ...content, _filename: f.name, _mtime: f.mtime })
        } catch (err) {
            console.error(`ordering-artifacts: Skipping invalid artifact ${f.name}: ${err.message}`)
        }
    }
    return parsed
}

/**
 * Load artifacts optionally limited to a time window.
 * @param {string} dir Artifacts directory
 * @param {object} [opts]
 * @param {number} [opts.daysBack] Include only artifacts newer than now - daysBack (whole days)
 */
export function loadArtifacts(dir, opts = {}) {
    const { daysBack } = opts
    let files = listArtifactFiles(dir)
    if (daysBack && daysBack > 0) {
        const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000
        files = files.filter((f) => f.mtime.getTime() >= cutoff)
    }
    return parseArtifacts(files)
}

/**
 * Group artifacts by issue number property.
 * @param {Array<object>} artifacts
 * @returns {Map<number, Array<object>>}
 */
export function groupArtifactsByIssue(artifacts) {
    const map = new Map()
    for (const art of artifacts) {
        if (typeof art.issue !== 'number') continue
        if (!map.has(art.issue)) map.set(art.issue, [])
        map.get(art.issue).push(art)
    }
    return map
}

/**
 * Detect manual overrides: change in recommendedOrder within 24h after an applied artifact.
 * @param {Array<object>} artifacts
 * @returns {Array<object>} override events
 */
export function detectOverrides(artifacts) {
    const overrides = []
    const byIssue = groupArtifactsByIssue(artifacts)
    for (const [issueNumber, issueArtifacts] of byIssue.entries()) {
        issueArtifacts.sort((a, b) => new Date(b.metadata?.timestamp || 0) - new Date(a.metadata?.timestamp || 0))
        for (let i = 0; i < issueArtifacts.length - 1; i++) {
            const current = issueArtifacts[i]
            const previous = issueArtifacts[i + 1]
            if (!previous.applied) continue
            if (current.recommendedOrder === previous.recommendedOrder) continue
            const currentTime = new Date(current.metadata?.timestamp || 0)
            const previousTime = new Date(previous.metadata?.timestamp || 0)
            const hoursDiff = (currentTime - previousTime) / (1000 * 60 * 60)
            if (hoursDiff <= 24 && hoursDiff >= 0) {
                overrides.push({
                    issueNumber,
                    previousOrder: previous.recommendedOrder,
                    manualOrder: current.recommendedOrder,
                    hoursSinceAutomation: Math.round(hoursDiff * 10) / 10,
                    automationTimestamp: previous.metadata?.timestamp || 'unknown'
                })
            }
        }
    }
    return overrides
}

/**
 * Count overrides derived from artifacts array.
 * @param {Array<object>} artifacts
 */
export function countOverrides(artifacts) {
    return detectOverrides(artifacts).length
}

/**
 * Prune old artifact files keeping most recent N.
 * @param {string} dir
 * @param {number} keepCount
 */
export function pruneOldArtifacts(dir, keepCount = 200) {
    try {
        const files = listArtifactFiles(dir)
        if (files.length <= keepCount) return
        const toDelete = files.slice(keepCount)
        console.error(`Pruning ${toDelete.length} old artifact file(s) (keep=${keepCount})`)
        for (const f of toDelete) unlinkSync(f.path)
    } catch (err) {
        console.error(`ordering-artifacts: Failed to prune old artifacts: ${err.message}`)
    }
}

export default {
    listArtifactFiles,
    parseArtifacts,
    loadArtifacts,
    groupArtifactsByIssue,
    detectOverrides,
    countOverrides,
    pruneOldArtifacts
}
