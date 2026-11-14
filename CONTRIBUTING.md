# Contributing to The Shifting Atlas

## 1. TDD-First Workflow (Mandatory for Runtime Code)

All runtime features, bug fixes, API changes, and refactors MUST follow **Red → Green → Refactor** before implementation code is written. Full ceremony and test-layer decision matrix:

- [TDD-First Workflow Skill](.github/skills/tdd-first-workflow/SKILL.md)
- [Backend Test Fixture Guide](backend/test/TEST_FIXTURE_GUIDE.md)

Pure documentation, static configuration, and scripts under `scripts/**` are exempt from test-first ceremony (scripts must still be executed to verify behavior).

## 2. Pre-PR Verification Gates (Run from Repo Root)

```bash
npm ci
npm run build        # shared (with prompt bundle) -> backend -> frontend
npm run format:check # Prettier check (auto-fix with: npm run format)
npm run lint         # ESLint + runtime/atlas invariants
npm run typecheck    # TypeScript strict check across all workspaces
npm test             # shared + backend + frontend unit & integration suites
```

For runtime changes (`backend/`, `frontend/`, `infrastructure/`), reference issues with `Refs #NNN` or `Delivers #NNN` (not `Fixes #NNN`) so post-deploy verification controls closure.

## 3. Documentation & Copilot Guidance

- **MECE Documentation Portal** (single source of truth for altitude layers from Vision to Code): [`docs/README.md`](docs/README.md)
- **Core Tenets**: [`docs/tenets.md`](docs/tenets.md)
- **Issue & Milestone Taxonomy**: [`docs/developer-workflow/issue-taxonomy.md`](docs/developer-workflow/issue-taxonomy.md)
- **Copilot Operating Guide**: [`.github/copilot-instructions.md`](.github/copilot-instructions.md)

## Questions?

Open an issue using the taxonomy in [`docs/developer-workflow/issue-taxonomy.md`](docs/developer-workflow/issue-taxonomy.md).
