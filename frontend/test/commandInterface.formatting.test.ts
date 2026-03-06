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

    it('includes pending exits when availability metadata is present', () => {
        const text = formatMoveResponse('east', {
            id: '22222222-2222-2222-2222-222222222222',
            name: 'North Gate',
            description: {
                text: 'A broad gate facing open roads.',
                html: '<p>A broad gate facing open roads.</p>',
                provenance: { compiledAt: new Date().toISOString(), layersApplied: [], supersededSentences: 0 }
            },
            exits: [
                { direction: 'north', availability: 'hard', toLocationId: 'loc-n' },
                { direction: 'east', availability: 'hard', toLocationId: 'loc-e' },
                { direction: 'northeast', availability: 'pending' },
                { direction: 'northwest', availability: 'pending' }
            ]
        } as never)

        expect(text).toContain('(Exits: north, east, northeast, northwest)')
    })
})
