#!/usr/bin/env node
/* eslint-env node */
/* global fetch, process, console */
/**
 * Update Issue Status in GitHub Project
 * 
 * Updates the status of an issue in the GitHub Project Board.
 * Useful for automating status transitions when Copilot starts/finishes work.
 * 
 * Usage:
 *   node scripts/update-issue-status.mjs --issue-number 123 --status "In progress"
 *   node scripts/update-issue-status.mjs --issue-number 456 --status "Done"
 * 
 * Status options (case-sensitive):
 *   - Todo
 *   - In progress  
 *   - Done
 * 
 * Environment variables:
 *   GITHUB_TOKEN          - required for GitHub API access
 *   PROJECT_OWNER         - project owner (defaults to repo owner)  
 *   PROJECT_NUMBER        - project number (defaults to 3)
 *   PROJECT_OWNER_TYPE    - 'user' | 'org' (auto-detect if unset)
 */

import {parseArgs} from 'node:util'

// Import the functions we need from the main sync script
// Note: This is a bit of duplication, but keeps the logic centralized
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const REPO_OWNER = 'piquet-h'
const PROJECT_OWNER = process.env.PROJECT_OWNER || REPO_OWNER
const PROJECT_NUMBER = Number(process.env.PROJECT_NUMBER || 3)
const PROJECT_OWNER_TYPE = process.env.PROJECT_OWNER_TYPE || ''

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
if (!token) {
    console.error('Missing GITHUB_TOKEN. Export it or run inside GitHub Actions.')
    process.exit(2)
}

async function ghGraphQL(query, variables) {
    const resp = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github+json'
        },
        body: JSON.stringify({query, variables})
    })
    const json = await resp.json()
    if (json.errors) {
        console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2))
        throw new Error('GraphQL query failed')
    }
    return json.data
}

async function fetchProjectItems() {
    // Try user then org (unless type constrained)
    const attempts = []
    if (!PROJECT_OWNER_TYPE || PROJECT_OWNER_TYPE === 'user') attempts.push('user')
    if (!PROJECT_OWNER_TYPE || PROJECT_OWNER_TYPE === 'org' || PROJECT_OWNER_TYPE === 'organization') attempts.push('organization')
    if (!PROJECT_OWNER_TYPE) attempts.push('viewer')

    for (const kind of attempts) {
        let hasNext = true
        let after = null
        const nodes = []
        let projectId = null
        while (hasNext) {
            let data
            if (kind === 'viewer') {
                data = await ghGraphQL(
                    `query($number:Int!,$after:String){
                        viewer{
                            projectV2(number:$number){
                                id title
                                items(first:100, after:$after){
                                    nodes{
                                        id
                                        content{... on Issue { id number title state }}
                                        fieldValues(first:50){
                                            nodes{
                                                ... on ProjectV2ItemFieldNumberValue { field { ... on ProjectV2FieldCommon { id name } } number }
                                                ... on ProjectV2ItemFieldTextValue { field { ... on ProjectV2FieldCommon { id name } } text }
                                                ... on ProjectV2ItemFieldSingleSelectValue { field { ... on ProjectV2FieldCommon { id name } } name optionId }
                                            }
                                        }
                                    }
                                    pageInfo{hasNextPage endCursor}
                                }
                            }
                        }
                    }`,
                    {number: PROJECT_NUMBER, after}
                ).catch((err) => ({viewer: null, _error: err}))
            } else {
                const queryOwnerField = kind
                data = await ghGraphQL(
                    `query($owner:String!,$number:Int!,$after:String){
                        ${queryOwnerField}(login:$owner){
                            projectV2(number:$number){
                                id title
                                items(first:100, after:$after){
                                    nodes{
                                        id
                                        content{... on Issue { id number title state }}
                                        fieldValues(first:50){
                                            nodes{
                                                ... on ProjectV2ItemFieldNumberValue { field { ... on ProjectV2FieldCommon { id name } } number }
                                                ... on ProjectV2ItemFieldTextValue { field { ... on ProjectV2FieldCommon { id name } } text }
                                                ... on ProjectV2ItemFieldSingleSelectValue { field { ... on ProjectV2FieldCommon { id name } } name optionId }
                                            }
                                        }
                                    }
                                    pageInfo{hasNextPage endCursor}
                                }
                            }
                        }
                    }`,
                    {owner: PROJECT_OWNER, number: PROJECT_NUMBER, after}
                ).catch((err) => ({[queryOwnerField]: null, _error: err}))
            }
            const project = data?.[kind]?.projectV2
            if (!project) break
            projectId = project.id
            const page = project.items
            nodes.push(...page.nodes)
            hasNext = page.pageInfo.hasNextPage
            after = page.pageInfo.endCursor
        }
        if (projectId) {
            return {projectId, nodes: nodes.filter((n) => n.content && n.content.number), ownerType: kind}
        }
    }
    return {projectId: null, nodes: [], ownerType: null}
}

async function fetchProjectFields(projectId) {
    const data = await ghGraphQL(
        `query($projectId:ID!){
    node(id:$projectId){ 
      ... on ProjectV2 { 
        fields(first:20){
          nodes{
            ... on ProjectV2FieldCommon { id name }
            ... on ProjectV2SingleSelectField { 
              id name 
              options { id name }
            }
          }
        }
      }
    }
  }`,
        {projectId}
    )
    return data.node.fields.nodes
}

async function updateSingleSelectField(projectId, itemId, fieldId, optionId) {
    await ghGraphQL(
        `mutation($p:ID!,$i:ID!,$f:ID!,$v:String!){
    updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$v}}){ projectV2Item { id } }
  }`,
        {p: projectId, i: itemId, f: fieldId, v: optionId}
    )
}

function extractStatus(fieldValues) {
    for (const fv of fieldValues.nodes) {
        if (fv.field?.name === 'Status') {
            return fv.name || fv.text || fv.number || ''
        }
    }
    return ''
}

function findStatusOptionId(projectFields, statusValue) {
    const statusField = projectFields.find(field => field.name === 'Status' && field.options)
    if (!statusField) return null
    
    const option = statusField.options.find(opt => opt.name === statusValue)
    return option?.id || null
}

async function updateIssueStatus(projectId, issueNumber, newStatus, projectItems, projectFields) {
    try {
        // Find the project item for this issue
        const projectItem = projectItems.find(item => item.content?.number === issueNumber)
        if (!projectItem) {
            console.log(`Issue #${issueNumber} not found in project items`)
            return false
        }

        // Get current status
        const currentStatus = extractStatus(projectItem.fieldValues)
        if (currentStatus === newStatus) {
            console.log(`Issue #${issueNumber} already has status "${newStatus}"`)
            return true
        }

        // Get status field ID  
        const statusField = projectFields.find(f => f.name === 'Status')
        if (!statusField) {
            console.log(`Status field not found in project`)
            return false
        }

        // Get status option ID
        const statusOptionId = findStatusOptionId(projectFields, newStatus)
        if (!statusOptionId) {
            console.log(`Status option "${newStatus}" not found. Available options:`)
            const statusFieldWithOptions = projectFields.find(f => f.name === 'Status' && f.options)
            if (statusFieldWithOptions) {
                statusFieldWithOptions.options.forEach(opt => console.log(`  - "${opt.name}"`))
            }
            return false
        }

        // Update the status
        await updateSingleSelectField(projectId, projectItem.id, statusField.id, statusOptionId)
        console.log(`Updated issue #${issueNumber} status from "${currentStatus}" to "${newStatus}"`)
        return true
    } catch (error) {
        console.error(`Failed to update status for issue #${issueNumber}:`, error)
        return false
    }
}

async function main() {
    const {values} = parseArgs({
        args: process.argv.slice(2),
        options: {
            'issue-number': {type: 'string'},
            'status': {type: 'string'},
            'help': {type: 'boolean', short: 'h'}
        }
    })

    if (values.help || !values['issue-number'] || !values.status) {
        console.log(`
Usage: node scripts/update-issue-status.mjs --issue-number <number> --status <status>

Options:
  --issue-number <number>   Issue number to update
  --status <status>         New status value (e.g. "Todo", "In progress", "Done")
  --help, -h                Show this help

Environment variables:
  GITHUB_TOKEN              Required for GitHub API access
  PROJECT_OWNER             Project owner (defaults to repo owner)
  PROJECT_NUMBER            Project number (defaults to 3)
  PROJECT_OWNER_TYPE        'user' | 'org' (auto-detect if unset)
        `)
        process.exit(values.help ? 0 : 1)
    }

    const issueNumber = parseInt(values['issue-number'], 10)
    const newStatus = values.status

    if (isNaN(issueNumber) || issueNumber <= 0) {
        console.error('Invalid issue number')
        process.exit(1)
    }

    console.log(`Updating issue #${issueNumber} to status "${newStatus}"...`)

    // Fetch project data
    const {projectId, nodes: projectItems} = await fetchProjectItems()
    if (!projectId) {
        console.error('Could not find project')
        process.exit(1)
    }

    // Fetch project fields to get status options
    const projectFields = await fetchProjectFields(projectId)

    // Update the issue status
    const success = await updateIssueStatus(projectId, issueNumber, newStatus, projectItems, projectFields)
    
    process.exit(success ? 0 : 1)
}

main().catch((err) => {
    console.error('Error updating issue status:', err)
    process.exit(1)
})