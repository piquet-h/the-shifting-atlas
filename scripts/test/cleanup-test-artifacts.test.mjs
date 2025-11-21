import assert from 'assert'
import { isTestId } from '../cleanup-test-artifacts.mjs'

// Basic classifier tests

const positives = [
    'test-loc-hub',
    'e2e-test-loc-hub',
    'e2e-abc123',
    'test-player-xyz',
    'demo-player-01'
]

const negatives = [
    'prod-loc-hub',
    'player-regular-123',
    'location-abc',
    '',
    null,
    undefined,
    'random-id'
]

for (const id of positives) {
    assert.equal(isTestId(id), true, `Expected positive match for ${id}`)
}
for (const id of negatives) {
    assert.equal(isTestId(id), false, `Expected negative match for ${id}`)
}

console.log('✓ isTestId classifier basic tests passed')
