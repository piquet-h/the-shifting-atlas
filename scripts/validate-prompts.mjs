#!/usr/bin/env node
/**
 * Prompt Template Validation Script
 *
 * Validates all prompt templates in shared/src/prompts/templates/
 * Checks:
 * - Valid JSON schema
 * - No protected tokens (secrets)
 * - Proper file naming (id.json)
 * - Hash computation for CI artifacts
 *
 * Exit codes:
 * 0 - All validations passed
 * 1 - Validation errors found
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Import from shared package (built)
const sharedPath = join(__dirname, '..', 'shared', 'dist', 'prompts')

async function main() {
    const templatesDir = join(__dirname, '..', 'shared', 'src', 'prompts', 'templates')

    console.log('Validating prompt templates in:', templatesDir)
    console.log()

    let errors = 0
    let warnings = 0
    let validated = 0

    try {
        const files = await readdir(templatesDir)
        const jsonFiles = files.filter((f) => f.endsWith('.json'))

        if (jsonFiles.length === 0) {
            console.warn('⚠️  No template files found')
            warnings++
        }

        // Dynamic import after checking directory
        const { validatePromptTemplate, containsProtectedTokens } = await import(
            join(sharedPath, 'schema.js')
        )
        const { computeTemplateHash } = await import(join(sharedPath, 'canonicalize.js'))

        for (const file of jsonFiles) {
            const filePath = join(templatesDir, file)
            const content = await readFile(filePath, 'utf-8')

            let data
            try {
                data = JSON.parse(content)
            } catch (err) {
                console.error(`❌ ${file}: Invalid JSON`)
                console.error(`   ${err.message}`)
                errors++
                continue
            }

            // Validate schema
            const result = validatePromptTemplate(data)
            if (!result.valid) {
                console.error(`❌ ${file}: Schema validation failed`)
                if (result.errors) {
                    for (const issue of result.errors.issues) {
                        console.error(`   - ${issue.path.join('.')}: ${issue.message}`)
                    }
                }
                errors++
                continue
            }

            const template = result.template
            if (!template) {
                console.error(`❌ ${file}: Template is null after validation`)
                errors++
                continue
            }

            // Verify filename matches ID
            const expectedFilename = `${template.metadata.id}.json`
            if (file !== expectedFilename) {
                console.error(`❌ ${file}: Filename must match template ID (expected: ${expectedFilename})`)
                errors++
                continue
            }

            // Check for protected tokens
            if (containsProtectedTokens(template.template)) {
                console.error(`❌ ${file}: Contains protected tokens (secrets detected)`)
                errors++
                continue
            }

            // Compute hash
            const hash = computeTemplateHash(template)

            console.log(
                `✅ ${file}: Valid (v${template.metadata.version}, hash: ${hash.substring(0, 12)}...)`
            )
            validated++
        }

        console.log()
        console.log(`Validation complete:`)
        console.log(`  ✅ Validated: ${validated}`)
        if (warnings > 0) console.log(`  ⚠️  Warnings: ${warnings}`)
        if (errors > 0) console.log(`  ❌ Errors: ${errors}`)

        process.exit(errors > 0 ? 1 : 0)
    } catch (err) {
        console.error('Fatal error during validation:', err)
        process.exit(1)
    }
}

main()
