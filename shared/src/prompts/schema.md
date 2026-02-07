# Prompt Template Schema & Authoring Guide

## Overview

This document provides a complete guide to authoring, validating, and using prompt templates in The Shifting Atlas. Prompt templates are stored as versioned JSON files that enable reproducible, testable AI generation with deterministic hashing for replay and validation.

## Schema Definition

### Complete Template Structure

```json
{
    "metadata": {
        "id": "location-generator",
        "version": "1.0.0",
        "name": "Location Generator",
        "description": "Generates descriptions for new locations in the world",
        "tags": ["location", "world", "generation"],
        "author": "system",
        "createdAt": "2025-01-01T00:00:00Z",
        "updatedAt": "2025-01-01T00:00:00Z"
    },
    "template": "Generate a [terrain_type] location...",
    "variables": [
        {
            "name": "terrain_type",
            "description": "Type of terrain (e.g., forest, mountain, urban)",
            "required": true,
            "defaultValue": "forest"
        }
    ],
    "examples": [
        {
            "input": {
                "terrain_type": "forest",
                "existing_location": "Millhaven village"
            },
            "output": "A dense forest clearing...",
            "description": "Generate a forest location near a village"
        }
    ]
}
```

## Field Reference

### metadata (required)

Container for template identification and versioning metadata.

#### metadata.id (required)

- **Type**: `string`
- **Pattern**: `^[a-z0-9-_]+$` (lowercase alphanumeric, hyphens, underscores only)
- **Length**: 1-100 characters
- **Description**: Unique identifier for the template. Used for lookups and references.
- **Example**: `"location-generator"`, `"npc-dialogue-v2"`
- **Naming Convention**: Use kebab-case. Include version suffix for variants (e.g., `-v2`, `-experimental`).

#### metadata.version (required)

- **Type**: `string`
- **Pattern**: `^\d+\.\d+\.\d+$` (semantic versioning)
- **Description**: Template version following semver format (MAJOR.MINOR.PATCH).
- **Example**: `"1.0.0"`, `"2.1.3"`
- **Versioning Rules**:
    - Increment MAJOR for breaking changes to template contract
    - Increment MINOR for new variables or backward-compatible changes
    - Increment PATCH for wording/formatting fixes that don't affect behavior

#### metadata.name (required)

- **Type**: `string`
- **Length**: 1-200 characters
- **Description**: Human-readable display name for the template.
- **Example**: `"Location Generator"`, `"NPC Dialogue Generator V2"`

#### metadata.description (required)

- **Type**: `string`
- **Length**: 1-1000 characters
- **Description**: Detailed description of the template's purpose, expected output, and use cases.
- **Example**: `"Generates descriptions for new locations in the world, including exits, ambient details, and points of interest"`

#### metadata.tags (optional)

- **Type**: `string[]`
- **Description**: Categorization tags for searching and filtering templates.
- **Example**: `["location", "world", "generation"]`, `["npc", "dialogue", "quest"]`
- **Recommended Tags**: `location`, `npc`, `quest`, `item`, `event`, `world`, `generation`, `experimental`

#### metadata.author (optional)

- **Type**: `string`
- **Description**: Template author or system identifier.
- **Example**: `"system"`, `"world-team"`, `"migration-script"`

#### metadata.createdAt (optional)

- **Type**: `string` (ISO 8601 datetime)
- **Description**: Timestamp when template was first created.
- **Example**: `"2025-01-01T00:00:00Z"`

#### metadata.updatedAt (optional)

- **Type**: `string` (ISO 8601 datetime)
- **Description**: Timestamp of last template modification.
- **Example**: `"2025-01-10T09:00:00Z"`

### template (required)

The actual prompt content sent to the AI model.

- **Type**: `string`
- **Length**: 1-50,000 characters
- **Description**: The prompt text with optional variable placeholders in `[variable_name]` format.
- **Variable Interpolation**: Use square brackets for variables: `[terrain_type]`, `[location_name]`
- **Formatting**: Use clear sections, bullet points, and explicit instructions for the AI model.
- **Security**: MUST NOT contain API keys, secrets, passwords, or protected tokens (see Security section).

**Example**:

```
Generate a [terrain_type] location connected to [existing_location].

Consider:
- faction_control=[faction]
- climate=[season]
- political_tension=[current_events]

Include:
- 2-3 exits with semantic descriptions
- Ambient details appropriate to terrain and climate
- Potential encounters or points of interest

Maintain:
- Established lore consistency
- D&D mechanics integration
- Immersive narrative voice
```

### variables (optional)

Array of variable definitions for template interpolation.

Each variable object contains:

#### name (required)

- **Type**: `string`
- **Pattern**: `^[a-zA-Z_][a-zA-Z0-9_]*$` (valid identifier)
- **Description**: Variable name used in `[name]` placeholders within the template.
- **Example**: `"terrain_type"`, `"existing_location"`, `"faction"`

#### description (required)

- **Type**: `string`
- **Length**: At least 1 character
- **Description**: Human-readable description of what the variable represents and how it's used.
- **Example**: `"Type of terrain (e.g., forest, mountain, urban)"`

#### required (optional, default: true)

- **Type**: `boolean`
- **Description**: Whether the variable must be provided when using the template.
- **Example**: `true` (must provide), `false` (optional)

#### defaultValue (optional)

- **Type**: `string`
- **Description**: Default value if variable is not provided (only meaningful when required=false).
- **Example**: `"neutral"`, `"temperate"`

### examples (optional)

Array of example inputs and outputs demonstrating template usage.

Each example object contains:

#### input (required)

- **Type**: `object` (key-value pairs)
- **Description**: Variable values for this example.
- **Example**: `{ "terrain_type": "forest", "existing_location": "Millhaven village" }`

#### output (optional)

- **Type**: `string`
- **Description**: Expected or sample AI output for this input.
- **Example**: `"A dense forest clearing with ancient oaks..."`

#### description (optional)

- **Type**: `string`
- **Description**: Description of what this example demonstrates.
- **Example**: `"Generate a forest location near a village in autumn"`

## Authoring Best Practices

### Naming Conventions

**Template IDs**:

- Use kebab-case: `location-generator`, `npc-dialogue`
- Include version suffix for variants: `location-generator-v2`, `npc-dialogue-experimental`
- Keep IDs stable across template iterations (use version field for changes)

**Variable Names**:

- Use snake_case: `terrain_type`, `player_level`, `faction_control`
- Be descriptive: prefer `existing_location` over `loc`
- Avoid abbreviations unless widely understood

### Template Content Guidelines

1. **Be Explicit**: Clearly state expected output format, constraints, and requirements
2. **Structure Prompts**: Use sections (Consider, Include, Maintain) for clarity
3. **Provide Context**: Include relevant game mechanics, lore requirements, and narrative voice
4. **Use Variables**: Make prompts reusable by parameterizing key elements
5. **Keep Focused**: One template should do one thing well

### Variable Design

1. **Required vs Optional**: Mark core parameters as required; contextual details as optional with defaults
2. **Provide Defaults**: For optional variables, include sensible default values
3. **Document Clearly**: Describe expected format and example values in description
4. **Type Safety**: Document expected types in description (e.g., "comma-separated list", "integer 1-10")

### Examples

Include 2-3 examples showing:

- Happy path (typical usage)
- Edge case (unusual but valid input)
- Maximum complexity (all optional variables provided)

## Security & Validation

### Protected Token Patterns

Templates are automatically scanned for protected tokens during validation. The following patterns are **FORBIDDEN**:

- API keys: `/api[_-]?key/i`
- Secrets: `/secret/i`
- Passwords: `/password/i`
- Tokens: `/token/i`
- Credentials: `/credential/i`
- Private keys: `/-----BEGIN.*PRIVATE KEY-----/`
- OpenAI keys: `/sk-[a-zA-Z0-9]{48}/`

**If a template contains any of these patterns, CI validation will fail.**

### Validation Checklist

Before committing a template, ensure:

- [ ] Valid JSON syntax (use `node scripts/validate-prompts.mjs`)
- [ ] All required metadata fields present
- [ ] ID follows naming convention (`^[a-z0-9-_]+$`)
- [ ] Version is valid semver (`^\d+\.\d+\.\d+$`)
- [ ] No protected tokens in template content
- [ ] All referenced variables are defined in `variables` array
- [ ] Examples demonstrate realistic usage

## Local Development Workflow

### Creating a New Template

1. **Create JSON file** in `shared/src/prompts/templates/`:

    ```bash
    cd shared/src/prompts/templates
    touch my-template.json
    ```

2. **Author template** following schema (see example above)

3. **Validate**:

    ```bash
    node scripts/validate-prompts.mjs
    ```

4. **Test locally** (see Backend Integration section)

5. **Bundle for production**:
    ```bash
    node scripts/bundle-prompts.mjs
    ```

### Updating an Existing Template

**For patch changes** (wording, formatting):

- Update template content
- Increment PATCH version: `1.0.0` → `1.0.1`
- Update `updatedAt` timestamp

**For minor changes** (new optional variables):

- Add variables to `variables` array
- Update template to use new variables
- Increment MINOR version: `1.0.1` → `1.1.0`

**For major changes** (breaking contract):

- Create new template file with version suffix: `my-template-v2.json`
- Update `id` to include version: `my-template-v2`
- Set version to `1.0.0` for new template
- Deprecate old template (add note in description)

### Validation Script Usage

**Basic validation**:

```bash
node scripts/validate-prompts.mjs
```

**Output**:

```
Validating prompt templates in: shared/src/prompts/templates

✅ location-generator.json: Valid (v1.0.0, hash: 02f80b43...)
✅ npc-dialogue-generator.json: Valid (v1.0.0, hash: 89768071...)
❌ my-template.json: FAILED
   Error: metadata.id: Invalid characters (only [a-z0-9-_] allowed)

Validation complete:
  ✅ Validated: 2
  ❌ Failed: 1
```

**Exit codes**:

- `0`: All templates valid
- `1`: One or more validation errors

### Bundling for Production

**Create bundle**:

```bash
node scripts/bundle-prompts.mjs
```

This creates `shared/src/prompts/templates/prompts.bundle.json` containing:

- All validated templates
- Content hashes for each template
- Bundle generation timestamp

**Bundle structure**:

```json
{
    "version": "1.0.0",
    "generatedAt": "2025-01-10T09:42:00Z",
    "templates": {
        "location-generator": {
            /* full template */
        },
        "npc-dialogue-generator": {
            /* full template */
        }
    },
    "hashes": {
        "location-generator": "02f80b430822...",
        "npc-dialogue-generator": "89768071deba..."
    }
}
```

## Backend Integration

### Repository Injection (Inversify)

Templates are accessed via the `IPromptTemplateRepository` interface, injected through Inversify DI.

**Configuration** (`backend/src/inversify.config.ts`):

```typescript
import { PromptTemplateRepository, type IPromptTemplateRepository } from '@piquet-h/shared'

container
    .bind<IPromptTemplateRepository>('IPromptTemplateRepository')
    .toConstantValue(new PromptTemplateRepository({ ttlMs: 5 * 60 * 1000 }))
```

### Using Templates in Handlers

**Basic usage**:

```typescript
import type { IPromptTemplateRepository } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'

@injectable()
export class MyHandler extends BaseHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject('IPromptTemplateRepository') private promptRepo: IPromptTemplateRepository
    ) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        // Get latest version by ID
        const template = await this.promptRepo.getLatest('location-generator')

        if (!template) {
            return errorResponse(404, 'TemplateNotFound', 'Template not found')
        }

        // Use template content
        const prompt = template.content
        // ... send to AI model
    }
}
```

### Query Patterns

**Get latest version by ID**:

```typescript
const template = await promptRepo.getLatest('location-generator')
// Returns latest version of location-generator
```

**Get specific version**:

```typescript
const template = await promptRepo.getByVersion('location-generator', '1.0.0')
// Returns version 1.0.0 specifically
```

**Get by content hash** (for replay/audit):

```typescript
const template = await promptRepo.getByHash('02f80b430822...')
// Returns template with exact content hash
```

**Flexible query**:

```typescript
const template = await promptRepo.get({
    id: 'location-generator',
    version: '1.0.0', // optional
    hash: '02f80b...' // optional
})
```

### Variable Interpolation

Templates use `[variable_name]` placeholders that need to be replaced before sending to AI:

```typescript
const template = await promptRepo.getLatest('location-generator')

// Simple string replacement (for basic use cases)
let prompt = template.content.replace('[terrain_type]', 'forest').replace('[existing_location]', 'Millhaven village')

// Or use a helper function for all variables
function interpolate(template: string, vars: Record<string, string>): string {
    return Object.entries(vars).reduce((result, [key, value]) => result.replace(`[${key}]`, value), template)
}

const prompt = interpolate(template.content, {
    terrain_type: 'forest',
    existing_location: 'Millhaven village',
    faction: 'neutral',
    season: 'autumn'
})
```

### Complete Handler Example

```typescript
import type { HttpRequest, HttpResponseInit } from '@azure/functions'
import type { IPromptTemplateRepository } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import { BaseHandler } from './base/BaseHandler.js'
import { errorResponse, okResponse } from './utils/responseBuilder.js'

@injectable()
export class GenerateLocationHandler extends BaseHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject('IPromptTemplateRepository') private promptRepo: IPromptTemplateRepository
    ) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        // 1. Get template
        const template = await this.promptRepo.getLatest('location-generator')

        if (!template) {
            this.recordNormalizedError('Location.Generate', 'TemplateNotFound', 'Location generator template not found', 500)
            return errorResponse(500, 'TemplateNotFound', 'Template not found')
        }

        // 2. Extract request parameters
        const terrainType = req.query.get('terrain') || 'forest'
        const existingLocation = req.query.get('from') || 'starting area'

        // 3. Interpolate variables
        const prompt = template.content
            .replace('[terrain_type]', terrainType)
            .replace('[existing_location]', existingLocation)
            .replace('[faction]', 'neutral')
            .replace('[season]', 'temperate')
            .replace('[current_events]', 'stable')

        // 4. Track template usage
        this.track('Location.Generate.PromptTemplateUsed', {
            templateId: template.id,
            templateVersion: template.version,
            templateHash: template.hash,
            terrainType
        })

        // 5. Send to AI model (not shown)
        // const aiResponse = await this.aiClient.generate(prompt)

        return okResponse({ prompt, template: template.metadata })
    }
}
```

## Migration from Inline Prompts

### Migration Workflow

If you have existing inline prompts in code (e.g., in `worldTemplates.ts`), follow this process to move them to the registry:

#### Step 1: Preview Migration

Run the migration script in dry-run mode:

```bash
node scripts/migrate-prompts-v2.mjs --dry-run
```

This prints a deterministic plan of what would be created/updated, without writing files.

#### Step 2: Review Generated Templates

The script generates templates with default metadata. Review and customize:

- Update `description` to be more specific
- Add relevant `tags`
- Improve variable descriptions
- Add examples demonstrating usage

#### Step 3: Apply Migration

Run without dry-run flag:

```bash
node scripts/migrate-prompts-v2.mjs
```

#### Step 4: Validate Generated Templates

```bash
node scripts/validate-prompts.mjs
```

Fix any validation errors.

#### Step 5: Update Code References

Replace inline prompt strings with repository lookups:

**Before** (inline prompt):

```typescript
const LOCATION_PROMPT = `Generate a [terrain_type] location...`

// Usage
const prompt = LOCATION_PROMPT.replace('[terrain_type]', 'forest')
```

**After** (repository):

```typescript
constructor(
    @inject('IPromptTemplateRepository') private promptRepo: IPromptTemplateRepository
) {}

// Usage
const template = await this.promptRepo.getLatest('location-template')
const prompt = template.content.replace('[terrain_type]', 'forest')
```

#### Step 6: Test Updated Code

Run relevant tests to ensure prompts work correctly after migration:

```bash
npm run test:backend
```

#### Step 7: Remove Inline Constants

Once verified, remove old inline prompt constants from `worldTemplates.ts` or other files.

### Migration Script Customization

The supported migration tool is `scripts/migrate-prompts-v2.mjs`.

- It currently discovers known inline sources (notably `shared/src/prompts/worldTemplates.ts`).
- If you have additional inline prompt sources, prefer migrating them manually into `shared/src/prompts/templates/`.

After adding/editing templates, always run:

```bash
node scripts/validate-prompts.mjs
node scripts/bundle-prompts.mjs
```

## Environment Differences

### Development (file-based)

**Configuration**:

```typescript
const loader = new PromptLoader({
    source: 'files',
    basePath: join(__dirname, 'templates'),
    cacheTtlMs: 0 // Disable caching for development
})
```

**Behavior**:

- Reads from individual JSON files in `shared/src/prompts/templates/`
- Changes take effect immediately (no cache)
- Useful for iterative template development
- Slower due to file system reads

**Use when**:

- Developing new templates
- Testing template changes locally
- Running local development server

### Production (bundle)

**Configuration**:

```typescript
const loader = new PromptLoader({
    source: 'bundle',
    basePath: join(__dirname, 'templates'),
    cacheTtlMs: 5 * 60 * 1000 // 5-minute cache
})
```

**Behavior**:

- Reads from bundled `prompts.bundle.json` artifact
- In-memory caching for performance
- Templates validated during build
- Faster lookups (single JSON parse)

**Use when**:

- Deploying to Azure Functions
- Running production environment
- CI/CD pipeline builds

### Backend Default Configuration

The backend uses `PromptTemplateRepository` (not `PromptLoader`) which loads from `worldTemplates.ts` in-memory storage:

```typescript
// backend/src/inversify.config.ts
container
    .bind<IPromptTemplateRepository>('IPromptTemplateRepository')
    .toConstantValue(new PromptTemplateRepository({ ttlMs: 5 * 60 * 1000 }))
```

This provides:

- In-memory caching with 5-minute TTL
- Loads from `shared/src/prompts/worldTemplates.ts`
- No file system dependency (suitable for serverless)

## Edge Cases & Troubleshooting

### Conflicting Author Conventions

**Problem**: Multiple authors using different template styles.

**Recommended Pattern**:

- Follow this schema guide strictly
- Use template tags to indicate domain: `["location", "official"]` vs `["location", "experimental"]`
- Code review process for all template changes
- Automated validation in CI prevents schema violations

### Local vs Production Template Mismatches

**Problem**: Template works locally but fails in production.

**Solution**:

1. **Always validate** before committing:
    ```bash
    node scripts/validate-prompts.mjs
    ```
2. **Always bundle** before deploying:
    ```bash
    node scripts/bundle-prompts.mjs
    ```
3. **Check CI** validation passes
4. **Version templates** explicitly to track changes

### Template Not Found at Runtime

**Problem**: `promptRepo.getLatest('my-template')` returns `undefined`.

**Debugging**:

1. Verify template exists in `shared/src/prompts/templates/my-template.json`
2. Check template ID matches exactly (case-sensitive)
3. Ensure template is valid: `node scripts/validate-prompts.mjs`
4. Confirm bundle includes template (if using bundle mode)
5. Check cache TTL hasn't masked template update

### Variable Interpolation Errors

**Problem**: Variables not being replaced in prompt.

**Common Causes**:

- Variable name mismatch (check spelling)
- Using `{variable}` instead of `[variable]` syntax
- Variable defined but not used in template
- Variable used but not defined in `variables` array

**Solution**:

- Validate variable names match between `variables` array and template content
- Use consistent `[variable_name]` syntax
- Add unit tests for interpolation logic

### Hash Mismatch on Replay

**Problem**: Trying to retrieve template by hash but getting `undefined`.

**Cause**: Template content changed but hash wasn't updated.

**Solution**:

- Hashes are computed automatically during bundling
- Increment version number when changing template
- Use `computeTemplateHash()` from `shared/src/prompts/canonicalize.ts` for custom hashing
- Don't manually edit bundle hashes

## Summary

This guide covers:

- ✅ Complete schema field reference
- ✅ Authoring best practices and conventions
- ✅ Security validation and protected tokens
- ✅ Local development workflow
- ✅ Backend integration patterns
- ✅ Migration from inline prompts
- ✅ Environment differences (dev vs prod)
- ✅ Edge case handling

For additional context:

- See existing templates in `shared/src/prompts/templates/`
- Review validation script at `scripts/validate-prompts.mjs`
- Check migration script at `scripts/migrate-prompts-v2.mjs`
- Explore handler examples in `backend/src/handlers/getPromptTemplate.ts`
