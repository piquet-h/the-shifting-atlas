# @piquet-h/shared

> Shared domain models, persistence helpers, telemetry utilities, and supporting infrastructure code for The Shifting Atlas.
>
> NOTE: This package was previously named `@atlas/shared`. The scope was renamed because the `@atlas` organization scope is not yet available. A future migration to `@atlas/shared` (organization scope) may occur; any such change will follow semantic versioning with clear deprecation notices.

## Installation

```bash
# GitHub Packages registry (ensure auth is configured)
npm install @piquet-h/shared
```

Add to your project (if not already present):

```bash
npm pkg set dependencies.@piquet-h/shared="^0.1.0"
```

## Auth Setup (GitHub Packages)

Ensure your `.npmrc` contains:

```ini
@piquet-h:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

(If/when migrated to an `@atlas` org scope, a parallel entry will be documented.)

## Exports & Public Surface

Stable entry points:

```ts
import {} from /* domain types */ '@piquet-h/shared'
import { worldEventSchema } from '@piquet-h/shared/events'
```

Currently the package allows deep imports under `dist/`, but those paths are not part of the supported API surface and may change without a major version bump. Prefer top-level or documented subpath exports.

## Features

- Domain models (player, location, world events)
- Direction normalization & heading store
- World event schema validation (Zod)
- Persistence configuration helpers (Cosmos DB + Gremlin)
- Secrets helper (Key Vault + Managed Identity)
- Telemetry event emission (Application Insights abstraction)

## Versioning

Semantic Versioning (SemVer) will be followed beginning with the first tagged release after stabilization. Pre-1.0 minor versions may contain limited breaking changes; these will be noted in CHANGELOG (to be added when external consumption begins).

## Migration from `@atlas/shared`

If you previously imported:

```ts
import { something } from '@atlas/shared'
```

Update to:

```ts
import { something } from '@piquet-h/shared'
```

No other changes required. The code artifacts are identical for version `0.1.0`.

## Future Scope Migration

If an `@atlas` GitHub organization is created:

1. `@piquet-h/shared` will continue to receive patch updates for a deprecation window.
2. A new `@atlas/shared` package will publish the same content.
3. A migration guide will be added to this README.

## Scripts

Available npm scripts:

```bash
# Build TypeScript to dist/
npm run build

# Run tests
npm run test

# Smoke test: traversal movement loop
npm run smoke:traversal
```

The smoke test validates core game flow (bootstrap → look → move → look) and can be run from the repository root via `npm run smoke:traversal`.

## Contributing

Internal contributors should:

```bash
cd shared

# Build
npm run build

# Test
npm test

# Smoke test
npm run smoke:traversal
```

## Publishing

```bash
cd shared
npm run build
npm publish
```

(Requires a token with `write:packages`).

## License

MIT © The Shifting Atlas project contributors.
