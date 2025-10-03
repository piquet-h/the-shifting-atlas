#!/usr/bin/env node
/* eslint-env node */
/* global process, console */
/**
 * Apply Implementation Order Assignment
 *
 * Updates the roadmap/implementation-order.json file to assign or update
 * implementation order for an issue based on analysis results.
 *
 * Handles resequencing of existing issues when necessary and ensures
 * atomic updates to prevent race conditions.
 */

// (legacy imports removed)

console.error('[deprecated] apply-impl-order-assignment.mjs has been retired (implementation-order.json removed).')
process.exit(0)
/*

const ROADMAP_JSON = path.join(process.cwd(), 'roadmap/implementation-order.json')

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
        if (err.code === 'ENOENT') {
            return {
                project: 3,
                fieldId: 'PVTF_lAHOANLlqs4BEJKizg13FDI',
                generated: new Date().toISOString(),
                items: []
            }
        }
        throw err
    }
}

function writeJson(file, data) {
    // Update generation timestamp
    data.generated = new Date().toISOString()
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}

function insertIssueAtPosition(existingOrdering, issueNumber, title, targetPosition, requiresResequence) {
    const items = [...existingOrdering.items]

    // Remove issue if it already exists
    const existingIndex = items.findIndex((item) => item.issue === issueNumber)
    if (existingIndex !== -1) {
        items.splice(existingIndex, 1)
    }

    if (requiresResequence) {
        // Insert at position and resequence everything
        const newItem = {
            issue: issueNumber,
            order: targetPosition,
            title: title
        }

        // Find where to insert based on desired order
        let insertIndex = 0
        for (let i = 0; i < items.length; i++) {
            if (items[i].order >= targetPosition) {
                insertIndex = i
                break
            }
            insertIndex = i + 1
        }

        // Insert the new item
        items.splice(insertIndex, 0, newItem)

        // Resequence all items to be contiguous 1, 2, 3, ...
        items.forEach((item, index) => {
            item.order = index + 1
        })

        console.log(`Inserted issue #${issueNumber} at position ${targetPosition}, resequenced ${items.length} items`)
    } else {
        // Simple append at end
        const newOrder = Math.max(0, ...items.map((i) => i.order)) + 1
        items.push({
            issue: issueNumber,
            order: newOrder,
            title: title
        })

        console.log(`Appended issue #${issueNumber} at position ${newOrder}`)
    }

    return {
        ...existingOrdering,
        items: items.sort((a, b) => a.order - b.order)
    }
}

function updateIssuePosition(existingOrdering, issueNumber, title, newPosition, requiresResequence) {
    const items = [...existingOrdering.items]

    // Find and remove the existing item
    const existingIndex = items.findIndex((item) => item.issue === issueNumber)
    if (existingIndex === -1) {
        throw new Error(`Issue #${issueNumber} not found in existing ordering`)
    }

    const existingItem = items[existingIndex]
    const oldPosition = existingItem.order
    items.splice(existingIndex, 1)

    if (requiresResequence) {
        // Insert at new position and resequence
        const updatedItem = {
            ...existingItem,
            order: newPosition,
            title: title // Update title in case it changed
        }

        // Find where to insert based on desired order
        let insertIndex = 0
        for (let i = 0; i < items.length; i++) {
            if (items[i].order >= newPosition) {
                insertIndex = i
                break
            }
            insertIndex = i + 1
        }

        items.splice(insertIndex, 0, updatedItem)

        // Resequence all items
        items.forEach((item, index) => {
            item.order = index + 1
        })

        console.log(`Moved issue #${issueNumber} from position ${oldPosition} to ${newPosition}, resequenced ${items.length} items`)
    } else {
        // Simple position update without affecting others
        existingItem.order = newPosition
        existingItem.title = title
        items.push(existingItem)

        console.log(`Updated issue #${issueNumber} position to ${newPosition}`)
    }

    return {
        ...existingOrdering,
        items: items.sort((a, b) => a.order - b.order)
    }
}

function validateOrdering(ordering) {
    const orders = ordering.items.map((i) => i.order).sort((a, b) => a - b)

    // Check for duplicates
    const unique = [...new Set(orders)]
    if (unique.length !== orders.length) {
        throw new Error('Duplicate orders detected in implementation ordering')
    }

    // Check for contiguous sequence starting from 1
    const contiguous = orders.every((order, index) => order === index + 1)
    if (!contiguous) {
        console.warn('Non-contiguous ordering detected:', orders)
        // This is a warning, not an error - the sync script will handle normalization
    }

    // Check for issue number duplicates
    const issueNumbers = ordering.items.map((i) => i.issue)
    const uniqueIssues = [...new Set(issueNumbers)]
    if (uniqueIssues.length !== issueNumbers.length) {
        throw new Error('Duplicate issue numbers detected in implementation ordering')
    }

    return true
}

async function main() {
    const { values } = parseArgs({
        options: {
            'issue-number': { type: 'string', short: 'n' },
            title: { type: 'string', short: 't' },
            'recommended-order': { type: 'string', short: 'o' },
            'requires-resequence': { type: 'string', short: 'r' },
            action: { type: 'string', short: 'a' }
        }
    })

    const issueNumber = parseInt(values['issue-number'], 10)
    const title = values.title || `Issue #${issueNumber}`
    const recommendedOrder = parseInt(values['recommended-order'], 10)
    const requiresResequence = values['requires-resequence'] === 'true'
    const action = values.action || 'assign'

    if (!issueNumber || !recommendedOrder) {
        console.error('Issue number and recommended order are required')
        process.exit(1)
    }

    if (action === 'skip') {
        console.log(`Skipping implementation order assignment for issue #${issueNumber}`)
        return
    }

    console.log(`Applying implementation order assignment:`)
    console.log(`- Issue: #${issueNumber} (${title})`)
    console.log(`- Action: ${action}`)
    console.log(`- Recommended Order: ${recommendedOrder}`)
    console.log(`- Requires Resequence: ${requiresResequence}`)

    // Load existing ordering
    const existingOrdering = readJson(ROADMAP_JSON)
    console.log(`Loaded existing ordering with ${existingOrdering.items.length} items`)

    // Create backup
    const backupFile = `${ROADMAP_JSON}.backup.${Date.now()}`
    fs.writeFileSync(backupFile, JSON.stringify(existingOrdering, null, 2))
    console.log(`Created backup: ${path.basename(backupFile)}`)

    let updatedOrdering

    try {
        if (action === 'assign') {
            updatedOrdering = insertIssueAtPosition(existingOrdering, issueNumber, title, recommendedOrder, requiresResequence)
        } else if (action === 'update') {
            updatedOrdering = updateIssuePosition(existingOrdering, issueNumber, title, recommendedOrder, requiresResequence)
        } else {
            throw new Error(`Unknown action: ${action}`)
        }

        // Validate the result
        validateOrdering(updatedOrdering)

        // Write the updated ordering
        writeJson(ROADMAP_JSON, updatedOrdering)
        console.log(`Successfully updated ${ROADMAP_JSON}`)

        // Clean up backup on success
        fs.unlinkSync(backupFile)
        console.log(`Cleaned up backup file`)
    } catch (error) {
        console.error('Error applying implementation order assignment:', error.message)
        console.log(`Backup preserved at: ${backupFile}`)
        process.exit(1)
    }
}

main && main().catch((err) => {
    console.error('Unexpected error (deprecated path):', err)
    process.exit(1)
})
*/
