# Prompt Templates (shared)

Location: `shared/src/prompts/`

## Purpose

- Store canonical, versioned prompt templates used by backend agents.
- Provide deterministic hashing (`computeTemplateHash`) to enable replay and validation.
- Enable CI validation and bundling for production deployment.
- Support A/B testing and variant selection for prompt experimentation.

## File-Based Storage

Prompt templates are stored as individual JSON files in `shared/src/prompts/templates/`:

```
shared/src/prompts/templates/
├── location-generator.json
├── npc-dialogue-generator.json
└── ...
```

Each template file follows the schema defined in `schema.ts`:

```json
{
    "metadata": {
        "id": "location-generator",
        "version": "1.0.0",
        "name": "Location Generator",
        "description": "Generates descriptions for new locations",
        "tags": ["location", "world"]
    },
    "template": "Generate a [terrain_type] location...",
    "variables": [
        {
            "name": "terrain_type",
            "description": "Type of terrain",
            "required": true
        }
    ]
}
```

## A/B Testing and Variant Selection

The variant selector enables deterministic A/B testing of prompt templates with gradual rollouts and channel-based selection.

### Basic Usage

```typescript
import { VariantSelector } from '@piquet-h/shared/prompts'

const selector = new VariantSelector()

// Configure variants for a template
selector.setConfig('location-gen', {
    templateId: 'location-gen',
    variants: [
        {
            id: 'control',
            templateId: 'location-gen-v1',
            rolloutPercent: 90
        },
        {
            id: 'experiment',
            templateId: 'location-gen-v2',
            rolloutPercent: 10
        }
    ],
    defaultVariant: 'control'
})

// Select a variant for a user
const selection = selector.selectVariant('location-gen', userId, 'stable')
console.log(selection.templateId) // 'location-gen-v1' or 'location-gen-v2'
console.log(selection.bucket) // Deterministic bucket number [0, 100)
```

### Channel-Based Selection

Use channels to separate stable and canary (experimental) variants:

```typescript
selector.setConfig('location-gen', {
    templateId: 'location-gen',
    variants: [
        {
            id: 'stable',
            templateId: 'location-gen-v1',
            rolloutPercent: 100,
            channels: ['stable']
        },
        {
            id: 'canary',
            templateId: 'location-gen-v2',
            rolloutPercent: 100,
            channels: ['canary']
        }
    ],
    defaultVariant: 'stable'
})

// Stable channel users get v1
const stableSelection = selector.selectVariant('location-gen', userId, 'stable')

// Canary channel users get v2
const canarySelection = selector.selectVariant('location-gen', userId, 'canary')
```

### Deterministic Bucketing

User assignment is deterministic based on SHA-256 hash of `userId + templateId`:

```typescript
import { VariantBucketing } from '@piquet-h/shared/prompts'

const bucket = VariantBucketing.getBucket(userId, templateId)
// Returns integer [0, 100) - same user always gets same bucket
```

### Key Features

- **Deterministic**: Same user always gets same variant (based on hash of userId + templateId)
- **Gradual rollouts**: Control percentage of users receiving each variant
- **Channel support**: Separate variants for stable/canary environments
- **Anonymous users**: Supports 'anonymous' userId with deterministic fallback
- **No stale cache**: Config updates apply immediately

### Edge Cases

- **Anonymous users**: Use `'anonymous'` as userId - gets deterministic bucket
- **Rapid rollout changes**: New config applies immediately (no cached selection)
- **Missing config**: Returns fallback variant with template ID as-is



## Runtime Usage

Use the `PromptLoader` to load templates at runtime:

```typescript
import { PromptLoader } from '@piquet-h/shared/prompts'

const loader = new PromptLoader({
    source: 'bundle',  // or 'files' for development
    cacheTtlMs: 5 * 60 * 1000  // 5 minutes
})

// Load by ID
const template = await loader.getById('location-generator')

// Get latest version
const latest = await loader.getLatest('location-generator')

// Clear cache
loader.clearCache()
```

## CI/CD Workflow

1. **Development**: Edit templates in `shared/src/prompts/templates/`
2. **Validation**: CI runs `scripts/validate-prompts.mjs` to check schema and detect secrets
3. **Bundling**: CI runs `scripts/bundle-prompts.mjs` to create `prompts.bundle.json`
4. **Artifact**: Bundle is uploaded and deployed with the application

## Scripts

- `node scripts/validate-prompts.mjs` - Validate all templates (run in CI)
- `node scripts/bundle-prompts.mjs` - Create production bundle
- `node scripts/migrate-prompts.mjs --dry-run` - Preview migration from inline prompts

## Security

Templates are automatically scanned for protected tokens (API keys, secrets) during validation.
Any template containing patterns like `api_key`, `secret`, or OpenAI-style keys will fail CI.

## APIs (recommended)

- `getById(id)` → returns template by exact ID
- `getLatest(idPrefix)` → returns latest version matching prefix
- `getByHash(hash)` → content-addressed lookup
- `computeTemplateHash(template)` → returns SHA-256 hex digest for versioning

## Migration from Inline Prompts

Existing inline prompts in `worldTemplates.ts` can be migrated:

```bash
node scripts/migrate-prompts.mjs --dry-run  # Preview
node scripts/migrate-prompts.mjs            # Apply
```

## Notes

- Prompt templates are NOT exposed as MCP servers. If tooling requires HTTP access, implement a backend helper endpoint that calls into these shared helpers.
- When adding a template, update `shared/src/telemetryEvents.ts` if the template requires new AI telemetry event names.
- Template hashes are computed deterministically from canonical JSON (sorted keys, no whitespace variance).

