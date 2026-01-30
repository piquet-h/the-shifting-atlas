# Workflows: Runtime Orchestration (Execution Flows)

This folder documents **runtime workflows**: the sequencing, orchestration, validation gates, retries, and handoffs that connect already-defined components.

This layer is intentionally **below Architecture** (contracts, boundaries) and **above Examples/Code** (specific SDKs, implementation details).

## What belongs here

- Control flow: "what runs, in what order"
- Orchestration patterns: proposal → validate → apply → narrate
- Validation gates and failure handling (halt/retry/defer)
- Correlation and observability expectations at the flow level (what must be linked, not exact event names)

## What does _not_ belong here

- Gameplay invariants and mechanics definitions → `../design-modules/` and `../concept/`
- Technical contracts and trust boundaries → `../architecture/`
- Portal screenshots, step-by-step setup, or SDK snippets → `../deployment/` and `../examples/`

## Index

- **Azure AI Foundry (optional runtime)**
    - `./foundry/README.md`

---

_Last updated: 2026-01-30_
