# M4a Milestone Reconciliation Review

**Date**: 2026-01-09  
**Status**: Comprehensive audit complete with recommendations  
**Scope**: GitHub issues, roadmap documentation, temporary working checklist

---

## Executive Summary

M4a "AI Infrastructure (Sense + Decide)" is **well-documented** with clear dependency chains and a temporary working checklist. However, there are several **areas for reconciliation**:

1. **Documentation Alignment**: Main roadmap vs temporary checklist show different levels of detail but are generally consistent
2. **Epic Organization**: Some epics listed in main roadmap not present in temporary checklist (intent parser, ambient context)
3. **Issue Completion**: Prompt Template Registry track is effectively complete (core items closed, including #629); MCP infrastructure track shows ~0% (0/10+ items)
4. **De-scoping**: Several items explicitly moved out of M4a (intent parser, D&D framework, epics #52, #67, #68); need to verify these are properly re-assigned
5. **Missing Milestone Verification**: Need to confirm all 25+ issue numbers in main roadmap are actually created and assigned to M4a

---

## Detailed Findings

### 1. Documentation Structure

#### Main Roadmap (docs/roadmap.md, lines 330-410)

- **Focus**: Strategic overview with 5 clusters (E1-E5)
- **Content**: Issue numbers, dependency chains, exit criteria
- **Status Marker**: "See GitHub milestone"
- **Last Updated**: 2026-01-05

#### Temporary Working Checklist (docs/milestones/M4a-temporary-roadmap.md)

- **Focus**: Tactical execution order with completion checkboxes
- **Content**: Sections 1-5 with detailed notes, de-scoped items listed separately
- **Status Marker**: Per-item checkboxes with progress tracking
- **Last Updated**: 2026-01-08 (more recent)

**Assessment**: The temporary checklist is the **authoritative execution plan** and should be the primary reference during M4a. Main roadmap provides strategic context.

---

### 2. Prompt Template Registry Track (Section 1)

**Status**: 🟢 **MOST COMPLETE** (core items done; finalization tasks remain)

| Item | Issue | Title                                     | Status         | Notes                                  |
| ---- | ----- | ----------------------------------------- | -------------- | -------------------------------------- |
| 1.1a | #699  | Test: Verify Cosmos SQL PK correctness    | ✅ Done        | Infrastructure validation              |
| 1.1b | #624  | Prompt Template Schema & Versioning       | ✅ Done        | ENV var + PK requirements              |
| 1.1c | #627  | worldEvents scopeKey contract enforcement | ✅ Done        | PK correctness + tests                 |
| 1.2  | #625  | Prompt Template Storage (File-based)      | ✅ Done        | Source of truth in shared/src/prompts/ |
| 1.3  | #626  | Prompt Template Retrieval API             | ✅ Done        | Backend HTTP function                  |
| 1.4a | #628  | A/B Testing Scaffold (Variant Selection)  | ✅ Done        | Experiments framework                  |
| 1.4b | #629  | Prompt Template Cost Telemetry            | ✅ Done        | Completed via PR #724                  |
| 1.5a | #630  | Prompt Template Migration Script          | ❌ Not started | Data migration tooling                 |
| 1.5b | #631  | Prompt Template Documentation             | ❌ Not started | User/developer docs                    |

**Recommendation**: Complete 1.5a/b (#630, #631) to close the registry track. These are lower risk than infrastructure work.

---

### 3. MCP Read-Only Infrastructure (Section 2)

**Status**: 🔴 **INCOMPLETE** (0 of 10+ items done)

| Subsection        | Items                        | Status         | Blockers                              | Notes                                |
| ----------------- | ---------------------------- | -------------- | ------------------------------------- | ------------------------------------ |
| 2.1 Foundation    | #38, #514, #515, #516        | ❌ Not started | Requires prompt registry finalization | Core server scaffold + context ops   |
| 2.2 Tool Surface  | #425, #426, #427, #430       | ❌ Not started | Depends on 2.1                        | Consumer-facing operations           |
| 2.3 Security/Auth | #428, #429, #431, #432, #580 | ❌ Not started | Depends on 2.1 + 2.2                  | Auth, rate limiting, telemetry, docs |
| 2.4 Observability | #577, #570                   | ❌ Not started | May be observability-team-owned       | Workbook & event constants           |

**Key Issue**: #425, #426, #427, #430 labeled "M3 AI Read" in their issue bodies but assigned to M4a milestone. **Clarify ownership**: Are these truly M4a or should they revert to M3?

**Recommendation**:

- Verify each issue (especially #425-430) is correctly assigned and has clear acceptance criteria
- Consider parallel workstreams: Foundation (#514-516) can proceed independently from Tool Surface (#425-430) once clear contracts are defined
- Clarify ownership of #577, #570 (are these observability team responsibilities?)

---

### 4. Validation & Safety Rails (Section 3)

**Status**: 🟡 **NOT STARTED** (0 of 2 items)

| Issue | Title                            | Status         | Notes                            |
| ----- | -------------------------------- | -------------- | -------------------------------- |
| #39   | AI Structured Response Validator | ❌ Not started | Schema validation for AI outputs |
| #47   | AI Moderation Pipeline Phase 1   | ❌ Not started | Regex + allowlist safeguards     |

**Recommendation**: These are **high-value, low-risk** and should be prioritized early (even before full MCP completion) to reduce risk of bad AI outputs being persisted.

---

### 5. Supporting Registries (Section 4)

**Status**: 🟡 **NOT STARTED** (0 of 2 items)

| Issue | Title                               | Status         | Notes                       |
| ----- | ----------------------------------- | -------------- | --------------------------- |
| #36   | Biome & Environmental Tag Registry  | ❌ Not started | Taxonomy stability          |
| #325  | Prompt Scaffold & Persona Injection | ❌ Not started | Prompt templating utilities |

**Recommendation**: Lower priority than core infrastructure but provide value for content generation consistency.

---

### 6. De-Scoped Items (Section 5)

These were removed from M4a and reassigned elsewhere:

| Issue | Epic/Feature                 | Originally Assigned | Now Assigned            | Status                                    |
| ----- | ---------------------------- | ------------------- | ----------------------- | ----------------------------------------- |
| #472  | D&D 5e Agent Framework       | M4a                 | M4c Agent Sandbox       | ✅ Appropriate (depends on MCP context)   |
| #322  | Playable MVP Experience Loop | M4a                 | Cross-cutting epic      | ⚠️ Verify this epic exists and is tracked |
| #68   | Layer Validator & Similarity | M4a                 | M5 Quality & Depth      | ⚠️ Verify reassignment                    |
| #67   | Ambient Context Registry     | M4a                 | M5 or later             | ⚠️ Verify reassignment                    |
| #52   | Learn More Page & Content    | M4a                 | scope:devx/docs         | ✅ Appropriate (not infrastructure)       |
| #53   | Rooms discovered dynamic     | M4a                 | frontend UX enhancement | ✅ Appropriate                            |
| #46   | Telemetry MCP Server         | M4a                 | DEPRECATED              | ✅ Appropriate (removed from MCP)         |
| #77   | Player SQL Projection        | M4a                 | Tracking issue          | ⚠️ Verify status and re-assignment        |

**Recommendation**: Verify each de-scoped item is actually reassigned in GitHub (not just mentioned in docs).

---

### 7. Main Roadmap vs Temporary Checklist Discrepancies

#### Clusters in Main Roadmap NOT in Temporary Checklist:

**E3: Intent Parser** (lines 369-372 in main roadmap)

- #462 Intent Parser PI-0: Heuristic Baseline
- #463 Intent Parser PI-1: Local LLM
- #464 Intent Parser PI-2: Server-Side Escalation

**Status**: Not listed in temporary roadmap at all. This is a **significant gap**.

**Options**:

1. Add E3 to temporary roadmap with execution order
2. Confirm E3 is actually part of M4a scope vs M5 or post-MVP
3. Create a separate tracking doc for Intent Parser work

**E4: DevX & Learn More** (lines 374-378 in main roadmap)

- #452-455 Learn More page implementation & SEO

**Status**: Mentioned in de-scoped section (#52, #453) but #452, #454, #455 not mentioned. **Clarify if these are M4a or separate.**

**E5: Ambient Context** (lines 379-381 in main roadmap)

- #449, #450 Ambient context registry work

**Status**: Mentioned in de-scoped section (#67) but #449, #450 not explicitly addressed in temporary roadmap.

#### Epic Coordination Issues (E4 in main roadmap)

Main roadmap lists 2 epics:

- #471 Epic: Intent Parser Phased Implementation
- #472 Epic: D&D 5e Agent Framework Foundation

**Status**: #472 is explicitly de-scoped (moved to M4c). #471 not mentioned in temporary roadmap. **Clarify status of #471.**

---

### 8. Issue Verification Status

**Checked**: Main roadmap lists 25+ issue numbers spanning E1-E5 clusters  
**Verified**: Only prompt registry issues (#624-631, #699) confirmed as created and partially done  
**Unknown**: Status of remaining ~20 issues (#38, #39, #47, #425-432, #462-464, #514-516, #577, #580, etc.)

**Recommendation**: Batch verification of all issue numbers:

```bash
# Pseudo-code: Verify each issue exists and is milestone-assigned
for issue in 38 39 47 425-432 462-464 514-516 577 580 625-631 699
  github issue view $issue --repo piquet-h/the-shifting-atlas
done
```

---

### 9. Milestone Naming & Organization

**Observation**: The roadmap refers to "M4a: AI Infrastructure" but the temporary checklist uses "M4a: AI Infrastructure — Temporary Roadmap / Checklist"

**Note**: In Section 8.1 of copilot-instructions.md, M4 is listed as "M4 AI Read" with milestone ID 4. **Verify if M4a is a sub-milestone or if the milestone system uses M4a directly in GitHub.**

---

## Reconciliation Recommendations

### High Priority (Blocking M4a Completion)

1. **Clarify Intent Parser scope** (#462-464, #471)
    - [ ] Confirm if Intent Parser is part of M4a or moved to M5/post-MVP
    - [ ] Add to temporary roadmap or create separate tracking doc
    - [ ] Update main roadmap if scopes changed

2. **Verify MCP issues are correctly assigned** (#38, #425-432, #514-516)
    - [ ] Check GitHub milestone assignments for each issue
    - [ ] Confirm issues marked "M3 AI Read" in body are actually M4a milestones
    - [ ] Resolve any conflicting issue descriptions

3. **De-scoping verification** (#52, #67, #68, #322, #452-455, #577)
    - [ ] Confirm each de-scoped issue is re-assigned to correct milestone in GitHub
    - [ ] Update main roadmap if assignments changed
    - [ ] Add reconciliation notes to temporary roadmap

4. **Complete Prompt Registry track** (#630, #631)
    - [ ] #630 Migration Script: Data migration tooling
    - [ ] #631 Documentation: User/developer guides

### Medium Priority (Improves Clarity)

5. **Add missing tracks to temporary roadmap**
    - [ ] Section E3: Intent Parser execution order
    - [ ] Section E4: Learn More page clarification
    - [ ] Section E5: Ambient Context clarification

6. **Update dependency chains**
    - [ ] Verify arrows between sections reflect actual GitHub issue dependencies
    - [ ] Add cross-links to related epics (#387, #388, #471)
    - [ ] Clarify parallel vs sequential work

7. **Exit criteria reconciliation**
    - [ ] Main roadmap exit criteria vs temporary checklist exit checks should align
    - [ ] Add measurable acceptance to each section

### Low Priority (Documentation Hygiene)

8. **Consolidate observability work** (#577, #570)
    - [ ] Determine ownership (M4a vs observability team)
    - [ ] Clarify if Application Insights workbook is M4a responsibility

9. **Archive strategy for temporary roadmap**
    - [ ] When M4a closes, convert temporary checklist to closure summary
    - [ ] Link closure summary from main roadmap

---

## Summary Table: Current Status vs Target

| Track                 | Main Roadmap         | Temp Checklist         | Current Done  | Target             | Risk      |
| --------------------- | -------------------- | ---------------------- | ------------- | ------------------ | --------- |
| Prompt Registry       | ✅ issues listed     | ✅ Section 1 detailed  | Core complete | Finalize #630/#631 | 🟢 LOW    |
| MCP Infrastructure    | ✅ 10 issues listed  | ✅ Section 2 detailed  | 0/10+ items   | All items          | 🟡 MEDIUM |
| Validation & Safety   | ✅ Mentioned         | ✅ Section 3 listed    | 0/2 items     | 2/2 items          | 🟢 LOW    |
| Supporting Registries | ✅ Mentioned         | ✅ Section 4 listed    | 0/2 items     | 2/2 items          | 🟡 MEDIUM |
| Intent Parser (E3)    | ✅ Listed (3 issues) | ❌ MISSING             | 0/3 items     | ?                  | 🔴 HIGH   |
| Learn More (E4)       | ✅ Listed (4 issues) | ❌ Unclear             | ?             | ?                  | 🟡 MEDIUM |
| Ambient Context (E5)  | ✅ Listed (2 issues) | ❌ De-scoped note only | 0/2 items     | ?                  | 🟡 MEDIUM |

---

## Next Steps

1. **Immediate** (this sprint): Complete quick verification of all issue numbers and GitHub milestone assignments
2. **Week 1**: Address high-priority reconciliation items (#1-4)
3. **Week 2**: Update documentation (#5-7)
4. **Ongoing**: Maintain temporary roadmap as primary execution tracker; sync to main roadmap monthly

---

## Related Documents

- [Main Roadmap](./roadmap.md) - Strategic overview (lines 330-410 for M4a)
- [Temporary Roadmap](./milestones/M4a-temporary-roadmap.md) - Tactical execution plan (last updated 2026-01-08)
- [Agentic AI & MCP Architecture](./architecture/agentic-ai-and-mcp.md) - Technical design
- [Copilot Instructions](../.github/copilot-instructions.md) - Section 8.1 Milestone reference table

---

**Prepared by**: AI Code Assistant  
**Review**: Recommended for piquet-h (repo owner) + team lead  
**Action Items**: See High Priority section above
