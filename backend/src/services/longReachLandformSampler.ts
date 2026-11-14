import { LONG_REACH_HEIGHT_METERS, LONG_REACH_WIDTH_METERS, type Direction, type MapPosition } from '@piquet-h/shared'
import landformGridData from '../data/longReachLandformGrid.json' with { type: 'json' }

export type LandformBand =
    | 'open-water'
    | 'fiord-water'
    | 'valley-floor'
    | 'coastal-lowland'
    | 'foothill-bench'
    | 'steep-escarpment'
    | 'upland-basin'
    | 'alpine-ridge'

export interface SampledGeographicCue {
    band: LandformBand
    resolution: 'milford-topo50' | 'long-reach-1m'
    elevationMeters: number
    slopeMetersPerKm: number
    isWater: boolean
    nearWater: boolean
    promptSummary: string
}

export interface ProjectMapPositionOptions {
    /** Travel speed in ground meters per minute (default: 65 m/min ≈ 3.9 km/h walking pace). */
    speedMetersPerMinute?: number
}

/** Default overland walking speed in ground meters per minute (~3.9 km/h). */
export const DEFAULT_WALKING_METERS_PER_MINUTE = 65

const INV_SQRT_2 = Math.SQRT1_2

const UNIT_DIRECTION_VECTORS: Readonly<Record<Direction, { east: number; south: number }>> = {
    north: { east: 0, south: -1 },
    south: { east: 0, south: 1 },
    east: { east: 1, south: 0 },
    west: { east: -1, south: 0 },
    northeast: { east: INV_SQRT_2, south: -INV_SQRT_2 },
    northwest: { east: -INV_SQRT_2, south: -INV_SQRT_2 },
    southeast: { east: INV_SQRT_2, south: INV_SQRT_2 },
    southwest: { east: -INV_SQRT_2, south: INV_SQRT_2 },
    up: { east: 0, south: 0 },
    down: { east: 0, south: 0 },
    in: { east: 0, south: 0 },
    out: { east: 0, south: 0 }
}

interface LandformGridFile {
    longReach: {
        cols: number
        rows: number
        elevationMeters: number[][]
        waterMask: string[]
    }
    milfordDistrict: {
        cols: number
        rows: number
        longReachBounds: { left: number; top: number; right: number; bottom: number }
        elevationMeters: number[][]
        waterMask: string[]
    }
}

const GRID = landformGridData as LandformGridFile

function clamp01(value: number): number {
    if (value <= 0) return 0
    if (value >= 1) return 1
    return Number(value.toFixed(7))
}

/**
 * Projects a destination {@link MapPosition} from an origin coordinate, compass direction,
 * and travel duration. Interior (`in`/`out`) and vertical (`up`/`down`) moves preserve
 * horizontal `[x, y]` coordinates.
 */
export function projectMapPosition(
    origin: MapPosition,
    direction: Direction,
    travelDurationMs: number,
    options?: ProjectMapPositionOptions
): MapPosition {
    const vector = UNIT_DIRECTION_VECTORS[direction]
    if (!vector || (vector.east === 0 && vector.south === 0)) {
        return { x: origin.x, y: origin.y }
    }

    const durationMinutes = Math.max(0, travelDurationMs) / 60_000
    const speedMetersPerMinute = options?.speedMetersPerMinute ?? DEFAULT_WALKING_METERS_PER_MINUTE
    const stepMeters = durationMinutes * speedMetersPerMinute

    const nextX = clamp01(origin.x + (vector.east * stepMeters) / LONG_REACH_WIDTH_METERS)
    const nextY = clamp01(origin.y + (vector.south * stepMeters) / LONG_REACH_HEIGHT_METERS)
    return { x: nextX, y: nextY }
}

function buildPromptSummary(band: LandformBand, elevationMeters: number, nearWater: boolean, riverChannel: boolean): string {
    switch (band) {
        case 'open-water':
            return 'open coastal sea water beyond walkable land'
        case 'fiord-water':
            return 'sheltered deepwater sound channel requiring watercraft'
        case 'valley-floor':
            return riverChannel || nearWater
                ? 'sheltered river-cut valley floor beside cold glacial water, framed by steep sidewalls'
                : 'flat valley floor corridor enclosed by rising mountain flanks'
        case 'coastal-lowland':
            return nearWater
                ? 'low coastal strand and river-plain ground near shoreline water'
                : 'broad low-relief plain with open sightlines'
        case 'foothill-bench':
            return nearWater
                ? 'terraced foothill slopes overlooking nearby water channels'
                : 'rolling foothill benches and wooded valley spurs'
        case 'steep-escarpment':
            return elevationMeters >= 700
                ? 'steep rock-ribbed mountain wall cut by narrow ledges and torrents'
                : 'steep forest-clad fiord escarpment with cliff bands'
        case 'upland-basin':
            return 'wide high-country basin of braided gravel beds and wind-scoured tussock'
        case 'alpine-ridge':
            return 'high alpine ridge shoulder of bare stone, scree saddles, and snowline crests'
    }
}

function sampleGridNeighborhood(
    elevationMeters: number[][],
    waterMask: string[],
    cols: number,
    rows: number,
    col: number,
    row: number,
    cellSpanKm: number
): {
    elev: number
    waterCode: string
    nearWater: boolean
    slopeMetersPerKm: number
} {
    const c = Math.min(cols - 1, Math.max(0, col))
    const r = Math.min(rows - 1, Math.max(0, row))
    const elev = elevationMeters[r][c]
    const waterCode = waterMask[r][c]

    let nearWater = waterCode !== '0'
    let maxDiff = 0
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue
            const nr = r + dr
            const nc = c + dc
            if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
            if (waterMask[nr][nc] !== '0') nearWater = true
            const diff = Math.abs(elevationMeters[nr][nc] - elev)
            const distScale = dr !== 0 && dc !== 0 ? Math.SQRT2 : 1
            maxDiff = Math.max(maxDiff, diff / (cellSpanKm * distScale))
        }
    }

    return {
        elev,
        waterCode,
        nearWater,
        slopeMetersPerKm: Math.round(maxDiff)
    }
}

/**
 * Deterministically samples the offline South Island (`1:1,000,000`) and Milford Sound (`1:50,000`)
 * relief/hydrography grids at a normalized Long Reach coordinate `[x, y]`.
 */
export function sampleLongReachLandform(position: MapPosition): SampledGeographicCue {
    const { milfordDistrict, longReach } = GRID
    const bounds = milfordDistrict.longReachBounds

    if (position.x >= bounds.left && position.x <= bounds.right && position.y >= bounds.top && position.y <= bounds.bottom) {
        const u = (position.x - bounds.left) / (bounds.right - bounds.left)
        const v = (position.y - bounds.top) / (bounds.bottom - bounds.top)
        const col = Math.min(milfordDistrict.cols - 1, Math.max(0, Math.floor(u * milfordDistrict.cols)))
        const row = Math.min(milfordDistrict.rows - 1, Math.max(0, Math.floor(v * milfordDistrict.rows)))
        const sample = sampleGridNeighborhood(
            milfordDistrict.elevationMeters,
            milfordDistrict.waterMask,
            milfordDistrict.cols,
            milfordDistrict.rows,
            col,
            row,
            0.163
        )

        const isFiordWater = sample.waterCode === '2'
        const isRiverChannel = sample.waterCode === '1'
        let band: LandformBand
        if (isFiordWater) {
            band = 'fiord-water'
        } else if (sample.elev >= 1050) {
            band = 'alpine-ridge'
        } else if (sample.elev <= 140) {
            band = 'valley-floor'
        } else if (sample.slopeMetersPerKm >= 380 || sample.elev >= 360) {
            band = 'steep-escarpment'
        } else {
            band = 'foothill-bench'
        }

        return {
            band,
            resolution: 'milford-topo50',
            elevationMeters: sample.elev,
            slopeMetersPerKm: sample.slopeMetersPerKm,
            isWater: isFiordWater,
            nearWater: sample.nearWater,
            promptSummary: buildPromptSummary(band, sample.elev, sample.nearWater, isRiverChannel)
        }
    }

    const col = Math.min(longReach.cols - 1, Math.max(0, Math.floor(position.x * longReach.cols)))
    const row = Math.min(longReach.rows - 1, Math.max(0, Math.floor(position.y * longReach.rows)))
    const sample = sampleGridNeighborhood(longReach.elevationMeters, longReach.waterMask, longReach.cols, longReach.rows, col, row, 8.0)

    const isOpenWater = sample.waterCode === '1'
    let band: LandformBand
    if (isOpenWater) {
        band = 'open-water'
    } else if (sample.elev >= 1150) {
        band = 'alpine-ridge'
    } else if (sample.slopeMetersPerKm >= 85 && sample.elev >= 550) {
        band = 'steep-escarpment'
    } else if (sample.elev >= 450) {
        band = 'upland-basin'
    } else if (sample.elev >= 190) {
        band = 'foothill-bench'
    } else {
        band = 'coastal-lowland'
    }

    return {
        band,
        resolution: 'long-reach-1m',
        elevationMeters: sample.elev,
        slopeMetersPerKm: sample.slopeMetersPerKm,
        isWater: isOpenWater,
        nearWater: sample.nearWater,
        promptSummary: buildPromptSummary(band, sample.elev, sample.nearWater, false)
    }
}
