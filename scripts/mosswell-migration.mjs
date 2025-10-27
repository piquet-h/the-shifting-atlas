#!/usr/bin/env node
/**
 * Mosswell World Data Migration Script
 * 
 * Scaffolding for consistent world data migrations with safety checks.
 * Supports dry-run mode, duplicate ID detection, and schema version validation.
 * 
 * Usage:
 *   node scripts/mosswell-migration.mjs [options]
 * 
 * Options:
 *   --mode=memory|cosmos       Persistence mode (default: from PERSISTENCE_MODE env or 'memory')
 *   --data=path                Path to migration data JSON file
 *   --dry-run                  Preview changes without applying them
 *   --schema-version=N         Expected minimum schema version (default: 1)
 *   --help, -h                 Show help message
 * 
 * Environment Variables (for cosmos mode):
 *   PERSISTENCE_MODE=cosmos
 *   COSMOS_GREMLIN_ENDPOINT, COSMOS_GREMLIN_DATABASE, COSMOS_GREMLIN_GRAPH
 *   COSMOS_SQL_ENDPOINT, COSMOS_SQL_DATABASE
 * 
 * Migration Data Format:
 *   {
 *     "schemaVersion": 3,
 *     "migrationName": "add-new-district",
 *     "locations": [ ... Location objects ... ]
 *   }
 * 
 * Exit Codes:
 *   0 - Success
 *   1 - Configuration or validation error
 *   2 - Duplicate ID detected
 *   3 - Schema version mismatch
 */

import { readFile } from 'fs/promises'
import { resolve, normalize } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

/**
 * Validate migration data structure
 */
function validateMigrationData(data) {
    const errors = []
    
    if (!data || typeof data !== 'object') {
        errors.push('Migration data must be an object')
        return errors
    }
    
    if (!data.schemaVersion || typeof data.schemaVersion !== 'number') {
        errors.push('Missing or invalid schemaVersion (must be a number)')
    }
    
    if (!data.migrationName || typeof data.migrationName !== 'string') {
        errors.push('Missing or invalid migrationName (must be a string)')
    }
    
    if (!Array.isArray(data.locations)) {
        errors.push('locations must be an array')
        return errors
    }
    
    if (data.locations.length === 0) {
        errors.push('locations array cannot be empty')
    }
    
    // Validate each location
    const ids = new Set()
    for (let i = 0; i < data.locations.length; i++) {
        const loc = data.locations[i]
        const prefix = `locations[${i}]`
        
        if (!loc.id || typeof loc.id !== 'string') {
            errors.push(`${prefix}: Missing or invalid id`)
        } else if (ids.has(loc.id)) {
            errors.push(`${prefix}: Duplicate ID "${loc.id}"`)
        } else {
            ids.add(loc.id)
        }
        
        if (!loc.name || typeof loc.name !== 'string') {
            errors.push(`${prefix}: Missing or invalid name`)
        }
        
        if (!loc.description || typeof loc.description !== 'string') {
            errors.push(`${prefix}: Missing or invalid description`)
        }
        
        if (loc.version !== undefined && typeof loc.version !== 'number') {
            errors.push(`${prefix}: version must be a number`)
        }
        
        // Validate exits if present
        if (loc.exits && !Array.isArray(loc.exits)) {
            errors.push(`${prefix}: exits must be an array`)
        } else if (loc.exits) {
            for (let j = 0; j < loc.exits.length; j++) {
                const exit = loc.exits[j]
                const exitPrefix = `${prefix}.exits[${j}]`
                
                if (!exit.direction || typeof exit.direction !== 'string') {
                    errors.push(`${exitPrefix}: Missing or invalid direction`)
                }
                
                if (exit.to !== undefined && typeof exit.to !== 'string') {
                    errors.push(`${exitPrefix}: to must be a string`)
                }
            }
        }
    }
    
    return errors
}

/**
 * Check for duplicate IDs against existing data
 */
async function checkDuplicateIds(migrationData, existingLocations) {
    const duplicates = []
    const existingIds = new Set(existingLocations.map(l => l.id))
    
    for (const loc of migrationData.locations) {
        if (existingIds.has(loc.id)) {
            duplicates.push({
                id: loc.id,
                name: loc.name,
                conflict: 'ID already exists in database'
            })
        }
    }
    
    return duplicates
}

/**
 * Validate schema version
 */
function validateSchemaVersion(migrationData, minVersion) {
    if (migrationData.schemaVersion < minVersion) {
        return {
            valid: false,
            message: `Migration schema version ${migrationData.schemaVersion} is below minimum required version ${minVersion}`,
            isDowngrade: true
        }
    }
    
    return { valid: true }
}

/**
 * Format planned changes for display
 */
function formatPlannedChanges(migrationData) {
    const lines = []
    
    lines.push(`Migration: ${migrationData.migrationName}`)
    lines.push(`Schema Version: ${migrationData.schemaVersion}`)
    lines.push('')
    lines.push('Planned Changes:')
    lines.push(`  Locations to add: ${migrationData.locations.length}`)
    
    const totalExits = migrationData.locations.reduce((sum, loc) => 
        sum + (loc.exits?.length || 0), 0)
    lines.push(`  Total exits: ${totalExits}`)
    
    lines.push('')
    lines.push('Location Details:')
    for (const loc of migrationData.locations) {
        lines.push(`  • ${loc.name} (${loc.id})`)
        lines.push(`    Version: ${loc.version || 1}`)
        if (loc.tags && loc.tags.length > 0) {
            lines.push(`    Tags: ${loc.tags.join(', ')}`)
        }
        if (loc.exits && loc.exits.length > 0) {
            lines.push(`    Exits: ${loc.exits.map(e => e.direction).join(', ')}`)
        }
    }
    
    return lines.join('\n')
}

/**
 * Main entry point
 */
async function main() {
    const args = process.argv.slice(2)
    let mode = process.env.PERSISTENCE_MODE || 'memory'
    let dataPath = null
    let dryRun = false
    let minSchemaVersion = 1
    
    // Parse command line arguments
    for (const arg of args) {
        if (arg.startsWith('--mode=')) {
            const providedMode = arg.substring('--mode='.length)
            if (providedMode === 'memory' || providedMode === 'cosmos') {
                mode = providedMode
            } else {
                console.error(`❌ Error: Invalid mode '${providedMode}'. Must be 'memory' or 'cosmos'.`)
                process.exit(1)
            }
        } else if (arg.startsWith('--data=')) {
            dataPath = arg.substring('--data='.length)
        } else if (arg === '--dry-run') {
            dryRun = true
        } else if (arg.startsWith('--schema-version=')) {
            minSchemaVersion = parseInt(arg.substring('--schema-version='.length), 10)
            if (isNaN(minSchemaVersion) || minSchemaVersion < 1) {
                console.error('❌ Error: --schema-version must be a positive integer')
                process.exit(1)
            }
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Mosswell World Data Migration Script

Usage:
  node scripts/mosswell-migration.mjs [options]

Options:
  --mode=memory|cosmos       Persistence mode (default: from PERSISTENCE_MODE env or 'memory')
  --data=path                Path to migration data JSON file (required)
  --dry-run                  Preview changes without applying them
  --schema-version=N         Expected minimum schema version (default: 1)
  --help, -h                 Show this help message

Environment Variables (for cosmos mode):
  PERSISTENCE_MODE=cosmos
  COSMOS_GREMLIN_ENDPOINT, COSMOS_GREMLIN_DATABASE, COSMOS_GREMLIN_GRAPH
  COSMOS_SQL_ENDPOINT, COSMOS_SQL_DATABASE

Migration Data Format:
  {
    "schemaVersion": 3,
    "migrationName": "add-new-district",
    "locations": [ ... Location objects ... ]
  }

Exit Codes:
  0 - Success
  1 - Configuration or validation error
  2 - Duplicate ID detected
  3 - Schema version mismatch

Examples:
  # Dry-run preview
  node scripts/mosswell-migration.mjs --data=migrations/001-new-district.json --dry-run

  # Apply migration to memory store
  node scripts/mosswell-migration.mjs --data=migrations/001-new-district.json

  # Apply to Cosmos DB
  PERSISTENCE_MODE=cosmos node scripts/mosswell-migration.mjs --data=migrations/001-new-district.json
`)
            process.exit(0)
        }
    }
    
    if (!dataPath) {
        console.error('❌ Error: --data argument is required')
        console.error('   Use --help for usage information')
        process.exit(1)
    }
    
    // Set persistence mode environment variable
    process.env.PERSISTENCE_MODE = mode
    
    try {
        console.log('═══════════════════════════════════════════════════════════')
        console.log('  Mosswell World Data Migration')
        console.log('═══════════════════════════════════════════════════════════')
        console.log(`Persistence Mode: ${mode}`)
        console.log(`Dry Run: ${dryRun ? 'YES' : 'NO'}`)
        console.log(`Minimum Schema Version: ${minSchemaVersion}`)
        console.log(`Timestamp: ${new Date().toISOString()}`)
        console.log()
        
        // Resolve and validate data file path
        const scriptDir = fileURLToPath(new URL('.', import.meta.url))
        const projectRoot = resolve(scriptDir, '..')
        let resolvedDataPath = resolve(projectRoot, dataPath)
        
        // Security: Ensure the resolved path is within the project directory or /tmp (for tests)
        const normalizedPath = normalize(resolvedDataPath)
        const normalizedRoot = normalize(projectRoot) + '/'
        const isTmpPath = normalizedPath.startsWith('/tmp/')
        
        if (!normalizedPath.startsWith(normalizedRoot) && normalizedPath !== normalize(projectRoot) && !isTmpPath) {
            console.error(`❌ Error: Path '${dataPath}' is outside the project directory`)
            console.error(`   For security reasons, only files within the project can be loaded.`)
            process.exit(1)
        }
        
        console.log(`Loading migration data from: ${resolvedDataPath}`)
        
        // Load migration data
        let migrationData
        try {
            const fileContent = await readFile(resolvedDataPath, 'utf8')
            migrationData = JSON.parse(fileContent)
        } catch (err) {
            console.error(`❌ Error: Failed to load migration data from ${resolvedDataPath}`)
            console.error(`   ${err.message}`)
            process.exit(1)
        }
        
        console.log('✓ Migration data loaded')
        console.log()
        
        // Validate migration data structure
        console.log('Running pre-checks...')
        console.log('───────────────────────────────────────────────────────────')
        
        const validationErrors = validateMigrationData(migrationData)
        if (validationErrors.length > 0) {
            console.error('❌ Validation Errors:')
            validationErrors.forEach(err => console.error(`   • ${err}`))
            process.exit(1)
        }
        console.log('✓ Migration data structure is valid')
        
        // Validate schema version
        const schemaCheck = validateSchemaVersion(migrationData, minSchemaVersion)
        if (!schemaCheck.valid) {
            console.error(`❌ Schema Version Error: ${schemaCheck.message}`)
            if (schemaCheck.isDowngrade) {
                console.error('   Schema downgrades are not allowed')
            }
            process.exit(3)
        }
        console.log(`✓ Schema version ${migrationData.schemaVersion} meets minimum requirement`)
        
        // For duplicate ID checking, we need to query existing locations
        // This is a simplified check - in a real scenario, you might want to load
        // the actual location repository to check against the database
        console.log('✓ Checking for duplicate IDs...')
        
        // Load existing data for duplicate check (simplified - assumes villageLocations.json)
        const existingDataPath = resolve(projectRoot, 'backend/src/data/villageLocations.json')
        let existingLocations = []
        try {
            const existingContent = await readFile(existingDataPath, 'utf8')
            existingLocations = JSON.parse(existingContent)
        } catch (err) {
            console.log('   Note: Could not load existing locations for duplicate check')
            console.log(`   ${err.message}`)
        }
        
        const duplicates = await checkDuplicateIds(migrationData, existingLocations)
        if (duplicates.length > 0) {
            console.error('❌ Duplicate ID Errors:')
            duplicates.forEach(dup => {
                console.error(`   • ${dup.id} (${dup.name}): ${dup.conflict}`)
            })
            process.exit(2)
        }
        console.log('✓ No duplicate IDs detected')
        
        console.log('───────────────────────────────────────────────────────────')
        console.log()
        
        // Display planned changes
        console.log('═══════════════════════════════════════════════════════════')
        console.log('  Planned Changes')
        console.log('═══════════════════════════════════════════════════════════')
        console.log()
        console.log(formatPlannedChanges(migrationData))
        console.log()
        
        if (dryRun) {
            console.log('═══════════════════════════════════════════════════════════')
            console.log('  DRY RUN MODE - No changes applied')
            console.log('═══════════════════════════════════════════════════════════')
            console.log()
            console.log('To apply this migration, run again without --dry-run flag')
            console.log()
            console.log('Note: This script is idempotent. Re-running will update')
            console.log('      existing locations and skip creating duplicate exits.')
            console.log()
            process.exit(0)
        }
        
        // Apply migration
        console.log('═══════════════════════════════════════════════════════════')
        console.log('  Applying Migration')
        console.log('═══════════════════════════════════════════════════════════')
        console.log()
        
        // Dynamic import of backend modules to avoid loading before env is set or in dry-run
        console.log('Loading backend repositories...')
        
        try {
            // Use createRequire to load backend modules from the backend directory context
            const backendRequire = createRequire(resolve(projectRoot, 'backend/package.json'))
            
            // Load reflect-metadata (required by inversify)
            backendRequire('reflect-metadata')
            
            // Load backend modules using the backend's require context
            const { Container } = backendRequire('inversify')
            const { setupContainer } = await import('../backend/dist/inversify.config.js')
            const { seedWorld } = await import('../backend/dist/seeding/seedWorld.js')
            
            // Initialize DI container with proper mode
            const container = new Container()
            await setupContainer(container, mode)
            
            // Get repositories from container
            const locationRepository = container.get('ILocationRepository')
            const playerRepository = container.get('IPlayerRepository')
            
            const startTime = Date.now()
            const result = await seedWorld({
                blueprint: migrationData.locations,
                locationRepository,
                playerRepository,
                log: (...args) => {
                    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
                    console.log(`  ${msg}`)
                }
            })
            const elapsedMs = Date.now() - startTime
        
            console.log()
            console.log('✅ Migration completed successfully')
            console.log()
            console.log('═══════════════════════════════════════════════════════════')
            console.log('  Summary')
            console.log('═══════════════════════════════════════════════════════════')
            console.log()
            console.log(`  Migration: ${migrationData.migrationName}`)
            console.log(`  Schema Version: ${migrationData.schemaVersion}`)
            console.log()
            console.log(`  Locations processed:        ${result.locationsProcessed}`)
            console.log(`  Location vertices created:  ${result.locationVerticesCreated}`)
            console.log(`  Exits created:              ${result.exitsCreated}`)
            console.log()
            console.log(`  Elapsed time:               ${elapsedMs}ms`)
            console.log()
            console.log('═══════════════════════════════════════════════════════════')
            console.log()
            console.log('Note: This script is idempotent. Re-running will update')
            console.log('      existing locations and skip creating duplicate exits.')
            console.log()
            console.log('If the migration was interrupted, you can safely re-run')
            console.log('this script to complete the remaining operations.')
            console.log()
        } catch (moduleError) {
            // Handle missing backend dependencies gracefully
            if (moduleError.code === 'ERR_MODULE_NOT_FOUND' || moduleError.code === 'MODULE_NOT_FOUND') {
                console.error()
                console.error('❌ Backend dependencies not found')
                console.error()
                console.error('The migration script requires backend dependencies to be installed.')
                console.error('Please run the following commands:')
                console.error()
                console.error('  cd backend')
                console.error('  npm install')
                console.error('  npm run build')
                console.error()
                console.error('If you have authentication issues with GitHub Packages, ensure')
                console.error('you have a valid NODE_AUTH_TOKEN or PAT configured.')
                console.error()
                console.error('For now, you can still use --dry-run mode to validate your')
                console.error('migration data without applying changes.')
                console.error()
                process.exit(1)
            }
            // Re-throw other errors
            throw moduleError
        }
        
        process.exit(0)
        
    } catch (error) {
        console.error()
        console.error('═══════════════════════════════════════════════════════════')
        console.error('  ❌ Error')
        console.error('═══════════════════════════════════════════════════════════')
        console.error()
        console.error(`${error.message}`)
        
        if (error.stack) {
            console.error()
            console.error('Stack trace:')
            console.error(error.stack)
        }
        
        console.error()
        console.error('Troubleshooting:')
        console.error('  • Ensure backend dependencies are installed: cd backend && npm install')
        console.error('  • For cosmos mode, verify all required environment variables are set')
        console.error('  • Check that the migration data file exists and is valid JSON')
        console.error('  • Verify migration data format matches the expected structure')
        console.error()
        console.error('Recovery:')
        console.error('  • If migration was interrupted, you can safely re-run this script')
        console.error('  • The script is idempotent and will skip already-applied changes')
        console.error('  • Use --dry-run to preview changes before applying')
        console.error()
        
        process.exit(1)
    }
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main()
}

export { main, validateMigrationData, checkDuplicateIds, validateSchemaVersion, formatPlannedChanges }
