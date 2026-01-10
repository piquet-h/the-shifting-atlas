# Prompt Template Migration Script v2

## Overview

Enhanced migration script that auto-discovers prompt templates from multiple sources and migrates them to the file-based registry with hash-based idempotency, auto-versioning, and optional code refactoring.

## Features

- **Multi-source discovery**: Extracts templates from inline constants and validates existing registry files
- **Automatic variable extraction**: Scans templates for `[placeholder]` patterns
- **Hash-based idempotency**: Skips migration if content hash matches existing file
- **Auto-versioning**: Creates `-v2`, `-v3`, etc. when hash mismatches occur
- **Code refactoring**: Updates code to use PromptLoader API (with `--apply` flag)
- **Bundle regeneration**: Automatically runs bundle-prompts.mjs after migration
- **Validation**: Runs validate-prompts.mjs to ensure schema compliance
- **Dry-run mode**: Preview all changes before applying

## Usage

### Preview Changes (Dry-run)

```bash
node scripts/migrate-prompts-v2.mjs --dry-run
```

Shows what would happen without modifying any files.

### Migrate Templates Only

```bash
node scripts/migrate-prompts-v2.mjs
```

Writes template files but only previews code refactoring.

### Full Migration with Code Refactoring

```bash
node scripts/migrate-prompts-v2.mjs --apply
```

Migrates templates AND applies code refactoring changes.

### Combined Dry-run with Apply Preview

```bash
node scripts/migrate-prompts-v2.mjs --dry-run --apply
```

Shows what both template migration and code refactoring would do.

## Migration Sources

### Inline Constants (worldTemplates.ts)

- `LOCATION_TEMPLATE` → `location-generator.json`
- `NPC_DIALOGUE_TEMPLATE` → `npc-dialogue-generator.json`
- `QUEST_TEMPLATE` → `quest-generator.json`

### Existing Registry Files

- `shared/src/prompts/templates/*.json`

Validates hash against source; creates versioned file if mismatch detected.

## Output

### Template Files

Created in `shared/src/prompts/templates/`:

```
location-generator.json
npc-dialogue-generator.json
quest-generator.json
```

Or versioned if conflicts:

```
location-generator-v2.json
npc-dialogue-generator-v2.json
```

### Code Refactoring

With `--apply` flag:

- Adds deprecation comments to `worldTemplates.ts`
- Marks `PromptTemplateRepository.ts` for manual refactoring

## Migration Report

After running, the script outputs:

```
📊 Summary:
   Discovered: N templates
   Migrated: N templates
   Skipped (identical): N templates
   Auto-versioned: N templates

🏷️  Templates Flagged for Review:
   - template-id-1
   - template-id-2

⚠️  Version Conflicts:
   - original-id → versioned-id
     Reason: Content hash mismatch

🔧 Code Refactoring:
   Files to modify: N
   Applied: N
   Skipped: N

📦 Bundle Generation: Success/Failed/Skipped
✅ Validation: Success/Failed/Skipped
```

## Edge Cases Handled

### Hash Mismatch with Existing File

Creates versioned file instead of overwriting:

```
location-generator.json (existing, hash: abc123)
location-generator-v2.json (new, hash: def456)
```

### Version Collision

If `-v2` already exists, increments to `-v3`:

```
template-v2.json (exists)
template-v3.json (created)
```

### Invalid Variable Names

Logs warning and skips invalid placeholders:

```
⚠️  template-id: Invalid variable name: 123invalid
```

### Missing Metadata

Flags template for review:

```
tags: ["migrated", "needs-review"]
```

## Post-Migration Steps

1. **Review flagged templates**: Update descriptions, examples, author info
2. **Test code changes**: Verify refactored code works correctly
3. **Run validation**: `node scripts/validate-prompts.mjs`
4. **Run bundle**: `node scripts/bundle-prompts.mjs`
5. **Clean up deprecated files**: Remove old template sources after verification

## Testing

Integration tests in `shared/test/promptMigration.test.ts`:

```bash
cd shared
npm test -- --test-name-pattern="migration"
```

## Troubleshooting

### "Could not load shared package utilities"

The script now uses standalone utilities and doesn't require the shared package to be built.

### "Bundle Generation Failed"

Ensure `scripts/bundle-prompts.mjs` exists and shared package is built.

### "Validation Failed"

Check template schema compliance and protected token detection.

## Related Scripts

- `validate-prompts.mjs` - Validates template schema and security
- `bundle-prompts.mjs` - Creates runtime bundle artifact
- `migrate-prompts.mjs` - Original simple migration script (deprecated)
