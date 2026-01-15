import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'

import type { InvocationContext } from '@azure/functions'

import { UnitTestFixture } from '../helpers/UnitTestFixture'

function buildClientPrincipalHeader(claims: Array<{ typ: string; val: string }>): string {
    const principal = {
        identityProvider: 'aad',
        userId: 'test-user',
        userDetails: 'test',
        claims
    }
    return Buffer.from(JSON.stringify(principal), 'utf8').toString('base64')
}

describe('MCP auth boundary (#428)', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
        delete process.env.MCP_AUTH_REQUIRED
    })

    test('missing token returns 401 and emits MCP.Auth.Denied', async () => {
        const { wrapMcpToolHandler } = await import('../../src/mcp/auth/mcpAuth.js')
        const telemetry = await fixture.getTelemetryClient()
        const context = await fixture.createInvocationContext({ invocationId: 'corr-1' } as Partial<InvocationContext>)

        const wrapped = wrapMcpToolHandler({
            toolName: 'get-location-context',
            handler: async () => JSON.stringify({ ok: true })
        })

        // No Authorization header at all
        const result = await wrapped({ arguments: {} }, context)

        assert.equal(typeof result, 'object')
        assert.equal((result as { status?: number }).status, 401)

        const denied = telemetry.events.find((e) => e.name === 'MCP.Auth.Denied')
        assert.ok(denied, 'expected MCP.Auth.Denied telemetry')
        assert.equal(denied?.properties?.correlationId, 'corr-1')
        assert.equal(denied?.properties?.toolName, 'get-location-context')
        assert.equal(denied?.properties?.reason, 'missing_token')
    })

    test('unknown client returns 403 and emits MCP.Auth.Denied', async () => {
        const { wrapMcpToolHandler } = await import('../../src/mcp/auth/mcpAuth.js')
        const telemetry = await fixture.getTelemetryClient()
        const context = await fixture.createInvocationContext({ invocationId: 'corr-2' } as Partial<InvocationContext>)

        const wrapped = wrapMcpToolHandler({
            toolName: 'get-location-context',
            handler: async () => JSON.stringify({ ok: true }),
            allowedClientAppIds: ['known-client']
        })

        const principal = buildClientPrincipalHeader([
            { typ: 'appid', val: 'unknown-client' },
            { typ: 'roles', val: 'Narrator' },
            { typ: 'tid', val: 'tenant-1' }
        ])

        const result = await wrapped({ headers: { 'x-ms-client-principal': principal }, arguments: {} }, context)

        assert.equal(typeof result, 'object')
        assert.equal((result as { status?: number }).status, 403)

        const denied = telemetry.events.find((e) => e.name === 'MCP.Auth.Denied')
        assert.ok(denied, 'expected MCP.Auth.Denied telemetry')
        assert.equal(denied?.properties?.reason, 'unknown_client')
    })

    test('Narrator role can call allow-listed read-only tool', async () => {
        const { wrapMcpToolHandler } = await import('../../src/mcp/auth/mcpAuth.js')
        const telemetry = await fixture.getTelemetryClient()
        const context = await fixture.createInvocationContext({ invocationId: 'corr-3' } as Partial<InvocationContext>)

        const wrapped = wrapMcpToolHandler({
            toolName: 'get-location-context',
            handler: async () => JSON.stringify({ ok: true }),
            allowedClientAppIds: ['known-client']
        })

        const principal = buildClientPrincipalHeader([
            { typ: 'appid', val: 'known-client' },
            { typ: 'roles', val: 'Narrator' },
            { typ: 'tid', val: 'tenant-1' }
        ])

        const result = await wrapped({ headers: { 'x-ms-client-principal': principal }, arguments: {} }, context)

        assert.equal(typeof result, 'string')
        assert.equal(JSON.parse(result as string).ok, true)

        const allowed = telemetry.events.find((e) => e.name === 'MCP.Auth.Allowed')
        assert.ok(allowed, 'expected MCP.Auth.Allowed telemetry')
    })

    test('Narrator role denied for non-allowlisted tool', async () => {
        const { wrapMcpToolHandler } = await import('../../src/mcp/auth/mcpAuth.js')
        const telemetry = await fixture.getTelemetryClient()
        const context = await fixture.createInvocationContext({ invocationId: 'corr-4' } as Partial<InvocationContext>)

        const wrapped = wrapMcpToolHandler({
            toolName: 'delete-the-world',
            handler: async () => JSON.stringify({ ok: true }),
            allowedClientAppIds: ['known-client']
        })

        const principal = buildClientPrincipalHeader([
            { typ: 'appid', val: 'known-client' },
            { typ: 'roles', val: 'Narrator' },
            { typ: 'tid', val: 'tenant-1' }
        ])

        const result = await wrapped({ headers: { 'x-ms-client-principal': principal }, arguments: {} }, context)

        assert.equal(typeof result, 'object')
        assert.equal((result as { status?: number }).status, 403)

        const denied = telemetry.events.find((e) => e.name === 'MCP.Auth.Denied')
        assert.ok(denied, 'expected MCP.Auth.Denied telemetry')
        assert.equal(denied?.properties?.reason, 'tool_not_allowed')
    })
})
