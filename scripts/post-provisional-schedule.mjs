#!/usr/bin/env node
/* eslint-env node */
// DEPRECATED: post-provisional-schedule.mjs retired.
console.error('post-provisional-schedule.mjs deprecated – no action performed.')
process.exit(0)
/* global fetch, console, process */
/**
 * Calculate and post provisional schedule after implementation order assignment.
 *
 * This script runs after assign-impl-order.mjs to:
 * 1. Calculate provisional start/finish dates based on order and duration estimates
 * 2. Set provisional custom fields in GitHub Projects v2
 * 3. Post or update a provisional schedule comment on the issue
 *
 * Usage:
 *   node scripts/post-provisional-schedule.mjs --issue 123 [--apply]
 *
 * Environment:
 *   GITHUB_TOKEN - Required
 *   PROJECT_OWNER - Defaults to 'piquet-h'
 *   PROJECT_NUMBER - Defaults to 3
 */

import { parseArgs } from 'node:util'
import { initBuildTelemetry, trackProvisionalCreated } from './shared/build-telemetry.mjs'
import { estimateDuration } from './shared/duration-estimation.mjs'
import { classifyIssue, extractFieldValue } from './shared/project-utils.mjs'
import { findProvisionalComment, generateProvisionalComment, shouldPostProvisionalComment } from './shared/provisional-comment.mjs'
import { getProjectId, updateProvisionalSchedule } from './shared/provisional-storage.mjs'

const REPO_OWNER = process.env.PROJECT_OWNER || 'piquet-h'
const REPO_NAME = process.env.REPO_NAME || 'the-shifting-atlas'
const PROJECT_NUMBER = Number(process.env.PROJECT_NUMBER || 3)

const { values } = parseArgs({
    options: {
        issue: { type: 'string' },
        apply: { type: 'boolean', default: false }
    }
})

if (!values.issue) {
    console.error('Missing --issue <number>')
    process.exit(2)
}

const ISSUE_NUMBER = Number(values.issue)
const APPLY = !!values.apply

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
if (!token) {
    console.error('Missing GITHUB_TOKEN environment variable')
    process.exit(2)
}

// Initialize telemetry
initBuildTelemetry()

/**
 * Execute GraphQL query.
 * @private
 */
async function gh(query, variables) {
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
 * Fetch issue details via REST API.
 */
async function fetchIssueREST(issueNumber) {
    const resp = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json'
        }
    })
    return await resp.json()
}

/**
 * Fetch issue comments via REST API.
 */
async function fetchIssueComments(issueNumber) {
    const resp = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}/comments`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json'
        }
    })
    return await resp.json()
}

/**
 * Create a new comment on an issue.
 */
async function createComment(issueNumber, body) {
    const resp = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}/comments`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ body })
    })
    return await resp.json()
}

/**
 * Update an existing comment.
 */
async function updateComment(commentId, body) {
    const resp = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/comments/${commentId}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ body })
    })
    return await resp.json()
}

/**
 * Extract field value from project item.
 */
// extractFieldValue & classifyIssue imported from shared/project-utils.mjs

/**
 * Fetch all project items with implementation orders.
 */
async function fetchProjectItems(projectId) {
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
        const data = await gh(query, { projectId, after })
        const page = data.node.items
        allNodes.push(...page.nodes.filter((n) => n.content && n.content.number))
        hasNext = page.pageInfo.hasNextPage
        after = page.pageInfo.endCursor
    }

    return allNodes
}

/**
 * Calculate provisional start/finish dates based on order and cursor.
 */
function calculateProvisionalDates(order, duration, allItems) {
    // Find the cursor position based on items ordered before this one
    const itemsBefore = allItems
        .filter((item) => {
            const itemOrder = extractFieldValue(item, 'Implementation order')
            return itemOrder && itemOrder < order
        })
        .sort((a, b) => {
            const aOrder = extractFieldValue(a, 'Implementation order')
            const bOrder = extractFieldValue(b, 'Implementation order')
            return aOrder - bOrder
        })

    // Calculate cursor as the day after the last item's finish
    let cursor = new Date()
    cursor.setUTCHours(0, 0, 0, 0)

    for (const item of itemsBefore) {
        const itemFinish = extractFieldValue(item, 'Finish')
        if (itemFinish) {
            const finishDate = new Date(itemFinish + 'T00:00:00Z')
            finishDate.setUTCDate(finishDate.getUTCDate() + 1)
            if (finishDate > cursor) {
                cursor = finishDate
            }
        }
    }

    // Calculate start and finish
    const start = new Date(cursor)
    const finish = new Date(cursor)
    finish.setUTCDate(finish.getUTCDate() + duration - 1)

    return {
        start: start.toISOString().slice(0, 10),
        finish: finish.toISOString().slice(0, 10)
    }
}

/**
 * Main logic.
 */
async function main() {
    console.log(`Calculating provisional schedule for issue #${ISSUE_NUMBER}`)

    // Fetch issue details
    const issue = await fetchIssueREST(ISSUE_NUMBER)
    if (issue.state === 'closed') {
        console.log('Issue is closed, skipping provisional schedule')
        return
    }

    const { scope, type } = classifyIssue(issue)
    console.log(`Issue classification: scope=${scope}, type=${type}`)

    // Get project ID
    const projectId = await getProjectId(REPO_OWNER, PROJECT_NUMBER, 'user')
    console.log(`Project ID: ${projectId}`)

    // Fetch all project items for duration estimation and date calculation
    const allItems = await fetchProjectItems(projectId)
    console.log(`Fetched ${allItems.length} project items`)

    // Find the target issue in project items
    const targetItem = allItems.find((item) => item.content.number === ISSUE_NUMBER)
    if (!targetItem) {
        console.log('Issue not found in project, skipping provisional schedule')
        return
    }

    const order = extractFieldValue(targetItem, 'Implementation order')
    if (!order) {
        console.log('Issue has no implementation order, skipping provisional schedule')
        return
    }

    console.log(`Issue has implementation order: ${order}`)

    // Estimate duration
    const estimation = estimateDuration(allItems, scope, type)
    console.log(
        `Duration estimate: ${estimation.duration} days (confidence: ${estimation.confidence}, basis: ${estimation.basis}, samples: ${estimation.sampleSize})`
    )

    // Calculate provisional dates
    const dates = calculateProvisionalDates(order, estimation.duration, allItems)
    console.log(`Provisional dates: ${dates.start} to ${dates.finish}`)

    // Check if we should post a comment
    const shouldPost = shouldPostProvisionalComment(estimation.confidence, issue.state)
    console.log(`Should post comment: ${shouldPost}`)

    const result = {
        issue: ISSUE_NUMBER,
        order,
        provisionalStart: dates.start,
        provisionalFinish: dates.finish,
        duration: estimation.duration,
        confidence: estimation.confidence,
        basis: estimation.basis,
        sampleSize: estimation.sampleSize,
        scope,
        type,
        shouldPostComment: shouldPost
    }

    if (!APPLY) {
        console.log(JSON.stringify(result, null, 2))
        return
    }

    // Apply mode: Set custom fields and post comment
    console.log('Applying provisional schedule...')

    // Update custom fields
    try {
        await updateProvisionalSchedule(projectId, targetItem.id, {
            start: dates.start,
            finish: dates.finish,
            confidence: estimation.confidence,
            basis: `${estimation.sampleSize} ${estimation.basis} samples`
        })
        console.log('Updated provisional custom fields')
    } catch (err) {
        console.error('Failed to update custom fields:', err.message)
        console.error('Note: Custom fields (Provisional Start/Finish/Confidence/Basis) may not exist in project yet')
    }

    // Post or update comment
    if (shouldPost) {
        const commentBody = generateProvisionalComment({
            startDate: dates.start,
            finishDate: dates.finish,
            duration: estimation.duration,
            order,
            confidence: estimation.confidence,
            sampleSize: estimation.sampleSize,
            basis: estimation.basis,
            scope,
            type
        })

        const comments = await fetchIssueComments(ISSUE_NUMBER)
        const existingComment = findProvisionalComment(comments)

        if (existingComment) {
            console.log(`Updating existing provisional comment #${existingComment.id}`)
            await updateComment(existingComment.id, commentBody)
        } else {
            console.log('Creating new provisional comment')
            await createComment(ISSUE_NUMBER, commentBody)
        }
    } else {
        console.log('Skipping comment (low confidence or closed issue)')
    }

    // Track telemetry
    trackProvisionalCreated({
        issueNumber: ISSUE_NUMBER,
        implementationOrder: order,
        provisionalStart: dates.start,
        provisionalFinish: dates.finish,
        duration: estimation.duration,
        confidence: estimation.confidence,
        sampleSize: estimation.sampleSize,
        basis: estimation.basis
    })

    console.log(JSON.stringify({ ...result, applied: true }, null, 2))
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
