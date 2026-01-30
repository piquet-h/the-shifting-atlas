# Contributing to The Shifting Atlas

## Development Requirements

### TDD-First Development (Mandatory)

All contributions **must** follow Test-Driven Development:

```
1. Write failing test(s) first
2. Run tests → confirm RED (failure)
3. Write minimal implementation to pass
4. Run tests → confirm GREEN (passing)
5. Refactor if needed → tests stay GREEN
```

**No PR will be accepted with implementation code that was written before its tests.**

### When TDD Applies

- ✅ New features (handlers, services, utilities)
- ✅ Bug fixes (reproduce bug as failing test first)
- ✅ API contract changes
- ✅ Refactors affecting behavior

### Exceptions

- Documentation-only changes
- Configuration without runtime logic
- Exploratory spikes (but spike code never merges without tests)

## Code Standards

- **TypeScript**: Strict mode, no `any` without justification
- **Formatting**: Prettier (run `npm run format`)
- **Linting**: ESLint (run `npm run lint`)
- **Tests**: Node.js test runner for backend, Vitest for frontend

## Before Submitting a PR

```bash
# Backend
cd backend && npm run build && npm run lint && npm test

# Frontend
cd frontend && npm run build && npm run lint && npm test

# Shared
cd shared && npm run build && npm run lint && npm test
```

## Copilot Agents

If you're a Copilot agent (VS Code, GitHub cloud, or Copilot Workspace):

1. Read `.github/copilot-instructions.md` for full workflow
2. **TDD is mandatory** — write tests before implementation
3. Follow Section 10.1 for the complete TDD workflow
4. Use the test fixtures documented in `backend/test/TEST_FIXTURE_GUIDE.md`

## Documentation

Follow the MECE documentation hierarchy (authoritative portal: `docs/README.md`):

| Layer        | Location                     | Purpose               |
| ------------ | ---------------------------- | --------------------- |
| Vision       | README.md                    | Strategic direction   |
| Tenets       | docs/tenets.md               | Decision rules        |
| Concepts     | docs/concept/                | Immutable semantics   |
| Design       | docs/design-modules/         | Gameplay systems      |
| Architecture | docs/architecture/           | Technical design      |
| Workflows    | docs/workflows/              | Runtime orchestration |
| Roadmap      | docs/roadmap.md              | Milestone progression |
| Examples     | docs/examples/               | Code walkthroughs     |
| Code         | backend/, frontend/, shared/ | Implementation        |

## Questions?

Open an issue with the `question` label.
