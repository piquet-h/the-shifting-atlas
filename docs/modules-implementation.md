# Module Implementation Plans

Execution‑focused companion to `modules.md`. This document is intentionally mutable and may change sprint‑to‑sprint. Conceptual invariants stay in `modules.md`.

Structure:

1. Milestone Mapping
2. Sequencing & Dependencies
3. Module Work Units (Atomic Issues)
4. Deferred / Parked Items
5. Change Log

---

## 1. Milestone Mapping (High Level)

| Milestone                | Primary Module Targets                                                                                            | Enablers                                       | Exit Criteria                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| M0 Foundation            | Navigation & Traversal (scaffold), Observability (baseline), Description Layering (schema draft)                  | Direction validation, telemetry constants      | Player can move between 3+ locations; movement telemetry emitted |
| M1 Traversal             | Description Layering (active), Player Identity (GUID + minimal profile), AI Prompt Engineering (template hashing) | Seed anchor locations; prompt version registry | Deterministic prompts for location description enrichment        |
| M2 Observability         | Extension Framework (spec draft), Inventory & Items (read model)                                                  | Hook permission model draft                    | Core telemetry dashboards stable and low cardinality             |
| M3 AI Read               | World Rules & Lore (codex ingestion), Geospatial & Hydrology (tiling POC)                                         | Lore provenance tagging                        | Lore queries reproducible and cost‑bounded                       |
| M4 Layering & Enrichment | Factions & Governance (reputation schema), Quest & Dialogue Trees (state machine scaffold)                        | Reputation bounds instrumentation              | Branching dialogue serialized and replayable                     |
| M5 Systems               | Economy & Trade (pricing loop), Multiplayer Mechanics (shared action lock)                                        | Conflict resolution deterministic              | Multi‑player interaction resolves without divergence             |

## 2. Sequencing & Dependency Notes

- Navigation is prerequisite for layering (needs stable location IDs).
- Prompt Engineering depends on Description Layering shapes for enrichment context.
- Extension Framework waits for stable telemetry taxonomy (avoid churn in external contract).
- Economy & Trade deferred until faction reputation signals exist.

## 3. Module Work Units (Atomic Issues)

Each atomic issue: one increment, ≤10 acceptance criteria, single scope label.

### 3.1 Navigation & Traversal

- Atomic: "Implement exit validation service" (Phase: scaffold → in‑progress)
- Atomic: "Add movement telemetry event correlation IDs"
- Atomic: "Refuse traversal without location edge (negative test suite)"

### 3.2 Description Layering

- Atomic: "Schema: base + additive layer document contract"
- Atomic: "Layer provenance validator"
- Atomic: "Render pipeline merges base + layers deterministically"

### 3.3 AI Prompt Engineering

- Atomic: "Template hashing function + version metadata"
- Atomic: "Prompt compilation rejects inline literals"
- Atomic: "Replay harness (Given template hash → expect identical output)"

### 3.4 Player Identity & Roles

- Atomic: "Player document minimal shape (GUID, createdAt)"
- Atomic: "Role grant audit log" (depends on identity persistence)

### 3.5 Observability

- Atomic: "Central telemetry constants export" (complete)
- Atomic: "Movement dashboard initial KQL queries"

### 3.6 Extension Framework

- Atomic: "Define hook interface contract (read‑only)"
- Atomic: "Sandbox execution POC with veto logging"

### 3.7 Inventory & Items

- Atomic: "Inventory container partition strategy validation"
- Atomic: "Item durability bounds enforcement (optional feature flag)"

### 3.8 World Rules & Lore

- Atomic: "Lore codex document structure" (depends on identity for author attribution)
- Atomic: "Lore change gate policy (review workflow)"

### 3.9 Geospatial & Hydrology

- Atomic: "Tiling POC (small region)"
- Atomic: "Hydrology graph isolation enforcement"

### 3.10 Factions & Governance

- Atomic: "Reputation scalar bounds + decay rule"
- Atomic: "Faction effect reversal procedure"

### 3.11 Quest & Dialogue Trees

- Atomic: "Dialogue state machine serialization"
- Atomic: "Branch audit log format"

### 3.12 Economy & Trade (Deferred)

- Atomic: "Pricing deterministic function (inputs enumerated)"
- Atomic: "Currency overflow guard"

### 3.13 Multiplayer Mechanics (Deferred)

- Atomic: "Action lock semantics (optimistic vs authoritative)"
- Atomic: "Conflict resolution deterministic ordering"

## 4. Deferred / Parked Items

| Module                | Item                        | Reason for Deferral                              | Revisit Milestone |
| --------------------- | --------------------------- | ------------------------------------------------ | ----------------- |
| Economy & Trade       | Dynamic pricing adjustments | Requires faction reputation & base resource flow | M5                |
| Multiplayer Mechanics | Real‑time synchronization   | Need authoritative traversal stability first     | M5                |
| Extension Framework   | Write hooks                 | Security & sandbox maturity not proven           | Post M3           |

## 5. Change Log

| Date       | Change                                                                |
| ---------- | --------------------------------------------------------------------- |
| 2025-10-31 | Initial extraction from `modules.md` separating implementation plans. |

## 6. Maintenance Rules

- Update milestone mapping ONLY after validating upstream concept invariants remain unchanged.
- When adding a new atomic issue cluster: ensure unique module context; do not mix telemetry enumeration with runtime feature logic.
- Archive completed atomic issues in a future `modules-implementation-archive.md` (not yet created) to keep this file concise.

---

This file is intentionally execution‑biased. Conceptual drift should be corrected in `modules.md` not here.
