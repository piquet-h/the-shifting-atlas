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
    source: 'bundle', // or 'files' for development
    cacheTtlMs: 5 * 60 * 1000 // 5 minutes
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
- `node scripts/migrate-prompts-v2.mjs --dry-run` - Preview migration from inline prompts (manual / one-time)

## Security

Templates are automatically scanned for protected tokens (API keys, secrets) during validation.
Any template containing patterns like `api_key`, `secret`, or OpenAI-style keys will fail CI.

## APIs (recommended)

- `getById(id)` → returns template by exact ID
- `getLatest(idPrefix)` → returns latest version matching prefix
- `getByHash(hash)` → content-addressed lookup
- `computeTemplateHash(template)` → returns SHA-256 hex digest for versioning

## Local Development Steps

### 1. Creating or Editing Templates

Edit template JSON files in `shared/src/prompts/templates/`. See `schema.md` for complete authoring guide.

### 2. Validation

**Always validate templates before committing:**

```bash
node scripts/validate-prompts.mjs
```

**What it checks:**

- ✅ Valid JSON schema (required fields, types, patterns)
- ✅ No protected tokens (API keys, secrets, passwords)
- ✅ Proper file naming conventions
- ✅ Hash computation for integrity

**Exit codes:**

- `0` = All templates valid
- `1` = Validation errors found

**Example output:**

```
Validating prompt templates in: shared/src/prompts/templates

✅ location-generator.json: Valid (v1.0.0, hash: 02f80b43...)
✅ npc-dialogue-generator.json: Valid (v1.0.0, hash: 89768071...)
❌ my-template.json: FAILED
   Error: metadata.id: Invalid characters

Validation complete:
  ✅ Validated: 2
  ❌ Failed: 1
```

### 3. Bundling for Production

**Create production bundle:**

```bash
node scripts/bundle-prompts.mjs
```

This generates `shared/src/prompts/templates/prompts.bundle.json` containing all validated templates with computed hashes.

**Bundle artifact is used in:**

- CI/CD pipelines
- Production deployments
- Performance-optimized template loading

### 4. Testing Templates

**Unit tests:**

```bash
cd shared
npm test -- --grep "prompt"
```

**Integration with backend:**
See "Backend Integration" section and `schema.md` for usage examples.

## Validation Script Usage

### Basic Validation

```bash
node scripts/validate-prompts.mjs
```

Validates all templates in `shared/src/prompts/templates/`.

### CI Integration

The validation script is run automatically in CI:

- On all PRs touching `shared/src/prompts/templates/`
- Before building production bundles
- As part of shared package tests

**CI fails if:**

- Any template has schema errors
- Protected tokens are detected
- File naming doesn't match template ID

### Protected Token Detection

Templates are automatically scanned for:

- API keys: `/api[_-]?key/i`
- Secrets: `/secret/i`, `/password/i`, `/credential/i`
- Private keys: `/-----BEGIN.*PRIVATE KEY-----/`
- OpenAI keys: `/sk-[a-zA-Z0-9]{48}/`

**If detected, validation fails immediately.**

## Migration from Inline Prompts

### Quick Start

```bash
# Preview migration (no files written)
node scripts/migrate-prompts-v2.mjs --dry-run

# Apply migration (writes template files)
node scripts/migrate-prompts-v2.mjs

# Validate migrated templates
node scripts/validate-prompts.mjs
```

### Step-by-Step Migration Guide

See **schema.md** "Migration from Inline Prompts" section for complete workflow:

1. Preview migration with `--dry-run`
2. Review and customize generated templates
3. Apply migration
4. Validate templates
5. Update code references
6. Test updated code
7. Remove inline constants

### Adding Custom Prompts to Migration

The migration script (`scripts/migrate-prompts-v2.mjs`) discovers known inline templates (currently `shared/src/prompts/worldTemplates.ts`).
If you have additional inline sources, prefer migrating them manually into `shared/src/prompts/templates/` and then running:

- `node scripts/validate-prompts.mjs`
- `node scripts/bundle-prompts.mjs`

## Backend Integration Examples

### Dependency Injection Setup

```typescript
// backend/src/inversify.config.ts
import { PromptTemplateRepository, type IPromptTemplateRepository } from '@piquet-h/shared'

container
    .bind<IPromptTemplateRepository>('IPromptTemplateRepository')
    .toConstantValue(new PromptTemplateRepository({ ttlMs: 5 * 60 * 1000 }))
```

### Using in Handler

```typescript
@injectable()
export class MyHandler extends BaseHandler {
    constructor(@inject('IPromptTemplateRepository') private promptRepo: IPromptTemplateRepository) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        // Get template by ID
        const template = await this.promptRepo.getLatest('location-generator')

        if (!template) {
            return errorResponse(404, 'TemplateNotFound', 'Template not found')
        }

        // Use template content
        const prompt = template.content.replace('[terrain_type]', 'forest').replace('[existing_location]', 'Millhaven')

        // Track usage
        this.track('Prompt.Used', {
            templateId: template.id,
            version: template.version,
            hash: template.hash
        })
    }
}
```

See **schema.md** "Backend Integration" section for:

- Complete handler examples
- Query patterns (by ID, version, hash)
- Variable interpolation helpers
- Error handling patterns

## Environment Differences

### Development (file-based)

- Loads from individual JSON files
- No caching (changes apply immediately)
- Slower (file system reads)
- Use for iterative template development

### Production (bundle)

- Loads from `prompts.bundle.json` artifact
- In-memory caching (5-minute TTL)
- Faster (single JSON parse)
- Use for deployed environments

**Configuration:**

```typescript
// Development
const loader = new PromptLoader({
    source: 'files',
    cacheTtlMs: 0
})

// Production
const loader = new PromptLoader({
    source: 'bundle',
    cacheTtlMs: 5 * 60 * 1000
})
```

See **schema.md** "Environment Differences" for detailed comparison.

## Documentation

- **schema.md**: Complete authoring guide, field reference, best practices
- **schema.ts**: Zod validation schema definitions
- **types.ts**: TypeScript interfaces for repository and caching
- **README.md** (this file): Quick reference and workflow overview

## Notes

- Prompt templates are NOT exposed as MCP servers. If tooling requires HTTP access, implement a backend helper endpoint that calls into these shared helpers.
- When adding a template, update `shared/src/telemetryEvents.ts` if the template requires new AI telemetry event names.
- Template hashes are computed deterministically from canonical JSON (sorted keys, no whitespace variance).
