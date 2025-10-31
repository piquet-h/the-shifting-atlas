/*
 * OpenTelemetry Tracing Initialization
 * Wires a NodeTracerProvider with Azure Monitor exporter (if connection string available)
 * and sets basic resource attributes for service correlation.
 *
 * Safe to import multiple times (idempotent). Should be imported as early as possible
 * (before any functions/handlers) to ensure spans cover cold start + DI container setup.
 */
import { diag, DiagConsoleLogger, DiagLogLevel, propagation, ROOT_CONTEXT, Span, trace } from '@opentelemetry/api'
import { Resource } from '@opentelemetry/resources'
import { BatchSpanProcessor, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions'
import { SERVICE_BACKEND } from '@piquet-h/shared'

// Avoid duplicate initialization
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any
if (!g.__tsaOtelInitialized) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR)

    const resource = new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_BACKEND,
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
            process.env.DEPLOYMENT_ENV || process.env.AZURE_FUNCTIONS_ENVIRONMENT || process.env.NODE_ENV || 'unknown'
    })

    const provider = new NodeTracerProvider({ resource })

    const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
    if (connectionString) {
        // Exporter not bundled yet; fallback to console while retaining trace ids for correlation.
        // A future PR can add @azure/monitor-opentelemetry-exporter once version is selected.
        provider.addSpanProcessor(makeConsoleExporter())
    } else {
        provider.addSpanProcessor(makeConsoleExporter())
    }

    // In-memory exporter for tests (span inspection)
    if (process.env.NODE_ENV === 'test') {
        const memoryExporter = new InMemorySpanExporter()
        provider.addSpanProcessor(new SimpleSpanProcessor(memoryExporter))
        g.__tsaSpanExporter = memoryExporter
    }

    provider.register()
    g.__tsaOtelInitialized = true
}

export function getTracer() {
    return trace.getTracer('tsa-backend')
}

// HTTP helper – start span using incoming traceparent header if present
export function startHttpSpan(name: string, headers: { get(h: string): string | null | undefined }): Span {
    const carrier: Record<string, string> = {}
    const tp = headers.get('traceparent')
    if (tp) carrier.traceparent = tp
    const ctx = propagation.extract(ROOT_CONTEXT, carrier)
    const span = getTracer().startSpan(name, undefined, ctx)
    return span
}

export function endSpan(span: Span, error?: unknown) {
    if (error) {
        span.recordException(error as Error)
        span.setStatus({ code: 2 }) // ERROR
    }
    span.end()
}

function makeConsoleExporter(): BatchSpanProcessor {
    const exporter = {
        export(spans: unknown[], resultCallback: (result: { code: number }) => void) {
            for (const s of spans as { spanContext(): { traceId: string }; name: string }[]) {
                // Minimal dev visibility (can be toggled by setting DEBUG traces later)
                console.debug('[trace]', s.spanContext().traceId, s.name)
            }
            resultCallback({ code: 0 })
        },
        shutdown() {
            return Promise.resolve()
        }
    }
    // Cast acceptable: exporter matches required shape for BatchSpanProcessor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new BatchSpanProcessor(exporter as any)
}

// Start span from explicit traceparent string (Service Bus continuation)
export function startSpanFromTraceparent(name: string, traceparent?: string | null): Span {
    const carrier: Record<string, string> = {}
    if (traceparent) carrier.traceparent = traceparent
    const ctx = propagation.extract(ROOT_CONTEXT, carrier)
    return getTracer().startSpan(name, undefined, ctx)
}

// Test-only access to finished spans
export function getFinishedSpans(): Span[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exporter = (globalThis as any).__tsaSpanExporter as InMemorySpanExporter | undefined
    return exporter ? (exporter.getFinishedSpans() as unknown as Span[]) : []
}

export function resetFinishedSpans(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exporter = (globalThis as any).__tsaSpanExporter as InMemorySpanExporter | undefined
    if (exporter) exporter.reset()
}
