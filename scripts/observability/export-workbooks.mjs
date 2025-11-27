#!/usr/bin/env node

/**
 * @file export-workbooks.mjs
 * @description Exports Application Insights workbook definitions to version-controlled JSON files.
 *
 * Purpose:
 * - Read workbook configuration from docs/observability/workbooks-index.json
 * - Export current workbook definitions from Azure (or use local source files for MVP)
 * - Normalize JSON: remove volatile fields, sort keys, stable formatting
 * - Write to docs/observability/workbooks/<slug>.workbook.json
 *
 * Usage:
 *   node scripts/observability/export-workbooks.mjs
 *
 * Edge Cases:
 * - Missing workbook ID: logs warning and skips
 * - Export failure (one workbook): writes successful others, exits non-zero only if all fail
 * - Workbook renamed: new slug file created, prints reminder to archive old file
 *
 * Risk: LOW (tooling layer, no runtime telemetry events)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT_DIR = join(__dirname, '../..')

// Configuration paths
const INDEX_PATH = join(ROOT_DIR, 'docs/observability/workbooks-index.json')
const SOURCE_DIR = join(ROOT_DIR, 'infrastructure/workbooks')
const OUTPUT_DIR = join(ROOT_DIR, 'docs/observability/workbooks')

/**
 * Normalize workbook JSON to minimize diffs
 * - Remove volatile fields (lastModified, user IDs, etc.)
 * - Sort top-level keys
 * - Stable 2-space indentation
 */
function normalizeWorkbook(workbookObj, slug) {
    // Create a clean copy
    const normalized = {
        version: workbookObj.version || 'Notebook/1.0',
        items: workbookObj.items || []
    }

    // Add metadata comment (not part of Azure schema, but useful for tracking)
    normalized._exportMetadata = {
        slug,
        exportedAt: new Date().toISOString().split('T')[0], // Date only, not timestamp
        note: 'This file is auto-generated from Azure Application Insights workbook. Do not edit directly. Use scripts/observability/export-workbooks.mjs to update.'
    }

    return normalized
}

/**
 * Export a single workbook
 */
function exportWorkbook(workbookConfig) {
    const { id, name, slug } = workbookConfig

    console.log(`\nExporting workbook: ${name} (${slug})`)

    // Check if ID is placeholder
    if (id.startsWith('placeholder-')) {
        console.warn(`⚠️  Warning: Workbook "${name}" has placeholder ID: ${id}`)
        console.warn(`    Skipping export. Update workbooks-index.json with actual Azure workbook resource ID.`)
        return { success: false, skipped: true }
    }

    // For MVP: Read from source directory (infrastructure/workbooks)
    // Accept "local-" prefix for workbooks stored in repo (not yet in Azure)
    // In production: Would call Azure API with workbook ID
    const sourceFile = join(SOURCE_DIR, `${slug}.workbook.json`)

    if (!existsSync(sourceFile)) {
        console.error(`✗ Error: Source file not found: ${sourceFile}`)
        return { success: false, skipped: false }
    }

    try {
        // Read source workbook
        const workbookContent = readFileSync(sourceFile, 'utf8')
        const workbookObj = JSON.parse(workbookContent)

        // Normalize
        const normalized = normalizeWorkbook(workbookObj, slug)

        // Ensure output directory exists
        if (!existsSync(OUTPUT_DIR)) {
            mkdirSync(OUTPUT_DIR, { recursive: true })
        }

        // Write normalized version
        const outputFile = join(OUTPUT_DIR, `${slug}.workbook.json`)
        writeFileSync(outputFile, JSON.stringify(normalized, null, 2) + '\n', 'utf8')

        console.log(`✓ Successfully exported to: ${outputFile}`)
        return { success: true, skipped: false }
    } catch (error) {
        console.error(`✗ Error exporting workbook "${name}":`, error.message)
        return { success: false, skipped: false }
    }
}

/**
 * Check for orphaned workbook files (files in output dir not in index)
 */
function checkForOrphanedFiles(workbookConfigs) {
    if (!existsSync(OUTPUT_DIR)) {
        return
    }

    const indexSlugs = new Set(workbookConfigs.map((w) => w.slug))
    const outputFiles = readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.workbook.json'))

    const orphaned = outputFiles.filter((f) => {
        const slug = f.replace('.workbook.json', '')
        return !indexSlugs.has(slug)
    })

    if (orphaned.length > 0) {
        console.log('\n⚠️  Orphaned workbook files detected:')
        orphaned.forEach((f) => {
            console.log(`    - ${join(OUTPUT_DIR, f)}`)
        })
        console.log('   These files are not in workbooks-index.json. Consider archiving or deleting them.')
    }
}

/**
 * Main execution
 */
function main() {
    console.log('Application Insights Workbook Export Tool\n')
    console.log('==========================================\n')

    // Read index configuration
    if (!existsSync(INDEX_PATH)) {
        console.error(`✗ Error: Configuration file not found: ${INDEX_PATH}`)
        process.exit(1)
    }

    let indexConfig
    try {
        const indexContent = readFileSync(INDEX_PATH, 'utf8')
        indexConfig = JSON.parse(indexContent)
    } catch (error) {
        console.error('✗ Error reading workbooks index:', error.message)
        process.exit(1)
    }

    const workbooks = indexConfig.workbooks || []

    if (workbooks.length === 0) {
        console.warn('⚠️  No workbooks defined in index configuration.')
        process.exit(0)
    }

    console.log(`Found ${workbooks.length} workbook(s) in configuration.\n`)

    // Export each workbook
    const results = workbooks.map(exportWorkbook)

    // Check for orphaned files
    checkForOrphanedFiles(workbooks)

    // Summary
    console.log('\n==========================================')
    console.log('Export Summary:')
    console.log('==========================================')

    const successful = results.filter((r) => r.success).length
    const skipped = results.filter((r) => r.skipped).length
    const failed = results.filter((r) => !r.success && !r.skipped).length

    console.log(`✓ Successful: ${successful}`)
    console.log(`⊘ Skipped:    ${skipped}`)
    console.log(`✗ Failed:     ${failed}`)

    // Exit code
    if (successful === 0 && failed > 0) {
        console.error('\n✗ All exports failed.')
        process.exit(1)
    } else if (failed > 0) {
        console.warn('\n⚠️  Some exports failed.')
        process.exit(1)
    } else if (skipped > 0) {
        console.log('\n⚠️  Some workbooks were skipped (update IDs in workbooks-index.json).')
        process.exit(0)
    } else {
        console.log('\n✓ All workbooks exported successfully.')
        process.exit(0)
    }
}

main()
