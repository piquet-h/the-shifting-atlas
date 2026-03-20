#!/usr/bin/env node

/**
 * @file check-catalog-events.mjs
 * @description Verifies that the telemetry event catalog stays in sync with GAME_EVENT_NAMES.
 *
 * Purpose:
 * - Prevent stale catalog entries (events documented in catalog but removed from code)
 * - Warn on undocumented events (events in code with no catalog entry) — expected for
 *   low-level/internal events; the catalog is intentionally curated, not exhaustive
 *
 * Single source of truth: GAME_EVENT_NAMES in shared/src/telemetryEvents.ts
 * The catalog at docs/observability/telemetry-catalog.md is a CURATED subset covering
 * the most operationally significant events. Not every registered event needs a catalog
 * entry; every catalog entry MUST exist in the code.
 *
 * Usage:
 *   node scripts/observability/check-catalog-events.mjs
 *   node scripts/observability/check-catalog-events.mjs --json
 *
 * Exit Codes:
 *   0 - No stale catalog entries found (undocumented events are warned, not errors)
 *   1 - Stale catalog entries found (documented events no longer exist in code)
 *
 * Risk: LOW (read-only, no mutations)
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT_DIR = join(__dirname, '../..')

const JSON_MODE = process.argv.includes('--json')

// ---------------------------------------------------------------------------
// Parse GAME_EVENT_NAMES from source (no compilation needed)
// ---------------------------------------------------------------------------
function parseCodeEvents() {
    const src = readFileSync(join(ROOT_DIR, 'shared/src/telemetryEvents.ts'), 'utf8')
    // Match PascalCase telemetry event name literals inside the GAME_EVENT_NAMES array.
    // Segments use [A-Z][a-zA-Z]* (not [a-z]*) because abbreviations like MCP, SQL, AI, DM, UI
    // are valid PascalCase in this domain. Requires two or three segments to avoid false positives.
    const matches = [...src.matchAll(/'([A-Z][a-zA-Z]*\.[A-Z][a-zA-Z]*(?:\.[A-Z][a-zA-Z]*)?)'/g)].map((m) => m[1])
    return new Set(matches)
}

// ---------------------------------------------------------------------------
// Parse documented event names from the catalog markdown
// ---------------------------------------------------------------------------
function parseCatalogEvents() {
    const catalog = readFileSync(join(ROOT_DIR, 'docs/observability/telemetry-catalog.md'), 'utf8')
    // Match #### `EventName` headings with strict PascalCase structure (two or three segments).
    // Segments use [A-Z][a-zA-Z]* to handle abbreviations (MCP, SQL, AI, DM, UI).
    // Skip the template placeholder `New.Event.Name`.
    const matches = [...catalog.matchAll(/^#### `([A-Z][a-zA-Z]*\.[A-Z][a-zA-Z]*(?:\.[A-Z][a-zA-Z]*)?)`/gm)]
        .map((m) => m[1])
        .filter((name) => name !== 'New.Event.Name')
    return new Set(matches)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const codeEvents = parseCodeEvents()
const catalogEvents = parseCatalogEvents()

// Events in catalog that no longer exist in code — these are ERRORS (stale docs)
const stale = [...catalogEvents].filter((e) => !codeEvents.has(e)).sort()

// Events in code with no catalog entry — these are WARNINGS (intentionally allowed)
const undocumented = [...codeEvents].filter((e) => !catalogEvents.has(e)).sort()

const result = {
    codeEventCount: codeEvents.size,
    catalogDocumentedCount: catalogEvents.size,
    staleCount: stale.length,
    undocumentedCount: undocumented.length,
    stale,
    undocumented,
    passed: stale.length === 0
}

if (JSON_MODE) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
} else {
    console.log('=== Telemetry Catalog ↔ Code Sync Check ===\n')
    console.log(`Source of truth : shared/src/telemetryEvents.ts  (${codeEvents.size} events)`)
    console.log(`Catalog (curated): docs/observability/telemetry-catalog.md  (${catalogEvents.size} documented)\n`)

    if (stale.length === 0) {
        console.log('✅  No stale catalog entries — every documented event exists in GAME_EVENT_NAMES.\n')
    } else {
        console.error(`❌  ${stale.length} stale catalog entry(ies) — documented but removed from GAME_EVENT_NAMES:`)
        stale.forEach((e) => console.error(`    - ${e}`))
        console.error('\n  Fix: remove or update the #### `EventName` heading(s) above from telemetry-catalog.md.\n')
    }

    if (undocumented.length > 0) {
        console.log(
            `ℹ️   ${undocumented.length} event(s) in code have no catalog entry (expected — the catalog is curated, not exhaustive).`
        )
        console.log('    Run with --json to see the full list.\n')
    }

    console.log(`Result: ${result.passed ? 'PASSED' : 'FAILED'}`)
}

process.exit(result.passed ? 0 : 1)
