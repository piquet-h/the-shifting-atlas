/**
 * Envelope utilities – centralizes detection and unwrapping of backend ApiEnvelope responses.
 * Backend standard shape (shared package):
 *   success: true, data: T, correlationId?: string
 *   success: false, error: { code: string; message: string }, correlationId?: string
 */
export interface UnwrappedEnvelope<TData = unknown> {
    success: boolean
    data?: TData
    error?: { code: string; message: string }
    correlationId?: string
    /** True if the original value matched the envelope contract */
    isEnvelope: boolean
    /** Original raw value (envelope object or other) */
    raw: unknown
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface PossibleEnvelopeSuccess<T> {
    success: true
    data: T
    correlationId?: string
}
interface PossibleEnvelopeError {
    success: false
    error: { code: string; message: string }
    correlationId?: string
}
type PossibleEnvelope<T> = PossibleEnvelopeSuccess<T> | PossibleEnvelopeError

export function unwrapEnvelope<TData = unknown>(raw: unknown): UnwrappedEnvelope<TData> {
    if (isPlainObject(raw) && 'success' in raw && typeof (raw as Record<string, unknown>).success === 'boolean') {
        const maybe = raw as unknown as PossibleEnvelope<TData>
        if (maybe.success) {
            return {
                success: true,
                data: maybe.data,
                correlationId: maybe.correlationId,
                isEnvelope: true,
                raw
            }
        }
        return {
            success: false,
            error: maybe.error,
            correlationId: maybe.correlationId,
            isEnvelope: true,
            raw
        }
    }
    return { success: true, data: raw as TData, isEnvelope: false, raw }
}

/** Type guard for envelope detection (without unwrapping). */
export function isApiEnvelope(value: unknown): boolean {
    return isPlainObject(value) && 'success' in value && typeof (value as Record<string, unknown>).success === 'boolean'
}
