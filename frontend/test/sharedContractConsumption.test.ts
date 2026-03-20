import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FRONTEND_SRC = path.resolve(import.meta.dirname, '../src')

function readSource(relativePath: string): string {
    return fs.readFileSync(path.join(FRONTEND_SRC, relativePath), 'utf-8')
}

describe('frontend shared contract consumption', () => {
    it('uses shared direction exports instead of redeclaring Direction unions', () => {
        const flowHookSource = readSource('components/hooks/useGameNavigationFlow.ts')
        const navigationUiSource = readSource('components/NavigationUI.tsx')

        expect(flowHookSource).toMatch(/from '@piquet-h\/shared'/)
        expect(flowHookSource).not.toMatch(/export type Direction\s*=/)

        expect(navigationUiSource).toMatch(/from '@piquet-h\/shared'/)
        expect(navigationUiSource).not.toMatch(/type Direction\s*=/)
    })

    it('uses shared constants for directions, starter location, and telemetry keys', () => {
        const commandInputSource = readSource('components/CommandInput.tsx')
        const worldMapSource = readSource('components/WorldMap.tsx')
        const telemetrySource = readSource('services/telemetry.ts')

        expect(commandInputSource).toMatch(/DIRECTIONS.*from '@piquet-h\/shared'|from '@piquet-h\/shared'.*DIRECTIONS/s)
        expect(commandInputSource).not.toMatch(/const DIRECTIONS\s*=\s*React\.useMemo/)

        expect(worldMapSource).toMatch(/STARTER_LOCATION_ID.*from '@piquet-h\/shared'|from '@piquet-h\/shared'.*STARTER_LOCATION_ID/s)
        expect(worldMapSource).not.toMatch(/const STARTER_LOCATION_ID\s*=/)

        expect(telemetrySource).toMatch(
            /TELEMETRY_ATTRIBUTE_KEYS.*from '@piquet-h\/shared'|from '@piquet-h\/shared'.*TELEMETRY_ATTRIBUTE_KEYS/s
        )
        expect(telemetrySource).toMatch(/SERVICE_FRONTEND_WEB.*from '@piquet-h\/shared'|from '@piquet-h\/shared'.*SERVICE_FRONTEND_WEB/s)
        expect(telemetrySource).not.toMatch(/const FRONTEND_ATTRIBUTE_KEYS\s*=/)
        expect(telemetrySource).not.toContain("'frontend-web'")
    })
})
