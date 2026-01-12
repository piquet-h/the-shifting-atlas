import type { InvocationContext } from '@azure/functions'
import { Container, injectable } from 'inversify'

/**
 * MCP-style handler class for world-context tools.
 *
 * Foundation-only in #514: provides a basic health tool so the surface is
 * discoverable/testable before adding real context operations in #515/#516.
 */
@injectable()
export class WorldContextHandler {
    async health(toolArguments: unknown, context: InvocationContext): Promise<string> {
        void toolArguments
        void context // part of the MCP handler signature; intentionally unused

        return JSON.stringify({ ok: true, service: 'world-context' })
    }
}

export async function health(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(WorldContextHandler)
    return handler.health(toolArguments, context)
}
