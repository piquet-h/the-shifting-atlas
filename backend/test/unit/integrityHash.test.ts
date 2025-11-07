import assert from 'node:assert'
import { describe, test } from 'node:test'
import { computeIntegrityHash, verifyIntegrityHash } from '../../src/repos/utils/integrityHash.js'

describe('Integrity Hash Utilities', () => {
    test('computeIntegrityHash produces consistent SHA-256 hash', () => {
        const content = 'The ancient door creaks on rusted hinges.'
        const hash1 = computeIntegrityHash(content)
        const hash2 = computeIntegrityHash(content)

        assert.equal(hash1, hash2, 'Same content should produce identical hashes')
        assert.equal(hash1.length, 64, 'SHA-256 hash should be 64 hex characters')
        assert.match(hash1, /^[0-9a-f]{64}$/, 'Hash should be lowercase hexadecimal')
    })

    test('computeIntegrityHash produces different hashes for different content', () => {
        const content1 = 'A gentle breeze rustles through the trees.'
        const content2 = 'A gentle breeze rustles through the leaves.'

        const hash1 = computeIntegrityHash(content1)
        const hash2 = computeIntegrityHash(content2)

        assert.notEqual(hash1, hash2, 'Different content should produce different hashes')
    })

    test('computeIntegrityHash handles empty string', () => {
        const hash = computeIntegrityHash('')
        assert.equal(hash.length, 64, 'Empty string should still produce valid SHA-256 hash')
    })

    test('computeIntegrityHash handles very large content', () => {
        // Create a large description (10KB+)
        const largeContent = 'A'.repeat(10000) + ' The end.'
        const hash = computeIntegrityHash(largeContent)

        assert.equal(hash.length, 64, 'Large content should produce valid SHA-256 hash')
        assert.match(hash, /^[0-9a-f]{64}$/, 'Large content hash should be valid hexadecimal')
    })

    test('computeIntegrityHash is sensitive to whitespace', () => {
        const content1 = 'The door is open.'
        const content2 = 'The door  is open.' // Extra space

        const hash1 = computeIntegrityHash(content1)
        const hash2 = computeIntegrityHash(content2)

        assert.notEqual(hash1, hash2, 'Whitespace differences should produce different hashes')
    })

    test('verifyIntegrityHash returns true for matching content', () => {
        const content = 'Mist hangs heavy in the air.'
        const hash = computeIntegrityHash(content)

        const isValid = verifyIntegrityHash(content, hash)
        assert.equal(isValid, true, 'Hash should match original content')
    })

    test('verifyIntegrityHash returns false for modified content', () => {
        const originalContent = 'The room is dark and cold.'
        const modifiedContent = 'The room is dark and warm.'
        const hash = computeIntegrityHash(originalContent)

        const isValid = verifyIntegrityHash(modifiedContent, hash)
        assert.equal(isValid, false, 'Hash should not match modified content')
    })

    test('verifyIntegrityHash returns false for corrupted hash', () => {
        const content = 'Ancient runes cover the walls.'
        const validHash = computeIntegrityHash(content)
        const corruptedHash = validHash.slice(0, -4) + 'xxxx' // Corrupt last 4 chars

        const isValid = verifyIntegrityHash(content, corruptedHash)
        assert.equal(isValid, false, 'Corrupted hash should not validate')
    })

    test('computeIntegrityHash handles Unicode characters', () => {
        const content = '古い扉が錆びた蝶番できしむ音を立てる。🚪'
        const hash = computeIntegrityHash(content)

        assert.equal(hash.length, 64, 'Unicode content should produce valid SHA-256 hash')
        assert.match(hash, /^[0-9a-f]{64}$/, 'Unicode content hash should be valid hexadecimal')

        // Verify consistency
        const hash2 = computeIntegrityHash(content)
        assert.equal(hash, hash2, 'Unicode content should produce consistent hashes')
    })
})
