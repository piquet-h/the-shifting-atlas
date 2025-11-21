import { strict as assert } from 'assert'
import { classifyTestId, isTestId } from '../cleanup-test-artifacts.mjs'

// Basic age classification logic is embedded in main; this test exercises refined prefix logic only.

function runTests() {
    console.log('▶ cleanup-test-artifacts prefix refinement')
    assert.equal(isTestId('test-player-123'), true, 'prefix test-player- should match (strong)')
    assert.equal(isTestId('e2e-abc'), true, 'prefix e2e- should match')
    assert.equal(isTestId('demo-player-xyz'), true, 'demo-player- should match')
    assert.equal(isTestId('regular-test-player-xyz'), false, 'mid-string test-player should not match')
    assert.equal(isTestId('notest-player-xyz'), false, 'no prefix should not match')
    assert.equal(isTestId(''), false, 'empty string not match')
    // Weak prefix heuristics
    const weak = classifyTestId('test-shortslug')
    assert.equal(weak.isTest, true, 'weak prefix should classify')
    assert.equal(weak.tier, 'weak', 'weak tier expected')
    const notWeakLong = classifyTestId('test-THISHASUPPERCAS')
    assert.equal(notWeakLong.isTest, false, 'upper-case tail invalidates weak classification')
    const notWeakTailLong = classifyTestId('test-averyverylongtailthatexceeds20chars')
    assert.equal(notWeakTailLong.isTest, false, 'long tail invalidates weak classification')
    const strong = classifyTestId('test-player-abc123')
    assert.equal(strong.tier, 'strong', 'strong tier expected for explicit prefix')
    console.log('✔ prefix refinement tests passed')
}

runTests()
