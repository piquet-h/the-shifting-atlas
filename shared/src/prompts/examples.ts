/**
 * A/B Testing Example Configuration
 *
 * This file demonstrates how to configure and use the variant selector
 * for A/B testing prompt templates.
 */

import { VariantSelector, type VariantConfig } from './variantSelector.js'

// Example 1: Simple 50/50 A/B test
const simpleABTest: VariantConfig = {
    templateId: 'location-description',
    variants: [
        {
            id: 'control',
            templateId: 'location-description-v1',
            rolloutPercent: 50,
            metadata: {
                description: 'Original location description template',
                createdAt: '2025-01-01T00:00:00Z'
            }
        },
        {
            id: 'experiment',
            templateId: 'location-description-v2',
            rolloutPercent: 50,
            metadata: {
                description: 'New location description with enhanced details',
                createdAt: '2025-01-08T00:00:00Z'
            }
        }
    ],
    defaultVariant: 'control'
}

// Example 2: Gradual rollout (10% experiment)
const gradualRollout: VariantConfig = {
    templateId: 'npc-dialogue',
    variants: [
        {
            id: 'stable',
            templateId: 'npc-dialogue-v1',
            rolloutPercent: 90
        },
        {
            id: 'canary',
            templateId: 'npc-dialogue-v2',
            rolloutPercent: 10
        }
    ],
    defaultVariant: 'stable'
}

// Example 3: Channel-based variants (stable vs canary)
const channelBasedVariants: VariantConfig = {
    templateId: 'quest-generator',
    variants: [
        {
            id: 'production',
            templateId: 'quest-generator-v1',
            rolloutPercent: 100,
            channels: ['stable'],
            metadata: {
                description: 'Production-ready quest generator'
            }
        },
        {
            id: 'experimental',
            templateId: 'quest-generator-v2-beta',
            rolloutPercent: 100,
            channels: ['canary'],
            metadata: {
                description: 'Experimental quest generator with new features'
            }
        }
    ],
    defaultVariant: 'production'
}

// Example 4: Multi-variant test with different percentages
const multiVariantTest: VariantConfig = {
    templateId: 'room-atmosphere',
    variants: [
        {
            id: 'control',
            templateId: 'room-atmosphere-baseline',
            rolloutPercent: 70
        },
        {
            id: 'variant-a',
            templateId: 'room-atmosphere-detailed',
            rolloutPercent: 15
        },
        {
            id: 'variant-b',
            templateId: 'room-atmosphere-concise',
            rolloutPercent: 15
        }
    ],
    defaultVariant: 'control'
}

// Usage example
export function setupVariantSelector(): VariantSelector {
    const selector = new VariantSelector()

    // Configure all variants
    selector.setConfig('location-description', simpleABTest)
    selector.setConfig('npc-dialogue', gradualRollout)
    selector.setConfig('quest-generator', channelBasedVariants)
    selector.setConfig('room-atmosphere', multiVariantTest)

    return selector
}

// Example usage in a handler
export function selectTemplateForUser(
    selector: VariantSelector,
    templateId: string,
    userId: string,
    channel: 'stable' | 'canary' = 'stable'
): string {
    const selection = selector.selectVariant(templateId, userId, channel)

    console.log(`User ${userId} assigned to variant ${selection.id} (bucket ${selection.bucket})`)
    console.log(`Using template: ${selection.templateId}`)

    return selection.templateId
}
