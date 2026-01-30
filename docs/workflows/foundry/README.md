# Workflows: Azure AI Foundry (Optional Runtime)

These documents describe how The Shifting Atlas can be orchestrated using **Azure AI Foundry** concepts (agents, tools, multi-agent coordination) while preserving the project’s authority boundaries.

Foundry is treated as an **optional hosted runtime**. Prototyping and production orchestration may also run in backend-controlled execution (Azure Functions) without depending on portal capabilities.

## Read this first (authority and contracts)

- Runtime-agnostic architecture and authority boundary: `../../architecture/agentic-ai-and-mcp.md`
- Narration validation pipeline mechanics: `../../architecture/narration-governance.md`
- D&D 5e integration contracts (role topology, tool-surface-driven): `../../design-modules/dnd5e-foundry-agent-architecture.md`

## Core workflows

- `resolve-player-command.md` — Canonical single-turn flow (command → queries → outcome → narration)
- `agent-orchestration.md` — Multi-agent coordination patterns (combat/spells scenarios; backend vs hosted runtime posture)

---

_Last updated: 2026-01-30_
