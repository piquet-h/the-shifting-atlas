import type { LayerType } from '@piquet-h/shared/types/layerRepository'

export type SqlQueryParameter = { name: string; value: string | number }

export type SqlQuerySpec = {
    query: string
    parameters: SqlQueryParameter[]
}

type FindActiveLayerArgs = {
    scopeId: string
    layerType: LayerType
    tick: number
}

export function buildFindActiveLayerQuerySpec(args: FindActiveLayerArgs): SqlQuerySpec {
    const { scopeId, layerType, tick } = args

    const query = `
        SELECT * FROM c
        WHERE c.scopeId = @scopeId
        AND c.layerType = @layerType
        AND c.effectiveFromTick <= @tick
        AND (
            NOT IS_DEFINED(c.effectiveToTick)
            OR c.effectiveToTick = null
            OR c.effectiveToTick >= @tick
        )
        ORDER BY c.authoredAt DESC
    `

    return {
        query,
        parameters: [
            { name: '@scopeId', value: scopeId },
            { name: '@layerType', value: layerType },
            { name: '@tick', value: tick }
        ]
    }
}

type LayerHistoryArgs = {
    scopeId: string
    layerType: LayerType
    startTick?: number
    endTick?: number
}

export function buildLayerHistoryQuerySpec(args: LayerHistoryArgs): SqlQuerySpec {
    const { scopeId, layerType, startTick, endTick } = args

    let query = `
        SELECT * FROM c
        WHERE c.scopeId = @scopeId
        AND c.layerType = @layerType
    `

    const parameters: SqlQueryParameter[] = [
        { name: '@scopeId', value: scopeId },
        { name: '@layerType', value: layerType }
    ]

    if (startTick !== undefined) {
        query += ' AND c.effectiveFromTick >= @startTick'
        parameters.push({ name: '@startTick', value: startTick })
    }

    if (endTick !== undefined) {
        query += ` AND (
            NOT IS_DEFINED(c.effectiveToTick)
            OR c.effectiveToTick = null
            OR c.effectiveToTick <= @endTick
        )`
        parameters.push({ name: '@endTick', value: endTick })
    }

    query += ' ORDER BY c.effectiveFromTick ASC'

    return { query, parameters }
}
