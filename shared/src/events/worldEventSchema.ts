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
 *     rootLocationId: string (UUID) - Starting location anchor for expansion
 *     terrain: TerrainType - Terrain type for generated locations
 *     arrivalDirection: Direction - Direction player arrived from (spatial hint)
 *     expansionDepth: number (1-3) - How many layers deep to expand
 *     batchSize: number (1-20) - Target number of locations to generate
 *   }
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
    'Navigation.Exit.GenerationHint' // Exit generation hint queued for processing
])
export type WorldEventType = z.infer<typeof WorldEventTypeSchema>

/**
 * Complete World Event Envelope Schema
 *
 * Validates required fields per contract doc Table "Required Fields".
 * Optional fields (ingestedUtc, causationId) are marked as such.
 */
export const WorldEventEnvelopeSchema = z.object({
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
