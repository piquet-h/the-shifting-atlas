# SQL API Repository Abstraction Pattern

**Status:** Active (M2 Observability)  
**Epic:** [#386 Cosmos Dual Persistence Implementation](https://github.com/piquet-h/the-shifting-atlas/issues/386)  
**Last Updated:** 2025-11-10

## Overview

The SQL API repository abstraction layer provides a consistent interface for Cosmos DB SQL API operations, enabling testability, centralized error handling, and telemetry integration. This complements the existing Gremlin repository pattern for dual persistence (ADR-002).

## Goals

1. **Zero direct SDK calls**: All `@azure/cosmos` operations go through repository layer
2. **Testability**: Mock implementations for unit testing without Azure credentials
3. **Consistent error handling**: Domain exceptions instead of raw Cosmos errors
4. **Telemetry integration**: Automatic RU consumption and latency tracking
5. **Type safety**: Strongly-typed repository interfaces for domain entities

## Architecture

### Base Repository Class

```typescript
// backend/src/repos/base/CosmosDbSqlRepository.ts
export abstract class CosmosDbSqlRepository<T extends { id: string }> {
    protected async getById(id: string, partitionKey: string): Promise<T | null>
    protected async create(entity: T): Promise<{ resource: T; ruCharge: number }>
    protected async upsert(entity: T): Promise<{ resource: T; ruCharge: number }>
    protected async replace(id: string, entity: T, partitionKey: string, etag?: string): Promise<{ resource: T; ruCharge: number }>
    protected async delete(id: string, partitionKey: string): Promise<boolean>
    protected async query(query: string, parameters?: SqlParameter[], maxResults?: number): Promise<{ items: T[]; ruCharge: number }>
}
```

### Domain Exceptions

All Cosmos errors are translated to domain exceptions (shared package):

| Exception                     | Status Code | Semantics                | Retryable          |
| ----------------------------- | ----------- | ------------------------ | ------------------ |
| `NotFoundException`           | 404         | Resource not found       | No                 |
| `ConcurrencyException`        | 409         | Conflict (duplicate key) | No                 |
| `RetryableException`          | 429         | Throttling               | Yes (with backoff) |
| `PreconditionFailedException` | 412         | ETag mismatch            | No                 |
| `ValidationException`         | 400         | Bad request              | No                 |

```typescript
import { NotFoundException, ConcurrencyException, RetryableException } from '@piquet-h/shared'

try {
    await repo.getById(id, partitionKey)
} catch (error) {
    if (error instanceof NotFoundException) {
        // Handle not found
    } else if (error instanceof RetryableException) {
        // Retry with backoff
        const retryAfterMs = error.retryAfterMs
    }
}
```

## Implementation Pattern

### Step 1: Define Repository Interface

```typescript
// backend/src/repos/playerSqlRepository.ts
export interface IPlayerSqlRepository {
    getById(id: string): Promise<PlayerRecord | null>
    create(player: PlayerRecord): Promise<PlayerRecord>
    update(id: string, player: PlayerRecord): Promise<PlayerRecord>
}
```

### Step 2: Implement Repository

```typescript
// backend/src/repos/playerSqlRepository.cosmos.ts
@injectable()
export class CosmosPlayerSqlRepository extends CosmosDbSqlRepository<PlayerRecord> implements IPlayerSqlRepository {
    constructor(@inject('CosmosDbSqlClient') client: ICosmosDbSqlClient) {
        super(client, 'players') // Container name
    }

    async getById(id: string): Promise<PlayerRecord | null> {
        // Players use /id as partition key
        return this.getById(id, id)
    }

    async create(player: PlayerRecord): Promise<PlayerRecord> {
        const result = await this.create(player)
        return result.resource
    }

    async update(id: string, player: PlayerRecord): Promise<PlayerRecord> {
        const result = await this.replace(id, player, id)
        return result.resource
    }
}
```

### Step 3: Register in Dependency Injection

```typescript
// backend/src/inversify.config.ts
if (resolvedMode === 'cosmos') {
    const persistenceConfig = container.get<IPersistenceConfig>('PersistenceConfig')

    // Register SQL client configuration
    container.bind<CosmosDbSqlClientConfig>('CosmosDbSqlConfig').toConstantValue({
        endpoint: persistenceConfig.cosmos.sqlEndpoint,
        database: 'game'
    })

    // Register SQL client (singleton)
    container.bind<ICosmosDbSqlClient>('CosmosDbSqlClient').to(CosmosDbSqlClient).inSingletonScope()

    // Register repository (singleton)
    container.bind<IPlayerSqlRepository>('IPlayerSqlRepository').to(CosmosPlayerSqlRepository).inSingletonScope()
} else {
    container.bind<IPlayerSqlRepository>('IPlayerSqlRepository').to(InMemoryPlayerSqlRepository).inSingletonScope()
}
```

### Step 4: Use in Handlers

```typescript
// backend/src/handlers/playerGet.ts
export class PlayerGetHandler {
    constructor(@inject('IPlayerSqlRepository') private playerRepo: IPlayerSqlRepository) {}

    async handle(playerId: string): Promise<PlayerRecord | null> {
        try {
            return await this.playerRepo.getById(playerId)
        } catch (error) {
            if (error instanceof NotFoundException) {
                return null
            }
            throw error
        }
    }
}
```

## Testing Pattern

### Mock Repository for Unit Tests

```typescript
// backend/test/mocks/mockSqlRepository.ts
export class MockSqlRepository<T extends { id: string }> {
    private items = new Map<string, T>()
    public telemetryEvents: Array<{ event: string; data: Record<string, unknown> }> = []

    constructor(private containerName: string) {}

    async getById(id: string, partitionKey: string): Promise<T | null> {
        const key = `${partitionKey}:${id}`
        return this.items.get(key) || null
    }

    // ... other methods
}
```

### Unit Test Example

```typescript
// backend/test/unit/playerRepository.test.ts
describe('Player Repository', () => {
    let repo: MockSqlRepository<PlayerRecord>

    beforeEach(() => {
        repo = new MockSqlRepository('players')
    })

    test('should retrieve player by id', async () => {
        const player: PlayerRecord = { id: 'test-1', name: 'Test Player', ... }
        await repo.create(player, 'test-1')

        const result = await repo.getById('test-1', 'test-1')

        assert.ok(result)
        assert.strictEqual(result.id, 'test-1')
    })
})
```

## Telemetry

All repository operations automatically emit telemetry:

### SQL.Query.Executed

Emitted on successful operations:

```typescript
{
    operationName: 'players.GetById',
    latencyMs: 45,
    ruCharge: 1.0,
    resultCount: 1
}
```

### SQL.Query.Failed

Emitted on errors:

```typescript
{
    operationName: 'players.Create',
    latencyMs: 23,
    httpStatusCode: 409  // Conflict
}
```

## Partition Key Strategy

Per ADR-002 and Copilot Instructions Section 5:

| Container           | Partition Key | Pattern                     |
| ------------------- | ------------- | --------------------------- |
| `players`           | `/id`         | Player GUID                 |
| `inventory`         | `/playerId`   | Player GUID                 |
| `descriptionLayers` | `/locationId` | Location GUID               |
| `worldEvents`       | `/scopeKey`   | `loc:<id>` or `player:<id>` |

## Configuration

Environment variables (wired in Bicep):

```bash
COSMOS_SQL_ENDPOINT=https://<account>.documents.azure.com:443/
COSMOS_SQL_DATABASE=game
```

Cosmos SQL API access uses Azure AD (Managed Identity) in production; no SQL key environment variable is required.

## Error Handling Guidelines

### NotFound (404)

- **Return null** for read operations where absence is valid (e.g., `getById`)
- **Throw exception** for update/delete operations where entity must exist

### Conflict (409)

- **Throw ConcurrencyException** for duplicate key violations
- Caller decides retry strategy (usually don't retry)

### Throttling (429)

- **Throw RetryableException** with `retryAfterMs` hint
- Caller should implement exponential backoff
- Consider increasing RU provisioning if sustained

### Precondition Failed (412)

- **Throw PreconditionFailedException** for etag mismatches
- Indicates concurrent modification; caller should re-fetch and retry

## Non-Goals (Out of Scope)

- **Caching layer**: Direct Cosmos queries for MVP (caching deferred to M5 Systems)
- **Connection pooling**: SDK default acceptable for MVP
- **Cross-API transactions**: Eventual consistency accepted (no distributed transactions)
- **Automatic retry logic**: Caller-controlled retry strategies

## References

- Epic [#386 Cosmos Dual Persistence Implementation](https://github.com/piquet-h/the-shifting-atlas/issues/386)
- ADR-002: Graph Partition Strategy
- Copilot Instructions Section 5: Cosmos DB SQL API Containers
- [Cosmos DB RU optimization](https://learn.microsoft.com/en-us/azure/cosmos-db/request-units)
- [Optimistic concurrency with ETags](https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/database-transactions-optimistic-concurrency)

## Migration Path

1. ✅ Create base repository and exception classes
2. ✅ Add telemetry integration
3. ✅ Write unit tests with mock repository
4. 🔜 Migrate `players` container (replace Gremlin vertex operations)
5. 🔜 Migrate `inventory` container
6. 🔜 Migrate `descriptionLayers` container
7. 🔜 Migrate `worldEvents` timeline
8. 🔜 Integration tests with dual persistence
9. 🔜 Monitor RU consumption and optimize queries

## Success Metrics

- Zero direct `@azure/cosmos` SDK calls outside repository layer
- ≥95% unit test coverage for repositories
- ≥30% RU reduction for player/inventory queries (vs Gremlin)
- All telemetry events include RU charge
