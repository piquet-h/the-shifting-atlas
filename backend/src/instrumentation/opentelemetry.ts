/*
 * OpenTelemetry Tracing Initialization
 * Wires a NodeTracerProvider with Azure Monitor exporter (if connection string available)
 * and sets enriched resource attributes for service correlation.
 *
 * Safe to import multiple times (idempotent). Should be imported as early as possible
 * (before any functions/handlers) to ensure spans cover cold start + DI container setup.
 *
 * Configuration:
 * - TRACE_EXPORT_ENABLED: Set to 'true' to enable Azure Monitor export (default: false)
 * - APPLICATIONINSIGHTS_CONNECTION_STRING: Connection string for Azure Monitor
 * - DEPLOYMENT_ENV / AZURE_FUNCTIONS_ENVIRONMENT: Environment name for resource attributes
 * - COMMIT_SHA: Git commit SHA for deployment tracing
 */
import { diag, DiagConsoleLogger, DiagLogLevel, propagation, ROOT_CONTEXT, Span, trace } from '@opentelemetry/api'
import { AzureMonitorTraceExporter } from '@azure/monitor-opentelemetry-exporter'
import { Resource } from '@opentelemetry/resources'
import { BatchSpanProcessor, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_DEPLOYMENT_ENVIRONMENT } from '@opentelemetry/semantic-conventions'
import { SERVICE_BACKEND } from '@piquet-h/shared'

const SERVICE_VERSION = '0.1.0'

// Avoid duplicate initialization
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any
if (!g.__tsaOtelInitialized) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR)

    // Enriched resource attributes per issue #311
    const resource = new Resource({
        [ATTR_SERVICE_NAME]: SERVICE_BACKEND,
        [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
        [ATTR_DEPLOYMENT_ENVIRONMENT]:
            process.env.DEPLOYMENT_ENV || process.env.AZURE_FUNCTIONS_ENVIRONMENT || process.env.NODE_ENV || 'unknown',
        // Add commit SHA if available for deployment tracing
        ...(process.env.COMMIT_SHA && { 'commit.sha': process.env.COMMIT_SHA })
    })

    const provider = new NodeTracerProvider({ resource })

    // Production exporter (Azure Monitor) - gated by TRACE_EXPORT_ENABLED flag
    const traceExportEnabled = process.env.TRACE_EXPORT_ENABLED === 'true'
    const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING

    if (traceExportEnabled && connectionString) {
        try {
            const exporter = new AzureMonitorTraceExporter({ connectionString })
            // Tuned BatchSpanProcessor settings per issue #311
            const processor = new BatchSpanProcessor(exporter, {
                maxQueueSize: 2048, // Prevent memory blowout under high span volume
                scheduledDelayMillis: 5000 // 5 second batch interval
            })
            provider.addSpanProcessor(processor)
        } catch (error) {
            // Graceful degradation: log warning but don't crash
            console.warn('[OpenTelemetry] Failed to initialize Azure Monitor exporter:', error)
            // Optional: emit telemetry event Tracing.Exporter.InitFailed
            provider.addSpanProcessor(makeConsoleExporter())
        }
    } else {
        // Fallback to console exporter for development/debugging
        if (traceExportEnabled && !connectionString) {
            console.warn('[OpenTelemetry] TRACE_EXPORT_ENABLED is true but APPLICATIONINSIGHTS_CONNECTION_STRING is missing')
        }
        provider.addSpanProcessor(makeConsoleExporter())
    }

    // In-memory exporter for tests (span inspection) - always enabled in test mode
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
    // Guard against double-end which produces noisy warnings in tests.
    // If span has already been ended, span.isRecording() will be false.
    if (!span.isRecording()) return
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
