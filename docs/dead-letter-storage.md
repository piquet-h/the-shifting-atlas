# Dead-Letter Storage & Redaction

## Overview

The dead-letter storage system provides persistent storage for failed world events with automatic redaction of sensitive player data. This enables debugging and analysis of validation failures without exposing private information.

## Architecture

### Components

1. **DeadLetterRecord** (`shared/src/deadLetter.ts`)
   - Type definition for stored dead-letter records
   - Includes original event metadata, error details, and redacted envelope
   - Stored in Cosmos SQL API container (`deadLetters`)

2. **Redaction Utilities** (`shared/src/deadLetter.ts`)
   - `redactEnvelope()`: Redacts sensitive fields from event envelopes
   - `createDeadLetterRecord()`: Creates complete dead-letter record from failed event

3. **Repository Layer** (`backend/src/repos/deadLetterRepository*.ts`)
   - `IDeadLetterRepository`: Interface for dead-letter storage
   - `CosmosDeadLetterRepository`: Cosmos SQL implementation
   - `MemoryDeadLetterRepository`: In-memory implementation for testing

4. **Queue Processor Integration** (`backend/src/functions/queueProcessWorldEvent.ts`)
   - Automatic dead-letter storage on validation failures
   - Graceful failure handling (logs but doesn't throw)

## Redaction Strategy

### Fields Preserved (Non-Sensitive)
- `eventId` - Event identifier
- `type` - Event type
- `version` - Schema version
- `occurredUtc` / `ingestedUtc` - Timestamps
- `correlationId` / `causationId` - Correlation identifiers
- `idempotencyKey` - Idempotency key

### Fields Redacted

#### Player IDs
- Last 4 characters preserved
- Earlier characters masked with asterisks
- Example: `12345678-1234-4234-8234-123456789012` → `********9012`

#### Payloads
- Replaced with type summary:
  - `_fieldCount`: Number of fields
  - `_fields`: Array of field names
  - Redacted IDs for fields containing "id" in the name

#### Large Values
- Strings > 10KB: Truncated with `...[TRUNCATED]` marker
- Arrays > 10 items: Limited to first 10 items + truncation marker

## Storage Schema

### DeadLetterRecord Type

```typescript
interface DeadLetterRecord {
    id: string                    // Unique record ID (UUID v4)
    originalEventId?: string      // Original event ID (if parseable)
    eventType?: string           // Event type (if parseable)
    actorKind?: string           // Actor kind (if parseable)
    redactedEnvelope: object     // Redacted original envelope
    error: {
        category: string         // Error category (e.g., 'schema-validation')
        message: string          // Human-readable error message
        issues?: Array<{         // Validation issues (e.g., Zod errors)
            path: string
            message: string
            code: string
        }>
    }
    deadLetteredUtc: string      // ISO 8601 timestamp
    occurredUtc?: string         // Original occurred timestamp (if parseable)
    correlationId?: string       // Correlation ID (if parseable)
    redacted: boolean            // Always true
    partitionKey: string         // Partition key ('deadletter')
}
```

### Cosmos SQL Container

**Container**: `deadLetters`  
**Partition Key**: `/partitionKey` (value: `'deadletter'`)  
**Indexing**: Automatic indexing on all fields  
**TTL**: Not configured (manual cleanup required)

## Query Interface

### Programmatic Access

```typescript
import { CosmosDeadLetterRepository } from './repos/deadLetterRepository.cosmos.js'
import { loadPersistenceConfigAsync } from './persistenceConfig.js'

const config = await loadPersistenceConfigAsync()
const repo = new CosmosDeadLetterRepository(
    config.cosmosSql!.endpoint,
    config.cosmosSql!.database,
    config.cosmosSql!.containers.deadLetters
)

// Query by time range
const records = await repo.queryByTimeRange(
    '2025-10-31T00:00:00Z',
    '2025-10-31T23:59:59Z',
    100 // max results
)

// Get single record by ID
const record = await repo.getById('dead-letter-id')
```

### Admin Query Script

The `scripts/query-deadletters.ts` script provides a command-line interface for querying dead-letter records.

**Query by time range:**
```bash
npm run query:deadletters -- --start "2025-10-31T00:00:00Z" --end "2025-10-31T23:59:59Z"
npm run query:deadletters -- --start "2025-10-31T00:00:00Z" --end "2025-10-31T23:59:59Z" --limit 50
```

**Query by ID:**
```bash
npm run query:deadletters -- --id "dead-letter-record-id"
```

**JSON output:**
```bash
npm run query:deadletters -- --start "2025-10-31T00:00:00Z" --end "2025-10-31T23:59:59Z" --json
```

**Options:**
- `--start`: Start time (ISO 8601 format)
- `--end`: End time (ISO 8601 format)
- `--limit`: Maximum records to return (default: 100, max: 1000)
- `--id`: Retrieve single record by ID
- `--json`: Output as JSON instead of formatted text

## Telemetry

### Events Emitted

**`World.Event.DeadLettered`**  
Emitted when a world event is dead-lettered due to validation failure.

**Dimensions:**
- `reason`: Error category (`'schema-validation'`, `'json-parse'`)
- `errorCount`: Number of validation errors
- `recordId`: Dead-letter record ID
- `eventType`: Original event type (if parseable)
- `correlationId`: Correlation ID (if parseable)

**Example:**
```typescript
trackGameEventStrict(
    'World.Event.DeadLettered',
    {
        reason: 'schema-validation',
        errorCount: 2,
        recordId: 'abc123',
        eventType: 'Player.Move',
        correlationId: 'xyz789'
    },
    { correlationId: 'xyz789' }
)
```

## Error Handling

### Graceful Degradation

Dead-letter storage failures do NOT block event processing:

1. **Storage unavailable**: Logs error, continues processing
2. **Redaction failure**: Logs error, may store partial data
3. **Query failures**: Return empty array, log error

This ensures that dead-letter infrastructure issues never impact the happy path of world event processing.

### Failure Scenarios

| Scenario | Behavior |
|----------|----------|
| Cosmos DB unavailable | Logs error, event discarded (no retry) |
| Redaction exception | Logs error, stores raw envelope |
| Duplicate record ID | Upsert overwrites previous record |
| Query timeout | Returns empty array, logs timeout |

## Configuration

### Environment Variables

**Required (Cosmos mode):**
- `COSMOS_SQL_ENDPOINT` - Cosmos SQL API endpoint
- `COSMOS_SQL_DATABASE` - Database name (e.g., `game`)
- `COSMOS_SQL_CONTAINER_DEADLETTERS` - Container name (default: `deadLetters`)

**Optional:**
- `PERSISTENCE_MODE` - Set to `memory` for testing (uses in-memory storage)

### Infrastructure Provisioning

The dead-letter container must be provisioned in Cosmos SQL API:

**Bicep (infrastructure/main.bicep):**
```bicep
resource deadLettersContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'deadLetters'
  properties: {
    resource: {
      id: 'deadLetters'
      partitionKey: {
        paths: ['/partitionKey']
        kind: 'Hash'
      }
    }
  }
}
```

## Testing

### Test Coverage

**Unit Tests:**
- `test/unit/deadLetterRedaction.test.ts` - Redaction logic (6 tests)
- `test/unit/deadLetterRepository.test.ts` - Repository interface (8 tests)

**Integration Tests:**
- `test/integration/deadLetterIntegration.test.ts` - Queue processor integration (6 tests)

### Test Patterns

**Testing redaction:**
```typescript
import { redactEnvelope, createDeadLetterRecord } from '@piquet-h/shared/deadLetter'

const redacted = redactEnvelope({
    eventId: 'test-id',
    actor: { kind: 'player', id: '12345678-1234-4234-8234-123456789012' }
})

// Verify ID redaction
assert.ok(redacted.actor.id.includes('*'))
assert.ok(redacted.actor.id.endsWith('9012'))
```

**Testing repository:**
```typescript
import { MemoryDeadLetterRepository } from './repos/deadLetterRepository.memory.js'

const repo = new MemoryDeadLetterRepository()
const record = createDeadLetterRecord(
    { eventId: 'test' },
    { category: 'test', message: 'Test error' }
)

await repo.store(record)
const retrieved = await repo.getById(record.id)
```

## Monitoring & Observability

### Key Metrics

1. **Dead-letter rate**: `World.Event.DeadLettered` event count
2. **Error categories**: Group by `reason` dimension
3. **Storage failures**: Log analysis for "Failed to store dead-letter record"

### Alerts

**Recommended alert conditions:**
- Dead-letter rate > X per minute (indicates widespread validation issues)
- Storage failure rate > 5% (indicates infrastructure issues)
- Sudden spike in specific error category (indicates new bug)

### Dashboard Queries (Application Insights)

**Dead-letter rate by error category:**
```kusto
customEvents
| where name == "World.Event.DeadLettered"
| summarize count() by tostring(customDimensions.reason), bin(timestamp, 1h)
| render timechart
```

**Recent validation failures:**
```kusto
customEvents
| where name == "World.Event.DeadLettered"
| where timestamp > ago(1h)
| project timestamp, 
    reason = tostring(customDimensions.reason),
    eventType = tostring(customDimensions.eventType),
    errorCount = toint(customDimensions.errorCount)
| order by timestamp desc
```

## Operational Procedures

### Investigating Validation Failures

1. **Check telemetry** for spike in `World.Event.DeadLettered` events
2. **Query dead-letters** for the affected time range:
   ```bash
   npm run query:deadletters -- --start "2025-10-31T12:00:00Z" --end "2025-10-31T13:00:00Z"
   ```
3. **Analyze patterns** in error messages and redacted envelopes
4. **Identify root cause** (client bug, schema change, data corruption)
5. **Fix issue** and deploy correction

### Manual Cleanup

Dead-letter records do not expire automatically. Periodic cleanup recommended:

```typescript
// Delete old records (pseudo-code)
const cutoffDate = new Date()
cutoffDate.setDate(cutoffDate.getDate() - 90) // 90 days old

const oldRecords = await repo.queryByTimeRange(
    '2025-01-01T00:00:00Z',
    cutoffDate.toISOString(),
    1000
)

// Delete via Cosmos SQL API...
```

## Security Considerations

### Data Retention

- Dead-letter records contain redacted player data
- Still subject to data retention policies (GDPR, etc.)
- Implement automated cleanup after retention period

### Access Control

- Dead-letter queries require read access to Cosmos SQL container
- Restrict admin query script to authorized personnel
- Consider separate access policies for dead-letter container

### Sensitive Data Exposure

While data is redacted, dead-letter records still contain:
- Partial player IDs (last 4 characters)
- Event correlation IDs
- Structural information about payloads

**Mitigation:**
- Audit access to dead-letter container
- Encrypt at rest (Cosmos DB default)
- Limit query access to need-to-know basis

## Future Enhancements

### Planned Features
- Automatic replay mechanism for recoverable errors
- Dead-letter alerting integration (Azure Monitor, PagerDuty)
- Full payload encryption option (beyond redaction)
- TTL-based automatic cleanup
- Admin UI for dead-letter management

### Schema Evolution
- Version field in `DeadLetterRecord` for backward compatibility
- Migration strategy for adding new fields
- Compatibility with older dead-letter records

## References

- Issue: #257 (World Event Dead-Letter Storage & Redaction)
- World Event Contract: `docs/architecture/world-event-contract.md`
- Telemetry Events: `shared/src/telemetryEvents.ts`
- Queue Processor: `backend/src/functions/queueProcessWorldEvent.ts`
