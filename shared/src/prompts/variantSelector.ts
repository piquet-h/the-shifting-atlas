/**
 * Prompt Template A/B Testing and Variant Selection
 *
 * Provides deterministic bucketing and variant selection for prompt templates.
 * Supports gradual rollouts, channel-based selection (stable/canary), and
 * reproducible user-to-variant assignment.
 *
 * Design:
 * - Deterministic bucketing using SHA-256 hash of userId + templateId
 * - Variant selection based on rollout percentages
 * - Channel support for environment-specific variants (stable, canary)
 * - Zero-config fallback for missing configurations
 */

import { createHash } from 'node:crypto'

/**
 * Channel types for variant selection
 */
export type VariantChannel = 'stable' | 'canary'

/**
 * Individual variant definition
 */
export interface Variant {
    /** Unique variant identifier */
    id: string
    /** Template ID to use for this variant */
    templateId: string
    /** Rollout percentage (0-100) */
    rolloutPercent: number
    /** Channels where this variant is available (optional, defaults to all) */
    channels?: VariantChannel[]
    /** Variant metadata */
    metadata?: {
        description?: string
        createdAt?: string
        author?: string
    }
}

/**
 * Configuration for a template's variants
 */
export interface VariantConfig {
    /** Base template ID */
    templateId: string
    /** Available variants */
    variants: Variant[]
    /** Default variant ID (fallback) */
    defaultVariant: string
    /** Optional config metadata */
    metadata?: {
        description?: string
        updatedAt?: string
    }
}

/**
 * Result of variant selection
 */
export interface VariantSelection {
    /** Selected variant ID */
    id: string
    /** Template ID to use */
    templateId: string
    /** Bucket number used for selection */
    bucket: number
    /** Channel used for selection */
    channel: VariantChannel
}

/**
 * Deterministic bucketing utilities
 */
export class VariantBucketing {
    /**
     * Get bucket number for a user and template combination
     * Returns integer in range [0, 100) for percentage-based rollout
     *
     * @param userId - User identifier (supports 'anonymous')
     * @param templateId - Template identifier
     * @returns Bucket number [0, 100)
     */
    static getBucket(userId: string, templateId: string): number {
        // Hash the combination of userId and templateId for deterministic bucketing
        const hash = createHash('sha256')
        hash.update(`${userId}:${templateId}`)
        const digest = hash.digest()

        // Use first 4 bytes as a 32-bit integer
        const value = digest.readUInt32BE(0)

        // Map to [0, 100) range
        return value % 100
    }

    /**
     * Check if bucket falls within a percentage threshold
     */
    static isInRollout(bucket: number, rolloutPercent: number): boolean {
        return bucket < rolloutPercent
    }
}

/**
 * Variant selector with configuration management
 */
export class VariantSelector {
    private configs = new Map<string, VariantConfig>()

    /**
     * Set configuration for a template
     * @throws Error if rollout percentages don't sum to 100 per channel
     */
    setConfig(templateId: string, config: VariantConfig): void {
        // Validate rollout percentages sum to 100 for each channel
        const channels = new Set<VariantChannel>()
        config.variants.forEach((v) => {
            if (v.channels) {
                v.channels.forEach((c) => channels.add(c))
            } else {
                // Variants without explicit channels apply to all channels
                channels.add('stable')
                channels.add('canary')
            }
        })

        // Validate each channel's rollout sums to 100
        for (const channel of channels) {
            const channelVariants = config.variants.filter((v) => !v.channels || v.channels.includes(channel))
            const totalRollout = channelVariants.reduce((sum, v) => sum + v.rolloutPercent, 0)
            if (totalRollout !== 100) {
                throw new Error(
                    `Variant rollout percentages for channel '${channel}' must sum to 100, got ${totalRollout} for template ${templateId}`
                )
            }
        }

        this.configs.set(templateId, config)
    }

    /**
     * Get configuration for a template
     */
    getConfig(templateId: string): VariantConfig | undefined {
        return this.configs.get(templateId)
    }

    /**
     * Select a variant for a user and template
     *
     * @param templateId - Template identifier
     * @param userId - User identifier
     * @param channel - Variant channel (stable/canary)
     * @returns Selected variant with metadata
     */
    selectVariant(templateId: string, userId: string, channel: VariantChannel = 'stable'): VariantSelection {
        const config = this.configs.get(templateId)

        if (!config) {
            // No config found - return a fallback selection
            return {
                id: 'default',
                templateId: templateId,
                bucket: 0,
                channel
            }
        }

        const bucket = VariantBucketing.getBucket(userId, templateId)

        // Filter variants by channel
        const channelVariants = config.variants.filter((v) => !v.channels || v.channels.includes(channel))

        if (channelVariants.length === 0) {
            // No variants for this channel - use default
            const defaultVariant = config.variants.find((v) => v.id === config.defaultVariant)
            if (!defaultVariant) {
                return {
                    id: config.defaultVariant,
                    templateId: config.templateId,
                    bucket,
                    channel
                }
            }
            return {
                id: defaultVariant.id,
                templateId: defaultVariant.templateId,
                bucket,
                channel
            }
        }

        // Select variant based on bucket and rollout percentages
        let cumulativePercent = 0
        for (const variant of channelVariants) {
            cumulativePercent += variant.rolloutPercent
            if (bucket < cumulativePercent) {
                return {
                    id: variant.id,
                    templateId: variant.templateId,
                    bucket,
                    channel
                }
            }
        }

        // Fallback to default variant (should not reach here if percentages sum to 100)
        const defaultVariant = channelVariants.find((v) => v.id === config.defaultVariant)
        if (defaultVariant) {
            return {
                id: defaultVariant.id,
                templateId: defaultVariant.templateId,
                bucket,
                channel
            }
        }

        // Last resort: first variant
        const firstVariant = channelVariants[0]
        return {
            id: firstVariant.id,
            templateId: firstVariant.templateId,
            bucket,
            channel
        }
    }

    /**
     * Clear all configurations (useful for testing)
     */
    clearConfigs(): void {
        this.configs.clear()
    }

    /**
     * List all configured template IDs
     */
    listConfiguredTemplates(): string[] {
        return Array.from(this.configs.keys())
    }
}

/**
 * Default singleton selector instance
 */
let defaultSelector: VariantSelector | undefined

/**
 * Get default variant selector instance
 */
export function getDefaultSelector(): VariantSelector {
    if (!defaultSelector) {
        defaultSelector = new VariantSelector()
    }
    return defaultSelector
}

/**
 * Reset default selector (for testing)
 */
export function resetDefaultSelector(): void {
    defaultSelector = undefined
}
