# M2 Observability – Issue Dependencies & Relationships

> **Purpose:** Document formal blocking/blocked-by relationships for all M2 issues  
> **Created:** 2025-10-30  
> **Status:** Requires manual GitHub issue updates

---

## Summary

This document maps all dependency relationships identified during M2 implementation planning. Each issue should be updated to formally document these relationships in the issue body.

**Total M2 Issues:** 26 open  
**Issues with dependencies:** 21  
**Issues blocking others:** 10  
**Issues ready to start:** 5

---

## Dependency Matrix

### Critical Path (Blocking Multiple Issues)

| Issue | Title                          | Blocks | Blocked By |
| ----- | ------------------------------ | ------ | ---------- |
| #10   | Telemetry Event Registry       | 5      | 0          |
| #79   | Gremlin RU/Latency Telemetry   | 1      | 1          |
| #153  | Integrity Hash Computation     | 3      | 2          |
| #229  | API Versioning Strategy        | 2      | 1          |
| #230  | Backend Route Pattern Migration| 2      | 2          |

---

## Issue-by-Issue Dependency Documentation

### Foundation Issues (High Priority)

#### #10 - Telemetry Event Registry Expansion
**Current status:** No dependencies documented  
**Recommended update:**

```markdown
## Blocks
- #79 (Gremlin RU/Latency needs telemetry events)
- #41 (OpenTelemetry needs event registry)
- #50 (AI Cost telemetry needs event infrastructure)
- #152 (Description events need registry)
- #257 (Dead-letter events need registry)
```

#### #79 - Capture Gremlin RU + latency telemetry
**Current status:** Mentions ADR-002 but no issue dependencies  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #10 (Telemetry Event Registry Expansion)
**Blocks:** #71 (Health check needs RU metrics)
```

#### #41 - Application Insights Correlation & OpenTelemetry
**Current status:** No dependencies documented  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #10 (Telemetry Event Registry Expansion)
```

#### #50 - AI Cost & Token Usage Telemetry + Budget Guardrails
**Current status:** No dependencies documented  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #10 (Telemetry Event Registry Expansion)
```

#### #71 - Gremlin Health Check Function
**Current status:** References ADR-002 but no issue dependencies  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #79 (Health check needs RU/latency metrics)
```

---

### Description Integrity Epic (#69)

#### #69 - Epic: Description Telemetry & Integrity Monitoring
**Current status:** Child issues listed  
**Recommended update:** ✓ Already documents child issues correctly

#### #152 - Description Telemetry Events Emission
**Current status:** References Epic Link #69  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #10 (Telemetry Event Registry), #69 (Epic parent)
**Blocks:** #153 (Hash computation needs events)
```

#### #153 - Integrity Hash Computation Job
**Current status:** References Epic Link #69  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #69 (Epic parent), #152 (Events foundation)
**Blocks:** #154 (Cache layer), #155 (Simulation harness), #156 (Alerting logic)
```

#### #154 - Integrity Cache Layer
**Current status:** References Epic Link #69  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #69 (Epic parent), #153 (Hash computation baseline)
```

#### #155 - Corruption Simulation Harness
**Current status:** References Epic Link #69  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #69 (Epic parent), #153 (Hash computation needed for validation)
```

#### #156 - Integrity Anomaly Alerting Logic
**Current status:** References Epic Link #69  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #69 (Epic parent), #153 (Hash computation for anomaly detection)
```

---

### RESTful API Epic (#228)

#### #228 - Epic: RESTful API URL Pattern Migration
**Current status:** Child issues listed  
**Recommended update:** ✓ Already documents child issues correctly

#### #229 - API Versioning Strategy & Route Prefix
**Current status:** No dependencies beyond epic reference  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #228 (Epic parent)
**Blocks:** #230 (Backend routes need versioning), #233 (Documentation needs strategy)
```

#### #230 - Backend Route Pattern Migration (Player & Location Resources)
**Current status:** References Epic Link #228  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #228 (Epic parent), #229 (Versioning strategy must be defined)
**Blocks:** #231 (Frontend client needs backend ready), #232 (Integration tests need implementation)
```

#### #231 - Frontend API Client Updates
**Current status:** References Epic Link #228  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #228 (Epic parent), #230 (Backend routes must be operational)
```

#### #232 - Integration Tests for RESTful Endpoints
**Current status:** References Epic Link #228  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #228 (Epic parent), #230 (Backend implementation to test)
```

#### #233 - API Documentation Updates
**Current status:** References Epic Link #228  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #228 (Epic parent), #229 (Versioning strategy to document)
```

---

### World Event Processing

#### #257 - World Event Dead-Letter Storage & Redaction
**Current status:** No dependencies documented  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #10 (Telemetry Event Registry for dead-letter events)
**Blocks:** #258 (Event handlers need dead-letter infrastructure)
```

#### #258 - World Event Type-Specific Payload Handlers
**Current status:** References #257 in Dependencies section  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #257 (Dead-letter storage for failure handling)
```

---

### Traversal Enhancements

#### #33 - Semantic Exit Names & Landmark Aliases (N2)
**Current status:** References related issues in Out of Scope  
**Recommended update:**

```markdown
## Blocks
- #256 (Relative directions depend on semantic exit infrastructure)
```

#### #256 - Relative Direction Support (N3)
**Current status:** References #33 in Dependencies section  
**Recommended update:**

```markdown
## Dependencies
**Blocked by:** #33 (Semantic exit infrastructure required)
```

---

### DevX & Quality (No Dependencies)

These issues are ready to start immediately:

- **#108** - DI Suitability Gating Workflow
- **#111** - Managed API Deployment Packaging Regression Test
- **#172** - Weekly Learn More Content Regeneration
- **#173** - Roadmap Embedding Component
- **#174** - Learn More SEO & Analytics Instrumentation

**Recommended update:** None needed (already independent)

---

## Validation Checklist

After updating all issues, verify:

- [ ] All 10 "blocker" issues (#10, #79, #33, #69, #152, #153, #228, #229, #230, #257) document what they block
- [ ] All 21 "blocked" issues document their blockers
- [ ] Epic issues (#69, #228) clearly list all child issues
- [ ] No circular dependencies exist
- [ ] Critical path issues (#10, #79, #71) are clearly marked

---

## Parent/Child Relationships (Epics)

### Epic #69 - Description Telemetry & Integrity Monitoring

**Parent:** #69  
**Children:** #152, #153, #154, #155, #156  
**Status:** ✓ Correctly documented in epic body

### Epic #228 - RESTful API URL Pattern Migration

**Parent:** #228  
**Children:** #229, #230, #231, #232, #233  
**Status:** ✓ Correctly documented in epic body

**Note:** Both epics use the `epic` label and correctly list child issues in their body. No additional parent/child relationship updates needed.

---

## Implementation Priority Based on Dependencies

### Tier 1 (Start Immediately - No Dependencies)
1. #10 - Telemetry Event Registry (blocks 5 others)
2. #108, #111, #172, #173, #174 - DevX issues (independent)
3. #33 - Semantic Exits (for traversal track)

### Tier 2 (After #10 Completes)
4. #79 - Gremlin RU/Latency
5. #41 - OpenTelemetry
6. #50 - AI Cost Telemetry
7. #257 - Dead-Letter Storage
8. #229 - API Versioning Strategy (Epic #228 track)

### Tier 3 (After Tier 2 Foundations)
9. #71 - Health Check (needs #79)
10. #152 - Description Events (needs #10)
11. #230 - Backend Routes (needs #229)
12. #258 - Event Handlers (needs #257)

### Tier 4 (After Tier 3 Implementation)
13. #153 - Integrity Hash (needs #152)
14. #231 - Frontend Client (needs #230)
15. #232 - Integration Tests (needs #230)
16. #233 - API Docs (needs #229)
17. #256 - Relative Directions (needs #33)

### Tier 5 (After Tier 4 Baselines)
18. #154 - Integrity Cache (needs #153)
19. #155 - Corruption Simulation (needs #153)
20. #156 - Alerting Logic (needs #153)

---

## Manual Update Instructions

For each issue listed above:

1. Navigate to the issue on GitHub
2. Click "Edit" on the issue body
3. Add the recommended "Dependencies" or "Blocks" section
4. Ensure section is placed after existing content (e.g., after "Out of Scope" or "References")
5. Save the update
6. Verify the dependency relationships appear correctly

**Automation Note:** GitHub does not support bulk issue body updates via standard API without administrative tokens. These updates require manual editing or a custom script with appropriate permissions.

---

_Document created: 2025-10-30 | For M2 Observability milestone planning_
