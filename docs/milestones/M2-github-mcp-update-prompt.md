# GitHub MCP Server Prompt for M2 Issue Dependency Updates

> **Purpose:** Automated prompt for updating M2 issue dependencies using GitHub MCP Server  
> **Created:** 2025-10-30  
> **Target:** 21 issues requiring dependency documentation

---

## Usage Instructions

Copy the prompt below and use it with a GitHub MCP Server-enabled client (e.g., Claude Desktop with GitHub MCP integration).

**Prerequisites:**
- GitHub MCP Server configured with repository access
- Write permissions to piquet-h/the-shifting-atlas repository
- MCP client with issue update capabilities

---

## GitHub MCP Server Prompt

```
You are working with the piquet-h/the-shifting-atlas repository. I need you to update the body of 21 GitHub issues in the M2 Observability milestone to formally document their blocking/blocked-by relationships.

For each issue listed below, append the specified dependency section to the END of the existing issue body. Do not modify any existing content - only append the new section.

Use the GitHub API to update each issue body by:
1. Fetching the current issue body
2. Appending the dependency text (with a blank line separator)
3. Updating the issue with the modified body

---

## Issues to Update

### Issue #10 - Telemetry Event Registry Expansion

Append to body:

## Blocks
- #79 (Gremlin RU/Latency needs telemetry events)
- #41 (OpenTelemetry needs event registry)
- #50 (AI Cost telemetry needs event infrastructure)
- #152 (Description events need registry)
- #257 (Dead-letter events need registry)

---

### Issue #79 - Capture Gremlin RU + latency telemetry

Append to body:

## Dependencies
**Blocked by:** #10 (Telemetry Event Registry Expansion)
**Blocks:** #71 (Health check needs RU metrics)

---

### Issue #41 - Application Insights Correlation & OpenTelemetry

Append to body:

## Dependencies
**Blocked by:** #10 (Telemetry Event Registry Expansion)

---

### Issue #50 - AI Cost & Token Usage Telemetry + Budget Guardrails

Append to body:

## Dependencies
**Blocked by:** #10 (Telemetry Event Registry Expansion)

---

### Issue #71 - Gremlin Health Check Function

Append to body:

## Dependencies
**Blocked by:** #79 (Health check needs RU/latency metrics)

---

### Issue #33 - Semantic Exit Names & Landmark Aliases (N2)

Append to body:

## Blocks
- #256 (Relative directions depend on semantic exit infrastructure)

---

### Issue #152 - Description Telemetry Events Emission

Append to body:

## Dependencies
**Blocked by:** #10 (Telemetry Event Registry), #69 (Epic parent)
**Blocks:** #153 (Hash computation needs events)

---

### Issue #153 - Integrity Hash Computation Job

Append to body:

## Dependencies
**Blocked by:** #69 (Epic parent), #152 (Events foundation)
**Blocks:** #154 (Cache layer), #155 (Simulation harness), #156 (Alerting logic)

---

### Issue #154 - Integrity Cache Layer

Append to body:

## Dependencies
**Blocked by:** #69 (Epic parent), #153 (Hash computation baseline)

---

### Issue #155 - Corruption Simulation Harness

Append to body:

## Dependencies
**Blocked by:** #69 (Epic parent), #153 (Hash computation needed for validation)

---

### Issue #156 - Integrity Anomaly Alerting Logic

Append to body:

## Dependencies
**Blocked by:** #69 (Epic parent), #153 (Hash computation for anomaly detection)

---

### Issue #229 - API Versioning Strategy & Route Prefix

Append to body:

## Dependencies
**Blocked by:** #228 (Epic parent)
**Blocks:** #230 (Backend routes need versioning), #233 (Documentation needs strategy)

---

### Issue #230 - Backend Route Pattern Migration (Player & Location Resources)

Append to body:

## Dependencies
**Blocked by:** #228 (Epic parent), #229 (Versioning strategy must be defined)
**Blocks:** #231 (Frontend client needs backend ready), #232 (Integration tests need implementation)

---

### Issue #231 - Frontend API Client Updates

Append to body:

## Dependencies
**Blocked by:** #228 (Epic parent), #230 (Backend routes must be operational)

---

### Issue #232 - Integration Tests for RESTful Endpoints

Append to body:

## Dependencies
**Blocked by:** #228 (Epic parent), #230 (Backend implementation to test)

---

### Issue #233 - API Documentation Updates

Append to body:

## Dependencies
**Blocked by:** #228 (Epic parent), #229 (Versioning strategy to document)

---

### Issue #257 - World Event Dead-Letter Storage & Redaction

Append to body:

## Dependencies
**Blocked by:** #10 (Telemetry Event Registry for dead-letter events)
**Blocks:** #258 (Event handlers need dead-letter infrastructure)

---

### Issue #258 - World Event Type-Specific Payload Handlers

Append to body:

## Dependencies
**Blocked by:** #257 (Dead-letter storage for failure handling)

---

### Issue #256 - Relative Direction Support (N3)

Append to body:

## Dependencies
**Blocked by:** #33 (Semantic exit infrastructure required)

---

## Validation Steps

After updating all issues, verify:

1. All 21 issues have the new Dependencies or Blocks section appended
2. No existing content was modified or removed
3. Each dependency section includes proper formatting (markdown headers and bold text)
4. Issue references (#N) are preserved correctly
5. No duplicates were created (if section already exists, skip that issue)

---

## Summary Report

After completion, provide a summary showing:
- Number of issues successfully updated
- Any issues that failed to update (with error messages)
- Any issues that were skipped (if dependency section already existed)

---

## Error Handling

If an issue update fails:
- Log the error message
- Continue with remaining issues
- Report all failures at the end

If an issue already contains a "## Dependencies" or "## Blocks" section:
- Skip that issue
- Log it as "already documented"
- Continue with remaining issues
```

---

## Alternative: Script-Based Approach

If your MCP client doesn't support bulk updates, you can use this bash script with the GitHub CLI (`gh`):

```bash
#!/bin/bash
# Update M2 issue dependencies
# Requires: gh CLI tool installed and authenticated

REPO="piquet-h/the-shifting-atlas"

# Function to append to issue body
append_to_issue() {
  local issue_num=$1
  local append_text=$2
  
  # Get current body
  current_body=$(gh issue view "$issue_num" --repo "$REPO" --json body -q .body)
  
  # Check if Dependencies section already exists
  if echo "$current_body" | grep -q "## Dependencies\|## Blocks"; then
    echo "Issue #$issue_num: Dependencies already documented, skipping"
    return
  fi
  
  # Append new section
  new_body="$current_body

$append_text"
  
  # Update issue
  echo "$new_body" | gh issue edit "$issue_num" --repo "$REPO" --body-file -
  
  if [ $? -eq 0 ]; then
    echo "Issue #$issue_num: Updated successfully"
  else
    echo "Issue #$issue_num: Update FAILED"
  fi
}

# Issue #10
append_to_issue 10 "## Blocks
- #79 (Gremlin RU/Latency needs telemetry events)
- #41 (OpenTelemetry needs event registry)
- #50 (AI Cost telemetry needs event infrastructure)
- #152 (Description events need registry)
- #257 (Dead-letter events need registry)"

# Issue #79
append_to_issue 79 "## Dependencies
**Blocked by:** #10 (Telemetry Event Registry Expansion)
**Blocks:** #71 (Health check needs RU metrics)"

# Issue #41
append_to_issue 41 "## Dependencies
**Blocked by:** #10 (Telemetry Event Registry Expansion)"

# Issue #50
append_to_issue 50 "## Dependencies
**Blocked by:** #10 (Telemetry Event Registry Expansion)"

# Issue #71
append_to_issue 71 "## Dependencies
**Blocked by:** #79 (Health check needs RU/latency metrics)"

# Issue #33
append_to_issue 33 "## Blocks
- #256 (Relative directions depend on semantic exit infrastructure)"

# Issue #152
append_to_issue 152 "## Dependencies
**Blocked by:** #10 (Telemetry Event Registry), #69 (Epic parent)
**Blocks:** #153 (Hash computation needs events)"

# Issue #153
append_to_issue 153 "## Dependencies
**Blocked by:** #69 (Epic parent), #152 (Events foundation)
**Blocks:** #154 (Cache layer), #155 (Simulation harness), #156 (Alerting logic)"

# Issue #154
append_to_issue 154 "## Dependencies
**Blocked by:** #69 (Epic parent), #153 (Hash computation baseline)"

# Issue #155
append_to_issue 155 "## Dependencies
**Blocked by:** #69 (Epic parent), #153 (Hash computation needed for validation)"

# Issue #156
append_to_issue 156 "## Dependencies
**Blocked by:** #69 (Epic parent), #153 (Hash computation for anomaly detection)"

# Issue #229
append_to_issue 229 "## Dependencies
**Blocked by:** #228 (Epic parent)
**Blocks:** #230 (Backend routes need versioning), #233 (Documentation needs strategy)"

# Issue #230
append_to_issue 230 "## Dependencies
**Blocked by:** #228 (Epic parent), #229 (Versioning strategy must be defined)
**Blocks:** #231 (Frontend client needs backend ready), #232 (Integration tests need implementation)"

# Issue #231
append_to_issue 231 "## Dependencies
**Blocked by:** #228 (Epic parent), #230 (Backend routes must be operational)"

# Issue #232
append_to_issue 232 "## Dependencies
**Blocked by:** #228 (Epic parent), #230 (Backend implementation to test)"

# Issue #233
append_to_issue 233 "## Dependencies
**Blocked by:** #228 (Epic parent), #229 (Versioning strategy to document)"

# Issue #257
append_to_issue 257 "## Dependencies
**Blocked by:** #10 (Telemetry Event Registry for dead-letter events)
**Blocks:** #258 (Event handlers need dead-letter infrastructure)"

# Issue #258
append_to_issue 258 "## Dependencies
**Blocked by:** #257 (Dead-letter storage for failure handling)"

# Issue #256
append_to_issue 256 "## Dependencies
**Blocked by:** #33 (Semantic exit infrastructure required)"

echo "
=== Update Complete ==="
```

Save this as `update-m2-dependencies.sh`, make it executable (`chmod +x update-m2-dependencies.sh`), and run it.

---

## Quick Reference: Issue Dependency Summary

| Issue | Blocked By | Blocks |
|-------|------------|--------|
| #10 | - | #79, #41, #50, #152, #257 |
| #33 | - | #256 |
| #41 | #10 | - |
| #50 | #10 | - |
| #71 | #79 | - |
| #79 | #10 | #71 |
| #152 | #10, #69 | #153 |
| #153 | #69, #152 | #154, #155, #156 |
| #154 | #69, #153 | - |
| #155 | #69, #153 | - |
| #156 | #69, #153 | - |
| #229 | #228 | #230, #233 |
| #230 | #228, #229 | #231, #232 |
| #231 | #228, #230 | - |
| #232 | #228, #230 | - |
| #233 | #228, #229 | - |
| #256 | #33 | - |
| #257 | #10 | #258 |
| #258 | #257 | - |

---

_Document created: 2025-10-30 | For M2 Observability dependency updates_
