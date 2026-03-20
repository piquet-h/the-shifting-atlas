/**
 * WorldMap
 *
 * Visualises the world location graph using Cytoscape.js.
 * Fetches GET /api/world/graph, transforms nodes + edges into Cytoscape elements,
 * then positions each node using cardinal-direction vectors scaled by travelDurationMs.
 * The `preset` layout keeps nodes locked to their calculated coordinates.
 */
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import cytoscape, { type ElementDefinition } from 'cytoscape'
import React, { useEffect, useRef, useState } from 'react'
import { unwrapEnvelope } from '../utils/envelope'
import { computeVisibleNodeIds } from '../utils/mapDrill'
import { applySameLevelSlice } from '../utils/mapSameLevel'
import { classifyInsideNodeIds, getEdgeClassName, type EdgeKind } from '../utils/mapSemantics'
import { computePositions, URBAN_MS } from '../utils/worldMapPositions'
import WorldMapSidebar from './WorldMapSidebar'

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
    pending?: boolean
}

interface WorldGraphResponse {
    nodes: WorldGraphNode[]
    edges: WorldGraphEdge[]
}

function isPendingSyntheticNode(node: WorldGraphNode): boolean {
    return node.id.startsWith('pending:') || (node.tags?.includes('pending:synthetic') ?? false)
}

// ---------------------------------------------------------------------------
// Cytoscape stylesheet  (dark atlas theme)
// ---------------------------------------------------------------------------

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
            label: 'data(displayName)',
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
        selector: 'node.node--pending',
        style: {
            'border-color': '#60a5fa',
            'border-opacity': 0.9,
            'border-style': 'dashed',
            'background-color': '#0b1730'
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
        selector: 'edge.edge--pending',
        style: {
            'line-style': 'dashed',
            'line-color': 'rgba(59,130,246,0.45)',
            'target-arrow-color': 'rgba(59,130,246,0.75)',
            color: 'rgba(125,211,252,0.95)'
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
    const [showOutsideNodes, setShowOutsideNodes] = useState(true)
    const [showInsideNodes, setShowInsideNodes] = useState(true)
    const [sameLevelOnly, setSameLevelOnly] = useState(false)
    const [focusId, setFocusId] = useState<string | null>(null)
    const [focusName, setFocusName] = useState<string | null>(null)
    const [focusDepth, setFocusDepth] = useState<0 | 1 | 2 | 3>(1)
    const focusIdRef = useRef<string | null>(null)
    const lastNodeTapRef = useRef<{ id: string; timestamp: number } | null>(null)

    // Layout spacing: scales the underlying coordinate system (not the viewport zoom).
    const [distanceScale, setDistanceScale] = useState(DEFAULT_DISTANCE_SCALE)

    // Keep graph data around so we can compute focus visibility sets.
    const graphRef = useRef<WorldGraphResponse | null>(null)

    useEffect(() => {
        focusIdRef.current = focusId
    }, [focusId])

    // UX guard: "Same floor" slice requires focus; clear it if focus is removed.
    useEffect(() => {
        if (!focusId && sameLevelOnly) {
            setSameLevelOnly(false)
        }
    }, [focusId, sameLevelOnly])

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
                        classes: isPendingSyntheticNode(n) ? 'node--pending' : '',
                        data: {
                            id: n.id,
                            name: n.name,
                            displayName: isPendingSyntheticNode(n) ? `${n.name} (pending)` : n.name,
                            tags: n.tags?.join(',') ?? ''
                        },
                        position: positions.get(n.id) ?? { x: 0, y: 0 }
                    })),
                    ...graph.edges.map((e, i) => ({
                        group: 'edges' as const,
                        classes: [getEdgeClassName(e.direction), e.pending ? 'edge--pending' : ''].filter(Boolean).join(' '),
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
                    const id = node.data('id') as string
                    const name = node.data('name') as string
                    setSelectedName(name)
                    setSelectedId(id)

                    const now = Date.now()
                    const lastTap = lastNodeTapRef.current
                    const isDoubleTap = !!lastTap && lastTap.id === id && now - lastTap.timestamp <= 350

                    if (isDoubleTap) {
                        if (focusIdRef.current === id) {
                            setFocusId(null)
                            setFocusName(null)
                        } else {
                            setFocusId(id)
                            setFocusName(name)
                        }
                        lastNodeTapRef.current = null
                        return
                    }

                    lastNodeTapRef.current = { id, timestamp: now }
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

    // If the user hides the currently focused node category, clear focus.
    useEffect(() => {
        if (!focusId) return

        const graph = graphRef.current
        if (!graph) return

        const insideIds = classifyInsideNodeIds(graph.nodes, graph.edges)
        const focusIsInside = insideIds.has(focusId)

        if ((focusIsInside && showInsideNodes) || (!focusIsInside && showOutsideNodes)) {
            return
        }

        setFocusId(null)
        setFocusName(null)
    }, [focusId, showInsideNodes, showOutsideNodes])

    // Apply visibility filters whenever sidebar state changes.
    useEffect(() => {
        const cy = cyRef.current
        const graph = graphRef.current
        if (!cy || !graph) return

        const allowedKinds = new Set<EdgeKind>(['surface', 'interior', 'vertical'])

        const effectiveMode = focusId ? 'focus' : 'all'
        const visibleNodeIds = computeVisibleNodeIds(graph.nodes, graph.edges, {
            mode: effectiveMode,
            focusId: focusId ?? undefined,
            maxDepth: focusDepth,
            allowedKinds
        })

        const sameLevelResult = applySameLevelSlice({
            nodes: graph.nodes,
            edges: graph.edges,
            visibleNodeIds,
            focusId,
            sameLevelOnly
        })

        const insideIds = classifyInsideNodeIds(graph.nodes, graph.edges)
        if (!showInsideNodes) {
            for (const id of insideIds) visibleNodeIds.delete(id)
        }

        if (!showOutsideNodes) {
            for (const id of Array.from(visibleNodeIds)) {
                if (!insideIds.has(id)) {
                    visibleNodeIds.delete(id)
                }
            }
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

            const kindAllowed = allowedKinds.has(kind) && !(sameLevelResult.hideVerticalEdges && kind === 'vertical')
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
    }, [focusDepth, focusId, selectedId, showInsideNodes, showOutsideNodes, sameLevelOnly])

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
                <p className="text-xs text-slate-500 hidden sm:block">
                    Scroll to zoom · Drag to pan · Click to inspect · Double-click to focus
                </p>
            </div>

            {/* Map canvas */}
            <div className="relative flex-1 min-h-0">
                <WorldMapSidebar
                    showOutsideNodes={showOutsideNodes}
                    setShowOutsideNodes={setShowOutsideNodes}
                    showInsideNodes={showInsideNodes}
                    setShowInsideNodes={setShowInsideNodes}
                    sameLevelOnly={sameLevelOnly}
                    setSameLevelOnly={setSameLevelOnly}
                    distanceScale={distanceScale}
                    setDistanceScale={setDistanceScale}
                    selectedName={selectedName}
                    selectedId={selectedId}
                    focusName={focusName}
                    focusId={focusId}
                    focusDepth={focusDepth}
                    setFocusDepth={setFocusDepth}
                    onFocusSelected={() => {
                        if (!selectedId || !selectedName) return
                        setFocusId(selectedId)
                        setFocusName(selectedName)
                    }}
                    onClearFocus={() => {
                        setFocusId(null)
                        setFocusName(null)
                        setSameLevelOnly(false)
                    }}
                    onReset={() => {
                        setShowOutsideNodes(true)
                        setShowInsideNodes(true)
                        setSameLevelOnly(false)
                        setFocusId(null)
                        setFocusName(null)
                        setFocusDepth(1)
                        setDistanceScale(DEFAULT_DISTANCE_SCALE)
                        setSelectedId(null)
                        setSelectedName(null)
                    }}
                />

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
