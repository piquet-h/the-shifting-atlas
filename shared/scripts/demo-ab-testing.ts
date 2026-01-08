#!/usr/bin/env node
/**
 * A/B Testing Demonstration Script
 *
 * Demonstrates the variant selector with realistic user distribution.
 * Run with: node --import=tsx scripts/demo-ab-testing.ts
 */

import { VariantSelector, VariantBucketing } from '../src/prompts/variantSelector.js'

console.log('=== Prompt Template A/B Testing Demo ===\n')

// Setup selector
const selector = new VariantSelector()

// Configure a 50/50 A/B test
selector.setConfig('location-description', {
    templateId: 'location-description',
    variants: [
        {
            id: 'control',
            templateId: 'location-description-v1',
            rolloutPercent: 50,
            metadata: {
                description: 'Original location description template'
            }
        },
        {
            id: 'experiment',
            templateId: 'location-description-v2',
            rolloutPercent: 50,
            metadata: {
                description: 'New location description with enhanced details'
            }
        }
    ],
    defaultVariant: 'control'
})

console.log('📊 50/50 A/B Test Configuration:')
console.log('- Control (v1): 50%')
console.log('- Experiment (v2): 50%\n')

// Simulate 20 users
console.log('👥 Simulating 20 users:\n')

const variantCounts = { control: 0, experiment: 0 }

for (let i = 1; i <= 20; i++) {
    const userId = `user-${String(i).padStart(3, '0')}`
    const selection = selector.selectVariant('location-description', userId, 'stable')

    variantCounts[selection.id as keyof typeof variantCounts]++

    const indicator = selection.id === 'control' ? '🔵' : '🟢'
    console.log(`${indicator} ${userId}: ${selection.id.padEnd(10)} (bucket ${String(selection.bucket).padStart(2)}) → ${selection.templateId}`)
}

console.log('\n📈 Distribution:')
console.log(`Control:    ${variantCounts.control}/20 (${(variantCounts.control / 20 * 100).toFixed(0)}%)`)
console.log(`Experiment: ${variantCounts.experiment}/20 (${(variantCounts.experiment / 20 * 100).toFixed(0)}%)`)

// Test deterministic bucketing
console.log('\n🔒 Deterministic Bucketing Test:')
const testUser = 'user-001'
const bucket1 = VariantBucketing.getBucket(testUser, 'location-description')
const bucket2 = VariantBucketing.getBucket(testUser, 'location-description')
const bucket3 = VariantBucketing.getBucket(testUser, 'location-description')

console.log(`${testUser} bucket: ${bucket1}`)
console.log(`${testUser} bucket: ${bucket2}`)
console.log(`${testUser} bucket: ${bucket3}`)
console.log(`✅ Same bucket every time: ${bucket1 === bucket2 && bucket2 === bucket3}`)

// Test channel-based selection
console.log('\n🔀 Channel-Based Selection Test:')

selector.setConfig('npc-dialogue', {
    templateId: 'npc-dialogue',
    variants: [
        {
            id: 'stable',
            templateId: 'npc-dialogue-v1',
            rolloutPercent: 100,
            channels: ['stable']
        },
        {
            id: 'canary',
            templateId: 'npc-dialogue-v2-beta',
            rolloutPercent: 100,
            channels: ['canary']
        }
    ],
    defaultVariant: 'stable'
})

const userId = 'user-test'
const stableSelection = selector.selectVariant('npc-dialogue', userId, 'stable')
const canarySelection = selector.selectVariant('npc-dialogue', userId, 'canary')

console.log(`Stable channel → ${stableSelection.id} (${stableSelection.templateId})`)
console.log(`Canary channel → ${canarySelection.id} (${canarySelection.templateId})`)

// Test anonymous user
console.log('\n👤 Anonymous User Test:')
const anonSelection1 = selector.selectVariant('location-description', 'anonymous', 'stable')
const anonSelection2 = selector.selectVariant('location-description', 'anonymous', 'stable')

console.log(`Anonymous user variant: ${anonSelection1.id} (bucket ${anonSelection1.bucket})`)
console.log(`Anonymous user variant: ${anonSelection2.id} (bucket ${anonSelection2.bucket})`)
console.log(`✅ Consistent: ${anonSelection1.id === anonSelection2.id && anonSelection1.bucket === anonSelection2.bucket}`)

console.log('\n✨ Demo complete!\n')
