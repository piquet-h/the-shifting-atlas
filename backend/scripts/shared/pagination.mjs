/** Lightweight pagination utilities used only in tests / backend scripts.
 * Designed to avoid pulling any GraphQL client dependency.
 */

/**
 * Aggregate all nodes across cursor‑based pages.
 * @template TRaw
 * @template TNode
 * @param {{
 *  runQuery: (vars: { after?: string | null }) => Promise<TRaw>,
 *  selectPage: (raw: TRaw) => { nodes: TNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } | null
 * }} opts
 * @returns {Promise<TNode[]>}
 */
export async function paginate(opts) {
    const all = []
    let after = null
    let safety = 0
    while (true) {
        const raw = await opts.runQuery({ after })
        const page = opts.selectPage(raw)
        if (!page) break
        if (page.nodes && page.nodes.length) all.push(...page.nodes)
        if (!page.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break
        after = page.pageInfo.endCursor
        if (++safety > 500) throw new Error('paginate safety limit exceeded')
    }
    return all
}

/**
 * Specialized helper for project items returning metadata.
 * @template TRaw
 * @template TNode
 * @param {{
 *  runQuery: (vars: { after?: string | null }) => Promise<TRaw>,
 *  selectProject: (raw: TRaw) => { id: string; items: { nodes: TNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } | null
 * }} opts
 * @returns {Promise<{ projectId: string | null; nodes: TNode[]; pageCount: number }>}
 */
export async function paginateProjectItems(opts) {
    const nodes = []
    let after = null
    let pageCount = 0
    let projectId = null
    let safety = 0
    while (true) {
        const raw = await opts.runQuery({ after })
        const project = opts.selectProject(raw)
        if (!project) break
        if (!projectId) projectId = project.id
        const page = project.items
        pageCount++
        if (page.nodes && page.nodes.length) nodes.push(...page.nodes)
        if (!page.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break
        after = page.pageInfo.endCursor
        if (++safety > 500) throw new Error('paginateProjectItems safety limit exceeded')
    }
    return { projectId, nodes, pageCount }
}
