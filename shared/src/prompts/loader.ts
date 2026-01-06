/**
 * Prompt Template Runtime Loader
 *
 * Loads and caches prompt templates from bundled artifacts or individual files.
 * Provides getById, getLatest, and getByHash methods with optional TTL caching.
 *
 * Design:
 * - Load from prompts.bundle.json artifact (preferred) or individual files
 * - In-memory LRU cache with configurable TTL
 * - Lazy loading by ID to handle large template sets
 * - Hash verification for integrity
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import type { PromptTemplate, PromptBundle } from './schema.js'
import { validatePromptTemplate, validatePromptBundle } from './schema.js'
import { computeTemplateHash } from './canonicalize.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Cache entry with TTL
 */
interface CacheEntry {
    template: PromptTemplate
    hash: string
    loadedAt: number
}

/**
 * Loader configuration
 */
export interface PromptLoaderConfig {
    /**
     * Path to bundle file (prompts.bundle.json) or templates directory
     * Defaults to templates/ subdirectory
     */
    source?: 'bundle' | 'files'

    /**
     * Base path for loading templates
     */
    basePath?: string

    /**
     * Cache TTL in milliseconds (0 = no caching, -1 = forever)
     * Default: 5 minutes
     */
    cacheTtlMs?: number

    /**
     * Maximum cache size (number of templates)
     * Default: 100
     */
    maxCacheSize?: number

    /**
     * Verify hashes on load
     * Default: false (can be enabled explicitly)
     */
    verifyHashes?: boolean
}

/**
 * Prompt template loader with caching
 */
export class PromptLoader {
    private config: Required<PromptLoaderConfig>
    private cache: Map<string, CacheEntry> = new Map()
    private bundle?: PromptBundle

    constructor(config: PromptLoaderConfig = {}) {
        this.config = {
            source: config.source ?? 'files',
            basePath: config.basePath ?? join(__dirname, 'templates'),
            cacheTtlMs: config.cacheTtlMs ?? 5 * 60 * 1000, // 5 minutes
            maxCacheSize: config.maxCacheSize ?? 100,
            verifyHashes: config.verifyHashes ?? (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production')
        }
    }

    /**
     * Get template by ID
     */
    async getById(id: string): Promise<PromptTemplate | null> {
        // Check cache first
        const cached = this.getCached(id)
        if (cached) {
            return cached.template
        }

        // Load template
        let template: PromptTemplate | null = null

        if (this.config.source === 'bundle') {
            template = await this.loadFromBundle(id)
        } else {
            template = await this.loadFromFile(id)
        }

        if (!template) {
            return null
        }

        // Verify and cache
        const hash = computeTemplateHash(template)
        this.addToCache(id, template, hash)

        return template
    }

    /**
     * Get latest version of template by ID prefix
     * (finds highest semver version with exact prefix match before delimiter)
     *
     * Note: Prefix matching looks for templates starting with `idPrefix` followed
     * by a delimiter (-) or end of string. This prevents ambiguous matches.
     * Example: prefix 'user' matches 'user' and 'user-v2' but not 'user-profile'
     */
    async getLatest(idPrefix: string): Promise<PromptTemplate | null> {
        if (this.config.source === 'bundle') {
            return this.getLatestFromBundle(idPrefix)
        } else {
            return this.getLatestFromFiles(idPrefix)
        }
    }

    /**
     * Get template by hash (content-addressed lookup)
     */
    async getByHash(hash: string): Promise<PromptTemplate | null> {
        // Check cache first
        for (const entry of this.cache.values()) {
            if (entry.hash === hash) {
                if (this.isEntryValid(entry)) {
                    return entry.template
                }
            }
        }

        // If bundle loaded, search it
        if (this.bundle) {
            for (const [id, templateHash] of Object.entries(this.bundle.hashes)) {
                if (templateHash === hash) {
                    return this.getById(id)
                }
            }
        }

        // TODO: For file-based source, would need to hash all files
        // For now, return null (caller should use getById then verify hash)
        return null
    }

    /**
     * Preload bundle into memory
     */
    async preloadBundle(): Promise<void> {
        if (this.config.source === 'bundle' && !this.bundle) {
            const bundlePath = join(this.config.basePath, 'prompts.bundle.json')
            const content = await readFile(bundlePath, 'utf-8')
            const data = JSON.parse(content)

            const result = validatePromptBundle(data)
            if (!result.valid || !result.bundle) {
                throw new Error(`Invalid bundle at ${bundlePath}`)
            }

            this.bundle = result.bundle
        }
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.cache.clear()
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; maxSize: number; hitRate?: number } {
        return {
            size: this.cache.size,
            maxSize: this.config.maxCacheSize
        }
    }

    // Private methods

    private getCached(id: string): CacheEntry | null {
        const entry = this.cache.get(id)
        if (!entry) {
            return null
        }

        if (!this.isEntryValid(entry)) {
            this.cache.delete(id)
            return null
        }

        return entry
    }

    private isEntryValid(entry: CacheEntry): boolean {
        if (this.config.cacheTtlMs === -1) {
            return true
        }

        if (this.config.cacheTtlMs === 0) {
            return false
        }

        const age = Date.now() - entry.loadedAt
        return age < this.config.cacheTtlMs
    }

    private addToCache(id: string, template: PromptTemplate, hash: string): void {
        if (this.config.cacheTtlMs === 0) {
            return // Caching disabled
        }

        // Evict oldest if at capacity
        if (this.cache.size >= this.config.maxCacheSize) {
            const firstKey = this.cache.keys().next().value
            if (firstKey) {
                this.cache.delete(firstKey)
            }
        }

        this.cache.set(id, {
            template,
            hash,
            loadedAt: Date.now()
        })
    }

    private async loadFromBundle(id: string): Promise<PromptTemplate | null> {
        if (!this.bundle) {
            await this.preloadBundle()
        }

        if (!this.bundle) {
            return null
        }

        const template = this.bundle.templates[id]
        if (!template) {
            return null
        }

        // Verify hash if enabled
        if (this.config.verifyHashes) {
            const expectedHash = this.bundle.hashes[id]
            const actualHash = computeTemplateHash(template)
            if (expectedHash !== actualHash) {
                throw new Error(`Hash mismatch for template ${id}`)
            }
        }

        return template
    }

    private async loadFromFile(id: string): Promise<PromptTemplate | null> {
        try {
            const filePath = join(this.config.basePath, `${id}.json`)
            const content = await readFile(filePath, 'utf-8')
            const data = JSON.parse(content)

            const result = validatePromptTemplate(data)
            if (!result.valid || !result.template) {
                throw new Error(`Invalid template at ${filePath}`)
            }

            return result.template
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                return null
            }
            throw err
        }
    }

    private async getLatestFromBundle(idPrefix: string): Promise<PromptTemplate | null> {
        if (!this.bundle) {
            await this.preloadBundle()
        }

        if (!this.bundle) {
            return null
        }

        // Find all templates matching prefix
        // Match exact prefix or prefix followed by delimiter
        const matching = Object.keys(this.bundle.templates).filter((id) => {
            if (id === idPrefix) return true
            if (id.startsWith(idPrefix + '-')) return true
            return false
        })

        if (matching.length === 0) {
            return null
        }

        // Sort by semver (proper version comparison)
        matching.sort((a, b) => {
            const aVersion = this.bundle!.templates[a].metadata.version
            const bVersion = this.bundle!.templates[b].metadata.version
            return this.compareSemver(bVersion, aVersion) // Descending
        })

        return this.getById(matching[0])
    }

    /**
     * Compare two semver strings
     * Returns: >0 if a > b, <0 if a < b, 0 if equal
     */
    private compareSemver(a: string, b: string): number {
        const aParts = a.split('.').map(Number)
        const bParts = b.split('.').map(Number)

        for (let i = 0; i < 3; i++) {
            const diff = (aParts[i] || 0) - (bParts[i] || 0)
            if (diff !== 0) {
                return diff
            }
        }

        return 0
    }

    private async getLatestFromFiles(idPrefix: string): Promise<PromptTemplate | null> {
        // File-based getLatest is not currently supported
        // This would require scanning the filesystem for matching files and comparing versions
        // For production use, prefer bundle mode which supports this feature
        throw new Error(`getLatest is not supported in file-based mode (prefix: ${idPrefix}). Use bundle mode or getById instead.`)
    }
}

/**
 * Default singleton loader instance
 */
let defaultLoader: PromptLoader | undefined

/**
 * Get default loader instance
 */
export function getDefaultLoader(config?: PromptLoaderConfig): PromptLoader {
    if (!defaultLoader) {
        defaultLoader = new PromptLoader(config)
    }
    return defaultLoader
}

/**
 * Reset default loader (for testing)
 */
export function resetDefaultLoader(): void {
    defaultLoader = undefined
}
