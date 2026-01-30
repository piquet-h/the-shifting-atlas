#!/usr/bin/env node
/**
 * Test D&D 5e API Integration (Pre-Foundry Agent Baseline)
 *
 * Usage:
 *   node scripts/test-foundry-dnd-agent.mjs dnd-api-monster
 *   node scripts/test-foundry-dnd-agent.mjs dnd-api-spell-fireball
 */

const config = {
    dnd5eApiBase: 'https://www.dnd5eapi.co/api/2014'
}

async function testDnd5eApiDirect(resource) {
    console.log(`\n📖 Testing D&D 5e API: GET ${resource}`)

    try {
        const url = `${config.dnd5eApiBase}${resource}`
        const response = await fetch(url)

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const data = await response.json()
        console.log('✅ Success:')
        console.log(JSON.stringify(data, null, 2))
        return data
    } catch (error) {
        console.error('❌ Error:', error.message)
        throw error
    }
}

const scenarios = {
    'dnd-api-monster': async () => {
        console.log('=== Scenario: Fetch Goblin Stats ===')
        await testDnd5eApiDirect('/monsters/goblin')
    },

    'dnd-api-spells': async () => {
        console.log('=== Scenario: List All Spells ===')
        const data = await testDnd5eApiDirect('/spells')
        console.log(`\nTotal spells: ${data.count}`)
        console.log(
            'First 5 spells:',
            data.results
                .slice(0, 5)
                .map((s) => s.name)
                .join(', ')
        )
    },

    'dnd-api-spell-fireball': async () => {
        console.log('=== Scenario: Fireball Details ===')
        await testDnd5eApiDirect('/spells/fireball')
    },

    'dnd-api-equipment': async () => {
        console.log('=== Scenario: List Equipment ===')
        const data = await testDnd5eApiDirect('/equipment')
        console.log(`\nTotal equipment: ${data.count}`)
    }
}

async function main() {
    const scenarioName = process.argv[2] || 'dnd-api-monster'

    if (!scenarios[scenarioName]) {
        console.error(`❌ Unknown scenario: ${scenarioName}`)
        console.log('\nAvailable scenarios:')
        Object.keys(scenarios).forEach((name) => console.log(`  - ${name}`))
        process.exit(1)
    }

    console.log('🧪 D&D 5e API Integration Test')
    console.log('================================\n')

    try {
        await scenarios[scenarioName]()
        console.log('\n✅ Test completed successfully')
    } catch (error) {
        console.error('\n❌ Test failed:', error.message)
        process.exit(1)
    }
}

main()
