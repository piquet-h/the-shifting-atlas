/**
 * World Event Envelope Schema (Zod validation)
 *
 * Authoritative envelope shape for async world evolution via Service Bus queues.
 * Validates the envelope defined in docs/architecture/world-event-contract.md.
 * Ensures idempotency, traceability, and correlation across async world processors.
 *
 * This is the primary contract for queue-based event processing, distinct from the
 * legacy WorldEvent interface in domainModels.ts which is used for SQL persistence
 * with status tracking. Key differences:
 *
 * WorldEventEnvelope (this file):
 * - Queue contract for async processing
 * - Zod schema validation
 * - Namespaced types ('Player.Move', 'World.Exit.Create')
 * - Actor envelope (kind + id)
 * - Idempotency keys for at-least-once delivery
 * - Causation chains (causationId)
 * - Versioned envelope structure
 *
 * WorldEvent (domainModels.ts):
 * - SQL persistence model for event history documents
 * - Simple type strings ('PlayerMoved', 'LocationDiscovered')
 * - Status tracking (Pending, Processing, Completed, Failed)
 * - Retry counters and scheduled execution
 *
 * See docs/architecture/world-event-contract.md for complete specification.
 */
import { z } from 'zod'

/**
 * Actor kind controlled vocabulary
 */
export const ActorKindSchema = z.enum(['player', 'npc', 'system', 'ai'])
export type ActorKind = z.infer<typeof ActorKindSchema>

/**
 * Actor envelope sub-schema
 */
export const ActorSchema = z.object({
    kind: ActorKindSchema,
    id: z.string().uuid().optional()
})
export type Actor = z.infer<typeof ActorSchema>

/**
 * World Event Type namespace (initial types per contract doc)
 *
 * Design Philosophy: These event types capture WHAT changed (deterministic state),
 * not HOW to describe it (AI-driven immersion). Handlers persist structured
 * metadata; AI generates narrative descriptions when players observe the world.
 *
 * Event Payload Documentation:
 *
 * 'World.Location.BatchGenerate' - Request batch generation of connected locations
 *   Payload: {
 *     rootLocationId: UUID (string) - Starting location anchor for expansion
 *     terrain: TerrainType (enum) - Terrain type for generated locations
 *     arrivalDirection: Direction (enum) - Direction player arrived from (spatial hint)
 *     expansionDepth: number - How many layers deep to expand (range: 1-3)
 *     batchSize: number - Target number of locations to generate (range: 1-20)
 *   }
 *
 * 'World.Agent.Step' - Autonomous agent sense→decide→act step for an entity (queue-only hook)
 *   Payload: {
 *     entityId: UUID (string) - Entity running the step (NPC, AI agent)
 *     entityKind: string - 'npc' | 'ai-agent' | 'player'
 *     locationId: UUID (string) - Current location context
 *     stepSequence: number - Monotonic step counter for ordering / idempotency
 *     reason?: string - Why this step was triggered (optional, for diagnostics)
 *   }
 *   Idempotency key: 'agent-step:{entityId}:{stepSequence}'
 *   Version: 1
 */
export const WorldEventTypeSchema = z.enum([
    'Player.Move',
    'Player.Look',
    'NPC.Tick',
    'World.Ambience.Generated',
    'World.Exit.Create',
    'World.Location.BatchGenerate',
    'Location.Environment.Changed',
    'Quest.Proposed',
    'Navigation.Exit.GenerationHint', // Exit generation hint queued for processing
    'World.Agent.Step' // Autonomous agent step (sense→decide→act) - queue-only runtime hook
])
export type WorldEventType = z.infer<typeof WorldEventTypeSchema>

/**
 * Complete World Event Envelope Schema
 *
 * Validates required fields per contract doc Table "Required Fields".
 * Optional fields (ingestedUtc, causationId) are marked as such.
 *
 * Cross-field constraint:
 * - Player-actor envelopes (actor.kind === 'player') MUST include payload.actionIntent.
 *   This ensures replay and audit can always recover what the player tried to do.
 *   Null, undefined, or empty-object actionIntent values are all rejected.
 */
export const WorldEventEnvelopeSchema = z
    .object({
        eventId: z.string().uuid(),
        type: WorldEventTypeSchema,
        occurredUtc: z.string().datetime(),
        ingestedUtc: z.string().datetime().optional(),
        actor: ActorSchema,
        correlationId: z.string().uuid(),
        causationId: z.string().uuid().optional(),
        idempotencyKey: z.string().min(1),
        version: z.number().int().positive(),
        payload: z.record(z.string(), z.unknown())
    })
    .superRefine((data, ctx) => {
        if (data.actor.kind === 'player') {
            const actionIntent = data.payload['actionIntent']
            const isMissing = actionIntent === undefined || actionIntent === null
            const isEmpty =
                !isMissing &&
                typeof actionIntent === 'object' &&
                !Array.isArray(actionIntent) &&
                Object.keys(actionIntent as Record<string, unknown>).length === 0

            if (isMissing || isEmpty) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Player-actor envelopes require payload.actionIntent for replay and audit trail',
                    path: ['payload', 'actionIntent']
                })
            }
        }
    })

export type WorldEventEnvelope = z.infer<typeof WorldEventEnvelopeSchema>

/**
 * Validate a world event envelope.
 * Returns validated data on success or throws ZodError with details on failure.
 */
export function validateWorldEventEnvelope(data: unknown): WorldEventEnvelope {
    return WorldEventEnvelopeSchema.parse(data)
}

/**
 * Safe validation that returns success/error tuple instead of throwing.
 */
export function safeValidateWorldEventEnvelope(
    data: unknown
): { success: true; data: WorldEventEnvelope } | { success: false; error: z.ZodError<unknown> } {
    const result = WorldEventEnvelopeSchema.safeParse(data)
    if (result.success) {
        return { success: true, data: result.data }
    }
    return { success: false, error: result.error }
}
