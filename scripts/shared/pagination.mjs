/*
 * Generic cursor-based pagination helpers for GitHub GraphQL (or similar) APIs.
 *
 * Goal: Deduplicate repeated hasNextPage/endCursor while-loops scattered across scripts.
 * Scope: Lightweight, no external deps, side-effect free aside from invoking provided runQuery.
 */

/**
 * Generic paginator.
 * @template TPage
 * @template TNode
 * @param {Object} opts
 * @param {function(Object):Promise<any>} opts.runQuery - Invoked with merged (initialVariables + {after}). Must return raw data object.
 * @param {function(any):({nodes:Array<TNode>,pageInfo:{hasNextPage:boolean,endCursor:string|null}}|null)} opts.selectPage - Extracts a page object from raw data. Return null/undefined to stop.
 * @param {Object} [opts.initialVariables] - Base variables passed to runQuery each page.
 * @param {function(Object & {pageIndex:number, page:any}):Promise<void>|void} [opts.onPage] - Optional per-page hook (after extraction).
 * @param {number} [opts.maxPages=100] - Safety cap to avoid infinite loops.
 * @returns {Promise<Array<TNode>>}
 */
export async function paginate({ runQuery, selectPage, initialVariables = {}, onPage, maxPages = 100 }) {
    if (typeof runQuery !== 'function') throw new TypeError('runQuery must be a function')
    if (typeof selectPage !== 'function') throw new TypeError('selectPage must be a function')

    const all = []
    let after = null
    let pageIndex = 0
    for (; pageIndex < maxPages; pageIndex++) {
        const raw = await runQuery({ ...initialVariables, after })
        const page = selectPage(raw)
        if (!page) break // nothing more (project not found or end)
        if (!page.pageInfo || typeof page.pageInfo.hasNextPage !== 'boolean') {
            throw new Error('selectPage must return an object with pageInfo.hasNextPage')
        }
        if (Array.isArray(page.nodes)) all.push(...page.nodes)
        if (onPage) await onPage({ pageIndex, page, after })
        if (!page.pageInfo.hasNextPage) break
        after = page.pageInfo.endCursor
        if (!after) break // defensive: GitHub usually supplies endCursor when hasNextPage true
    }
    return all
}

/**
 * Convenience wrapper specialized for GitHub ProjectV2 items.
 * Keeps closure for projectId discovery while aggregating nodes.
 * @param {Object} opts
 * @param {function(Object):Promise<any>} opts.runQuery
 * @param {Object} [opts.initialVariables]
 * @param {function(any):any} opts.selectProject - Returns the projectV2 object (with id + items) or falsy.
 * @param {function(Object):void} [opts.onPage]
 * @returns {Promise<{projectId:string|null,nodes:Array, pageCount:number}>}
 */
export async function paginateProjectItems({ runQuery, initialVariables = {}, selectProject, onPage }) {
    let projectId = null
    let pageCount = 0
    const nodes = await paginate({
        runQuery,
        selectPage: (raw) => {
            const project = selectProject(raw)
            if (!project) return null
            projectId = project.id || projectId
            return project.items || null
        },
        initialVariables,
        onPage: (ctx) => {
            pageCount++
            if (onPage) onPage(ctx)
        }
    })
    return { projectId, nodes, pageCount }
}
