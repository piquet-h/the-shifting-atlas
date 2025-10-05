#!/usr/bin/env node
/* eslint-env node */
/* global process, console, fetch */
/**
 * Calculate schedule variance between provisional and actual schedules.
 *
 * Usage:
 *   node scripts/calculate-variance.mjs [--window-days=30]
 *
 * Environment:
 *   GITHUB_TOKEN - Required
 *   PROJECT_OWNER - Defaults to 'piquet-h'
 *   PROJECT_NUMBER - Defaults to 3
 *   VARIANCE_THRESHOLD - Alert threshold (default 0.25 = 25%)
 */

import { getProjectId } from './shared/provisional-storage.mjs'
import { trackScheduleVariance, flushBuildTelemetry, initBuildTelemetry } from './shared/build-telemetry.mjs'

const REPO_OWNER = process.env.PROJECT_OWNER || 'piquet-h'
const PROJECT_NUMBER = Number(process.env.PROJECT_NUMBER || 3)
const VARIANCE_THRESHOLD = Number(process.env.VARIANCE_THRESHOLD || 0.25)
const WINDOW_DAYS = Number(process.argv.find((a) => a.startsWith('--window-days='))?.split('=')[1] || 30)

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
if (!token) {
    console.error('Missing GITHUB_TOKEN environment variable')
    process.exit(2)
}

/**
 * Execute GraphQL query.
 * @private
 */
async function ghGraphQL(query, variables) {
    const resp = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github+json'
        },
        body: JSON.stringify({ query, variables })
    })
    const json = await resp.json()
    if (json.errors) {
        console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2))
        throw new Error('GraphQL query failed')
    }
    return json.data
}

/**
 * Calculate date difference in days.
 * @private
 */
function dateDiff(date1, date2) {
    const d1 = new Date(date1 + 'T00:00:00Z')
    const d2 = new Date(date2 + 'T00:00:00Z')
    return Math.round((d1 - d2) / (1000 * 60 * 60 * 24))
}

/**
 * Calculate whole day difference (inclusive).
 * @private
 */
function wholeDayDiff(start, end) {
    const s = new Date(start + 'T00:00:00Z')
    const e = new Date(end + 'T00:00:00Z')
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)))
}

/**
 * Calculate variance metrics for a single issue.
 */
function calculateVarianceMetrics(provisional, actual) {
    const startDelta = dateDiff(actual.start, provisional.start)
    const finishDelta = dateDiff(actual.finish, provisional.finish)
    const durationDelta = actual.duration - provisional.duration

    // Finish-weighted variance (per sub-issue 4 spec)
    const overallVariance = Math.abs(finishDelta) / provisional.duration

    return {
        startDelta,
        finishDelta,
        durationDelta,
        overallVariance
    }
}

/**
 * Extract field value from project item.
 * @private
 */
function extractFieldValue(node, fieldName) {
    for (const fv of node.fieldValues.nodes) {
        if (fv.field?.name === fieldName) {
            return fv.date || fv.name || fv.number || null
        }
    }
    return null
}

/**
 * Classify issue by labels.
 * @private
 */
function classifyIssue(issue) {
    const labels = issue.labels?.nodes?.map((l) => l.name) || []
    const scope = labels.find((l) => l.startsWith('scope:')) || ''
    const type = labels.find((l) => !l.startsWith('scope:')) || ''
    return { scope, type }
}

/**
 * Fetch project items with provisional and actual schedules.
 */
async function fetchProjectItemsForVariance(projectId) {
    const query = `query($projectId:ID!,$after:String){
        node(id:$projectId){
            ... on ProjectV2 {
                items(first:100, after:$after){
                    nodes{
                        id
                        content{
                            ... on Issue {
                                id
                                number
                                title
                                state
                                createdAt
                                closedAt
                                labels(first:30){nodes{name}}
                            }
                        }
                        fieldValues(first:50){
                            nodes{
                                ... on ProjectV2ItemFieldDateValue {
                                    field { ... on ProjectV2FieldCommon { id name } }
                                    date
                                }
                                ... on ProjectV2ItemFieldSingleSelectValue {
                                    field { ... on ProjectV2FieldCommon { id name } }
                                    name
                                    optionId
                                }
                                ... on ProjectV2ItemFieldNumberValue {
                                    field { ... on ProjectV2FieldCommon { id name } }
                                    number
                                }
                                ... on ProjectV2ItemFieldTextValue {
                                    field { ... on ProjectV2FieldCommon { id name } }
                                    text
                                }
                            }
                        }
                    }
                    pageInfo { hasNextPage endCursor }
                }
            }
        }
    }`

    let allNodes = []
    let hasNext = true
    let after = null

    while (hasNext) {
        const data = await ghGraphQL(query, { projectId, after })
        const page = data.node.items
        allNodes.push(...page.nodes.filter((n) => n.content && n.content.number))
        hasNext = page.pageInfo.hasNextPage
        after = page.pageInfo.endCursor
    }

    return allNodes
}

/**
 * Main variance calculation.
 */
async function main() {
    console.log(`Calculating variance (window: ${WINDOW_DAYS} days, threshold: ${VARIANCE_THRESHOLD * 100}%)`)

    // Initialize build telemetry (console + artifact buffer)
    initBuildTelemetry()

    // Get project ID
    const projectId = await getProjectId(
        REPO_OWNER,
        PROJECT_NUMBER,
        process.env.PROJECT_OWNER_TYPE || 'auto'
    )
    console.log(`Project ID: ${projectId}`)

    // Fetch all items
    const items = await fetchProjectItemsForVariance(projectId)
    console.log(`Fetched ${items.length} project items`)

    // Filter items with both provisional and actual schedules
    const itemsWithSchedules = items.filter((item) => {
        const provisionalStart = extractFieldValue(item, 'Provisional Start')
        const provisionalFinish = extractFieldValue(item, 'Provisional Finish')
        const actualStart = extractFieldValue(item, 'Start')
        const actualFinish = extractFieldValue(item, 'Finish')
        return provisionalStart && provisionalFinish && actualStart && actualFinish
    })

    console.log(`Found ${itemsWithSchedules.length} items with both provisional and actual schedules`)

    // Calculate variance for each item
    const variances = []
    const now = new Date()
    const windowStart = new Date(now)
    windowStart.setDate(windowStart.getDate() - WINDOW_DAYS)

    for (const item of itemsWithSchedules) {
        const provisionalStart = extractFieldValue(item, 'Provisional Start')
        const provisionalFinish = extractFieldValue(item, 'Provisional Finish')
        const actualStart = extractFieldValue(item, 'Start')
        const actualFinish = extractFieldValue(item, 'Finish')
        const order = extractFieldValue(item, 'Implementation order')
        const confidence = extractFieldValue(item, 'Provisional Confidence')
        const basis = extractFieldValue(item, 'Estimation Basis')
        const status = extractFieldValue(item, 'Status')

        // Check if item is in the rolling window (based on actual finish date)
        const finishDate = new Date(actualFinish + 'T00:00:00Z')
        if (finishDate < windowStart) continue

        const provisionalDuration = wholeDayDiff(provisionalStart, provisionalFinish)
        const actualDuration = wholeDayDiff(actualStart, actualFinish)

        const variance = calculateVarianceMetrics(
            { start: provisionalStart, finish: provisionalFinish, duration: provisionalDuration },
            { start: actualStart, finish: actualFinish, duration: actualDuration }
        )

        const { scope, type } = classifyIssue(item.content)

        const varianceData = {
            issueNumber: item.content.number,
            implementationOrder: order,
            provisionalStart,
            provisionalFinish,
            provisionalDuration,
            actualStart,
            actualFinish,
            actualDuration,
            startDelta: variance.startDelta,
            finishDelta: variance.finishDelta,
            durationDelta: variance.durationDelta,
            overallVariance: variance.overallVariance,
            scope,
            type,
            confidence: confidence?.toLowerCase() || 'unknown',
            sampleSize: 0, // Not available from stored data
            basis: basis || 'unknown',
            schedulerReason: 'completed',
            status: status || 'Done'
        }

        variances.push(varianceData)

        // Track telemetry
        trackScheduleVariance(varianceData)

        console.log(
            `Issue #${item.content.number}: variance=${(variance.overallVariance * 100).toFixed(1)}% ` +
                `(finish delta: ${variance.finishDelta} days, duration delta: ${variance.durationDelta} days)`
        )
    }

    // Calculate aggregate metrics
    if (variances.length > 0) {
        const sortedVariances = variances.map((v) => v.overallVariance).sort((a, b) => a - b)
        const median = sortedVariances[Math.floor(sortedVariances.length / 2)]
        const mean = sortedVariances.reduce((a, b) => a + b, 0) / sortedVariances.length
        const max = Math.max(...sortedVariances)

        console.log('\n=== Aggregate Variance (Rolling Window) ===')
        console.log(`Window: ${WINDOW_DAYS} days`)
        console.log(`Items analyzed: ${variances.length}`)
        console.log(`Median variance: ${(median * 100).toFixed(1)}%`)
        console.log(`Mean variance: ${(mean * 100).toFixed(1)}%`)
        console.log(`Max variance: ${(max * 100).toFixed(1)}%`)

        if (median > VARIANCE_THRESHOLD) {
            console.log(`\n⚠️  ALERT: Median variance (${(median * 100).toFixed(1)}%) exceeds threshold (${VARIANCE_THRESHOLD * 100}%)`)
            console.log('Consider creating a variance alert issue.')
        } else {
            console.log(`\n✅ Variance within acceptable range (threshold: ${VARIANCE_THRESHOLD * 100}%)`)
        }
    } else {
        console.log('\nNo variance data available (no items in window with complete schedules)')
    }

    // Flush telemetry to artifact if path provided (GitHub Action sets TELEMETRY_ARTIFACT)
    try {
        await flushBuildTelemetry(process.env.TELEMETRY_ARTIFACT)
    } catch (e) {
        console.warn('Telemetry flush failed (non-fatal):', e.message)
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
