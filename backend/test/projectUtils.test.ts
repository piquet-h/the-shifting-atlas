import assert from 'node:assert'
import { test } from 'node:test'

// Dynamic import of ESM helper module in scripts folder (not part of TS build graph)
const utilsPromise = import('../../scripts/shared/project-utils.mjs')

test('project-utils classifyIssue basic', async () => {
    const { classifyIssue } = await utilsPromise
    const issue = { labels: { nodes: [{ name: 'scope:core' }, { name: 'feature' }] } }
    const { scope, type } = classifyIssue(issue)
    assert.strictEqual(scope, 'scope:core')
    assert.strictEqual(type, 'feature')
})

test('project-utils extractFieldValue precedence', async () => {
    const { extractFieldValue } = await utilsPromise
    const node = {
        fieldValues: {
            nodes: [
                { field: { name: 'Implementation order' }, number: 3 },
                { field: { name: 'Status' }, name: 'Todo' }
            ]
        }
    }
    assert.strictEqual(extractFieldValue(node, 'Implementation order'), 3)
    assert.strictEqual(extractFieldValue(node, 'Status'), 'Todo')
    assert.strictEqual(extractFieldValue(node, 'Missing'), null)
})

test('project-utils wholeDayDiff & dateDiff', async () => {
    const { wholeDayDiff, dateDiff, addDaysIso, isIsoDate, extractStatus } = await utilsPromise
    const start = '2025-01-01'
    const finish = '2025-01-05'
    assert.strictEqual(wholeDayDiff(start, finish), 4)
    assert.strictEqual(dateDiff(finish, start), 4)
    const plus = addDaysIso(start, 10)
    assert.ok(isIsoDate(plus))
    // wholeDayDiff matches prior script semantics (exclusive day diff, minimum 1)
    assert.strictEqual(wholeDayDiff(start, plus), 10)
    // extractStatus baseline
    assert.strictEqual(extractStatus({ nodes: [{ field: { name: 'Status' }, name: 'In progress' }] }), 'In progress')
})
