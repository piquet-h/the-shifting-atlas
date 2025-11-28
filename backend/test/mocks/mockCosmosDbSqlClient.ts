/**
 * Mock Cosmos DB SQL Client for testing
 * Provides in-memory storage without requiring Azure credentials
 */

import type { Container, Database } from '@azure/cosmos'
import type { ICosmosDbSqlClient } from '../../src/repos/base/cosmosDbSqlClient.js'

/**
 * Creates a mock Cosmos DB SQL Client with in-memory storage
 * @param initialData - Map of container name to entity map (keyed by partition:id)
 */
export function createMockCosmosDbSqlClient<T extends { id: string }>(
    initialData: Record<string, Record<string, T>> = {}
): ICosmosDbSqlClient {
    const containers = new Map<string, Map<string, T>>()

    // Initialize containers with provided data
    for (const [containerName, entities] of Object.entries(initialData)) {
        const containerMap = new Map<string, T>()
        for (const [, entity] of Object.entries(entities)) {
            // Store with partition key (assuming id is the partition key for most cases)
            containerMap.set(`${entity.id}:${entity.id}`, entity)
        }
        containers.set(containerName, containerMap)
    }

    return {
        getDatabase: (): Database => {
            return {
                id: 'test-database',
                container: (id: string) => ({ id })
            } as Database
        },
        getContainer: (containerName: string): Container => {
            if (!containers.has(containerName)) {
                containers.set(containerName, new Map())
            }

            const containerData = containers.get(containerName)!

            return {
                id: containerName,
                item: (id: string, partitionKey: string) => ({
                    read: async () => {
                        const key = `${partitionKey}:${id}`
                        const resource = containerData.get(key)

                        if (!resource) {
                            const error = new Error('Not Found') as Error & { code: number }
                            error.code = 404
                            throw error
                        }

                        return {
                            resource,
                            requestCharge: 1.0,
                            statusCode: 200
                        }
                    },
                    replace: async <TItem extends T>(entity: TItem) => {
                        const key = `${partitionKey}:${id}`
                        if (!containerData.has(key)) {
                            const error = new Error('Not Found') as Error & { code: number }
                            error.code = 404
                            throw error
                        }

                        containerData.set(key, entity as unknown as T)
                        return {
                            resource: entity,
                            requestCharge: 5.0,
                            statusCode: 200
                        }
                    },
                    delete: async () => {
                        const key = `${partitionKey}:${id}`
                        const existed = containerData.has(key)

                        if (!existed) {
                            const error = new Error('Not Found') as Error & { code: number }
                            error.code = 404
                            throw error
                        }

                        containerData.delete(key)
                        return {
                            requestCharge: 5.0,
                            statusCode: 204
                        }
                    }
                }),
                items: {
                    create: async <TItem extends T>(entity: TItem & { id: string }) => {
                        const key = `${entity.id}:${entity.id}`

                        if (containerData.has(key)) {
                            const error = new Error('Conflict') as Error & { code: number }
                            error.code = 409
                            throw error
                        }

                        containerData.set(key, entity as unknown as T)
                        return {
                            resource: entity,
                            requestCharge: 5.0,
                            statusCode: 201
                        }
                    },
                    upsert: async <TItem extends T>(entity: TItem & { id: string }) => {
                        const key = `${entity.id}:${entity.id}`
                        containerData.set(key, entity as unknown as T)

                        return {
                            resource: entity,
                            requestCharge: 5.5,
                            statusCode: 200
                        }
                    },
                    query: () => ({
                        fetchNext: async () => {
                            const resources = Array.from(containerData.values())
                            return {
                                resources,
                                requestCharge: Math.max(1.0, resources.length * 2.0)
                            }
                        },
                        hasMoreResults: () => false
                    })
                }
            } as unknown as Container
        }
    }
}
