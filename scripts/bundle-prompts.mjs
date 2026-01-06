#!/usr/bin/env node
/**
 * Prompt Template Bundler Script
 *
 * Packages all prompt templates into a single prompts.bundle.json artifact
 * for runtime consumption. Includes:
 * - All templates from shared/src/prompts/templates/
 * - Computed SHA256 hashes for integrity
 * - Bundle metadata (version, generation timestamp)
 *
 * Output: shared/dist/prompts/prompts.bundle.json
 *
 * Usage:
 *   node scripts/bundle-prompts.mjs [--output <path>]
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Import from shared package (built)
const sharedPath = join(__dirname, '..', 'shared', 'dist', 'prompts')

async function main() {
    const args = process.argv.slice(2)
    let outputPath = join(__dirname, '..', 'shared', 'dist', 'prompts', 'prompts.bundle.json')

    // Parse args
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--output' && i + 1 < args.length) {
            outputPath = args[i + 1]
            i++
        }
    }

    const templatesDir = join(__dirname, '..', 'shared', 'src', 'prompts', 'templates')

    console.log('Bundling prompt templates from:', templatesDir)
    console.log('Output:', outputPath)
    console.log()

    try {
        const files = await readdir(templatesDir)
        const jsonFiles = files.filter((f) => f.endsWith('.json'))

        if (jsonFiles.length === 0) {
            console.warn('⚠️  No template files found')
            process.exit(1)
        }

        // Dynamic import
        const { validatePromptTemplate } = await import(join(sharedPath, 'schema.js'))
        const { computeTemplateHash } = await import(join(sharedPath, 'canonicalize.js'))

        const templates = {}
        const hashes = {}
        let count = 0

        for (const file of jsonFiles) {
            const filePath = join(templatesDir, file)
            const content = await readFile(filePath, 'utf-8')
            const data = JSON.parse(content)

            const result = validatePromptTemplate(data)
            if (!result.valid || !result.template) {
                console.error(`❌ ${file}: Validation failed`)
                process.exit(1)
            }

            const template = result.template
            const hash = computeTemplateHash(template)
            const id = template.metadata.id

            templates[id] = template
            hashes[id] = hash

            console.log(`📦 ${file}: ${id} (hash: ${hash.substring(0, 12)}...)`)
            count++
        }

        const bundle = {
            version: '1.0.0',
            generatedAt: new Date().toISOString(),
            templates,
            hashes
        }

        // Ensure output directory exists
        await mkdir(dirname(outputPath), { recursive: true })

        // Write bundle
        await writeFile(outputPath, JSON.stringify(bundle, null, 2), 'utf-8')

        console.log()
        console.log(`✅ Bundle created: ${count} templates`)
        console.log(`   Output: ${outputPath}`)
        console.log(`   Size: ${JSON.stringify(bundle).length} bytes`)

        process.exit(0)
    } catch (err) {
        console.error('Fatal error during bundling:', err)
        process.exit(1)
    }
}

main()
