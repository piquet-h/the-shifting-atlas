import { describe, expect, it } from 'vitest'

import { formatMoveResponse } from '../src/components/CommandInterface'

describe('CommandInterface output formatting', () => {
    it('includes exits inline as part of the narrative line', () => {
        const text = formatMoveResponse('north', {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'North Road',
            description: {
                text: 'A slight rise leading north.',
                html: '<p>A slight rise leading north.</p>',
                provenance: { compiledAt: new Date().toISOString(), layersApplied: [], supersededSentences: 0 }
            },
            exits: [{ direction: 'north' }, { direction: 'south' }]
        })

        expect(text).toMatch(/^Moved north -> North Road: /)
        expect(text).toContain('A slight rise leading north.')
        expect(text).toContain('(Exits: north, south)')
        expect(text).not.toContain('\nExits:')
    })
})
