/**
 * Player Clock Service Implementation
 *
 * Manages player-specific time tracking, drift application, and reconciliation to world clock.
 * Per world-time-temporal-reconciliation.md Section 2 (PlayerClockAPI).
 */

import type { ReconciliationResult } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import type { IPlayerDocRepository } from '../repos/PlayerDocRepository.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import type { IPlayerClockAPI, IWorldClockService } from './types.js'
import { WorldClockService } from './WorldClockService.js'

/**
 * Threshold for "slow" reconciliation policy (player slightly ahead)
 * If player is ahead by less than this amount, location might catch up (rare)
 * Default: 1 hour (3600000ms)
 */
const SLOW_THRESHOLD_MS = parseInt(process.env.TEMPORAL_SLOW_THRESHOLD_MS || '3600000', 10)

/**
 * Drift rate configuration: real-time elapsed → game-time drift
 * Default: 1.0 (1 real minute = 1 game minute)
 * Can be tuned for slower drift (e.g., 0.1 = 1 real minute = 6 game seconds)
 */
const DRIFT_RATE = parseFloat(process.env.TEMPORAL_DRIFT_RATE || '1.0')

@injectable()
export class PlayerClockService implements IPlayerClockAPI {
    constructor(
        @inject('IPlayerDocRepository') private readonly playerRepo: IPlayerDocRepository,
        @inject(WorldClockService) private readonly worldClockService: IWorldClockService,
        @inject(TelemetryService) private readonly telemetry: TelemetryService
    ) {}

    /**
     * Advance player clock by action duration
     */
    async advancePlayerTime(playerId: string, durationMs: number, actionType: string): Promise<void> {
        if (durationMs < 0) {
            throw new Error('Duration must be positive or zero')
        }

        // Get current player state
        const player = await this.playerRepo.getPlayer(playerId)
        if (!player) {
            throw new Error(`Player not found: ${playerId}`)
        }

        // Advance clock (initialize to 0 if undefined)
        const currentTick = player.clockTick ?? 0
        const newTick = currentTick + durationMs

        // Update player document
        await this.playerRepo.upsertPlayer({
            ...player,
            clockTick: newTick,
            lastAction: new Date().toISOString(),
            updatedUtc: new Date().toISOString()
        })

        // Emit telemetry
        this.telemetry.trackGameEvent('Player.Clock.Advanced', {
            playerId,
            actionType,
            durationMs,
            newTick
        })
    }

    /**
     * Apply idle drift to player clock
     */
    async applyDrift(playerId: string, realTimeElapsedMs: number): Promise<void> {
        if (realTimeElapsedMs < 0) {
            throw new Error('Real-time elapsed must be positive or zero')
        }

        // Get current player state
        const player = await this.playerRepo.getPlayer(playerId)
        if (!player) {
            throw new Error(`Player not found: ${playerId}`)
        }

        // Calculate drift
        const driftMs = Math.floor(realTimeElapsedMs * DRIFT_RATE)

        // Advance clock by drift
        const currentTick = player.clockTick ?? 0
        const newTick = currentTick + driftMs

        // Update player document
        await this.playerRepo.upsertPlayer({
            ...player,
            clockTick: newTick,
            lastDrift: new Date().toISOString(),
            updatedUtc: new Date().toISOString()
        })

        // Emit telemetry
        this.telemetry.trackGameEvent('Player.Clock.DriftApplied', {
            playerId,
            realTimeElapsedMs,
            driftMs,
            newTick
        })
    }

    /**
     * Reconcile player clock to location's world clock anchor
     */
    async reconcile(playerId: string, locationId: string): Promise<ReconciliationResult> {
        // Get current player state
        const player = await this.playerRepo.getPlayer(playerId)
        if (!player) {
            throw new Error(`Player not found: ${playerId}`)
        }

        // Get world clock (represents location anchor for now)
        // TODO: When LocationClockManager is implemented, use location-specific anchor
        const worldClockTick = await this.worldClockService.getCurrentTick()

        // Get player clock (initialize to 0 if undefined)
        const playerTickBefore = player.clockTick ?? 0

        // Calculate offset
        const offset = playerTickBefore - worldClockTick

        // Determine reconciliation method and apply
        let playerTickAfter: number
        let reconciliationMethod: 'wait' | 'slow' | 'compress'
        let narrativeText: string | undefined

        if (offset === 0) {
            // Already synchronized - no action needed
            playerTickAfter = playerTickBefore
            reconciliationMethod = 'wait' // Use wait as default for no-op case
        } else if (offset < 0) {
            // Player behind location → WAIT policy
            reconciliationMethod = 'wait'
            playerTickAfter = worldClockTick

            // Update player clock
            await this.playerRepo.upsertPlayer({
                ...player,
                clockTick: playerTickAfter,
                updatedUtc: new Date().toISOString()
            })
        } else if (offset > 0 && offset < SLOW_THRESHOLD_MS) {
            // Player slightly ahead → SLOW policy (rare, location catches up)
            reconciliationMethod = 'slow'
            playerTickAfter = playerTickBefore
            // In full implementation, this would advance location clock
            // For now, player stays ahead (location would catch up)
        } else {
            // Player far ahead → COMPRESS policy
            reconciliationMethod = 'compress'
            playerTickAfter = worldClockTick

            // Update player clock
            await this.playerRepo.upsertPlayer({
                ...player,
                clockTick: playerTickAfter,
                updatedUtc: new Date().toISOString()
            })
        }

        // Emit telemetry
        this.telemetry.trackGameEvent('Player.Clock.Reconciled', {
            playerId,
            locationId,
            method: reconciliationMethod,
            offsetMs: offset,
            narrativeGenerated: narrativeText !== undefined
        })

        return {
            playerTickBefore,
            playerTickAfter,
            worldClockTick,
            reconciliationMethod,
            narrativeText
        }
    }

    /**
     * Get player's current time offset from world clock
     */
    async getPlayerOffset(playerId: string): Promise<number> {
        // Get current player state
        const player = await this.playerRepo.getPlayer(playerId)
        if (!player) {
            throw new Error(`Player not found: ${playerId}`)
        }

        // Get world clock
        const worldClockTick = await this.worldClockService.getCurrentTick()

        // Calculate offset (player clock - world clock)
        const playerTick = player.clockTick ?? 0
        return playerTick - worldClockTick
    }
}
