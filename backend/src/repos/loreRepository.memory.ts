import type { CanonicalFact } from '@piquet-h/shared'
import { injectable } from 'inversify'
import { ILoreRepository } from './loreRepository.js'

/**
 * In-memory implementation of ILoreRepository for local dev & tests.
 * Contains minimal hardcoded fixtures for MCP validation testing.
 */
@injectable()
export class MemoryLoreRepository implements ILoreRepository {
    private facts: Map<string, CanonicalFact>

    constructor() {
        // Minimal fixtures: 1 faction, 1 artifact for integration testing
        const fixtures: CanonicalFact[] = [
            {
                id: 'fact_shadow_council_001',
                type: 'faction',
                factId: 'faction_shadow_council',
                fields: {
                    name: 'The Shadow Council',
                    description: 'A secretive organization of mages operating from the ruins beneath Mosswell.',
                    alignment: 'neutral',
                    influence: 'regional'
                },
                version: 1,
                createdUtc: '2026-01-10T10:00:00Z'
            },
            {
                id: 'fact_obsidian_amulet_001',
                type: 'artifact',
                factId: 'artifact_obsidian_amulet',
                fields: {
                    name: 'Obsidian Amulet of Warding',
                    description: 'An ancient protective charm crafted from volcanic glass, said to deflect curses.',
                    rarity: 'rare',
                    last_seen: 'Mosswell Market, 3rd Age'
                },
                version: 1,
                createdUtc: '2026-01-10T10:00:00Z'
            }
        ]

        this.facts = new Map(fixtures.map((fact) => [fact.factId, fact]))
    }

    async getFact(factId: string): Promise<CanonicalFact | undefined> {
        return this.facts.get(factId)
    }

    async searchFacts(query: string, k: number = 5): Promise<CanonicalFact[]> {
        // Stub implementation: returns empty array until embeddings infrastructure exists
        // Future: Vector similarity search using embeddings field for query: ${query}, top-k: ${k}
        void query
        void k
        return []
    }
}
