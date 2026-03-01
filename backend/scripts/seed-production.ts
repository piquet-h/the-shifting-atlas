#!/usr/bin/env tsx
/**
 * Seed Production Cosmos Database with Mosswell Village
 *
 * This script seeds the PRODUCTION partition ("world") with the full Mosswell
 * village data from villageLocations.json.
 *
 * Usage:
 *   npm run seed:production
 *
 * Safety:
 * - Only affects partition "world" (production)
 * - Test data lives in partition "test" (unaffected)
 * - Idempotent: safe to run multiple times
 * - Requires PERSISTENCE_MODE=cosmos in local.settings.json
 *
 * Environment Check:
 * - PARTITION_SCOPE must NOT be set to "test"
 * - NODE_ENV must NOT be "test"
 * - This ensures we seed production partition, not test
 */

// Load environment variables from local.settings.json (Azure Functions convention)
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const settingsPath = join(__dirname, '../local.settings.json')

try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    Object.assign(process.env, settings.Values)
} catch (err) {
    console.error('⚠️  Warning: Could not load local.settings.json')
}

import type { Location } from '@piquet-h/shared'
import { Container } from 'inversify'
import starterLocationsData from '../src/data/villageLocations.json' with { type: 'json' }
import { TOKENS } from '../src/di/tokens.js'
import type { IGremlinClient } from '../src/gremlin/gremlinClient.js'
import { setupContainer } from '../src/inversify.config.js'
import { resolvePersistenceMode } from '../src/persistenceConfig.js'
import { ILocationRepository } from '../src/repos/locationRepository.js'
import { seedWorld } from '../src/seeding/seedWorld.js'

async function main() {
    // Safety check: Ensure we're NOT in test mode
    if (process.env.NODE_ENV === 'test' || process.env.PARTITION_SCOPE === 'test') {
        console.error('❌ ERROR: Cannot run production seed in test mode!')
        console.error('   NODE_ENV:', process.env.NODE_ENV)
        console.error('   PARTITION_SCOPE:', process.env.PARTITION_SCOPE)
        console.error('\n   This would seed test partition, not production.')
        console.error('   Remove test environment variables and try again.')
        process.exit(1)
    }

    // Verify we're using Cosmos mode
    const mode = resolvePersistenceMode()
    if (mode !== 'cosmos') {
        console.error(`❌ ERROR: PERSISTENCE_MODE must be "cosmos" (currently: ${mode})`)
        console.error('\n   Run: npm run use:cosmos')
        process.exit(1)
    }

    console.log('🌱 Seeding PRODUCTION Cosmos database...')
    console.log('   Partition: "world" (production)')
    console.log('   Mode: cosmos')
    console.log(`   Source: villageLocations.json (${(starterLocationsData as Location[]).length} Mosswell locations)\n`)

    let container: Container | undefined
    let exitCode = 0

    try {
        // Build DI container in cosmos mode and resolve repositories
        // Let setupContainer infer mode & bind PersistenceConfig from environment instead of passing explicit mode
        container = await setupContainer(new Container())
        const locationRepository = container.get<ILocationRepository>('ILocationRepository')

        const result = await seedWorld({
            log: console.log,
            locationRepository,
            blueprint: starterLocationsData as Location[],
            bulkMode: true
        })

        console.log('\n✅ Production seeding complete!')
        console.log(`   Locations processed: ${result.locationsProcessed}`)
        console.log(`   Location vertices created: ${result.locationVerticesCreated}`)
        console.log(`   Exits created: ${result.exitsCreated}`)
        console.log(`   Exits removed: ${result.exitsRemoved}`)

        if (result.locationVerticesCreated === 0 && result.exitsCreated === 0 && result.exitsRemoved === 0) {
            console.log('\n💡 All locations already exist (idempotent run)')
        }

        console.log('\n🎉 Mosswell is ready for production!')
    } catch (error) {
        console.error('\n❌ Seeding failed:', error)
        if (error instanceof Error) {
            console.error('   Message:', error.message)
            console.error('   Stack:', error.stack)
        }
        exitCode = 1
    } finally {
        // Ensure we close the Gremlin websocket connection so the script can exit cleanly.
        // Without this, the Node event loop may stay alive and require Ctrl+C.
        if (container?.isBound(TOKENS.GremlinClient)) {
            try {
                const gremlin = container.get<IGremlinClient>(TOKENS.GremlinClient)
                await gremlin.close()
            } catch (err) {
                console.warn('⚠️  Warning: failed to close Gremlin client (best-effort):', err)
            }
        }

        process.exit(exitCode)
    }
}

main()
