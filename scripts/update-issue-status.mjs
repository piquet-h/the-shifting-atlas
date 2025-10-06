#!/usr/bin/env node
/* eslint-env node */
// DEPRECATED: update-issue-status.mjs retired.
console.error('update-issue-status.mjs deprecated – no action performed.')
process.exit(0)
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
 *   node scripts/update-issue-status.mjs --issue-number 789 --print-status-only
 *   node scripts/update-issue-status.mjs --issue-number 321 --status "Todo" --auto-add
 *
 * Status options (case-sensitive):
 *   - Todo
 *   - In progress
 *   - Done
 *
 * Additional flags:
 *   --print-status-only   Print the current status for the issue (no mutation)
 *   --auto-add            If the issue is not yet in the project, attempt to add it first
 *
 * Environment variables:
 *   GITHUB_TOKEN          - required for GitHub API access
 *   PROJECT_OWNER         - project owner (defaults to repo owner)
 *   PROJECT_NUMBER        - project number (defaults to 3)
 *   PROJECT_OWNER_TYPE    - 'user' | 'org' (auto-detect if unset)
 */

import { parseArgs } from 'node:util'
import { paginateProjectItems } from './shared/pagination.mjs'
import { extractStatus } from './shared/project-utils.mjs'

// Import the functions we need from the main sync script
// Note: This is a bit of duplication, but keeps the logic centralized
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const REPO_OWNER = 'piquet-h'
// Derive repo name from root folder (fallback literal if path changes)
const REPO_NAME = path.basename(ROOT) || 'the-shifting-atlas'
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
        body: JSON.stringify({ query, variables })
    })
    const json = await resp.json()
    if (json.errors) {
        console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2))
        throw new Error('GraphQL query failed')
    }
    return json.data
}

async function fetchProjectItems() {
    // Attempt order: explicit type(s) else user/org then viewer fallback
    const attempts = []
    if (!PROJECT_OWNER_TYPE || PROJECT_OWNER_TYPE === 'user') attempts.push('user')
    if (!PROJECT_OWNER_TYPE || PROJECT_OWNER_TYPE === 'org' || PROJECT_OWNER_TYPE === 'organization') attempts.push('organization')
    if (!PROJECT_OWNER_TYPE) attempts.push('viewer')

    for (const kind of attempts) {
        const isViewer = kind === 'viewer'
        const queryOwnerField = kind
        const baseQuery = isViewer
            ? `query($number:Int!,$after:String){\n  viewer{\n    projectV2(number:$number){\n      id title\n      items(first:100, after:$after){\n        nodes{\n          id\n          content{... on Issue { id number title state }}\n          fieldValues(first:50){\n            nodes{\n              ... on ProjectV2ItemFieldNumberValue { field { ... on ProjectV2FieldCommon { id name } } number }\n              ... on ProjectV2ItemFieldTextValue { field { ... on ProjectV2FieldCommon { id name } } text }\n              ... on ProjectV2ItemFieldSingleSelectValue { field { ... on ProjectV2FieldCommon { id name } } name optionId }\n            }\n          }\n        }\n        pageInfo{hasNextPage endCursor}\n      }\n    }\n  }\n}`
            : `query($owner:String!,$number:Int!,$after:String){\n  ${queryOwnerField}(login:$owner){\n    projectV2(number:$number){\n      id title\n      items(first:100, after:$after){\n        nodes{\n          id\n          content{... on Issue { id number title state }}\n          fieldValues(first:50){\n            nodes{\n              ... on ProjectV2ItemFieldNumberValue { field { ... on ProjectV2FieldCommon { id name } } number }\n              ... on ProjectV2ItemFieldTextValue { field { ... on ProjectV2FieldCommon { id name } } text }\n              ... on ProjectV2ItemFieldSingleSelectValue { field { ... on ProjectV2FieldCommon { id name } } name optionId }\n            }\n          }\n        }\n        pageInfo{hasNextPage endCursor}\n      }\n    }\n  }\n}`

        let encounteredError = null
        const { projectId, nodes } = await paginateProjectItems({
            initialVariables: isViewer ? { number: PROJECT_NUMBER } : { owner: PROJECT_OWNER, number: PROJECT_NUMBER },
            runQuery: async (vars) =>
                ghGraphQL(baseQuery, vars).catch((err) => {
                    encounteredError = err
                    return isViewer ? { viewer: null, _error: err } : { [queryOwnerField]: null, _error: err }
                }),
            selectProject: (raw) => raw?.[kind]?.projectV2 || null
        })

        if (projectId) {
            return { projectId, nodes: nodes.filter((n) => n.content && n.content.number), ownerType: kind }
        }
        if (encounteredError) {
            // proceed to next attempt kind
            continue
        }
    }
    return { projectId: null, nodes: [], ownerType: null }
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
        { projectId }
    )
    return data.node.fields.nodes
}

async function updateSingleSelectField(projectId, itemId, fieldId, optionId) {
    await ghGraphQL(
        `mutation($p:ID!,$i:ID!,$f:ID!,$v:String!){
    updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$v}}){ projectV2Item { id } }
  }`,
        { p: projectId, i: itemId, f: fieldId, v: optionId }
    )
}

async function fetchIssueNodeId(issueNumber) {
    // Fetch issue node ID via GraphQL
    const data = await ghGraphQL(
        `query($owner:String!,$repo:String!,$number:Int!){
            repository(owner:$owner,name:$repo){
                issue(number:$number){ id number title }
            }
        }`,
        { owner: REPO_OWNER, repo: REPO_NAME, number: issueNumber }
    )
    return data?.repository?.issue?.id || null
}

async function addIssueToProject(projectId, issueNodeId) {
    if (!issueNodeId) return null
    const data = await ghGraphQL(
        `mutation($projectId:ID!,$contentId:ID!){
            addProjectV2ItemById(input:{projectId:$projectId,contentId:$contentId}){ item { id } }
        }`,
        { projectId, contentId: issueNodeId }
    )
    return data?.addProjectV2ItemById?.item?.id || null
}

// extractStatus imported from shared/project-utils.mjs

function findStatusOptionId(projectFields, statusValue) {
    const statusField = projectFields.find((field) => field.name === 'Status' && field.options)
    if (!statusField) return null

    const option = statusField.options.find((opt) => opt.name === statusValue)
    return option?.id || null
}

async function updateIssueStatus(
    projectId,
    issueNumber,
    newStatus,
    projectItems,
    projectFields,
    { autoAdd = false, printOnly = false } = {}
) {
    try {
        // Find the project item for this issue
        let projectItem = projectItems.find((item) => item.content?.number === issueNumber)
        if (!projectItem) {
            console.log(`ℹ️ Issue #${issueNumber} not currently in project items.`)
            if (autoAdd) {
                console.log('🔄 Attempting to add issue to project (auto-add enabled)...')
                const issueNodeId = await fetchIssueNodeId(issueNumber)
                if (!issueNodeId) {
                    console.log('❌ Could not resolve issue node ID (issue may not exist)')
                    return false
                }
                const newItemId = await addIssueToProject(projectId, issueNodeId)
                if (newItemId) {
                    console.log(`✅ Added issue #${issueNumber} to project (item id: ${newItemId.substring(0, 12)}...)`)
                    // Refetch project items to include the new one (minimal incremental fetch for simplicity)
                    const refreshed = await fetchProjectItems()
                    projectItems = refreshed.nodes
                    projectItem = projectItems.find((item) => item.content?.number === issueNumber)
                } else {
                    console.log('❌ Failed to add issue to project')
                    return false
                }
            } else {
                console.log('   Hint: Add the issue to the Project Board or use --auto-add')
                return false
            }
        }

        // Get current status
        const currentStatus = extractStatus(projectItem.fieldValues)
        if (printOnly) {
            console.log(`📌 Current status for issue #${issueNumber}: "${currentStatus || '(unset)'}"`)
            return true
        }
        if (currentStatus === newStatus) {
            console.log(`ℹ️  Issue #${issueNumber} already has status "${newStatus}"`)
            return true
        }

        // Get status field ID
        const statusField = projectFields.find((f) => f.name === 'Status')
        if (!statusField) {
            console.log(`❌ Status field not found in project`)
            console.log('   Hint: Ensure your project has a field named "Status"')
            return false
        }

        // Validate status value against available options
        const statusFieldWithOptions = projectFields.find((f) => f.name === 'Status' && f.options)
        if (!statusFieldWithOptions || !statusFieldWithOptions.options.length) {
            console.log(`❌ Status field has no options configured`)
            console.log('   Hint: Configure status options in your project settings')
            return false
        }

        // Get status option ID
        const statusOptionId = findStatusOptionId(projectFields, newStatus)
        if (!statusOptionId) {
            console.log(`❌ Status option "${newStatus}" not found. Available options:`)
            statusFieldWithOptions.options.forEach((opt) => console.log(`   - "${opt.name}"`))
            console.log('   Hint: Status values are case-sensitive')
            return false
        }

        // Update the status
        console.log(`🔄 Updating issue #${issueNumber} status from "${currentStatus}" to "${newStatus}"...`)
        await updateSingleSelectField(projectId, projectItem.id, statusField.id, statusOptionId)
        console.log(`✅ Successfully updated issue #${issueNumber} status to "${newStatus}"`)
        return true
    } catch (error) {
        console.error(`❌ Failed to update status for issue #${issueNumber}:`)

        if (error.message.includes('GraphQL')) {
            console.error('   This might be a permissions issue. Ensure your token has repository-projects:write permission.')
        } else if (error.message.includes('fetch')) {
            console.error('   Network error. Check your internet connection.')
        } else {
            console.error(`   ${error.message}`)
        }

        return false
    }
}

async function main() {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        options: {
            'issue-number': { type: 'string' },
            status: { type: 'string' },
            'print-status-only': { type: 'boolean' },
            'auto-add': { type: 'boolean' },
            help: { type: 'boolean', short: 'h' }
        }
    })

    if (values.help || !values['issue-number'] || (!values.status && !values['print-status-only'])) {
        console.log(`
Usage: node scripts/update-issue-status.mjs --issue-number <number> --status <status>

Read-only:
  node scripts/update-issue-status.mjs --issue-number <number> --print-status-only

Options:
  --issue-number <number>   Issue number to update
  --status <status>         New status value (e.g. "Todo", "In progress", "Done")
  --print-status-only       Show current status only (no mutation)
  --auto-add                Add the issue to the project if missing (when changing status)
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
    const printOnly = Boolean(values['print-status-only'])
    const autoAdd = Boolean(values['auto-add'])

    if (isNaN(issueNumber) || issueNumber <= 0) {
        console.error('Invalid issue number')
        process.exit(1)
    }

    if (printOnly) {
        console.log(`🔍 Fetching current project status for issue #${issueNumber}...`)
    } else {
        console.log(`🔍 Updating issue #${issueNumber} to status "${newStatus}"...`)
    }

    try {
        // Fetch project data
        console.log('📊 Fetching project data...')
        const { projectId, nodes: projectItems } = await fetchProjectItems()
        if (!projectId) {
            console.error('❌ Could not find project')
            console.error('   Check PROJECT_OWNER, PROJECT_NUMBER, and PROJECT_OWNER_TYPE environment variables')
            console.error('   Ensure your token has access to the project')
            process.exit(1)
        }
        console.log(`✅ Found project (ID: ${projectId.substring(0, 12)}...)`)

        // Fetch project fields to get status options
        console.log('🏷️  Fetching project fields...')
        const projectFields = await fetchProjectFields(projectId)
        console.log(`✅ Found ${projectFields.length} project fields`)

        // Update the issue status
        const success = await updateIssueStatus(projectId, issueNumber, newStatus, projectItems, projectFields, { autoAdd, printOnly })

        if (success) {
            if (printOnly) {
                console.log('🎉 Status fetch completed successfully!')
            } else {
                console.log('🎉 Status update completed successfully!')
            }
        } else {
            console.log('❌ Status update failed')
        }

        process.exit(success ? 0 : 1)
    } catch (error) {
        console.error('💥 Unexpected error during status update:')

        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            console.error('   Authentication failed. Check your GITHUB_TOKEN.')
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
            console.error('   Permission denied. Ensure your token has repository-projects:write access.')
        } else if (error.message.includes('404') || error.message.includes('Not Found')) {
            console.error('   Resource not found. Check project number and ownership.')
        } else {
            console.error(`   ${error.message}`)
        }

        console.error('\n🔧 Troubleshooting tips:')
        console.error('   1. Verify GITHUB_TOKEN is set and has correct permissions')
        console.error('   2. Check PROJECT_OWNER and PROJECT_NUMBER environment variables')
        console.error('   3. Ensure the issue exists and is added to the project board')
        console.error('   4. Confirm project has a "Status" field with the desired options')

        process.exit(1)
    }
}

main().catch((err) => {
    console.error('Error updating issue status:', err)
    process.exit(1)
})
