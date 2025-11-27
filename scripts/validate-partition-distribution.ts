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
 *   - Top hot partitions by operation count
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
    const container = args.find((arg) => arg.startsWith('--container'))?.split('=')[1]
    const format = args.includes('--format=csv') ? 'csv' : 'text'
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
async function analyzeContainer(container: Container): Promise<PartitionMetrics[]> {
    // Query to get document count per partition key
    // Note: This is a simplified analysis using SQL API query
    // For production, consider using container feed with continuation tokens
    const query = {
        query: 'SELECT c.id, c.partitionKey FROM c'
    }

    const { resources } = await container.items.query(query).fetchAll()

    // Group by partition key (extracting from document structure)
    const partitionCounts = new Map<string, number>()

    for (const doc of resources) {
        // Determine partition key value based on container's partition key path
        // This is a simplification; in production, use container metadata to get partition key path
        let partitionKeyValue: string

        if ('id' in doc) {
            partitionKeyValue = doc.id // For /id partition key
        } else if ('playerId' in doc) {
            partitionKeyValue = (doc as any).playerId // For /playerId partition key
        } else if ('locationId' in doc) {
            partitionKeyValue = (doc as any).locationId // For /locationId partition key
        } else if ('scopeKey' in doc) {
            partitionKeyValue = (doc as any).scopeKey // For /scopeKey partition key
        } else {
            partitionKeyValue = 'unknown'
        }

        partitionCounts.set(partitionKeyValue, (partitionCounts.get(partitionKeyValue) || 0) + 1)
    }

    const totalDocuments = resources.length
    const metrics: PartitionMetrics[] = []

    for (const [partitionKey, count] of partitionCounts.entries()) {
        metrics.push({
            containerName: container.id,
            partitionKey,
            documentCount: count,
            percentageOfTotal: (count / totalDocuments) * 100
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
        recommendations.push('Consider partition key migration or caching for popular entities.')
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
async function analyzeContainerFull(client: CosmosClient, containerName: string): Promise<ContainerAnalysis> {
    const database = client.database(COSMOS_DATABASE)
    const container = database.container(containerName)

    const metrics = await analyzeContainer(container)
    const totalDocuments = metrics.reduce((sum, m) => sum + m.documentCount, 0)
    const uniquePartitionKeys = metrics.length
    const topPartitions = metrics.slice(0, 20)
    const riskLevel = assessRisk(metrics, totalDocuments)
    const recommendations = generateRecommendations(metrics, totalDocuments)

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
function formatText(analyses: ContainerAnalysis[]): string {
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

        output += 'Recommendations:\n'
        for (const rec of analysis.recommendations) {
            output += `  • ${rec}\n`
        }
        output += '\n'
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
            const analysis = await analyzeContainerFull(client, containerName)
            analyses.push(analysis)
        } catch (error) {
            console.error(`Error analyzing container ${containerName}:`, error)
        }
    }

    if (format === 'csv') {
        console.log(formatCSV(analyses))
    } else {
        console.log(formatText(analyses))
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
