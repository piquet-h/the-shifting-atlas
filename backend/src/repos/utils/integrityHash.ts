/**
 * Integrity hash utilities for description corruption detection.
 * Uses SHA-256 to compute deterministic hashes of description content.
 */
import crypto from 'crypto'

/**
 * Compute SHA-256 integrity hash of description content.
 * The hash is computed from the content field only (not metadata like timestamps).
 * This allows detection of content corruption while ignoring metadata changes.
 * @param content - Description layer content text
 * @returns SHA-256 hex hash of the content
 */
export function computeIntegrityHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

/**
 * Verify if a description's content matches its stored integrity hash.
 * @param content - Current description content
 * @param storedHash - Previously stored integrity hash
 * @returns true if hashes match, false if mismatch detected
 */
export function verifyIntegrityHash(content: string, storedHash: string): boolean {
    const currentHash = computeIntegrityHash(content)
    return currentHash === storedHash
}
