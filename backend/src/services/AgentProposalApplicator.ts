/**
 * AgentProposalApplicator — applies validated agent proposals to the world.
 *
 * This service is the authoritative write gate for the write-lite agent sandbox.
 * Only proposals that have already passed validateAgentProposal() should be
 * passed here.  The service itself does no additional schema validation; it
 * trusts that the caller validated first.
 *
 * Supported action types (mirrors PROPOSAL_ALLOWED_ACTION_TYPES):
 *   - Layer.Add          → setLayerForLocation (params.locationId, layerType, layerContent)
 *   - Ambience.Generate  → setLayerForLocation with 'ambient' type and deterministic content
 *   - NPC.Dialogue       → telemetry-only for now (persistence in a later milestone)
 *
 * All writes include metadata.authoredBy='agent' so subsequent sense phases can
 * distinguish agent-generated layers from human/AI-generated ones.
 */

import type { ProposedAction } from '@piquet-h/shared'
import type { LayerType } from '@piquet-h/shared/types/layerRepository'
import { inject, injectable } from 'inversify'
import type { ILayerRepository } from '../repos/layerRepository.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'

export interface ActionApplicationResult {
    /** Whether the action was durably applied (true) or skipped/no-op (false). */
    applied: boolean
    actionType: string
    scopeKey: string
    /** Present when a layer was created. */
    layerId?: string
    /** Human-readable reason for non-applied outcomes. */
    reason?: string
}

export interface IAgentProposalApplicator {
    /**
     * Apply a single validated ProposedAction to the world.
     *
     * @param action        - Validated action (schema + rules must already pass)
     * @param correlationId - Propagated correlation ID for telemetry tracing
     * @param tick          - Current world clock tick (used as effectiveFromTick)
     */
    apply(action: ProposedAction, correlationId: string, tick: number): Promise<ActionApplicationResult>
}

/**
 * Deterministic ambient-content pool.
 * Phrases are generic enough to work for any location while still
 * conveying atmospheric flavour.  A hash of locationId + stepSequence
 * selects from the pool so the same (location, step) always yields the
 * same phrase (idempotency-friendly).
 */
const AMBIENT_POOL = [
    'A stillness settles over the place, as if the world holds its breath.',
    'The air carries a faint trace of something distant and unnamed.',
    'The surroundings have taken on a quiet, watchful quality.',
    'A subtle energy hums through the location, barely perceptible.',
    'The ambient mood shifts imperceptibly, like a change in the wind.',
    'Silence weighs upon the space—not empty, but full of unspoken potential.',
    'A gentle rustling passes through; here, the world is still becoming itself.',
    'The light seems slightly different here, though no cause is apparent.'
] as const

/**
 * Pick a deterministic ambient phrase from the pool.
 * Uses djb2 hash over the combined `${locationId}:${salt}` string so that
 * identical locationIds with different salts always produce distinct hashes.
 * @param locationId   - Location UUID (contributes to hash)
 * @param salt         - Additional integer (e.g. entityId hash ^ stepSequence) for variety
 */
export function pickAmbientContent(locationId: string, salt: number): string {
    const input = `${locationId}:${salt}`
    let hash = 5381
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash) ^ input.charCodeAt(i)
        hash = hash >>> 0 // keep 32-bit unsigned
    }
    return AMBIENT_POOL[hash % AMBIENT_POOL.length]
}

@injectable()
export class AgentProposalApplicator implements IAgentProposalApplicator {
    constructor(
        @inject('ILayerRepository') private readonly layerRepo: ILayerRepository,
        @inject(TelemetryService) private readonly telemetry: TelemetryService
    ) {}

    async apply(action: ProposedAction, correlationId: string, tick: number): Promise<ActionApplicationResult> {
        switch (action.actionType) {
            case 'Layer.Add':
                return this.applyLayerAdd(action, tick, correlationId)
            case 'Ambience.Generate':
                return this.applyAmbienceGenerate(action, tick, correlationId)
            case 'NPC.Dialogue':
                return this.applyNpcDialogue(action, correlationId)
            default:
                return { applied: false, actionType: action.actionType, scopeKey: action.scopeKey, reason: 'unhandled-action-type' }
        }
    }

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    private async applyLayerAdd(action: ProposedAction, tick: number, correlationId: string): Promise<ActionApplicationResult> {
        const params = action.params as Record<string, unknown>
        const locationId = String(params['locationId'] ?? '')
        const layerContent = String(params['layerContent'] ?? '')
        const rawLayerType = String(params['layerType'] ?? 'ambient') as LayerType

        const layer = await this.layerRepo.setLayerForLocation(locationId, rawLayerType, tick, null, layerContent, {
            authoredBy: 'agent',
            proposalScope: action.scopeKey,
            correlationId
        })

        this.telemetry.trackGameEvent(
            'World.Layer.Added',
            { locationId, layerType: rawLayerType, layerId: layer.id, source: 'agent', correlationId },
            { correlationId }
        )

        return { applied: true, actionType: 'Layer.Add', scopeKey: action.scopeKey, layerId: layer.id }
    }

    private async applyAmbienceGenerate(action: ProposedAction, tick: number, correlationId: string): Promise<ActionApplicationResult> {
        const params = action.params as Record<string, unknown>
        const locationId = String(params['locationId'] ?? '')
        // Allow callers to inject explicit content (e.g. in tests); otherwise pick deterministically.
        const content =
            typeof params['content'] === 'string' && params['content'] ? params['content'] : pickAmbientContent(locationId, tick)

        const layer = await this.layerRepo.setLayerForLocation(locationId, 'ambient', tick, null, content, {
            authoredBy: 'agent',
            proposalScope: action.scopeKey,
            correlationId
        })

        this.telemetry.trackGameEvent(
            'World.Layer.Added',
            { locationId, layerType: 'ambient', layerId: layer.id, source: 'agent-ambience', correlationId },
            { correlationId }
        )

        return { applied: true, actionType: 'Ambience.Generate', scopeKey: action.scopeKey, layerId: layer.id }
    }

    private applyNpcDialogue(action: ProposedAction, correlationId: string): ActionApplicationResult {
        // NPC.Dialogue persistence is deferred to a later milestone.
        // Record the fact that dialogue was triggered via telemetry so it's
        // observable without requiring a dedicated storage layer.
        const params = action.params as Record<string, unknown>
        const npcId = String(params['npcId'] ?? 'unknown')

        this.telemetry.trackGameEvent(
            'World.Event.Processed',
            { actionType: 'NPC.Dialogue', npcId, scopeKey: action.scopeKey, source: 'agent', correlationId },
            { correlationId }
        )

        return { applied: true, actionType: 'NPC.Dialogue', scopeKey: action.scopeKey, reason: 'dialogue-recorded' }
    }
}
