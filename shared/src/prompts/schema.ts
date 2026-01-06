/**
 * Prompt Template Schema (Zod validation)
 *
 * Authoritative schema for prompt template storage and validation.
 * Provides deterministic hashing and CI validation for prompt templates.
 *
 * Design:
 * - File-based authoring in shared/src/prompts/templates/
 * - CI validation using this schema
 * - Runtime loading with optional caching
 * - SHA256 hashing for version control and replay
 */
import { z } from 'zod'

/**
 * Prompt template metadata schema
 */
export const PromptTemplateMetadataSchema = z.object({
    id: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[a-z0-9-_]+$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(1000),
    tags: z.array(z.string()).optional(),
    author: z.string().optional(),
    createdAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime().optional()
})
export type PromptTemplateMetadata = z.infer<typeof PromptTemplateMetadataSchema>

/**
 * Variable definition schema for template interpolation
 */
export const VariableDefinitionSchema = z.object({
    name: z
        .string()
        .min(1)
        .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
    description: z.string().min(1),
    required: z.boolean().default(true),
    defaultValue: z.string().optional()
})
export type VariableDefinition = z.infer<typeof VariableDefinitionSchema>

/**
 * Complete prompt template schema
 */
export const PromptTemplateSchema = z.object({
    metadata: PromptTemplateMetadataSchema,
    template: z.string().min(1).max(50000),
    variables: z.array(VariableDefinitionSchema).optional(),
    examples: z
        .array(
            z.object({
                input: z.record(z.string(), z.string()),
                output: z.string().optional(),
                description: z.string().optional()
            })
        )
        .optional()
})
export type PromptTemplate = z.infer<typeof PromptTemplateSchema>

/**
 * Bundled prompt templates artifact schema
 */
export const PromptBundleSchema = z.object({
    version: z.string(),
    generatedAt: z.string().datetime(),
    templates: z.record(z.string(), PromptTemplateSchema),
    hashes: z.record(z.string(), z.string()) // id -> SHA256 hash
})
export type PromptBundle = z.infer<typeof PromptBundleSchema>

/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean
    errors?: z.ZodError
    template?: PromptTemplate
}

/**
 * Validate a prompt template object
 */
export function validatePromptTemplate(data: unknown): ValidationResult {
    const result = PromptTemplateSchema.safeParse(data)
    if (result.success) {
        return { valid: true, template: result.data }
    }
    return { valid: false, errors: result.error }
}

/**
 * Validate a prompt bundle
 */
export function validatePromptBundle(data: unknown): { valid: boolean; errors?: z.ZodError; bundle?: PromptBundle } {
    const result = PromptBundleSchema.safeParse(data)
    if (result.success) {
        return { valid: true, bundle: result.data }
    }
    return { valid: false, errors: result.error }
}

/**
 * Protected token patterns that should fail validation (secrets)
 */
export const PROTECTED_TOKEN_PATTERNS = [
    /api[_-]?key/i,
    /secret/i,
    /password/i,
    /token/i,
    /credential/i,
    /-----BEGIN.*PRIVATE KEY-----/,
    /sk-[a-zA-Z0-9]{48}/ // OpenAI API keys (exact format)
]

/**
 * Check if template contains protected tokens (secrets)
 */
export function containsProtectedTokens(template: string): boolean {
    return PROTECTED_TOKEN_PATTERNS.some((pattern) => pattern.test(template))
}
