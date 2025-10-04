# Sub-Issue 2: Define Provisional Schedule Comment Format

**Parent Issue:** #83 - Automation Stage 2: Predictive Scheduling Integration  
**Labels:** `docs`, `enhancement`, `M0`  
**Milestone:** M0 Foundation

## Context

When the ordering assignment workflow runs, it should post a provisional schedule comment to the issue. This comment provides early visibility into expected Start/Finish dates and helps stakeholders plan. The comment must be idempotent (updatable) and clearly marked as provisional.

## Requirements

### 1. Comment Marker

**Canonical marker:** `<!-- PROVISIONAL_SCHEDULE:v1 -->`

**Purpose:**
- Identifies provisional schedule comments for idempotent updates
- Version tag allows future format evolution
- Hidden from rendered view but accessible via API

### 2. Comment Format

**Template:**

```markdown
<!-- PROVISIONAL_SCHEDULE:v1 -->
## 📅 Provisional Schedule (Automated)

**Estimated Start:** {START_DATE}  
**Estimated Finish:** {FINISH_DATE}  
**Duration:** {DURATION} days  
**Implementation Order:** #{ORDER}

### Estimation Basis

- **Confidence:** {CONFIDENCE} (High / Medium / Low)
- **Sample Size:** {N} similar issues
- **Basis:** {BASIS_DESCRIPTION}

<details>
<summary>How this estimate was calculated</summary>

This provisional schedule is automatically calculated when implementation order is assigned. It uses historical completion times from similar issues (same scope and type labels) to project start and finish dates.

- **High confidence:** ≥5 completed issues with same scope+type
- **Medium confidence:** ≥3 completed issues with same scope OR ≥10 global samples
- **Low confidence:** Insufficient data, using default estimate

The actual schedule will be updated daily by the roadmap scheduler and may differ based on upstream changes, status transitions, or manual adjustments.

Last calculated: {TIMESTAMP} UTC
</details>

---
*This is a provisional estimate only. Actual dates are managed in the [Project Roadmap](https://github.com/piquet-h/the-shifting-atlas/projects/3).*
```

### 3. Variable Substitutions

| Placeholder | Example | Source |
|-------------|---------|--------|
| `{START_DATE}` | `2025-01-15` | Projected based on order + cursor |
| `{FINISH_DATE}` | `2025-01-18` | Start + duration - 1 |
| `{DURATION}` | `4` | From duration estimation module |
| `{ORDER}` | `42` | Implementation order field value |
| `{CONFIDENCE}` | `High` | From estimateDuration() |
| `{N}` | `7` | sampleSize from estimation |
| `{BASIS_DESCRIPTION}` | `Median of 7 scope:core+feature issues` | Generated from estimation metadata |
| `{TIMESTAMP}` | `2025-01-10T14:23:15Z` | ISO 8601 timestamp |

### 4. Basis Description Examples

**High confidence (scope|type):**
```
Median of 7 scope:core+feature issues (4 days)
```

**Medium confidence (scope-only):**
```
Median of 5 scope:core issues (3.5 days, rounded to 4)
```

**Medium confidence (global):**
```
Global median of 15 completed issues (3 days)
```

**Low confidence (fallback):**
```
Default estimate (2 days) - insufficient historical data
```

### 5. Idempotent Update Strategy

**On each ordering assignment:**

1. Search for existing comment with marker `<!-- PROVISIONAL_SCHEDULE:v1 -->`
   ```javascript
   const existingComment = comments.find(c => 
       c.body.includes('<!-- PROVISIONAL_SCHEDULE:v1 -->')
   )
   ```

2. If found: **Update** existing comment
   - Preserves comment ID and history
   - GitHub shows edit indicator
   - Minimizes notification noise

3. If not found: **Create** new comment
   - First time provisional schedule is calculated
   - Issue just added to project

### 6. Comment Posting Logic

**Workflow Integration:**

Add step to `auto-assign-impl-order.yml` after order assignment:

```yaml
- name: Post Provisional Schedule Comment
  if: steps.assign.outputs.applied == 'true'
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    node scripts/post-provisional-schedule.mjs \
      --issue ${{ steps.issue.outputs.number }} \
      --order ${{ steps.assign.outputs.order }} \
      --start ${{ steps.assign.outputs.provisional_start }} \
      --finish ${{ steps.assign.outputs.provisional_finish }}
```

### 7. Posting Conditions

Post provisional comment **only when:**
- High confidence auto-apply succeeded
- Issue has implementation order assigned
- Issue is not closed
- Issue status is "Todo" or "Backlog" (not "In progress" or "Done")

**Skip comment when:**
- Low confidence (append strategy used)
- Issue already in progress (actual dates exist in Project)
- Dry-run mode
- Issue closed

## Acceptance Criteria

- [ ] Comment template documented with all placeholders defined
- [ ] Marker format specified and versioned (v1)
- [ ] Idempotent update logic designed and documented
- [ ] Basis description generation examples provided
- [ ] Posting conditions clearly defined
- [ ] Template rendering helper function created
- [ ] Update vs create decision logic specified
- [ ] Comment includes link to Project roadmap
- [ ] Collapsible details section for explanation
- [ ] Timestamp in UTC ISO 8601 format

## Technical Specifications

### Comment Body Generation

**Helper function:** `scripts/shared/provisional-comment.mjs`

```javascript
export function generateProvisionalComment(data) {
    const {
        startDate,      // ISO string 'YYYY-MM-DD'
        finishDate,     // ISO string 'YYYY-MM-DD'
        duration,       // number
        order,          // number
        confidence,     // 'high' | 'medium' | 'low'
        sampleSize,     // number
        basis,          // string
        scope,          // string
        type            // string
    } = data
    
    const timestamp = new Date().toISOString()
    const basisDescription = generateBasisDescription(
        confidence, sampleSize, basis, scope, type, duration
    )
    
    return renderTemplate({ 
        startDate, finishDate, duration, order,
        confidence: capitalize(confidence),
        sampleSize, basisDescription, timestamp
    })
}

function generateBasisDescription(confidence, n, basis, scope, type, duration) {
    switch (basis) {
        case 'scope-type':
            return `Median of ${n} ${scope}+${type} issues (${duration} days)`
        case 'scope':
            return `Median of ${n} ${scope} issues (${duration} days)`
        case 'global':
            return `Global median of ${n} completed issues (${duration} days)`
        case 'fallback':
            return `Default estimate (${duration} days) - insufficient historical data`
        default:
            return `Based on ${basis} (${duration} days)`
    }
}
```

### Comment API Operations

**Find existing comment:**
```bash
gh api repos/:owner/:repo/issues/:issue_number/comments \
  --jq '.[] | select(.body | contains("<!-- PROVISIONAL_SCHEDULE:v1 -->")) | .id'
```

**Update comment:**
```bash
gh api -X PATCH repos/:owner/:repo/issues/comments/:comment_id \
  -f body="$COMMENT_BODY"
```

**Create comment:**
```bash
gh api -X POST repos/:owner/:repo/issues/:issue_number/comments \
  -f body="$COMMENT_BODY"
```

### Format Versioning

**Version evolution path:**
- v1: Initial format (Stage 2)
- v2: May add variance tracking (Stage 2+)
- v3: May add confidence intervals (Stage 3+)

**Migration:** When format changes, detect old marker and update to new format.

## Testing Strategy

### Manual Test Cases

1. **First comment creation:**
   - Assign order to new issue
   - Verify comment posted with correct values
   - Check comment includes marker

2. **Comment update:**
   - Re-assign order to same issue
   - Verify existing comment updated (not duplicated)
   - Check timestamp updated

3. **Variable substitution:**
   - Verify all placeholders replaced
   - Check date format (YYYY-MM-DD)
   - Validate duration calculation

4. **Confidence levels:**
   - Test high confidence comment
   - Test medium confidence comment
   - Test low confidence comment (should NOT post)

5. **Edge cases:**
   - Issue with no labels (low confidence)
   - Issue already in progress (skip)
   - Closed issue (skip)

### Automated Tests

**Location:** `scripts/shared/provisional-comment.test.mjs`

Test `generateProvisionalComment()`:
- Correct template rendering
- Proper placeholder substitution
- Basis description accuracy
- Timestamp format validation
- Marker presence

## Documentation Impact

### Files to Update

1. **docs/developer-workflow/implementation-order-automation.md**
   - Add "Provisional Schedule Comments" section under Stage 2
   - Document marker format and update strategy
   - Include example comment

2. **docs/developer-workflow/roadmap-scheduling.md**
   - Note that provisional comments are posted at ordering time
   - Explain relationship to daily scheduler updates
   - Clarify provisional vs actual scheduling

3. **.github/copilot-instructions.md**
   - Add provisional comment format to automation section
   - Document comment posting conditions

## Rollback Procedure

If provisional comments cause issues:
1. Disable comment posting step in workflow (comment out YAML step)
2. Existing comments remain but won't update
3. Manually delete problematic comments if needed
4. Re-enable after fix with version bump (v2)

## Dependencies

- Sub-issue #1 (Duration Estimation Module) must be completed first
- Requires `issues: write` permission in workflow

## Estimated Duration

2 days

## Notes

- Comments are for human visibility; machine-readable data goes in sub-issue #3 (storage)
- Keep comment concise but informative
- Link to project board for actual schedule tracking
- Consider rate limiting: GitHub allows 5000 API requests/hour
