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

import { resolvePersistenceMode } from '../src/persistenceConfig.js'
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
    console.log('   Source: villageLocations.json (34 Mosswell locations)\n')

    try {
        const result = await seedWorld({
            log: console.log,
            demoPlayerId: '00000000-0000-4000-8000-000000000001'
        })

        console.log('\n✅ Production seeding complete!')
        console.log(`   Locations processed: ${result.locationsProcessed}`)
        console.log(`   Location vertices created: ${result.locationVerticesCreated}`)
        console.log(`   Exits created: ${result.exitsCreated}`)
        console.log(`   Demo player: ${result.demoPlayerId} (${result.playerCreated ? 'created' : 'already exists'})`)

        if (result.locationVerticesCreated === 0 && result.exitsCreated === 0) {
            console.log('\n💡 All locations already exist (idempotent run)')
        }

        console.log('\n🎉 Mosswell is ready for production!')
    } catch (error) {
        console.error('\n❌ Seeding failed:', error)
        if (error instanceof Error) {
            console.error('   Message:', error.message)
            console.error('   Stack:', error.stack)
        }
        process.exit(1)
    }
}

main()
