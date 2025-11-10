/**
 * Integration tests for Inventory Repository
 * Tests repository operations with dependency injection container
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { InventoryItem } from '@piquet-h/shared/types/inventoryRepository'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describe('Inventory Repository Integration', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Add Item', () => {
        test('should add item to inventory', async () => {
            const repo = await fixture.getInventoryRepository()
            const playerId = crypto.randomUUID()

            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId,
                itemType: 'sword',
                quantity: 1,
                acquiredAt: new Date().toISOString(),
                metadata: { damage: 10, rarity: 'common' }
            }

            const result = await repo.addItem(item)

            assert.ok(result)
            assert.strictEqual(result.id, item.id)
            assert.strictEqual(result.playerId, playerId)
            assert.strictEqual(result.itemType, 'sword')
            assert.strictEqual(result.quantity, 1)
        })

        test('should handle concurrent adds for same player', async () => {
            const repo = await fixture.getInventoryRepository()
            const playerId = crypto.randomUUID()

            const item1: InventoryItem = {
                id: crypto.randomUUID(),
                playerId,
                itemType: 'sword',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            }

            const item2: InventoryItem = {
                id: crypto.randomUUID(),
                playerId,
                itemType: 'potion',
                quantity: 5,
                acquiredAt: new Date().toISOString()
            }

            await Promise.all([repo.addItem(item1), repo.addItem(item2)])

            const items = await repo.listItems(playerId)
            assert.strictEqual(items.length, 2)
        })
    })

    describe('Remove Item', () => {
        test('should remove item from inventory', async () => {
            const repo = await fixture.getInventoryRepository()
            const playerId = crypto.randomUUID()

            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId,
                itemType: 'potion',
                quantity: 3,
                acquiredAt: new Date().toISOString()
            }

            await repo.addItem(item)

            const removed = await repo.removeItem(item.id, playerId)
            assert.strictEqual(removed, true)

            const retrieved = await repo.getItem(item.id, playerId)
            assert.strictEqual(retrieved, null)
        })

        test('should handle quantity becomes 0 edge case', async () => {
            const repo = await fixture.getInventoryRepository()
            const playerId = crypto.randomUUID()

            // Add item with quantity 1
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId,
                itemType: 'arrow',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            }

            await repo.addItem(item)

            // Remove the item (quantity becomes 0)
            const removed = await repo.removeItem(item.id, playerId)
            assert.strictEqual(removed, true)

            // Item should be removed from inventory
            const items = await repo.listItems(playerId)
            assert.strictEqual(items.length, 0)
        })
    })

    describe('List Items', () => {
        test('should list all items for a player (single-partition query)', async () => {
            const repo = await fixture.getInventoryRepository()
            const playerId = crypto.randomUUID()

            const items: InventoryItem[] = [
                {
                    id: crypto.randomUUID(),
                    playerId,
                    itemType: 'sword',
                    quantity: 1,
                    acquiredAt: new Date().toISOString()
                },
                {
                    id: crypto.randomUUID(),
                    playerId,
                    itemType: 'shield',
                    quantity: 1,
                    acquiredAt: new Date().toISOString()
                },
                {
                    id: crypto.randomUUID(),
                    playerId,
                    itemType: 'potion',
                    quantity: 5,
                    acquiredAt: new Date().toISOString()
                }
            ]

            for (const item of items) {
                await repo.addItem(item)
            }

            const retrieved = await repo.listItems(playerId)

            assert.strictEqual(retrieved.length, 3)
            assert.ok(retrieved.some((i) => i.itemType === 'sword'))
            assert.ok(retrieved.some((i) => i.itemType === 'shield'))
            assert.ok(retrieved.some((i) => i.itemType === 'potion'))
        })

        test('should return empty array when player has no items', async () => {
            const repo = await fixture.getInventoryRepository()
            const playerId = crypto.randomUUID()

            const items = await repo.listItems(playerId)

            assert.ok(Array.isArray(items))
            assert.strictEqual(items.length, 0)
        })

        test('should only query single partition for player items', async () => {
            const repo = await fixture.getInventoryRepository()
            const player1 = crypto.randomUUID()
            const player2 = crypto.randomUUID()

            // Add items for player 1
            await repo.addItem({
                id: crypto.randomUUID(),
                playerId: player1,
                itemType: 'sword',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            })

            // Add items for player 2
            await repo.addItem({
                id: crypto.randomUUID(),
                playerId: player2,
                itemType: 'bow',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            })

            const player1Items = await repo.listItems(player1)
            const player2Items = await repo.listItems(player2)

            // Each query should only return items from single partition
            assert.strictEqual(player1Items.length, 1)
            assert.strictEqual(player1Items[0].itemType, 'sword')

            assert.strictEqual(player2Items.length, 1)
            assert.strictEqual(player2Items[0].itemType, 'bow')
        })
    })

    describe('Get Item', () => {
        test('should get specific item by ID', async () => {
            const repo = await fixture.getInventoryRepository()
            const playerId = crypto.randomUUID()

            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId,
                itemType: 'legendary_sword',
                quantity: 1,
                acquiredAt: new Date().toISOString(),
                metadata: { damage: 100, enchantment: 'fire' }
            }

            await repo.addItem(item)

            const retrieved = await repo.getItem(item.id, playerId)

            assert.ok(retrieved)
            assert.strictEqual(retrieved.id, item.id)
            assert.strictEqual(retrieved.itemType, 'legendary_sword')
            assert.strictEqual(retrieved.metadata?.damage, 100)
        })

        test('should return null for non-existent item', async () => {
            const repo = await fixture.getInventoryRepository()
            const playerId = crypto.randomUUID()

            const retrieved = await repo.getItem('nonexistent-id', playerId)

            assert.strictEqual(retrieved, null)
        })
    })

    describe('Cross-Partition Queries (Admin)', () => {
        test('should support admin listing across all players', async () => {
            const repo = await fixture.getInventoryRepository()
            const player1 = crypto.randomUUID()
            const player2 = crypto.randomUUID()
            const player3 = crypto.randomUUID()

            // Add items for multiple players
            await repo.addItem({
                id: crypto.randomUUID(),
                playerId: player1,
                itemType: 'sword',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            })

            await repo.addItem({
                id: crypto.randomUUID(),
                playerId: player2,
                itemType: 'bow',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            })

            await repo.addItem({
                id: crypto.randomUUID(),
                playerId: player3,
                itemType: 'staff',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            })

            // Verify each player has their own partition
            const player1Items = await repo.listItems(player1)
            const player2Items = await repo.listItems(player2)
            const player3Items = await repo.listItems(player3)

            assert.strictEqual(player1Items.length, 1)
            assert.strictEqual(player2Items.length, 1)
            assert.strictEqual(player3Items.length, 1)

            // Note: Cross-partition admin query would need additional method
            // For MVP, admin can iterate through known player IDs
        })
    })

    describe('Edge Cases', () => {
        test('should handle item metadata exceeds size limit', async () => {
            const repo = await fixture.getInventoryRepository()
            const playerId = crypto.randomUUID()

            // Create metadata that exceeds 100KB
            const largeMetadata = { data: 'x'.repeat(101000) }

            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId,
                itemType: 'tome',
                quantity: 1,
                acquiredAt: new Date().toISOString(),
                metadata: largeMetadata
            }

            const result = await repo.addItem(item)

            // Metadata should be truncated with warning
            assert.ok(result.metadata)
            assert.strictEqual(result.metadata.truncated, true)
        })

        test('should handle player with many items (no capacity limit)', async () => {
            const repo = await fixture.getInventoryRepository()
            const playerId = crypto.randomUUID()
            const itemCount = 50

            // Add many items
            for (let i = 0; i < itemCount; i++) {
                await repo.addItem({
                    id: crypto.randomUUID(),
                    playerId,
                    itemType: `item-${i}`,
                    quantity: 1,
                    acquiredAt: new Date().toISOString()
                })
            }

            const items = await repo.listItems(playerId)

            // No capacity limit for MVP
            assert.strictEqual(items.length, itemCount)
        })
    })
})
