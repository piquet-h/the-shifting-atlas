/**
 * Azure Function: Monitor Operation Latency (Timer Trigger)
 *
 * Scheduled job to monitor P95 latency for non-movement Gremlin operations.
 * Default schedule: Every 10 minutes (configurable via env var).
 *
 * Schedule format: NCRONTAB expression (6 fields: {second} {minute} {hour} {day} {month} {day-of-week})
 * Default: "0 */10 * * * *" = Every 10 minutes
 *
 * Configuration (env vars):
 * - OPERATION_LATENCY_MONITOR_SCHEDULE: NCRONTAB schedule expression (default: "0 */10 * * * *")
 * - APPINSIGHTS_WORKSPACE_ID: Application Insights workspace ID for querying telemetry
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
 * Related: ADR-002 latency guidance, #79
 */
import { app } from '@azure/functions'
import type { InvocationContext, Timer } from '@azure/functions'
import { monitorOperationLatency } from '../handlers/monitorOperationLatency.js'

const SCHEDULE = process.env.OPERATION_LATENCY_MONITOR_SCHEDULE || '0 */10 * * * *'

app.timer('TimerMonitorOperationLatency', {
    schedule: SCHEDULE,
    handler: async (timer: Timer, context: InvocationContext): Promise<void> => {
        context.log('Operation latency monitoring timer triggered', {
            schedule: SCHEDULE,
            isPastDue: timer.isPastDue
        })

        await monitorOperationLatency(context)
    }
})
