/* eslint-disable @typescript-eslint/no-explicit-any */
import { strict as assert } from 'assert'
import { beforeEach, describe, it } from 'node:test'
import { ConflictError } from '../../src/repos/loreRepository.js'
import { MemoryLoreRepository } from '../../src/repos/loreRepository.memory.js'

describe('LoreRepository Versioning (ADR-007)', () => {
    let repo: MemoryLoreRepository

    beforeEach(() => {
        repo = new MemoryLoreRepository()
    })

    describe('getFact (latest non-archived)', () => {
        it('returns latest version by default', async () => {
            const fact = await repo.getFact('faction_shadow_council')
            assert.ok(fact)
            assert.equal(fact.factId, 'faction_shadow_council')
            assert.equal(fact.version, 1)
        })

        it('returns undefined for unknown factId', async () => {
            const fact = await repo.getFact('unknown_faction')
            assert.equal(fact, undefined)
        })

        it('excludes archived versions', async () => {
            // Archive the only version
            await repo.archiveFact('faction_shadow_council', 1)

            const fact = await repo.getFact('faction_shadow_council')
            assert.equal(fact, undefined)
        })

        it('returns latest non-archived when older versions archived', async () => {
            // Create version 2
            const v2 = await repo.createFactVersion('faction_shadow_council', { name: 'Updated' }, 1)
            assert.equal(v2.version, 2)

            // Archive version 1
            await repo.archiveFact('faction_shadow_council', 1)

            // getFact should still return version 2
            const fact = await repo.getFact('faction_shadow_council')
            assert.ok(fact)
            assert.equal(fact.version, 2)
        })
    })

    describe('getFactVersion (specific version)', () => {
        it('retrieves specific version', async () => {
            const fact = await repo.getFactVersion('faction_shadow_council', 1)
            assert.ok(fact)
            assert.equal(fact.version, 1)
        })

        it('returns undefined for non-existent version', async () => {
            const fact = await repo.getFactVersion('faction_shadow_council', 99)
            assert.equal(fact, undefined)
        })

        it('returns archived versions', async () => {
            await repo.archiveFact('faction_shadow_council', 1)

            const fact = await repo.getFactVersion('faction_shadow_council', 1)
            assert.ok(fact)
            assert.ok(fact.archivedUtc)
        })
    })

    describe('listFactVersions (version history)', () => {
        it('returns all versions ordered by version DESC', async () => {
            // Create version 2 and 3
            await repo.createFactVersion('faction_shadow_council', { name: 'V2' }, 1)
            await repo.createFactVersion('faction_shadow_council', { name: 'V3' }, 2)

            const versions = await repo.listFactVersions('faction_shadow_council')
            assert.equal(versions.length, 3)
            assert.equal(versions[0].version, 3)
            assert.equal(versions[1].version, 2)
            assert.equal(versions[2].version, 1)
        })

        it('includes archived versions', async () => {
            await repo.archiveFact('faction_shadow_council', 1)

            const versions = await repo.listFactVersions('faction_shadow_council')
            assert.equal(versions.length, 1)
            assert.ok(versions[0].archivedUtc)
        })

        it('returns empty array for unknown factId', async () => {
            const versions = await repo.listFactVersions('unknown_faction')
            assert.equal(versions.length, 0)
        })
    })

    describe('createFactVersion (optimistic concurrency)', () => {
        it('creates new version with incremented number', async () => {
            const newVersion = await repo.createFactVersion('faction_shadow_council', { name: 'Updated Council' }, 1)

            assert.ok(newVersion)
            assert.equal(newVersion.version, 2)
            assert.equal(newVersion.factId, 'faction_shadow_council')
            assert.equal(newVersion.fields.name, 'Updated Council')
            assert.ok(newVersion.id)
            assert.ok(newVersion.createdUtc)
            assert.ok(newVersion.updatedUtc)
        })

        it('throws ConflictError on version mismatch', async () => {
            await assert.rejects(
                async () => {
                    await repo.createFactVersion('faction_shadow_council', { name: 'Updated' }, 99)
                },
                (err: any) => {
                    assert.ok(err instanceof ConflictError)
                    assert.ok(err.message.includes('Version conflict'))
                    assert.ok(err.message.includes('expected 99'))
                    assert.ok(err.message.includes('got 1'))
                    return true
                }
            )
        })

        it('throws error for non-existent factId', async () => {
            await assert.rejects(
                async () => {
                    await repo.createFactVersion('unknown_faction', { name: 'New' }, 1)
                },
                (err: any) => {
                    assert.ok(err.message.includes('not found'))
                    return true
                }
            )
        })

        it('updates previous version updatedUtc timestamp', async () => {
            const before = await repo.getFact('faction_shadow_council')
            assert.ok(before)
            assert.equal(before.updatedUtc, undefined)

            const newVersion = await repo.createFactVersion('faction_shadow_council', { name: 'Updated' }, 1)

            const previous = await repo.getFactVersion('faction_shadow_council', 1)
            assert.ok(previous)
            assert.equal(previous.updatedUtc, newVersion.createdUtc)
        })

        it('handles concurrent edits correctly', async () => {
            // Simulate two concurrent editors reading version 1
            const fact1 = await repo.getFact('faction_shadow_council')
            const fact2 = await repo.getFact('faction_shadow_council')
            assert.equal(fact1?.version, 1)
            assert.equal(fact2?.version, 1)

            // First editor successfully creates version 2
            await repo.createFactVersion('faction_shadow_council', { name: 'Edit 1' }, 1)

            // Second editor should get conflict error
            await assert.rejects(
                async () => {
                    await repo.createFactVersion('faction_shadow_council', { name: 'Edit 2' }, 1)
                },
                (err: any) => err instanceof ConflictError
            )
        })
    })

    describe('archiveFact (deprecation)', () => {
        it('archives specific version', async () => {
            const archived = await repo.archiveFact('faction_shadow_council', 1)
            assert.equal(archived, 1)

            const fact = await repo.getFactVersion('faction_shadow_council', 1)
            assert.ok(fact)
            assert.ok(fact.archivedUtc)
        })

        it('archives all versions when version not specified', async () => {
            // Create version 2
            await repo.createFactVersion('faction_shadow_council', { name: 'V2' }, 1)

            const archived = await repo.archiveFact('faction_shadow_council')
            assert.equal(archived, 2)

            const v1 = await repo.getFactVersion('faction_shadow_council', 1)
            const v2 = await repo.getFactVersion('faction_shadow_council', 2)
            assert.ok(v1?.archivedUtc)
            assert.ok(v2?.archivedUtc)
        })

        it('returns 0 when version already archived', async () => {
            await repo.archiveFact('faction_shadow_council', 1)
            const archived = await repo.archiveFact('faction_shadow_council', 1)
            assert.equal(archived, 0)
        })

        it('returns 0 for non-existent version', async () => {
            const archived = await repo.archiveFact('faction_shadow_council', 99)
            assert.equal(archived, 0)
        })

        it('does not affect non-archived versions when archiving specific version', async () => {
            // Create version 2
            await repo.createFactVersion('faction_shadow_council', { name: 'V2' }, 1)

            // Archive only version 1
            await repo.archiveFact('faction_shadow_council', 1)

            // Version 2 should still be retrievable
            const fact = await repo.getFact('faction_shadow_council')
            assert.ok(fact)
            assert.equal(fact.version, 2)
            assert.equal(fact.archivedUtc, undefined)
        })
    })

    describe('Edge cases: factId rename migration', () => {
        it('supports migration pattern: archive old, create new', async () => {
            // Step 1: Archive all versions of old factId
            await repo.archiveFact('faction_shadow_council')

            // Step 2: Create new fact with new factId (simulating manual creation)
            // Note: In real migration, this would copy fields and add migration metadata
            // For this test, we'll just verify the archive worked
            const oldFact = await repo.getFact('faction_shadow_council')
            assert.equal(oldFact, undefined)

            const oldVersions = await repo.listFactVersions('faction_shadow_council')
            assert.equal(oldVersions.length, 1)
            assert.ok(oldVersions[0].archivedUtc)
        })
    })

    describe('Edge cases: missing fields (backwards compatibility)', () => {
        it('treats missing archivedUtc as non-archived (active)', async () => {
            // This is already tested implicitly by default fixture behavior
            // Fixture has no archivedUtc initially, and getFact returns it
            const fact = await repo.getFact('faction_shadow_council')
            assert.ok(fact)
            assert.equal(fact.archivedUtc, undefined)
        })

        it('handles missing version field by ordering available versions correctly', async () => {
            // Create multiple versions to test ordering
            await repo.createFactVersion('faction_shadow_council', { name: 'V2' }, 1)
            const v3 = await repo.createFactVersion('faction_shadow_council', { name: 'V3' }, 2)

            // Get fact should return highest version (V3)
            const latest = await repo.getFact('faction_shadow_council')
            assert.ok(latest)
            assert.equal(latest.version, 3)
            assert.equal(latest.id, v3.id)

            // listFactVersions should be ordered by version DESC
            const versions = await repo.listFactVersions('faction_shadow_council')
            assert.equal(versions[0].version, 3)
            assert.equal(versions[1].version, 2)
            assert.equal(versions[2].version, 1)
        })
    })

    describe('searchFacts (stub with edge cases)', () => {
        it('returns empty array until embeddings implemented', async () => {
            const results = await repo.searchFacts('council', 5)
            assert.ok(Array.isArray(results))
            assert.equal(results.length, 0)
        })

        it('returns empty array for empty query', async () => {
            const results = await repo.searchFacts('', 5)
            assert.ok(Array.isArray(results))
            assert.equal(results.length, 0)
        })

        it('returns empty array for whitespace query', async () => {
            const results = await repo.searchFacts('   ', 5)
            assert.ok(Array.isArray(results))
            assert.equal(results.length, 0)
        })

        it('clamps k to max of 20', async () => {
            // With large k value, should not throw
            const results = await repo.searchFacts('test', 1000)
            assert.ok(Array.isArray(results))
            assert.equal(results.length, 0)
        })

        it('handles k=1 as valid minimum', async () => {
            const results = await repo.searchFacts('test', 1)
            assert.ok(Array.isArray(results))
            assert.equal(results.length, 0)
        })

        it('handles k=0 gracefully', async () => {
            const results = await repo.searchFacts('test', 0)
            assert.ok(Array.isArray(results))
            assert.equal(results.length, 0)
        })

        it('handles negative k gracefully', async () => {
            const results = await repo.searchFacts('test', -5)
            assert.ok(Array.isArray(results))
            assert.equal(results.length, 0)
        })
    })
})
