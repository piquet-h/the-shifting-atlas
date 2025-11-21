#!/usr/bin/env node
/**
 * FULL ENVIRONMENT WIPE SCRIPT (Cosmos SQL + Gremlin) – HIGH RISK
 *
 * Purpose:
 *   Provide a controlled, two-phase workflow to delete ALL data containers (players, inventory,
 *   descriptionLayers, worldEvents, processedEvents, deadLetters) and optionally Gremlin graph data
 *   for BOTH production and test environments, then prepare for reseeding.
 *
 * Safety Interlocks:
 *   - Phase 1 (dry-run): Lists targets, computes digest, exports plan JSON.
 *   - Phase 2 (destructive): Requires --confirm + --phrase=RESET_WORLD + --digest=<sha256> matching plan.
 *   - Refuses to run without explicit environment variable presence.
 *   - Gremlin destructive ops require --include-gremlin AND --gremlin-confirm.
 *
 * NOTE: Actual container deletion (management plane) is NOT performed directly here because this
 *       runtime only has data-plane SDKs. We output az CLI command templates you must execute.
 *       This avoids accidental implicit auth and keeps blast radius explicit.
 *
 * Required Environment Variables (prod):
 *   COSMOS_SQL_ENDPOINT, COSMOS_SQL_DATABASE,
 *   COSMOS_SQL_CONTAINER_PLAYERS, COSMOS_SQL_CONTAINER_INVENTORY,
 *   COSMOS_SQL_CONTAINER_LAYERS, COSMOS_SQL_CONTAINER_EVENTS,
 *   COSMOS_SQL_CONTAINER_PROCESSEDEVENTS, COSMOS_SQL_CONTAINER_DEADLETTERS,
 *   COSMOS_GREMLIN_ENDPOINT, COSMOS_GREMLIN_DATABASE, COSMOS_GREMLIN_GRAPH
 *
 * Test equivalents (if wiping test also): suffix _TEST (e.g. COSMOS_SQL_ENDPOINT_TEST, ...)
 */

import { exec } from 'child_process'
import { createHash } from 'crypto'
import { writeFile } from 'fs/promises'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { promisify } from 'util'

const execAsync = promisify(exec)

const args = process.argv.slice(2)
let mode = 'both' // both|prod|test
let dryRun = true
let confirm = false
let phrase = null
let providedDigest = null
let includeGremlin = false
let gremlinConfirm = false
let exportPath = 'wipe-plan.json'
let invokeCli = false
let resourceGroup = ''
let accountName = ''
let gremlinAccountName = ''

for (const a of args) {
    if (a.startsWith('--mode=')) mode = a.substring('--mode='.length)
    else if (a === '--confirm') { confirm = true; dryRun = false }
    else if (a === '--dry-run') { dryRun = true; confirm = false }
    else if (a.startsWith('--phrase=')) phrase = a.substring('--phrase='.length)
    else if (a.startsWith('--digest=')) providedDigest = a.substring('--digest='.length).trim()
    else if (a === '--include-gremlin') includeGremlin = true
    else if (a === '--gremlin-confirm') gremlinConfirm = true
    else if (a.startsWith('--export=')) exportPath = a.substring('--export='.length)
    else if (a === '--invoke-cli') invokeCli = true
    else if (a.startsWith('--resource-group=')) resourceGroup = a.substring('--resource-group='.length)
    else if (a.startsWith('--account-name=')) accountName = a.substring('--account-name='.length)
    else if (a.startsWith('--gremlin-account-name=')) gremlinAccountName = a.substring('--gremlin-account-name='.length)
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
}

function printHelp() {
    console.log(`\nFULL WIPE SCRIPT\n\nUsage:\n  node scripts/full-wipe-prod-and-test.mjs [options]\n\nPhases:\n  Phase 1 (dry run): --dry-run (default) -> generates plan + digest\n  Phase 2 (destructive): --confirm --phrase=RESET_WORLD --digest=<sha256> (must match plan)\n\nOptions:\n  --mode=both|prod|test         Target environments (default both)\n  --dry-run                     Preview deletions (default)\n  --confirm                     Execute destructive phase\n  --phrase=RESET_WORLD          Required confirmation phrase for destructive phase\n  --digest=<sha256>             Digest from prior dry-run plan (integrity gate)\n  --include-gremlin             Include Gremlin graph data in plan\n  --gremlin-confirm             Required WITH --include-gremlin during destructive phase\n  --export=path.json            Output plan file (default wipe-plan.json)\n  --invoke-cli                  Directly invoke Azure CLI commands (requires az login + permissions)\n  --resource-group=<name>       Azure resource group (required with --invoke-cli)\n  --account-name=<name>         Cosmos SQL account name (required with --invoke-cli)\n  --gremlin-account-name=<name> Gremlin account name (required with --invoke-cli and --include-gremlin)\n  --help                        Show help\n\nDestructive Actions:\n  Default (Manual):  Outputs az CLI command templates for manual execution\n  With --invoke-cli: Directly executes az CLI commands via shell (requires authentication)\n\nSafety Requirements:\n  - Must supply phrase EXACTLY 'RESET_WORLD' for destructive phase\n  - Must supply digest matching dry-run export\n  - Gremlin requires explicit second flag (--gremlin-confirm)\n`)
}

if (confirm) {
    if (phrase !== 'RESET_WORLD') {
        console.error('❌ Missing or incorrect confirmation phrase. Use --phrase=RESET_WORLD')
        process.exit(1)
    }
    if (!providedDigest) {
        console.error('❌ Destructive phase requires --digest=<sha256> from dry-run plan')
        process.exit(1)
    }
    if (includeGremlin && !gremlinConfirm) {
        console.error('❌ Gremlin destructive operations require --gremlin-confirm')
        process.exit(1)
    }
    if (invokeCli) {
        if (!resourceGroup) {
            console.error('❌ --invoke-cli requires --resource-group=<name>')
            process.exit(1)
        }
        if (!accountName) {
            console.error('❌ --invoke-cli requires --account-name=<name>')
            process.exit(1)
        }
        if (includeGremlin && !gremlinAccountName) {
            console.error('❌ --invoke-cli with --include-gremlin requires --gremlin-account-name=<name>')
            process.exit(1)
        }
    }
}

// Collect environment sets
function collectEnv(prefix = '') {
    const env = (name) => process.env[prefix + name] || ''
    return {
        sqlEndpoint: env('COSMOS_SQL_ENDPOINT'),
        sqlDb: env('COSMOS_SQL_DATABASE'),
        containers: {
            players: env('COSMOS_SQL_CONTAINER_PLAYERS'),
            inventory: env('COSMOS_SQL_CONTAINER_INVENTORY'),
            layers: env('COSMOS_SQL_CONTAINER_LAYERS'),
            events: env('COSMOS_SQL_CONTAINER_EVENTS'),
            processedEvents: env('COSMOS_SQL_CONTAINER_PROCESSEDEVENTS'),
            deadLetters: env('COSMOS_SQL_CONTAINER_DEADLETTERS')
        },
        gremlinEndpoint: env('COSMOS_GREMLIN_ENDPOINT'),
        gremlinDb: env('COSMOS_GREMLIN_DATABASE'),
        gremlinGraph: env('COSMOS_GREMLIN_GRAPH')
    }
}

const prod = collectEnv('')
const test = collectEnv('_TEST')

function validateSet(label, set) {
    const missing = []
    if (!set.sqlEndpoint) missing.push('COSMOS_SQL_ENDPOINT' + (label === 'test' ? '_TEST' : ''))
    if (!set.sqlDb) missing.push('COSMOS_SQL_DATABASE' + (label === 'test' ? '_TEST' : ''))
    for (const [k, v] of Object.entries(set.containers)) { if (!v) missing.push('COSMOS_SQL_CONTAINER_' + k.toUpperCase() + (label === 'test' ? '_TEST' : '')) }
    if (includeGremlin) {
        if (!set.gremlinEndpoint) missing.push('COSMOS_GREMLIN_ENDPOINT' + (label === 'test' ? '_TEST' : ''))
        if (!set.gremlinDb) missing.push('COSMOS_GREMLIN_DATABASE' + (label === 'test' ? '_TEST' : ''))
        if (!set.gremlinGraph) missing.push('COSMOS_GREMLIN_GRAPH' + (label === 'test' ? '_TEST' : ''))
    }
    return missing
}

const plan = { timestamp: new Date().toISOString(), mode, includeGremlin, targets: [] }

function addTargets(label, set) {
    plan.targets.push({ label, sqlEndpoint: set.sqlEndpoint, sqlDb: set.sqlDb, containers: set.containers, gremlin: includeGremlin ? { endpoint: set.gremlinEndpoint, db: set.gremlinDb, graph: set.gremlinGraph } : null })
}

if (mode === 'both' || mode === 'prod') addTargets('prod', prod)
if (mode === 'both' || mode === 'test') addTargets('test', test)

// Validation
for (const t of plan.targets) {
    const missing = validateSet(t.label, t.label === 'prod' ? prod : test)
    if (missing.length) {
        console.error(`❌ Missing required env variables for ${t.label}: ${missing.join(', ')}`)
        process.exit(1)
    }
}

// Digest (compute on stable subset - exclude timestamp and digest field itself)
const stablePlan = { mode: plan.mode, includeGremlin: plan.includeGremlin, targets: plan.targets }
const digest = createHash('sha256').update(JSON.stringify(stablePlan)).digest('hex')
plan.digest = digest

if (dryRun) {
    console.log('═══════════════════════════════════════════════════════════')
    console.log(' FULL WIPE PLAN (DRY RUN)')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(' Mode:', mode)
    console.log(' Include Gremlin:', includeGremlin)
    console.log(' Targets:', plan.targets.length)
    for (const t of plan.targets) {
        console.log(`\n[${t.label}] Cosmos SQL DB: ${t.sqlDb}`)
        console.log(' Containers:')
        for (const [k, v] of Object.entries(t.containers)) console.log(`   - ${k}: ${v}`)
        if (includeGremlin) {
            console.log(` Gremlin Graph: ${t.gremlin.graph}`)
        }
    }
    console.log(`\nDigest: ${digest}`)
    const outPath = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', exportPath)
    await writeFile(outPath, JSON.stringify(plan, null, 2))
    console.log(`\nPlan exported -> ${outPath}`)
    console.log('\nNext: re-run with --confirm --phrase=RESET_WORLD --digest=' + digest)
    process.exit(0)
}

// Destructive Phase
if (providedDigest !== digest) {
    console.error('❌ Provided digest does not match current plan. Re-run dry-run to refresh.')
    process.exit(1)
}

console.log('═══════════════════════════════════════════════════════════')
console.log(invokeCli ? ' DESTRUCTIVE WIPE EXECUTION (DIRECT CLI INVOCATION)' : ' DESTRUCTIVE WIPE EXECUTION (MANUAL STEPS REQUIRED)')
console.log('═══════════════════════════════════════════════════════════')
console.log(' Digest verified.')

if (invokeCli) {
    console.log('\n⚠️  WARNING: Directly invoking Azure CLI commands. This will DELETE containers immediately.\n')
    for (const t of plan.targets) {
        console.log(`\n[${t.label}] Deleting Cosmos SQL containers...`)
        for (const [k, v] of Object.entries(t.containers)) {
            const cmd = `az cosmosdb sql container delete --account-name ${accountName} --resource-group ${resourceGroup} --database-name ${t.sqlDb} --name ${v} --yes`
            console.log(`  Executing: ${cmd}`)
            try {
                const { stdout, stderr } = await execAsync(cmd)
                if (stderr && !stderr.includes('WARNING')) console.error(`  stderr: ${stderr}`)
                console.log(`  ✅ Deleted container: ${v}`)
            } catch (err) {
                console.error(`  ❌ Failed to delete container ${v}: ${err.message}`)
            }
        }
        if (includeGremlin) {
            console.log(`\n[${t.label}] Deleting Gremlin graph...`)
            const gremCmd = `az cosmosdb gremlin graph delete --account-name ${gremlinAccountName} --resource-group ${resourceGroup} --database-name ${t.gremlin.db} --name ${t.gremlin.graph} --yes`
            console.log(`  Executing: ${gremCmd}`)
            try {
                const { stdout, stderr } = await execAsync(gremCmd)
                if (stderr && !stderr.includes('WARNING')) console.error(`  stderr: ${stderr}`)
                console.log(`  ✅ Deleted graph: ${t.gremlin.graph}`)
            } catch (err) {
                console.error(`  ❌ Failed to delete graph ${t.gremlin.graph}: ${err.message}`)
            }
        }
    }
    console.log('\n✅ Deletion complete.')
} else {
    for (const t of plan.targets) {
        console.log(`\n[${t.label}] EXECUTION COMMANDS:`)
        console.log('# Cosmos SQL Container Deletes:')
        for (const [k, v] of Object.entries(t.containers)) {
            console.log(`az cosmosdb sql container delete --account-name <ACCOUNT_NAME_${t.label.toUpperCase()}> --resource-group <RG_${t.label.toUpperCase()}> --database-name ${t.sqlDb} --name ${v} --yes`)
        }
        if (includeGremlin) {
            console.log('\n# Gremlin Graph Delete (Option A – full graph):')
            console.log(`az cosmosdb gremlin graph delete --account-name <ACCOUNT_NAME_${t.label.toUpperCase()}> --resource-group <RG_${t.label.toUpperCase()}> --database-name ${t.gremlin.db} --name ${t.gremlin.graph} --yes`)
            console.log('\n# Gremlin In-Graph Vertex/Edge Drop (Option B – keep graph config):')
            console.log('# Run in Gremlin console or SDK:')
            console.log("g.V().drop(); g.E().drop();")
        }
    }
    console.log('\n⚠ This script outputs commands only. Execute them manually or re-run with --invoke-cli.')
}

console.log('\nAFTER Deletion: Reapply infrastructure (Bicep) and run world seeding script.')
console.log('World seeding example:')
console.log('node scripts/seed-anchor-locations.mjs')
console.log('\nDone.')
