import type { InvocationContext } from '@azure/functions'
import { Container, inject, injectable } from 'inversify'
import type { ILoreRepository } from '../../../repos/loreRepository.js'

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
        return JSON.stringify(fact ?? null)
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
