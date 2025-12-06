/**
 * MSW handlers for API mocking in tests
 * Provides mock responses for player and location endpoints
 */
import { http, HttpResponse } from 'msw'

export const handlers = [
    // Bootstrap player endpoint
    http.get('/api/player', ({ request }) => {
        // Check if existing GUID provided via header
        const existingGuid = request.headers.get('x-player-guid')

        if (existingGuid) {
            // Confirm existing player
            return HttpResponse.json({
                success: true,
                data: {
                    playerGuid: existingGuid,
                    created: false,
                    currentLocationId: 'a7e3f8c0-1234-4abc-9def-1234567890ab'
                }
            })
        }

        // Bootstrap new player
        return HttpResponse.json({
            success: true,
            data: {
                playerGuid: '550e8400-e29b-41d4-a716-446655440001',
                created: true,
                currentLocationId: 'a7e3f8c0-1234-4abc-9def-1234567890ab'
            }
        })
    }),

    // Get player by ID
    http.get('/api/player/:playerId', () => {
        return HttpResponse.json({
            success: true,
            data: {
                id: '550e8400-e29b-41d4-a716-446655440001',
                guest: true,
                currentLocationId: 'a7e3f8c0-1234-4abc-9def-1234567890ab'
            }
        })
    }),

    // Get location (returns compiled description)
    http.get('/api/location/:locationId', ({ params }) => {
        const { locationId } = params
        const isStarter = locationId === 'a7e3f8c0-1234-4abc-9def-1234567890ab'
        const isNorthRoad = locationId === 'b8f4g9d1-2345-5bcd-0efg-2345678901bc'

        if (isStarter) {
            return HttpResponse.json({
                success: true,
                data: {
                    id: locationId,
                    name: 'Mosswell River Jetty',
                    description: {
                        text: 'Timbered jetty where river current meets brackish tide; a moss‑rimmed fountain anchors a plank‑lined plaza just inland.',
                        html: '<p>Timbered jetty where river current meets brackish tide; a moss‑rimmed fountain anchors a plank‑lined plaza just inland.</p>',
                        provenance: {
                            compiledAt: new Date().toISOString(),
                            layersApplied: ['base'],
                            supersededSentences: 0
                        }
                    },
                    exits: [
                        { direction: 'north', targetId: 'b8f4g9d1-2345-5bcd-0efg-2345678901bc' },
                        { direction: 'south', targetId: 'c9g5h0e2-3456-6cde-1fgh-3456789012cd' }
                    ]
                }
            })
        }

        if (isNorthRoad) {
            return HttpResponse.json({
                success: true,
                data: {
                    id: locationId,
                    name: 'North Road',
                    description: {
                        text: 'Slight rise leading north; bustle of the square fades behind while the wooden gate looms ahead.',
                        html: '<p>Slight rise leading north; bustle of the square fades behind while the wooden gate looms ahead.</p>',
                        provenance: {
                            compiledAt: new Date().toISOString(),
                            layersApplied: ['base'],
                            supersededSentences: 0
                        }
                    },
                    exits: [
                        { direction: 'south', targetId: 'a7e3f8c0-1234-4abc-9def-1234567890ab' },
                        { direction: 'north', targetId: 'd0h6i1f3-4567-7def-2ghi-4567890123de' }
                    ]
                }
            })
        }

        return HttpResponse.json(
            {
                success: false,
                error: { code: 'LOCATION_NOT_FOUND', message: 'Location not found' }
            },
            { status: 404 }
        )
    }),

    // Move player
    http.post('/api/player/:playerId/move', async ({ request }) => {
        const body = (await request.json()) as { direction: string }
        const { direction } = body

        if (direction === 'north') {
            return HttpResponse.json({
                success: true,
                data: {
                    id: 'b8f4g9d1-2345-5bcd-0efg-2345678901bc',
                    name: 'North Road',
                    description: {
                        text: 'Slight rise leading north; bustle of the square fades behind while the wooden gate looms ahead.',
                        html: '<p>Slight rise leading north; bustle of the square fades behind while the wooden gate looms ahead.</p>',
                        provenance: {
                            compiledAt: new Date().toISOString(),
                            layersApplied: ['base'],
                            supersededSentences: 0
                        }
                    },
                    exits: [
                        { direction: 'south', targetId: 'a7e3f8c0-1234-4abc-9def-1234567890ab' },
                        { direction: 'north', targetId: 'd0h6i1f3-4567-7def-2ghi-4567890123de' }
                    ]
                }
            })
        }

        return HttpResponse.json(
            {
                success: false,
                error: { code: 'EXIT_NOT_FOUND', message: 'No exit in that direction' }
            },
            { status: 400 }
        )
    }),

    // Ping endpoint
    http.post('/api/ping', async ({ request }) => {
        const body = (await request.json()) as { message: string }
        return HttpResponse.json({
            success: true,
            data: {
                echo: body.message || 'pong'
            }
        })
    })
]
