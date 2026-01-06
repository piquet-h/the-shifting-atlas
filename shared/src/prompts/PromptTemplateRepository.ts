/**
 * In-Memory Prompt Template Repository
 *
 * Provides cached access to prompt templates loaded from worldTemplates.ts
 * Supports retrieval by id, version, and content hash with TTL-based caching.
 */

import { computeContentHash } from './hash.js'
import type { IPromptTemplateRepository, PromptTemplate, PromptTemplateQuery, PromptCacheConfig } from './types.js'
import { getWorldTemplate, type WorldPromptKey } from './worldTemplates.js'

/**
 * Cache entry with TTL tracking
 */
interface CacheEntry {
    template: PromptTemplate
    expiresAt: number
}

/**
 * In-memory implementation of prompt template repository
 *
 * Loads templates from worldTemplates.ts and provides caching with configurable TTL.
 * This is a simple implementation suitable for the current file-based storage approach.
 */
export class PromptTemplateRepository implements IPromptTemplateRepository {
    private cache = new Map<string, CacheEntry>()
    private hashIndex = new Map<string, string>() // hash -> cache key
    private config: Required<PromptCacheConfig>

    constructor(config: PromptCacheConfig = {}) {
        this.config = {
            ttlMs: config.ttlMs ?? 5 * 60 * 1000, // 5 minutes default
            maxSize: config.maxSize ?? 100
        }
    }

    async getLatest(id: string): Promise<PromptTemplate | undefined> {
        return this.get({ id })
    }

    async getByVersion(id: string, version: string): Promise<PromptTemplate | undefined> {
        return this.get({ id, version })
    }

    async getByHash(hash: string): Promise<PromptTemplate | undefined> {
        // Check if we have this hash in the index
        const cacheKey = this.hashIndex.get(hash)
        if (cacheKey) {
            const entry = this.cache.get(cacheKey)
            if (entry && entry.expiresAt > Date.now()) {
                return entry.template
            }
            // Expired, remove from cache
            if (entry) {
                this.cache.delete(cacheKey)
                this.hashIndex.delete(hash)
            }
        }

        // Hash not in cache, would need to scan all templates
        // For now, return undefined (could be optimized with a persistent hash index)
        return undefined
    }

    async get(query: PromptTemplateQuery): Promise<PromptTemplate | undefined> {
        // Generate cache key
        const cacheKey = this.makeCacheKey(query.id, query.version)

        // Check cache first
        const cached = this.getFromCache(cacheKey)
        if (cached) {
            // If hash specified, verify it matches
            if (query.hash && cached.hash !== query.hash) {
                return undefined
            }
            return cached
        }

        // Load template (currently only supports WorldPromptKey types)
        const template = this.loadTemplate(query.id, query.version)
        if (!template) {
            return undefined
        }

        // If hash specified, verify it matches
        if (query.hash && template.hash !== query.hash) {
            return undefined
        }

        // Store in cache
        this.putInCache(cacheKey, template)

        return template
    }

    async listIds(): Promise<string[]> {
        // Return known template IDs from worldTemplates
        return ['location', 'npc_dialogue', 'quest']
    }

    /**
     * Load a template from worldTemplates.ts
     */
    private loadTemplate(id: string, version?: string): PromptTemplate | undefined {
        // Currently we only have version 1.0.0 for all templates
        // Future: support multiple versions
        if (version && version !== '1.0.0') {
            return undefined
        }

        // Map id to WorldPromptKey
        if (!this.isValidWorldPromptKey(id)) {
            return undefined
        }

        try {
            const content = getWorldTemplate(id as WorldPromptKey)
            const hash = computeContentHash(content)

            return {
                id,
                version: version || '1.0.0',
                content,
                hash,
                metadata: {
                    description: `World generation template for ${id}`,
                    tags: ['world', 'generation', id],
                    createdAt: new Date().toISOString()
                }
            }
        } catch {
            return undefined
        }
    }

    /**
     * Type guard for WorldPromptKey
     */
    private isValidWorldPromptKey(id: string): id is WorldPromptKey {
        return id === 'location' || id === 'npc_dialogue' || id === 'quest'
    }

    /**
     * Generate cache key from id and version
     */
    private makeCacheKey(id: string, version?: string): string {
        return version ? `${id}@${version}` : `${id}@latest`
    }

    /**
     * Get template from cache if not expired
     */
    private getFromCache(cacheKey: string): PromptTemplate | undefined {
        const entry = this.cache.get(cacheKey)
        if (!entry) {
            return undefined
        }

        if (entry.expiresAt <= Date.now()) {
            // Expired, remove from cache
            this.cache.delete(cacheKey)
            this.hashIndex.delete(entry.template.hash)
            return undefined
        }

        return entry.template
    }

    /**
     * Put template in cache with TTL
     */
    private putInCache(cacheKey: string, template: PromptTemplate): void {
        // Enforce max size (simple LRU: remove oldest if full)
        if (this.cache.size >= this.config.maxSize) {
            const firstKey = this.cache.keys().next().value
            if (firstKey) {
                const entry = this.cache.get(firstKey)
                if (entry) {
                    this.hashIndex.delete(entry.template.hash)
                }
                this.cache.delete(firstKey)
            }
        }

        const entry: CacheEntry = {
            template,
            expiresAt: Date.now() + this.config.ttlMs
        }

        this.cache.set(cacheKey, entry)
        this.hashIndex.set(template.hash, cacheKey)
    }

    /**
     * Clear all cached templates (useful for testing)
     */
    clearCache(): void {
        this.cache.clear()
        this.hashIndex.clear()
    }
}
