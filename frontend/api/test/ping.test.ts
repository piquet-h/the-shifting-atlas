import assert from 'node:assert'
import { test } from 'node:test'

test('Hello World Test', () => {
    const message = 'Hello, World!'
    assert.strictEqual(message, 'Hello, World!', 'The message should be "Hello, World!"')
})
