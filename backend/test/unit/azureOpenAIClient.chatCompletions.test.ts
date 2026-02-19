import assert from 'node:assert'
import { describe, test } from 'node:test'
import { AzureOpenAIClient } from '../../src/services/azureOpenAIClient.js'

function createClientWithStub(stub: unknown): AzureOpenAIClient {
    const client = new AzureOpenAIClient({
        endpoint: 'https://aif-atlas-cldf.cognitiveservices.azure.com/',
        model: 'scene-phi-4-mini',
        apiVersion: '2024-10-21'
    })

    // Override the underlying SDK client with a deterministic stub.
    ;(client as unknown as { client: unknown }).client = stub

    return client
}

describe('AzureOpenAIClient - chat completions', () => {
    test('uses chat.completions and returns message content', async () => {
        let calledChat = 0
        const stub = {
            chat: {
                completions: {
                    create: async () => ({
                        calledChat: (calledChat += 1),
                        choices: [{ message: { content: 'Hello from chat' } }],
                        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 }
                    })
                }
            }
        }

        const client = createClientWithStub(stub)
        const result = await client.generate({ prompt: 'hi', maxTokens: 5, temperature: 0, timeoutMs: 50 })

        assert.ok(result)
        assert.strictEqual(result.content, 'Hello from chat')
        assert.deepStrictEqual(result.tokenUsage, { prompt: 1, completion: 2, total: 3 })
        assert.strictEqual(calledChat, 1)
    })

    test('falls back to legacy completions when chat returns 404', async () => {
        let calledChat = 0
        let calledLegacy = 0
        const err = Object.assign(new Error('not found'), { status: 404, code: 'NotFound', type: 'not_found' })

        const stub = {
            chat: {
                completions: {
                    create: async () => {
                        calledChat += 1
                        throw err
                    }
                }
            },
            completions: {
                create: async () => ({
                    calledLegacy: (calledLegacy += 1),
                    choices: [{ text: 'Hello from legacy' }],
                    usage: { prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 }
                })
            }
        }

        const client = createClientWithStub(stub)
        const result = await client.generate({ prompt: 'hi', maxTokens: 5, temperature: 0, timeoutMs: 50 })

        assert.ok(result)
        assert.strictEqual(result.content, 'Hello from legacy')
        assert.strictEqual(calledChat, 1, 'chat should be attempted first')
        assert.strictEqual(calledLegacy, 1, 'legacy completions should be used as fallback')
    })

    test('returns null (empty) when chat returns empty message', async () => {
        let calledChat = 0
        const stub = {
            chat: {
                completions: {
                    create: async () => ({
                        calledChat: (calledChat += 1),
                        choices: [{ message: { content: '   ' } }],
                        usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 }
                    })
                }
            }
        }

        const client = createClientWithStub(stub)
        const result = await client.generate({ prompt: 'hi', maxTokens: 5, temperature: 0, timeoutMs: 50 })

        assert.strictEqual(result, null)
        assert.strictEqual(calledChat, 1)
    })
})
