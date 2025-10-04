#!/bin/bash
# create-stage2-issues.sh
# Creates all Stage 2 sub-issues using GitHub CLI

set -e

REPO="piquet-h/the-shifting-atlas"
ISSUE_DIR="/tmp/stage2-subissues"

echo "========================================"
echo "Stage 2 Sub-Issue Creation"
echo "Repository: $REPO"
echo "========================================"
echo ""

# Check prerequisites
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed"
    echo "Install from: https://cli.github.com/"
    exit 1
fi

if ! gh auth status &> /dev/null; then
    echo "Error: Not authenticated with GitHub CLI"
    echo "Run: gh auth login"
    exit 1
fi

# Verify issue files exist
for i in {1..7}; do
    file="$ISSUE_DIR/0${i}-*.md"
    if ! ls $file &> /dev/null; then
        echo "Error: Issue file not found: $file"
        exit 1
    fi
done

echo "Prerequisites: OK"
echo ""

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
failed_count=0

for issue_spec in "${issues[@]}"; do
    IFS='|' read -r num title labels milestone filename <<< "$issue_spec"
    
    echo "Creating Sub-Issue $num: $title"
    echo "  Labels: $labels"
    echo "  Milestone: $milestone"
    echo "  Body: $filename"
    
    # Create issue and capture URL
    if issue_url=$(gh issue create \
        --repo "$REPO" \
        --title "$title" \
        --label "$labels" \
        --milestone "$milestone" \
        --body-file "$ISSUE_DIR/$filename" 2>&1); then
        
        echo "  ✓ Created: $issue_url"
        # Extract issue number from URL
        issue_number=$(echo "$issue_url" | grep -o '[0-9]*$')
        created_issues+=("$num|$title|$issue_url|$issue_number")
        echo ""
    else
        echo "  ✗ Failed: $issue_url"
        ((failed_count++))
        echo ""
    fi
    
    # Small delay to avoid rate limiting
    sleep 1
done

echo "========================================"
echo "Creation Summary"
echo "========================================"
echo "Total: ${#issues[@]} issues"
echo "Created: $((${#issues[@]} - failed_count)) issues"
echo "Failed: $failed_count issues"
echo ""

if [ ${#created_issues[@]} -gt 0 ]; then
    echo "Created Issues:"
    for created in "${created_issues[@]}"; do
        IFS='|' read -r num title url issue_number <<< "$created"
        echo "  $num. $title"
        echo "     #$issue_number - $url"
    done
    echo ""
fi

if [ $failed_count -eq 0 ]; then
    echo "✓ All issues created successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Review created issues"
    echo "  2. Link to parent issue #83"
    echo "  3. Assign implementation order"
    echo "  4. Begin Phase 1 implementation"
    echo ""
    echo "To update parent issue #83:"
    echo "  gh issue comment 83 --repo $REPO --body-file <(cat <<EOF"
    echo "## Sub-Issues Created"
    echo ""
    echo "Stage 2 has been broken down into sub-issues:"
    echo ""
    for created in "${created_issues[@]}"; do
        IFS='|' read -r num title url issue_number <<< "$created"
        echo "- [ ] #$issue_number - $title"
    done
    echo "EOF"
    echo ")"
else
    echo "✗ Some issues failed to create"
    echo "Check errors above and retry"
    exit 1
fi
