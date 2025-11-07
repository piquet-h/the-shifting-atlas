/**
 * Integrity Hash Computation Handler
 *
 * Computes and stores SHA-256 integrity hashes for description layers to enable
 * corruption detection. Runs as a scheduled job (timer trigger).
 *
 * Configuration (env vars):
 * - INTEGRITY_JOB_BATCH_SIZE: Number of descriptions to process per batch (default: 100)
 * - INTEGRITY_JOB_RECOMPUTE_ALL: If 'true', recompute all hashes even if already set (default: false)
 */
import type { InvocationContext } from '@azure/functions'
import type { IDescriptionRepository } from '../repos/descriptionRepository.js'
import { computeIntegrityHash, verifyIntegrityHash } from '../repos/utils/integrityHash.js'
import { trackGameEventStrict } from '../telemetry.js'

// --- Configuration -----------------------------------------------------------

const DEFAULT_BATCH_SIZE = 100
const BATCH_SIZE_RAW = parseInt(process.env.INTEGRITY_JOB_BATCH_SIZE || String(DEFAULT_BATCH_SIZE), 10)
const BATCH_SIZE = Number.isNaN(BATCH_SIZE_RAW) || BATCH_SIZE_RAW <= 0 ? DEFAULT_BATCH_SIZE : BATCH_SIZE_RAW
const RECOMPUTE_ALL = process.env.INTEGRITY_JOB_RECOMPUTE_ALL === 'true'

// Truncate hashes to 128 bits (32 hex chars) for telemetry logging
// Provides sufficient forensic value while keeping telemetry compact
const HASH_TRUNCATE_LENGTH = 32

// --- Handler -----------------------------------------------------------------

/**
 * Compute integrity hashes for all descriptions in the repository.
 * Idempotent: skips descriptions that already have a valid hash (unless RECOMPUTE_ALL is true).
 */
export async function computeDescriptionIntegrityHashes(
    repository: IDescriptionRepository,
    context: InvocationContext
): Promise<{ processed: number; updated: number; mismatches: number; skipped: number }> {
    const jobStartTime = Date.now()

    // Emit job start telemetry
    trackGameEventStrict('Description.Integrity.JobStart', {
        batchSize: BATCH_SIZE,
        recomputeAll: RECOMPUTE_ALL
    })

    context.log('Starting integrity hash computation job', {
        batchSize: BATCH_SIZE,
        recomputeAll: RECOMPUTE_ALL
    })

    let processed = 0
    let updated = 0
    let mismatches = 0
    let skipped = 0

    try {
        // Retrieve all layers (including archived for complete integrity baseline)
        const allLayers = await repository.getAllLayers()

        context.log(`Retrieved ${allLayers.length} description layers for processing`)

        // Process in batches to avoid memory issues with very large datasets
        for (let i = 0; i < allLayers.length; i += BATCH_SIZE) {
            const batch = allLayers.slice(i, Math.min(i + BATCH_SIZE, allLayers.length))

            for (const layer of batch) {
                processed++

                // Compute current hash
                const currentHash = computeIntegrityHash(layer.content)

                // Check if hash already exists and is valid
                if (layer.integrityHash && !RECOMPUTE_ALL) {
                    // Verify existing hash
                    const isValid = verifyIntegrityHash(layer.content, layer.integrityHash)

                    if (isValid) {
                        // Hash unchanged, skip update
                        skipped++
                        trackGameEventStrict('Description.Integrity.Unchanged', {
                            layerId: layer.id,
                            locationId: layer.locationId
                        })
                        continue
                    } else {
                        // Hash mismatch detected - potential corruption
                        mismatches++
                        trackGameEventStrict('Description.Integrity.Mismatch', {
                            layerId: layer.id,
                            locationId: layer.locationId,
                            storedHash: layer.integrityHash.slice(0, HASH_TRUNCATE_LENGTH),
                            currentHash: currentHash.slice(0, HASH_TRUNCATE_LENGTH),
                            contentLength: layer.content.length
                        })

                        context.warn(`Integrity hash mismatch detected for layer ${layer.id}`, {
                            layerId: layer.id,
                            locationId: layer.locationId
                        })
                    }
                }

                // Update hash (new layer or mismatch or RECOMPUTE_ALL mode)
                const result = await repository.updateIntegrityHash(layer.id, currentHash)

                if (result.updated) {
                    updated++
                    trackGameEventStrict('Description.Integrity.Computed', {
                        layerId: layer.id,
                        locationId: layer.locationId,
                        hashLength: currentHash.length,
                        contentLength: layer.content.length
                    })
                }
            }

            // Log progress after each batch
            context.log(`Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allLayers.length / BATCH_SIZE)}`, {
                processed,
                updated,
                mismatches,
                skipped
            })
        }

        const durationMs = Date.now() - jobStartTime

        // Emit job completion telemetry
        trackGameEventStrict('Description.Integrity.JobComplete', {
            processed,
            updated,
            mismatches,
            skipped,
            durationMs,
            success: true
        })

        context.log('Integrity hash computation job completed successfully', {
            processed,
            updated,
            mismatches,
            skipped,
            durationMs
        })

        return { processed, updated, mismatches, skipped }
    } catch (error) {
        const durationMs = Date.now() - jobStartTime

        // Emit failure telemetry
        trackGameEventStrict('Description.Integrity.JobComplete', {
            processed,
            updated,
            mismatches,
            skipped,
            durationMs,
            success: false,
            error: error instanceof Error ? error.message : String(error)
        })

        context.error('Integrity hash computation job failed', {
            error: String(error),
            processed,
            updated,
            mismatches,
            skipped
        })

        throw error
    }
}
