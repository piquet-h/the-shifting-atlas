#!/usr/bin/env node

/**
 * @file verify-workbooks.mjs
 * @description Verifies that committed workbook files match current export state.
 *
 * Purpose:
 * - Prevent drift between Azure workbook definitions and version-controlled files
 * - Run manually or in CI to catch uncommitted workbook changes
 *
 * Usage:
 *   node scripts/observability/verify-workbooks.mjs
 *
 * Exit Codes:
 *   0 - All workbooks match committed state
 *   1 - Drift detected (re-export needed)
 *
 * Edge Cases:
 * - Missing committed file: treated as drift
 * - Workbook with placeholder ID: skipped from verification
 *
 * Risk: LOW (verification only, no mutations)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '../..');

// Configuration paths
const INDEX_PATH = join(ROOT_DIR, 'docs/observability/workbooks-index.json');
const SOURCE_DIR = join(ROOT_DIR, 'infrastructure/workbooks');
const OUTPUT_DIR = join(ROOT_DIR, 'docs/observability/workbooks');

/**
 * Normalize workbook for comparison (same logic as export)
 */
function normalizeWorkbook(workbookObj, slug) {
    const normalized = {
        version: workbookObj.version || 'Notebook/1.0',
        items: workbookObj.items || [],
    };

    normalized._exportMetadata = {
        slug,
        exportedAt: new Date().toISOString().split('T')[0],
        note: 'This file is auto-generated from Azure Application Insights workbook. Do not edit directly. Use scripts/observability/export-workbooks.mjs to update.',
    };

    return normalized;
}

/**
 * Verify a single workbook
 */
function verifyWorkbook(workbookConfig) {
    const { id, name, slug } = workbookConfig;

    console.log(`\nVerifying workbook: ${name} (${slug})`);

    // Skip placeholder IDs
    if (id.startsWith('placeholder-')) {
        console.log(`  ⊘ Skipped (placeholder ID)`);
        return { match: true, skipped: true };
    }

    // Check if source exists
    const sourceFile = join(SOURCE_DIR, `${slug}.workbook.json`);
    if (!existsSync(sourceFile)) {
        console.error(`  ✗ Source file not found: ${sourceFile}`);
        return { match: false, skipped: false };
    }

    // Check if committed file exists
    const committedFile = join(OUTPUT_DIR, `${slug}.workbook.json`);
    if (!existsSync(committedFile)) {
        console.error(`  ✗ Committed file not found: ${committedFile}`);
        console.error(`     Run 'node scripts/observability/export-workbooks.mjs' to create it.`);
        return { match: false, skipped: false };
    }

    try {
        // Read and normalize source
        const sourceContent = readFileSync(sourceFile, 'utf8');
        const sourceObj = JSON.parse(sourceContent);
        const normalizedSource = normalizeWorkbook(sourceObj, slug);

        // Read committed
        const committedContent = readFileSync(committedFile, 'utf8');
        const committedObj = JSON.parse(committedContent);

        // Compare (excluding _exportMetadata.exportedAt which changes daily)
        const sourceForComparison = JSON.parse(JSON.stringify(normalizedSource));
        const committedForComparison = JSON.parse(JSON.stringify(committedObj));

        // Remove exportedAt from both for comparison
        if (sourceForComparison._exportMetadata) {
            delete sourceForComparison._exportMetadata.exportedAt;
        }
        if (committedForComparison._exportMetadata) {
            delete committedForComparison._exportMetadata.exportedAt;
        }

        const sourceStr = JSON.stringify(sourceForComparison, null, 2);
        const committedStr = JSON.stringify(committedForComparison, null, 2);

        if (sourceStr === committedStr) {
            console.log(`  ✓ Match`);
            return { match: true, skipped: false };
        } else {
            console.error(`  ✗ Drift detected`);
            console.error(`     Current source differs from committed file.`);
            console.error(`     Run 'node scripts/observability/export-workbooks.mjs' to sync.`);
            return { match: false, skipped: false };
        }
    } catch (error) {
        console.error(`  ✗ Error verifying: ${error.message}`);
        return { match: false, skipped: false };
    }
}

/**
 * Main execution
 */
function main() {
    console.log('Application Insights Workbook Verification Tool\n');
    console.log('================================================\n');

    // Read index configuration
    if (!existsSync(INDEX_PATH)) {
        console.error(`✗ Error: Configuration file not found: ${INDEX_PATH}`);
        process.exit(1);
    }

    let indexConfig;
    try {
        const indexContent = readFileSync(INDEX_PATH, 'utf8');
        indexConfig = JSON.parse(indexContent);
    } catch (error) {
        console.error('✗ Error reading workbooks index:', error.message);
        process.exit(1);
    }

    const workbooks = indexConfig.workbooks || [];

    if (workbooks.length === 0) {
        console.warn('⚠️  No workbooks defined in index configuration.');
        process.exit(0);
    }

    console.log(`Verifying ${workbooks.length} workbook(s)...\n`);

    // Verify each workbook
    const results = workbooks.map(verifyWorkbook);

    // Summary
    console.log('\n================================================');
    console.log('Verification Summary:');
    console.log('================================================');

    const matched = results.filter((r) => r.match && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const drifted = results.filter((r) => !r.match && !r.skipped).length;

    console.log(`✓ Matched:  ${matched}`);
    console.log(`⊘ Skipped:  ${skipped}`);
    console.log(`✗ Drifted:  ${drifted}`);

    // Exit code
    if (drifted > 0) {
        console.error('\n✗ Drift detected. Re-export needed.');
        process.exit(1);
    } else {
        console.log('\n✓ All workbooks verified successfully.');
        process.exit(0);
    }
}

main();
