#!/usr/bin/env node
/* eslint-env node */
/* global process, console, fetch */
/**
 * Provisional schedule storage operations using GitHub Projects v2 custom fields.
 *
 * Custom fields used:
 * - Provisional Start (Date)
 * - Provisional Finish (Date)
 * - Provisional Confidence (Single Select: High/Medium/Low)
 * - Estimation Basis (Text)
 */

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN

/**
 * Execute a GraphQL query against GitHub API.
 * @private
 */
async function ghGraphQL(query, variables) {
    if (!token) {
        throw new Error('Missing GITHUB_TOKEN environment variable')
    }
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
    if (!resp.ok) {
        throw new Error(`GitHub GraphQL HTTP error ${resp.status}: ${json.message || resp.statusText}`)
    }
    if (json.message && !json.data) {
        throw new Error(`GitHub GraphQL error: ${json.message}`)
    }
    if (json.errors) {
        console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2))
        throw new Error('GraphQL query failed')
    }
    if (!json.data) {
        throw new Error('GitHub GraphQL: missing data in response')
    }
    return json.data
}

/**
 * Get project ID by owner and number.
 *
 * @param {string} owner - Repository owner
 * @param {number} projectNumber - Project number
 * @param {string} [ownerType='user'] - Owner type ('user' or 'org')
 * @returns {Promise<string>} Project ID
 */
export async function getProjectId(owner, projectNumber, ownerType = 'user') {
    // Support automatic fallback similar to sync-implementation-order script.
    const attempts = []
    if (ownerType === 'auto' || ownerType === '' || ownerType == null) {
        attempts.push('user', 'organization', 'viewer')
    } else if (ownerType === 'org' || ownerType === 'organization') {
        attempts.push('organization')
    } else if (ownerType === 'viewer') {
        attempts.push('viewer')
    } else {
        attempts.push('user')
    }

    const errors = []
    for (const kind of attempts) {
        try {
            let query
            if (kind === 'viewer') {
                query = `query($number:Int!){ viewer{ projectV2(number:$number){ id } } }`
                const data = await ghGraphQL(query, { number: projectNumber })
                const project = data.viewer?.projectV2
                if (project?.id) return project.id
            } else if (kind === 'organization') {
                query = `query($owner:String!,$number:Int!){ organization(login:$owner){ projectV2(number:$number){ id } } }`
                const data = await ghGraphQL(query, { owner, number: projectNumber })
                const project = data.organization?.projectV2
                if (project?.id) return project.id
            } else {
                // user
                query = `query($owner:String!,$number:Int!){ user(login:$owner){ projectV2(number:$number){ id } } }`
                const data = await ghGraphQL(query, { owner, number: projectNumber })
                const project = data.user?.projectV2
                if (project?.id) return project.id
            }
            errors.push(`${kind}: not found`)
        } catch (e) {
            errors.push(`${kind}: ${e.message}`)
        }
    }
    throw new Error(
        `Project not found or inaccessible after attempts (${attempts.join(', ')}) for owner='${owner}' number=${projectNumber}. ` +
            `Errors: ${errors.join(' | ')}. Ensure workflow permissions include 'projects: read' and number is correct.`
    )
}

/**
 * Get project fields including custom fields.
 *
 * @param {string} projectId - Project ID
 * @returns {Promise<Array>} Array of field objects
 */
export async function getProjectFields(projectId) {
    const query = `query($projectId:ID!){
        node(id:$projectId){
            ... on ProjectV2 {
                fields(first:50){
                    nodes{
                        ... on ProjectV2FieldCommon { id name }
                        ... on ProjectV2SingleSelectField { id name options { id name } }
                    }
                }
            }
        }
    }`
    const data = await ghGraphQL(query, { projectId })
    return data.node.fields.nodes
}

/**
 * Set a date field value on a project item.
 *
 * @param {string} projectId - Project ID
 * @param {string} itemId - Project item ID
 * @param {string} fieldId - Field ID
 * @param {string} date - ISO date string (YYYY-MM-DD)
 * @returns {Promise<void>}
 */
export async function setDateField(projectId, itemId, fieldId, date) {
    const mutation = `mutation($p:ID!,$i:ID!,$f:ID!,$d:Date!){
        updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{date:$d}}){
            projectV2Item{id}
        }
    }`
    await ghGraphQL(mutation, { p: projectId, i: itemId, f: fieldId, d: date })
}

/**
 * Set a single select field value on a project item.
 *
 * @param {string} projectId - Project ID
 * @param {string} itemId - Project item ID
 * @param {string} fieldId - Field ID
 * @param {string} optionId - Option ID
 * @returns {Promise<void>}
 */
export async function setSingleSelectField(projectId, itemId, fieldId, optionId) {
    const mutation = `mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){
        updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){
            projectV2Item{id}
        }
    }`
    await ghGraphQL(mutation, { p: projectId, i: itemId, f: fieldId, o: optionId })
}

/**
 * Set a text field value on a project item.
 *
 * @param {string} projectId - Project ID
 * @param {string} itemId - Project item ID
 * @param {string} fieldId - Field ID
 * @param {string} text - Text value
 * @returns {Promise<void>}
 */
export async function setTextField(projectId, itemId, fieldId, text) {
    const mutation = `mutation($p:ID!,$i:ID!,$f:ID!,$t:String!){
        updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{text:$t}}){
            projectV2Item{id}
        }
    }`
    await ghGraphQL(mutation, { p: projectId, i: itemId, f: fieldId, t: text })
}

/**
 * Update all provisional schedule fields for a project item.
 *
 * @param {string} projectId - Project ID
 * @param {string} itemId - Project item ID
 * @param {object} scheduleData - Schedule data
 * @param {string} scheduleData.start - Start date (YYYY-MM-DD)
 * @param {string} scheduleData.finish - Finish date (YYYY-MM-DD)
 * @param {string} scheduleData.confidence - Confidence level ('high', 'medium', 'low')
 * @param {string} scheduleData.basis - Basis description text
 * @returns {Promise<void>}
 */
export async function updateProvisionalSchedule(projectId, itemId, scheduleData) {
    const fields = await getProjectFields(projectId)

    // Find required fields
    const provisionalStartField = fields.find((f) => f.name === 'Provisional Start')
    const provisionalFinishField = fields.find((f) => f.name === 'Provisional Finish')
    const confidenceField = fields.find((f) => f.name === 'Provisional Confidence')
    const basisField = fields.find((f) => f.name === 'Estimation Basis')

    // Validate fields exist
    if (!provisionalStartField) {
        console.warn('Warning: Provisional Start field not found in project. Skipping.')
        return
    }
    if (!provisionalFinishField) {
        console.warn('Warning: Provisional Finish field not found in project. Skipping.')
        return
    }

    // Set date fields
    await setDateField(projectId, itemId, provisionalStartField.id, scheduleData.start)
    await setDateField(projectId, itemId, provisionalFinishField.id, scheduleData.finish)

    // Set confidence field (single select) if it exists
    if (confidenceField) {
        const confidenceValue = scheduleData.confidence.charAt(0).toUpperCase() + scheduleData.confidence.slice(1)
        const option = confidenceField.options.find((o) => o.name === confidenceValue)
        if (option) {
            await setSingleSelectField(projectId, itemId, confidenceField.id, option.id)
        } else {
            console.warn(
                `Warning: Confidence option '${confidenceValue}' not found. Available: ${confidenceField.options.map((o) => o.name).join(', ')}`
            )
        }
    }

    // Set basis field (text) if it exists
    if (basisField) {
        await setTextField(projectId, itemId, basisField.id, scheduleData.basis)
    }
}

/**
 * Get provisional schedule data for a project item.
 *
 * @param {string} itemId - Project item ID
 * @returns {Promise<object|null>} Schedule data or null if not found
 */
export async function getProvisionalSchedule(itemId) {
    const query = `query($itemId:ID!){
        node(id:$itemId){
            ... on ProjectV2Item {
                provisionalStart: fieldValueByName(name:"Provisional Start"){
                    ... on ProjectV2ItemFieldDateValue { date }
                }
                provisionalFinish: fieldValueByName(name:"Provisional Finish"){
                    ... on ProjectV2ItemFieldDateValue { date }
                }
                provisionalConfidence: fieldValueByName(name:"Provisional Confidence"){
                    ... on ProjectV2ItemFieldSingleSelectValue { name }
                }
                estimationBasis: fieldValueByName(name:"Estimation Basis"){
                    ... on ProjectV2ItemFieldTextValue { text }
                }
            }
        }
    }`
    const data = await ghGraphQL(query, { itemId })
    const item = data.node
    if (!item) return null

    return {
        start: item.provisionalStart?.date || null,
        finish: item.provisionalFinish?.date || null,
        confidence: item.provisionalConfidence?.name?.toLowerCase() || null,
        basis: item.estimationBasis?.text || null
    }
}
