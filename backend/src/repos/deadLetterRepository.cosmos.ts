/**
 * Cosmos SQL Dead-Letter Repository Implementation
 *
 * Stores failed world events in Cosmos SQL API with redacted payloads.
 * Handles storage failures gracefully (logs but does not throw).
 */

import { CosmosClient, Database, Container } from '@azure/cosmos'
import { DefaultAzureCredential } from '@azure/identity'
import type { DeadLetterRecord } from '@piquet-h/shared/deadLetter'
import type { IDeadLetterRepository } from './deadLetterRepository.js'

/**
 * Cosmos SQL implementation of dead-letter repository
 */
export class CosmosDeadLetterRepository implements IDeadLetterRepository {
    private client: CosmosClient
    private database: Database
    private container: Container
    private containerName: string

    constructor(endpoint: string, databaseName: string, containerName: string) {
        // Use Managed Identity (DefaultAzureCredential) for authentication
        const credential = new DefaultAzureCredential()
        this.client = new CosmosClient({ endpoint, aadCredentials: credential })
        this.database = this.client.database(databaseName)
        this.containerName = containerName
        this.container = this.database.container(containerName)
    }

    /**
     * Store a dead-letter record with idempotent insert (upsert)
     */
    async store(record: DeadLetterRecord): Promise<void> {
        try {
            // Use upsert for idempotency (if same ID is written multiple times, last write wins)
            await this.container.items.upsert(record)
        } catch (error) {
            // Log error but don't throw - dead-letter storage failure should not block processing
            console.error('Failed to store dead-letter record', {
                recordId: record.id,
                error: String(error),
                container: this.containerName
            })
            // Do not throw - fail gracefully per acceptance criteria
        }
    }

    /**
     * Query dead-letter records by time range
     */
    async queryByTimeRange(startUtc: string, endUtc: string, maxResults: number = 100): Promise<DeadLetterRecord[]> {
        try {
            const querySpec = {
                query: 'SELECT * FROM c WHERE c.deadLetteredUtc >= @startUtc AND c.deadLetteredUtc <= @endUtc ORDER BY c.deadLetteredUtc DESC OFFSET 0 LIMIT @maxResults',
                parameters: [
                    { name: '@startUtc', value: startUtc },
                    { name: '@endUtc', value: endUtc },
                    { name: '@maxResults', value: maxResults }
                ]
            }

            const { resources } = await this.container.items.query<DeadLetterRecord>(querySpec).fetchAll()
            return resources
        } catch (error) {
            console.error('Failed to query dead-letter records', {
                startUtc,
                endUtc,
                error: String(error)
            })
            return [] // Return empty array on error
        }
    }

    /**
     * Get a single dead-letter record by ID
     */
    async getById(id: string): Promise<DeadLetterRecord | null> {
        try {
            const { resource } = await this.container.item(id, 'deadletter').read<DeadLetterRecord>()
            return resource || null
        } catch (error) {
            // 404 is expected if record doesn't exist
            const cosmosError = error as { code?: number }
            if (cosmosError.code === 404) {
                return null
            }
            console.error('Failed to get dead-letter record by ID', {
                id,
                error: String(error)
            })
            return null
        }
    }
}
