/**
 * Integration Test Fixture - Provides setup for integration tests
 *
 * Features:
 * - Container setup with persistence mode selection
 * - Repository access via DI
 * - Telemetry mocking via DI
 * - Automatic cleanup
 * - Optional performance tracking for regression detection
 */

import type { InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import type { IGremlinClient } from '../../src/gremlin/gremlinClient.js'
import type { IPlayerDocRepository } from '../../src/repos/PlayerDocRepository.js'
import type { ICosmosDbSqlClient } from '../../src/repos/base/cosmosDbSqlClient.js'
import type { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import type { IInventoryRepository } from '../../src/repos/inventoryRepository.js'
import type { ILayerRepository } from '../../src/repos/layerRepository.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { IPlayerRepository } from '../../src/repos/playerRepository.js'
import type { IProcessedEventRepository } from '../../src/repos/processedEventRepository.js'
import type { IWorldEventRepository } from '../../src/repos/worldEventRepository.js'
import { DescriptionComposer } from '../../src/services/descriptionComposer.js'
import { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'
import type { TelemetryService } from '../../src/telemetry/TelemetryService.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'
import { SqlTestDocTracker } from './SqlTestDocTracker.js'
import { BaseTestFixture, type InvocationContextMockResult } from './TestFixture.js'
import { getTestContainer } from './testContainer.js'
import type { ContainerMode } from './testInversify.config.js'

export interface PerformanceMetric {
    operationName: string
    durationMs: number
    timestamp: string
}

/**
 * Integration test fixture with container and repository access via DI
 * Optionally tracks performance metrics for regression detection
 */
export class IntegrationTestFixture extends BaseTestFixture {
    protected container?: Container
    protected persistenceMode: ContainerMode
    private performanceMetrics: PerformanceMetric[] = []
    private performanceTrackingEnabled: boolean = false
    private sqlDocTracker?: SqlTestDocTracker

    constructor(persistenceMode: ContainerMode = 'memory', options?: { trackPerformance?: boolean }) {
        super()
        this.persistenceMode = persistenceMode
        this.performanceTrackingEnabled = options?.trackPerformance || false
    }

    /** Get or create the test container */
    async getContainer(): Promise<Container> {
        if (!this.container) {
            this.container = await getTestContainer(this.persistenceMode)
            // Initialize SQL doc tracker if cosmos mode and SQL client bound
            if (this.persistenceMode === 'cosmos') {
                try {
                    const sqlClient = this.container.get<ICosmosDbSqlClient>('CosmosDbSqlClient')
                    this.sqlDocTracker = new SqlTestDocTracker(sqlClient)
                } catch {
                    // SQL client may be absent if SQL API not configured in certain test scenarios
                }
            }
        }
        return this.container
    }

    /** Get LocationRepository instance from DI container */
    async getLocationRepository(): Promise<ILocationRepository> {
        const container = await this.getContainer()
        return container.get<ILocationRepository>('ILocationRepository')
    }

    /** Get ExitRepository instance from DI container */
    async getExitRepository(): Promise<import('../../src/repos/exitRepository.js').IExitRepository> {
        const container = await this.getContainer()
        return container.get<import('../../src/repos/exitRepository.js').IExitRepository>('IExitRepository')
    }

    /** Get PlayerRepository instance from DI container */
    async getPlayerRepository(): Promise<IPlayerRepository> {
        const container = await this.getContainer()
        return container.get<IPlayerRepository>('IPlayerRepository')
    }

    /** Get PlayerDocRepository instance from DI container */
    async getPlayerDocRepository(): Promise<IPlayerDocRepository> {
        const container = await this.getContainer()
        const repo = container.get<IPlayerDocRepository>('IPlayerDocRepository')
        // Auto-registration wrapper (cosmos mode only)
        if (this.persistenceMode === 'cosmos' && this.sqlDocTracker && 'upsertPlayer' in repo) {
            const original = repo.upsertPlayer.bind(repo)
            repo.upsertPlayer = async (playerDoc) => {
                await original(playerDoc)
                // Partition key /id (same as playerDoc.id)
                this.sqlDocTracker?.register('players', playerDoc.id, playerDoc.id)
            }
        }
        if (this.persistenceMode === 'cosmos' && this.sqlDocTracker && 'deletePlayer' in repo) {
            const originalDelete = (repo as IPlayerDocRepository).deletePlayer.bind(repo)
            ;(repo as IPlayerDocRepository).deletePlayer = async (playerId: string) => {
                const deleted = await originalDelete(playerId)
                if (deleted) {
                    this.sqlDocTracker?.unregister('players', playerId, playerId)
                }
                return deleted
            }
        }
        return repo
    }

    /** Get DescriptionRepository instance from DI container */
    async getDescriptionRepository(): Promise<IDescriptionRepository> {
        const container = await this.getContainer()
        const repo = container.get<IDescriptionRepository>('IDescriptionRepository')

        // Wire telemetry service to mock if it's a MockDescriptionRepository
        if ('setTelemetryService' in repo) {
            const telemetryService = await this.getTelemetryService()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(repo as any).setTelemetryService(telemetryService)
        }

        // Auto-registration for addLayer when cosmos mode & tracker available.
        if (this.persistenceMode === 'cosmos' && this.sqlDocTracker && 'addLayer' in repo) {
            const originalAddLayer = (repo as IDescriptionRepository).addLayer.bind(repo as never)
            ;(repo as IDescriptionRepository).addLayer = async (layer) => {
                const result = await originalAddLayer(layer)
                if (result.created) {
                    // Container descriptionLayers, PK /locationId
                    this.sqlDocTracker?.register('descriptionLayers', layer.locationId, layer.id)
                }
                return result
            }
        }
        return repo
    }

    /** Get InventoryRepository instance from DI container */
    async getInventoryRepository(): Promise<IInventoryRepository> {
        const container = await this.getContainer()
        const repo = container.get<IInventoryRepository>('IInventoryRepository')
        if (this.persistenceMode === 'cosmos' && this.sqlDocTracker && 'addItem' in repo) {
            const originalAdd = repo.addItem.bind(repo)
            repo.addItem = async (item) => {
                const result = await originalAdd(item)
                // Container inventory, PK /playerId
                this.sqlDocTracker?.register('inventory', item.playerId, item.id)
                return result
            }
        }
        if (this.persistenceMode === 'cosmos' && this.sqlDocTracker && 'removeItem' in repo) {
            const originalRemove = repo.removeItem.bind(repo)
            repo.removeItem = async (itemId, playerId) => {
                const deleted = await originalRemove(itemId, playerId)
                if (deleted) this.sqlDocTracker?.register('inventory', playerId, itemId)
                return deleted
            }
        }
        return repo
    }

    /** Get LayerRepository instance from DI container */
    async getLayerRepository(): Promise<ILayerRepository> {
        const container = await this.getContainer()
        return container.get<ILayerRepository>('ILayerRepository')
    }

    /** Get DescriptionComposer instance from DI container */
    async getDescriptionComposer(): Promise<DescriptionComposer> {
        const container = await this.getContainer()
        return container.get(DescriptionComposer)
    }

    /** Get WorldEventRepository instance from DI container */
    async getWorldEventRepository(): Promise<IWorldEventRepository> {
        const container = await this.getContainer()
        const repo = container.get<IWorldEventRepository>('IWorldEventRepository')
        if (this.persistenceMode === 'cosmos' && this.sqlDocTracker) {
            const anyRepo = repo as unknown as Record<string, unknown>
            if (typeof anyRepo['store'] === 'function') {
                const originalStore = anyRepo['store'] as (evt: Record<string, unknown>) => Promise<unknown>
                anyRepo['store'] = async (evt: Record<string, unknown>) => {
                    const res = await originalStore(evt)
                    // Partition key /scopeKey, id = eventId (defensive properties)
                    const scopeKey = String(evt.scopeKey || evt.scope_key || evt.scope || 'unknown')
                    const eventId = String(evt.eventId || evt.id || 'unknown')
                    if (scopeKey !== 'unknown' && eventId !== 'unknown') {
                        this.sqlDocTracker?.register('worldEvents', scopeKey, eventId)
                    }
                    return res
                }
            }
        }
        return repo
    }

    /** Get ProcessedEventRepository instance from DI container */
    async getProcessedEventRepository(): Promise<IProcessedEventRepository> {
        const container = await this.getContainer()
        const repo = container.get<IProcessedEventRepository>('IProcessedEventRepository')
        // Auto-registration wrapper (cosmos mode only)
        if (this.persistenceMode === 'cosmos' && this.sqlDocTracker && 'markProcessed' in repo) {
            const original = repo.markProcessed.bind(repo)
            repo.markProcessed = async (record) => {
                const result = await original(record)
                // Container processedEvents, PK /idempotencyKey
                this.sqlDocTracker?.register('processedEvents', record.idempotencyKey, record.id)
                return result
            }
        }
        return repo
    }

    /** Get TemporalLedgerRepository instance from DI container */
    async getTemporalLedgerRepository(): Promise<import('../../src/repos/temporalLedgerRepository.js').ITemporalLedgerRepository> {
        const container = await this.getContainer()
        const repo =
            container.get<import('../../src/repos/temporalLedgerRepository.js').ITemporalLedgerRepository>('ITemporalLedgerRepository')
        // Auto-registration wrapper (cosmos mode only)
        if (this.persistenceMode === 'cosmos' && this.sqlDocTracker && 'log' in repo) {
            const original = repo.log.bind(repo)
            repo.log = async (entry) => {
                const result = await original(entry)
                // Container temporalLedger, PK /scopeKey
                this.sqlDocTracker?.register('temporalLedger', entry.scopeKey, entry.id)
                return result
            }
        }
        return repo
    }

    /** Get WorldClockRepository instance from DI container */
    async getWorldClockRepository(): Promise<import('../../src/repos/worldClockRepository.js').IWorldClockRepository> {
        const container = await this.getContainer()
        return container.get<import('../../src/repos/worldClockRepository.js').IWorldClockRepository>('IWorldClockRepository')
    }

    /** Get WorldClockService instance from DI container */
    async getWorldClockService(): Promise<import('../../src/services/types.js').IWorldClockService> {
        const container = await this.getContainer()
        const { WorldClockService } = await import('../../src/services/WorldClockService.js')
        return container.get(WorldClockService)
    }

    /** Get LocationClockRepository instance from DI container */
    async getLocationClockRepository(): Promise<import('../../src/repos/locationClockRepository.js').ILocationClockRepository> {
        const container = await this.getContainer()
        return container.get<import('../../src/repos/locationClockRepository.js').ILocationClockRepository>('ILocationClockRepository')
    }

    /** Get RealmRepository instance from DI container */
    async getRealmRepository(): Promise<import('../../src/repos/realmRepository.js').IRealmRepository> {
        const container = await this.getContainer()
        return container.get<import('../../src/repos/realmRepository.js').IRealmRepository>('IRealmRepository')
    }

    /** Get FakeClock instance from DI container (for deterministic time control in tests) */
    async getClock(): Promise<import('@piquet-h/shared').FakeClock> {
        const container = await this.getContainer()
        return container.get<import('@piquet-h/shared').IClock>('IClock') as import('@piquet-h/shared').FakeClock
    }

    /** Get LocationClockManager instance from DI container */
    async getLocationClockManager(): Promise<import('../../src/services/types.js').ILocationClockManager> {
        const container = await this.getContainer()
        const { LocationClockManager } = await import('../../src/services/LocationClockManager.js')
        return container.get(LocationClockManager)
    }

    /** Get PlayerClockService instance from DI container */
    async getPlayerClockService(): Promise<import('../../src/services/types.js').IPlayerClockAPI> {
        const container = await this.getContainer()
        const { PlayerClockService } = await import('../../src/services/PlayerClockService.js')
        return container.get(PlayerClockService)
    }

    /** Get ReconcileEngine instance from DI container */
    async getReconcileEngine(): Promise<import('../../src/services/ReconcileEngine.js').IReconcileEngine> {
        const container = await this.getContainer()
        const { ReconcileEngine } = await import('../../src/services/ReconcileEngine.js')
        return container.get(ReconcileEngine)
    }

    /**
     * Get the telemetry client from the container
     * In test mode, this returns MockTelemetryClient for assertions
     */
    async getTelemetryClient(): Promise<ITelemetryClient | MockTelemetryClient> {
        const container = await this.getContainer()
        return container.get<ITelemetryClient>('ITelemetryClient')
    }

    /**
     * Get TelemetryService instance from DI container
     * Returns TelemetryService for injecting into mocks
     */
    async getTelemetryService(): Promise<TelemetryService> {
        const container = await this.getContainer()
        const { TelemetryService: TelemetryServiceClass } = await import('../../src/telemetry/TelemetryService.js')
        return container.get(TelemetryServiceClass)
    }

    /**
     * Create a mock invocation context with container in extraInputs
     * Required for handler testing with dependency injection
     */
    async createInvocationContext(overrides?: Partial<InvocationContext>): Promise<InvocationContextMockResult> {
        const container = await this.getContainer()
        const { TestMocks } = await import('./TestFixture.js')
        const context = TestMocks.createInvocationContext(overrides)
        context.extraInputs.set('container', container)
        return context
    }

    /**
     * Track performance metric for an operation (optional)
     * Only records if performance tracking is enabled in constructor
     */
    trackPerformance(operationName: string, durationMs: number): void {
        if (!this.performanceTrackingEnabled) return

        this.performanceMetrics.push({
            operationName,
            durationMs,
            timestamp: new Date().toISOString()
        })
    }

    /**
     * Get all performance metrics for a specific operation
     */
    getPerformanceMetrics(operationName?: string): PerformanceMetric[] {
        if (!this.performanceTrackingEnabled) {
            console.warn('Performance tracking not enabled. Pass { trackPerformance: true } to constructor.')
            return []
        }

        if (operationName) {
            return this.performanceMetrics.filter((m) => m.operationName === operationName)
        }
        return this.performanceMetrics
    }

    /**
     * Calculate p95 latency for an operation
     * Useful for detecting performance regressions in integration tests
     */
    getP95Latency(operationName: string): number | null {
        const metrics = this.getPerformanceMetrics(operationName)
        if (metrics.length === 0) return null

        const sorted = metrics.map((m) => m.durationMs).sort((a, b) => a - b)
        const p95Index = Math.ceil(sorted.length * 0.95) - 1
        return sorted[p95Index]
    }

    /**
     * Get average latency for an operation
     */
    getAverageLatency(operationName: string): number | null {
        const metrics = this.getPerformanceMetrics(operationName)
        if (metrics.length === 0) return null

        const sum = metrics.reduce((acc, m) => acc + m.durationMs, 0)
        return sum / metrics.length
    }

    /** Setup hook - initializes container */
    async setup(): Promise<void> {
        await super.setup()
        // Container will be lazily initialized on first access
    }

    /** Teardown hook - cleans up resources */
    async teardown(): Promise<void> {
        // Attempt SQL doc cleanup first (cosmos mode only)
        if (this.persistenceMode === 'cosmos' && this.sqlDocTracker) {
            try {
                const result = await this.sqlDocTracker.cleanup()
                if (result.deleted > 0 || result.errors.length > 0) {
                    console.log(`IntegrationTestFixture SQL cleanup: deleted=${result.deleted}, errors=${result.errors.length}`)
                    for (const err of result.errors) {
                        console.warn(`IntegrationTestFixture SQL cleanup error id=${err.id}: ${err.error}`)
                    }
                }
            } catch (e) {
                console.warn('IntegrationTestFixture SQL cleanup unexpected error:', e)
            }
        }
        // Close Gremlin connection if in cosmos mode to prevent WebSocket hang
        if (this.container && this.persistenceMode === 'cosmos') {
            try {
                const gremlinClient = this.container.get<IGremlinClient>('GremlinClient')
                if (gremlinClient && typeof gremlinClient.close === 'function') {
                    await gremlinClient.close()
                }
            } catch (error) {
                // GremlinClient might not be bound in all test scenarios
                console.warn('Error closing Gremlin client during teardown:', error)
            }
        }

        // Clear the telemetry mock if it's a MockTelemetryClient
        const client = this.container?.get<ITelemetryClient>('ITelemetryClient')
        if (client && 'clear' in client) {
            ;(client as MockTelemetryClient).clear()
        }
        this.container = undefined

        // Clear performance metrics
        this.performanceMetrics = []
        this.sqlDocTracker = undefined

        await super.teardown()
    }

    /** Register a SQL API document for cleanup (container, partitionKey, id) */
    async registerSqlDoc(container: string, partitionKey: string, id: string): Promise<void> {
        if (this.persistenceMode !== 'cosmos') return
        await this.getContainer() // ensure container + tracker initialization
        if (!this.sqlDocTracker) return
        this.sqlDocTracker.register(container, partitionKey, id)
    }

    /** Expose tracked SQL docs for assertions (optional) */
    getTrackedSqlDocs(): Array<{ container: string; partitionKey: string; id: string }> {
        return this.sqlDocTracker ? this.sqlDocTracker.getTracked() : []
    }
}
