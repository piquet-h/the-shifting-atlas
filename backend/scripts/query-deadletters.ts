#!/usr/bin/env node
/**
 * Query Dead-Letter Records
 *
 * Admin utility script to retrieve and display dead-letter records by time range.
 * Useful for debugging and analyzing failed world events.
 *
 * Usage:
 *   npm run query:deadletters -- --start "2025-10-31T00:00:00Z" --end "2025-10-31T23:59:59Z"
 *   npm run query:deadletters -- --start "2025-10-31T00:00:00Z" --end "2025-10-31T23:59:59Z" --limit 50
 *   npm run query:deadletters -- --id "dead-letter-record-id"
 *
 * Options:
 *   --start    Start time (ISO 8601 format, e.g., "2025-10-31T00:00:00Z")
 *   --end      End time (ISO 8601 format, e.g., "2025-10-31T23:59:59Z")
 *   --limit    Maximum number of records to return (default: 100, max: 1000)
 *   --id       Retrieve a single dead-letter record by ID
 *   --json     Output as JSON instead of formatted text
 *
 * Environment:
 *   Requires COSMOS_SQL_* environment variables or PERSISTENCE_MODE=memory for testing
 */

import { loadPersistenceConfigAsync, resolvePersistenceMode } from '../src/persistenceConfig.js'
import { CosmosDeadLetterRepository } from '../src/repos/deadLetterRepository.cosmos.js'
import { MemoryDeadLetterRepository } from '../src/repos/deadLetterRepository.memory.js'
import type { IDeadLetterRepository } from '../src/repos/deadLetterRepository.js'
import type { DeadLetterRecord } from '@piquet-h/shared/deadLetter'

interface QueryOptions {
    start?: string
    end?: string
    limit?: number
    id?: string
    json?: boolean
}

/**
 * Parse command line arguments
 */
function parseArgs(): QueryOptions {
    const args = process.argv.slice(2)
    const options: QueryOptions = {}

    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        const nextArg = args[i + 1]

        if (arg === '--start' && nextArg) {
            options.start = nextArg
            i++
        } else if (arg === '--end' && nextArg) {
            options.end = nextArg
            i++
        } else if (arg === '--limit' && nextArg) {
            options.limit = parseInt(nextArg, 10)
            i++
        } else if (arg === '--id' && nextArg) {
            options.id = nextArg
            i++
        } else if (arg === '--json') {
            options.json = true
        }
    }

    return options
}

/**
 * Initialize dead-letter repository
 */
async function initRepository(): Promise<IDeadLetterRepository> {
    const mode = resolvePersistenceMode()
    if (mode === 'cosmos') {
        const config = await loadPersistenceConfigAsync()
        if (config.cosmosSql) {
            return new CosmosDeadLetterRepository(config.cosmosSql.endpoint, config.cosmosSql.database, config.cosmosSql.containers.deadLetters)
        }
        throw new Error('Cosmos SQL configuration not available')
    }
    return new MemoryDeadLetterRepository()
}

/**
 * Format a dead-letter record for display
 */
function formatRecord(record: DeadLetterRecord): string {
    const lines = [
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `Dead-Letter Record: ${record.id}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `Timestamp:       ${record.deadLetteredUtc}`,
        `Event ID:        ${record.originalEventId || 'N/A'}`,
        `Event Type:      ${record.eventType || 'N/A'}`,
        `Actor Kind:      ${record.actorKind || 'N/A'}`,
        `Correlation ID:  ${record.correlationId || 'N/A'}`,
        `Occurred At:     ${record.occurredUtc || 'N/A'}`,
        ``,
        `Error Category:  ${record.error.category}`,
        `Error Message:   ${record.error.message}`,
        ``
    ]

    if (record.error.issues && record.error.issues.length > 0) {
        lines.push(`Validation Issues:`)
        for (const issue of record.error.issues) {
            lines.push(`  - Path: ${issue.path}`)
            lines.push(`    Code: ${issue.code}`)
            lines.push(`    Message: ${issue.message}`)
        }
        lines.push(``)
    }

    lines.push(`Redacted Envelope:`)
    lines.push(JSON.stringify(record.redactedEnvelope, null, 2))
    lines.push(``)

    return lines.join('\n')
}

/**
 * Main query function
 */
async function main() {
    try {
        const options = parseArgs()

        // Validate arguments
        if (!options.id && (!options.start || !options.end)) {
            console.error('Error: Must provide either --id or both --start and --end')
            console.error('Usage: npm run query:deadletters -- --start "2025-10-31T00:00:00Z" --end "2025-10-31T23:59:59Z"')
            console.error('   or: npm run query:deadletters -- --id "dead-letter-record-id"')
            process.exit(1)
        }

        const repo = await initRepository()

        if (options.id) {
            // Query single record by ID
            const record = await repo.getById(options.id)
            if (!record) {
                console.error(`No dead-letter record found with ID: ${options.id}`)
                process.exit(1)
            }

            if (options.json) {
                console.log(JSON.stringify(record, null, 2))
            } else {
                console.log(formatRecord(record))
            }
        } else {
            // Query by time range
            const limit = Math.min(options.limit || 100, 1000)
            const records = await repo.queryByTimeRange(options.start!, options.end!, limit)

            if (records.length === 0) {
                console.log(`No dead-letter records found between ${options.start} and ${options.end}`)
                process.exit(0)
            }

            if (options.json) {
                console.log(JSON.stringify(records, null, 2))
            } else {
                console.log(`Found ${records.length} dead-letter record(s)\n`)
                for (const record of records) {
                    console.log(formatRecord(record))
                }
                console.log(`\nTotal: ${records.length} record(s)`)
            }
        }
    } catch (error) {
        console.error('Error querying dead-letter records:', error)
        process.exit(1)
    }
}

main()
