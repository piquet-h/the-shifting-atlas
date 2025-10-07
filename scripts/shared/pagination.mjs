/** Lightweight pagination utilities used only in tests / backend scripts.
 * Located under root scripts/shared so relative test import works.
 */

/** Aggregate all nodes across cursor-based pages. */
export async function paginate({ runQuery, selectPage }) {
    const all = []
    let after = null
    let safety = 0
    while (true) {
        const raw = await runQuery({ after })
        const page = selectPage(raw)
        if (!page) break
        if (page.nodes?.length) all.push(...page.nodes)
        if (!page.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break
        after = page.pageInfo.endCursor
        if (++safety > 500) throw new Error('paginate safety limit exceeded')
    }
    return all
}

/** Specialized helper for project items returning metadata. */
export async function paginateProjectItems({ runQuery, selectProject }) {
    const nodes = []
    let after = null
    let pageCount = 0
    let projectId = null
    let safety = 0
    while (true) {
        const raw = await runQuery({ after })
        const project = selectProject(raw)
        if (!project) break
        if (!projectId) projectId = project.id
        const page = project.items
        pageCount++
        if (page.nodes?.length) nodes.push(...page.nodes)
        if (!page.pageInfo?.hasNextPage || !page.pageInfo.endCursor) break
        after = page.pageInfo.endCursor
        if (++safety > 500) throw new Error('paginateProjectItems safety limit exceeded')
    }
    return { projectId, nodes, pageCount }
}
