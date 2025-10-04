# GitHub Issue Creation Guide for Stage 2 Sub-Issues

This document provides the exact commands to create all 7 sub-issues using the GitHub CLI.

## Prerequisites

```bash
# Ensure GitHub CLI is installed and authenticated
gh auth status

# Set repository context
export REPO="piquet-h/the-shifting-atlas"
```

## Sub-Issue Creation Commands

### Sub-Issue 1: Duration Estimation Module

```bash
gh issue create \
  --repo "$REPO" \
  --title "Extract Duration Estimation as Shared Module" \
  --label "scope:devx,refactor,M0" \
  --milestone "M0" \
  --body-file /tmp/stage2-subissues/01-duration-estimation-module.md
```

### Sub-Issue 2: Provisional Comment Format

```bash
gh issue create \
  --repo "$REPO" \
  --title "Define Provisional Schedule Comment Format" \
  --label "docs,enhancement,M0" \
  --milestone "M0" \
  --body-file /tmp/stage2-subissues/02-provisional-comment-format.md
```

### Sub-Issue 3: Provisional Storage Schema

```bash
gh issue create \
  --repo "$REPO" \
  --title "Specify Provisional Data Storage Schema" \
  --label "docs,enhancement,scope:devx,M0" \
  --milestone "M0" \
  --body-file /tmp/stage2-subissues/03-provisional-storage-schema.md
```

### Sub-Issue 4: Variance Calculation

```bash
gh issue create \
  --repo "$REPO" \
  --title "Implement Variance Calculation and Rolling Window" \
  --label "scope:devx,enhancement,M0" \
  --milestone "M0" \
  --body-file /tmp/stage2-subissues/04-variance-calculation.md
```

### Sub-Issue 5: Alert Logic

```bash
gh issue create \
  --repo "$REPO" \
  --title "Add Diagnostic Alert Issue Logic for High Variance" \
  --label "scope:devx,enhancement,scope:observability,M0" \
  --milestone "M0" \
  --body-file /tmp/stage2-subissues/05-diagnostic-alert-logic.md
```

### Sub-Issue 6: Telemetry Integration

```bash
gh issue create \
  --repo "$REPO" \
  --title "Extend Scheduler to Emit Telemetry" \
  --label "scope:observability,enhancement,M0" \
  --milestone "M0" \
  --body-file /tmp/stage2-subissues/06-telemetry-integration.md
```

### Sub-Issue 7: Documentation Updates

```bash
gh issue create \
  --repo "$REPO" \
  --title "Update Documentation for Stage 2" \
  --label "docs,M0" \
  --milestone "M0" \
  --body-file /tmp/stage2-subissues/07-documentation-updates.md
```

## Batch Creation Script

Save this as `create-stage2-issues.sh`:

```bash
#!/bin/bash
set -e

REPO="piquet-h/the-shifting-atlas"
ISSUE_DIR="/tmp/stage2-subissues"

echo "Creating Stage 2 sub-issues for $REPO"
echo "========================================"

# Array of issues: "number|title|labels|milestone|filename"
issues=(
    "1|Extract Duration Estimation as Shared Module|scope:devx,refactor|M0|01-duration-estimation-module.md"
    "2|Define Provisional Schedule Comment Format|docs,enhancement|M0|02-provisional-comment-format.md"
    "3|Specify Provisional Data Storage Schema|docs,enhancement,scope:devx|M0|03-provisional-storage-schema.md"
    "4|Implement Variance Calculation and Rolling Window|scope:devx,enhancement|M0|04-variance-calculation.md"
    "5|Add Diagnostic Alert Issue Logic for High Variance|scope:devx,enhancement,scope:observability|M0|05-diagnostic-alert-logic.md"
    "6|Extend Scheduler to Emit Telemetry|scope:observability,enhancement|M0|06-telemetry-integration.md"
    "7|Update Documentation for Stage 2|docs|M0|07-documentation-updates.md"
)

created_issues=()

for issue_spec in "${issues[@]}"; do
    IFS='|' read -r num title labels milestone filename <<< "$issue_spec"
    
    echo ""
    echo "Creating Sub-Issue $num: $title"
    echo "  Labels: $labels"
    echo "  Milestone: $milestone"
    echo "  Body: $ISSUE_DIR/$filename"
    
    issue_url=$(gh issue create \
        --repo "$REPO" \
        --title "$title" \
        --label "$labels" \
        --milestone "$milestone" \
        --body-file "$ISSUE_DIR/$filename" \
        2>&1)
    
    if [ $? -eq 0 ]; then
        echo "  ✓ Created: $issue_url"
        created_issues+=("$num|$title|$issue_url")
    else
        echo "  ✗ Failed to create issue"
        exit 1
    fi
done

echo ""
echo "========================================"
echo "Summary: Created ${#created_issues[@]} sub-issues"
echo ""

for created in "${created_issues[@]}"; do
    IFS='|' read -r num title url <<< "$created"
    echo "  $num. $title"
    echo "     $url"
done

echo ""
echo "Next steps:"
echo "  1. Review created issues"
echo "  2. Link to parent issue #83"
echo "  3. Assign implementation order"
echo "  4. Begin Phase 1 implementation"
```

Make executable and run:

```bash
chmod +x create-stage2-issues.sh
./create-stage2-issues.sh
```

## Manual Review Checklist

After creating issues:

- [ ] All 7 issues created successfully
- [ ] Labels applied correctly
- [ ] Milestone set to M0
- [ ] Body content renders properly (check markdown)
- [ ] Code blocks formatted correctly
- [ ] Tables render properly
- [ ] Links work (if any external references)

## Link to Parent Issue

After creation, update parent issue #83 with sub-issue references:

```bash
# Get issue numbers (replace XXX with actual numbers)
SUB1=XXX
SUB2=XXX
SUB3=XXX
SUB4=XXX
SUB5=XXX
SUB6=XXX
SUB7=XXX

# Add comment to parent issue
gh issue comment 83 --repo "$REPO" --body "## Sub-Issues Created

Stage 2 has been broken down into 7 sub-issues for implementation:

### Phase 1: Foundation
- [ ] #$SUB1 - Extract Duration Estimation as Shared Module
- [ ] #$SUB3 - Specify Provisional Data Storage Schema

### Phase 2: Features
- [ ] #$SUB2 - Define Provisional Schedule Comment Format
- [ ] #$SUB4 - Implement Variance Calculation and Rolling Window

### Phase 3: Observability
- [ ] #$SUB5 - Add Diagnostic Alert Issue Logic for High Variance
- [ ] #$SUB6 - Extend Scheduler to Emit Telemetry

### Phase 4: Documentation
- [ ] #$SUB7 - Update Documentation for Stage 2

See [summary document]() for implementation sequence and dependencies."
```

## Assign Implementation Order

Use the implementation order automation:

```bash
# Sub-issues should be ordered after parent #83
# Example: If #83 is order 50, sub-issues should be 51-57

for issue in $SUB1 $SUB2 $SUB3 $SUB4 $SUB5 $SUB6 $SUB7; do
    GITHUB_TOKEN=$GITHUB_TOKEN npm run assign:impl-order -- --issue $issue --strategy scope-block --apply
done
```

## Troubleshooting

**Issue: Labels not found**
```bash
# Ensure labels exist in repository
gh label list --repo "$REPO"

# Create missing labels if needed
gh label create "scope:observability" --repo "$REPO" --description "Observability and monitoring"
```

**Issue: Milestone not found**
```bash
# List milestones
gh api repos/$REPO/milestones --jq '.[] | "\(.number): \(.title)"'

# Create milestone if needed (or use number instead of title)
gh api repos/$REPO/milestones -f title="M0" -f description="Foundation"
```

**Issue: Body too large**
```bash
# GitHub issue body limit: ~65,536 characters
# All sub-issues are well under this limit
# If needed, split into main body + comments
```

## Notes

- Sub-issues are linked to parent #83 via "Parent Issue: #83" in body
- Implementation order will be assigned separately
- Estimated durations are provided but may be adjusted during implementation
- Dependencies are documented in each sub-issue body
- All sub-issues target Milestone M0 (Foundation)
