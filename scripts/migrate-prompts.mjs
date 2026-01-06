#!/usr/bin/env node
/**
 * Prompt Template Migration Script
 *
 * Migrates inline prompt templates from code to file-based storage.
 * Reads existing prompts from shared/src/prompts/worldTemplates.ts
 * and creates corresponding JSON files in shared/src/prompts/templates/
 *
 * Usage:
 *   node scripts/migrate-prompts.mjs [--dry-run]
 *
 * Options:
 *   --dry-run: Preview changes without writing files
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Existing inline prompts from worldTemplates.ts
const inlinePrompts = {
    'location-template': {
        template: `Generate a [terrain_type] location connected to [existing_location].
Consider: faction_control=[faction], climate=[season], political_tension=[current_events]
Include: 2-3 exits (semantic descriptions), ambient details, potential encounters
Maintain: established lore, D&D mechanics integration`,
        variables: ['terrain_type', 'existing_location', 'faction', 'season', 'current_events']
    },
    'npc-dialogue-template': {
        template: `Generate dialogue for [npc_name] ([faction], [alignment]).
Context: [current_world_events], [player_reputation]
Include: personality_traits, skill_check_opportunities, faction_perspective
Maintain: character_consistency, lore_accuracy`,
        variables: ['npc_name', 'faction', 'alignment', 'current_world_events', 'player_reputation']
    },
    'quest-template': {
        template: `Create a [quest_type] for [location/faction].
Difficulty: [player_level_range]
Integration: [current_storylines], [faction_conflicts]
Include: multiple_solutions, skill_check_variety, lore_references`,
        variables: ['quest_type', 'location_or_faction', 'player_level_range', 'current_storylines', 'faction_conflicts']
    }
}

function createTemplateObject(id, data) {
    const metadata = {
        id: id,
        version: '1.0.0',
        name: id
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
        description: `Migrated from inline prompt: ${id}`,
        tags: ['migrated', 'world'],
        author: 'migration-script'
    }

    const variables = data.variables.map((varName) => ({
        name: varName,
        description: `Variable: ${varName}`,
        required: true
    }))

    return {
        metadata,
        template: data.template.trim(),
        variables
    }
}

async function main() {
    const args = process.argv.slice(2)
    const dryRun = args.includes('--dry-run')

    const templatesDir = join(__dirname, '..', 'shared', 'src', 'prompts', 'templates')

    console.log('Prompt Template Migration')
    console.log('=========================')
    console.log()
    if (dryRun) {
        console.log('🔍 DRY RUN MODE - No files will be written')
        console.log()
    }

    let migratedCount = 0

    for (const [id, data] of Object.entries(inlinePrompts)) {
        const template = createTemplateObject(id, data)
        const filename = `${id}.json`
        const filepath = join(templatesDir, filename)

        console.log(`📝 ${filename}`)
        console.log(`   ID: ${template.metadata.id}`)
        console.log(`   Variables: ${template.variables.length}`)
        console.log(`   Template length: ${template.template.length} chars`)

        if (!dryRun) {
            await mkdir(templatesDir, { recursive: true })
            await writeFile(filepath, JSON.stringify(template, null, 4), 'utf-8')
            console.log(`   ✅ Written to ${filepath}`)
        } else {
            console.log(`   (would write to ${filepath})`)
        }

        console.log()
        migratedCount++
    }

    console.log(`Migration complete: ${migratedCount} templates ${dryRun ? 'previewed' : 'migrated'}`)

    if (dryRun) {
        console.log()
        console.log('To apply changes, run without --dry-run flag')
    } else {
        console.log()
        console.log('Next steps:')
        console.log('1. Run: node scripts/validate-prompts.mjs')
        console.log('2. Run: node scripts/bundle-prompts.mjs')
        console.log('3. Update code to use PromptLoader instead of inline constants')
    }
}

main().catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
})
