/**
 * Quick test to see if there are players in Gremlin
 */
import { GremlinClient } from './src/gremlin/gremlinClient.js'

const config = {
    endpoint: 'cosmosgraph-atlas.documents.azure.com',
    database: 'game',
    graph: 'world'
}

const gremlinKey = process.env.COSMOS_GREMLIN_KEY
if (!gremlinKey) {
    console.error('❌ Set COSMOS_GREMLIN_KEY first')
    process.exit(1)
}

const client = new GremlinClient(config, gremlinKey)

try {
    console.log('🔍 Counting players in Gremlin...')
    const result = await client.submit("g.V().hasLabel('player').count()")
    const count = result._items[0]
    console.log(`✅ Found ${count} player vertices in Gremlin`)
    
    if (count > 0) {
        console.log('\n📋 Sample player IDs:')
        const players = await client.submit("g.V().hasLabel('player').limit(5).id()")
        players._items.forEach((id, i) => console.log(`  ${i + 1}. ${id}`))
    }
} catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
} finally {
    await client.close()
}
