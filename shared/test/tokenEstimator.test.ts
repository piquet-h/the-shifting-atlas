import assert from 'node:assert'
import test from 'node:test'
import { createCharDiv4Estimator, MAX_SIM_PROMPT_CHARS } from '../src/tokenEstimator.js'

test('TokenEstimator interface: should expose estimate method and name property', () => {
    const estimator = createCharDiv4Estimator()

    assert.ok(typeof estimator.estimate === 'function')
    assert.ok(typeof estimator.name === 'string')
})

test('CharDiv4Estimator: should have name "charDiv4"', () => {
    const estimator = createCharDiv4Estimator()

    assert.strictEqual(estimator.name, 'charDiv4')
})

test('estimate method: should return 0 for empty string', () => {
    const estimator = createCharDiv4Estimator()

    assert.strictEqual(estimator.estimate(''), 0)
})

test('estimate method: should return correct token count for small text', () => {
    const estimator = createCharDiv4Estimator()

    // "Hello" = 5 chars, 5/4 = 1.25 → rounds up to 2
    assert.strictEqual(estimator.estimate('Hello'), 2)

    // "Hi" = 2 chars, 2/4 = 0.5 → rounds up to 1
    assert.strictEqual(estimator.estimate('Hi'), 1)

    // "Test" = 4 chars, 4/4 = 1 → exactly 1
    assert.strictEqual(estimator.estimate('Test'), 1)
})

test('estimate method: should handle text at small boundaries', () => {
    const estimator = createCharDiv4Estimator()

    // 1 char → 1/4 = 0.25 → rounds up to 1
    assert.strictEqual(estimator.estimate('a'), 1)

    // 4 chars → 4/4 = 1 → exactly 1
    assert.strictEqual(estimator.estimate('abcd'), 1)

    // 5 chars → 5/4 = 1.25 → rounds up to 2
    assert.strictEqual(estimator.estimate('abcde'), 2)

    // 8 chars → 8/4 = 2 → exactly 2
    assert.strictEqual(estimator.estimate('abcdefgh'), 2)
})

test('estimate method: should handle Unicode surrogate pairs correctly (emoji)', () => {
    const estimator = createCharDiv4Estimator()

    // Single emoji "😀" is represented as 2 UTF-16 code units (surrogate pair)
    // Length = 2, 2/4 = 0.5 → rounds up to 1
    assert.strictEqual(estimator.estimate('😀'), 1)

    // Multiple emoji: "😀😀😀" = 6 code units, 6/4 = 1.5 → rounds up to 2
    assert.strictEqual(estimator.estimate('😀😀😀'), 2)

    // Mixed ASCII + emoji: "Hello 😀" = 7 code units, 7/4 = 1.75 → rounds up to 2
    assert.strictEqual(estimator.estimate('Hello 😀'), 2)
})

test('estimate method: should handle mixed newline/tab characters consistently', () => {
    const estimator = createCharDiv4Estimator()

    // "Hello\nWorld" = 11 chars (including newline), 11/4 = 2.75 → rounds up to 3
    assert.strictEqual(estimator.estimate('Hello\nWorld'), 3)

    // "Tab\tTest" = 8 chars (including tab), 8/4 = 2 → exactly 2
    assert.strictEqual(estimator.estimate('Tab\tTest'), 2)

    // Mixed whitespace: "Line1\n\tLine2\r\n" = 15 chars, 15/4 = 3.75 → rounds up to 4
    assert.strictEqual(estimator.estimate('Line1\n\tLine2\r\n'), 4)
})

test('estimate method: should handle very long text correctly', () => {
    const estimator = createCharDiv4Estimator()

    // Create text at MAX_SIM_PROMPT_CHARS boundary
    const longText = 'a'.repeat(MAX_SIM_PROMPT_CHARS)
    const expectedTokens = Math.ceil(MAX_SIM_PROMPT_CHARS / 4)

    assert.strictEqual(estimator.estimate(longText), expectedTokens)
})

test('estimate method: should handle text exceeding MAX_SIM_PROMPT_CHARS', () => {
    const estimator = createCharDiv4Estimator()

    // Create text beyond MAX_SIM_PROMPT_CHARS
    // (Note: estimator itself doesn't cap; this tests that it still calculates correctly)
    const veryLongText = 'a'.repeat(MAX_SIM_PROMPT_CHARS + 1000)
    const expectedTokens = Math.ceil((MAX_SIM_PROMPT_CHARS + 1000) / 4)

    assert.strictEqual(estimator.estimate(veryLongText), expectedTokens)
})

test('MAX_SIM_PROMPT_CHARS constant: should be defined as 128000', () => {
    assert.strictEqual(MAX_SIM_PROMPT_CHARS, 128_000)
})

test('MAX_SIM_PROMPT_CHARS constant: should approximate 32K tokens at charDiv4 ratio', () => {
    const estimator = createCharDiv4Estimator()

    // At charDiv4 ratio: 128K chars / 4 = 32K tokens
    const text = 'a'.repeat(MAX_SIM_PROMPT_CHARS)
    const tokens = estimator.estimate(text)

    assert.strictEqual(tokens, 32_000)
})

test('Input capping documentation: estimator name != "production" indicates simulation mode', () => {
    const estimator = createCharDiv4Estimator()

    // Simulation flag: estimator.name !== 'production' means heuristic mode
    assert.notStrictEqual(estimator.name, 'production')
    assert.strictEqual(estimator.name, 'charDiv4')
})

test('Input capping documentation: MAX_SIM_PROMPT_CHARS as capping threshold for downstream consumers', () => {
    // Downstream code should check:
    // if (text.length > MAX_SIM_PROMPT_CHARS) {
    //     text = text.substring(0, MAX_SIM_PROMPT_CHARS)
    //     // emit AI.Cost.InputCapped event
    // }
    // const tokens = estimator.estimate(text)

    assert.ok(MAX_SIM_PROMPT_CHARS > 0)
    assert.strictEqual(MAX_SIM_PROMPT_CHARS, 128_000)
})

test('Edge cases: should handle strings with only whitespace', () => {
    const estimator = createCharDiv4Estimator()

    // "   " = 3 chars, 3/4 = 0.75 → rounds up to 1
    assert.strictEqual(estimator.estimate('   '), 1)

    // "\n\n\n" = 3 chars, 3/4 = 0.75 → rounds up to 1
    assert.strictEqual(estimator.estimate('\n\n\n'), 1)
})

test('Edge cases: should handle strings with special characters', () => {
    const estimator = createCharDiv4Estimator()

    // "!@#$%^&*()" = 10 chars, 10/4 = 2.5 → rounds up to 3
    assert.strictEqual(estimator.estimate('!@#$%^&*()'), 3)
})

test('Edge cases: should handle multi-byte Unicode characters (non-emoji)', () => {
    const estimator = createCharDiv4Estimator()

    // "你好世界" (Chinese) = 4 chars (each is 1 UTF-16 code unit)
    // 4/4 = 1 → exactly 1
    assert.strictEqual(estimator.estimate('你好世界'), 1)

    // "Привет" (Russian) = 6 chars, 6/4 = 1.5 → rounds up to 2
    assert.strictEqual(estimator.estimate('Привет'), 2)
})

test('Edge cases: should return non-negative integers only', () => {
    const estimator = createCharDiv4Estimator()
    const testCases = ['', 'a', 'test', 'longer text here']

    testCases.forEach((text) => {
        const result = estimator.estimate(text)
        assert.ok(result >= 0, `Result should be non-negative for: "${text}"`)
        assert.ok(Number.isInteger(result), `Result should be integer for: "${text}"`)
    })
})
