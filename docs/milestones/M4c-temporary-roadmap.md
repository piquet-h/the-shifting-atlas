# M4c Agent Sandbox (Write-lite) — Temporary Roadmap / Checklist

> **Temporary**: This is a working checklist meant for day-to-day progress. When M4c closes, either delete this file or replace it with a proper closure summary.
>
> Last updated: 2026-01-05

## How to use

- Treat this as the **recommended execution order**.
- When you complete an item, tick the box here **and** close the corresponding GitHub issue.

> Related:
>
> - **M4a AI Infrastructure** checklist lives in `docs/milestones/M4a-temporary-roadmap.md` (prompt registry + MCP read-only context).
> - If you hit “can’t get context” or “no stable prompt versioning”, check M4a first.

---

## 0) External prerequisites (not in M4c, but block it)

These are upstream dependencies required for “sense → decide → act” without improvising contracts.

- [ ] M4a Prompt Template Registry track (Epic #388)
- [ ] M4a MCP read-only context track (Epic #387)

---

## 1) Governance pipeline (Proposal → Validate → Apply)

The core dependency chain is:

**proposal envelope + validators → queue event type → runtime loop → replay harness**

- [ ] #701 — Agent proposal envelope + validators (Proposal→Validate→Apply)
- [ ] #705 — Introduce AgentStep world event type (queue-only runtime hook)
- [ ] #703 — Minimal agent runtime (sense→decide→propose) using MCP
- [ ] #706 — Replay harness for agent runs (reproduce from proposals + logs)

---

## 2) Observability & evaluation (don’t ship agents blind)

Epic: **#707 — Agent Observability & Evaluation (Write-lite)**

Suggested order:

- [ ] #708 — Agent pipeline telemetry events + low-cardinality dimensions
- [ ] #711 — Cost + latency guardrails for agent workloads
- [ ] #709 — Workbook/dashboard for Agent Sandbox (latency, accept/reject, applied effects)
- [ ] #710 — Agent failure taxonomy + runbooks (DLQ/replay workflow)

---

## 3) First autonomous agent loop (bounded effects)

- [ ] #702 — First autonomous agent loop (safe allow-listed world effects)

---

## 4) Documentation (contracts + invariants)

- [ ] #704 — Agent sandbox contracts, invariants, and safety gates

---

## 5) Optional / downstream (keep out of the critical path)

These may belong in M4c for “agent flavor”, but should not block the first write-lite loop.

- [ ] #472 — Epic: D&D 5e Agent Framework Foundation

---

## Milestone exit checks (manual)

When you think M4c is “done”, sanity-check:

- [ ] At least one agent loop runs end-to-end (sense→decide→act→observe) through **queue-only** execution.
- [ ] All writes are gated by validators (allow-list + bounded params) and are idempotent under retries.
- [ ] Replay is possible from captured proposals/telemetry.
- [ ] Telemetry answers: what did the agent see, decide, propose, and apply (with cost/latency visible).
