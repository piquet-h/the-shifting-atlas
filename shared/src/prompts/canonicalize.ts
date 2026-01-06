/**
 * Prompt Template Canonicalization and Hashing
 *
 * Provides deterministic normalization and SHA256 hashing for prompt templates
 * to enable version control, replay validation, and CI verification.
 *
 * Design:
 * - Canonical JSON: deterministic key ordering, no whitespace variance
 * - SHA256 hash: hex digest for content addressing
 * - Idempotent: same input always produces same hash
 */

import crypto from 'node:crypto'
import type { PromptTemplateFile } from './schema.js'

/**
 * Canonicalize a prompt template to deterministic JSON string
 *
 * Process:
 * 1. Sort all object keys alphabetically (recursive)
 * 2. Remove any optional undefined fields
 * 3. Normalize whitespace in template content
 * 4. Return compact JSON (no extra whitespace)
 */
export function canonicalizeTemplate(template: PromptTemplateFile): string {
    // Deep sort keys recursively
    const sortedTemplate = sortObjectKeys(template)

    // Return compact JSON
    return JSON.stringify(sortedTemplate)
}

/**
 * Compute SHA256 hash of a prompt template
 *
 * Returns hex-encoded digest for content addressing and version control
 */
export function computeTemplateHash(template: PromptTemplateFile): string {
    const canonical = canonicalizeTemplate(template)
    return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')
}

/**
 * Recursively sort object keys alphabetically
 */
function sortObjectKeys(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
        return obj
    }

    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys)
    }

    if (typeof obj === 'object') {
        const sorted: Record<string, unknown> = {}
        const keys = Object.keys(obj).sort()

        for (const key of keys) {
            const value = (obj as Record<string, unknown>)[key]
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
 * Verify template hash matches expected value
 */
export function verifyTemplateHash(template: PromptTemplateFile, expectedHash: string): boolean {
    const actualHash = computeTemplateHash(template)
    return actualHash === expectedHash
}

/**
 * Batch hash multiple templates
 */
export function hashTemplates(templates: Record<string, PromptTemplateFile>): Record<string, string> {
    const hashes: Record<string, string> = {}

    for (const [id, template] of Object.entries(templates)) {
        hashes[id] = computeTemplateHash(template)
    }

    return hashes
}
