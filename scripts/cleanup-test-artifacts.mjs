#!/usr/bin/env node
/**
 * Test Artifact Cleanup & Migration Script
 * Identify and optionally remove test-created data from Cosmos DB (SQL + Gremlin) with safety interlocks and dry-run preview. Supports export for migration. Dry-run is default; --confirm required for deletions. Safety: refuses to run with --confirm if endpoint host matches known prod and no --allow-prod-token.
 */

import { writeFile } from 'fs/promises'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

// Arg parsing
const args = process.argv.slice(2)
let mode = process.env.PERSISTENCE_MODE || 'memory'
let dryRun = true
let confirm = false
let exportPath = null
let containersFilter = null
let concurrency = 10
let allowProdToken = false
let customPlayerPrefixes = []
let excludePrefixes = []
let gremlinScan = false
let gremlinLimit = 5000
let eventRetentionDays = null
let playerMinAgeDays = 0

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
    } else if (arg.startsWith('--export=')) {
        exportPath = arg.substring('--export='.length)
    } else if (arg.startsWith('--containers=')) {
        containersFilter = arg
            .substring('--containers='.length)
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean)
    } else if (arg.startsWith('--concurrency=')) {
        const c = parseInt(arg.substring('--concurrency='.length), 10)
        if (!Number.isNaN(c) && c > 0) concurrency = c
    } else if (arg.startsWith('--player-prefixes=')) {
        customPlayerPrefixes = arg
            .substring('--player-prefixes='.length)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
    } else if (arg.startsWith('--exclude-prefixes=')) {
        excludePrefixes = arg
            .substring('--exclude-prefixes='.length)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
    } else if (arg === '--gremlin-scan') {
        gremlinScan = true
    } else if (arg.startsWith('--gremlin-limit=')) {
        const gl = parseInt(arg.substring('--gremlin-limit='.length), 10)
        if (!Number.isNaN(gl) && gl > 0) gremlinLimit = gl
    } else if (arg.startsWith('--event-retention-days=')) {
        const rd = parseInt(arg.substring('--event-retention-days='.length), 10)
        if (!Number.isNaN(rd) && rd >= 0) eventRetentionDays = rd
    } else if (arg.startsWith('--player-min-age-days=')) {
        const pd = parseInt(arg.substring('--player-min-age-days='.length), 10)
        if (!Number.isNaN(pd) && pd >= 0) playerMinAgeDays = pd
    } else if (arg === '--allow-prod-token') {
        allowProdToken = true
    } else if (arg === '--help' || arg === '-h') {
        printHelp()
        process.exit(0)
    }
}

process.env.PERSISTENCE_MODE = mode

function printHelp() {
    console.log(
        `\nTest Artifact Cleanup & Migration Script\n\nUsage:\n  node scripts/cleanup-test-artifacts.mjs [options]\n\nOptions:\n  --mode=memory|cosmos            Persistence mode (default env or memory)\n  --dry-run                       Preview (default)\n  --confirm                       Perform deletions (requires safety checks)\n  --containers=a,b,c              Limit to specific SQL containers\n  --export=path.json              Write matched artifact metadata before deletion\n  --player-prefixes=a,b           Additional STRONG player ID prefixes (high confidence)\n  --exclude-prefixes=a,b          Remove default prefixes from classification set\n  --player-min-age-days=N         Minimum age in days for player deletion eligibility (default 0)\n  --event-retention-days=N        Report worldEvents older than N days (never deleted by this script)\n  --gremlin-scan                  Enable Gremlin vertex/edge prefix scan (read-only)\n  --gremlin-limit=N               Max vertices/edges sampled for scan (default 5000)\n  --concurrency=N                 Parallel delete limit (default 10)\n  --allow-prod-token              Override host safety interlock (explicit)\n  --help, -h                      Show help\n\nClassification Tiers:\n  strong: explicit test prefixes (low false-positive risk)\n  weak: generic prefixes (test-, qa-, perf-) validated by short lowercase tail heuristic\n\nSafety Interlocks:\n  - Refuses deletion if endpoint appears production (heuristic) without --allow-prod-token\n  - Always requires --confirm for destructive actions\n\nDry Run Output Enhancements:\n  - Player age classification (eligible vs too-young)\n  - Strong vs weak tier counts\n  - Retention candidates for worldEvents (reported only)\n  - Gremlin vertex/edge test prefix counts when enabled\n`
    )
}

// Treat hosts containing 'prod' or 'primary' as production
function isLikelyProdEndpoint(endpoint) {
    if (!endpoint) return false
    const lowered = endpoint.toLowerCase()
    return /prod|primary/.test(lowered)
}

// Concurrency limiter
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

// Patterns
const DEFAULT_TEST_ID_PREFIXES = ['test-loc-', 'e2e-test-loc-', 'e2e-', 'test-player-', 'demo-player-']
const WEAK_PREFIXES = ['test-', 'qa-', 'perf-']

function buildPrefixSets() {
    const strong = DEFAULT_TEST_ID_PREFIXES.filter((p) => !excludePrefixes.includes(p)).concat(
        customPlayerPrefixes.filter((p) => p && !excludePrefixes.includes(p))
    )
    const weak = WEAK_PREFIXES.filter((p) => !excludePrefixes.includes(p))
    return { strong, weak }
}
const PREFIX_SETS = buildPrefixSets()

function classifyTestId(id) {
    if (!id || typeof id !== 'string') return { isTest: false, tier: null, prefixMatched: null }
    for (const p of PREFIX_SETS.strong) {
        if (id.startsWith(p)) return { isTest: true, tier: 'strong', prefixMatched: p }
    }
    for (const p of PREFIX_SETS.weak) {
        if (id.startsWith(p)) {
            const tail = id.substring(p.length)
            const shortTail = tail.length <= 20
            const noUpper = !/[A-Z]/.test(tail)
            if (shortTail && noUpper) return { isTest: true, tier: 'weak', prefixMatched: p }
        }
    }
    return { isTest: false, tier: null, prefixMatched: null }
}
function isTestId(id) {
    return classifyTestId(id).isTest
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════')
    console.log('  Test Artifact Cleanup & Migration')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(` Mode: ${mode}`)
    console.log(` Dry Run: ${dryRun}`)
    console.log(` Confirm: ${confirm}`)
    console.log(` Concurrency: ${concurrency}`)
    if (containersFilter) console.log(` Containers filter: ${containersFilter.join(', ')}`)
    if (exportPath) console.log(` Export path: ${exportPath}`)
    console.log(` Timestamp: ${new Date().toISOString()}`)
    console.log()

    if (mode !== 'cosmos') {
        console.log('Memory mode: classification only (no remote deletes).')
        console.log('Nothing to do.')
        return
    }

    const sqlEndpoint = process.env.COSMOS_SQL_ENDPOINT || process.env.COSMOS_SQL_ENDPOINT_TEST
    if (!sqlEndpoint) {
        console.error('❌ Missing COSMOS_SQL_ENDPOINT environment variable')
        process.exit(1)
    }
    const likelyProd = isLikelyProdEndpoint(sqlEndpoint)
    if (likelyProd && confirm && !allowProdToken) {
        console.error('❌ Refusing to run destructive cleanup against likely production endpoint without --allow-prod-token')
        process.exit(1)
    }

    // Dynamic import of built backend (expects build done)
    try {
        // Use backend's dependency context (similar pattern to mosswell-migration script)
        const { createRequire } = await import('module')
        const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url))
        backendRequire('reflect-metadata')
        const { Container } = backendRequire('inversify')
        const { setupContainer } = await import('../backend/dist/inversify.config.js')
        const container = new Container()
        await setupContainer(container, 'cosmos')

        // Resolve repositories we can inspect
        const playerDocRepo = container.get('IPlayerDocRepository')
        const inventoryRepo = container.get('IInventoryRepository')
        const worldEventRepo = container.get('IWorldEventRepository')
        const descriptionRepo = container.get('IDescriptionRepository')
        let gremlinClient = null
        if (gremlinScan) {
            try {
                gremlinClient = container.get('GremlinClient')
            } catch {
                console.log('Gremlin client not bound; skipping gremlin scan')
            }
        }

        const selected = (name) => !containersFilter || containersFilter.includes(name)
        const artifacts = { players: [], inventory: [], worldEvents: [], descriptionLayers: [] }

        // PlayerDocs: fallback to recent events if no list API. Robust cleanup would require a scanning query (not implemented).
        if (selected('players')) {
            console.log('[players] Listing player IDs by prefixes ...')
            let ids = []
            if ('listPlayerIdsByPrefixes' in playerDocRepo) {
                // Only strong prefixes for direct query to avoid broad weak scans
                ids = await playerDocRepo.listPlayerIdsByPrefixes(PREFIX_SETS.strong, 5000)
            } else {
                console.log('  (fallback) repository lacks listPlayerIdsByPrefixes; using worldEvent inference')
                const recent = await worldEventRepo.getRecent(500)
                const candidateIds = new Set()
                for (const evt of recent) {
                    if (evt.actorPlayerId && isTestId(evt.actorPlayerId)) candidateIds.add(evt.actorPlayerId)
                    if (evt.scopeKey && /player:/.test(evt.scopeKey)) {
                        const pid = evt.scopeKey.split(':')[1]
                        if (isTestId(pid)) candidateIds.add(pid)
                    }
                }
                ids = [...candidateIds]
            }
            // Fetch docs for age classification
            const now = Date.now()
            for (const pid of ids) {
                const doc = await playerDocRepo.getPlayer(pid)
                if (!doc) continue
                const created = Date.parse(doc.createdUtc || doc.updatedUtc || '') || now
                const ageDays = (now - created) / 86400000
                const ageEligible = ageDays >= playerMinAgeDays
                const cls = classifyTestId(pid)
                artifacts.players.push({ id: pid, ageDays: Math.round(ageDays * 10) / 10, ageEligible, tier: cls.tier })
            }
        }

        if (selected('inventory')) {
            console.log('[inventory] Listing items for inferred test players ...')
            for (const p of artifacts.players) {
                const items = await inventoryRepo.listItems(p.id)
                for (const item of items) {
                    artifacts.inventory.push({ id: item.id, playerId: item.playerId })
                }
            }
        }

        if (selected('worldEvents')) {
            console.log('[worldEvents] Querying recent events for test scopeKeys + retention ...')
            const recent = await worldEventRepo.getRecent(2000)
            const now = Date.now()
            for (const evt of recent) {
                const scopeMatch = evt.scopeKey && /test|e2e/.test(evt.scopeKey)
                const idClass = classifyTestId(evt.eventId)
                const idMatch = idClass.isTest
                const createdTs = Date.parse(evt.createdUtc || '') || now
                const ageDays = (now - createdTs) / 86400000
                const retentionCandidate = eventRetentionDays != null && ageDays >= eventRetentionDays
                if (scopeMatch || idMatch || retentionCandidate) {
                    artifacts.worldEvents.push({
                        id: evt.eventId,
                        scopeKey: evt.scopeKey,
                        ageDays: Math.round(ageDays * 10) / 10,
                        retentionCandidate
                    })
                }
            }
        }
        // Gremlin scan (read-only)
        let gremlinSummary = null
        if (gremlinClient) {
            console.log('[gremlin] Scanning vertices/edges (sample) ...')
            try {
                const vertexResult = await gremlinClient.submit(`g.V().limit(${gremlinLimit}).id()`) // returns list of IDs
                const edgeResult = await gremlinClient.submit(`g.E().limit(${gremlinLimit}).id()`) // returns list of IDs
                const vertices = Array.isArray(vertexResult) ? vertexResult : vertexResult._items || vertexResult._value || []
                const edges = Array.isArray(edgeResult) ? edgeResult : edgeResult._items || edgeResult._value || []
                const vertexMatches = vertices.filter((v) => isTestId(String(v)))
                const edgeMatches = edges.filter((e) => isTestId(String(e)))
                gremlinSummary = {
                    sampledVertices: vertices.length,
                    sampledEdges: edges.length,
                    vertexMatches: vertexMatches.length,
                    edgeMatches: edgeMatches.length,
                    vertexMatchSamples: vertexMatches.slice(0, 10),
                    edgeMatchSamples: edgeMatches.slice(0, 10)
                }
            } catch (e) {
                console.log('  (gremlin scan failed):', e.message)
            }
        }

        if (selected('descriptionLayers')) {
            console.log('[descriptionLayers] Collecting layers by scanning player-inferred locations (placeholder).')
            // Current repo is in-memory stub in cosmos; skip deep scan.
        }

        const summary = Object.fromEntries(Object.entries(artifacts).map(([k, v]) => [k, v.length]))
        console.log('\nSummary Counts:')
        for (const [k, v] of Object.entries(summary)) {
            console.log(`  ${k}: ${v}`)
        }
        if (artifacts.players.length) {
            const eligible = artifacts.players.filter((p) => p.ageEligible).length
            console.log(`  players age-eligible (>= ${playerMinAgeDays}d): ${eligible}`)
            const strongCount = artifacts.players.filter((p) => p.tier === 'strong').length
            const weakCount = artifacts.players.filter((p) => p.tier === 'weak').length
            console.log(`  players strong-tier: ${strongCount}`)
            console.log(`  players weak-tier:   ${weakCount}`)
        }
        if (eventRetentionDays != null) {
            const retentionCount = artifacts.worldEvents.filter((e) => e.retentionCandidate).length
            console.log(`  worldEvents retention candidates (>= ${eventRetentionDays}d): ${retentionCount}`)
        }
        if (gremlinSummary) {
            console.log('\nGremlin Scan:')
            console.log(`  vertices sampled: ${gremlinSummary.sampledVertices}`)
            console.log(`  edges sampled:    ${gremlinSummary.sampledEdges}`)
            console.log(`  vertex matches:   ${gremlinSummary.vertexMatches}`)
            console.log(`  edge matches:     ${gremlinSummary.edgeMatches}`)
        }

        if (exportPath) {
            const fullPath = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', exportPath)
            await writeFile(
                fullPath,
                JSON.stringify(
                    {
                        generatedUtc: new Date().toISOString(),
                        playerMinAgeDays,
                        eventRetentionDays,
                        gremlinScan,
                        artifacts,
                        gremlinSummary
                    },
                    null,
                    2
                )
            )
            console.log(`\nExported artifacts to ${fullPath}`)
        }

        if (dryRun) {
            console.log('\nDry run complete. Use --confirm to delete.\n')
            return
        }

        console.log('\nStarting deletions...')
        const limit = createLimiter(concurrency)
        let deletedCounts = { players: 0, inventory: 0 }

        // Players first (will cascade semantics for inventory because items keyed by playerId)
        if (selected('players')) {
            await Promise.all(
                artifacts.players
                    .filter((p) => p.ageEligible)
                    .map((p) =>
                        limit(async () => {
                            const ok = await playerDocRepo.deletePlayer(p.id)
                            if (ok) deletedCounts.players++
                        })
                    )
            )
        }
        if (selected('inventory')) {
            await Promise.all(
                artifacts.inventory.map((i) =>
                    limit(async () => {
                        const ok = await inventoryRepo.removeItem(i.id, i.playerId)
                        if (ok) deletedCounts.inventory++
                    })
                )
            )
        }
        // Not deleting events (append-only); requires separate retention policy.
        console.log('\nDeletion Summary:')
        console.log(`  players deleted:   ${deletedCounts.players}`)
        console.log(`  inventory deleted: ${deletedCounts.inventory}`)
        console.log('\nDone.')
    } catch (err) {
        console.error('❌ Error during cleanup:', err.message)
        process.exit(1)
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main()
}

export { classifyTestId, isTestId, main }
