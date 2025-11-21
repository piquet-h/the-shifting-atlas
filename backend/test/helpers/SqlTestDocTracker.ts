import type { ICosmosDbSqlClient } from '../../src/repos/base/cosmosDbSqlClient.js'

export interface SqlTrackedDoc {
    container: string
    partitionKey: string
    id: string
}

/**
 * Tracks SQL API documents created during a test run for cleanup.
 * Tests or fixtures call register() after creating/upserting documents.
 * Cleanup attempts best-effort deletion; failures are logged but do not throw.
 */
export class SqlTestDocTracker {
    private docs: SqlTrackedDoc[] = []
    private client: ICosmosDbSqlClient

    constructor(client: ICosmosDbSqlClient) {
        this.client = client
    }

    register(container: string, partitionKey: string, id: string): void {
        this.docs.push({ container, partitionKey, id })
    }

    unregister(container: string, partitionKey: string, id: string): void {
        this.docs = this.docs.filter((d) => !(d.container === container && d.partitionKey === partitionKey && d.id === id))
    }

    getTracked(): SqlTrackedDoc[] {
        return [...this.docs]
    }

    async cleanup(): Promise<{ deleted: number; errors: Array<{ id: string; error: string }> }> {
        let deleted = 0
        const errors: Array<{ id: string; error: string }> = []
        for (const doc of this.docs) {
            try {
                const container = this.client.getContainer(doc.container)
                await container.item(doc.id, doc.partitionKey).delete()
                deleted++
            } catch (e) {
                errors.push({ id: doc.id, error: e instanceof Error ? e.message : String(e) })
            }
        }
        // Clear after attempt
        this.docs = []
        return { deleted, errors }
    }
}
