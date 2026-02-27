/**
 * WorldMap
 *
 * Visualises the world location graph using Cytoscape.js.
 * Fetches GET /api/world/graph, transforms nodes + edges into Cytoscape elements,
 * then positions each node using cardinal-direction vectors scaled by travelDurationMs.
 * The `preset` layout keeps nodes locked to their calculated coordinates.
 */
import cytoscape, { type ElementDefinition } from 'cytoscape'
import React, { useEffect, useRef, useState } from 'react'
import { unwrapEnvelope } from '../utils/envelope'
import { computePositions, URBAN_MS } from '../utils/worldMapPositions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorldGraphNode {
    id: string
    name: string
    tags?: string[]
}

interface WorldGraphEdge {
    fromId: string
    toId: string
    direction: string
    travelDurationMs?: number
}

interface WorldGraphResponse {
    nodes: WorldGraphNode[]
    edges: WorldGraphEdge[]
}

// ---------------------------------------------------------------------------
// Cytoscape stylesheet  (dark atlas theme)
// ---------------------------------------------------------------------------

/** Well-known starter location ID used as the graph origin (0, 0). Mirrors STARTER_LOCATION_ID in shared/src/location.ts. */
const STARTER_LOCATION_ID = 'a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21'

const ATLAS_ACCENT = '#6ee7b7'
const ATLAS_BG = '#0f1724'
const ATLAS_CARD = '#0b1220'

const CYTOSCAPE_STYLE: cytoscape.StylesheetStyle[] = [
    {
        selector: 'node',
        style: {
            shape: 'round-rectangle',
            'background-color': ATLAS_CARD,
            'border-color': ATLAS_ACCENT,
            'border-width': 1.5,
            'border-opacity': 0.7,
            label: 'data(name)',
            color: '#e2e8f0',
            'font-size': 10,
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '90px',
            width: 100,
            height: 40,
            'text-outline-color': ATLAS_BG,
            'text-outline-width': 2
        }
    },
    {
        selector: 'node:selected',
        style: {
            'background-color': '#134e4a',
            'border-color': ATLAS_ACCENT,
            'border-width': 2.5,
            color: '#f0fdf4'
        }
    },
    {
        selector: 'node:active',
        style: {
            'overlay-opacity': 0
        }
    },
    {
        selector: 'edge',
        style: {
            'curve-style': 'bezier',
            'line-color': 'rgba(110,231,183,0.25)',
            'target-arrow-color': 'rgba(110,231,183,0.5)',
            'target-arrow-shape': 'triangle',
            width: 1.5,
            label: 'data(direction)',
            color: 'rgba(148,163,184,0.7)',
            'font-size': 8,
            'text-background-color': ATLAS_BG,
            'text-background-opacity': 0.7,
            'text-background-padding': '2px'
        }
    },
    {
        selector: 'edge:selected',
        style: {
            'line-color': ATLAS_ACCENT,
            'target-arrow-color': ATLAS_ACCENT,
            width: 2
        }
    }
]

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function fetchWorldGraph(): Promise<WorldGraphResponse> {
    const res = await fetch('/api/world/graph')
    if (!res.ok) {
        throw new Error(`World graph request failed: ${res.status}`)
    }
    const json = await res.json()
    const unwrapped = unwrapEnvelope<WorldGraphResponse>(json)
    if (!unwrapped.success || !unwrapped.data) {
        throw new Error(unwrapped.error?.message ?? 'Invalid graph response')
    }
    return unwrapped.data
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function WorldMap(): React.ReactElement {
    const containerRef = useRef<HTMLDivElement>(null)
    const cyRef = useRef<cytoscape.Core | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [nodeCount, setNodeCount] = useState(0)
    const [selectedName, setSelectedName] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false

        async function load() {
            setLoading(true)
            setError(null)
            try {
                const graph = await fetchWorldGraph()
                if (cancelled) return

                const positions = computePositions(graph.nodes, graph.edges, STARTER_LOCATION_ID)

                const elements: ElementDefinition[] = [
                    ...graph.nodes.map((n) => ({
                        group: 'nodes' as const,
                        data: { id: n.id, name: n.name, tags: n.tags?.join(',') ?? '' },
                        position: positions.get(n.id) ?? { x: 0, y: 0 }
                    })),
                    ...graph.edges.map((e, i) => ({
                        group: 'edges' as const,
                        data: {
                            id: `edge-${i}`,
                            source: e.fromId,
                            target: e.toId,
                            direction: e.direction,
                            travelDurationMs: e.travelDurationMs ?? URBAN_MS
                        }
                    }))
                ]

                setNodeCount(graph.nodes.length)

                if (!containerRef.current) return

                // Destroy previous instance
                if (cyRef.current) {
                    cyRef.current.destroy()
                    cyRef.current = null
                }

                const cy = cytoscape({
                    container: containerRef.current,
                    elements,
                    style: CYTOSCAPE_STYLE,
                    layout: { name: 'preset' },
                    userZoomingEnabled: true,
                    userPanningEnabled: true,
                    boxSelectionEnabled: false,
                    minZoom: 0.1,
                    maxZoom: 4,
                    wheelSensitivity: 0.3
                })

                // Show location name on node tap
                cy.on('tap', 'node', (evt) => {
                    setSelectedName((evt.target as cytoscape.NodeSingular).data('name') as string)
                })
                cy.on('tap', (evt) => {
                    if (evt.target === cy) setSelectedName(null)
                })

                // Fit after mount
                cy.fit(undefined, 60)

                cyRef.current = cy
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load world graph')
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        void load()
        return () => {
            cancelled = true
        }
    }, [])

    // Destroy on unmount
    useEffect(() => {
        return () => {
            if (cyRef.current) {
                cyRef.current.destroy()
                cyRef.current = null
            }
        }
    }, [])

    return (
        <div className="relative h-full w-full flex flex-col" aria-label="World map">
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-atlas-card/80 backdrop-blur shrink-0">
                <div className="flex items-center gap-3">
                    <span className="text-atlas-accent font-semibold text-sm tracking-wide">World Map</span>
                    {!loading && !error && (
                        <span className="text-xs text-slate-400">
                            {nodeCount} {nodeCount === 1 ? 'location' : 'locations'}
                        </span>
                    )}
                </div>
                {selectedName && (
                    <span className="text-sm text-slate-200 truncate max-w-xs">
                        <span className="text-atlas-accent mr-1">◈</span>
                        {selectedName}
                    </span>
                )}
                <p className="text-xs text-slate-500 hidden sm:block">Scroll to zoom · Drag to pan · Click a node to inspect</p>
            </div>

            {/* Map canvas */}
            <div className="relative flex-1 min-h-0">
                {loading && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-atlas-bg/80">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-atlas-accent border-t-transparent" />
                        <p className="text-sm text-slate-400">Charting the Atlas…</p>
                    </div>
                )}
                {error && (
                    <div
                        role="alert"
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 bg-atlas-bg/90 px-6 text-center"
                    >
                        <p className="text-rose-400 font-medium text-sm">Map unavailable</p>
                        <p className="text-slate-400 text-xs">{error}</p>
                    </div>
                )}
                {/* Cytoscape mounts here */}
                <div
                    ref={containerRef}
                    className="absolute inset-0"
                    style={{ background: 'radial-gradient(ellipse at 40% 40%, #0d1f2d 0%, #0f1724 60%, #071226 100%)' }}
                    aria-hidden="true"
                />
            </div>

            {/* Legend */}
            {!loading && !error && (
                <div className="flex items-center gap-4 px-4 py-1.5 border-t border-white/5 bg-atlas-card/60 text-xs text-slate-500 shrink-0">
                    <span className="flex items-center gap-1.5">
                        <span
                            className="inline-block h-3 w-3 rounded-sm border"
                            style={{ background: '#0b1220', borderColor: '#6ee7b7' }}
                        />
                        Location
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="inline-block h-px w-5" style={{ background: 'rgba(110,231,183,0.4)' }} />
                        Exit
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span
                            className="inline-block h-3 w-3 rounded-sm border-2"
                            style={{ background: '#134e4a', borderColor: '#6ee7b7' }}
                        />
                        Selected
                    </span>
                </div>
            )}
        </div>
    )
}
