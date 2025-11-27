/**
 * World Events barrel export
 *
 * Re-exports all world event utilities including:
 * - Schema and validation (worldEventSchema.ts)
 * - Event emission helper (worldEventEmitter.ts)
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
