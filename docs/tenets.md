# The Shifting Atlas: Core Tenets

Non-negotiable principles guiding all design and implementation decisions. These tenets are adapted from the **[Microsoft Azure Well-Architected Framework](https://learn.microsoft.com/en-us/azure/well-architected/)** and tailored to the unique constraints of a multiplayer, AI-orchestrated text adventure.

The Well-Architected Framework provides five pillars (Reliability, Security, Cost Optimization, Operational Excellence, Performance Efficiency) plus cross-cutting concerns. We extend these with two domain-specific tenets: **Accessibility** and **Narrative Consistency**.

---

## 1. Reliability

**Well-Architected Framework Pillar**: [Reliability](https://learn.microsoft.com/en-us/azure/well-architected/reliability/)

**Principle**: The world state is authoritative and recoverable. Functions are stateless; no session affinity required.

**Application**:
- Stateless Azure Functions enable horizontal scaling and graceful failover
- Event-driven architecture allows replay and recovery from any point
- Idempotent operations prevent duplicate side effects under retry conditions
- Dual persistence (Gremlin graph + SQL API) ensures structural integrity and mutable state consistency

**Tradeoff**: Additional existence checks per operation; slightly increased latency for idempotency validation.

---

## 2. Security

**Well-Architected Framework Pillar**: [Security](https://learn.microsoft.com/en-us/azure/well-architected/security/)

**Principle**: Managed identity only. No raw keys, connection strings, or secrets in code or configuration files.

**Application**:
- Azure Managed Identity for all service-to-service authentication (Cosmos, Key Vault, Service Bus)
- Secrets stored exclusively in Azure Key Vault
- Role-Based Access Control (RBAC) at resource scope
- Auditable events with correlation IDs enable security investigations

**Tradeoff**: Initial setup complexity; requires Azure AD (Entra) configuration and role assignments.

---

## 3. Cost Optimization

**Well-Architected Framework Pillar**: [Cost Optimization](https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/)

**Principle**: Free-tier first. Modular scaling. Measure before upgrading.

**Application**:
- Start with Cosmos DB free tier (1000 RU/s, 25 GB storage)
- Partition strategy evolves based on empirical RU telemetry (per ADR-002)
- Consumption-based Functions pricing (pay per execution)
- Telemetry tracks RU/latency for cost-informed decisions

**Tradeoff**: Manual monitoring and deliberate scaling steps; not auto-scaling by default.

---

## 4. Operational Excellence

**Well-Architected Framework Pillar**: [Operational Excellence](https://learn.microsoft.com/en-us/azure/well-architected/operational-excellence/)

**Principle**: Small PRs, design doc reference, automated validation. Ship incrementally.

**Application**:
- Each PR links to a design doc section or ADR
- Atomic issue taxonomy (single scope + type label per issue)
- Milestones (M0–M6) sequence incremental capabilities
- CI/CD workflows enforce linting, testing, and accessibility checks before merge

**Tradeoff**: Upfront planning overhead; slower feature velocity in early stages.

---

## 5. Performance Efficiency

**Well-Architected Framework Pillar**: [Performance Efficiency](https://learn.microsoft.com/en-us/azure/well-architected/performance-efficiency/)

**Principle**: Event-driven, not polling. Avoid tight loops; prefer asynchronous progression.

**Application**:
- World evolution via Service Bus queues (not cron ticks)
- Queue-triggered Functions process world events asynchronously
- GraphQL/Gremlin queries optimized for spatial traversal patterns
- Telemetry monitors operation latency and RU consumption

**Tradeoff**: More complex orchestration; eventual consistency between player actions and world state updates.

---

## 6. Accessibility

**Extended Tenet**: Not part of the original five Well-Architected pillars, but a critical requirement for this project.

**Principle**: WCAG 2.2 AA baseline. Accessibility is not a polish phase.

**Application**:
- All UI features include keyboard navigation and screen reader support
- Skip links, semantic landmarks, and focus management required for merge
- Automated axe-core scans gate PRs touching frontend code
- Live announcements for world events (ARIA live regions)

**Tradeoff**: Increased design and implementation time for interactive features.

**Reference**: `docs/ux/accessibility-guidelines.md`

---

## 7. Narrative Consistency

**Extended Tenet**: Domain-specific principle for AI-orchestrated storytelling.

**Principle**: AI acts as the Dungeon Master voice. Immutable base prose; additive layers only.

**Application**:
- AI-generated narration is ephemeral by default (non-canonical)
- Only validated, additive description layers persist to the world state
- Prompt templates are versioned and hashed for deterministic AI behavior
- Bounded creative hallucination: micro-lore enrichment without canon drift

**Tradeoff**: Slower path to autonomous AI generation; requires robust validation infrastructure.

**Related Tenets from Vision**:
- Prefer narrative humour & gameplay over accurate simulation
- Determinism over raw randomness
- Advisory AI before mutation
- Player clarity > simulation realism

---

## Foundational Decision Tenets (Detailed)

These tactical tenets guide day-to-day implementation choices:

| Tenet                                                       | Rationale                                                            | Tradeoff Accepted                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| Immutable base prose, additive layering only                | Prevents lore drift & retcon conflicts                               | Requires provenance & layering validator      |
| Centralized telemetry event names (no inline literals)      | Ensures schema consistency, low cardinality                          | Slight upfront governance overhead            |
| AI‑driven narration with bounded creative hallucination     | Enriches world with micro‑lore & dynamic tone while preserving canon | Requires stricter validators & review cadence |
| Idempotent world operations                                 | Safe retries under transient failures                                | Additional existence checks per operation     |
| Separation of concept, architecture, execution facets       | Reduces documentation drift & leakage                                | Initial reorganization cost                   |
| Feature flags for emergent mechanics                        | Controlled rollout & rollback                                        | More configuration surface                    |
| Extensibility sandboxed & versioned                         | Protects core stability & security                                   | Integration friction for third parties        |

---

## Anti-Grief Patterns

Multiplayer text worlds require deliberate design to reduce disruptive player behavior:

- **Low reward loops for disruption**: No progression via spam failure
- **Cooperative benefits favored**: Dungeon instance scaling, faction reputation earned through group actions
- **Auditable events**: Correlation IDs enable moderation, rollback, and investigation

---

## Extension Philosophy

Third-party or experimental mechanics integrate via explicit contracts:

- **Sandboxed hooks**: No direct graph writes; proposals emit events
- **Schema-validated proposals**: Validated against invariants (exit uniqueness, layering immutability)
- **Explicit version contracts**: Extension APIs are versioned and backward-compatible

---

## Success Metrics (Foundational)

Metrics that validate adherence to these tenets:

- **Reliability**: Traversal success rate ≥95%; move commands complete consistently
- **Security**: Zero raw keys in code or logs; all secrets in Key Vault
- **Cost**: RU/latency telemetry informs partition scaling decisions (ADR-002)
- **Performance**: Advisory AI pass-through latency within budget; deterministic hash match rate ≥99%
- **Accessibility**: Automated axe scans pass on all PRs; no critical violations introduced
- **Narrative**: Layering integrity maintained; 0 retcon violations per audit window; ≥95% AI narration passes canonical drift audit

---

## Related Documentation

| Topic                          | Document                                      |
| ------------------------------ | --------------------------------------------- |
| Vision Statement               | Root `README.md` (Vision section)             |
| Architecture Implementation    | `architecture/mvp-azure-architecture.md`      |
| Partition Strategy (Cost)      | `adr/ADR-002-graph-partition-strategy.md`     |
| Accessibility Requirements     | `ux/accessibility-guidelines.md`              |
| Telemetry Standards            | `observability.md`                            |
| AI Integration Strategy        | `modules/ai-prompt-engineering.md`            |
| Narrative Layering (Immutable) | `modules/description-layering-and-variation.md` |

---

## Change Governance

Tenet modifications require:
1. Brief rationale explaining the change
2. Updated tradeoff description
3. Cross-reference to affected ADRs or design modules
4. Major shifts may trigger a new ADR

---

_Last updated: 2025-11-07 (initial creation from vision-and-tenets.md; adapted Microsoft Well-Architected Framework)_
