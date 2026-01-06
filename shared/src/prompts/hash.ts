/**
 * Content hash utilities for prompt templates
 *
 * Provides deterministic SHA256 hashing for template content
 */

import { createHash } from 'crypto'

/**
 * Compute SHA256 hash of template content
 * @param content - Template content string
 * @returns Hex-encoded SHA256 hash
 */
export function computeTemplateHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Verify that a template's hash matches its content
 * @param content - Template content
 * @param expectedHash - Expected hash value
 * @returns True if hash matches
 */
export function verifyTemplateHash(content: string, expectedHash: string): boolean {
    const actualHash = computeTemplateHash(content)
    return actualHash === expectedHash
}
