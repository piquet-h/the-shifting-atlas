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
 *   npm run query:deadletters -- --start "2025-10-31T00:00:00Z" --end "2025-10-31T23:59:59Z" --error-code schema-validation
 *   npm run query:deadletters -- --start "2025-10-31T00:00:00Z" --end "2025-10-31T23:59:59Z" --event-type Player.Move
 *   npm run query:deadletters -- --summary   # Summary statistics only
 *
 * Options:
 *   --start       Start time (ISO 8601 format, e.g., "2025-10-31T00:00:00Z")
 *   --end         End time (ISO 8601 format, e.g., "2025-10-31T23:59:59Z")
 *   --limit       Maximum number of records to return (default: 100, max: 1000)
 *   --id          Retrieve a single dead-letter record by ID
 *   --error-code  Filter by error code (json-parse, schema-validation, handler-error, unknown)
 *   --event-type  Filter by event type (e.g., Player.Move, NPC.Tick)
 *   --summary     Show summary statistics instead of full records
 *   --json        Output as JSON instead of formatted text
 *
 * Environment:
 *   Requires COSMOS_SQL_* environment variables or PERSISTENCE_MODE=memory for testing
 */

import { loadPersistenceConfigAsync, resolvePersistenceMode } from '../src/persistenceConfig.js'
import { CosmosDeadLetterRepository } from '../src/repos/deadLetterRepository.cosmos.js'
import { MemoryDeadLetterRepository } from '../src/repos/deadLetterRepository.memory.js'
import type { IDeadLetterRepository } from '../src/repos/deadLetterRepository.js'
import type { DeadLetterRecord, DeadLetterErrorCode } from '@piquet-h/shared/deadLetter'

interface QueryOptions {
    start?: string
    end?: string
    limit?: number
    id?: string
    json?: boolean
    errorCode?: DeadLetterErrorCode
    eventType?: string
    summary?: boolean
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
        } else if (arg === '--error-code' && nextArg) {
            options.errorCode = nextArg as DeadLetterErrorCode
            i++
        } else if (arg === '--event-type' && nextArg) {
            options.eventType = nextArg
            i++
        } else if (arg === '--summary') {
            options.summary = true
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
        `Timestamp:              ${record.deadLetteredUtc}`,
        `Event ID:               ${record.originalEventId || 'N/A'}`,
        `Event Type:             ${record.eventType || 'N/A'}`,
        `Actor Kind:             ${record.actorKind || 'N/A'}`,
        `Correlation ID:         ${record.correlationId || 'N/A'}`,
        `Occurred At:            ${record.occurredUtc || 'N/A'}`,
        ``,
        `Error Category:         ${record.error.category}`,
        `Error Message:          ${record.error.message}`,
        ``
    ]

    // Issue #401: Display enhanced DLQ metadata
    if (record.errorCode || record.retryCount !== undefined || record.firstAttemptTimestamp) {
        lines.push(`--- Enhanced DLQ Metadata (Issue #401) ---`)
        lines.push(`Error Code:             ${record.errorCode || 'N/A'}`)
        lines.push(`Retry Count:            ${record.retryCount ?? 'N/A'}`)
        lines.push(`First Attempt:          ${record.firstAttemptTimestamp || 'N/A'}`)
        lines.push(`Original Correlation:   ${record.originalCorrelationId || 'N/A'}`)
        lines.push(`Failure Reason:         ${record.failureReason || 'N/A'}`)
        lines.push(`Final Error:            ${record.finalError || 'N/A'}`)
        lines.push(``)
    }

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
 * Generate summary statistics for dead-letter records (Issue #401)
 */
function generateSummary(records: DeadLetterRecord[]): string {
    const lines = [
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `Dead-Letter Summary Statistics`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        ``,
        `Total Records:      ${records.length}`,
        ``
    ]

    // Group by error code
    const byErrorCode = new Map<string, number>()
    for (const record of records) {
        const code = record.errorCode || record.error.category || 'unknown'
        byErrorCode.set(code, (byErrorCode.get(code) || 0) + 1)
    }
    lines.push(`By Error Code:`)
    for (const [code, count] of byErrorCode.entries()) {
        const pct = ((count / records.length) * 100).toFixed(1)
        lines.push(`  ${code.padEnd(20)} ${count.toString().padStart(6)} (${pct}%)`)
    }
    lines.push(``)

    // Group by event type
    const byEventType = new Map<string, number>()
    for (const record of records) {
        const type = record.eventType || 'unknown'
        byEventType.set(type, (byEventType.get(type) || 0) + 1)
    }
    lines.push(`By Event Type:`)
    for (const [type, count] of byEventType.entries()) {
        const pct = ((count / records.length) * 100).toFixed(1)
        lines.push(`  ${type.padEnd(30)} ${count.toString().padStart(6)} (${pct}%)`)
    }
    lines.push(``)

    // Retry count distribution
    const byRetryCount = new Map<number, number>()
    for (const record of records) {
        const count = record.retryCount ?? 0
        byRetryCount.set(count, (byRetryCount.get(count) || 0) + 1)
    }
    lines.push(`By Retry Count:`)
    for (const [retries, count] of [...byRetryCount.entries()].sort((a, b) => a[0] - b[0])) {
        const pct = ((count / records.length) * 100).toFixed(1)
        lines.push(`  ${retries.toString().padEnd(10)} retries: ${count.toString().padStart(6)} (${pct}%)`)
    }
    lines.push(``)

    // Time range
    if (records.length > 0) {
        const sorted = [...records].sort((a, b) => a.deadLetteredUtc.localeCompare(b.deadLetteredUtc))
        lines.push(`Time Range:`)
        lines.push(`  Earliest:     ${sorted[0].deadLetteredUtc}`)
        lines.push(`  Latest:       ${sorted[sorted.length - 1].deadLetteredUtc}`)
    }

    return lines.join('\n')
}

/**
 * Filter records based on options (Issue #401)
 */
function filterRecords(records: DeadLetterRecord[], options: QueryOptions): DeadLetterRecord[] {
    let filtered = records

    if (options.errorCode) {
        filtered = filtered.filter((r) => r.errorCode === options.errorCode || r.error.category === options.errorCode)
    }

    if (options.eventType) {
        filtered = filtered.filter((r) => r.eventType === options.eventType)
    }

    return filtered
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
            console.error('')
            console.error('Usage:')
            console.error('  npm run query:deadletters -- --start "2025-10-31T00:00:00Z" --end "2025-10-31T23:59:59Z"')
            console.error('  npm run query:deadletters -- --id "dead-letter-record-id"')
            console.error('')
            console.error('Filters (Issue #401):')
            console.error('  --error-code <code>    Filter by: json-parse, schema-validation, handler-error, unknown')
            console.error('  --event-type <type>    Filter by event type (e.g., Player.Move)')
            console.error('  --summary              Show summary statistics only')
            console.error('  --json                 Output as JSON')
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
            let records = await repo.queryByTimeRange(options.start!, options.end!, limit)

            // Apply filters (Issue #401)
            records = filterRecords(records, options)

            if (records.length === 0) {
                console.log(`No dead-letter records found between ${options.start} and ${options.end}`)
                if (options.errorCode) console.log(`  (filtered by error-code: ${options.errorCode})`)
                if (options.eventType) console.log(`  (filtered by event-type: ${options.eventType})`)
                process.exit(0)
            }

            if (options.json) {
                if (options.summary) {
                    // JSON summary
                    const summary = {
                        totalRecords: records.length,
                        byErrorCode: {} as Record<string, number>,
                        byEventType: {} as Record<string, number>,
                        byRetryCount: {} as Record<number, number>
                    }
                    for (const record of records) {
                        const code = record.errorCode || record.error.category || 'unknown'
                        summary.byErrorCode[code] = (summary.byErrorCode[code] || 0) + 1
                        const type = record.eventType || 'unknown'
                        summary.byEventType[type] = (summary.byEventType[type] || 0) + 1
                        const retries = record.retryCount ?? 0
                        summary.byRetryCount[retries] = (summary.byRetryCount[retries] || 0) + 1
                    }
                    console.log(JSON.stringify(summary, null, 2))
                } else {
                    console.log(JSON.stringify(records, null, 2))
                }
            } else {
                if (options.summary) {
                    console.log(generateSummary(records))
                } else {
                    console.log(`Found ${records.length} dead-letter record(s)\n`)
                    for (const record of records) {
                        console.log(formatRecord(record))
                    }
                    console.log(`\nTotal: ${records.length} record(s)`)
                }
            }
        }
    } catch (error) {
        console.error('Error querying dead-letter records:', error)
        process.exit(1)
    }
}

main()
