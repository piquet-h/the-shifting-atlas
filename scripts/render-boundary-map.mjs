#!/usr/bin/env node
/**
 * Boundary Map Audit Renderer
 *
 * Builds a human-friendly Mermaid map from seed data, highlighting frontier
 * boundary/frontier-like locations and pending exits that may point inward toward town.
 *
 * Usage:
 *   node scripts/render-boundary-map.mjs [--data=path] [--scope=boundary|full] [--output=map.mmd] [--json=report.json]
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const DIRECTION_VECTORS = {
    north: { x: 0, y: 1 },
    south: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    west: { x: -1, y: 0 },
    northeast: { x: 1, y: 1 },
    northwest: { x: -1, y: 1 },
    southeast: { x: 1, y: -1 },
    southwest: { x: -1, y: -1 }
}

// Heuristic thresholds for pending-direction classification:
// - score < INWARD_THRESHOLD: likely pointing inward toward town center (warn)
// - INWARD_THRESHOLD <= score < BORDERLINE_UPPER_THRESHOLD: ambiguous/sideways (informational)
// - score >= BORDERLINE_UPPER_THRESHOLD: outward-or-lateral (accepted)
const INWARD_THRESHOLD = -0.15
const BORDERLINE_UPPER_THRESHOLD = 0

function parseArgs(argv) {
    const parsed = {
        data: 'backend/src/data/villageLocations.json',
        scope: 'boundary',
        output: '',
        json: '',
        help: false
    }

    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') parsed.help = true
        else if (arg.startsWith('--data=')) parsed.data = arg.slice('--data='.length)
        else if (arg.startsWith('--scope=')) parsed.scope = arg.slice('--scope='.length)
        else if (arg.startsWith('--output=')) parsed.output = arg.slice('--output='.length)
        else if (arg.startsWith('--json=')) parsed.json = arg.slice('--json='.length)
    }

    if (!['boundary', 'full'].includes(parsed.scope)) {
        throw new Error(`Invalid --scope value "${parsed.scope}". Use boundary|full.`)
    }

    return parsed
}

function isBoundary(location) {
    return Array.isArray(location.tags) && location.tags.includes('frontier:boundary')
}

function normalize(v) {
    const mag = Math.hypot(v.x, v.y)
    if (!Number.isFinite(mag) || mag === 0) return { x: 0, y: 0 }
    return { x: v.x / mag, y: v.y / mag }
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y
}

function inferCoordinates(locations) {
    const byId = new Map(locations.map((l) => [l.id, l]))
    const outbound = new Map()
    const inbound = new Map()

    for (const loc of locations) {
        const exits = Array.isArray(loc.exits) ? loc.exits : []
        for (const ex of exits) {
            if (!ex?.to || !ex?.direction || !DIRECTION_VECTORS[ex.direction]) continue
            if (!outbound.has(loc.id)) outbound.set(loc.id, [])
            if (!inbound.has(ex.to)) inbound.set(ex.to, [])
            outbound.get(loc.id).push(ex)
            inbound.get(ex.to).push({ from: loc.id, direction: ex.direction })
        }
    }

    const hub =
        locations.find((l) => Array.isArray(l.tags) && l.tags.includes('hub'))?.id ||
        locations[0]?.id

    const coords = new Map()
    if (!hub) return coords

    coords.set(hub, { x: 0, y: 0 })
    const queue = [hub]

    while (queue.length > 0) {
        const current = queue.shift()
        const c = coords.get(current)
        if (!c) continue

        for (const ex of outbound.get(current) || []) {
            if (!byId.has(ex.to) || coords.has(ex.to)) continue
            const dv = DIRECTION_VECTORS[ex.direction]
            coords.set(ex.to, { x: c.x + dv.x, y: c.y + dv.y })
            queue.push(ex.to)
        }

        for (const ex of inbound.get(current) || []) {
            if (!coords.has(ex.from) && DIRECTION_VECTORS[ex.direction]) {
                const dv = DIRECTION_VECTORS[ex.direction]
                coords.set(ex.from, { x: c.x - dv.x, y: c.y - dv.y })
                queue.push(ex.from)
            }
        }
    }

    return coords
}

function computeTownCentroid(locations, coords) {
    const interior = locations.filter((l) => !isBoundary(l) && coords.has(l.id))
    if (interior.length === 0) return { x: 0, y: 0 }
    const sum = interior.reduce(
        (acc, l) => {
            const c = coords.get(l.id)
            return { x: acc.x + c.x, y: acc.y + c.y }
        },
        { x: 0, y: 0 }
    )
    return { x: sum.x / interior.length, y: sum.y / interior.length }
}

function analyzePendingDirections(locations) {
    const coords = inferCoordinates(locations)
    const centroid = computeTownCentroid(locations, coords)
    const findings = []

    for (const loc of locations) {
        const pending = loc.exitAvailability?.pending
        if (!pending) continue

        const c = coords.get(loc.id)
        if (!c) {
            findings.push({
                locationId: loc.id,
                locationName: loc.name,
                boundaryTagged: isBoundary(loc),
                direction: '(unresolved)',
                status: 'unknown',
                reason: 'Location has no inferred coordinates from hard exits; review manually.'
            })
            continue
        }

        const outward = normalize({ x: c.x - centroid.x, y: c.y - centroid.y })

        for (const direction of Object.keys(pending)) {
            const dv = DIRECTION_VECTORS[direction]
            if (!dv) {
                findings.push({
                    locationId: loc.id,
                    locationName: loc.name,
                    boundaryTagged: isBoundary(loc),
                    direction,
                    status: 'unknown',
                    reason: 'Non-planar direction (e.g., in/out/up/down) cannot be scored geometrically.'
                })
                continue
            }

            const score = dot(normalize(dv), outward)
            const status = score < INWARD_THRESHOLD ? 'suspect-inward' : score < BORDERLINE_UPPER_THRESHOLD ? 'borderline' : 'outward'
            findings.push({
                locationId: loc.id,
                locationName: loc.name,
                boundaryTagged: isBoundary(loc),
                direction,
                status,
                score: Number(score.toFixed(3))
            })
        }
    }

    return { centroid, findings, coords }
}

function buildMermaid(locations, scope, analysis) {
    const byId = new Map(locations.map((l) => [l.id, l]))
    const includeIds = new Set()
    const links = []

    if (scope === 'full') {
        for (const l of locations) includeIds.add(l.id)
    } else {
        for (const l of locations.filter((loc) => isBoundary(loc) || loc.exitAvailability?.pending)) {
            includeIds.add(l.id)
            for (const ex of l.exits || []) includeIds.add(ex.to)
        }
    }

    const idToMermaid = new Map()
    let idx = 1
    for (const id of includeIds) {
        idToMermaid.set(id, `n${idx++}`)
    }

    const lines = ['graph LR']

    for (const id of includeIds) {
        const loc = byId.get(id)
        if (!loc) continue
        const mId = idToMermaid.get(id)
        const name = String(loc.name || id).replaceAll('"', '\\"')
        lines.push(`  ${mId}["${name}"]`)
        if (isBoundary(loc)) lines.push(`  class ${mId} boundary;`)
        else if (loc.exitAvailability?.pending) lines.push(`  class ${mId} frontierLike;`)
        else lines.push(`  class ${mId} interior;`)
    }

    for (const id of includeIds) {
        const loc = byId.get(id)
        if (!loc) continue
        const from = idToMermaid.get(id)

        for (const ex of loc.exits || []) {
            if (!includeIds.has(ex.to)) continue
            const to = idToMermaid.get(ex.to)
            links.push(`  ${from} -- "${ex.direction}" --> ${to}`)
        }

        if (loc.exitAvailability?.pending) {
            for (const dir of Object.keys(loc.exitAvailability.pending)) {
                const pNode = `p${idx++}`
                const finding = analysis.findings.find((f) => f.locationId === loc.id && f.direction === dir)
                const badge = finding?.status === 'suspect-inward' ? ' ⚠' : ''
                lines.push(`  ${pNode}["Unexplored Open Plain (${dir})${badge}"]`)
                lines.push('  class ' + pNode + ' pending;')
                links.push(`  ${from} -. "${dir} (pending)" .-> ${pNode}`)
            }
        }
    }

    lines.push(...links)
    lines.push('')
    lines.push('  classDef boundary fill:#15313a,stroke:#4dd0e1,stroke-width:2px;')
    lines.push('  classDef frontierLike fill:#1a2942,stroke:#87b3ff,stroke-width:2px;')
    lines.push('  classDef interior fill:#14233a,stroke:#5e7fb3,stroke-width:1px;')
    lines.push('  classDef pending fill:#1d1f2e,stroke:#8ea1ff,stroke-dasharray: 4 4;')

    return lines.join('\n')
}

async function main() {
    const args = parseArgs(process.argv.slice(2))

    if (args.help) {
        console.log(`Boundary Map Audit Renderer

Usage:
  node scripts/render-boundary-map.mjs [--data=path] [--scope=boundary|full] [--output=map.mmd] [--json=report.json]

Options:
  --data=path        Seed data JSON path (default: backend/src/data/villageLocations.json)
  --scope=boundary   Boundary-only view (default)
  --scope=full       Full graph view
  --output=path      Write Mermaid output to file (default: stdout)
  --json=path        Write analysis JSON report to file
  --help, -h         Show this help
`)
        return
    }

    const dataPath = resolve(process.cwd(), args.data)
    const raw = await readFile(dataPath, 'utf8')
    const locations = JSON.parse(raw)

    const analysis = analyzePendingDirections(locations)
    const mermaid = buildMermaid(locations, args.scope, analysis)

    const suspects = analysis.findings.filter((f) => f.status === 'suspect-inward')
    const borderline = analysis.findings.filter((f) => f.status === 'borderline')

    const report = {
        scannedAt: new Date().toISOString(),
        dataPath,
        scope: args.scope,
        centroid: analysis.centroid,
        summary: {
            boundaryLocations: locations.filter(isBoundary).length,
            pendingLocations: locations.filter((l) => l.exitAvailability?.pending).length,
            pendingDirectionsScored: analysis.findings.filter((f) => f.direction !== '(unresolved)' && typeof f.score === 'number').length,
            suspectInwardCount: suspects.length,
            borderlineCount: borderline.length
        },
        findings: analysis.findings
    }

    if (args.output) await writeFile(resolve(process.cwd(), args.output), mermaid, 'utf8')
    else console.log(mermaid)

    if (args.json) await writeFile(resolve(process.cwd(), args.json), JSON.stringify(report, null, 2), 'utf8')

    if (suspects.length > 0) {
        console.error('\nPending-direction warnings (suspect inward):')
        for (const row of suspects.slice(0, 12)) {
            const score = typeof row.score === 'number' ? ` score=${row.score}` : ''
            const sourceType = row.boundaryTagged ? 'boundary' : 'frontier-like'
            console.error(` - ${row.locationName} :: ${row.direction} [${row.status}; ${sourceType}]${score}`)
        }
    } else {
        const unresolved = analysis.findings.filter((f) => f.status === 'unknown').length
        console.error(`\nNo suspect inward pending directions detected. (unknown/unresolved: ${unresolved})`)
    }
}

main().catch((error) => {
    console.error('Fatal error:', error?.message || error)
    process.exit(1)
})
