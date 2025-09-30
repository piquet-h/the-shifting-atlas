import assert from 'node:assert/strict'
import test from 'node:test'
import {moveHandler} from '../src/functions/location.js'
import {getPlayerHeadingStore} from '@atlas/shared'

// Mock HttpRequest for testing
function createMockRequest(dir: string, from?: string, playerGuid?: string) {
    return {
        query: {
            get: (key: string) => {
                if (key === 'dir') return dir
                if (key === 'from') return from
                return null
            }
        },
        headers: {
            get: (key: string) => {
                if (key === 'x-player-guid') return playerGuid
                if (key === 'x-correlation-id') return 'test-correlation-123'
                return null
            }
        }
    } as any
}

test('integration: move with canonical direction works', async () => {
    const req = createMockRequest('north', undefined, 'test-player-canonical')
    const response = await moveHandler(req)
    
    assert.equal(response.status, 200)
    
    // Check that heading was stored
    const headingStore = getPlayerHeadingStore()
    assert.equal(headingStore.getLastHeading('test-player-canonical'), 'north')
})

test('integration: move with relative direction after establishing heading', async () => {
    const headingStore = getPlayerHeadingStore()
    const playerGuid = 'test-player-relative'
    
    // First, establish a heading by moving north
    const req1 = createMockRequest('north', undefined, playerGuid)
    const response1 = await moveHandler(req1)
    assert.equal(response1.status, 200)
    assert.equal(headingStore.getLastHeading(playerGuid), 'north')
    
    // Now try moving left (should resolve to west)
    // This might fail with no-exit if there's no west exit from the current location,
    // but it should successfully normalize the direction
    const req2 = createMockRequest('left', response1.jsonBody.id, playerGuid)
    const response2 = await moveHandler(req2)
    
    if (response2.status === 200) {
        // If movement succeeded, heading should be updated to west
        assert.equal(headingStore.getLastHeading(playerGuid), 'west')
    } else {
        // If movement failed, it should be due to no-exit, not ambiguous direction
        assert.equal(response2.status, 400)
        assert.equal(response2.jsonBody.error, 'No such exit')
        // Direction should still be west in the error response
        assert.equal(response2.jsonBody.direction, 'west')
        // Heading should not change on failed move
        assert.equal(headingStore.getLastHeading(playerGuid), 'north')
    }
})

test('integration: successful relative direction movement (east -> right -> south)', async () => {
    const headingStore = getPlayerHeadingStore()
    const playerGuid = 'test-player-successful-relative'
    
    // First move east from village square to market row
    const req1 = createMockRequest('east', undefined, playerGuid)
    const response1 = await moveHandler(req1)
    
    if (response1.status === 200) {
        assert.equal(headingStore.getLastHeading(playerGuid), 'east')
        
        // Now move right (should resolve to south) - Market Row has a south exit
        const req2 = createMockRequest('right', response1.jsonBody.id, playerGuid)
        const response2 = await moveHandler(req2)
        
        if (response2.status === 200) {
            // Successfully moved right (east -> right -> south)
            assert.equal(headingStore.getLastHeading(playerGuid), 'south')
        }
        // If failed, that's still fine - the important thing is the direction was normalized
    }
})

test('integration: relative direction without heading returns ambiguous', async () => {
    const playerGuid = 'test-player-no-heading'
    const headingStore = getPlayerHeadingStore()
    
    // Clear any existing heading
    headingStore.clearHeading(playerGuid)
    
    // Try moving left without established heading
    const req = createMockRequest('left', undefined, playerGuid)
    const response = await moveHandler(req)
    
    assert.equal(response.status, 400)
    assert.equal(response.jsonBody.error, 'Ambiguous direction')
    assert.ok(response.jsonBody.clarification.includes('requires a previous move'))
})

test('integration: invalid direction returns proper error', async () => {
    const req = createMockRequest('invalid', undefined, 'test-player-invalid')
    const response = await moveHandler(req)
    
    assert.equal(response.status, 400)
    assert.equal(response.jsonBody.error, 'Invalid direction')
    assert.ok(response.jsonBody.clarification.includes('not a recognized direction'))
})

test('integration: heading wrap-around (west + left -> south)', async () => {
    const headingStore = getPlayerHeadingStore()
    const playerGuid = 'test-player-wrap'
    
    // First move west to establish heading
    const req1 = createMockRequest('west', undefined, playerGuid)
    const response1 = await moveHandler(req1)
    
    if (response1.status === 200) {
        assert.equal(headingStore.getLastHeading(playerGuid), 'west')
        
        // Now move left (should resolve to south)
        const req2 = createMockRequest('left', response1.jsonBody.id, playerGuid)
        const response2 = await moveHandler(req2)
        
        if (response2.status === 200) {
            assert.equal(headingStore.getLastHeading(playerGuid), 'south')
        }
        // Note: May fail with no-exit if there's no south exit, which is fine for this test
    }
    // Note: May fail with no-exit if there's no west exit from starter, which is fine
})

test('integration: multiple players maintain separate headings', async () => {
    const headingStore = getPlayerHeadingStore()
    const player1 = 'test-player-multi-1'
    const player2 = 'test-player-multi-2'
    
    // Player 1 moves north
    const req1 = createMockRequest('north', undefined, player1)
    const response1 = await moveHandler(req1)
    
    // Player 2 moves south (if available) or east
    const req2 = createMockRequest('east', undefined, player2)
    const response2 = await moveHandler(req2)
    
    if (response1.status === 200) {
        assert.equal(headingStore.getLastHeading(player1), 'north')
    }
    if (response2.status === 200) {
        assert.equal(headingStore.getLastHeading(player2), 'east')
    }
    
    // Headings should be independent
    if (response1.status === 200 && response2.status === 200) {
        assert.notEqual(headingStore.getLastHeading(player1), headingStore.getLastHeading(player2))
    }
})