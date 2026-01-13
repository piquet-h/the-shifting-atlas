import type { CanonicalFact } from '@piquet-h/shared'
import { injectable } from 'inversify'
import { v4 as uuidv4 } from 'uuid'
import { ConflictError, ILoreRepository } from './loreRepository.js'

/**
 * In-memory implementation of ILoreRepository for local dev & tests.
 * Contains minimal hardcoded fixtures for MCP validation testing.
 *
 * Versioning Implementation (ADR-007):
 * - Stores all versions in memory Map keyed by `${factId}:${version}`
 * - getFact returns latest non-archived version
 * - Supports optimistic concurrency for version creation
 */
@injectable()
export class MemoryLoreRepository implements ILoreRepository {
    private factVersions: Map<string, CanonicalFact>

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

        this.factVersions = new Map(fixtures.map((fact) => [this.makeKey(fact.factId, fact.version), fact]))
    }

    private makeKey(factId: string, version: number): string {
        return `${factId}:${version}`
    }

    async getFact(factId: string): Promise<CanonicalFact | undefined> {
        const versions = await this.listFactVersions(factId)
        // Return latest non-archived version
        return versions.find((fact) => !fact.archivedUtc)
    }

    async getFactVersion(factId: string, version: number): Promise<CanonicalFact | undefined> {
        return this.factVersions.get(this.makeKey(factId, version))
    }

    async listFactVersions(factId: string): Promise<CanonicalFact[]> {
        const versions: CanonicalFact[] = []
        for (const [key, fact] of this.factVersions.entries()) {
            if (key.startsWith(`${factId}:`)) {
                versions.push(fact)
            }
        }
        // Sort by version DESC (newest first)
        return versions.sort((a, b) => b.version - a.version)
    }

    async createFactVersion(factId: string, fields: Record<string, unknown>, expectedCurrentVersion: number): Promise<CanonicalFact> {
        const current = await this.getFact(factId)
        if (!current) {
            throw new Error(`Fact ${factId} not found`)
        }
        if (current.version !== expectedCurrentVersion) {
            throw new ConflictError(`Version conflict: expected ${expectedCurrentVersion}, got ${current.version}`)
        }

        const newVersion: CanonicalFact = {
            id: uuidv4(),
            type: current.type,
            factId,
            fields,
            version: current.version + 1,
            createdUtc: new Date().toISOString(),
            updatedUtc: new Date().toISOString()
        }

        this.factVersions.set(this.makeKey(factId, newVersion.version), newVersion)

        // Optionally update previous version's updatedUtc to mark supersession
        current.updatedUtc = newVersion.createdUtc
        this.factVersions.set(this.makeKey(factId, current.version), current)

        return newVersion
    }

    async archiveFact(factId: string, version?: number): Promise<number> {
        const timestamp = new Date().toISOString()
        let archived = 0

        if (version !== undefined) {
            // Archive specific version
            const fact = await this.getFactVersion(factId, version)
            if (fact && !fact.archivedUtc) {
                fact.archivedUtc = timestamp
                this.factVersions.set(this.makeKey(factId, version), fact)
                archived = 1
            }
        } else {
            // Archive all versions
            const versions = await this.listFactVersions(factId)
            for (const fact of versions) {
                if (!fact.archivedUtc) {
                    fact.archivedUtc = timestamp
                    this.factVersions.set(this.makeKey(factId, fact.version), fact)
                    archived++
                }
            }
        }

        return archived
    }

    async searchFacts(query: string, k: number = 5): Promise<CanonicalFact[]> {
        // Stub implementation: returns empty array until embeddings infrastructure exists
        // Future: Vector similarity search using embeddings field for query: ${query}, top-k: ${k}
        void query
        void k
        return []
    }
}
