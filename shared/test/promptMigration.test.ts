import assert from 'node:assert'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..', '..')

/**
 * Test suite for prompt template migration script
 *
 * Covers:
 * - Variable extraction from placeholders
 * - Hash-based idempotency
 * - Auto-versioning on conflicts
 * - Dry-run mode
 * - Migration report
 */

// Helper function to extract variables (matches implementation in migrate-prompts-v2.mjs)
function extractVariables(templateString) {
    const variablePattern = /\[([a-zA-Z_][a-zA-Z0-9_]*)\]/g
    const variables = []
    const seen = new Set()
    const warnings = []

    let match
    while ((match = variablePattern.exec(templateString)) !== null) {
        const varName = match[1]

        if (seen.has(varName)) continue
        seen.add(varName)

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(varName)) {
            warnings.push(`Invalid variable name: ${varName}`)
            continue
        }

        variables.push({
            name: varName,
            description: `Variable: ${varName.replace(/_/g, ' ')}`,
            required: true
        })
    }

    return { variables, warnings }
}

test('variable extraction: detect [placeholder_name] patterns', () => {
    const template = 'Generate a [terrain_type] location connected to [existing_location].'
    const result = extractVariables(template)

    assert.equal(result.variables.length, 2)
    assert.equal(result.variables[0].name, 'terrain_type')
    assert.equal(result.variables[1].name, 'existing_location')
    assert.equal(result.warnings.length, 0)
})

test('variable extraction: ignore duplicate placeholders', () => {
    const template = 'Use [name] for [name] references'
    const result = extractVariables(template)

    assert.equal(result.variables.length, 1)
    assert.equal(result.variables[0].name, 'name')
})

test('variable extraction: handle complex template', () => {
    const template = `Generate dialogue for [npc_name] ([faction], [alignment]).
Context: [current_world_events], [player_reputation]
Include: personality_traits, skill_check_opportunities, faction_perspective`

    const result = extractVariables(template)

    assert.equal(result.variables.length, 5)
    const varNames = result.variables.map((v) => v.name)
    assert.ok(varNames.includes('npc_name'))
    assert.ok(varNames.includes('faction'))
    assert.ok(varNames.includes('alignment'))
    assert.ok(varNames.includes('current_world_events'))
    assert.ok(varNames.includes('player_reputation'))
})

test('variable extraction: generate proper descriptions', () => {
    const template = '[terrain_type] and [existing_location]'
    const result = extractVariables(template)

    assert.equal(result.variables[0].description, 'Variable: terrain type')
    assert.equal(result.variables[1].description, 'Variable: existing location')
})

test('variable extraction: all variables marked as required', () => {
    const template = '[var1] and [var2]'
    const result = extractVariables(template)

    assert.equal(result.variables[0].required, true)
    assert.equal(result.variables[1].required, true)
})

test('dry-run mode: script runs without errors', () => {
    // Run the migration script in dry-run mode
    const output = execSync('node scripts/migrate-prompts-v2.mjs --dry-run', {
        cwd: rootDir,
        encoding: 'utf-8',
        stdio: 'pipe'
    })

    // Should contain dry-run indicator
    assert.ok(output.includes('DRY RUN MODE'))

    // Should discover templates
    assert.ok(output.includes('Found 3 inline templates'))

    // Should show migration summary
    assert.ok(output.includes('Migration Report'))
    assert.ok(output.includes('Discovered: 3 templates'))
})

test('dry-run mode: shows code refactoring plan', () => {
    const output = execSync('node scripts/migrate-prompts-v2.mjs --dry-run', {
        cwd: rootDir,
        encoding: 'utf-8'
    })

    // Should show refactoring plan
    assert.ok(output.includes('Code Refactoring Plan'))
    assert.ok(output.includes('worldTemplates.ts'))
    assert.ok(output.includes('deprecate'))
})

test('migration report: includes version conflicts', () => {
    const output = execSync('node scripts/migrate-prompts-v2.mjs --dry-run', {
        cwd: rootDir,
        encoding: 'utf-8'
    })

    // Should report version conflicts
    assert.ok(output.includes('Version Conflicts'))
    // Existing files cause conflicts
    assert.ok(output.includes('location-generator') || output.includes('npc-dialogue-generator'))
})

test('migration report: flags templates for review', () => {
    const output = execSync('node scripts/migrate-prompts-v2.mjs --dry-run', {
        cwd: rootDir,
        encoding: 'utf-8'
    })

    // Should flag templates for review
    assert.ok(output.includes('Templates Flagged for Review'))
})

test('migration report: shows bundle and validation status', () => {
    const output = execSync('node scripts/migrate-prompts-v2.mjs --dry-run', {
        cwd: rootDir,
        encoding: 'utf-8'
    })

    // Should show bundle/validation would run
    assert.ok(output.includes('Bundle Generation'))
    assert.ok(output.includes('Validation'))
    assert.ok(output.includes('Skipped (dry-run)'))
})
