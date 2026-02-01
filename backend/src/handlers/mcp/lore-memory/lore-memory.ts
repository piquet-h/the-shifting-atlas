import type { InvocationContext } from '@azure/functions'
import type { CanonicalFact } from '@piquet-h/shared'
import { Container, inject, injectable } from 'inversify'
import type { ILoreRepository } from '../../../repos/loreRepository.js'

type FieldTruncation = {
    path: string
    originalLength: number
}

const MAX_INLINE_STRING_CHARS = 512

function truncateStringsDeep(value: unknown, path: string, truncations: FieldTruncation[]): unknown {
    if (typeof value === 'string') {
        if (value.length > MAX_INLINE_STRING_CHARS) {
            truncations.push({ path, originalLength: value.length })
            return value.slice(0, MAX_INLINE_STRING_CHARS)
        }
        return value
    }

    if (Array.isArray(value)) {
        return value.map((v, i) => truncateStringsDeep(v, `${path}[${i}]`, truncations))
    }

    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(obj)) {
            out[k] = truncateStringsDeep(v, `${path}.${k}`, truncations)
        }
        return out
    }

    return value
}

function sanitizeCanonicalFactForPrompt(fact: CanonicalFact): Record<string, unknown> {
    const fieldTruncations: FieldTruncation[] = []

    const fields = truncateStringsDeep(fact.fields, 'fields', fieldTruncations) as Record<string, unknown>

    return {
        id: fact.id,
        type: fact.type,
        factId: fact.factId,
        version: fact.version,
        createdUtc: fact.createdUtc,
        updatedUtc: fact.updatedUtc,
        archivedUtc: fact.archivedUtc,
        fields,

        // MCP prompt hygiene:
        // - embeddings are never useful to the LLM (and can be massive)
        // - large string fields are truncated with explicit metadata
        embeddings: undefined,
        embeddingsOmitted: fact.embeddings ? true : undefined,
        fieldTruncations: fieldTruncations.length > 0 ? fieldTruncations : undefined
    }
}

/**
 * MCP-style handler class for canonical lore memory queries.
 * Read-only: no telemetry emission; returns JSON strings.
 */
@injectable()
export class LoreMemoryHandler {
    constructor(@inject('ILoreRepository') private loreRepo: ILoreRepository) {}

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async getCanonicalFact(toolArguments: unknown, _context: InvocationContext): Promise<string> {
        const toolArgs = toolArguments as { arguments: { factId: string } }
        const factId = toolArgs?.arguments?.factId
        if (!factId) return JSON.stringify(null)

        const fact = await this.loreRepo.getFact(factId)
        if (!fact) return JSON.stringify(null)
        return JSON.stringify(sanitizeCanonicalFactForPrompt(fact))
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async searchLore(toolArguments: unknown, _context: InvocationContext): Promise<string> {
        const toolArgs = toolArguments as { arguments: { query: string; k?: number } }
        const query = toolArgs?.arguments?.query || ''
        const k = toolArgs?.arguments?.k ?? 5
        const results = await this.loreRepo.searchFacts(query, k)
        return JSON.stringify(results)
    }
}

export async function getCanonicalFact(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(LoreMemoryHandler)
    return handler.getCanonicalFact(toolArguments, context)
}

export async function searchLore(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(LoreMemoryHandler)
    return handler.searchLore(toolArguments, context)
}
