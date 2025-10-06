#!/usr/bin/env node
/* eslint-env node */
// DEPRECATED: di-suitability.mjs retired.
console.error('di-suitability.mjs deprecated – no action performed.')
process.exit(0)
/* global process, console */
/**
 * DI Suitability Analyzer
 * Heuristically evaluates whether introducing a DI container (e.g., Inversify) may now add value.
 *
 * Signals / thresholds (tunable):
 *  - highImportFiles: files with > IMPORT_THRESHOLD internal imports (default 12)
 *  - complexParamFunctions: functions with > PARAM_THRESHOLD params (default 5)
 *  - contextPatternFiles: files referencing a context object name pattern (ctx|context|requestContext)
 *  - manualTelemetryEnrichment: occurrences of adding service/persistence/playerGuid fields manually instead of relying on wrapper
 *  - wrapperUsage: number of trackGameEvent/trackGameEventClient calls (informational)
 *
 * If (highImportFiles >= 5) OR (complexParamFunctions >= 5) OR (contextPatternFiles >= 5) we recommend a human review for DI.
 * The analyzer is intentionally conservative: it won't force adoption, just surfaces when complexity grows.
 */

import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['backend/src', 'frontend/api/src', 'frontend/src', 'shared/src']

const IMPORT_THRESHOLD = 12
const PARAM_THRESHOLD = 5
// Context threshold is set higher to avoid noisy recommendations on benign usage of 'context' variables.
const CONTEXT_THRESHOLD = 12 // previously 5; tuned after initial run

/** Simple recursive directory scan returning .ts/.tsx (excluding .d.ts & test files). */
function collectFiles(dir) {
    const absDir = path.join(ROOT, dir)
    if (!fs.existsSync(absDir)) return []
    const out = []
    const stack = [absDir]
    while (stack.length) {
        const current = stack.pop()
        const entries = fs.readdirSync(current, { withFileTypes: true })
        for (const e of entries) {
            const p = path.join(current, e.name)
            if (e.isDirectory()) {
                stack.push(p)
                continue
            }
            if (!/(\.tsx?|\.mts|\.cts)$/.test(e.name)) continue
            if (e.name.endsWith('.d.ts')) continue
            if (/test\.(tsx?|mts|cts)$/.test(e.name)) continue
            if (/\.test\./.test(e.name)) continue
            out.push(p)
        }
    }
    return out
}

function readFile(file) {
    return fs.readFileSync(file, 'utf8')
}

const metrics = {
    totalFiles: 0,
    highImportFiles: 0,
    complexParamFunctions: 0,
    contextPatternFiles: 0,
    manualTelemetryEnrichment: 0,
    wrapperUsage: 0,
    files: []
}

const contextRegex = /\b(ctx|context|requestContext)\b/
const functionParamRegex = /function\s+\w+\s*\(([^)]*)\)|(?:const|let|var)\s+\w+\s*=\s*\(([^)]*)\)\s*=>/g
const importRegex = /^import\s+[^;]+;$/gm
const internalImportPath = /from\s+['"](\.\.?\/[^'"\n]+)['"];?$/
const manualTelemetryPattern = /(playerGuid|service|persistenceMode)\s*:/g // naive, but OK for trend

for (const dir of SCAN_DIRS) {
    const files = collectFiles(dir)
    for (const file of files) {
        const rel = path.relative(ROOT, file)
        const content = readFile(file)
        const imports = content.match(importRegex) || []
        const internalImports = imports.filter((line) => internalImportPath.test(line))
        const importCount = internalImports.length
        let highImport = importCount > IMPORT_THRESHOLD

        // Count function param lengths
        let m
        let localComplexFunctions = 0
        while ((m = functionParamRegex.exec(content)) !== null) {
            const paramsRaw = (m[1] || m[2] || '').trim()
            if (!paramsRaw) continue
            // quick skip for arrow with destructuring { a, b }
            const paramList = paramsRaw
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            if (paramList.length > PARAM_THRESHOLD) {
                metrics.complexParamFunctions++
                localComplexFunctions++
            }
        }

        const hasContext = contextRegex.test(content)
        if (hasContext) metrics.contextPatternFiles++

        const wrapperCalls = (content.match(/trackGameEvent(Client)?\s*\(/g) || []).length
        metrics.wrapperUsage += wrapperCalls

        // Manual telemetry enrichment: look for object literal props + absence of wrapper in file but usage of Ai trackEvent would be caught by lint; we still approximate
        const manualTelemetryHits = (content.match(manualTelemetryPattern) || []).length
        if (manualTelemetryHits && !wrapperCalls) metrics.manualTelemetryEnrichment += manualTelemetryHits

        if (highImport) metrics.highImportFiles++

        metrics.files.push({
            file: rel,
            importCount,
            internalImports: importCount,
            localComplexFunctions,
            hasContext,
            wrapperCalls,
            manualTelemetryHits
        })
    }
}

metrics.totalFiles = metrics.files.length

// Derive recommendation
// Count how many independent risk signals exceeded their thresholds.
let riskSignals = 0
if (metrics.highImportFiles >= 5) riskSignals++
if (metrics.complexParamFunctions >= 5) riskSignals++
if (metrics.contextPatternFiles >= CONTEXT_THRESHOLD) riskSignals++
const recommendDI = riskSignals >= 2 // require at least two signals for robustness

const summary = {
    scannedAt: new Date().toISOString(),
    thresholds: { IMPORT_THRESHOLD, PARAM_THRESHOLD, CONTEXT_THRESHOLD },
    signals: {
        totalFiles: metrics.totalFiles,
        highImportFiles: metrics.highImportFiles,
        complexParamFunctions: metrics.complexParamFunctions,
        contextPatternFiles: metrics.contextPatternFiles,
        manualTelemetryEnrichment: metrics.manualTelemetryEnrichment,
        wrapperUsage: metrics.wrapperUsage
    },
    recommendation: recommendDI ? 'REVIEW_SUGGESTED' : 'NO_ACTION',
    rationale: recommendDI
        ? `Multiple (${riskSignals}) complexity signals exceeded thresholds. Consider manual DI container evaluation.`
        : 'Complexity below multi-signal threshold; continue with functional approach.'
}

// Output machine-readable JSON first
console.log('DI_ANALYSIS_JSON_START')
console.log(JSON.stringify(summary, null, 2))
console.log('DI_ANALYSIS_JSON_END')

// Human readable section
console.log('\n--- DI Suitability Summary ---')
console.log(`Files scanned: ${metrics.totalFiles}`)
console.log(`High import files (> ${IMPORT_THRESHOLD} internal imports): ${metrics.highImportFiles}`)
console.log(`Complex param functions (> ${PARAM_THRESHOLD} params): ${metrics.complexParamFunctions}`)
console.log(`Files referencing context identifiers: ${metrics.contextPatternFiles}`)
console.log(`Wrapper usage (trackGameEvent* calls): ${metrics.wrapperUsage}`)
console.log(`Manual telemetry enrichment (approx occurrences): ${metrics.manualTelemetryEnrichment}`)
console.log(
    'Recommendation:',
    summary.recommendation === 'REVIEW_SUGGESTED' ? 'Consider evaluating DI – multiple thresholds crossed.' : 'DI not indicated yet.'
)
console.log('Rationale:', summary.rationale)

// Exit success always (non-blocking informative tool)
process.exit(0)
