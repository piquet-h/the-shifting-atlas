/**
 * Content hash utilities for revision tracking.
 * Used to detect changes in location/entity content to manage version numbers.
 */
import crypto from 'crypto'

/**
 * Compute a deterministic hash of location/entity content.
 * Hash includes name, description, and sorted tags to detect meaningful changes.
 * @param name - Entity name
 * @param description - Entity description text
 * @param tags - Optional array of tags
 * @returns SHA-256 hex hash of the content
 */
export function computeContentHash(name: string, description: string, tags?: string[]): string {
    const sortedTags = tags && tags.length > 0 ? [...tags].sort() : []
    const content = JSON.stringify({ name, description, tags: sortedTags })
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}
