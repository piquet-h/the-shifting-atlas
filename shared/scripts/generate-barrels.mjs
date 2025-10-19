#!/usr/bin/env node
/**
 * Barrel generation script (idempotent) for @piquet-h/shared.
 * Keeps per-directory index.ts files in sync so exports stay close to implementations.
 *
 * Rules:
 * - Only generate for allowListed directories.
 * - Exclude files matching: *.test.ts, *.spec.ts, *.d.ts, *.cosmos.ts (internal variants), index.ts itself.
 * - Output uses explicit export * lines with .js extensions (ESM build target).
 * - Skip rewriting file if content unchanged to avoid unnecessary rebuild cascades.
 */
import { promises as fs } from 'fs'
import path from 'path'

const root = path.resolve(process.cwd(), 'src')
const allowList = ['auth', 'direction', 'gremlin', 'persistence', 'prompts', 'repos', 'secrets', 'seeding']

const excludeRegex = /\.(test|spec)\.ts$/
const internalVariantRegex = /\.cosmos\.ts$/

async function generateForDir(dir) {
    const abs = path.join(root, dir)
    let stat
    try {
        stat = await fs.stat(abs)
    } catch {
        return
    }
    if (!stat.isDirectory()) return

    const entries = await fs.readdir(abs)
    const exportFiles = entries
        .filter((f) => f.endsWith('.ts'))
        .filter((f) => f !== 'index.ts')
        .filter((f) => !excludeRegex.test(f))
        .filter((f) => !f.endsWith('.d.ts'))
        .filter((f) => !internalVariantRegex.test(f))

    if (exportFiles.length === 0) return

    const lines = [
        '// AUTO-GENERATED BARREL: do not edit manually (run scripts/generate-barrels.mjs).',
        '// Only side-effect-free re-exports allowed here.',
        ...exportFiles.sort((a, b) => a.localeCompare(b)).map((f) => `export * from './${f.replace(/\.ts$/, '.js')}'`)
    ]
    const content = lines.join('\n') + '\n'
    const outFile = path.join(abs, 'index.ts')

    let existing = null
    try {
        existing = await fs.readFile(outFile, 'utf8')
    } catch {}
    if (existing === content) {
        return // unchanged
    }
    await fs.writeFile(outFile, content, 'utf8')
    // Intentional informational log (CLI script only)
    console.log(`[barrels] Updated ${dir}/index.ts (${exportFiles.length} exports)`)
}

async function run() {
    await Promise.all(allowList.map(generateForDir))
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
