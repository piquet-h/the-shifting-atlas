/**
 * Prompt Template Registry Types
 *
 * Defines the core types for prompt template storage, retrieval, and versioning.
 * Templates are identified by id, version, and content hash for deterministic behavior.
 */

/**
 * A versioned prompt template with content and integrity hash
 */
export interface PromptTemplate {
    /** Unique identifier for the template (e.g., 'location', 'npc_dialogue') */
    id: string
    /** Semantic version string (e.g., '1.0.0') */
    version: string
    /** The actual prompt template content */
    content: string
    /** SHA256 hash of the content for integrity verification */
    hash: string
    /** Template metadata */
    metadata?: PromptTemplateMetadata
}

/**
 * Optional metadata for a prompt template
 */
export interface PromptTemplateMetadata {
    /** Human-readable description */
    description?: string
    /** Tags for categorization/search */
    tags?: string[]
    /** Author/creator */
    author?: string
    /** Creation timestamp */
    createdAt?: string
    /** Last update timestamp */
    updatedAt?: string
}

/**
 * Query options for retrieving a prompt template
 */
export interface PromptTemplateQuery {
    /** Template ID (required) */
    id: string
    /** Specific version to retrieve (optional, defaults to latest) */
    version?: string
    /** Content hash to verify (optional) */
    hash?: string
}

/**
 * Repository interface for prompt template storage and retrieval
 */
export interface IPromptTemplateRepository {
    /**
     * Get the latest version of a template by ID
     * @param id - Template identifier
     * @returns The template or undefined if not found
     */
    getLatest(id: string): Promise<PromptTemplate | undefined>

    /**
     * Get a specific version of a template
     * @param id - Template identifier
     * @param version - Version string
     * @returns The template or undefined if not found
     */
    getByVersion(id: string, version: string): Promise<PromptTemplate | undefined>

    /**
     * Get a template by its content hash
     * @param hash - SHA256 hash
     * @returns The template or undefined if not found
     */
    getByHash(hash: string): Promise<PromptTemplate | undefined>

    /**
     * Get a template using flexible query options
     * @param query - Query options
     * @returns The template or undefined if not found
     */
    get(query: PromptTemplateQuery): Promise<PromptTemplate | undefined>

    /**
     * List all available template IDs
     * @returns Array of template identifiers
     */
    listIds(): Promise<string[]>
}

/**
 * Cache configuration for in-memory caching
 */
export interface PromptCacheConfig {
    /** Time-to-live in milliseconds (default: 5 minutes) */
    ttlMs?: number
    /** Maximum cache size (default: 100 entries) */
    maxSize?: number
}
