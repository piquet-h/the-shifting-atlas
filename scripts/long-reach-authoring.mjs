#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_OVERLAY = 'docs/architecture/the-long-reach-authoring-overlay.json'
const DEFAULT_ATLAS = 'backend/src/data/theLongReachMacroAtlas.json'
const DEFAULT_SEED = 'backend/src/data/villageLocations.json'
const DEFAULT_RENDER = 'docs/architecture/the-long-reach-authoring-overlay.svg'
const DEFAULT_PNG_RENDER = 'docs/architecture/the-long-reach-authoring-overlay.png'

const MAP_WIDTH = 7040
const MAP_HEIGHT = 8480
const CANVAS_WIDTH = 11200
const CANVAS_HEIGHT = 8480
const PNG_WIDTH = 2240
const PNG_HEIGHT = 1696

// Milford Sound / Mosswell Fiordhead inset crop in normalized map coordinates
const INSET_BOUNDS = { left: 0.13, top: 0.51, right: 0.25, bottom: 0.625 }
// Approximate Cleddau-like river trace feeding Mosswell at the head of Milford Sound
const MOSSWELL_RIVER_POINTS = [
    [0.201, 0.573],
    [0.1955, 0.568],
    [0.19, 0.562]
]

const READINESS_STATES = new Set(['ready', 'partial', 'blocked', 'deferred'])
const PRESSURE_EVENTS = new Set(['World.Frontier.BoundaryReached', 'World.Frontier.BoundaryApproach'])
const READINESS_ORDER = { ready: 0, partial: 1, deferred: 2, blocked: 3 }
const STATUS_COLORS = {
    authored: '#1b8a3d',
    'transition-ready': '#1565c0',
    'next-to-author': '#e09100',
    blocked: '#c62828',
    'inspiration-only': '#607d8b'
}

const require = createRequire(import.meta.url)
const Ajv = require('ajv')
const sidecarValidator = new Ajv({ allErrors: true })
const validateSidecarSchema = sidecarValidator.compile(
    JSON.parse(readFileSync(new URL('../docs/architecture/long-reach-authoring-overlay.schema.json', import.meta.url), 'utf8'))
)

function fail(message) {
    throw new Error(message)
}

function atlasNodes(atlas) {
    const nodes = atlas?.macroGraph?.nodes
    if (!Array.isArray(nodes)) fail('Atlas must contain macroGraph.nodes.')
    return nodes
}

function polygonSignedArea(points) {
    let sum = 0
    for (let i = 0; i < points.length; i++) {
        const [x1, y1] = points[i]
        const [x2, y2] = points[(i + 1) % points.length]
        sum += x1 * y2 - x2 * y1
    }
    return Math.abs(sum) / 2
}

function polylineLength(points) {
    let total = 0
    for (let i = 1; i < points.length; i++) {
        total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
    }
    return total
}

export function validateOverlay(sidecar, atlas, seedLocations = []) {
    if (!validateSidecarSchema(sidecar)) {
        fail(`Overlay schema validation failed: ${sidecarValidator.errorsText(validateSidecarSchema.errors)}`)
    }

    const nodes = new Map(atlasNodes(atlas).map((node) => [node.id, node]))
    const seedIds = Array.isArray(seedLocations) && seedLocations.length > 0 ? new Set(seedLocations.map((loc) => loc.id)) : null
    const seen = new Set()

    for (const entry of sidecar.entries) {
        if (seen.has(entry.id)) fail(`Overlay contains duplicate entry id "${entry.id}".`)
        seen.add(entry.id)

        const { geometry } = entry
        if (geometry.type === 'polygon' && polygonSignedArea(geometry.points) <= 1e-8) {
            fail(`Overlay entry "${entry.id}" has degenerate zero-area polygon geometry.`)
        }
        if (geometry.type === 'line' && polylineLength(geometry.points) <= 1e-6) {
            fail(`Overlay entry "${entry.id}" has degenerate zero-length line geometry.`)
        }

        for (const [field, expectedClass] of [
            ['areaRefs', 'area'],
            ['corridorRefs', 'corridor'],
            ['barrierRefs', 'barrier'],
            ['segmentRefs', null],
            ['entrySegmentRef', null]
        ]) {
            const refs = field === 'entrySegmentRef' ? (entry[field] ? [entry[field]] : []) : (entry[field] ?? [])
            for (const ref of refs) {
                if (!nodes.has(ref)) fail(`Overlay entry "${entry.id}" references unknown atlas node "${ref}".`)
                if (expectedClass && nodes.get(ref).nodeClass !== expectedClass) {
                    fail(`Overlay entry "${entry.id}" ${field} ref "${ref}" nodeClass must be ${expectedClass}.`)
                }
            }
        }

        if (entry.entryAnchorId && seedIds && !seedIds.has(entry.entryAnchorId)) {
            fail(`Overlay entry "${entry.id}" references unknown seed entryAnchorId "${entry.entryAnchorId}".`)
        }
    }

    return true
}

function entryAllRefs(entry) {
    const refs = new Set([
        ...(entry.areaRefs ?? []),
        ...(entry.corridorRefs ?? []),
        ...(entry.barrierRefs ?? []),
        ...(entry.segmentRefs ?? [])
    ])
    if (entry.entrySegmentRef) refs.add(entry.entrySegmentRef)
    return refs
}

function resolveAtlasReadiness(atlas, entry) {
    const candidates = []
    if (entry.authoringReadiness && READINESS_STATES.has(entry.authoringReadiness)) {
        candidates.push(entry.authoringReadiness)
    }
    const refs = entryAllRefs(entry)
    for (const node of atlasNodes(atlas)) {
        if (refs.has(node.id) && READINESS_STATES.has(node.authoringReadiness)) {
            candidates.push(node.authoringReadiness)
        }
    }
    for (const edge of atlas.macroGraph?.edges ?? []) {
        const transition = edge?.transition
        if (
            edge?.relation === 'macro-transition' &&
            (refs.has(transition?.destinationAreaRef) || refs.has(transition?.entrySegmentRef)) &&
            READINESS_STATES.has(transition?.destinationReadiness)
        ) {
            candidates.push(transition.destinationReadiness)
        }
    }
    if (entry.authoringState === 'inspiration-only') return 'unspecified'
    return candidates.sort((left, right) => READINESS_ORDER[right] - READINESS_ORDER[left])[0] ?? 'unspecified'
}

function xmlEscape(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;')
}

function pointToPixels(point, width = MAP_WIDTH, height = MAP_HEIGHT) {
    return `${(point[0] * width).toFixed(1)},${(point[1] * height).toFixed(1)}`
}

function centroid(points) {
    const sum = points.reduce(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0])
    return [sum[0] / points.length, sum[1] / points.length]
}

function geometryIntersectsBounds(geometry, bounds) {
    const pts = geometry.type === 'marker' ? [geometry.anchor] : geometry.points
    return pts.some(([x, y]) => x >= bounds.left - 0.03 && x <= bounds.right + 0.03 && y >= bounds.top - 0.03 && y <= bounds.bottom + 0.03)
}

function isPointInsideInset(point) {
    return (
        point[0] >= INSET_BOUNDS.left + 0.005 &&
        point[0] <= INSET_BOUNDS.right - 0.005 &&
        point[1] >= INSET_BOUNDS.top + 0.005 &&
        point[1] <= INSET_BOUNDS.bottom - 0.005
    )
}

export function renderOverlay(sidecar, atlas, sourceHref, seedLocations = []) {
    validateOverlay(sidecar, atlas, seedLocations)

    const insetViewX = (INSET_BOUNDS.left * MAP_WIDTH).toFixed(1)
    const insetViewY = (INSET_BOUNDS.top * MAP_HEIGHT).toFixed(1)
    const insetViewW = ((INSET_BOUNDS.right - INSET_BOUNDS.left) * MAP_WIDTH).toFixed(1)
    const insetViewH = ((INSET_BOUNDS.bottom - INSET_BOUNDS.top) * MAP_HEIGHT).toFixed(1)

    const layerOrder = { region: 0, corridor: 1, barrier: 2 }
    const sortedEntries = [...sidecar.entries].sort((left, right) => {
        const leftMarker = left.geometry.type === 'marker' ? 3 : (layerOrder[left.kind] ?? 0)
        const rightMarker = right.geometry.type === 'marker' ? 3 : (layerOrder[right.kind] ?? 0)
        return leftMarker - rightMarker
    })

    const overviewShapes = []
    const overviewLabels = []
    const insetShapes = []
    const insetLabels = []
    const denseMap = sidecar.entries.length > 8

    for (const entry of sortedEntries) {
        const readiness =
            entry.authoringState === 'inspiration-only' ? 'unspecified' : (entry.authoringReadiness ?? resolveAtlasReadiness(atlas, entry))
        const status = entry.authoringState
        const color = STATUS_COLORS[status]
        const blocked = readiness === 'blocked' || readiness === 'deferred' || readiness === 'partial'
        const label = xmlEscape(entry.label)
        const geometry = entry.geometry
        const isInspiration = status === 'inspiration-only'

        overviewShapes.push(
            `<g class="${entry.kind}${blocked ? ' runtime-blocked' : ''}" data-ref="${xmlEscape(entry.id)}" data-status="${status}" data-readiness="${readiness}"><title>${label}: coverage ${entry.coverage}; readiness snapshot ${readiness}; ${xmlEscape(entry.notes)}</title>`
        )

        if (geometry.type === 'marker') {
            const [x, y] = geometry.anchor
            const radius = (geometry.radius ?? 0.012) * MAP_WIDTH
            const strokeWidth = Math.max(2, Math.min(blocked ? 28 : 14, radius * 0.28))
            overviewShapes.push(
                `<circle cx="${(x * MAP_WIDTH).toFixed(1)}" cy="${(y * MAP_HEIGHT).toFixed(1)}" r="${radius.toFixed(1)}" fill="${color}" fill-opacity=".88" stroke="${blocked ? STATUS_COLORS.blocked : '#ffffff'}" stroke-width="${strokeWidth.toFixed(1)}"/>`
            )
            const [lx, ly] = geometry.labelAnchor ?? [x, y + (geometry.radius ?? 0.012) + 0.008]
            overviewLabels.push(
                `<text class="label" x="${(lx * MAP_WIDTH).toFixed(1)}" y="${(ly * MAP_HEIGHT).toFixed(1)}" text-anchor="middle">${label}</text>`
            )
        } else if (geometry.type === 'polygon') {
            const points = geometry.points.map((point) => pointToPixels(point)).join(' ')
            const [lx, ly] = geometry.labelAnchor ?? centroid(geometry.points)
            overviewShapes.push(
                `<polygon points="${points}" fill="${color}" fill-opacity="${isInspiration ? '.15' : '.24'}" stroke="${blocked && !isInspiration ? STATUS_COLORS.blocked : color}" stroke-width="${blocked && !isInspiration ? 22 : 14}"${isInspiration ? ' stroke-dasharray="36 26"' : ''}/>`
            )
            if (!denseMap || !isPointInsideInset([lx, ly])) {
                overviewLabels.push(
                    `<text class="label${isInspiration ? ' label-muted' : ''}" x="${(lx * MAP_WIDTH).toFixed(1)}" y="${(ly * MAP_HEIGHT).toFixed(1)}" text-anchor="middle">${label}</text>`
                )
            }
        } else {
            const points = geometry.points.map((point) => pointToPixels(point)).join(' ')
            const [lx, ly] = geometry.labelAnchor ?? geometry.points[Math.floor(geometry.points.length / 2)]
            if (entry.kind === 'barrier') {
                overviewShapes.push(`<polyline class="barrier-line" points="${points}" stroke="${color}" fill="none"/>`)
            } else {
                if (blocked) {
                    overviewShapes.push(
                        `<polyline points="${points}" stroke="${STATUS_COLORS.blocked}" style="stroke-width:58" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
                    )
                }
                overviewShapes.push(`<polyline class="corridor-line" points="${points}" stroke="${color}" fill="none"/>`)
            }
            if (!denseMap || !isPointInsideInset([lx, ly])) {
                overviewLabels.push(
                    `<text class="label" x="${(lx * MAP_WIDTH).toFixed(1)}" y="${Math.max(48, ly * MAP_HEIGHT).toFixed(1)}" text-anchor="middle">${label}</text>`
                )
            }
        }
        overviewShapes.push('</g>')

        if (geometryIntersectsBounds(geometry, INSET_BOUNDS)) {
            if (geometry.type === 'marker') {
                const [x, y] = geometry.anchor
                const radius = (geometry.radius ?? 0.0012) * MAP_WIDTH
                insetShapes.push(
                    `<circle cx="${(x * MAP_WIDTH).toFixed(1)}" cy="${(y * MAP_HEIGHT).toFixed(1)}" r="${radius.toFixed(1)}" fill="${color}" fill-opacity=".9" stroke="#ffffff" stroke-width="2.4"/>`,
                    `<circle cx="${(x * MAP_WIDTH).toFixed(1)}" cy="${(y * MAP_HEIGHT).toFixed(1)}" r="${(radius * 2.1).toFixed(1)}" fill="none" stroke="${color}" stroke-width="2.2" stroke-dasharray="5 4"/>`
                )
                insetLabels.push(
                    `<text class="inset-label inset-village" x="${(x * MAP_WIDTH + radius * 2.6).toFixed(1)}" y="${(y * MAP_HEIGHT + 4).toFixed(1)}" text-anchor="start">${label} (authored)</text>`
                )
            } else if (geometry.type === 'polygon') {
                const points = geometry.points.map((point) => pointToPixels(point)).join(' ')
                insetShapes.push(
                    `<polygon points="${points}" fill="${color}" fill-opacity=".07" stroke="${blocked && !isInspiration ? STATUS_COLORS.blocked : color}" stroke-width="2.6" stroke-opacity=".55" stroke-dasharray="10 7"/>`
                )
                const [lx, ly] = geometry.labelAnchor ?? centroid(geometry.points)
                if (isPointInsideInset([lx, ly])) {
                    insetLabels.push(
                        `<text class="inset-label" x="${(lx * MAP_WIDTH).toFixed(1)}" y="${(ly * MAP_HEIGHT).toFixed(1)}" text-anchor="middle">${label}</text>`
                    )
                }
            } else {
                const points = geometry.points.map((point) => pointToPixels(point)).join(' ')
                const [lx, ly] = geometry.labelAnchor ?? geometry.points[Math.floor(geometry.points.length / 2)]
                if (entry.kind === 'barrier') {
                    insetShapes.push(
                        `<polyline points="${points}" stroke="${color}" stroke-width="7.5" stroke-dasharray="14 9" stroke-linecap="round" fill="none"/>`
                    )
                } else {
                    if (blocked) {
                        insetShapes.push(
                            `<polyline points="${points}" stroke="${STATUS_COLORS.blocked}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
                        )
                    }
                    insetShapes.push(
                        `<polyline points="${points}" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
                    )
                }
                const clampedX = Math.min(INSET_BOUNDS.right - 0.014, Math.max(INSET_BOUNDS.left + 0.014, lx))
                const clampedY = Math.min(INSET_BOUNDS.bottom - 0.008, Math.max(INSET_BOUNDS.top + 0.012, ly))
                insetLabels.push(
                    `<text class="inset-label" x="${(clampedX * MAP_WIDTH).toFixed(1)}" y="${(clampedY * MAP_HEIGHT).toFixed(1)}" text-anchor="middle">${label}</text>`
                )
            }
        }
    }

    const riverPoints = MOSSWELL_RIVER_POINTS.map((point) => pointToPixels(point)).join(' ')
    const queueReport = buildAuthoringQueue(sidecar, atlas, [], seedLocations)
    const stateCounts = { authored: 0, 'transition-ready': 0, 'next-to-author': 0, blocked: 0, 'inspiration-only': 0 }
    for (const entry of sidecar.entries) {
        stateCounts[entry.authoringState] = (stateCounts[entry.authoringState] ?? 0) + 1
    }

    const legendItems = [
        ['authored', STATUS_COLORS.authored, 'solid'],
        ['transition-ready', STATUS_COLORS['transition-ready'], 'solid'],
        ['next-to-author', STATUS_COLORS['next-to-author'], 'solid'],
        ['blocked', STATUS_COLORS.blocked, 'solid'],
        ['inspiration-only', STATUS_COLORS['inspiration-only'], 'dashed-box'],
        ['runtime handoff currently blocked', STATUS_COLORS.blocked, 'ring'],
        ['river feeding fiordhead (inset)', '#0288d1', 'line']
    ]

    const rows = [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" role="img" aria-labelledby="title description">`,
        '<title id="title">The Long Reach authoring readiness overlay</title>',
        '<desc id="description">Two-panel authoring readiness overview and zoomed Milford Sound / Mosswell Fiordhead inset. The JSON macro atlas and seed locations remain authoritative for runtime transitions.</desc>',
        '<style>',
        'text{font-family:Arial,Helvetica,sans-serif;font-weight:700;fill:#13202c}',
        '.corridor-line{stroke-width:38;stroke-linecap:round;stroke-linejoin:round}',
        '.barrier-line{stroke-width:30;stroke-dasharray:44 26;stroke-linecap:round}',
        '.label{font-size:52px;paint-order:stroke;stroke:#ffffff;stroke-width:11px;stroke-linejoin:round}',
        '.label-muted{fill:#37474f;font-size:46px}',
        '.inset-label{font-size:15px;paint-order:stroke;stroke:#ffffff;stroke-width:3.8px;stroke-linejoin:round}',
        '.inset-village{fill:#0d5323;font-size:16.5px}',
        '.panel-title{font-size:70px;fill:#0f172a}',
        '.panel-sub{font-size:44px;font-weight:600;fill:#334155}',
        '.legend{font-size:48px}',
        '.legend-note{font-size:41px;font-weight:600;fill:#334155}',
        '.queue-row{font-size:39px;font-weight:600;fill:#1e293b}',
        '</style>',
        `<rect x="0" y="0" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="#eef2f6"/>`,
        '<g aria-label="Full Long Reach overview">',
        `<image href="${xmlEscape(sourceHref)}" x="0" y="0" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" preserveAspectRatio="none"/>`,
        '<g aria-label="Authoring segments">',
        ...overviewShapes,
        '</g>',
        '<g aria-label="Overview labels">',
        ...overviewLabels,
        '</g>',
        '<g aria-label="Milford Sound inset callout">',
        `<rect x="${insetViewX}" y="${insetViewY}" width="${insetViewW}" height="${insetViewH}" fill="none" stroke="#0f172a" stroke-width="18" stroke-dasharray="36 22" rx="14"/>`,
        `<text class="label" x="${(Number(insetViewX) + Number(insetViewW) / 2).toFixed(1)}" y="${(Number(insetViewY) - 34).toFixed(1)}" text-anchor="middle">Milford Sound / Mosswell Inset →</text>`,
        `<line x1="${(Number(insetViewX) + Number(insetViewW)).toFixed(1)}" y1="${insetViewY}" x2="7220" y2="340" stroke="#0f172a" stroke-width="10" stroke-dasharray="28 20" stroke-opacity=".55"/>`,
        `<line x1="${(Number(insetViewX) + Number(insetViewW)).toFixed(1)}" y1="${(Number(insetViewY) + Number(insetViewH)).toFixed(1)}" x2="7220" y2="4726" stroke="#0f172a" stroke-width="10" stroke-dasharray="28 20" stroke-opacity=".55"/>`,
        '</g>',
        '</g>',
        `<line x1="${MAP_WIDTH}" y1="0" x2="${MAP_WIDTH}" y2="${CANVAS_HEIGHT}" stroke="#1e293b" stroke-width="12"/>`,
        '<g aria-label="Milford Sound and Mosswell inset">',
        '<text class="panel-title" x="7220" y="150">Milford Sound &amp; Mosswell Fiordhead (4.5× Inset)</text>',
        '<text class="panel-sub" x="7220" y="220">Mosswell sits at small-town scale on the river mouth at the head of Milford Sound</text>',
        '<rect x="7212" y="282" width="3816" height="4452" rx="20" fill="#ffffff" stroke="#1e293b" stroke-width="10"/>',
        `<svg x="7220" y="290" width="3800" height="4436" viewBox="${insetViewX} ${insetViewY} ${insetViewW} ${insetViewH}">`,
        `<image href="${xmlEscape(sourceHref)}" x="0" y="0" width="${MAP_WIDTH}" height="${MAP_HEIGHT}" preserveAspectRatio="none"/>`,
        `<polyline data-feature="mosswell-river-trace" points="${riverPoints}" stroke="#ffffff" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
        `<polyline points="${riverPoints}" stroke="#0288d1" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
        ...insetShapes,
        ...insetLabels,
        `<g transform="translate(${(Number(insetViewX) + 28).toFixed(1)} ${(Number(insetViewY) + Number(insetViewH) - 42).toFixed(1)})" aria-label="Inset scale bar">`,
        '<rect x="-10" y="-22" width="215" height="44" rx="6" fill="#ffffff" fill-opacity=".9" stroke="#334155" stroke-width="1.8"/>',
        '<line x1="6" y1="8" x2="186" y2="8" stroke="#0f172a" stroke-width="3.5"/>',
        '<line x1="6" y1="0" x2="6" y2="14" stroke="#0f172a" stroke-width="3"/>',
        '<line x1="96" y1="2" x2="96" y2="14" stroke="#0f172a" stroke-width="2.5"/>',
        '<line x1="186" y1="0" x2="186" y2="14" stroke="#0f172a" stroke-width="3"/>',
        '<text class="inset-label" x="96" y="-4" text-anchor="middle">~20 km (1:1,000,000 base)</text>',
        '</g>',
        '</svg>',
        '</g>',
        '<g transform="translate(7220 4860)" aria-label="Legend">',
        '<rect width="3800" height="1580" rx="22" fill="#ffffff" stroke="#1e293b" stroke-width="8"/>',
        '<text class="panel-title" x="60" y="92">Authoring Status Legend</text>'
    ]

    legendItems.forEach(([text, color, style], index) => {
        const col = index < 4 ? 0 : 1
        const row = index < 4 ? index : index - 4
        const x = 70 + col * 1860
        const y = 185 + row * 105
        if (style === 'ring') {
            rows.push(`<circle cx="${x + 24}" cy="${y - 14}" r="22" fill="#ffffff" stroke="${color}" stroke-width="9"/>`)
        } else if (style === 'dashed-box') {
            rows.push(
                `<rect x="${x + 2}" y="${y - 36}" width="44" height="44" rx="6" fill="${color}" fill-opacity=".22" stroke="${color}" stroke-width="5" stroke-dasharray="10 7"/>`
            )
        } else if (style === 'line') {
            rows.push(
                `<line x1="${x}" y1="${y - 14}" x2="${x + 48}" y2="${y - 14}" stroke="${color}" stroke-width="11" stroke-linecap="round"/>`
            )
        } else {
            rows.push(`<circle cx="${x + 24}" cy="${y - 14}" r="22" fill="${color}" stroke="${color}" stroke-width="3"/>`)
        }
        rows.push(`<text class="legend" x="${x + 72}" y="${y}">${text}</text>`)
    })

    rows.push(
        '<line x1="60" y1="640" x2="3740" y2="640" stroke="#cbd5e1" stroke-width="4"/>',
        `<text class="legend-note" x="60" y="735">Counts — authored: ${stateCounts.authored} | transition-ready: ${stateCounts['transition-ready']} | next-to-author: ${stateCounts['next-to-author']} | blocked: ${stateCounts.blocked} | inspiration-only: ${stateCounts['inspiration-only']}</text>`,
        '<text class="legend-note" x="60" y="830">• Approximate footprints — not surveyed GIS boundaries.</text>',
        '<text class="legend-note" x="60" y="920">• transition-ready = partial readiness snapshot, not automatic runtime permission.</text>',
        '<text class="legend-note" x="60" y="1010">• Only Mosswell Fiordhead (35 local locations) is hand-authored; rest is frontier or inspiration.</text>',
        '<text class="legend-note" x="60" y="1100">• Atlas/runtime policy (theLongReachMacroAtlas.json) remains authoritative; coverage is independent.</text>',
        '</g>',
        '<g transform="translate(7220 6560)" aria-label="Expansion queue summary">',
        '<rect width="3800" height="1760" rx="22" fill="#ffffff" stroke="#1e293b" stroke-width="8"/>',
        '<text class="panel-title" x="60" y="92">Next-to-Author Expansion Queue (Static Default)</text>',
        '<text class="panel-sub" x="60" y="160">Ordered outward from Mosswell; combine with runtime boundary signals via npm run report:long-reach</text>',
        '<line x1="60" y1="205" x2="3740" y2="205" stroke="#cbd5e1" stroke-width="4"/>'
    )

    const topQueue = queueReport.queue.slice(0, 6)
    if (topQueue.length === 0) {
        rows.push('<text class="queue-row" x="60" y="300">No next-to-author segments currently queued.</text>')
    } else {
        topQueue.forEach((item, index) => {
            const y = 290 + index * 225
            const dirs = item.outboundDirections.length > 0 ? ` [${item.outboundDirections.join('/')}]` : ''
            const anchor = item.entryAnchorName
                ? `from ${item.entryAnchorName}`
                : item.entrySegmentRef
                  ? `via ${item.entrySegmentRef}`
                  : 'second-ring'
            rows.push(
                `<text class="legend" x="60" y="${y}">#${index + 1}  ${xmlEscape(item.label)}${xmlEscape(dirs)} — priority ${item.priority ?? '—'} (atlas: ${item.runtimeReadiness})</text>`,
                `<text class="queue-row" x="120" y="${y + 62}">Departure: ${xmlEscape(anchor)}  |  Refs: ${xmlEscape(item.mappedRefs.join(', '))}</text>`
            )
        })
    }

    rows.push('</g>', '</svg>', '')
    return rows.join('\n')
}

async function launchPreviewBrowser() {
    const { chromium } = await import('playwright')
    for (const options of [undefined, { channel: 'msedge' }, { channel: 'chrome' }]) {
        try {
            return await chromium.launch(options)
        } catch {
            // Try next installed Chromium channel
        }
    }
    fail('Could not launch Playwright Chromium, Microsoft Edge, or Chrome to rasterize PNG preview.')
}

export async function rasterizeOverlayPng(svgContent, sourceImagePath, pngOutputPath) {
    const imageBytes = await readFile(sourceImagePath)
    const dataUri = `data:image/jpeg;base64,${imageBytes.toString('base64')}`
    const inlineSvg = svgContent
        .replaceAll(/<image href="[^"]+"/g, `<image href="${dataUri}"`)
        .replace(`width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"`, 'style="width:100vw;height:100vh;display:block"')
    const html = `<!doctype html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;overflow:hidden;background:#eef2f6">${inlineSvg}</body></html>`

    const browser = await launchPreviewBrowser()
    try {
        const page = await browser.newPage({
            viewport: { width: PNG_WIDTH, height: PNG_HEIGHT },
            deviceScaleFactor: 1
        })
        await page.setContent(html, { waitUntil: 'load' })
        await page.screenshot({ path: pngOutputPath, type: 'png' })
    } finally {
        await browser.close()
    }
}

function eventProperties(event) {
    return event?.customDimensions ?? event?.properties ?? {}
}

function findCandidateForSignal(candidates, properties, transitionEdges) {
    const sourceAreaRef = properties.sourceAreaRef
    const dir = properties.dir ?? properties.approachDir
    const matchedEdge =
        sourceAreaRef && dir ? transitionEdges.find((edge) => edge.from === sourceAreaRef && edge.transition?.direction === dir) : undefined

    const destinationRef = matchedEdge?.transition?.destinationAreaRef ?? properties.destinationAreaRef
    const entryRef = matchedEdge?.transition?.entrySegmentRef ?? properties.entrySegmentRef

    // Prefer active (non-inspiration-only) candidates that directly cover the destination area/corridor
    const activeCandidates = candidates.filter((entry) => entry.authoringState !== 'inspiration-only')
    for (const pool of [activeCandidates, candidates]) {
        if (destinationRef) {
            const direct = pool.find(
                (entry) => (entry.areaRefs ?? []).includes(destinationRef) || (entry.corridorRefs ?? []).includes(destinationRef)
            )
            if (direct) return direct
        }
        if (entryRef) {
            const byEntry = pool.find(
                (entry) =>
                    entry.entrySegmentRef === entryRef ||
                    (entry.corridorRefs ?? []).includes(entryRef) ||
                    (entry.segmentRefs ?? []).includes(entryRef) ||
                    (entry.areaRefs ?? []).includes(entryRef)
            )
            if (byEntry) return byEntry
        }
    }
    return undefined
}

export function buildAuthoringQueue(sidecar, atlas, events = [], seedLocations = []) {
    validateOverlay(sidecar, atlas, seedLocations)
    if (!Array.isArray(events)) fail('Boundary signals must be an array of events.')

    const seedNames = new Map((Array.isArray(seedLocations) ? seedLocations : []).map((loc) => [loc.id, loc.name]))
    const authoredAreaRefs = new Set(
        sidecar.entries.filter((entry) => entry.authoringState === 'authored').flatMap((entry) => entry.areaRefs ?? [])
    )
    const transitionEdges = (atlas.macroGraph?.edges ?? []).filter((edge) => edge?.relation === 'macro-transition')

    const candidates = sidecar.entries.filter((entry) => entry.authoringState !== 'authored' && entry.kind !== 'barrier')
    const pressureById = new Map()

    for (const event of events) {
        const eventName = event?.name ?? event?.eventName
        if (!PRESSURE_EVENTS.has(eventName)) continue
        const properties = eventProperties(event)
        const readiness = properties.destinationReadiness
        if (!READINESS_STATES.has(readiness) || readiness === 'ready') continue

        const target = findCandidateForSignal(candidates, properties, transitionEdges)
        if (!target) continue

        const counts = pressureById.get(target.id) ?? { total: 0, reached: 0, approach: 0, byReadiness: {} }
        counts.total += 1
        if (eventName === 'World.Frontier.BoundaryReached') counts.reached += 1
        else counts.approach += 1
        counts.byReadiness[readiness] = (counts.byReadiness[readiness] ?? 0) + 1
        pressureById.set(target.id, counts)
    }

    const queue = candidates
        .filter((entry) => entry.authoringState === 'next-to-author' || (pressureById.get(entry.id)?.total ?? 0) > 0)
        .map((entry) => {
            const refs = [...entryAllRefs(entry)]
            const outboundDirections = [
                ...new Set(
                    transitionEdges
                        .filter(
                            (edge) =>
                                authoredAreaRefs.has(edge.from) &&
                                ((entry.areaRefs ?? []).includes(edge.transition?.destinationAreaRef) ||
                                    (entry.corridorRefs ?? []).includes(edge.transition?.destinationAreaRef) ||
                                    entry.entrySegmentRef === edge.transition?.destinationAreaRef)
                        )
                        .map((edge) => edge.transition?.direction)
                        .filter(Boolean)
                )
            ]
            const pressure = pressureById.get(entry.id) ?? { total: 0, reached: 0, approach: 0, byReadiness: {} }
            return {
                id: entry.id,
                ref: (entry.areaRefs ?? entry.corridorRefs ?? [entry.id])[0],
                label: entry.label,
                kind: entry.kind,
                authoringState: entry.authoringState,
                coverage: entry.coverage,
                priority: entry.priority ?? null,
                promotedByPressure: entry.authoringState !== 'next-to-author',
                mappedRefs: refs,
                entrySegmentRef: entry.entrySegmentRef ?? null,
                entryAnchorId: entry.entryAnchorId ?? null,
                entryAnchorName: entry.entryAnchorId ? (seedNames.get(entry.entryAnchorId) ?? null) : null,
                outboundDirections,
                overlayReadiness: entry.authoringReadiness ?? 'unspecified',
                runtimeReadiness: resolveAtlasReadiness(atlas, entry),
                runtimeBoundaryPressure: pressure,
                notes: entry.notes
            }
        })
        .sort(
            (left, right) =>
                right.runtimeBoundaryPressure.total - left.runtimeBoundaryPressure.total ||
                right.runtimeBoundaryPressure.reached - left.runtimeBoundaryPressure.reached ||
                (left.priority ?? Number.MAX_SAFE_INTEGER) - (right.priority ?? Number.MAX_SAFE_INTEGER) ||
                left.id.localeCompare(right.id)
        )

    return {
        generatedAt: new Date().toISOString(),
        summary: {
            queuedSegments: queue.length,
            segmentsWithBoundaryPressure: queue.filter((segment) => segment.runtimeBoundaryPressure.total > 0).length,
            promotedBlockedSegments: queue.filter((segment) => segment.promotedByPressure).length
        },
        queue
    }
}

function renderMarkdownReport(report) {
    const rows = [
        '# The Long Reach: next-to-author expansion queue',
        '',
        `Generated: ${report.generatedAt}`,
        `Queued segments: ${report.summary.queuedSegments} | With runtime boundary pressure: ${report.summary.segmentsWithBoundaryPressure} | Promoted by pressure: ${report.summary.promotedBlockedSegments}`,
        '',
        '| Rank | Segment | Overlay state | Departure / anchor | Atlas readiness | Boundary pressure (reached / approach) | Priority |',
        '| ---: | --- | --- | --- | --- | ---: | ---: |'
    ]
    report.queue.forEach((segment, index) => {
        const dirs = segment.outboundDirections.length > 0 ? `${segment.outboundDirections.join(', ')} ` : ''
        const anchor = segment.entryAnchorName
            ? `${dirs}from ${segment.entryAnchorName} (\`${segment.entryAnchorId}\`)`
            : segment.entrySegmentRef
              ? `${dirs}via \`${segment.entrySegmentRef}\``
              : 'second-ring'
        const p = segment.runtimeBoundaryPressure
        rows.push(
            `| ${index + 1} | **${segment.label}** (\`${segment.id}\` → ${segment.mappedRefs.map((r) => `\`${r}\``).join(', ')}) | ${segment.authoringState}${segment.promotedByPressure ? ' *(promoted)*' : ''} | ${anchor} | ${segment.runtimeReadiness} | ${p.total} (${p.reached} / ${p.approach}) | ${segment.priority ?? '—'} |`
        )
    })
    if (report.queue.length === 0) {
        rows.push('| — | No segments need authoring | — | — | — | 0 (0 / 0) | — |')
    }
    rows.push(
        '',
        'Runtime pressure aggregates non-ready `World.Frontier.BoundaryReached` and `World.Frontier.BoundaryApproach` signals onto their canonical outbound transition. `theLongReachMacroAtlas.json` remains authoritative for runtime transitions.',
        ''
    )
    return rows.join('\n')
}

function parseArgs(argv) {
    const [first, ...options] = argv
    const help = first === '--help' || first === '-h'
    const args = {
        command: help ? undefined : first,
        overlay: DEFAULT_OVERLAY,
        atlas: DEFAULT_ATLAS,
        seed: DEFAULT_SEED,
        output: '',
        pngOutput: '',
        noPng: false,
        signals: '',
        format: 'markdown',
        help
    }
    for (const option of options) {
        if (option === '--help' || option === '-h') args.help = true
        else if (option.startsWith('--overlay=')) args.overlay = option.slice('--overlay='.length)
        else if (option.startsWith('--atlas=')) args.atlas = option.slice('--atlas='.length)
        else if (option.startsWith('--seed=')) args.seed = option.slice('--seed='.length)
        else if (option.startsWith('--output=')) args.output = option.slice('--output='.length)
        else if (option.startsWith('--png-output=')) args.pngOutput = option.slice('--png-output='.length)
        else if (option === '--no-png') args.noPng = true
        else if (option.startsWith('--signals=')) args.signals = option.slice('--signals='.length)
        else if (option.startsWith('--format=')) args.format = option.slice('--format='.length)
        else fail(`Unknown option "${option}".`)
    }
    if (!['render', 'queue'].includes(args.command) && !args.help) fail('Choose a command: render or queue.')
    if (!['markdown', 'json'].includes(args.format)) fail('Invalid --format value. Use markdown|json.')
    return args
}

async function loadJson(path) {
    return JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8'))
}

async function main(argv) {
    const args = parseArgs(argv)
    if (args.help) {
        console.log(`Long Reach authoring overlay and expansion queue (Schema v1)

Usage:
  node scripts/long-reach-authoring.mjs render [--overlay=path] [--atlas=path] [--seed=path] [--output=path] [--png-output=path] [--no-png]
  node scripts/long-reach-authoring.mjs queue [--overlay=path] [--atlas=path] [--seed=path] [--signals=path] [--format=markdown|json] [--output=path]

Render validates the Schema v1 sidecar, writes the two-panel SVG (full Long Reach + Milford Sound/Mosswell inset),
and automatically refreshes the scaled full-canvas PNG preview unless --no-png is passed.
Queue ranks next-to-author segments and any runtime-pressured blocked boundaries from Application Insights events.
`)
        return
    }

    const [overlay, atlas, seedLocations] = await Promise.all([
        loadJson(args.overlay),
        loadJson(args.atlas),
        loadJson(args.seed).catch(() => [])
    ])

    if (args.command === 'render') {
        const targetSvgPath = args.output || DEFAULT_RENDER
        const target = resolve(process.cwd(), targetSvgPath)
        const source = resolve(process.cwd(), overlay.image)
        const svg = renderOverlay(overlay, atlas, relative(dirname(target), source).replaceAll('\\', '/'), seedLocations)
        await writeFile(target, svg, 'utf8')

        const shouldWritePng = !args.noPng && (Boolean(args.pngOutput) || !args.output)
        if (shouldWritePng) {
            const targetPng = resolve(process.cwd(), args.pngOutput || DEFAULT_PNG_RENDER)
            await rasterizeOverlayPng(svg, source, targetPng)
        }
        return
    }

    const events = args.signals ? await loadJson(args.signals) : []
    if (!Array.isArray(events)) fail('Signals file must contain a JSON array.')
    const report = buildAuthoringQueue(overlay, atlas, events, seedLocations)
    const output = args.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdownReport(report)

    if (args.output) await writeFile(resolve(process.cwd(), args.output), output, 'utf8')
    else process.stdout.write(output)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(`Long Reach authoring failed: ${error.message}`)
        process.exitCode = 1
    })
}
