import { app, type HttpFunctionOptions } from '@azure/functions'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

interface SwaRouteRule {
    route: string
    allowedRoles?: string[]
}

interface SwaConfig {
    routes: SwaRouteRule[]
}

function matchFirstSwaRoute(routes: SwaRouteRule[], requestPath: string): SwaRouteRule | undefined {
    for (const rule of routes) {
        if (rule.route === requestPath) {
            return rule
        }
        if (rule.route.endsWith('/*')) {
            const prefix = rule.route.slice(0, -1) // keep trailing slash
            if (requestPath.startsWith(prefix)) {
                return rule
            }
        }
    }
    return undefined
}

describe('Operator & internal world-mutation HTTP route guards', () => {
    test('HttpLinkRooms, HttpGenerateArea, and HttpAgentPropose require function-key authLevel (never anonymous)', async () => {
        const registered = new Map<string, HttpFunctionOptions>()
        const originalHttp = app.http.bind(app)
        app.http = ((name: string, options: HttpFunctionOptions) => {
            registered.set(name, options)
        }) as typeof app.http

        try {
            await import('../../src/functions/linkRooms.js')
            await import('../../src/functions/generateArea.js')
            await import('../../src/functions/agentPropose.js')
        } finally {
            app.http = originalHttp
        }

        assert.equal(registered.get('HttpLinkRooms')?.authLevel, 'function')
        assert.equal(registered.get('HttpGenerateArea')?.authLevel, 'function')
        assert.equal(registered.get('HttpAgentPropose')?.authLevel, 'function')
    })

    test('staticwebapp.config.json restricts operator/agent endpoints to admin ahead of wildcard player routes', () => {
        const currentDir = path.dirname(fileURLToPath(import.meta.url))
        const swaConfigPath = path.resolve(currentDir, '../../../frontend/public/staticwebapp.config.json')
        const swaConfig = JSON.parse(fs.readFileSync(swaConfigPath, 'utf8')) as SwaConfig

        for (const operatorPath of ['/api/location/link-rooms', '/api/world/generate-area', '/api/agent/propose']) {
            const matched = matchFirstSwaRoute(swaConfig.routes, operatorPath)
            assert.ok(matched, `Expected a matching SWA route for ${operatorPath}`)
            assert.deepEqual(
                matched.allowedRoles,
                ['admin'],
                `Expected ${operatorPath} to match an admin-only rule before wildcards, but matched ${matched.route}`
            )
        }

        // Player gameplay routes must remain accessible to anonymous guest + authenticated sessions
        for (const playerPath of ['/api/location/loc-123', '/api/player/command', '/api/player/p-1/move']) {
            const matched = matchFirstSwaRoute(swaConfig.routes, playerPath)
            assert.ok(matched, `Expected a matching SWA route for ${playerPath}`)
            assert.ok(matched.allowedRoles?.includes('anonymous'), `Expected ${playerPath} to remain open to anonymous guests`)
            assert.ok(matched.allowedRoles?.includes('authenticated'), `Expected ${playerPath} to remain open to authenticated players`)
        }
    })
})
