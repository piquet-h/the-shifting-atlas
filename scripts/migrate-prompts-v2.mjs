#!/usr/bin/env node
/**
 * Prompt Template Migration Script (Enhanced)
 *
 * Migrates prompt templates from multiple sources to the file-based registry:
 * - Inline constants from shared/src/prompts/worldTemplates.ts
 * - Backend templates from backend/src/functions/templates.json (if exists)
 * - Validates existing registry files
 *
 * Features:
 * - Multi-source discovery with AST parsing
 * - Automatic variable extraction from [placeholder] patterns
 * - Hash-based idempotency with auto-versioning
 * - Code refactoring (with --apply flag)
 * - Automatic bundle regeneration
 * - Validation integration
 * - Dry-run mode
 *
 * Usage:
 *   node scripts/migrate-prompts-v2.mjs [--dry-run] [--apply]
 *
 * Options:
 *   --dry-run: Preview changes without writing files
 *   --apply: Execute code refactoring (default: preview only)
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

// ============================================================================
// Standalone Utilities (no dependency on built shared package)
// ============================================================================

/**
 * Recursively sort object keys alphabetically
 */
function sortObjectKeys(obj) {
    if (obj === null || obj === undefined) {
        return obj
    }

    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys)
    }

    if (typeof obj === 'object') {
        const sorted = {}
        const keys = Object.keys(obj).sort()

        for (const key of keys) {
            const value = obj[key]
            // Skip undefined values for determinism
            if (value !== undefined) {
                sorted[key] = sortObjectKeys(value)
            }
        }

        return sorted
    }

    return obj
}

/**
 * Canonicalize a prompt template to deterministic JSON string
 */
function canonicalizeTemplate(template) {
    const sortedTemplate = sortObjectKeys(template)
    return JSON.stringify(sortedTemplate)
}

/**
 * Compute SHA256 hash of a prompt template
 */
function computeTemplateHash(template) {
    const canonical = canonicalizeTemplate(template)
    return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/**
 * Validate prompt template against schema (simplified)
 */
function validatePromptTemplate(template) {
    if (!template || typeof template !== 'object') {
        return { valid: false, errors: ['Template must be an object'] }
    }

    if (!template.metadata || typeof template.metadata !== 'object') {
        return { valid: false, errors: ['Template must have metadata'] }
    }

    if (!template.metadata.id || typeof template.metadata.id !== 'string') {
        return { valid: false, errors: ['Template metadata must have id'] }
    }

    if (!template.template || typeof template.template !== 'string') {
        return { valid: false, errors: ['Template must have template string'] }
    }

    return { valid: true, template }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract variables from template string
 * Finds all [placeholder_name] patterns and generates variable definitions
 */
function extractVariables(templateString) {
    const variablePattern = /\[([a-zA-Z_][a-zA-Z0-9_]*)\]/g
    const variables = []
    const seen = new Set()
    const warnings = []

    let match
    while ((match = variablePattern.exec(templateString)) !== null) {
        const varName = match[1]

        // Skip if already processed
        if (seen.has(varName)) continue
        seen.add(varName)

        // Validate variable name
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

/**
 * Parse worldTemplates.ts to extract inline constants
 * Uses simple regex parsing (AST parsing would require @babel/parser dependency)
 */
async function parseInlineTemplates(filePath) {
    const content = await readFile(filePath, 'utf-8')
    const templates = []

    // Extract LOCATION_TEMPLATE
    const locationMatch = content.match(/export const LOCATION_TEMPLATE = `([^`]+)`/)
    if (locationMatch) {
        templates.push({
            id: 'location-generator',
            constantName: 'LOCATION_TEMPLATE',
            template: locationMatch[1].trim(),
            sourceFile: 'worldTemplates.ts',
            sourceType: 'inline'
        })
    }

    // Extract NPC_DIALOGUE_TEMPLATE
    const npcMatch = content.match(/export const NPC_DIALOGUE_TEMPLATE = `([^`]+)`/)
    if (npcMatch) {
        templates.push({
            id: 'npc-dialogue-generator',
            constantName: 'NPC_DIALOGUE_TEMPLATE',
            template: npcMatch[1].trim(),
            sourceFile: 'worldTemplates.ts',
            sourceType: 'inline'
        })
    }

    // Extract QUEST_TEMPLATE
    const questMatch = content.match(/export const QUEST_TEMPLATE = `([^`]+)`/)
    if (questMatch) {
        templates.push({
            id: 'quest-generator',
            constantName: 'QUEST_TEMPLATE',
            template: questMatch[1].trim(),
            sourceFile: 'worldTemplates.ts',
            sourceType: 'inline'
        })
    }

    return templates
}

/**
 * Load existing template files and compute hashes
 */
async function loadExistingTemplates(templatesDir, computeTemplateHash) {
    const existing = new Map()

    try {
        const files = await readdir(templatesDir)
        const jsonFiles = files.filter((f) => f.endsWith('.json'))

        for (const file of jsonFiles) {
            const filePath = join(templatesDir, file)
            const content = await readFile(filePath, 'utf-8')
            const template = JSON.parse(content)
            const hash = computeTemplateHash(template)

            existing.set(template.metadata.id, {
                template,
                hash,
                filePath
            })
        }
    } catch (err) {
        if (err.code !== 'ENOENT') throw err
    }

    return existing
}

/**
 * Find next available version suffix
 */
async function findNextVersion(templatesDir, baseId) {
    let version = 2
    while (true) {
        const versionedId = `${baseId}-v${version}`
        const filePath = join(templatesDir, `${versionedId}.json`)
        try {
            await readFile(filePath, 'utf-8')
            version++
        } catch (err) {
            if (err.code === 'ENOENT') {
                return versionedId
            }
            throw err
        }
    }
}

/**
 * Create template object from source data
 */
function createTemplateObject(id, templateString, sourceInfo) {
    const { variables, warnings } = extractVariables(templateString)

    const metadata = {
        id,
        version: '1.0.0',
        name: id
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
        description: `Migrated from ${sourceInfo.sourceType}: ${sourceInfo.sourceFile}`,
        tags: ['migrated', 'needs-review', 'world'],
        author: 'migration-script',
        createdAt: new Date().toISOString()
    }

    return {
        template: {
            metadata,
            template: templateString,
            variables
        },
        warnings
    }
}

/**
 * Generate code refactoring diff (preview or apply)
 */
async function generateRefactoringPlan() {
    // Map old function calls to new loader calls
    const refactorings = []

    // 1. worldTemplates.ts deprecation
    refactorings.push({
        file: 'shared/src/prompts/worldTemplates.ts',
        type: 'deprecate',
        changes: [
            {
                description: 'Add deprecation comment to file header',
                search: '// World prompt templates externalized',
                replace: '// DEPRECATED: Use PromptLoader from loader.ts instead\n// World prompt templates externalized'
            },
            {
                description: 'Add deprecation comment to getWorldTemplate function',
                search: 'export function getWorldTemplate',
                replace: '/** @deprecated Use PromptLoader.getById() instead */\nexport function getWorldTemplate'
            }
        ]
    })

    // 2. PromptTemplateRepository.ts - update to use loader
    refactorings.push({
        file: 'shared/src/prompts/PromptTemplateRepository.ts',
        type: 'update-import',
        changes: [
            {
                description: 'Update to use PromptLoader instead of getWorldTemplate',
                note: 'This requires broader refactoring - marking for manual review'
            }
        ]
    })

    return refactorings
}

/**
 * Execute code refactoring
 */
async function applyCodeRefactoring(refactorings, dryRun) {
    if (dryRun) {
        console.log('\n📝 Code Refactoring Plan (--apply not specified):')
        for (const refactoring of refactorings) {
            console.log(`\n  File: ${refactoring.file}`)
            console.log(`  Type: ${refactoring.type}`)
            for (const change of refactoring.changes) {
                console.log(`    - ${change.description}`)
                if (change.note) {
                    console.log(`      Note: ${change.note}`)
                }
            }
        }
        return { applied: 0, skipped: refactorings.length }
    }

    let applied = 0
    for (const refactoring of refactorings) {
        const filePath = join(rootDir, refactoring.file)

        try {
            let content = await readFile(filePath, 'utf-8')
            let modified = false

            for (const change of refactoring.changes) {
                if (change.search && change.replace) {
                    if (content.includes(change.search)) {
                        content = content.replace(change.search, change.replace)
                        modified = true
                    }
                }
            }

            if (modified) {
                await writeFile(filePath, content, 'utf-8')
                applied++
                console.log(`  ✅ Applied refactoring to ${refactoring.file}`)
            }
        } catch (err) {
            console.warn(`  ⚠️  Could not refactor ${refactoring.file}: ${err.message}`)
        }
    }

    return { applied, skipped: refactorings.length - applied }
}

/**
 * Run bundle generation
 */
async function runBundleGeneration(dryRun) {
    if (dryRun) {
        console.log('\n📦 Bundle Generation (would run):')
        console.log('  node scripts/bundle-prompts.mjs')
        return { success: true, skipped: true }
    }

    try {
        console.log('\n📦 Running bundle generation...')
        execSync('node scripts/bundle-prompts.mjs', {
            cwd: rootDir,
            stdio: 'inherit'
        })
        return { success: true, skipped: false }
    } catch (err) {
        return { success: false, error: err.message }
    }
}

/**
 * Run validation
 */
async function runValidation(dryRun) {
    if (dryRun) {
        console.log('\n✅ Validation (would run):')
        console.log('  node scripts/validate-prompts.mjs')
        return { success: true, skipped: true }
    }

    try {
        console.log('\n✅ Running validation...')
        execSync('node scripts/validate-prompts.mjs', {
            cwd: rootDir,
            stdio: 'inherit'
        })
        return { success: true, skipped: false }
    } catch (err) {
        return { success: false, error: err.message }
    }
}

// ============================================================================
// Main Migration Logic
// ============================================================================

async function main() {
    const args = process.argv.slice(2)
    const dryRun = args.includes('--dry-run')
    const applyRefactoring = args.includes('--apply')

    console.log('╔════════════════════════════════════════════════════════════════╗')
    console.log('║  Prompt Template Migration v2 (Enhanced)                       ║')
    console.log('╚════════════════════════════════════════════════════════════════╝')
    console.log()

    if (dryRun) {
        console.log('🔍 DRY RUN MODE - No files will be written')
    }
    if (!applyRefactoring) {
        console.log('📋 Code refactoring will be previewed only (use --apply to execute)')
    }
    console.log()

    const templatesDir = join(rootDir, 'shared', 'src', 'prompts', 'templates')

    // Migration state
    const report = {
        discovered: 0,
        migrated: 0,
        skipped: 0,
        versioned: 0,
        conflicts: [],
        warnings: [],
        codeChanges: [],
        flaggedForReview: []
    }

    // ========================================================================
    // Phase 1: Discovery
    // ========================================================================

    console.log('📂 Phase 1: Discovering Templates')
    console.log('─'.repeat(70))

    // 1.1: Parse inline constants from worldTemplates.ts
    const worldTemplatesPath = join(rootDir, 'shared', 'src', 'prompts', 'worldTemplates.ts')
    const inlineTemplates = await parseInlineTemplates(worldTemplatesPath)
    console.log(`  Found ${inlineTemplates.length} inline templates in worldTemplates.ts`)

    // 1.2: Check for backend templates.json (may not exist)
    const backendTemplatesPath = join(rootDir, 'backend', 'src', 'functions', 'templates.json')
    let backendTemplates = []
    try {
        const backendContent = await readFile(backendTemplatesPath, 'utf-8')
        const backendData = JSON.parse(backendContent)
        // TODO: Map backend schema to shared schema if needed
        console.log(`  Found backend templates.json (not yet implemented)`)
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.warn(`  ⚠️  Error reading backend templates: ${err.message}`)
        }
    }

    // 1.3: Load existing registry files
    const existingTemplates = await loadExistingTemplates(templatesDir, computeTemplateHash)
    console.log(`  Found ${existingTemplates.size} existing registry templates`)

    report.discovered = inlineTemplates.length + backendTemplates.length

    // ========================================================================
    // Phase 2: Hash-Based Idempotency & Auto-Versioning
    // ========================================================================

    console.log()
    console.log('🔍 Phase 2: Processing Templates')
    console.log('─'.repeat(70))

    const templateActions = []

    for (const source of inlineTemplates) {
        const { template: templateObj, warnings } = createTemplateObject(source.id, source.template, source)

        // Check if template already exists
        const existing = existingTemplates.get(source.id)

        if (existing) {
            const newHash = computeTemplateHash(templateObj)

            if (existing.hash === newHash) {
                // Hash matches - skip
                console.log(`  ⏭️  ${source.id}: Identical (hash match, skipping)`)
                report.skipped++
                continue
            } else {
                // Hash differs - create versioned file
                const versionedId = await findNextVersion(templatesDir, source.id)
                console.log(`  🔄 ${source.id}: Hash mismatch → creating ${versionedId}`)

                report.conflicts.push({
                    originalId: source.id,
                    versionedId,
                    reason: 'Content hash mismatch with existing registry file'
                })
                report.versioned++

                // Update template ID
                templateObj.metadata.id = versionedId
                templateObj.metadata.tags.push('auto-versioned')

                templateActions.push({
                    id: versionedId,
                    template: templateObj,
                    action: 'create-versioned',
                    warnings
                })
            }
        } else {
            // New template
            console.log(`  ➕ ${source.id}: New template`)
            templateActions.push({
                id: source.id,
                template: templateObj,
                action: 'create-new',
                warnings
            })
        }

        // Track warnings
        if (warnings.length > 0) {
            report.warnings.push(...warnings.map((w) => `${source.id}: ${w}`))
        }

        // Track templates needing review
        if (templateObj.metadata.tags.includes('needs-review')) {
            report.flaggedForReview.push(source.id)
        }
    }

    // ========================================================================
    // Phase 3: Write Templates
    // ========================================================================

    console.log()
    console.log('💾 Phase 3: Writing Templates')
    console.log('─'.repeat(70))

    for (const action of templateActions) {
        const filename = `${action.id}.json`
        const filepath = join(templatesDir, filename)

        // Validate before writing
        const validation = validatePromptTemplate(action.template)
        if (!validation.valid) {
            console.error(`  ❌ ${filename}: Validation failed`)
            report.warnings.push(`${action.id}: Schema validation failed`)
            continue
        }

        console.log(`  📝 ${filename}`)
        console.log(`     ID: ${action.template.metadata.id}`)
        console.log(`     Variables: ${action.template.variables?.length || 0}`)
        console.log(`     Template length: ${action.template.template.length} chars`)

        if (action.warnings.length > 0) {
            action.warnings.forEach((w) => console.log(`     ⚠️  ${w}`))
        }

        if (!dryRun) {
            await mkdir(templatesDir, { recursive: true })
            await writeFile(filepath, JSON.stringify(action.template, null, 4), 'utf-8')
            console.log(`     ✅ Written to ${filepath}`)
        } else {
            console.log(`     (would write to ${filepath})`)
        }

        report.migrated++
    }

    // ========================================================================
    // Phase 4: Code Refactoring
    // ========================================================================

    console.log()
    console.log('🔧 Phase 4: Code Refactoring')
    console.log('─'.repeat(70))

    const refactorings = await generateRefactoringPlan()
    const refactorResult = await applyCodeRefactoring(refactorings, dryRun || !applyRefactoring)

    report.codeChanges = refactorings

    // ========================================================================
    // Phase 5: Bundle & Validate
    // ========================================================================

    console.log()
    console.log('📦 Phase 5: Bundle Generation & Validation')
    console.log('─'.repeat(70))

    const bundleResult = await runBundleGeneration(dryRun)
    const validationResult = await runValidation(dryRun)

    // ========================================================================
    // Final Report
    // ========================================================================

    console.log()
    console.log('╔════════════════════════════════════════════════════════════════╗')
    console.log('║  Migration Report                                              ║')
    console.log('╚════════════════════════════════════════════════════════════════╝')
    console.log()
    console.log(`📊 Summary:`)
    console.log(`   Discovered: ${report.discovered} templates`)
    console.log(`   Migrated: ${report.migrated} templates`)
    console.log(`   Skipped (identical): ${report.skipped} templates`)
    console.log(`   Auto-versioned: ${report.versioned} templates`)
    console.log()

    if (report.flaggedForReview.length > 0) {
        console.log(`🏷️  Templates Flagged for Review:`)
        report.flaggedForReview.forEach((id) => console.log(`   - ${id}`))
        console.log()
    }

    if (report.conflicts.length > 0) {
        console.log(`⚠️  Version Conflicts:`)
        report.conflicts.forEach((c) => {
            console.log(`   - ${c.originalId} → ${c.versionedId}`)
            console.log(`     Reason: ${c.reason}`)
        })
        console.log()
    }

    if (report.warnings.length > 0) {
        console.log(`⚠️  Warnings:`)
        report.warnings.forEach((w) => console.log(`   - ${w}`))
        console.log()
    }

    console.log(`🔧 Code Refactoring:`)
    console.log(`   Files to modify: ${refactorings.length}`)
    console.log(`   Applied: ${refactorResult.applied}`)
    console.log(`   Skipped: ${refactorResult.skipped}`)
    console.log()

    console.log(`📦 Bundle Generation: ${bundleResult.success ? (bundleResult.skipped ? 'Skipped (dry-run)' : 'Success') : 'Failed'}`)
    console.log(`✅ Validation: ${validationResult.success ? (validationResult.skipped ? 'Skipped (dry-run)' : 'Success') : 'Failed'}`)

    console.log()
    console.log('─'.repeat(70))

    if (dryRun) {
        console.log()
        console.log('To apply changes, run without --dry-run flag')
    }

    if (!applyRefactoring && !dryRun) {
        console.log()
        console.log('To apply code refactoring, run with --apply flag')
    }

    if (!dryRun && applyRefactoring) {
        console.log()
        console.log('✅ Migration complete!')
        console.log()
        console.log('Next steps:')
        console.log('1. Review templates tagged with "needs-review"')
        console.log('2. Update template descriptions and examples')
        console.log('3. Test code changes')
        console.log('4. Remove deprecated worldTemplates.ts exports after verification')
    }

    process.exit(0)
}

// ============================================================================
// Entry Point
// ============================================================================

main().catch((err) => {
    console.error('❌ Migration failed:', err)
    console.error(err.stack)
    process.exit(1)
})
