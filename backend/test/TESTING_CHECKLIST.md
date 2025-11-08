# Testing Checklist for Operation Latency Monitoring

## Unit Tests (Pending Implementation)

### State Management Tests
- [ ] Consecutive window counting increments correctly
  - [ ] Warning windows increment when P95 between 500-600ms
  - [ ] Critical windows increment when P95 > 600ms
  - [ ] Healthy windows increment when P95 < 450ms
  - [ ] Counters reset appropriately on state transitions

- [ ] Alert triggering logic
  - [ ] Alert fires after 3 consecutive warning windows
  - [ ] Alert fires after 3 consecutive critical windows
  - [ ] Critical alert can supersede warning alert
  - [ ] No duplicate alerts for same state

- [ ] Resolution logic
  - [ ] Auto-resolve after 2 consecutive healthy windows
  - [ ] Resolution only fires if alert was active
  - [ ] State properly resets to 'none' after resolution

- [ ] Edge cases
  - [ ] Oscillating latency (500→600→500→600) doesn't trigger spurious alerts
  - [ ] Single spike doesn't trigger alert (requires 3 consecutive)
  - [ ] Transition from critical to warning to healthy works correctly

### Query Logic Tests
- [ ] KQL queries are syntactically correct
- [ ] P95 calculation returns expected values
- [ ] Sample size counting works correctly
- [ ] Baseline query uses correct 24h window
- [ ] Time ranges are calculated correctly

### Filtering Tests
- [ ] Windows with <20 calls emit InsufficientData event
- [ ] Windows with <20 calls don't increment consecutive counters
- [ ] Windows with exactly 20 calls are processed
- [ ] Windows with >20 calls are processed

## Integration Tests (Requires Application Insights Mock)

### Query Execution
- [ ] LogsQueryClient successfully authenticates with DefaultAzureCredential
- [ ] Queries execute without errors
- [ ] Result parsing handles different response formats
- [ ] Error handling for query failures

### Telemetry Emission
- [ ] All 5 event types emit correctly
- [ ] Event dimensions contain expected values
- [ ] Correlation IDs are preserved
- [ ] Events reach Application Insights

### Timer Function
- [ ] Function triggers on schedule
- [ ] Handler is invoked correctly
- [ ] Errors are logged appropriately
- [ ] Function completes within timeout

## E2E Tests (Requires Full Environment)

### Happy Path
- [ ] Timer triggers at scheduled intervals
- [ ] Operations are queried successfully
- [ ] Alerts fire after meeting thresholds
- [ ] Resolutions fire after recovery
- [ ] All telemetry appears in Application Insights

### Error Scenarios
- [ ] Missing APPINSIGHTS_WORKSPACE_ID is handled
- [ ] Query permission errors are logged
- [ ] Network failures don't crash function
- [ ] Partial failures (some ops succeed, some fail) are handled

### Performance
- [ ] Monitoring cycle completes in <30 seconds
- [ ] Query costs are reasonable
- [ ] Memory usage stays within limits
- [ ] No rate limiting from Application Insights

## Manual Verification

### Deployment
- [ ] Function appears in Azure portal
- [ ] Timer trigger is visible
- [ ] Environment variables are set correctly
- [ ] Managed Identity has Monitoring Reader role

### Monitoring
- [ ] Monitoring.OperationLatency.Complete events appear every 10 minutes
- [ ] No Monitoring.OperationLatency.Error events (unless intentional test)
- [ ] InsufficientData events appear for low-volume operations
- [ ] Alert events fire during simulated latency degradation

### Documentation
- [ ] Setup guide is accurate
- [ ] KQL queries in docs return expected results
- [ ] Troubleshooting guide resolves common issues
- [ ] Telemetry catalog matches actual event schema

## Linting & Formatting

- [x] All files pass Prettier formatting checks
- [ ] All files pass ESLint checks (pending dependency installation)
- [ ] No TypeScript compilation errors (pending dependency installation)
- [ ] No unused imports or variables

## Security Review

- [ ] No secrets or credentials in code
- [ ] Managed Identity used for authentication
- [ ] Minimal permissions requested (Monitoring Reader only)
- [ ] No PII in telemetry events
- [ ] Error messages don't leak sensitive data

## Documentation Review

- [x] Telemetry catalog updated with new events
- [x] Setup guide created with configuration details
- [x] Thresholds table documents alert levels
- [x] KQL query examples provided
- [x] Troubleshooting section covers common issues
- [ ] README or main observability doc links to new guide

## Acceptance Criteria Verification

From Issue #10:

- [x] Monitors listed operations individually for P95 latency >600ms (critical) or >500ms (warning)
- [x] Requires 3 consecutive 10-min windows for alert
- [x] Ignores windows with <20 calls (insufficient data) and logs diagnostic
- [x] Payload identifies operationName, current P95, baseline P95 (24h), sample size
- [x] Auto-resolve after 2 consecutive windows below 450ms
- [x] Added to telemetry catalog with thresholds table

## Follow-up Tasks

- [ ] Add comprehensive unit tests (export testable functions from handler)
- [ ] Add integration tests with mocked Application Insights client
- [ ] Add Monitoring Reader role assignment to Bicep
- [ ] Create Application Insights dashboard for monitoring job health
- [ ] Set up alerts on Monitoring.OperationLatency.Error events
- [ ] Consider Azure Monitor alerts as alternative to custom function
- [ ] Add metric aggregation if alert frequency becomes high
