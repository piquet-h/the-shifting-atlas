import type { InvocationContext } from '@azure/functions'
import { Container, inject, injectable } from 'inversify'
import { v4 as uuidv4 } from 'uuid'
import {
    AreaGenerationOrchestrator,
    LocationNotFoundError,
    MAX_BUDGET_LOCATIONS,
    type AreaGenerationMode
} from '../../../services/AreaGenerationOrchestrator.js'
import { isValidGuid } from '../../utils/validation.js'

const VALID_MODES: readonly AreaGenerationMode[] = ['urban', 'wilderness', 'auto']

type ToolArgs<T> = { arguments?: T }

type TriggerAreaGenerationArgs = {
    mode?: string
    budgetLocations?: number | string
    anchorLocationId?: string
    realmHints?: string
    idempotencyKey?: string
}

/**
 * MCP-style handler for world operations (operator tools).
 *
 * Provides a safe operator-facing entrypoint to trigger bounded area generation
 * without handcrafting queue envelopes manually.
 */
@injectable()
export class WorldOperationsHandler {
    constructor(@inject(AreaGenerationOrchestrator) private readonly orchestrator: AreaGenerationOrchestrator) {}

    /**
     * Trigger bounded area generation from an anchor location.
     *
     * Validates all inputs, emits a fresh correlationId and a stable idempotency
     * key, then delegates to AreaGenerationOrchestrator.
     *
     * Returns a JSON object with:
     * - ok: boolean
     * - correlationId: string (UUID, fresh per call)
     * - idempotencyKey: string (stable when caller supplies one; prevents duplicate expansion)
     * - enqueuedCount / anchorLocationId / terrain / clamped / maxBudget on success
     * - error / message on failure
     */
    // context is part of the MCP handler signature contract; the DI container is retrieved
    // by the exported wrapper function (triggerAreaGeneration below), not by this method.
    async triggerAreaGeneration(toolArguments: unknown, context: InvocationContext): Promise<string> {
        void context
        const toolArgs = toolArguments as ToolArgs<TriggerAreaGenerationArgs>
        const args = toolArgs?.arguments ?? {}

        // --- Validate mode (required) ---
        const mode = args.mode
        if (!mode || !(VALID_MODES as string[]).includes(mode)) {
            return JSON.stringify({
                ok: false,
                error: 'ValidationError',
                message: `mode must be one of: ${VALID_MODES.join(', ')}`
            })
        }

        // --- Validate budgetLocations (required, positive integer) ---
        const rawBudget = typeof args.budgetLocations === 'string' ? parseInt(args.budgetLocations, 10) : args.budgetLocations
        if (typeof rawBudget !== 'number' || !Number.isInteger(rawBudget) || rawBudget < 1) {
            return JSON.stringify({
                ok: false,
                error: 'ValidationError',
                message: 'budgetLocations must be a positive integer'
            })
        }

        // --- Validate anchorLocationId (optional, must be GUID if provided) ---
        const anchorLocationId =
            typeof args.anchorLocationId === 'string' && args.anchorLocationId.trim() !== '' ? args.anchorLocationId.trim() : undefined
        if (anchorLocationId !== undefined && !isValidGuid(anchorLocationId)) {
            return JSON.stringify({
                ok: false,
                error: 'InvalidLocationId',
                message: 'anchorLocationId must be a valid GUID when provided'
            })
        }

        // --- Parse realmHints (optional, comma-separated string → string[]) ---
        const realmHints =
            typeof args.realmHints === 'string' && args.realmHints.trim() !== ''
                ? args.realmHints
                      .split(',')
                      .map((h) => h.trim())
                      .filter(Boolean)
                : undefined

        // --- Idempotency key (optional; stable key prevents duplicate expansion) ---
        const idempotencyKey =
            typeof args.idempotencyKey === 'string' && args.idempotencyKey.trim() !== '' ? args.idempotencyKey.trim() : undefined

        // Generate a fresh correlationId for every call so enqueued events are traceable.
        const correlationId = uuidv4()

        try {
            const result = await this.orchestrator.orchestrate(
                {
                    anchorLocationId,
                    mode: mode as AreaGenerationMode,
                    budgetLocations: rawBudget,
                    realmHints,
                    idempotencyKey
                },
                correlationId
            )

            return JSON.stringify({
                ok: true,
                correlationId,
                enqueuedCount: result.enqueuedCount,
                anchorLocationId: result.anchorLocationId,
                terrain: result.terrain,
                idempotencyKey: result.idempotencyKey,
                clamped: result.clamped,
                maxBudget: MAX_BUDGET_LOCATIONS
            })
        } catch (error) {
            if (error instanceof LocationNotFoundError) {
                return JSON.stringify({
                    ok: false,
                    correlationId,
                    error: 'LocationNotFound',
                    message: error.message
                })
            }
            return JSON.stringify({
                ok: false,
                correlationId,
                error: 'InternalError',
                message: error instanceof Error ? error.message : String(error)
            })
        }
    }
}

export async function triggerAreaGeneration(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(WorldOperationsHandler)
    return handler.triggerAreaGeneration(toolArguments, context)
}
