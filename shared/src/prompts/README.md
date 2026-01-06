# Prompt Templates (shared)

Location: `shared/src/prompts/`

## Purpose

- Store canonical, versioned prompt templates used by backend agents.
- Provide deterministic hashing (`computeTemplateHash`) to enable replay and validation.
- Enable CI validation and bundling for production deployment.

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

