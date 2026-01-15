# Instruction files index

This folder hosts **path-specific instructions** for Copilot.

Per GitHub / VS Code conventions, only files matching:

- `.github/instructions/**/*.instructions.md`

are automatically applied as path-scoped custom instructions.

## MECE structure (recommended)

1. **Repository-wide instructions (always-on)**

- `../copilot-instructions.md`

2. **Path-specific instructions (always-on for matching globs; used by coding agent + code review)**

- `backend/.instructions.md`
- `frontend/.instructions.md`
- `shared/.instructions.md`
- `infrastructure/.instructions.md`
- `docs.instructions.md`
- `world/.instructions.md` (scoped to `shared/src/prompts/**`)

3. **Agent instructions (nearest `AGENTS.md`; used by agents, not guaranteed for code review)**

- `backend/AGENTS.md`, `frontend/AGENTS.md`, `shared/AGENTS.md`, `infrastructure/AGENTS.md`, `docs/AGENTS.md`

4. **Agent Skills (on-demand; progressive disclosure)**

- `../skills/world-content-generation/`
- `../skills/exit-consistency-audit/`
- `../skills/prompts-quality-gate/`
- `../skills/test-triage/`
- `../skills/functions-local-dev/`
- `../skills/shared-release-workflow/`

For governance/notes, see `INVENTORY.md`.

---

Last reviewed: 2026-01-15
