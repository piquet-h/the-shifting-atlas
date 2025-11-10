/**
 * Unit tests for inventory repository implementations.
 * Tests both in-memory and SQL repository patterns.
 */

import assert from 'node:assert'
import { describe, test, beforeEach } from 'node:test'
import { MemoryInventoryRepository } from '../../src/repos/inventoryRepository.memory.js'
import type { InventoryItem } from '@piquet-h/shared/types/inventoryRepository'

describe('Inventory Repository', () => {
    let repo: MemoryInventoryRepository

    beforeEach(() => {
        repo = new MemoryInventoryRepository()
    })

    describe('addItem', () => {
        test('should add new item to inventory', async () => {
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: 'player-1',
                itemType: 'sword',
                quantity: 1,
                acquiredAt: new Date().toISOString(),
                metadata: { damage: 10 }
            }

            const result = await repo.addItem(item)

            assert.ok(result)
            assert.strictEqual(result.id, item.id)
            assert.strictEqual(result.playerId, item.playerId)
            assert.strictEqual(result.itemType, 'sword')
            assert.strictEqual(result.quantity, 1)
        })

        test('should update existing item (upsert)', async () => {
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: 'player-1',
                itemType: 'potion',
                quantity: 5,
                acquiredAt: new Date().toISOString()
            }

            await repo.addItem(item)

            // Update quantity
            const updated = { ...item, quantity: 10 }
            const result = await repo.addItem(updated)

            assert.strictEqual(result.quantity, 10)
        })

        test('should handle item with metadata', async () => {
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: 'player-1',
                itemType: 'armor',
                quantity: 1,
                acquiredAt: new Date().toISOString(),
                metadata: {
                    defense: 20,
                    durability: 100,
                    enchantments: ['fire_resistance', 'thorns']
                }
            }

            const result = await repo.addItem(item)

            assert.ok(result.metadata)
            assert.strictEqual(result.metadata.defense, 20)
            assert.strictEqual(result.metadata.durability, 100)
            assert.deepStrictEqual(result.metadata.enchantments, ['fire_resistance', 'thorns'])
        })

        test('should truncate oversized metadata', async () => {
            // Create metadata that exceeds 100KB
            const largeMetadata = { data: 'x'.repeat(101000) }
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: 'player-1',
                itemType: 'scroll',
                quantity: 1,
                acquiredAt: new Date().toISOString(),
                metadata: largeMetadata
            }

            const result = await repo.addItem(item)

            assert.ok(result.metadata)
            assert.strictEqual(result.metadata.truncated, true)
            assert.ok(result.metadata.warning)
        })
    })

    describe('removeItem', () => {
        test('should remove item from inventory', async () => {
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: 'player-1',
                itemType: 'sword',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            }

            await repo.addItem(item)
            const removed = await repo.removeItem(item.id, item.playerId)

            assert.strictEqual(removed, true)

            const retrieved = await repo.getItem(item.id, item.playerId)
            assert.strictEqual(retrieved, null)
        })

        test('should return false when item does not exist', async () => {
            const removed = await repo.removeItem('nonexistent-id', 'player-1')

            assert.strictEqual(removed, false)
        })

        test('should only remove item with matching playerId', async () => {
            const item1: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: 'player-1',
                itemType: 'sword',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            }

            await repo.addItem(item1)

            // Try to remove with wrong playerId
            const removed = await repo.removeItem(item1.id, 'player-2')
            assert.strictEqual(removed, false)

            // Verify item still exists for correct player
            const retrieved = await repo.getItem(item1.id, 'player-1')
            assert.ok(retrieved)
        })
    })

    describe('listItems', () => {
        test('should list all items for a player', async () => {
            const playerId = 'player-1'

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

            await repo.addItem(item1)
            await repo.addItem(item2)

            const items = await repo.listItems(playerId)

            assert.strictEqual(items.length, 2)
            assert.ok(items.some((i) => i.itemType === 'sword'))
            assert.ok(items.some((i) => i.itemType === 'potion'))
        })

        test('should return empty array when player has no items', async () => {
            const items = await repo.listItems('player-empty')

            assert.ok(Array.isArray(items))
            assert.strictEqual(items.length, 0)
        })

        test('should only return items for specified player', async () => {
            const item1: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: 'player-1',
                itemType: 'sword',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            }

            const item2: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: 'player-2',
                itemType: 'shield',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            }

            await repo.addItem(item1)
            await repo.addItem(item2)

            const player1Items = await repo.listItems('player-1')
            const player2Items = await repo.listItems('player-2')

            assert.strictEqual(player1Items.length, 1)
            assert.strictEqual(player1Items[0].itemType, 'sword')

            assert.strictEqual(player2Items.length, 1)
            assert.strictEqual(player2Items[0].itemType, 'shield')
        })

        test('should handle player with many items (no unbounded limit)', async () => {
            const playerId = 'player-many'
            const itemCount = 100

            for (let i = 0; i < itemCount; i++) {
                const item: InventoryItem = {
                    id: crypto.randomUUID(),
                    playerId,
                    itemType: `item-${i}`,
                    quantity: 1,
                    acquiredAt: new Date().toISOString()
                }
                await repo.addItem(item)
            }

            const items = await repo.listItems(playerId)

            assert.strictEqual(items.length, itemCount)
        })
    })

    describe('getItem', () => {
        test('should get item by ID', async () => {
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: 'player-1',
                itemType: 'sword',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            }

            await repo.addItem(item)

            const retrieved = await repo.getItem(item.id, item.playerId)

            assert.ok(retrieved)
            assert.strictEqual(retrieved.id, item.id)
            assert.strictEqual(retrieved.itemType, 'sword')
        })

        test('should return null when item does not exist', async () => {
            const retrieved = await repo.getItem('nonexistent-id', 'player-1')

            assert.strictEqual(retrieved, null)
        })

        test('should return null when playerId does not match', async () => {
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: 'player-1',
                itemType: 'sword',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            }

            await repo.addItem(item)

            const retrieved = await repo.getItem(item.id, 'player-2')

            assert.strictEqual(retrieved, null)
        })
    })

    describe('Edge Cases', () => {
        test('should handle zero quantity items', async () => {
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: 'player-1',
                itemType: 'broken_sword',
                quantity: 0,
                acquiredAt: new Date().toISOString()
            }

            const result = await repo.addItem(item)

            assert.strictEqual(result.quantity, 0)

            // Verify item exists with quantity 0
            const retrieved = await repo.getItem(item.id, item.playerId)
            assert.ok(retrieved)
            assert.strictEqual(retrieved.quantity, 0)
        })

        test('should handle item without metadata', async () => {
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: 'player-1',
                itemType: 'basic_sword',
                quantity: 1,
                acquiredAt: new Date().toISOString()
            }

            const result = await repo.addItem(item)

            assert.ok(result)
            assert.strictEqual(result.metadata, undefined)
        })

        test('should handle item with empty metadata', async () => {
            const item: InventoryItem = {
                id: crypto.randomUUID(),
                playerId: 'player-1',
                itemType: 'plain_item',
                quantity: 1,
                acquiredAt: new Date().toISOString(),
                metadata: {}
            }

            const result = await repo.addItem(item)

            assert.ok(result.metadata)
            assert.strictEqual(Object.keys(result.metadata).length, 0)
        })
    })
})
