import { CosmosClient } from '@azure/cosmos'

const endpoint = 'https://cosmossql-atlas.documents.azure.com:443/'
const key = process.env.COSMOS_SQL_KEY
const database = 'game'
const container = 'players'

if (!key) {
    console.error('❌ Set COSMOS_SQL_KEY environment variable')
    process.exit(1)
}

const client = new CosmosClient({ endpoint, key })
const containerRef = client.database(database).container(container)

try {
    console.log('🔍 Checking SQL API players container...\n')
    
    // Query for player count
    const { resources } = await containerRef.items.query({
        query: 'SELECT VALUE COUNT(1) FROM c'
    }).fetchAll()
    
    const count = resources[0]
    console.log(`📊 Found ${count} players in SQL API\n`)
    
    if (count > 0) {
        // Get sample players
        const { resources: players } = await containerRef.items.query({
            query: 'SELECT TOP 5 c.id, c.createdUtc, c.guest FROM c'
        }).fetchAll()
        
        console.log('📋 Sample players:')
        players.forEach((p, i) => {
            console.log(`  ${i + 1}. ${p.id} (guest: ${p.guest}, created: ${p.createdUtc})`)
        })
    } else {
        console.log('ℹ️  No players in SQL API yet - migration needed!')
    }
} catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
}
