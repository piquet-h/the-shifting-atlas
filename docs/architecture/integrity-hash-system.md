# Description Integrity Hash System

## Overview

The integrity hash system provides automated corruption detection for description layers in The Shifting Atlas. It computes and stores SHA-256 hashes of description content to enable validation and anomaly detection.

## Hash Algorithm: SHA-256

**Decision**: Use SHA-256 (Secure Hash Algorithm 256-bit) for integrity hash computation.

**Rationale**:
1. **Industry Standard**: SHA-256 is widely adopted and trusted in production systems worldwide
2. **Collision Resistance**: Cryptographically secure with negligible collision probability for our use case
3. **Consistency**: Already used in the codebase (`contentHash.ts`) for content versioning
4. **Performance**: Fast computation even for large text blocks (50KB+ descriptions)
5. **Deterministic**: Same content always produces identical hash, enabling reliable mismatch detection
6. **Fixed Length**: 64-character hexadecimal output (256 bits) regardless of input size

**Alternatives Considered**:
- **MD5**: Rejected due to known cryptographic weaknesses and collision vulnerabilities
- **SHA-1**: Rejected due to deprecation and security concerns
- **SHA-512**: Unnecessary overhead; SHA-256 provides sufficient security for integrity checks
- **CRC32**: Rejected; not collision-resistant enough for corruption detection

## Architecture

### Components

1. **Hash Computation Utility** (`backend/src/repos/utils/integrityHash.ts`)
   - `computeIntegrityHash(content: string): string` - Computes SHA-256 hash
   - `verifyIntegrityHash(content: string, storedHash: string): boolean` - Validates hash

2. **Repository Extensions** 
   - `DescriptionLayer.integrityHash?: string` - Optional hash field (backward compatible)
   - `IDescriptionRepository.getAllLayers()` - Retrieve all layers for batch processing
   - `IDescriptionRepository.updateIntegrityHash()` - Store computed hash

3. **Timer-Triggered Job** (`backend/src/functions/timerComputeIntegrityHashes.ts`)
   - Azure Functions timer trigger (default: daily at 2:00 AM UTC)
   - Configurable schedule via `INTEGRITY_JOB_SCHEDULE` environment variable

4. **Handler Logic** (`backend/src/handlers/computeIntegrityHashes.ts`)
   - Batch processing (default: 100 layers per batch)
   - Idempotent: skips layers with valid existing hashes
   - Mismatch detection and correction
   - Comprehensive telemetry

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INTEGRITY_JOB_SCHEDULE` | `"0 0 2 * * *"` | NCRONTAB schedule expression (daily at 2 AM UTC) |
| `INTEGRITY_JOB_BATCH_SIZE` | `100` | Number of descriptions to process per batch |
| `INTEGRITY_JOB_RECOMPUTE_ALL` | `false` | If `true`, recompute all hashes even if valid |

### Schedule Format

The schedule uses NCRONTAB format (6 fields):

```
{second} {minute} {hour} {day} {month} {day-of-week}
```

Examples:
- `"0 0 2 * * *"` - Daily at 2:00 AM UTC (default)
- `"0 0 */6 * * *"` - Every 6 hours
- `"0 30 3 * * 0"` - Weekly on Sunday at 3:30 AM UTC

## Telemetry Events

| Event Name | When Emitted | Key Properties |
|------------|--------------|----------------|
| `Description.Integrity.JobStart` | Job begins | `batchSize`, `recomputeAll` |
| `Description.Integrity.JobComplete` | Job finishes | `processed`, `updated`, `mismatches`, `skipped`, `durationMs`, `success` |
| `Description.Integrity.Computed` | Hash computed/updated | `layerId`, `locationId`, `contentLength` |
| `Description.Integrity.Unchanged` | Hash valid, skipped | `layerId`, `locationId` |
| `Description.Integrity.Mismatch` | Corruption detected | `layerId`, `locationId`, `storedHash` (truncated), `currentHash` (truncated) |

## Behavior

### Normal Operation

1. Job retrieves all description layers (including archived)
2. For each layer:
   - Compute current SHA-256 hash of content
   - If layer has existing hash:
     - Compare with current hash
     - If match: skip (emit `Unchanged`)
     - If mismatch: log warning, update hash (emit `Mismatch`)
   - If no existing hash: store computed hash (emit `Computed`)
3. Process in configurable batches to manage memory
4. Emit summary telemetry with counts

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty repository | Complete successfully with 0 processed |
| Very large content (50KB+) | Compute hash normally (SHA-256 handles any size) |
| Missing description document | Skipped (not in `getAllLayers()` result) |
| Archived layers | Processed for complete integrity baseline |
| Concurrent executions | Safe (reads are idempotent, updates are atomic) |

### Idempotency

The job is **idempotent by design**:
- Skips layers with valid hashes (unless `RECOMPUTE_ALL=true`)
- Updates only layers with missing or invalid hashes
- Can be safely re-run without side effects
- No data loss if interrupted

## Corruption Detection

### Detection Process

1. Hash mismatch indicates one of:
   - Data corruption (storage layer issue)
   - Manual content modification
   - Software bug
   - Race condition (write during hash computation)

2. Job automatically corrects the hash to match current content

3. Mismatch telemetry enables alerting:
   - Monitor `Description.Integrity.Mismatch` events
   - Alert on threshold (e.g., >5 mismatches per job)
   - Investigate storage layer or application logic

### False Positives

Minimal false positive rate:
- SHA-256 collision probability: ~1 in 2^256 (astronomically unlikely)
- False positives more likely indicate legitimate content changes

## Testing

### Unit Tests

**Hash Utility Tests** (`test/unit/integrityHash.test.ts`):
- Consistent hash generation
- Different content produces different hashes
- Unicode character support
- Whitespace sensitivity
- Large content handling
- Verification logic

**Job Handler Tests** (`test/unit/integrityHashJob.test.ts`):
- Compute hashes for all descriptions
- Skip layers with valid hashes
- Detect hash mismatches
- Process archived layers
- Handle empty repository
- Telemetry emission
- RECOMPUTE_ALL mode
- Very large descriptions

### Test Coverage

- **17 unit tests** covering all scenarios
- Edge cases: empty repo, large content, archived layers, corruption
- Telemetry validation for all lifecycle events
- Mock repository for fast, isolated tests

## Performance

### Estimated Performance

| Metric | Value | Notes |
|--------|-------|-------|
| Hash computation | ~0.1ms per description | For typical 500-character descriptions |
| Batch size | 100 | Configurable; balances memory vs. progress visibility |
| 10,000 descriptions | ~10 seconds | Includes repository I/O and telemetry |
| Memory usage | <100 MB | For 10,000 descriptions with 1KB average size |

### Optimization Opportunities (Future)

1. **Incremental Processing**: Track last run timestamp, process only new/modified layers
2. **Parallel Batches**: Process multiple batches concurrently (requires thread safety)
3. **Bloom Filter**: Quick check for layers needing recomputation
4. **Streaming Hashing**: For extremely large descriptions (>10MB)

## Operational Considerations

### Monitoring

**Key Metrics**:
- Job execution frequency (should match schedule)
- `mismatches` count (should be near zero)
- `durationMs` (detect performance degradation)
- Job failures (`success=false` in JobComplete event)

**Alerts**:
- Job failure: Critical (investigate immediately)
- High mismatch rate (>1% of processed): Warning (potential storage issue)
- Job duration spike (>2x baseline): Warning (check batch size or repository)

### Troubleshooting

| Issue | Diagnosis | Resolution |
|-------|-----------|------------|
| Job not running | Check timer trigger logs | Verify `INTEGRITY_JOB_SCHEDULE` format |
| High mismatch rate | Review storage health | Check Azure Storage metrics, investigate content writes |
| Job timeout | Check batch size | Reduce `INTEGRITY_JOB_BATCH_SIZE` |
| Memory issues | Large layer count | Reduce batch size, consider incremental processing |

## Future Enhancements

### M5 Systems Milestone

- ✅ **Hash computation job** (Issue #153)
- 🔄 **Cache optimization layer** (Issue #154) - Use hashes for cache invalidation
- 🔄 **Simulation harness** (Issue #155) - Inject corruption for resilience testing
- 🔄 **Alerting logic** (Issue #156) - Automated alerts on anomaly detection

### Post-M5

- **Incremental processing**: Store last successful run timestamp
- **Hash verification on read**: Detect corruption at access time (not just scheduled)
- **Content-addressable storage**: Use hash as location ID (deduplication)
- **Signed hashes**: HMAC-SHA256 for tamper detection (authenticated integrity)

## References

- **Issue**: piquet-h/the-shifting-atlas#153
- **Epic**: piquet-h/the-shifting-atlas#69 (Systems - Integrity & Observability)
- **Related Issues**: #154 (Cache), #155 (Simulation), #156 (Alerting)
- **Hash Implementation**: `backend/src/repos/utils/integrityHash.ts`
- **Job Function**: `backend/src/functions/timerComputeIntegrityHashes.ts`
- **Handler**: `backend/src/handlers/computeIntegrityHashes.ts`
- **Tests**: `backend/test/unit/integrityHash.test.ts`, `backend/test/unit/integrityHashJob.test.ts`
