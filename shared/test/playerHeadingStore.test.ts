import assert from 'node:assert/strict'
import test from 'node:test'
import {getPlayerHeadingStore} from '../src/direction/playerHeadingStore.js'

test('PlayerHeadingStore: get/set basic functionality', () => {
    const store = getPlayerHeadingStore()
    const playerGuid = 'test-player-123'
    
    // Initially no heading
    assert.equal(store.getLastHeading(playerGuid), undefined)
    
    // Set heading
    store.setLastHeading(playerGuid, 'north')
    assert.equal(store.getLastHeading(playerGuid), 'north')
    
    // Update heading
    store.setLastHeading(playerGuid, 'east')
    assert.equal(store.getLastHeading(playerGuid), 'east')
})

test('PlayerHeadingStore: multiple players', () => {
    const store = getPlayerHeadingStore()
    const player1 = 'player-1'
    const player2 = 'player-2'
    
    store.setLastHeading(player1, 'north')
    store.setLastHeading(player2, 'south')
    
    assert.equal(store.getLastHeading(player1), 'north')
    assert.equal(store.getLastHeading(player2), 'south')
})

test('PlayerHeadingStore: clear heading', () => {
    const store = getPlayerHeadingStore()
    const playerGuid = 'test-player-clear'
    
    store.setLastHeading(playerGuid, 'west')
    assert.equal(store.getLastHeading(playerGuid), 'west')
    
    store.clearHeading(playerGuid)
    assert.equal(store.getLastHeading(playerGuid), undefined)
})

test('PlayerHeadingStore: getAllHeadings', () => {
    const store = getPlayerHeadingStore()
    
    // Clear any existing state (since singleton)
    const existing = store.getAllHeadings()
    for (const guid of Object.keys(existing)) {
        store.clearHeading(guid)
    }
    
    store.setLastHeading('player-a', 'north')
    store.setLastHeading('player-b', 'south')
    
    const all = store.getAllHeadings()
    assert.equal(all['player-a'], 'north')
    assert.equal(all['player-b'], 'south')
    assert.equal(Object.keys(all).length, 2)
})

test('PlayerHeadingStore: singleton behavior', () => {
    const store1 = getPlayerHeadingStore()
    const store2 = getPlayerHeadingStore()
    
    assert.strictEqual(store1, store2, 'Should return same singleton instance')
    
    const playerGuid = 'singleton-test'
    store1.setLastHeading(playerGuid, 'up')
    assert.equal(store2.getLastHeading(playerGuid), 'up')
})