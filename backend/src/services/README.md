# Services

## Purpose

This folder contains **domain orchestration services** that coordinate multiple repositories or implement cross-cutting business logic. Services sit between handlers and repositories in the architecture.

## What Belongs Here

### ✅ DO place here:

- **Domain orchestration** that coordinates multiple repositories
    - Example: `DescriptionComposer` assembles location descriptions from multiple sources (base description + layers)
- **Complex business rules** that don't fit in a single repository
    - Example: AI prompt assembly combining player state, location context, and world rules
- **Cross-cutting domain logic** used by multiple handlers
    - Example: NPC behavior calculation, economy pricing logic
- **Stateless domain services** with injected dependencies
    - All services should use dependency injection
    - Services should NOT maintain request-scoped state

### ❌ DO NOT place here:

- **Simple CRUD operations** → belongs in repositories (`repos/`)
- **HTTP request handling** → belongs in handlers (`handlers/`)
- **Data persistence** → belongs in repositories (`repos/`)
- **Framework bindings** → belongs in functions/middleware/http
- **Infrastructure concerns** → belongs in telemetry/secrets/config

## Architecture Layer

```
HTTP Request
    ↓
Handlers (handlers/)
    ↓
Services (services/)  ← You are here
    ↓
Repositories (repos/)
    ↓
Data Store (Cosmos DB)
```

## Dependency Rules

- ✅ Services MAY depend on: Repositories, other services, shared utilities
- ✅ Handlers MAY depend on: Services, repositories
- ❌ Repositories MUST NOT depend on: Services (would create circular dependency)
- ❌ Services MUST NOT depend on: Handlers (wrong direction)

## Example Service

```typescript
// services/descriptionComposer.ts
import { inject, injectable } from 'inversify'
import type { IDescriptionRepository } from '../repos/descriptionRepository.js'
import type { ILayerRepository } from '../repos/layerRepository.js'

@injectable()
export class DescriptionComposer {
    constructor(
        @inject('IDescriptionRepository') private descriptionRepo: IDescriptionRepository,
        @inject('ILayerRepository') private layerRepo: ILayerRepository
    ) {}

    async composeLocationDescription(locationId: string): Promise<string> {
        // Coordinate multiple repos to build composite description
        const base = await this.descriptionRepo.get(locationId)
        const layers = await this.layerRepo.getActiveLayers(locationId)
        return this.merge(base, layers)
    }
}
```

## Current Services

- **DescriptionComposer** (`descriptionComposer.ts`): Composes location descriptions from base + active layers

## Future Services (As System Grows)

When these domains reach sufficient complexity, extract to services:

- **AI Prompt Service**: Assemble prompts from player context, location state, and world rules
- **NPC Behavior Service**: Calculate NPC reactions, movement, and dialogue
- **Economy Service**: Handle pricing, trade validation, and resource scarcity
- **Quest Service**: Track quest state, validate progress, and generate rewards
- **Combat Service**: Resolve combat actions, calculate damage, and handle death

## When NOT to Create a Service

If the logic:

- Only touches one repository → keep it in the repository
- Only used by one handler → keep it in the handler (until reused)
- Is purely data transformation → consider a utility function

**Rule of Thumb**: Create a service when you see the same orchestration pattern used by 2+ handlers.

## Testing Services

Services should be tested in integration tests with real repository implementations (memory mode) or mocked repository interfaces (unit tests).

```typescript
// test/integration/descriptionComposer.test.ts
import { DescriptionComposer } from '../../src/services/descriptionComposer.js'

describe('DescriptionComposer Integration', () => {
    it('should merge base and layer descriptions', async () => {
        const fixture = new IntegrationTestFixture()
        await fixture.setup()

        const composer = await fixture.getService(DescriptionComposer)
        const result = await composer.composeLocationDescription(locationId)

        // Verify composed result
    })
})
```

## Related Documentation

- Handler architecture: `../handlers/README.md`
- Repository patterns: `../repos/README.md` (if exists)
- Test fixture guide: `../test/TEST_FIXTURE_GUIDE.md`
