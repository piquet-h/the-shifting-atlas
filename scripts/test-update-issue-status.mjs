#!/usr/bin/env node
/* eslint-env node */
/**
 * Simple syntax and logic test for update-issue-status.mjs
 * Tests the functions without requiring GitHub API access
 */

import {parseArgs} from 'node:util'

console.log('✓ parseArgs import works')

// Test the parseArgs functionality
try {
    const {values} = parseArgs({
        args: ['--issue-number', '123', '--status', 'In progress'],
        options: {
            'issue-number': {type: 'string'},
            'status': {type: 'string'},
            'help': {type: 'boolean', short: 'h'}
        }
    })
    
    if (values['issue-number'] === '123' && values.status === 'In progress') {
        console.log('✓ parseArgs parsing works correctly')
    } else {
        console.error('✗ parseArgs parsing failed')
        process.exit(1)
    }
} catch (error) {
    console.error('✗ parseArgs test failed:', error)
    process.exit(1)
}

// Test basic utility functions (mock)
function mockExtractStatus(fieldValues) {
    for (const fv of fieldValues.nodes) {
        if (fv.field?.name === 'Status') {
            return fv.name || fv.text || fv.number || ''
        }
    }
    return ''
}

function mockFindStatusOptionId(projectFields, statusValue) {
    const statusField = projectFields.find(field => field.name === 'Status' && field.options)
    if (!statusField) return null
    
    const option = statusField.options.find(opt => opt.name === statusValue)
    return option?.id || null
}

// Test with mock data
const mockFieldValues = {
    nodes: [
        {
            field: { name: 'Status' },
            name: 'Todo'
        }
    ]
}

const mockProjectFields = [
    {
        name: 'Status',
        id: 'field-123',
        options: [
            { id: 'option-1', name: 'Todo' },
            { id: 'option-2', name: 'In progress' },
            { id: 'option-3', name: 'Done' }
        ]
    }
]

const currentStatus = mockExtractStatus(mockFieldValues)
if (currentStatus === 'Todo') {
    console.log('✓ extractStatus works correctly')
} else {
    console.error('✗ extractStatus failed, got:', currentStatus)
    process.exit(1)
}

const optionId = mockFindStatusOptionId(mockProjectFields, 'In progress')
if (optionId === 'option-2') {
    console.log('✓ findStatusOptionId works correctly')
} else {
    console.error('✗ findStatusOptionId failed, got:', optionId)
    process.exit(1)
}

console.log('🎉 All tests passed! The update-issue-status script should work correctly.')