# @piquet-h/shared

> Shared domain models, persistence helpers, telemetry utilities, and supporting infrastructure code for The Shifting Atlas.
>
> NOTE: This package was previously named `@atlas/shared`. The scope was renamed because the `@atlas` organization scope is not yet available. A future migration to `@atlas/shared` (organization scope) may occur; any such change will follow semantic versioning with clear deprecation notices.

## Workspace Usage

`@piquet-h/shared` is an **internal npm workspace** package resolved automatically from the root `package-lock.json` (`"@piquet-h/shared": "*"` in `backend/package.json` and `frontend/package.json`). No GitHub Packages authentication or external `npm publish` step is used.

From the repository root:

```bash
npm ci
npm run build:shared   # generates barrels, compiles dist/, and bundles prompts
```

At Azure Functions deploy time, `npm run package:backend` (`scripts/package-backend-function.mjs`) copies built `shared/dist` into `backend/.deploy/node_modules/@piquet-h/shared` as a standalone non-symlinked module.

## Exports & Public Surface

Stable entry points:

```ts
import {} from /* domain types */ '@piquet-h/shared'
import { worldEventSchema } from '@piquet-h/shared/events'
// New granular (preferred) subpath barrels for better tree-shaking / clarity:
import { ensurePlayerForRequest } from '@piquet-h/shared/auth'
import { normalizeDirection } from '@piquet-h/shared/direction'
import { graphPartitionForLocation } from '@piquet-h/shared/persistence'
import { playerRepository } from '@piquet-h/shared/repos'
import { seedWorld } from '@piquet-h/shared/seeding'
```

Currently the package allows deep imports under `dist/`, but those paths are not part of the supported API surface and may change without a major version bump. Prefer top-level or documented subpath exports.

### Subpath Barrels

The following subpath barrels are now published via the `exports` map:

| Subpath                        | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `@piquet-h/shared/auth`        | Player auth helpers (SWA principal parsing, player provisioning) |
| `@piquet-h/shared/direction`   | Direction normalization & heading store                          |
| `@piquet-h/shared/gremlin`     | Gremlin client bootstrap utilities                               |
| `@piquet-h/shared/persistence` | Partitioning & persistence helpers                               |
| `@piquet-h/shared/prompts`     | Prompt template utilities (AI content generation)                |
| `@piquet-h/shared/repos`       | Public repository abstractions (player/location)                 |
| `@piquet-h/shared/secrets`     | Key Vault / secret resolution helpers                            |
| `@piquet-h/shared/seeding`     | World seeding utilities                                          |

Import only what you need to minimize bundle size (particularly in browser / edge contexts). The root export remains for convenience but may include additional modules over time.

## Features

- Domain models (player, location, world events)
- Direction normalization & heading store
- World event schema validation (Zod)
- Persistence configuration helpers (Cosmos DB + Gremlin)
- Secrets helper (Key Vault + Managed Identity)
- Telemetry event emission (Application Insights abstraction)

## Package Contract & Boundary Rules

This package is the **domain/core layer** for The Shifting Atlas. To maintain proper separation and enable reuse across multiple consumers (backend Functions, frontend, CLI tooling, MCP agents), the following contract MUST be enforced:

### ✅ ALLOWED in `shared/src/`

- Pure domain types & interfaces (players, locations, exits, items, events)
- Constants & enumerations (service names, telemetry event names, directions)
- Validation schemas (Zod schemas for world events, direction normalization)
- Pure utility functions (direction resolution, edit distance, type guards)
- Repository interface abstractions (IPlayerRepository) — **interfaces only, no implementations**
- Auth helpers that operate on generic headers (no direct Azure SDK usage)
- Minimal stateless in-memory stores for transient state (heading store singleton)

### ❌ FORBIDDEN in `shared/src/`

- Direct Azure SDK imports (`@azure/cosmos`, `@azure/keyvault-secrets`, `@azure/identity`, `@azure/functions`)
- Persistence implementations (Cosmos clients, Gremlin traversals, repository concrete classes)
- Secret access implementations (KeyVault clients, credential chains)
- Azure Functions bindings or triggers
- Application Insights direct telemetry emission (tracking calls)
- Environment variable access (`process.env.*`)
- Backend-specific infra concerns (Bicep, deployment, CI scripts)

### Rationale

This separation enables:

1. **Frontend consumption**: Browser bundles can import domain types without pulling in Node.js/Azure dependencies
2. **Test isolation**: Core logic tests run without mocking Azure services
3. **Telemetry governance**: Centralized event naming prevents ad-hoc string proliferation
4. **Future flexibility**: Alternative runtimes (workers, CLI, MCP agents) can reuse domain layer
5. **Enforcement**: ESLint rules (`no-direct-secret-access`, `telemetry-event-membership`) back these boundaries

### Verification

A boundary test in `test/packageBoundary.test.ts` scans for disallowed imports. Run via:

```bash
npm test
```

Any violations will fail CI.

## Telemetry Event Naming & Lint Enforcement

Telemetry event names are governed centrally (see `shared/src/telemetryEvents.ts`) and enforced by ESLint rules:

- `eslint-rules/telemetry-event.mjs` – regex + segment grammar
- `eslint-rules/telemetry-registry-pattern.mjs` – membership in canonical enumeration

Shared package only exposes enumerations and validation helpers; it does NOT emit Application Insights events directly (no `trackEvent` calls). Backend instrumentation should use the strict helpers and avoid introducing literal names outside the enumeration. Propose additions via PR updating both the enumeration and observability docs.

## Scripts

From the repository root (or inside `shared/`):

```bash
npm run build:shared
npm run test:shared
npm run lint:shared
npm run typecheck:shared
```

Inside `shared/`, `npm run smoke:traversal` validates the core traversal loop (`bootstrap → look → move → look`).

## License

MIT © The Shifting Atlas project contributors.
