#!/usr/bin/env node
/**
 * DANGEROUS: Wipes entire Gremlin graph and reseeds from JSON
 * Use with caution - this deletes ALL location data in the database
 */
import { createGremlinClient } from '../backend/dist/src/gremlin/gremlinClient.js'
import { loadPersistenceConfigAsync } from '../backend/dist/src/persistenceConfig.js'
import { CosmosLocationRepository } from '../backend/dist/src/repos/locationRepository.cosmos.js'
import { seedWorld } from '../backend/dist/src/seeding/seedWorld.js'

console.log('\n⚠️  WARNING: DESTRUCTIVE OPERATION ⚠️')
console.log('═'.repeat(80))
console.log('This will DELETE ALL locations and exits from the Cosmos DB Gremlin graph.')
console.log('═'.repeat(80))
console.log('\nCounting down... Press Ctrl+C to abort!\n')

// 3 second countdown
for (let i = 3; i > 0; i--) {
  process.stdout.write(`\r${i}... `)
  await new Promise(resolve => setTimeout(resolve, 1000))
}
console.log('\r🗑️  Starting wipe...\n')

const config = await loadPersistenceConfigAsync()

if (config.mode !== 'cosmos' || !config.cosmos) {
  throw new Error('This script requires Cosmos persistence mode')
}

const client = await createGremlinClient(config.cosmos)

console.log('Step 1: Counting existing data...')
const vertexCount = await client.submit("g.V().count()")
const edgeCount = await client.submit("g.E().count()")
console.log(`  Found ${vertexCount[0]} vertices and ${edgeCount[0]} edges`)

console.log('\nStep 2: Deleting all edges (in batches)...')
let edgesRemaining = edgeCount[0]
while (edgesRemaining > 0) {
  try {
    await client.submit("g.E().limit(100).drop()")
    edgesRemaining = (await client.submit("g.E().count()"))[0]
    process.stdout.write(`\r  Progress: ${edgeCount[0] - edgesRemaining}/${edgeCount[0]} edges deleted...`)
    await new Promise(resolve => setTimeout(resolve, 100)) // Rate limit protection
  } catch (err) {
    if (err.statusCode === 429 || err.statusCode === 500) {
      console.log(`\n  Rate limited, waiting 1 second...`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    } else {
      throw err
    }
  }
}
console.log('\n  ✅ All edges deleted')

console.log('\nStep 3: Deleting all vertices (in batches)...')
let verticesRemaining = vertexCount[0]
while (verticesRemaining > 0) {
  try {
    await client.submit("g.V().limit(100).drop()")
    verticesRemaining = (await client.submit("g.V().count()"))[0]
    process.stdout.write(`\r  Progress: ${vertexCount[0] - verticesRemaining}/${vertexCount[0]} vertices deleted...`)
    await new Promise(resolve => setTimeout(resolve, 100)) // Rate limit protection
  } catch (err) {
    if (err.statusCode === 429 || err.statusCode === 500) {
      console.log(`\n  Rate limited, waiting 1 second...`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    } else {
      throw err
    }
  }
}
console.log('\n  ✅ All vertices deleted')

console.log('\nStep 4: Verifying cleanup...')
const remainingV = await client.submit("g.V().count()")
const remainingE = await client.submit("g.E().count()")
console.log(`  Remaining: ${remainingV[0]} vertices, ${remainingE[0]} edges`)

if (remainingV[0] > 0 || remainingE[0] > 0) {
  throw new Error('Cleanup incomplete! Aborting.')
}

console.log('\n✅ Database wiped clean\n')
console.log('═'.repeat(80))
console.log('Step 5: Reseeding from JSON...')
console.log('═'.repeat(80))

// Create repository and seed
const telemetryService = {
  trackEvent: () => { },
  trackException: () => { },
  trackGameEventStrict: () => { }
}

const locationRepo = new CosmosLocationRepository(client, telemetryService)

const logs = []
const log = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
  console.log('  ' + msg)
  logs.push(msg)
}

const startTime = Date.now()
const result = await seedWorld({
  log,
  locationRepository: locationRepo,
  bulkMode: true
})
const elapsedMs = Date.now() - startTime

console.log('\n' + '═'.repeat(80))
console.log('RESEED COMPLETE')
console.log('═'.repeat(80))
console.log(`\nLocations processed:        ${result.locationsProcessed}`)
console.log(`Location vertices created:  ${result.locationVerticesCreated}`)
console.log(`Exits created:              ${result.exitsCreated}`)
console.log(`Exits removed:              ${result.exitsRemoved}`)
console.log(`\nElapsed time:               ${elapsedMs}ms`)
console.log('\n✅ Fresh database ready!\n')

process.exit(0)
