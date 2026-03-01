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
import { computeVisibleNodeIds } from '../utils/mapDrill'
import { computeInsideNodeIds, getEdgeClassName } from '../utils/mapSemantics'
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
        selector: 'edge.edge--interior',
        style: {
            'line-style': 'dashed',
            'line-color': 'rgba(147,197,253,0.35)',
            'target-arrow-color': 'rgba(147,197,253,0.65)',
            color: 'rgba(147,197,253,0.9)'
        }
    },
    {
        selector: 'edge.edge--vertical',
        style: {
            'line-style': 'dotted',
            'line-color': 'rgba(251,191,36,0.3)',
            'target-arrow-color': 'rgba(251,191,36,0.6)',
            color: 'rgba(251,191,36,0.9)'
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

const DEFAULT_DISTANCE_SCALE = 1.8

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
    const [selectedId, setSelectedId] = useState<string | null>(null)

    // Sidebar controls
    const [showSurface, setShowSurface] = useState(true)
    const [showInterior, setShowInterior] = useState(true)
    const [showVertical, setShowVertical] = useState(true)
    const [showInsideNodes, setShowInsideNodes] = useState(true)
    const [viewMode, setViewMode] = useState<'all' | 'focus'>('all')
    const [focusId, setFocusId] = useState<string | null>(null)
    const [focusName, setFocusName] = useState<string | null>(null)
    const [focusDepth, setFocusDepth] = useState<0 | 1 | 2 | 3>(1)

    // Layout spacing: scales the underlying coordinate system (not the viewport zoom).
    const [distanceScale, setDistanceScale] = useState(DEFAULT_DISTANCE_SCALE)

    // Keep graph data around so we can compute focus visibility sets.
    const graphRef = useRef<WorldGraphResponse | null>(null)

    useEffect(() => {
        let cancelled = false

        async function load() {
            setLoading(true)
            setError(null)
            try {
                const graph = await fetchWorldGraph()
                if (cancelled) return

                graphRef.current = graph

                // Use a stable default for the initial layout; a separate effect
                // recomputes positions when the slider changes.
                const positions = computePositions(graph.nodes, graph.edges, STARTER_LOCATION_ID, { distanceScale: DEFAULT_DISTANCE_SCALE })

                const elements: ElementDefinition[] = [
                    ...graph.nodes.map((n) => ({
                        group: 'nodes' as const,
                        data: { id: n.id, name: n.name, tags: n.tags?.join(',') ?? '' },
                        position: positions.get(n.id) ?? { x: 0, y: 0 }
                    })),
                    ...graph.edges.map((e, i) => ({
                        group: 'edges' as const,
                        classes: getEdgeClassName(e.direction),
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
                    const node = evt.target as cytoscape.NodeSingular
                    setSelectedName(node.data('name') as string)
                    setSelectedId(node.data('id') as string)
                })
                cy.on('tap', (evt) => {
                    if (evt.target === cy) {
                        setSelectedName(null)
                        setSelectedId(null)
                    }
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

    // Recompute node positions when distanceScale changes.
    useEffect(() => {
        const cy = cyRef.current
        const graph = graphRef.current
        if (!cy || !graph) return

        const positions = computePositions(graph.nodes, graph.edges, STARTER_LOCATION_ID, { distanceScale })

        cy.batch(() => {
            cy.nodes().forEach((n) => {
                const id = n.data('id') as string
                const pos = positions.get(id)
                if (!pos) return
                n.position(pos)
            })
        })

        cy.fit(cy.elements(':visible'), 60)
    }, [distanceScale])

    // If the user hides inside nodes, ensure we are not focusing an inside node.
    useEffect(() => {
        if (showInsideNodes) return
        if (viewMode !== 'focus' || !focusId) return

        const graph = graphRef.current
        if (!graph) return

        const insideIds = computeInsideNodeIds(graph.edges)
        if (!insideIds.has(focusId)) return

        setFocusId(null)
        setFocusName(null)
        setViewMode('all')
    }, [focusId, showInsideNodes, viewMode])

    // Apply visibility filters whenever sidebar state changes.
    useEffect(() => {
        const cy = cyRef.current
        const graph = graphRef.current
        if (!cy || !graph) return

        const allowedKinds = new Set<import('../utils/mapSemantics').EdgeKind>()
        if (showSurface) allowedKinds.add('surface')
        if (showInterior) allowedKinds.add('interior')
        if (showVertical) allowedKinds.add('vertical')

        const effectiveMode = viewMode === 'focus' && focusId ? 'focus' : 'all'
        const visibleNodeIds = computeVisibleNodeIds(graph.nodes, graph.edges, {
            mode: effectiveMode,
            focusId: focusId ?? undefined,
            maxDepth: focusDepth,
            allowedKinds
        })

        if (!showInsideNodes) {
            const insideIds = computeInsideNodeIds(graph.edges)
            for (const id of insideIds) visibleNodeIds.delete(id)
        }

        // Node visibility
        cy.nodes().forEach((n) => {
            const id = n.data('id') as string
            // Cytoscape typings don't expose show()/hide() on singulars, so use display style.
            n.style('display', visibleNodeIds.has(id) ? 'element' : 'none')
        })

        // Edge visibility: must be allowed kind AND endpoints visible.
        cy.edges().forEach((e) => {
            const source = e.data('source') as string
            const target = e.data('target') as string

            const kind = e.hasClass('edge--interior') ? 'interior' : e.hasClass('edge--vertical') ? 'vertical' : 'surface'

            const kindAllowed = allowedKinds.has(kind)
            const endpointsVisible = visibleNodeIds.has(source) && visibleNodeIds.has(target)
            e.style('display', kindAllowed && endpointsVisible ? 'element' : 'none')
        })

        // If selection is now hidden, clear selection.
        if (selectedId && !visibleNodeIds.has(selectedId)) {
            setSelectedId(null)
            setSelectedName(null)
        }

        // Keep viewport comfortable.
        cy.fit(cy.elements(':visible'), 60)
    }, [focusDepth, focusId, selectedId, showInsideNodes, showInterior, showSurface, showVertical, viewMode])

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
        <div className="relative flex-1 min-h-0 w-full flex flex-col" aria-label="World map">
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
                {/* Sidebar controls */}
                <aside
                    className="absolute left-3 top-3 z-20 w-[260px] max-w-[calc(100%-1.5rem)] rounded-lg border border-white/10 bg-atlas-card/90 backdrop-blur px-3 py-3 text-sm text-slate-200 shadow-lg"
                    aria-label="Map filters"
                >
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <p className="text-xs font-semibold text-slate-200">Drill view</p>
                            <p className="text-[11px] text-slate-400">Filter by exit semantics (in/out, up/down) and focus a location.</p>
                        </div>
                        <button
                            type="button"
                            className="text-[11px] text-slate-300 hover:text-white underline underline-offset-2"
                            onClick={() => {
                                setShowSurface(true)
                                setShowInterior(true)
                                setShowVertical(true)
                                setViewMode('all')
                                setFocusId(null)
                                setFocusName(null)
                                setFocusDepth(1)
                            }}
                        >
                            Reset
                        </button>
                    </div>

                    <div className="mt-3 space-y-2">
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-emerald-300"
                                checked={showSurface}
                                onChange={(e) => setShowSurface(e.target.checked)}
                            />
                            <span>Surface (north/east/…)</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-sky-300"
                                checked={showInterior}
                                onChange={(e) => setShowInterior(e.target.checked)}
                            />
                            <span>Interior (in/out)</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-amber-300"
                                checked={showVertical}
                                onChange={(e) => setShowVertical(e.target.checked)}
                            />
                            <span>Vertical (up/down)</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-violet-300"
                                checked={showInsideNodes}
                                onChange={(e) => setShowInsideNodes(e.target.checked)}
                            />
                            <span>Inside nodes (targets of “in”)</span>
                        </label>
                    </div>

                    <div className="mt-3 border-t border-white/10 pt-3">
                        <div className="space-y-1">
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs text-slate-300" htmlFor="map-distance-scale">
                                    Layout scale
                                </label>
                                <span className="text-[11px] tabular-nums text-slate-400">{distanceScale.toFixed(1)}×</span>
                            </div>
                            <input
                                id="map-distance-scale"
                                type="range"
                                min={0.8}
                                max={3.2}
                                step={0.1}
                                value={distanceScale}
                                onChange={(e) => setDistanceScale(Number(e.target.value))}
                                className="w-full accent-emerald-300"
                            />
                            <p className="text-[11px] text-slate-400">
                                Spreads nodes out without changing travel times. (Zoom/pan still works.)
                            </p>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                            <label className="text-xs text-slate-300" htmlFor="map-view-mode">
                                Mode
                            </label>
                            <select
                                id="map-view-mode"
                                className="bg-atlas-bg/40 border border-white/10 rounded px-2 py-1 text-xs"
                                value={viewMode}
                                onChange={(e) => setViewMode(e.target.value as 'all' | 'focus')}
                            >
                                <option value="all">Whole atlas</option>
                                <option value="focus">Focus</option>
                            </select>
                        </div>

                        {viewMode === 'focus' && (
                            <div className="mt-2 space-y-2">
                                <div className="text-[11px] text-slate-400">
                                    Focus: <span className="text-slate-200">{focusName ?? '—'}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        className="text-[11px] px-2 py-1 rounded border border-white/10 bg-atlas-bg/40 hover:bg-atlas-bg/60 disabled:opacity-40"
                                        disabled={!selectedId || !selectedName}
                                        onClick={() => {
                                            if (!selectedId || !selectedName) return
                                            setFocusId(selectedId)
                                            setFocusName(selectedName)
                                        }}
                                    >
                                        Focus selected
                                    </button>
                                    <button
                                        type="button"
                                        className="text-[11px] px-2 py-1 rounded border border-white/10 bg-atlas-bg/40 hover:bg-atlas-bg/60 disabled:opacity-40"
                                        disabled={!focusId}
                                        onClick={() => {
                                            setFocusId(null)
                                            setFocusName(null)
                                            setViewMode('all')
                                        }}
                                    >
                                        Clear
                                    </button>
                                </div>

                                <div className="flex items-center justify-between">
                                    <label className="text-xs text-slate-300" htmlFor="map-focus-depth">
                                        Depth
                                    </label>
                                    <select
                                        id="map-focus-depth"
                                        className="bg-atlas-bg/40 border border-white/10 rounded px-2 py-1 text-xs"
                                        value={focusDepth}
                                        onChange={(e) => setFocusDepth(Number(e.target.value) as 0 | 1 | 2 | 3)}
                                    >
                                        <option value={0}>0 (just focus)</option>
                                        <option value={1}>1</option>
                                        <option value={2}>2</option>
                                        <option value={3}>3</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                </aside>

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
