import assert from 'node:assert'
import { test } from 'node:test'

const paginationPromise = import('../../scripts/shared/pagination.mjs')

// Helper to build a stub runQuery that yields predetermined pages keyed by cursor
function buildStubPages(pages: Record<string, unknown>) {
    return async (vars: { after?: string | null }) => {
        const key = vars.after || 'FIRST'
        if (!pages[key]) throw new Error('Unexpected cursor ' + key)
        return pages[key]
    }
}

test('paginate basic two-page aggregation', async () => {
    const { paginate } = await paginationPromise
    const pages = {
        FIRST: {
            data: 1,
            page: { nodes: [1, 2], pageInfo: { hasNextPage: true, endCursor: 'CUR2' } }
        },
        CUR2: {
            data: 2,
            page: { nodes: [3], pageInfo: { hasNextPage: false, endCursor: null } }
        }
    }
    const runQuery = buildStubPages({
        FIRST: pages.FIRST,
        CUR2: pages.CUR2
    })
    const nodes = await paginate({
        runQuery,
        selectPage: (raw) => raw.page
    })
    assert.deepStrictEqual(nodes, [1, 2, 3])
})

test('paginate stops on null page (project not found)', async () => {
    const { paginate } = await paginationPromise
    const runQuery = async () => ({ nope: true })
    const nodes = await paginate({
        runQuery,
        selectPage: (raw) => raw.project?.items || null
    })
    assert.strictEqual(nodes.length, 0)
})

test('paginateProjectItems captures projectId & pageCount', async () => {
    const { paginateProjectItems } = await paginationPromise
    const runQuery = buildStubPages({
        FIRST: {
            project: {
                id: 'P123',
                items: { nodes: ['a'], pageInfo: { hasNextPage: true, endCursor: 'C2' } }
            }
        },
        C2: {
            project: {
                id: 'P123',
                items: { nodes: ['b', 'c'], pageInfo: { hasNextPage: false, endCursor: null } }
            }
        }
    })
    const { projectId, nodes, pageCount } = await paginateProjectItems({
        runQuery,
        selectProject: (raw) => raw.project
    })
    assert.strictEqual(projectId, 'P123')
    assert.deepStrictEqual(nodes, ['a', 'b', 'c'])
    assert.strictEqual(pageCount, 2)
})
