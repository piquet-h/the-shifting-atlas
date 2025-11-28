/**
 * World Events barrel export
 *
 * Re-exports all world event utilities including:
 * - Schema and validation (worldEventSchema.ts)
 * - Event emission helper (worldEventEmitter.ts)
 * - Exit generation hint schema (exitGenerationHintSchema.ts)
 */

// Schema and types
export {
    ActorKindSchema,
    ActorSchema,
    WorldEventEnvelopeSchema,
    WorldEventTypeSchema,
    safeValidateWorldEventEnvelope,
    validateWorldEventEnvelope,
    type Actor,
    type ActorKind,
    type WorldEventEnvelope,
    type WorldEventType
} from './worldEventSchema.js'

// Event emission helper
export {
    RETRYABLE_ERROR_CODE,
    ServiceBusUnavailableError,
    WorldEventValidationError,
    emitWorldEvent,
    isRetryableError,
    isValidationError,
    prepareBatchEnqueueMessages,
    prepareEnqueueMessage,
    type BatchEnqueueOptions,
    type EmitWorldEventOptions,
    type EmitWorldEventResult,
    type EnqueuedWorldEventMessage,
    type PrepareEnqueueResult,
    type ServiceBusApplicationProperties
} from './worldEventEmitter.js'

// Exit generation hint schema and utilities
export {
    DirectionSchema,
    ExitGenerationHintPayloadSchema,
    buildExitHintIdempotencyKey,
    isExitHintExpired,
    safeValidateExitGenerationHintPayload,
    validateExitGenerationHintPayload,
    type ExitGenerationHintPayload,
    type ExitHintDLQCategory
} from './exitGenerationHintSchema.js'
