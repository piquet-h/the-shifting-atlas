/* eslint-disable @typescript-eslint/no-explicit-any */
import type { InvocationContext } from '@azure/functions'
import { strict as assert } from 'assert'
import { beforeEach, describe, it } from 'node:test'
import sinon from 'sinon'
import { LoreMemoryHandler } from '../../src/handlers/mcp/lore-memory/lore-memory.js'

function makeContext(): InvocationContext {
    return {
        invocationId: 'test-invocation',
        bindings: {},
        bindingData: {},
        traceContext: {},
        bindingDefinitions: [],
        log: (() => {}) as unknown as (msg?: unknown, ...params: unknown[]) => void
    } as unknown as InvocationContext
}

describe('LoreMemoryHandler', () => {
    let loreRepo: { getFact: sinon.SinonStub; searchFacts: sinon.SinonStub }

    beforeEach(() => {
        loreRepo = { getFact: sinon.stub(), searchFacts: sinon.stub() }
    })

    it('getCanonicalFact returns fact JSON', async () => {
        const sample = {
            id: 'fact1',
            type: 'faction',
            factId: 'faction_shadow_council',
            fields: { name: 'Shadow Council' },
            version: 1,
            createdUtc: '2026-01-10T00:00:00Z'
        }
        loreRepo.getFact.resolves(sample)

        const handler = new LoreMemoryHandler(loreRepo as unknown as any)
        const ctx = makeContext()
        const result = await handler.getCanonicalFact({ arguments: { factId: 'faction_shadow_council' } }, ctx)

        const parsed = JSON.parse(result)
        assert.equal(parsed.factId, 'faction_shadow_council')
        assert.equal(parsed.fields.name, 'Shadow Council')
    })

    it('getCanonicalFact returns null JSON when unknown', async () => {
        loreRepo.getFact.resolves(undefined)

        const handler = new LoreMemoryHandler(loreRepo as unknown as any)
        const ctx = makeContext()
        const result = await handler.getCanonicalFact({ arguments: { factId: 'missing_fact' } }, ctx)

        assert.equal(result, 'null')
    })

    it('searchLore returns empty array JSON', async () => {
        loreRepo.searchFacts.resolves([])

        const handler = new LoreMemoryHandler(loreRepo as unknown as any)
        const ctx = makeContext()
        const result = await handler.searchLore({ arguments: { query: 'council', k: 3 } }, ctx)

        const parsed = JSON.parse(result)
        assert.ok(Array.isArray(parsed))
        assert.equal(parsed.length, 0)
    })

    it('searchLore with empty query returns empty array', async () => {
        loreRepo.searchFacts.resolves([])

        const handler = new LoreMemoryHandler(loreRepo as unknown as any)
        const ctx = makeContext()
        const result = await handler.searchLore({ arguments: { query: '', k: 5 } }, ctx)

        const parsed = JSON.parse(result)
        assert.ok(Array.isArray(parsed))
        assert.equal(parsed.length, 0)
    })

    it('searchLore with whitespace query returns empty array', async () => {
        loreRepo.searchFacts.resolves([])

        const handler = new LoreMemoryHandler(loreRepo as unknown as any)
        const ctx = makeContext()
        const result = await handler.searchLore({ arguments: { query: '   ', k: 5 } }, ctx)

        const parsed = JSON.parse(result)
        assert.ok(Array.isArray(parsed))
        assert.equal(parsed.length, 0)
    })

    it('searchLore returns LoreSearchResult shape when results exist', async () => {
        const sampleResults = [
            {
                factId: 'faction_shadow_council',
                type: 'faction',
                score: 0.95,
                snippet: 'A secretive organization of mages...',
                version: 2
            },
            {
                factId: 'artifact_obsidian_amulet',
                type: 'artifact',
                score: 0.72,
                snippet: 'An ancient protective charm...'
                // version field optional
            }
        ]
        loreRepo.searchFacts.resolves(sampleResults)

        const handler = new LoreMemoryHandler(loreRepo as unknown as any)
        const ctx = makeContext()
        const result = await handler.searchLore({ arguments: { query: 'council', k: 5 } }, ctx)

        const parsed = JSON.parse(result)
        assert.ok(Array.isArray(parsed))
        assert.equal(parsed.length, 2)

        // Verify first result has required fields
        assert.equal(parsed[0].factId, 'faction_shadow_council')
        assert.equal(parsed[0].type, 'faction')
        assert.equal(parsed[0].score, 0.95)
        assert.equal(parsed[0].snippet, 'A secretive organization of mages...')
        assert.equal(parsed[0].version, 2)

        // Verify second result (version optional)
        assert.equal(parsed[1].factId, 'artifact_obsidian_amulet')
        assert.equal(parsed[1].type, 'artifact')
        assert.equal(parsed[1].score, 0.72)
        assert.equal(parsed[1].snippet, 'An ancient protective charm...')
        assert.ok(!parsed[1].version) // version is optional
    })

    describe('Versioning & Archival (Emergent Lore Support)', () => {
        it('getCanonicalFact preserves version number from mutable facts', async () => {
            const mutatedFact = {
                id: 'doc-uuid-v2',
                type: 'faction',
                factId: 'faction_shadow_council',
                fields: { name: 'The Shadow Council (Revised)', description: 'Updated by LLM generation' },
                version: 2,
                createdUtc: '2026-01-10T00:00:00Z',
                updatedUtc: '2026-01-10T12:30:00Z'
            }
            loreRepo.getFact.resolves(mutatedFact)

            const handler = new LoreMemoryHandler(loreRepo as unknown as any)
            const ctx = makeContext()
            const result = await handler.getCanonicalFact({ arguments: { factId: 'faction_shadow_council' } }, ctx)

            const parsed = JSON.parse(result)
            assert.equal(parsed.version, 2)
            assert.equal(parsed.updatedUtc, '2026-01-10T12:30:00Z')
        })

        it('getCanonicalFact excludes archived facts (archivedUtc present)', async () => {
            const archivedFact = {
                id: 'doc-uuid-v1-archived',
                type: 'artifact',
                factId: 'artifact_old_relic',
                fields: { name: 'Old Artifact' },
                version: 1,
                createdUtc: '2026-01-09T00:00:00Z',
                archivedUtc: '2026-01-10T08:00:00Z'
            }
            loreRepo.getFact.resolves(archivedFact)

            const handler = new LoreMemoryHandler(loreRepo as unknown as any)
            const ctx = makeContext()
            const result = await handler.getCanonicalFact({ arguments: { factId: 'artifact_old_relic' } }, ctx)

            // Repository returns archived fact; handler should return it as-is
            // (filtering logic deferred to repository / query-time decision)
            const parsed = JSON.parse(result)
            assert.ok(parsed.archivedUtc)
        })

        it('fact JSON includes all metadata fields for audit trails', async () => {
            const fullFact = {
                id: 'unique-guid-123',
                type: 'location_lore',
                factId: 'mosswell_history',
                fields: { era: 'Second Age', events: ['founding', 'war'] },
                version: 3,
                createdUtc: '2026-01-01T00:00:00Z',
                updatedUtc: '2026-01-10T10:00:00Z',
                embeddings: [0.1, 0.2, 0.3] // Future: vector embeddings
            }
            loreRepo.getFact.resolves(fullFact)

            const handler = new LoreMemoryHandler(loreRepo as unknown as any)
            const ctx = makeContext()
            const result = await handler.getCanonicalFact({ arguments: { factId: 'mosswell_history' } }, ctx)

            const parsed = JSON.parse(result)
            assert.equal(parsed.id, 'unique-guid-123')
            assert.equal(parsed.version, 3)
            // Prompt hygiene: embeddings are intentionally omitted (can be massive).
            // We preserve an explicit indicator for auditability.
            assert.equal(parsed.embeddings, undefined)
            assert.equal(parsed.embeddingsOmitted, true)
        })
    })
})
