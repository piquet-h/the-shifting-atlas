/**
 * (Legacy placeholder) OpenTelemetry tracing removed in consolidation.
 * File retained temporarily to avoid import resolution failures until all references are purged.
 * All exported helpers are now no-ops.
 */
export function getTracer() {
    return { startSpan: () => ({ end: () => {}, setAttribute: () => {} }) }
}
export function startHttpSpan() {
    return { end: () => {}, setAttribute: () => {} }
}
export function endSpan() {
    /* noop */
}
export function startSpanFromTraceparent() {
    return { end: () => {}, setAttribute: () => {} }
}
export function getFinishedSpans() {
    return []
}
export function resetFinishedSpans() {
    /* noop */
}
