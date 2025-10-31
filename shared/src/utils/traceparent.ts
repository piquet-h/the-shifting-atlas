// Lightweight W3C traceparent utilities.
// Kept dependency-free so backend/frontend can adopt OpenTelemetry or other tracers while
// still sharing consistent header parsing & generation logic.
// Spec reference: https://www.w3.org/TR/trace-context/

const VERSION = '00'
const VALID_TRACEPARENT_REGEX = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(?:-.*)?$/

export interface ParsedTraceparent {
    version: string
    traceId: string
    parentId: string
    traceFlags: string
}

export function parseTraceparent(header: string | null | undefined): ParsedTraceparent | null {
    if (!header) return null
    const match = VALID_TRACEPARENT_REGEX.exec(header.trim())
    if (!match) return null
    const [, version, traceId, parentId, traceFlags] = match
    if (traceId === '00000000000000000000000000000000') return null
    if (parentId === '0000000000000000') return null
    return { version, traceId, parentId, traceFlags }
}

function randomHex(bytes: number): string {
    // Crypto-free fallback (acceptable for correlation, not security tokens)
    let out = ''
    for (let i = 0; i < bytes; i++) {
        out += ((Math.random() * 256) | 0).toString(16).padStart(2, '0')
    }
    return out
}

export function createTraceparent(existing?: ParsedTraceparent | null): { header: string; traceId: string; spanId: string } {
    const traceId = existing?.traceId || randomHex(16) // 16 bytes = 32 hex chars
    const spanId = randomHex(8) // 8 bytes = 16 hex chars
    const traceFlags = existing?.traceFlags || '01'
    return { header: `${VERSION}-${traceId}-${spanId}-${traceFlags}`, traceId, spanId }
}

export function extractOrCreateTraceparent(getHeader: (name: string) => string | null | undefined): {
    header: string
    traceId: string
    spanId: string
    reused: boolean
} {
    const parsed = parseTraceparent(getHeader('traceparent'))
    const { header, traceId, spanId } = createTraceparent(parsed)
    return { header, traceId, spanId, reused: !!parsed }
}

// Service Bus helpers -------------------------------------------------------
// When enqueuing a message, stash traceparent for downstream processing.
// Azure Service Bus supports applicationProperties metadata bag.

export interface ServiceBusMessageLike {
    body: unknown
    applicationProperties?: Record<string, unknown>
}

export function attachTraceparentToServiceBusMessage(message: ServiceBusMessageLike, traceparentHeader: string): void {
    if (!message.applicationProperties) message.applicationProperties = {}
    if (!message.applicationProperties.traceparent) {
        message.applicationProperties.traceparent = traceparentHeader
    }
}

export function extractTraceparentFromServiceBusMessage(message: ServiceBusMessageLike): string | undefined {
    const candidate = message.applicationProperties?.traceparent
    return typeof candidate === 'string' ? candidate : undefined
} // no newline
