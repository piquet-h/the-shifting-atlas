import { Container } from 'inversify'
import { readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { TOKENS } from '../src/di/tokens.js'
import { setupContainer } from '../src/inversify.config.js'

const s = JSON.parse(readFileSync('./local.settings.cosmos.json', 'utf8'))
Object.assign(process.env, s.Values)
process.env.PERSISTENCE_MODE = 'cosmos'
process.env.ServiceBusAtlas__fullyQualifiedNamespace = 'sb-atlas-cldf.servicebus.windows.net'

const container = await setupContainer(new Container())
const locationRepo = container.get(TOKENS.LocationRepository)
const publisher = container.get(TOKENS.ExitGenerationHintPublisher)

const origin = 'd0b2a7ea-9f4c-41d5-9b2d-7b4a0e6f1c3a'
const playerId = '11111111-1111-4111-8111-111111111111'

const before = await locationRepo.get(origin)
console.log(
    'before exits:',
    (before?.exits || []).map((e: any) => e.direction)
)

await publisher.enqueueHint(
    {
        dir: 'north',
        originLocationId: origin,
        playerId,
        timestamp: new Date().toISOString(),
        debounced: false
    },
    `manual-probe-${Date.now()}`
)
console.log('hint published')

for (let i = 1; i <= 15; i++) {
    await sleep(2000)
    const now = await locationRepo.get(origin)
    const dirs = (now?.exits || []).map((e: any) => e.direction)
    console.log(`poll ${i}:`, dirs)
    if (dirs.includes('north')) {
        console.log('MATERIALIZED')
        process.exit(0)
    }
}

console.log('NOT_MATERIALIZED_WITHIN_30S')
