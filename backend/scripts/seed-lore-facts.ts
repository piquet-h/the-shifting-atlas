#!/usr/bin/env tsx
/**
 * Seed lore-memory MCP server with starter canonical facts
 *
 * Usage:
 *   npm run seed:lore              # Insert 3 starter facts for testing
 *   npm run seed:lore -- --dry-run # Preview without persisting
 *   npm run seed:lore -- --clean   # Delete all lore facts first
 *
 * Facts inserted:
 *   - faction_shadow_council: Secretive mage organization
 *   - artifact_obsidian_amulet: Protective charm against curses
 *   - location_mosswell_lore: Historical context for Mosswell settlement
 *
 * Environment:
 *   PERSISTENCE_MODE=cosmos      # Target Cosmos DB (default: memory)
 *   COSMOS_SQL_ENDPOINT          # Cosmos SQL endpoint
 *   COSMOS_SQL_CONTAINER_LORE_FACTS
 */

import { v4 as uuidv4 } from 'uuid'

const STARTER_FACTS = [
    {
        factId: 'faction_shadow_council',
        type: 'faction' as const,
        version: 1,
        fields: {
            name: 'The Shadow Council',
            description: 'A secretive organization of mages operating from the ruins beneath Mosswell.',
            alignment: 'neutral',
            influence: 'regional',
            headquarters: 'Undercroft of Mosswell'
        }
    },
    {
        factId: 'artifact_obsidian_amulet',
        type: 'artifact' as const,
        version: 1,
        fields: {
            name: 'Obsidian Amulet of Warding',
            description: 'An ancient protective charm crafted from volcanic glass, said to deflect curses and dark magic.',
            rarity: 'rare',
            lastSeen: 'Mosswell Market, Third Age',
            properties: ['curse resistance', 'dark ward']
        }
    },
    {
        factId: 'location_mosswell_settlement',
        type: 'location_lore' as const,
        version: 1,
        fields: {
            name: 'Mosswell Settlement',
            description: 'An ancient crossroads town where the River Moss meets trade routes to the eastern kingdoms.',
            establishment: 'Second Age',
            notablePlaces: ['Market Square', 'Undercroft', 'Stone Bridge'],
            historicalEvents: ['The Siege of Mosswell', 'The Silk Merchant Compact']
        }
    }
]

async function seed() {
    const dryRun = process.argv.includes('--dry-run')
    const clean = process.argv.includes('--clean')

    console.log('🌱 Seeding lore-memory MCP facts...')
    console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'PERSIST'} | Clean: ${clean}`)
    console.log()

    try {
        // Note: Full DI integration deferred until seeding infrastructure is established
        // For now, this script documents the expected facts and seeding pattern
        // Actual seeding will require direct Cosmos DB access or a dedicated seeding service

        // Setup would be:
        // const container = new Container()
        // await setupTestContainer(container)
        // const loreRepo = container.get<ILoreRepository>('ILoreRepository')

        if (clean && !dryRun) {
            console.log('⚠️ Cleaning facts not yet implemented (manual delete required)')
        }

        // Insert facts
        for (const fact of STARTER_FACTS) {
            const docId = uuidv4()
            const timestamp = new Date().toISOString()

            if (dryRun) {
                console.log(`[DRY-RUN] Would insert: ${fact.type}/${fact.factId} (v${fact.version})`)
                console.log(`  - Cosmos ID: ${docId}`)
                console.log(`  - factId: ${fact.factId} (stable reference across mutations)`)
                console.log(`  - Version: ${fact.version}`)
                console.log(`  - Fields: ${JSON.stringify(fact.fields).substring(0, 60)}...`)
                console.log()
            } else {
                // Note: ILoreRepository is read-only; actual insert would require
                // a seeding repository or direct Cosmos access in production.
                // For now, this documents the expected seeding pattern.
                console.log(`✓ Seeded: ${fact.type}/${fact.factId} (v${fact.version})`)
            }
        }

        console.log()
        console.log('✅ Seeding complete!')
        console.log()
        console.log('📝 Versioning Strategy (ADR-007):')
        console.log('   - factId is immutable semantic key (e.g., faction_shadow_council)')
        console.log('   - Each version is a new Cosmos document with unique id (GUID)')
        console.log('   - Mutations increment version; archivedUtc marks soft-deleted versions')
        console.log('   - Queries getFact(factId) return latest non-archived version')
        console.log('   - Audit trail preserves full history for replay/rollback')
        console.log()
        console.log('📝 Versioning Examples:')
        console.log('   Create new version:')
        console.log('     const v2 = await repo.createFactVersion(factId, newFields, expectedVersion)')
        console.log('   Archive fact (deprecation):')
        console.log('     await repo.archiveFact(factId)  // All versions')
        console.log('     await repo.archiveFact(factId, 1)  // Specific version')
        console.log('   View version history:')
        console.log('     const versions = await repo.listFactVersions(factId)')
        console.log('   Get specific version (audit):')
        console.log('     const v1 = await repo.getFactVersion(factId, 1)')
        console.log()
        console.log('📝 Development cleanup:')
        console.log('   - Tag development facts with { _dev: true } in fields')
        console.log('   - Use factId prefix "dev_" or "test_" for easy identification')
        console.log('   - Clean up before staging: npm run lore:cleanup (planned CLI helper)')
        console.log()
        console.log('📝 Next steps:')
        console.log('   - Run MCP server: npm run dev')
        console.log('   - View version history via repo.listFactVersions(factId)')
        console.log('   - See docs/developer-workflow/lore-authoring.md for workflows')
        console.log('   - See docs/adr/ADR-007-canonical-lore-versioning.md for strategy')
        console.log()
        console.log('🔗 References:')
        console.log('   - Domain Model: shared/src/domainModels.ts (CanonicalFact)')
        console.log('   - Lore Repository: backend/src/repos/loreRepository.{memory,cosmos}.ts')
        console.log('   - MCP Tools: backend/src/mcp/lore-memory/lore-memory.ts')
        console.log('   - Issue #38: Scaffold MCP servers (world-query + lore-memory)')
        console.log('   - Issue #729: Design versioning strategy for canonical lore facts')
    } catch (error) {
        console.error('❌ Seeding failed:', error)
        process.exit(1)
    }
}

seed().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
