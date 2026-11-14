/**
 * Integration tests verifying Option 1:
 * `IPlayerRepository` (Auth/Identity/Movement) and `IPlayerDocRepository` (Gameplay/Clocks/MCP)
 * share one underlying player backing store without overwriting each other's fields or leaking PII.
 */
import type { InvocationContext } from '@azure/functions'
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { TOKENS } from '../../src/di/tokens.js'
import { bootstrapPlayerHandler } from '../../src/handlers/bootstrapPlayer.js'
import { WorldContextHandler } from '../../src/handlers/mcp/world-context/world-context.js'
import type { IPlayerDocRepository } from '../../src/repos/PlayerDocRepository.js'
import type { IPlayerRepository } from '../../src/repos/playerRepository.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { makeHttpRequest } from '../helpers/testUtils.js'

describe('Shared Player Backing Store (IPlayerRepository + IPlayerDocRepository)', () => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('movement and auth updates via IPlayerRepository are immediately visible to IPlayerDocRepository and MCP without leaking externalId', async () => {
        const container = await fixture.getContainer()
        const playerRepo = container.get<IPlayerRepository>(TOKENS.PlayerRepository)
        const playerDocRepo = container.get<IPlayerDocRepository>(TOKENS.PlayerDocRepository)
        const worldContext = container.get(WorldContextHandler)

        const mockContext = {
            invocationId: 'bootstrap-shared-store',
            functionName: 'playerBootstrap',
            extraInputs: new Map([['container', container]]),
            log: () => {},
            error: () => {},
            warn: () => {},
            info: () => {},
            debug: () => {},
            trace: () => {}
        } as unknown as InvocationContext

        // 1. Bootstrap creates guest=true record accessible through both interfaces
        const bootRes = await bootstrapPlayerHandler(makeHttpRequest(), mockContext)
        const playerGuid = (bootRes.jsonBody as { data: { playerGuid: string } }).data.playerGuid

        const afterBootRecord = await playerRepo.get(playerGuid)
        assert.ok(afterBootRecord)
        assert.equal(afterBootRecord.guest, true)

        // 2. Link external identity + move player to a new location via IPlayerRepository
        const linkRes = await playerRepo.linkExternalId(playerGuid, 'entra:subject-999')
        assert.equal(linkRes.updated, true)

        const nextLocationId = 'f7c9b2ad-1e34-4c6f-8d5a-2b7e9c4f1a53'
        await playerRepo.update({
            ...linkRes.record!,
            currentLocationId: nextLocationId
        })

        // 3. IPlayerDocRepository immediately sees the moved location in memory mode
        const projectedDoc = await playerDocRepo.getPlayer(playerGuid)
        assert.ok(projectedDoc)
        assert.equal(projectedDoc.currentLocationId, nextLocationId)
        assert.equal('externalId' in (projectedDoc as unknown as Record<string, unknown>), false)

        // 4. Updating gameplay fields via IPlayerDocRepository preserves externalId & guest=false on IPlayerRepository
        await playerDocRepo.upsertPlayer({
            ...projectedDoc,
            clockTick: 300,
            attributes: { hp: 75 }
        })

        const foundByExternal = await playerRepo.findByExternalId('entra:subject-999')
        assert.ok(foundByExternal)
        assert.equal(foundByExternal.id, playerGuid)
        assert.equal(foundByExternal.guest, false)

        // 5. Subsequent IPlayerRepository.update() preserves clockTick & attributes
        await playerRepo.update({
            ...foundByExternal,
            name: 'Captain Rowan'
        })
        const afterMoveAndName = await playerDocRepo.getPlayer(playerGuid)
        assert.ok(afterMoveAndName)
        assert.equal(afterMoveAndName.clockTick, 300)
        assert.deepEqual(afterMoveAndName.attributes, { hp: 75 })

        // 6. MCP WorldContext getPlayerContext sees currentLocationId and strips externalId
        const mcpJson = await worldContext.getPlayerContext({ arguments: { playerId: playerGuid } }, mockContext)
        const parsedMcp = JSON.parse(mcpJson) as { player: Record<string, unknown> }
        assert.equal(parsedMcp.player.currentLocationId, nextLocationId)
        assert.equal(parsedMcp.player.clockTick, 300)
        assert.equal('externalId' in parsedMcp.player, false)
    })
})
