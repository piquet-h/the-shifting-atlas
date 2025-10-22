/**
 * Package Boundary Enforcement Test
 *
 * Verifies that shared/src/ maintains domain purity by scanning for disallowed imports.
 * This test ensures the package contract (documented in README.md) is not violated.
 *
 * FORBIDDEN patterns:
 * - Azure SDK imports (@azure/*)
 * - Backend-specific paths (backend/, persistence/, secrets/ implementations)
 * - Direct environment variable access (process.env)
 * - Application Insights telemetry calls
 */

import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'

/** Forbidden import patterns that violate domain purity */
const FORBIDDEN_PATTERNS = [
    // Azure SDKs
    /@azure\/cosmos/,
    /@azure\/keyvault/,
    /@azure\/identity/,
    /@azure\/functions/,
    /@azure\/service-bus/,
    /@azure\/app-configuration/,
    /@azure\/monitor/,

    // Backend-specific paths (relative imports from backend package)
    /from ['"]\.\.\/\.\.\/backend\//,
    /from ['"]backend\//,

    // Direct secret access (should use abstractions)
    /process\.env\./,
    /KeyVaultClient/,
    /SecretClient/,

    // Application Insights direct usage
    /TelemetryClient/,
    /trackEvent\(/,
    /trackTrace\(/
]

/** Allowed exception patterns (legitimate uses that look similar to violations) */
const ALLOWED_EXCEPTIONS = [
    // Type-only imports are fine (no runtime dependency)
    /import type .* from ['"]@azure/,
    // Comments/docs mentioning Azure
    /\/\/.* @azure/,
    /\/\*.* @azure.*\*\//,
    // Gremlin type declaration (placeholder only)
    /declare module ['"]gremlin['"]/
]

async function scanDirectory(dir: string): Promise<string[]> {
    const files: string[] = []
    const entries = await readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
            files.push(...(await scanDirectory(fullPath)))
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            files.push(fullPath)
        }
    }

    return files
}

function checkFileForViolations(content: string, filePath: string): string[] {
    const violations: string[] = []
    const lines = content.split('\n')

    lines.forEach((line, index) => {
        // Skip if line matches an allowed exception
        if (ALLOWED_EXCEPTIONS.some((pattern) => pattern.test(line))) {
            return
        }

        // Check for forbidden patterns
        for (const pattern of FORBIDDEN_PATTERNS) {
            if (pattern.test(line)) {
                violations.push(`${filePath}:${index + 1} - Forbidden pattern: ${pattern.source}\n  ${line.trim()}`)
            }
        }
    })

    return violations
}

test('shared/src maintains domain purity (no backend-specific imports)', async () => {
    const srcDir = join(import.meta.dirname, '../src')
    const files = await scanDirectory(srcDir)

    assert.ok(files.length > 0, 'Should find TypeScript files to scan')

    const allViolations: string[] = []

    for (const file of files) {
        const content = await readFile(file, 'utf-8')
        const violations = checkFileForViolations(content, file)
        allViolations.push(...violations)
    }

    if (allViolations.length > 0) {
        const message = [
            'Package boundary violations detected:',
            '',
            ...allViolations,
            '',
            'See shared/README.md § "Package Contract & Boundary Rules" for details.'
        ].join('\n')

        assert.fail(message)
    }
})

test('gremlin.d.ts is only a type declaration (no runtime code)', async () => {
    const gremlinDts = join(import.meta.dirname, '../src/types/gremlin.d.ts')
    const content = await readFile(gremlinDts, 'utf-8')

    // Should only contain `declare module` and minimal placeholder
    assert.match(content, /declare module ['"]gremlin['"]/)
    assert.ok(!content.includes('import '), 'gremlin.d.ts should not import anything')
    assert.ok(!content.includes('export class'), 'gremlin.d.ts should not export runtime code')
})

test('package.json has no Azure SDK runtime dependencies', async () => {
    const pkgPath = join(import.meta.dirname, '../package.json')
    const pkgJson = JSON.parse(await readFile(pkgPath, 'utf-8'))

    const deps = pkgJson.dependencies || {}
    const azureDeps = Object.keys(deps).filter((dep) => dep.startsWith('@azure/'))

    assert.deepStrictEqual(azureDeps, [], `Found Azure SDK dependencies (should be zero): ${azureDeps.join(', ')}`)
})

test('exports do not leak internal implementation paths', async () => {
    const pkgPath = join(import.meta.dirname, '../package.json')
    const pkgJson = JSON.parse(await readFile(pkgPath, 'utf-8'))

    const exports = pkgJson.exports || {}

    // All export paths should resolve to dist/ (compiled output)
    for (const [key, value] of Object.entries(exports)) {
        if (typeof value === 'object' && value !== null) {
            const paths = Object.values(value as Record<string, string>)
            for (const path of paths) {
                assert.match(path, /^\.\/dist\//, `Export "${key}" should point to dist/, got: ${path}`)
            }
        }
    }
})
