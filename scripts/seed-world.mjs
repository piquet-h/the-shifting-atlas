#!/usr/bin/env node
/* global process */
// World seeding script: idempotently upserts initial locations and a demo player.
// Usage: DEMO_PLAYER_ID=<guid> npm run seed:world

import {seedWorld} from '../shared/dist/index.js'

async function main() {
    const demoPlayerId = process.env.DEMO_PLAYER_ID
    const result = await seedWorld({demoPlayerId, log: console.log})
    console.log('\nWorld seed complete:')
    console.table(result)
}

main().catch((err) => {
    console.error('World seeding failed', err)
    process.exit(1)
})
