#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_OVERLAY = 'docs/architecture/the-long-reach-authoring-overlay.json'
const DEFAULT_ATLAS = 'backend/src/data/theLongReachMacroAtlas.json'
const DEFAULT_RENDER = 'docs/architecture/the-long-reach-authoring-overlay.svg'
const COVERAGE_STATES = new Set(['authored', 'in-progress', 'planned'])
const READINESS_STATES = new Set(['ready', 'partial', 'blocked', 'deferred'])
const PRESSURE_EVENTS = new Set(['World.Frontier.BoundaryReached', 'World.Frontier.BoundaryApproach'])
const READINESS_ORDER = { ready: 0, partial: 1, deferred: 2, blocked: 3 }
const STATUS_COLORS = {
    authored: '#218739',
    'in-progress': '#1769aa',
    'transition-ready': '#1769aa',
    'next-to-author': '#e6a700',
    blocked: '#c62828',
    'inspiration-only': '#757575'
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

function normalizedPoint(point, context) {
    if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        !point.every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)
    ) {
        fail(`${context} must use normalized coordinates between 0 and 1.`)
    }
}

export function validateOverlay(overlay, atlas) {
    if (overlay?.schemaVersion !== 1) fail('Overlay schemaVersion must be 1.')
    if (typeof overlay.map?.source !== 'string' || !overlay.map.source.trim()) fail('Overlay map.source is required.')
    if (!Number.isInteger(overlay.map.width) || overlay.map.width <= 0) fail('Overlay map.width must be a positive integer.')
    if (!Number.isInteger(overlay.map.height) || overlay.map.height <= 0) fail('Overlay map.height must be a positive integer.')
    if (!Array.isArray(overlay.segments) || overlay.segments.length === 0) fail('Overlay segments must be a non-empty array.')

    const nodes = new Map(atlasNodes(atlas).map((node) => [node.id, node]))
    const seen = new Set()

    for (const [index, segment] of overlay.segments.entries()) {
        const context = `Overlay segment ${index + 1}`
        if (typeof segment.ref !== 'string' || !nodes.has(segment.ref)) fail(`${context} references unknown atlas node "${segment.ref}".`)
        if (seen.has(segment.ref)) fail(`Overlay contains duplicate segment ref "${segment.ref}".`)
        seen.add(segment.ref)
        if (segment.kind !== nodes.get(segment.ref).nodeClass) fail(`${context} kind must match atlas nodeClass for "${segment.ref}".`)
        if (typeof segment.label !== 'string' || !segment.label.trim()) fail(`${context} label is required.`)
        if (!COVERAGE_STATES.has(segment.coverage)) fail(`${context} coverage must be authored, in-progress, or planned.`)
        if (segment.coverage !== 'authored' && (!Number.isInteger(segment.priority) || segment.priority < 1)) {
            fail(`${context} needs a positive integer priority when coverage is not authored.`)
        }

        const geometry = segment.geometry
        if (
            (geometry?.type === 'line' || geometry?.type === 'polygon') &&
            geometry.labelAnchor !== undefined &&
            geometry.labelAnchor !== null
        ) {
            normalizedPoint(geometry.labelAnchor, `${context} geometry.labelAnchor`)
        }
        if (
            geometry?.type === 'marker' &&
            geometry.radius !== undefined &&
            geometry.radius !== null &&
            (!Number.isFinite(geometry.radius) || geometry.radius <= 0)
        ) {
            fail(`${context} geometry.radius must be a finite positive number.`)
        }
        if (geometry?.type === 'marker') {
            normalizedPoint(geometry.anchor, `${context} geometry.anchor`)
        } else if (geometry?.type === 'line' || geometry?.type === 'polygon') {
            const minimumPoints = geometry.type === 'line' ? 2 : 3
            if (!Array.isArray(geometry.points) || geometry.points.length < minimumPoints) {
                fail(`${context} geometry.${geometry.type} needs at least ${minimumPoints} points.`)
            }
            geometry.points.forEach((point, pointIndex) => normalizedPoint(point, `${context} geometry.points[${pointIndex}]`))
        } else {
            fail(`${context} geometry.type must be marker, line, or polygon.`)
        }
    }

    const missingRefs = [...nodes.keys()].filter((ref) => !seen.has(ref))
    if (missingRefs.length > 0) fail(`Overlay is missing atlas node refs: ${missingRefs.join(', ')}.`)

    return true
}

function runtimeReadiness(atlas, ref) {
    const node = atlasNodes(atlas).find((candidate) => candidate.id === ref)
    const candidates = []
    if (node?.authoringReadiness && READINESS_STATES.has(node.authoringReadiness)) {
        candidates.push(node.authoringReadiness)
    }
    for (const edge of atlas.macroGraph.edges || []) {
        const transition = edge?.transition
        if (
            edge?.relation === 'macro-transition' &&
            (transition?.destinationAreaRef === ref || transition?.entrySegmentRef === ref) &&
            READINESS_STATES.has(transition.destinationReadiness)
        ) {
            candidates.push(transition.destinationReadiness)
        }
    }
    return candidates.sort((left, right) => READINESS_ORDER[right] - READINESS_ORDER[left])[0] ?? 'unspecified'
}

function visualStatus(segment) {
    if (segment.coverage === 'planned') return 'next-to-author'
    return segment.coverage
}

function sidecarOverlay(sidecar, atlas) {
    if (!validateSidecarSchema(sidecar)) fail(`Overlay schema: ${sidecarValidator.errorsText(validateSidecarSchema.errors)}`)
    const nodes = new Map(atlasNodes(atlas).map((node) => [node.id, node]))
    const seen = new Set()
    const segments = sidecar.entries.map((entry) => {
        if (seen.has(entry.id)) fail(`Overlay contains duplicate entry id "${entry.id}".`)
        seen.add(entry.id)
        const { left, top, right, bottom } = entry.bounds
        if (left >= right || top >= bottom) fail(`Overlay entry "${entry.id}" needs positive-area bounds.`)
        for (const [field, nodeClass] of [
            ['areaRefs', 'area'],
            ['corridorRefs', 'corridor'],
            ['segmentRefs', null],
            ['entrySegmentRef', null]
        ]) {
            const refs = field === 'entrySegmentRef' ? (entry[field] ? [entry[field]] : []) : (entry[field] ?? [])
            for (const ref of refs) {
                if (!nodes.has(ref)) fail(`Overlay entry "${entry.id}" references unknown atlas node "${ref}".`)
                if (nodeClass && nodes.get(ref).nodeClass !== nodeClass) fail(`Overlay ${field} nodeClass must be ${nodeClass}.`)
            }
        }
        return {
            ref: entry.id,
            label: entry.label,
            kind: entry.kind === 'region' ? 'area' : 'corridor',
            coverage: entry.coverage,
            authoringState: entry.authoringState,
            authoringReadiness: entry.authoringReadiness ?? 'unspecified',
            notes: entry.notes,
            geometry: {
                type: 'polygon',
                points: [
                    [left, top],
                    [right, top],
                    [right, bottom],
                    [left, bottom]
                ],
                labelAnchor: [(left + right) / 2, top]
            }
        }
    })
    // The v1 schema fixes the source image; these are its intrinsic pixel dimensions.
    return { map: { source: sidecar.image, width: 7040, height: 8480 }, segments }
}

function xmlEscape(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;')
}

function pointToPixels(point, width, height) {
    return `${(point[0] * width).toFixed(1)},${(point[1] * height).toFixed(1)}`
}

export function renderOverlay(overlay, atlas, sourceHref) {
    const isSidecar = overlay && 'entries' in overlay
    if (isSidecar) overlay = sidecarOverlay(overlay, atlas)
    else validateOverlay(overlay, atlas)
    const { width, height } = overlay.map
    const labels = []
    const rows = [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="title description">`,
        '<title id="title">The Long Reach authoring readiness overlay</title>',
        '<desc id="description">Approximate authoring annotations over the inspiration map. The JSON atlas remains authoritative for runtime transitions.</desc>',
        `<image href="${xmlEscape(sourceHref)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>`,
        '<style>text{font-family:Arial,sans-serif;font-weight:700;paint-order:stroke;stroke:#fff;stroke-width:8px;stroke-linejoin:round}.area circle{fill-opacity:.25}.corridor polyline{stroke-width:50;stroke-linecap:round;stroke-linejoin:round}.barrier polyline{stroke-width:36;stroke-dasharray:48 28;stroke-linecap:round}.label{font-size:42px}.legend{font-size:38px;stroke-width:7px}</style>',
        '<g aria-label="Authoring segments">'
    ]

    const layer = { area: 0, corridor: 1, barrier: 2 }
    for (const segment of [...overlay.segments].sort((left, right) => (layer[left.kind] ?? 0) - (layer[right.kind] ?? 0))) {
        const readiness = isSidecar ? segment.authoringReadiness : runtimeReadiness(atlas, segment.ref)
        const status = isSidecar ? segment.authoringState : visualStatus(segment)
        const color = STATUS_COLORS[status]
        const blocked = readiness === 'blocked' || readiness === 'deferred' || (!isSidecar && readiness === 'partial')
        const label = xmlEscape(segment.label)
        const geometry = segment.geometry
        rows.push(
            `<g class="${segment.kind}${blocked ? ' runtime-blocked' : ''}" data-ref="${xmlEscape(segment.ref)}" data-status="${status}" data-readiness="${readiness}"><title>${label}: coverage ${segment.coverage}; ${isSidecar ? 'readiness snapshot' : 'runtime readiness'} ${readiness}${isSidecar ? `; ${xmlEscape(segment.notes)}` : ''}</title>`
        )
        if (geometry.type === 'marker') {
            const [x, y] = geometry.anchor
            const radius = (geometry.radius ?? 0.023) * width
            rows.push(
                `<circle cx="${(x * width).toFixed(1)}" cy="${(y * height).toFixed(1)}" r="${radius.toFixed(1)}" fill="${color}" stroke="${blocked ? STATUS_COLORS.blocked : color}" stroke-width="${blocked ? 38 : 18}"/>`
            )
            labels.push(
                `<text class="label" x="${(x * width).toFixed(1)}" y="${(y * height + radius + 46).toFixed(1)}" text-anchor="middle">${label}</text>`
            )
        } else {
            const points = geometry.points.map((point) => pointToPixels(point, width, height)).join(' ')
            const center = geometry.labelAnchor ?? geometry.points[Math.floor(geometry.points.length / 2)]
            const [labelX, labelY] = center
            if (geometry.type === 'polygon') {
                rows.push(
                    `<polygon points="${points}" fill="${color}" fill-opacity=".25" stroke="${blocked ? STATUS_COLORS.blocked : color}" stroke-width="${blocked ? 42 : 18}"${status === 'inspiration-only' ? ' stroke-dasharray="32 24"' : ''}/>`
                )
            } else {
                if (blocked)
                    rows.push(`<polyline points="${points}" stroke="${STATUS_COLORS.blocked}" style="stroke-width:76" fill="none"/>`)
                rows.push(`<polyline points="${points}" stroke="${color}" fill="none"/>`)
            }
            labels.push(
                `<text class="label" x="${(labelX * width).toFixed(1)}" y="${(labelY * height - 24).toFixed(1)}" text-anchor="middle">${label}</text>`
            )
        }
        rows.push('</g>')
    }

    const legendItems = [
        ['authored', STATUS_COLORS.authored],
        ['transition-ready', STATUS_COLORS['transition-ready']],
        ['next-to-author', STATUS_COLORS['next-to-author']],
        ['blocked', STATUS_COLORS.blocked],
        ['inspiration-only', STATUS_COLORS['inspiration-only']],
        ['in-progress (legacy coverage)', STATUS_COLORS['in-progress']],
        ['runtime handoff currently blocked', STATUS_COLORS.blocked, true]
    ]
    rows.push('</g>', '<g aria-label="Segment labels">', ...labels, '</g>', '<g transform="translate(300 180)" aria-label="Legend">')
    rows.push('<rect width="2300" height="650" rx="20" fill="white" fill-opacity=".94" stroke="#333" stroke-width="6"/>')
    legendItems.forEach(([text, color, outline], index) => {
        const y = 58 + index * 62
        rows.push(
            `<circle cx="40" cy="${y - 12}" r="18" fill="${outline ? 'white' : color}" stroke="${color}" stroke-width="${outline ? 7 : 2}"/><text class="legend" x="78" y="${y}">${text}</text>`
        )
    })
    rows.push(
        '<text class="legend" x="40" y="505">Approximate footprints — not surveyed boundaries.</text>',
        '<text class="legend" x="40" y="560">transition-ready = partial snapshot, not runtime permission.</text>',
        '<text class="legend" x="40" y="615">Atlas/runtime policy remains authoritative; coverage is independent.</text>'
    )
    rows.push('</g>', '</svg>', '')
    return rows.join('\n')
}

function eventProperties(event) {
    return event?.customDimensions ?? event?.properties ?? {}
}

export function buildAuthoringQueue(overlay, atlas, events = []) {
    validateOverlay(overlay, atlas)
    if (!Array.isArray(events)) fail('Boundary signals must be an array of events.')

    const segmentRefs = new Set(overlay.segments.filter((segment) => segment.coverage !== 'authored').map((segment) => segment.ref))
    const pressure = new Map()
    for (const event of events) {
        if (!PRESSURE_EVENTS.has(event?.name ?? event?.eventName)) continue
        const properties = eventProperties(event)
        const readiness = properties.destinationReadiness
        if (!READINESS_STATES.has(readiness) || readiness === 'ready') continue
        const entryRef = properties.entrySegmentRef
        const destinationRef = properties.destinationAreaRef
        const ref = segmentRefs.has(entryRef) ? entryRef : destinationRef
        if (!segmentRefs.has(ref)) continue
        const counts = pressure.get(ref) ?? { total: 0, byReadiness: {} }
        counts.total += 1
        counts.byReadiness[readiness] = (counts.byReadiness[readiness] ?? 0) + 1
        pressure.set(ref, counts)
    }

    const queue = overlay.segments
        .filter((segment) => segment.coverage !== 'authored')
        .map((segment) => ({
            ref: segment.ref,
            label: segment.label,
            kind: segment.kind,
            coverage: segment.coverage,
            priority: segment.priority,
            runtimeReadiness: runtimeReadiness(atlas, segment.ref),
            runtimeBoundaryPressure: pressure.get(segment.ref) ?? { total: 0, byReadiness: {} }
        }))
        .sort(
            (left, right) =>
                right.runtimeBoundaryPressure.total - left.runtimeBoundaryPressure.total ||
                left.priority - right.priority ||
                left.ref.localeCompare(right.ref)
        )

    return {
        generatedAt: new Date().toISOString(),
        summary: {
            queuedSegments: queue.length,
            segmentsWithBoundaryPressure: queue.filter((segment) => segment.runtimeBoundaryPressure.total > 0).length
        },
        queue
    }
}

function renderMarkdownReport(report) {
    const rows = [
        '# The Long Reach: next to author',
        '',
        `Generated: ${report.generatedAt}`,
        `Queued segments: ${report.summary.queuedSegments}; with runtime boundary pressure: ${report.summary.segmentsWithBoundaryPressure}`,
        '',
        '| Rank | Segment | Coverage | Atlas readiness | Boundary pressure | Static priority |',
        '| ---: | --- | --- | --- | ---: | ---: |'
    ]
    report.queue.forEach((segment, index) => {
        rows.push(
            `| ${index + 1} | ${segment.label} (\`${segment.ref}\`) | ${segment.coverage} | ${segment.runtimeReadiness} | ${segment.runtimeBoundaryPressure.total} | ${segment.priority} |`
        )
    })
    if (report.queue.length === 0) rows.push('| — | No segments need authoring | — | — | 0 | — |')
    rows.push(
        '',
        'Runtime pressure counts `World.Frontier.BoundaryReached` and `World.Frontier.BoundaryApproach` signals with non-ready destinations. Atlas transition readiness remains authoritative.',
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
        output: '',
        signals: '',
        format: 'markdown',
        help
    }
    for (const option of options) {
        if (option === '--help' || option === '-h') args.help = true
        else if (option.startsWith('--overlay=')) args.overlay = option.slice('--overlay='.length)
        else if (option.startsWith('--atlas=')) args.atlas = option.slice('--atlas='.length)
        else if (option.startsWith('--output=')) args.output = option.slice('--output='.length)
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
        console.log(`Long Reach authoring overlay and queue

Usage:
  node scripts/long-reach-authoring.mjs render [--overlay=path] [--atlas=path] [--output=path]
  node scripts/long-reach-authoring.mjs queue [--overlay=path] [--atlas=path] [--signals=path] [--format=markdown|json] [--output=path]

Render accepts the schema v1 entries sidecar or the legacy segments inventory.
Queue accepts the legacy segments inventory only.
Signals are JSON arrays of Application Insights events with name/customDimensions fields.
`)
        return
    }

    const [overlay, atlas] = await Promise.all([loadJson(args.overlay), loadJson(args.atlas)])
    let output
    let targetPath = args.output

    if (args.command === 'render') {
        targetPath ||= DEFAULT_RENDER
        const target = resolve(process.cwd(), targetPath)
        const source = resolve(process.cwd(), overlay.image ?? overlay.map.source)
        output = renderOverlay(overlay, atlas, relative(dirname(target), source).replaceAll('\\', '/'))
    } else {
        const events = args.signals ? await loadJson(args.signals) : []
        if (!Array.isArray(events)) fail('Signals file must contain a JSON array.')
        const report = buildAuthoringQueue(overlay, atlas, events)
        output = args.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdownReport(report)
    }

    if (targetPath) await writeFile(resolve(process.cwd(), targetPath), output, 'utf8')
    else process.stdout.write(output)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(`Long Reach authoring failed: ${error.message}`)
        process.exitCode = 1
    })
}
