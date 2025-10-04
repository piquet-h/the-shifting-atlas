# Sub-Issue 7: Update Documentation for Stage 2

**Parent Issue:** #83 - Automation Stage 2: Predictive Scheduling Integration  
**Labels:** `docs`, `M0`  
**Milestone:** M0 Foundation

## Context

Stage 2 introduces significant new functionality that must be documented comprehensively. Documentation updates ensure the team understands how provisional scheduling works, how to interpret variance metrics, and how to troubleshoot issues.

## Requirements

### 1. Files to Update

#### Primary Documentation

1. **docs/developer-workflow/implementation-order-automation.md**
   - Add Stage 2 implementation details
   - Document provisional scheduling workflow
   - Explain variance monitoring
   - Update automation maturity table

2. **docs/developer-workflow/roadmap-scheduling.md**
   - Add provisional vs actual scheduling distinction
   - Document integration with provisional storage
   - Add troubleshooting section for variance issues
   - Update environment variables

3. **.github/copilot-instructions.md**
   - Add provisional schedule comment format
   - Document variance alert handling
   - Update automation section with Stage 2 behavior

#### Supporting Documentation

4. **README.md**
   - Add Stage 2 automation to features section
   - Link to variance monitoring documentation
   - Note provisional schedule comments

5. **NEW: docs/developer-workflow/build-telemetry.md**
   - **Document telemetry separation:** Build vs game telemetry
   - `scripts/shared/build-telemetry.mjs` - CI/automation events (scheduler, ordering)
   - `shared/src/telemetry.ts` - Game domain events only (player, world)
   - Event naming conventions (`build.` prefix for automation)
   - Application Insights filtering strategies
   - Rationale: Keep shared folder for game code only

6. **docs/architecture/roadmap-consolidated.md** (if needed)
   - Reference Stage 2 as implemented
   - Note observability additions

6. **package.json**
   - Ensure all new npm scripts documented in comments

### 2. New Documentation Files

#### Create: docs/developer-workflow/variance-monitoring.md

**Purpose:** Comprehensive guide to variance monitoring system

**Sections:**

1. **Overview**
   - What is variance monitoring
   - Why it matters
   - Relationship to provisional scheduling

2. **Metrics**
   - Variance formula explanation
   - Confidence levels
   - Rolling window definition
   - Threshold levels (10%, 25%)

3. **Variance Alerts**
   - When alerts are created
   - Alert issue format
   - Escalation process
   - Manual resolution steps

4. **Interpreting Variance**
   - What causes high variance
   - Expected vs problematic variance
   - Pattern analysis examples
   - Common root causes

5. **Troubleshooting**
   - High variance: immediate actions
   - Persistent high variance: investigation steps
   - False positives: how to identify
   - Adjusting thresholds

6. **Configuration**
   - variance-config.json schema
   - Tuning parameters
   - When to adjust thresholds

7. **Queries and Dashboards**
   - Application Insights KQL queries
   - Example variance analysis queries
   - Future: Grafana dashboard setup

#### Create: docs/developer-workflow/build-telemetry.md

**Purpose:** Document separation between build and game telemetry

**Sections:**

1. **Overview**
   - Two separate telemetry systems
   - Why separation matters

2. **Build Telemetry** (`scripts/shared/build-telemetry.mjs`)
   - Purpose: CI/automation workflows (scheduler, ordering, variance)
   - Event prefix: `build.` (e.g., `build.schedule_variance`)
   - Custom dimension: `telemetrySource: 'build-automation'`
   - Not part of game domain

3. **Game Telemetry** (`shared/src/telemetry.ts`)
   - Purpose: In-game events (player actions, world generation, navigation)
   - Event format: `Domain.Subject.Action` (e.g., `Player.Get`, `Location.Move`)
   - Part of game domain code in `shared/`

4. **Separation Rules**
   - `shared/src/` is for **game domain code only**
   - `scripts/shared/` is for **build/automation tooling only**
   - Never mix build events into `shared/src/telemetryEvents.ts`
   - Use separate Application Insights instances or custom dimensions

5. **Event Naming Conventions**
   - Build events: `build.<component>_<action>` (snake_case after prefix)
   - Game events: `Domain.Subject.Action` (PascalCase, 2-3 segments)

6. **Querying Application Insights**
   - Filter by `telemetrySource` custom dimension
   - Build: `customDimensions.telemetrySource == 'build-automation'`
   - Game: `customDimensions.telemetrySource == 'game'` (or absence of build dimension)

7. **Rationale**
   - Prevents pollution of game telemetry with infrastructure noise
   - Different audiences (devs vs players/designers)
   - Different lifecycle (build fails vs game crashes)
   - Cleaner queries and dashboards

#### Create: docs/developer-workflow/provisional-scheduling.md

**Purpose:** Detailed explanation of provisional scheduling

**Sections:**

1. **Overview**
   - What is provisional scheduling
   - Difference from actual scheduling (daily scheduler)
   - Stage 2 goals

2. **How It Works**
   - Triggered by implementation order assignment
   - Duration estimation process
   - Confidence levels
   - Provisional comment posting

3. **Provisional Schedule Storage**
   - File location (roadmap/provisional-schedules.json)
   - Schema explanation
   - Lifecycle of a provisional schedule

4. **Confidence Levels**
   - High confidence criteria (≥5 scope|type samples)
   - Medium confidence criteria
   - Low confidence handling
   - Improving confidence over time

5. **Updating Provisional Schedules**
   - Partial rebaseline on status change
   - Manual adjustments
   - When schedules are recalculated

6. **Best Practices**
   - Label issues promptly
   - Use consistent scope/type labels
   - Close issues with accurate dates
   - Review provisional comments regularly

7. **Troubleshooting**
   - Provisional schedule not created
   - Inaccurate estimates
   - Comment not posted
   - Storage file corruption

### 3. Documentation Updates Detail

#### implementation-order-automation.md Updates

**Add Section: "Stage 2: Predictive Scheduling Integration (Implemented)"**

```markdown
### Stage 2 (Predictive Scheduling Integration) – Implemented

**Status:** ✅ Active (as of 2025-01)

Stage 2 extends ordering automation with provisional scheduling at assignment time, reducing scheduler churn and improving schedule predictability.

#### Features

**Provisional Schedules:**
- Calculated when implementation order assigned
- Based on historical completion durations
- Confidence-graded (high/medium/low)
- Posted as issue comments
- Stored in `roadmap/provisional-schedules.json`

**Variance Monitoring:**
- Daily comparison of provisional vs actual schedules
- Rolling 30-day window metrics
- Automatic alert issues when variance >25%
- Escalation at 2 weeks, rollback warning at 3 weeks

**Partial Rebaseline:**
- Status change to "In progress" triggers downstream recalculation
- Preserves upstream schedules
- Reduces cascading delays

#### Key Metrics (Target)

- Median provisional variance: <10%
- Scheduler re-run requests: ↓ ≥70%
- Alert issue creation: <1 per month

#### Documentation

- [Provisional Scheduling Guide](./provisional-scheduling.md)
- [Variance Monitoring Guide](./variance-monitoring.md)
- [Roadmap Scheduling](./roadmap-scheduling.md) (integration details)

#### Rollback Criteria

Rollback if median variance >25% for 3 consecutive weeks. See [rollback procedure](#stage-2-rollback).

#### npm Scripts

```bash
# Variance monitoring
npm run calculate:variance          # Calculate variance for all tracked issues
npm run check:variance-threshold    # Check if alert needed
npm run create:variance-alert       # Create/update alert issue

# Provisional scheduling
npm run update:provisional-schedule -- --issue 123  # Manual provisional update
npm run update:actual-schedules     # Sync actual dates after scheduler
npm run partial-rebaseline -- --issue 123  # Recalculate downstream

# Storage management
npm run clean:provisional-schedules  # Remove stale entries
```
```

**Add Section: "Stage 2 Rollback Procedure"**

```markdown
#### Stage 2 Rollback

If variance monitoring indicates systematic issues:

**Trigger:** Median variance >25% for 3 consecutive weeks

**Steps:**
1. Disable provisional comment posting:
   - Edit `.github/workflows/auto-assign-impl-order.yml`
   - Comment out "Post Provisional Schedule Comment" step
2. Stop variance calculations:
   - Edit `.github/workflows/calculate-variance.yml`
   - Disable schedule trigger (keep manual dispatch)
3. Archive provisional-schedules.json:
   - `mv roadmap/provisional-schedules.json roadmap/provisional-schedules.archived.json`
4. Document issues discovered:
   - Create rollback retrospective issue
   - Analyze root causes from variance data
5. Plan fixes:
   - Adjust estimation model
   - Improve historical data quality
   - Add missing complexity factors

**Preserves:**
- Historical variance data in Application Insights
- Archived provisional-schedules.json for analysis
- Core ordering and daily scheduling (unaffected)

**Re-enable:**
After fixes validated in test environment, reverse steps 1-2.
```

#### roadmap-scheduling.md Updates

**Add Section: "Integration with Provisional Scheduling"**

```markdown
### Integration with Provisional Scheduling

The daily roadmap scheduler integrates with Stage 2 provisional scheduling to track variance and improve estimation accuracy.

#### How It Works

1. **Provisional schedules** are created when implementation order is assigned (via `auto-assign-impl-order` workflow)
2. **Daily scheduler** assigns actual Start/Finish dates to Project fields
3. **Variance calculation** compares provisional vs actual (runs 30 min after scheduler)
4. **Alerts** are created if variance exceeds thresholds

#### Provisional vs Actual

| Aspect | Provisional | Actual |
|--------|-------------|--------|
| **Timing** | At order assignment | Daily at 00:02 UTC |
| **Storage** | provisional-schedules.json + comment | Project Start/Finish fields |
| **Calculation** | Historical medians + cursor projection | Strict sequential scheduling |
| **Updates** | On order change or partial rebaseline | Every scheduler run |
| **Purpose** | Early visibility, variance tracking | Authoritative schedule |

**Important:** Provisional schedules are estimates only. Always refer to Project fields for actual planned dates.

#### Variance Tracking

After scheduler runs, `calculate-variance.yml` workflow:
1. Loads provisional-schedules.json
2. Queries Project fields for actual dates
3. Calculates variance for each issue
4. Stores variance metrics
5. Checks thresholds and creates alerts if needed

See [Variance Monitoring Guide](./variance-monitoring.md) for details.

#### Updating Actual Schedules

The scheduler automatically updates provisional storage with actual dates:

```bash
npm run update:actual-schedules
```

This is called by `roadmap-scheduler.yml` after applying date field changes.

#### Troubleshooting

**Variance alerts every week:**
- Check if DEFAULT_DURATION_DAYS too low
- Review top variance contributors for patterns
- Consider adding explicit size labels

**Provisional and actual differ significantly:**
- Normal for early-stage project (building history)
- Check confidence levels (low confidence = sparse data)
- Verify closed issues have accurate Start/Finish dates

**Scheduler conflicts with provisional:**
- Scheduler is authoritative
- Provisional schedules may become stale if ordering changes frequently
- Run partial rebaseline to update provisional schedules
```

### 4. Documentation Standards

**Follow existing conventions:**
- Use markdown headings hierarchy (##, ###, ####)
- Include table of contents for long documents
- Use code fences with language hints
- Provide examples for all concepts
- Link between related documents
- Keep sentences concise (Hemingway grade ≤10)

**New conventions for Stage 2:**
- Prefix provisional schedule references with "provisional" to avoid confusion
- Always clarify "Project fields are authoritative"
- Include troubleshooting sections
- Provide example commands for all scripts

### 5. Comments in Code

**Add JSDoc comments to new modules:**

```javascript
/**
 * Duration estimation module for provisional scheduling (Stage 2).
 * 
 * Extracts historical completion durations from closed issues and computes
 * median estimates for new issues based on scope/type labels.
 * 
 * @module duration-estimation
 * @see docs/developer-workflow/provisional-scheduling.md
 */

/**
 * Estimate duration for an issue based on historical data.
 * 
 * Uses fallback hierarchy:
 * 1. Scope|Type median (≥5 samples)
 * 2. Scope-only median (≥3 samples)
 * 3. Global median (≥10 samples)
 * 4. DEFAULT_DURATION_DAYS fallback
 * 
 * @param {Array<ProjectItem>} projectItems - All project items for history
 * @param {string} scope - Scope label (e.g., 'scope:core')
 * @param {string} type - Type label (e.g., 'feature')
 * @param {Object} options - Optional configuration
 * @returns {EstimationResult} Duration estimate with confidence
 * 
 * @example
 * const result = estimateDuration(items, 'scope:core', 'feature')
 * console.log(`Estimated ${result.duration} days (${result.confidence} confidence)`)
 */
```

### 6. Inline Documentation

**Update workflow YAML files with comments:**

```yaml
# Stage 2: Post provisional schedule comment to issue
# This provides early visibility into expected timeline
# Only posted for high-confidence assignments
- name: Post Provisional Schedule Comment
  if: steps.assign.outputs.applied == 'true' && steps.assign.outputs.confidence == 'high'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    node scripts/post-provisional-schedule.mjs \
      --issue ${{ steps.issue.outputs.number }} \
      --order ${{ steps.assign.outputs.order }}
```

## Acceptance Criteria

- [ ] implementation-order-automation.md updated with Stage 2 section
- [ ] roadmap-scheduling.md updated with provisional integration
- [ ] copilot-instructions.md updated with Stage 2 behavior
- [ ] README.md mentions Stage 2 features
- [ ] variance-monitoring.md created with all sections
- [ ] provisional-scheduling.md created with all sections
- [ ] All new npm scripts documented
- [ ] JSDoc comments added to all new modules
- [ ] Workflow YAML files have inline comments
- [ ] Examples provided for all features
- [ ] Troubleshooting sections comprehensive
- [ ] Cross-document links verified
- [ ] Documentation follows existing style guide
- [ ] Spell check passed
- [ ] Technical review by maintainer

## Technical Specifications

### Documentation Structure

```
docs/
├── developer-workflow/
│   ├── implementation-order-automation.md  (UPDATED)
│   ├── roadmap-scheduling.md               (UPDATED)
│   ├── provisional-scheduling.md           (NEW)
│   └── variance-monitoring.md              (NEW)
├── architecture/
│   └── roadmap-consolidated.md             (MINOR UPDATE)
.github/
└── copilot-instructions.md                 (UPDATED)
README.md                                   (UPDATED)
```

### Cross-Reference Map

```
implementation-order-automation.md
  ├─> provisional-scheduling.md (how provisional works)
  ├─> variance-monitoring.md (alerts and thresholds)
  └─> roadmap-scheduling.md (daily scheduler)

provisional-scheduling.md
  ├─> variance-monitoring.md (variance calculation)
  ├─> roadmap-scheduling.md (actual vs provisional)
  └─> implementation-order-automation.md (ordering context)

variance-monitoring.md
  ├─> provisional-scheduling.md (provisional data source)
  └─> roadmap-scheduling.md (scheduler integration)

roadmap-scheduling.md
  ├─> provisional-scheduling.md (provisional integration)
  └─> variance-monitoring.md (variance updates)
```

### Example Snippets to Include

**In provisional-scheduling.md:**

```markdown
#### Example: High Confidence Provisional Schedule

Issue #123 (`scope:core`, `feature`, milestone `M0`) is assigned order 42.

1. **Duration Estimation:**
   - Found 7 closed issues with `scope:core|feature`
   - Median duration: 4 days
   - Confidence: High (≥5 samples)

2. **Cursor Projection:**
   - Previous issue (#122, order 41) ends on 2025-01-14
   - Next available start: 2025-01-15
   - Projected finish: 2025-01-18 (start + 4 - 1)

3. **Provisional Schedule:**
   - Start: 2025-01-15
   - Finish: 2025-01-18
   - Duration: 4 days

4. **Comment Posted:**
   ```markdown
   📅 Provisional Schedule (Automated)
   
   Estimated Start: 2025-01-15
   Estimated Finish: 2025-01-18
   Duration: 4 days
   
   Confidence: High (based on 7 similar issues)
   ```

5. **Storage:**
   ```json
   {
     "123": {
       "order": 42,
       "provisional": {
         "start": "2025-01-15",
         "finish": "2025-01-18",
         "duration": 4,
         "confidence": "high"
       }
     }
   }
   ```
```

## Testing Strategy

### Documentation Review

1. **Technical accuracy:**
   - Code examples run successfully
   - npm script commands work as documented
   - File paths and names correct

2. **Completeness:**
   - All new features documented
   - All edge cases covered
   - Troubleshooting sections address common issues

3. **Clarity:**
   - Non-technical reviewers can understand high-level concepts
   - Technical reviewers can implement from docs alone
   - Examples illuminate complex concepts

4. **Consistency:**
   - Terminology matches across all docs
   - Style matches existing documentation
   - Cross-references valid

### Peer Review Checklist

- [ ] All code examples tested
- [ ] npm scripts verified
- [ ] File paths confirmed
- [ ] Screenshots current (if any)
- [ ] Links valid
- [ ] Spell check passed
- [ ] Grammar review
- [ ] Technical accuracy verified

## Documentation Impact

This is the documentation sub-issue, so it IS the documentation impact. However:

### Meta-Documentation

**Add to README.md:**

```markdown
## Documentation

- **Automation:**
  - [Implementation Order Automation](docs/developer-workflow/implementation-order-automation.md)
  - [Provisional Scheduling](docs/developer-workflow/provisional-scheduling.md)
  - [Variance Monitoring](docs/developer-workflow/variance-monitoring.md)
  - [Roadmap Scheduling](docs/developer-workflow/roadmap-scheduling.md)
```

## Rollback Procedure

Documentation rollback:
1. Revert commits that added/modified documentation
2. Re-add after features are re-implemented
3. Archive old documentation as `*.archived.md` if needed

## Dependencies

All other Stage 2 sub-issues must be completed before documentation can be finalized. However, documentation can be drafted in parallel as features are implemented.

## Estimated Duration

3 days

## Notes

- Documentation should be written for both current users and future contributors
- Include "why" not just "how" where applicable
- Use diagrams if they clarify complex workflows (Mermaid supported in GitHub)
- Consider adding FAQ section to variance-monitoring.md
- May need updates after Stage 2 deployment based on user feedback
