/**
 * Azure Function: Compute Integrity Hashes (Timer Trigger)
 *
 * Scheduled job to compute and store integrity hashes for description layers.
 * Default schedule: Daily at 2:00 AM UTC (configurable via env var).
 *
 * Schedule format: NCRONTAB expression (6 fields: {second} {minute} {hour} {day} {month} {day-of-week})
 * Default: "0 0 2 * * *" = Every day at 2:00 AM UTC
 *
 * Configuration (env vars):
 * - INTEGRITY_JOB_SCHEDULE: NCRONTAB schedule expression (default: "0 0 2 * * *")
 * - INTEGRITY_JOB_BATCH_SIZE: Number of descriptions to process per batch (default: 100)
 * - INTEGRITY_JOB_RECOMPUTE_ALL: If 'true', recompute all hashes even if already set (default: false)
 */
import type { InvocationContext, Timer } from '@azure/functions'
import { app } from '@azure/functions'
import type { Container } from 'inversify'
import { computeDescriptionIntegrityHashes } from '../handlers/computeIntegrityHashes.js'
import type { IDescriptionRepository } from '../repos/descriptionRepository.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'

const SCHEDULE = process.env.INTEGRITY_JOB_SCHEDULE || '0 0 2 * * *'

app.timer('timerComputeIntegrityHashes', {
    schedule: SCHEDULE,
    handler: async (timer: Timer, context: InvocationContext): Promise<void> => {
        context.log('Integrity hash computation timer triggered', {
            schedule: SCHEDULE,
            isPastDue: timer.isPastDue
        })

        // Get container from extraInputs (set by preInvocation hook in index.ts)
        const container = context.extraInputs.get('container') as Container

        // Get description repository from DI container
        const repository = container.get<IDescriptionRepository>('IDescriptionRepository')
        const telemetryService = container.get(TelemetryService)

        // Execute the integrity hash computation job
        await computeDescriptionIntegrityHashes(repository, telemetryService, context)
    }
})
