#!/usr/bin/env tsx
/**
 * Partition Key Distribution Validation Script
 *
 * Purpose: Analyze partition key distribution across Cosmos DB SQL API containers
 * to identify potential hotspots and uneven distribution.
 *
 * Usage:
 *   npm run validate:partitions              # Analyze all containers
 *   npm run validate:partitions -- --container players  # Specific container
 *   npm run validate:partitions -- --format csv > report.csv  # Export to CSV
 *   npm run validate:partitions -- --dry-run  # Report only, no recommendations
 *
 * Prerequisites:
 *   - COSMOS_SQL_ENDPOINT environment variable
 *   - COSMOS_SQL_DATABASE environment variable
 *   - Azure credentials configured (DefaultAzureCredential)
 *
 * Output:
 *   - Partition key cardinality by container
 *   - Top partitions by document count (and % of documents)
 *   - Risk assessment (green/amber/red)
 *   - Recommended actions
 */

import { Container, CosmosClient } from '@azure/cosmos'
import { DefaultAzureCredential } from '@azure/identity'

// Configuration
const COSMOS_ENDPOINT = process.env.COSMOS_SQL_ENDPOINT || process.env.COSMOS_ENDPOINT
const COSMOS_DATABASE = process.env.COSMOS_SQL_DATABASE || process.env.COSMOS_DATABASE || 'game'
const CONTAINERS = ['players', 'inventory', 'descriptionLayers', 'worldEvents']

// Thresholds
const THRESHOLDS = {
    HEALTHY_CARDINALITY: 10,
    WARNING_CARDINALITY: 5,
    WARNING_PARTITION_PCT: 15,
    CRITICAL_PARTITION_PCT: 25,
    MIN_DOCUMENT_COUNT: 1000
}

interface PartitionMetrics {
    containerName: string
    partitionKey: string
    documentCount: number
    percentageOfTotal: number
}

interface ContainerAnalysis {
    containerName: string
    totalDocuments: number
    uniquePartitionKeys: number
    topPartitions: PartitionMetrics[]
    riskLevel: 'green' | 'amber' | 'red'
    recommendations: string[]
}

/**
 * Parse command-line arguments
 */
function parseArgs(): { container?: string; format: 'text' | 'csv'; dryRun: boolean } {
    const args = process.argv.slice(2)

    // Support both:
    //   --container players
    //   --container=players
    let container
    for (let i = 0; i < args.length; i++) {
        const a = args[i]
        if (a === '--container') {
            container = args[i + 1]
            break
        }
        if (a.startsWith('--container=')) {
            container = a.split('=')[1]
            break
        }
    }

    // Support both:
    //   --format csv
    //   --format=csv
    let format: 'text' | 'csv' = 'text'
    for (let i = 0; i < args.length; i++) {
        const a = args[i]
        if (a === '--format') {
            const v = (args[i + 1] ?? '').trim()
            if (v === 'csv') format = 'csv'
            break
        }
        if (a === '--format=csv') {
            format = 'csv'
            break
        }
    }

    const dryRun = args.includes('--dry-run')

    return { container, format, dryRun }
}

/**
 * Initialize Cosmos DB client
 */
function createClient(): CosmosClient {
    if (!COSMOS_ENDPOINT) {
        throw new Error('COSMOS_SQL_ENDPOINT or COSMOS_ENDPOINT environment variable required')
    }

    const credential = new DefaultAzureCredential()
    return new CosmosClient({ endpoint: COSMOS_ENDPOINT, aadCredentials: credential })
}

/**
 * Query container for partition key distribution
 */
function partitionKeyPathToSqlExpression(partitionKeyPath: string): string {
    // Cosmos partition key paths look like '/playerId' or '/foo/bar'.
    // Convert to a safe SQL expression: c.playerId or c.foo.bar.
    const path = (partitionKeyPath ?? '').trim()
    if (!path.startsWith('/')) {
        throw new Error(`Invalid partition key path: ${partitionKeyPath}`)
    }

    const segments = path
        .split('/')
        .filter(Boolean)
        .map((s) => s.trim())

    if (segments.length === 0) {
        throw new Error(`Invalid partition key path (no segments): ${partitionKeyPath}`)
    }

    for (const seg of segments) {
        // Conservative identifier validation. (No bracket-quoting; keep queries simple.)
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(seg)) {
            throw new Error(`Unsupported partition key path segment '${seg}' in '${partitionKeyPath}'`)
        }
    }

    return `c.${segments.join('.')}`
}

async function resolvePartitionKeyPath(container: Container): Promise<string> {
    // Prefer authoritative container metadata.
    try {
        const { resource } = await container.read()
        const path = resource?.partitionKey?.paths?.[0]
        if (typeof path === 'string' && path.startsWith('/')) {
            return path
        }
    } catch {
        // Fall through to safe defaults.
    }

    // Safe repo defaults (keeps the script usable even if metadata read fails).
    switch (container.id) {
        case 'players':
            return '/id'
        case 'inventory':
            return '/playerId'
        case 'descriptionLayers':
            return '/locationId'
        case 'worldEvents':
            return '/scopeKey'
        default:
            return '/id'
    }
}

async function analyzeContainer(container: Container): Promise<PartitionMetrics[]> {
    const partitionKeyPath = await resolvePartitionKeyPath(container)
    const pkExpr = partitionKeyPathToSqlExpression(partitionKeyPath)

    // Aggregate server-side so we don't fetch full documents.
    const query = {
        query: `SELECT ${pkExpr} AS pk, COUNT(1) AS documentCount FROM c WHERE IS_DEFINED(${pkExpr}) GROUP BY ${pkExpr}`
    }

    const iterator = container.items.query(query, { maxItemCount: 1000 })
    const rows: Array<{ pk: unknown; documentCount: number }> = []

    while (iterator.hasMoreResults()) {
        const page = await iterator.fetchNext()
        rows.push(...(page.resources ?? []))
    }

    const totalDocuments = rows.reduce((sum, r) => sum + (Number(r.documentCount) || 0), 0)
    const metrics: PartitionMetrics[] = []

    for (const r of rows) {
        const pk = r.pk
        if (pk === null || pk === undefined) continue
        const key = String(pk)
        const count = Number(r.documentCount) || 0
        if (count <= 0) continue
        metrics.push({
            containerName: container.id,
            partitionKey: key,
            documentCount: count,
            percentageOfTotal: totalDocuments > 0 ? (count / totalDocuments) * 100 : 0
        })
    }

    return metrics.sort((a, b) => b.documentCount - a.documentCount)
}

/**
 * Assess risk level based on partition distribution
 */
function assessRisk(metrics: PartitionMetrics[], totalDocuments: number): 'green' | 'amber' | 'red' {
    if (totalDocuments < THRESHOLDS.MIN_DOCUMENT_COUNT) {
        return 'green' // Too small to assess
    }

    const uniquePartitions = metrics.length
    const maxPartitionPct = metrics[0]?.percentageOfTotal || 0

    if (maxPartitionPct > THRESHOLDS.CRITICAL_PARTITION_PCT) {
        return 'red'
    }

    if (maxPartitionPct > THRESHOLDS.WARNING_PARTITION_PCT || uniquePartitions < THRESHOLDS.WARNING_CARDINALITY) {
        return 'amber'
    }

    return 'green'
}

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(metrics: PartitionMetrics[], totalDocuments: number): string[] {
    const recommendations: string[] = []
    const uniquePartitions = metrics.length
    const maxPartitionPct = metrics[0]?.percentageOfTotal || 0

    if (totalDocuments < THRESHOLDS.MIN_DOCUMENT_COUNT) {
        recommendations.push(`Container has low document count (${totalDocuments}). Monitor as data grows.`)
        return recommendations
    }

    if (uniquePartitions < THRESHOLDS.WARNING_CARDINALITY) {
        recommendations.push(`Low partition key cardinality (${uniquePartitions} unique keys). Consider reviewing partition key strategy.`)
    }

    if (maxPartitionPct > THRESHOLDS.CRITICAL_PARTITION_PCT) {
        recommendations.push(
            `CRITICAL: Single partition (${metrics[0].partitionKey}) contains ${maxPartitionPct.toFixed(1)}% of documents. Immediate review required.`
        )
        recommendations.push('Consider partition key migration, sharding, or caching for popular entities.')
    } else if (maxPartitionPct > THRESHOLDS.WARNING_PARTITION_PCT) {
        recommendations.push(`WARNING: Partition ${metrics[0].partitionKey} contains ${maxPartitionPct.toFixed(1)}% of documents.`)
        recommendations.push('Monitor for growth trends. Review query patterns for optimization.')
    }

    if (uniquePartitions >= THRESHOLDS.HEALTHY_CARDINALITY && maxPartitionPct <= THRESHOLDS.WARNING_PARTITION_PCT) {
        recommendations.push('✅ Healthy partition distribution. Continue monitoring.')
    }

    return recommendations
}

/**
 * Analyze single container
 */
async function analyzeContainerFull(client: CosmosClient, containerName: string, dryRun: boolean): Promise<ContainerAnalysis> {
    const database = client.database(COSMOS_DATABASE)
    const container = database.container(containerName)

    const metrics = await analyzeContainer(container)
    const totalDocuments = metrics.reduce((sum, m) => sum + m.documentCount, 0)
    const uniquePartitionKeys = metrics.length
    const topPartitions = metrics.slice(0, 20)
    const riskLevel = assessRisk(metrics, totalDocuments)
    const recommendations = dryRun ? [] : generateRecommendations(metrics, totalDocuments)

    return {
        containerName,
        totalDocuments,
        uniquePartitionKeys,
        topPartitions,
        riskLevel,
        recommendations
    }
}

/**
 * Format output as text
 */
function formatText(analyses: ContainerAnalysis[], dryRun: boolean): string {
    let output = '='.repeat(80) + '\n'
    output += 'Partition Key Distribution Analysis\n'
    output += '='.repeat(80) + '\n\n'

    for (const analysis of analyses) {
        const riskEmoji = analysis.riskLevel === 'green' ? '✅' : analysis.riskLevel === 'amber' ? '⚠️' : '🔴'

        output += `\n${riskEmoji} Container: ${analysis.containerName}\n`
        output += '-'.repeat(80) + '\n'
        output += `Total Documents: ${analysis.totalDocuments}\n`
        output += `Unique Partition Keys: ${analysis.uniquePartitionKeys}\n`
        output += `Risk Level: ${analysis.riskLevel.toUpperCase()}\n\n`

        if (analysis.topPartitions.length > 0) {
            output += 'Top 10 Partitions by Document Count:\n'
            output += `${'Rank'.padEnd(6)}${'Partition Key'.padEnd(40)}${'Documents'.padEnd(12)}${'% of Total'.padEnd(12)}\n`
            output += '-'.repeat(80) + '\n'

            for (let i = 0; i < Math.min(10, analysis.topPartitions.length); i++) {
                const partition = analysis.topPartitions[i]
                const truncatedKey =
                    partition.partitionKey.length > 36 ? partition.partitionKey.substring(0, 36) + '...' : partition.partitionKey
                output += `${(i + 1).toString().padEnd(6)}${truncatedKey.padEnd(40)}${partition.documentCount.toString().padEnd(12)}${partition.percentageOfTotal.toFixed(2).padEnd(12)}\n`
            }
            output += '\n'
        }

        if (dryRun) {
            output += 'Recommendations: (omitted --dry-run)\n\n'
        } else {
            output += 'Recommendations:\n'
            for (const rec of analysis.recommendations) {
                output += `  • ${rec}\n`
            }
            output += '\n'
        }
    }

    output += '='.repeat(80) + '\n'
    output += `Analysis completed at ${new Date().toISOString()}\n`
    output += '='.repeat(80) + '\n'

    return output
}

/**
 * Format output as CSV
 */
function formatCSV(analyses: ContainerAnalysis[]): string {
    let csv = 'Container,TotalDocuments,UniquePartitionKeys,RiskLevel,TopPartitionKey,TopPartitionDocCount,TopPartitionPct\n'

    for (const analysis of analyses) {
        const topPartition = analysis.topPartitions[0]
        csv += `${analysis.containerName},${analysis.totalDocuments},${analysis.uniquePartitionKeys},${analysis.riskLevel},`
        if (topPartition) {
            csv += `${topPartition.partitionKey},${topPartition.documentCount},${topPartition.percentageOfTotal.toFixed(2)}\n`
        } else {
            csv += 'N/A,0,0.00\n'
        }
    }

    return csv
}

/**
 * Main execution
 */
async function main() {
    const { container: targetContainer, format, dryRun } = parseArgs()

    console.error('Initializing Cosmos DB client...')
    const client = createClient()

    const containersToAnalyze = targetContainer ? [targetContainer] : CONTAINERS

    console.error(`Analyzing ${containersToAnalyze.length} container(s)...\n`)

    const analyses: ContainerAnalysis[] = []

    for (const containerName of containersToAnalyze) {
        try {
            console.error(`Analyzing container: ${containerName}...`)
            const analysis = await analyzeContainerFull(client, containerName, dryRun)
            analyses.push(analysis)
        } catch (error) {
            console.error(`Error analyzing container ${containerName}:`, error)
        }
    }

    if (format === 'csv') {
        console.log(formatCSV(analyses))
    } else {
        console.log(formatText(analyses, dryRun))
    }

    if (!dryRun) {
        console.error('\nTo export this report to CSV, run with --format=csv')
        console.error('To skip recommendations, run with --dry-run')
    }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error('Fatal error:', error)
        process.exit(1)
    })
}
