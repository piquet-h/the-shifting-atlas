#!/usr/bin/env node
/**
 * Old Player Cleanup Script
 *
 * Goal: Identify and optionally delete stale player documents from Cosmos DB SQL API.
 *
 * Safety:
 * - Dry-run by default; deletions require --confirm.
 * - Refuses destructive run against endpoints that look production unless --allow-prod-token.
 * - Defaults to deleting only explicitly guest players (guest === true) to reduce false positives.
 */

import { writeFile } from 'fs/promises'
import { createRequire } from 'module'

// ----------------------------
// Args
// ----------------------------

const args = process.argv.slice(2)

let mode = process.env.PERSISTENCE_MODE || 'memory'
let dryRun = true
let confirm = false
let allowProdToken = false

let cutoffDays = 90
let maxResults = 5000 // safety cap; use --max-results=all to scan all
let exportPath = null

// Eligibility filters
// Identity rule:
// - guest-like: externalId missing OR externalId is a GUID
// - linked: externalId present AND NOT a GUID
//
// Safety default: delete guest-like only.
let guestOnly = true
// Back-compat flag (deprecated): guest flag is no longer authoritative. Retained so old invocations don't error.
let assumeGuestWhenMissing = false
let includeLinked = false

// Timestamp selection
// - max: use max(updatedUtc,lastAction,createdUtc)
// - updatedUtc: prefer updatedUtc, fallback createdUtc
// - lastAction: prefer lastAction, fallback updatedUtc, fallback createdUtc
let strategy = 'max'

// Optional cascading cleanup
let deleteInventory = false

for (const arg of args) {
    if (arg.startsWith('--mode=')) {
        const m = arg.substring('--mode='.length)
        if (['memory', 'cosmos'].includes(m)) mode = m
    } else if (arg === '--confirm') {
        confirm = true
        dryRun = false
    } else if (arg === '--dry-run') {
        dryRun = true
        confirm = false
    } else if (arg === '--allow-prod-token') {
        allowProdToken = true
    } else if (arg.startsWith('--cutoff-days=')) {
        const n = parseInt(arg.substring('--cutoff-days='.length), 10)
        if (!Number.isNaN(n) && n >= 0) cutoffDays = n
    } else if (arg.startsWith('--max-results=')) {
        const v = arg.substring('--max-results='.length).trim()
        if (v === 'all') {
            maxResults = null
        } else {
            const n = parseInt(v, 10)
            if (!Number.isNaN(n) && n > 0) maxResults = n
        }
    } else if (arg.startsWith('--export=')) {
        exportPath = arg.substring('--export='.length)
    } else if (arg.startsWith('--strategy=')) {
        const s = arg.substring('--strategy='.length)
        if (['max', 'updatedUtc', 'lastAction'].includes(s)) strategy = s
    } else if (arg === '--guest-only') {
        guestOnly = true
        includeLinked = false
    } else if (arg === '--all-players') {
        guestOnly = false
        includeLinked = true
    } else if (arg === '--assume-guest-when-missing') {
        assumeGuestWhenMissing = true
    } else if (arg === '--include-linked') {
        includeLinked = true
        guestOnly = false
    } else if (arg === '--delete-inventory') {
        deleteInventory = true
    } else if (arg === '--help' || arg === '-h') {
        printHelp()
        process.exit(0)
    }
}

process.env.PERSISTENCE_MODE = mode

function printHelp() {
    console.log(
        `\nOld Player Cleanup Script\n\nUsage:\n  node scripts/cleanup-old-players.mjs [options]\n\nOptions:\n  --mode=memory|cosmos              Persistence mode (default env or memory)\n  --dry-run                         Preview only (default)\n  --confirm                         Perform deletions (requires safety checks)\n  --allow-prod-token                Override production endpoint safety block\n\n  --cutoff-days=N                   Players with last-seen older than N days are eligible (default: ${cutoffDays})\n  --strategy=max|updatedUtc|lastAction\n                                   Which timestamp to use for last-seen calculation (default: ${strategy})\n  --max-results=N|all               Cap scan (default: 5000; use 'all' to scan everything)\n  --export=path.json                Export candidates and summary to a JSON file\n\nEligibility:\n  --guest-only                      Only delete guest-like identities (default). Guest-like = externalId missing OR externalId is GUID\n  --assume-guest-when-missing        (deprecated; no-op)\n  --include-linked                   Also delete linked identities (externalId present and NOT GUID) (default: false)\n  --all-players                      Alias for --include-linked (risky; use with care)\n\nCascading:\n  --delete-inventory                 Also delete inventory items for deleted players\n\nExamples:\n  # Preview candidates older than 180 days\n  node scripts/cleanup-old-players.mjs --mode=cosmos --cutoff-days=180 --dry-run\n\n  # Delete guest-like players older than 180 days (inventory too)\n  node scripts/cleanup-old-players.mjs --mode=cosmos --cutoff-days=180 --delete-inventory --confirm\n\nNotes:\n  - This script uses Azure AD auth for Cosmos DB (DefaultAzureCredential).\n  - Ensure COSMOS_SQL_ENDPOINT and COSMOS_SQL_DATABASE are set and your identity has Cosmos DB data-plane RBAC roles.\n`
    )
}

function isLikelyProdEndpoint(endpoint) {
    if (!endpoint) return false
    const lowered = endpoint.toLowerCase()
    return /prod|primary/.test(lowered)
}

function createLimiter(limit) {
    const queue = []
    let active = 0
    async function run(fn) {
        if (active >= limit) {
            await new Promise((res) => queue.push(res))
        }
        active++
        try {
            return await fn()
        } finally {
            active--
            if (queue.length > 0) queue.shift()()
        }
    }
    return run
}

function safeParseIso(value) {
    if (!value || typeof value !== 'string') return null
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? null : ms
}

function computeLastSeenMs(doc) {
    const created = safeParseIso(doc.createdUtc)
    const updated = safeParseIso(doc.updatedUtc)
    const lastAction = safeParseIso(doc.lastAction)

    if (strategy === 'updatedUtc') {
        return updated ?? created
    }
    if (strategy === 'lastAction') {
        return lastAction ?? updated ?? created
    }

    // strategy === 'max'
    const candidates = [created, updated, lastAction].filter((x) => typeof x === 'number')
    if (candidates.length === 0) return null
    return Math.max(...candidates)
}

function isGuidString(value) {
    if (!value || typeof value !== 'string') return false
    // Accept UUID/GUID (v1-v5). Case-insensitive.
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())
}

function isGuestEligible(doc) {
    // Guest-like by identity rule: externalId missing or GUID.
    const externalId = doc?.externalId
    if (!externalId || typeof externalId !== 'string' || externalId.trim().length === 0) return true
    return isGuidString(externalId)
}

function isLinked(doc) {
    // Linked identity: externalId present and NOT GUID.
    const externalId = doc?.externalId
    if (!externalId || typeof externalId !== 'string' || externalId.trim().length === 0) return false
    return !isGuidString(externalId)
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════')
    console.log('  Old Player Cleanup')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(` Mode: ${mode}`)
    console.log(` Dry Run: ${dryRun}`)
    console.log(` Confirm: ${confirm}`)
    console.log(` Cutoff days: ${cutoffDays}`)
    console.log(` Strategy: ${strategy}`)
    console.log(` Guest-only: ${guestOnly}`)
    console.log(` Include linked: ${includeLinked}`)
    console.log(` Delete inventory: ${deleteInventory}`)
    console.log(` Max results: ${maxResults ?? 'all'}`)
    if (exportPath) console.log(` Export path: ${exportPath}`)
    console.log(` Timestamp: ${new Date().toISOString()}`)
    console.log()

    if (mode !== 'cosmos') {
        console.log('Memory mode: no remote Cosmos DB scan. Set --mode=cosmos to run.')
        return
    }

    const sqlEndpoint = process.env.COSMOS_SQL_ENDPOINT || process.env.COSMOS_SQL_ENDPOINT_TEST
    if (!sqlEndpoint) {
        console.error('❌ Missing COSMOS_SQL_ENDPOINT environment variable')
        process.exit(1)
    }

    const sqlDatabase = process.env.COSMOS_SQL_DATABASE
    if (!sqlDatabase) {
        console.error('❌ Missing COSMOS_SQL_DATABASE environment variable')
        process.exit(1)
    }

    const likelyProd = isLikelyProdEndpoint(sqlEndpoint)
    if (likelyProd && confirm && !allowProdToken) {
        console.error('❌ Refusing destructive cleanup against likely production endpoint without --allow-prod-token')
        process.exit(1)
    }

    const cutoffMs = Date.now() - cutoffDays * 86400000
    const cutoffIso = new Date(cutoffMs).toISOString()

    // Use backend's dependency tree so we don't require @azure/* deps in the repo root.
    const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url))
    const { CosmosClient } = backendRequire('@azure/cosmos')
    const { DefaultAzureCredential } = backendRequire('@azure/identity')

    const credential = new DefaultAzureCredential()
    const cosmosClient = new CosmosClient({ endpoint: sqlEndpoint, aadCredentials: credential })
    const database = cosmosClient.database(sqlDatabase)

    const playersContainerName = process.env.COSMOS_SQL_CONTAINER_PLAYERS || 'players'
    const inventoryContainerName = process.env.COSMOS_SQL_CONTAINER_INVENTORY || 'inventory'

    const playersContainer = database.container(playersContainerName)
    const inventoryContainer = deleteInventory ? database.container(inventoryContainerName) : null

    console.log(`[players] Scanning players container '${playersContainerName}' for docs older than ${cutoffIso} ...`)

    // Query for potentially old docs (filtering further client-side for safety)
    const baseWhere = [
        '(IS_DEFINED(c.updatedUtc) AND c.updatedUtc < @cutoff)',
        '(IS_DEFINED(c.lastAction) AND c.lastAction < @cutoff)',
        '(NOT IS_DEFINED(c.updatedUtc) AND NOT IS_DEFINED(c.lastAction) AND IS_DEFINED(c.createdUtc) AND c.createdUtc < @cutoff)'
    ].join(' OR ')

    // NOTE: Cosmos SQL doesn't support parameterized TOP. We cap client-side instead.
    const queryText = `SELECT c.id, c.createdUtc, c.updatedUtc, c.lastAction, c.guest, c.externalId, c.name FROM c WHERE (${baseWhere})`

    const parameters = [{ name: '@cutoff', value: cutoffIso }]

    const iterator = playersContainer.items.query(
        {
            query: queryText,
            parameters
        },
        {
            maxItemCount: 200
        }
    )

    const scanned = []
    while (iterator.hasMoreResults()) {
        const page = await iterator.fetchNext()
        if (page.resources) scanned.push(...page.resources)
        if (maxResults && scanned.length >= maxResults) {
            scanned.length = maxResults
            break
        }
    }

    // Apply safety filters
    const now = Date.now()
    const candidates = []
    const skipped = {
        notGuest: 0,
        linked: 0,
        noTimestamp: 0
    }

    for (const doc of scanned) {
        const lastSeenMs = computeLastSeenMs(doc)
        if (lastSeenMs == null) {
            skipped.noTimestamp++
            continue
        }

        if (lastSeenMs >= cutoffMs) continue

        if (!includeLinked && isLinked(doc)) {
            skipped.linked++
            continue
        }

        if (guestOnly && !isGuestEligible(doc)) {
            skipped.notGuest++
            continue
        }

        const identityKind = isLinked(doc) ? 'linked' : 'guest-like'

        candidates.push({
            id: doc.id,
            createdUtc: doc.createdUtc,
            updatedUtc: doc.updatedUtc,
            lastAction: doc.lastAction,
            guest: doc.guest,
            externalId: doc.externalId,
            identityKind,
            name: doc.name,
            lastSeenUtc: new Date(lastSeenMs).toISOString(),
            ageDays: Math.round(((now - lastSeenMs) / 86400000) * 10) / 10
        })
    }

    // Sort oldest first for readability
    candidates.sort((a, b) => (a.lastSeenUtc < b.lastSeenUtc ? -1 : a.lastSeenUtc > b.lastSeenUtc ? 1 : 0))

    console.log(`[players] scanned: ${scanned.length}${maxResults ? ' (capped)' : ''}`)
    console.log(`[players] candidates: ${candidates.length}`)
    console.log(`[players] skipped: notGuest=${skipped.notGuest}, linked=${skipped.linked}, noTimestamp=${skipped.noTimestamp}`)

    if (candidates.length > 0) {
        console.log('\nOldest 10 candidates:')
        for (const c of candidates.slice(0, 10)) {
            console.log(`  ${c.id}  lastSeen=${c.lastSeenUtc}  ageDays=${c.ageDays}  identity=${c.identityKind}`)
        }
    }

    const exportPayload = {
        run: {
            timestampUtc: new Date().toISOString(),
            mode,
            cutoffDays,
            cutoffIso,
            strategy,
            guestOnly,
            includeLinked,
            deleteInventory,
            maxResults: maxResults ?? 'all'
        },
        summary: {
            scannedCount: scanned.length,
            candidateCount: candidates.length,
            skipped
        },
        candidates
    }

    if (exportPath) {
        await writeFile(exportPath, JSON.stringify(exportPayload, null, 2), 'utf-8')
        console.log(`\nExported candidate list to: ${exportPath}`)
    }

    if (!confirm) {
        console.log('\nDry run complete. Re-run with --confirm to delete candidates.')
        return
    }

    console.log('\n[delete] Deleting candidates...')
    const limit = createLimiter(10)
    let deletedPlayers = 0
    let deletedInventoryItems = 0

    await Promise.all(
        candidates.map((c) =>
            limit(async () => {
                // Inventory first (optional), then player doc
                if (inventoryContainer) {
                    // Inventory PK: /playerId (per docs). Query within partition for efficiency.
                    const invIterator = inventoryContainer.items.query(
                        {
                            query: 'SELECT c.id, c.playerId FROM c WHERE c.playerId = @playerId',
                            parameters: [{ name: '@playerId', value: c.id }]
                        },
                        {
                            partitionKey: c.id,
                            maxItemCount: 200
                        }
                    )

                    const invItems = []
                    while (invIterator.hasMoreResults()) {
                        const page = await invIterator.fetchNext()
                        if (page.resources) invItems.push(...page.resources)
                    }

                    for (const item of invItems) {
                        const res = await inventoryContainer
                            .item(item.id, c.id)
                            .delete()
                            .catch((e) => {
                                if (e?.code === 404) return null
                                throw e
                            })
                        if (res) deletedInventoryItems++
                    }
                }

                const res = await playersContainer
                    .item(c.id, c.id)
                    .delete()
                    .catch((e) => {
                        // swallow 404
                        if (e?.code === 404) return null
                        throw e
                    })

                if (res) deletedPlayers++
            })
        )
    )

    console.log('Deletion complete:')
    console.log(`  players deleted:          ${deletedPlayers}`)
    console.log(`  inventory items deleted:  ${deletedInventoryItems}`)
}

main().catch((err) => {
    console.error('❌ Cleanup failed:', err?.stack || err)
    process.exit(1)
})
