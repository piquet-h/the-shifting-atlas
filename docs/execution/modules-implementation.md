# Module Implementation Plans (Execution Facet)

Moved from root (`../modules-implementation.md`) to clarify separation. Concept catalog lives in `../modules.md` and `../concept/`.

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

- Navigation prerequisite for layering (stable location IDs).
- Prompt Engineering depends on Description Layering schema.
- Extension Framework waits for stable telemetry taxonomy.
- Economy deferred until faction reputation signals exist.

## 3. Module Work Units (Atomic Issues)

### Navigation & Traversal

- Exit validation service
- Movement telemetry correlation IDs
- Negative traversal tests (no edge)

### Description Layering

- Base + additive layer schema
- Provenance validator
- Deterministic merge pipeline

### AI Prompt Engineering

- Template hashing + version metadata
- Prompt compilation rejects inline literals
- Replay harness (hash → stable output)

### Player Identity & Roles

- Minimal player document shape
- Role grant audit log

### Observability

- Central telemetry constants export (complete)
- Movement dashboard KQL

### Extension Framework

- Hook interface contract (read‑only)
- Sandbox veto logging POC

### Inventory & Items

- Partition strategy validation
- Durability bounds enforcement (flagged)

### World Rules & Lore

- Codex document structure
- Lore change gate policy

### Geospatial & Hydrology

- Tiling POC
- Hydrology graph isolation enforcement

### Factions & Governance

- Reputation scalar bounds + decay rule
- Effect reversal procedure

### Quest & Dialogue Trees

- Dialogue state machine serialization
- Branch audit log format

### Economy & Trade (Deferred)

- Pricing deterministic function
- Currency overflow guard

### Multiplayer Mechanics (Deferred)

- Action lock semantics
- Conflict resolution ordering

## 4. Deferred / Parked Items

| Module                | Item                        | Reason                       | Revisit |
| --------------------- | --------------------------- | ---------------------------- | ------- |
| Economy & Trade       | Dynamic pricing adjustments | Needs faction reputation     | M5      |
| Multiplayer Mechanics | Real‑time synchronization   | Requires traversal stability | M5      |
| Extension Framework   | Write hooks                 | Sandbox maturity pending     | Post M3 |

## 5. Change Log

| Date       | Change                                              |
| ---------- | --------------------------------------------------- |
| 2025-10-31 | Relocated to execution facet; clarified separation. |
| 2025-10-31 | Initial extraction from `modules.md`.               |

## 6. Maintenance Rules

- Update milestone mapping only when concept invariants unchanged.
- New atomic cluster must link to concept doc (not restate invariants).
- Archive completed clusters (future `execution-archive/`).

---

_Relocated: 2025-10-31_
