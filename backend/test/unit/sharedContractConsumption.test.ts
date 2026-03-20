import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'

const BACKEND_SRC = path.resolve(import.meta.dirname, '../../src')

function readSource(relativePath: string): string {
    return readFileSync(path.join(BACKEND_SRC, relativePath), 'utf8')
}

describe('backend shared contract consumption', () => {
    test('uses shared forbidden-entry normalization instead of inline duplication', () => {
        const queueSource = readSource('handlers/queueProcessExitGenerationHint.ts')
        const cosmosSource = readSource('repos/locationRepository.cosmos.ts')

        assert.match(queueSource, /from '@piquet-h\/shared'/)
        assert.match(queueSource, /normalizeForbiddenEntry/)
        assert.match(cosmosSource, /from '@piquet-h\/shared'/)
        assert.match(cosmosSource, /normalizeForbiddenEntry/)
        assert.doesNotMatch(queueSource, /TODO: Replace with normalizeForbiddenEntry/)
        assert.doesNotMatch(cosmosSource, /TODO: Replace with normalizeForbiddenEntry/)
    })

    test('uses shared event names without republish-era casts', () => {
        const worldGraphSource = readSource('handlers/worldGraph.ts')

        assert.doesNotMatch(worldGraphSource, /as GameEventName/)
        assert.doesNotMatch(worldGraphSource, /republished with 'World\.Map\.Fetched'/)
        assert.match(worldGraphSource, /this\.track\('World\.Map\.Fetched'/)
    })
})
