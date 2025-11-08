/**
 * Operation Latency Monitoring Handler
 *
 * Monitors P95 latency for non-movement Gremlin operations to detect persistence degradation.
 * Tracks consecutive windows above thresholds and emits alerts.
 *
 * Monitored Operations:
 * - location.upsert.check
 * - location.upsert.write
 * - exit.ensureExit.check
 * - exit.ensureExit.create
 * - player.create
 *
 * Thresholds:
 * - Critical: P95 >600ms for 3 consecutive 10-min windows
 * - Warning: P95 >500ms for 3 consecutive 10-min windows
 * - Auto-resolve: <450ms for 2 consecutive windows
 * - Minimum sample size: 20 calls per window
 *
 * Issue: #10 (M2 Observability)
 * Related: ADR-002 latency guidance
 */
import type { InvocationContext } from '@azure/functions'
import { DefaultAzureCredential } from '@azure/identity'
import { LogsQueryClient } from '@azure/monitor-query'
import { trackGameEventStrict } from '../telemetry.js'

// --- Configuration -----------------------------------------------------------

const OPERATIONS_TO_MONITOR = [
    'location.upsert.check',
    'location.upsert.write',
    'exit.ensureExit.check',
    'exit.ensureExit.create',
    'player.create'
] as const

type MonitoredOperation = (typeof OPERATIONS_TO_MONITOR)[number]

const THRESHOLDS = {
    CRITICAL_MS: 600,
    WARNING_MS: 500,
    RESOLVE_MS: 450,
    MIN_SAMPLE_SIZE: 20
} as const

const CONSECUTIVE_WINDOWS = {
    ALERT: 3, // Consecutive windows above threshold to trigger alert
    RESOLVE: 2 // Consecutive windows below threshold to auto-resolve
} as const

const WINDOW_MINUTES = 10 // Query window size
const BASELINE_HOURS = 24 // Baseline comparison period

// --- State Management --------------------------------------------------------

interface OperationState {
    consecutiveWarningWindows: number
    consecutiveCriticalWindows: number
    consecutiveHealthyWindows: number
    currentAlertLevel: 'none' | 'warning' | 'critical'
    lastP95Ms: number | null
    baselineP95Ms: number | null
}

// In-memory state (resets on function restart - acceptable for this monitoring use case)
const operationStates = new Map<MonitoredOperation, OperationState>()

function getOperationState(operation: MonitoredOperation): OperationState {
    if (!operationStates.has(operation)) {
        operationStates.set(operation, {
            consecutiveWarningWindows: 0,
            consecutiveCriticalWindows: 0,
            consecutiveHealthyWindows: 0,
            currentAlertLevel: 'none',
            lastP95Ms: null,
            baselineP95Ms: null
        })
    }
    return operationStates.get(operation)!
}

// --- Application Insights Query Logic ---------------------------------------

/**
 * Query Application Insights for P95 latency of a specific operation.
 */
async function queryOperationLatency(
    client: LogsQueryClient,
    workspaceId: string,
    operation: string,
    windowMinutes: number
): Promise<{ p95Ms: number; sampleSize: number } | null> {
    // KQL query to get P95 latency and sample size for the operation
    const query = `
        customEvents
        | where timestamp > ago(${windowMinutes}m)
        | where name == 'Graph.Query.Executed'
        | extend operationName = tostring(customDimensions.operationName)
        | extend latencyMs = todouble(customDimensions.latencyMs)
        | where operationName == '${operation}'
        | where isnotempty(latencyMs)
        | summarize
            P95 = percentile(latencyMs, 95),
            SampleSize = count()
    `

    try {
        const result = await client.queryWorkspace(workspaceId, query, {
            duration: `PT${windowMinutes}M`
        })

        if (result.status === 'Success' && result.tables.length > 0) {
            const table = result.tables[0]
            if (table.rows.length > 0) {
                const row = table.rows[0]
                // Columns: P95, SampleSize
                const p95Ms = typeof row[0] === 'number' ? row[0] : null
                const sampleSize = typeof row[1] === 'number' ? row[1] : 0

                if (p95Ms !== null && sampleSize > 0) {
                    return { p95Ms, sampleSize }
                }
            }
        }

        return null
    } catch (error) {
        throw new Error(`Failed to query latency for ${operation}: ${error instanceof Error ? error.message : String(error)}`)
    }
}

/**
 * Query baseline P95 latency (24h window) for comparison.
 */
async function queryBaselineLatency(client: LogsQueryClient, workspaceId: string, operation: string): Promise<number | null> {
    const query = `
        customEvents
        | where timestamp > ago(${BASELINE_HOURS}h)
        | where name == 'Graph.Query.Executed'
        | extend operationName = tostring(customDimensions.operationName)
        | extend latencyMs = todouble(customDimensions.latencyMs)
        | where operationName == '${operation}'
        | where isnotempty(latencyMs)
        | summarize P95 = percentile(latencyMs, 95)
    `

    try {
        const result = await client.queryWorkspace(workspaceId, query, {
            duration: `PT${BASELINE_HOURS}H`
        })

        if (result.status === 'Success' && result.tables.length > 0) {
            const table = result.tables[0]
            if (table.rows.length > 0) {
                const row = table.rows[0]
                const p95Ms = typeof row[0] === 'number' ? row[0] : null
                return p95Ms
            }
        }

        return null
    } catch (error) {
        throw new Error(`Failed to query baseline latency for ${operation}: ${error instanceof Error ? error.message : String(error)}`)
    }
}

// --- Alert Logic -------------------------------------------------------------

function updateOperationState(
    operation: MonitoredOperation,
    currentP95Ms: number,
    baselineP95Ms: number | null,
    sampleSize: number
): { shouldAlert: boolean; alertLevel: 'warning' | 'critical' | null; shouldResolve: boolean } {
    const state = getOperationState(operation)

    // Update baseline
    state.baselineP95Ms = baselineP95Ms
    state.lastP95Ms = currentP95Ms

    // Check thresholds
    const isHealthy = currentP95Ms < THRESHOLDS.RESOLVE_MS
    const isWarning = currentP95Ms >= THRESHOLDS.WARNING_MS && currentP95Ms < THRESHOLDS.CRITICAL_MS
    const isCritical = currentP95Ms >= THRESHOLDS.CRITICAL_MS

    // Update consecutive window counters
    if (isHealthy) {
        state.consecutiveHealthyWindows++
        state.consecutiveWarningWindows = 0
        state.consecutiveCriticalWindows = 0
    } else if (isCritical) {
        state.consecutiveCriticalWindows++
        state.consecutiveWarningWindows++ // Critical also counts as warning
        state.consecutiveHealthyWindows = 0
    } else if (isWarning) {
        state.consecutiveWarningWindows++
        state.consecutiveCriticalWindows = 0
        state.consecutiveHealthyWindows = 0
    } else {
        // In between thresholds - reset counters
        state.consecutiveWarningWindows = 0
        state.consecutiveCriticalWindows = 0
        state.consecutiveHealthyWindows = 0
    }

    // Check if we should alert
    let shouldAlert = false
    let alertLevel: 'warning' | 'critical' | null = null

    if (state.consecutiveCriticalWindows >= CONSECUTIVE_WINDOWS.ALERT && state.currentAlertLevel !== 'critical') {
        shouldAlert = true
        alertLevel = 'critical'
        state.currentAlertLevel = 'critical'
    } else if (state.consecutiveWarningWindows >= CONSECUTIVE_WINDOWS.ALERT && state.currentAlertLevel === 'none') {
        shouldAlert = true
        alertLevel = 'warning'
        state.currentAlertLevel = 'warning'
    }

    // Check if we should resolve
    const shouldResolve = state.consecutiveHealthyWindows >= CONSECUTIVE_WINDOWS.RESOLVE && state.currentAlertLevel !== 'none'

    if (shouldResolve) {
        state.currentAlertLevel = 'none'
        state.consecutiveWarningWindows = 0
        state.consecutiveCriticalWindows = 0
    }

    return { shouldAlert, alertLevel, shouldResolve }
}

// --- Main Handler ------------------------------------------------------------

/**
 * Monitor operation latency and emit alerts for degradations.
 */
export async function monitorOperationLatency(context: InvocationContext): Promise<void> {
    const startTime = Date.now()

    context.log('Starting operation latency monitoring')

    // Get Application Insights configuration
    const workspaceId = process.env.APPINSIGHTS_WORKSPACE_ID
    if (!workspaceId) {
        context.error('APPINSIGHTS_WORKSPACE_ID environment variable not set')
        return
    }

    // Initialize Azure Monitor client
    const credential = new DefaultAzureCredential()
    const client = new LogsQueryClient(credential)

    let monitored = 0
    let alerts = 0
    let resolutions = 0
    let insufficientData = 0

    try {
        // Monitor each operation
        for (const operation of OPERATIONS_TO_MONITOR) {
            try {
                // Query current window latency
                const currentMetrics = await queryOperationLatency(client, workspaceId, operation, WINDOW_MINUTES)

                if (!currentMetrics) {
                    context.log(`No data available for operation: ${operation}`)
                    continue
                }

                // Check minimum sample size
                if (currentMetrics.sampleSize < THRESHOLDS.MIN_SAMPLE_SIZE) {
                    insufficientData++
                    context.log(
                        `Insufficient data for operation ${operation}: ${currentMetrics.sampleSize} calls (minimum: ${THRESHOLDS.MIN_SAMPLE_SIZE})`
                    )

                    // Emit diagnostic telemetry
                    trackGameEventStrict('Monitoring.OperationLatency.InsufficientData', {
                        operationName: operation,
                        sampleSize: currentMetrics.sampleSize,
                        minimumRequired: THRESHOLDS.MIN_SAMPLE_SIZE,
                        windowMinutes: WINDOW_MINUTES
                    })

                    continue
                }

                // Query baseline latency
                const baselineP95Ms = await queryBaselineLatency(client, workspaceId, operation)

                // Update state and check for alerts
                const { shouldAlert, alertLevel, shouldResolve } = updateOperationState(
                    operation,
                    currentMetrics.p95Ms,
                    baselineP95Ms,
                    currentMetrics.sampleSize
                )

                monitored++

                // Emit alert if needed
                if (shouldAlert && alertLevel) {
                    alerts++

                    trackGameEventStrict('Monitoring.OperationLatency.Alert', {
                        operationName: operation,
                        currentP95Ms: currentMetrics.p95Ms,
                        baselineP95Ms: baselineP95Ms || 0,
                        sampleSize: currentMetrics.sampleSize,
                        alertLevel,
                        thresholdMs: alertLevel === 'critical' ? THRESHOLDS.CRITICAL_MS : THRESHOLDS.WARNING_MS,
                        consecutiveWindows: CONSECUTIVE_WINDOWS.ALERT
                    })

                    context.warn(`Operation latency alert: ${operation}`, {
                        alertLevel,
                        currentP95Ms: currentMetrics.p95Ms,
                        baselineP95Ms,
                        sampleSize: currentMetrics.sampleSize
                    })
                }

                // Emit resolution if needed
                if (shouldResolve) {
                    resolutions++

                    trackGameEventStrict('Monitoring.OperationLatency.Resolved', {
                        operationName: operation,
                        currentP95Ms: currentMetrics.p95Ms,
                        baselineP95Ms: baselineP95Ms || 0,
                        sampleSize: currentMetrics.sampleSize,
                        thresholdMs: THRESHOLDS.RESOLVE_MS,
                        consecutiveWindows: CONSECUTIVE_WINDOWS.RESOLVE
                    })

                    context.log(`Operation latency resolved: ${operation}`, {
                        currentP95Ms: currentMetrics.p95Ms,
                        baselineP95Ms,
                        sampleSize: currentMetrics.sampleSize
                    })
                }
            } catch (error) {
                context.error(`Error monitoring operation ${operation}:`, error)

                trackGameEventStrict('Monitoring.OperationLatency.Error', {
                    operationName: operation,
                    errorMessage: error instanceof Error ? error.message : String(error)
                })
            }
        }

        const durationMs = Date.now() - startTime

        context.log('Operation latency monitoring completed', {
            monitored,
            alerts,
            resolutions,
            insufficientData,
            durationMs
        })

        // Emit summary telemetry
        trackGameEventStrict('Monitoring.OperationLatency.Complete', {
            monitored,
            alerts,
            resolutions,
            insufficientData,
            durationMs,
            success: true
        })
    } catch (error) {
        const durationMs = Date.now() - startTime

        context.error('Operation latency monitoring failed:', error)

        trackGameEventStrict('Monitoring.OperationLatency.Complete', {
            monitored,
            alerts,
            resolutions,
            insufficientData,
            durationMs,
            success: false,
            errorMessage: error instanceof Error ? error.message : String(error)
        })
    }
}
