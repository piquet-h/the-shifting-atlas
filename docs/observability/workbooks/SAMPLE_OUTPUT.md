# Movement Blocked Reasons Breakdown - Sample Output

This document shows example output for the Movement Blocked Reasons Breakdown dashboard panel.

## Panel 1: Blocked Events by Reason (Last 24 Hours)

### Sample Data Table

| Reason              | Count | % Share | Alert      | Sample Players                                      |
|---------------------|-------|---------|------------|-----------------------------------------------------|
| no-exit             | 142   | 58.03   | ⚠️ HIGH    | ["9d2f...", "a4b1...", "f3c7..."]                  |
| invalid-direction   | 67    | 27.37   |            | ["b2e5...", "7f9a...", "c1d8..."]                  |
| move-failed         | 23    | 9.39    |            | ["e4a2...", "d9f3...", "8b5c..."]                  |
| from-missing        | 12    | 4.90    |            | ["f1b6...", "a8c4...", "3e9d..."]                  |
| other               | 1     | 0.41    |            | ["2c7f..."]                                        |

**Total: 245 blocked events**

### Interpretation of Sample Data

**⚠️ HIGH CONCENTRATION DETECTED:**
- `no-exit` represents 58% of all blocked events - exceeds 50% threshold
- **Action Required:** Review world connectivity in frequently visited locations
- **Possible Causes:**
  - Incomplete bidirectional exit creation
  - Players attempting to move in expected directions that don't exist
  - World generation gaps in specific regions

**Secondary Friction Points:**
- `invalid-direction` at 27% suggests reasonable direction normalization
- `move-failed` at 9% indicates good system reliability
- `from-missing` at 5% is at the critical threshold - monitor closely

---

## Panel 2: 7-Day Blocked Rate Trend

### Sample Time Series

```
Time                 | Blocked Rate % | Blocked Moves | Total Moves
---------------------|----------------|---------------|-------------
2025-11-01 00:00     | 8.2           | 23            | 281
2025-11-01 06:00     | 12.1          | 45            | 372
2025-11-01 12:00     | 9.5           | 38            | 400
2025-11-01 18:00     | 15.3          | 67            | 438
2025-11-02 00:00     | 11.2          | 41            | 366
2025-11-02 06:00     | 7.8           | 28            | 359
...                  | ...           | ...           | ...
2025-11-04 06:00     | 14.7          | 58            | 394
```

**Trend Analysis:**
- Average blocked rate: ~11.2% over 7 days
- Peak: 15.3% during evening hours (18:00-20:00 UTC)
- Baseline: 7-9% during off-peak hours
- **Observation:** Higher blocked rate correlates with increased player activity

---

## Panel 3: Summary Statistics

| Metric                   | Value                                      |
|--------------------------|-------------------------------------------|
| Total Blocked Events     | 245 events                                |
| Most Common Reason       | no-exit                                   |
| Time Range              | 24 hours                                  |

---

## Empty State Example

When no blocked events exist:

| Metric                   | Value                                      |
|--------------------------|-------------------------------------------|
| Total Blocked Events     | No traversal friction detected ✓          |
| Most Common Reason       | N/A                                       |
| Time Range              | 24 hours                                  |

---

## Real-World Scenarios

### Scenario 1: Healthy System
```
Reason              | Count | % Share | Alert
--------------------|-------|---------|------
invalid-direction   | 12    | 48.00   |
no-exit            | 8     | 32.00   |
move-failed        | 3     | 12.00   |
from-missing       | 2     | 8.00    |
```
**Assessment:** Balanced distribution, no alerts. System functioning normally.

### Scenario 2: Normalization Issue
```
Reason              | Count | % Share | Alert
--------------------|-------|---------|----------
invalid-direction   | 156   | 78.00   | ⚠️ HIGH
no-exit            | 28    | 14.00   |
move-failed        | 12    | 6.00    |
from-missing       | 4     | 2.00    |
```
**Assessment:** Direction normalization needs tuning. Review common typos and enhance input parsing.

### Scenario 3: Data Integrity Problem
```
Reason              | Count | % Share | Alert
--------------------|-------|---------|----------
from-missing       | 89    | 74.17   | ⚠️ HIGH
no-exit            | 18    | 15.00   |
invalid-direction  | 10    | 8.33    |
move-failed        | 3     | 2.50    |
```
**Assessment:** CRITICAL - Player location references are stale or corrupted. Investigate player document sync immediately.

### Scenario 4: System Reliability Issue
```
Reason              | Count | % Share | Alert
--------------------|-------|---------|----------
move-failed        | 134   | 89.33   | ⚠️ HIGH
no-exit            | 10    | 6.67    |
invalid-direction  | 4     | 2.67    |
from-missing       | 2     | 1.33    |
```
**Assessment:** CRITICAL - Backend system errors. Check Cosmos DB throttling (429s), RU consumption, and error logs.

---

## Dashboard Actions Based on Results

### When `invalid-direction` is HIGH (>50%)
1. Export last 100 `Navigation.Input.Parsed` events with `status=unknown`
2. Identify top 10 most common typos
3. Update direction normalization algorithm with new patterns
4. Re-test with historical data
5. Deploy and monitor for improvement

### When `no-exit` is HIGH (>50%)
1. Query location graph for nodes with <2 exits
2. Generate report of "dead-end" locations
3. Review AI world generation prompts
4. Add missing bidirectional exits
5. Update world connectivity tests

### When `from-missing` is HIGH (>5%)
1. **STOP DEPLOYMENT** - Critical data issue
2. Check player document sync with location graph
3. Verify Cosmos DB replication lag
4. Review recent migration scripts
5. Implement player location healing job
6. Re-sync affected players

### When `move-failed` is HIGH (>10%)
1. Check Application Insights exceptions for Movement API
2. Review Cosmos DB RU consumption and throttling
3. Analyze P95 latency for movement operations
4. Check Service Bus queue backlog
5. Scale resources if needed
6. Add retry logic with exponential backoff

---

## Refresh Recommendations

- **Real-time monitoring:** Set Auto-refresh to 5 minutes
- **Historical analysis:** Manually refresh when viewing different time ranges
- **Alert setup:** Configure Azure Monitor alerts based on threshold conditions
- **Weekly review:** Export data on Mondays to track week-over-week trends

---

## Query Performance Notes

**Expected Query Times:**
- Panel 1 (Reason Table): ~200-500ms for 24h window
- Panel 2 (7-Day Trend): ~800ms-1.5s for 7d aggregation
- Panel 3 (Summary): ~150-300ms for counts

**Optimization Tips:**
- Reduce time range if queries timeout (7d → 3d)
- Use `| take 1000` to limit result sets during testing
- Check Application Insights sampling rate (affects count accuracy)
- Pre-aggregate data for longer historical views (future enhancement)
