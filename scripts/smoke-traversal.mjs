#!/usr/bin/env node
/* eslint-env node */
/* global process */
/**
 * Smoke Test: Movement Loop
 * 
 * Performs: bootstrap -> look -> move -> look
 * Verifies at least 2 distinct location IDs are reachable
 * 
 * Exit codes:
 * - 0: Success (all steps passed)
 * - 1: Failure (any step failed)
 */

import { getPlayerRepository } from '../shared/dist/repos/playerRepository.js'
import { getLocationRepository } from '../shared/dist/repos/locationRepository.js'
import { STARTER_LOCATION_ID } from '../shared/dist/location.js'

// Color helpers for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    dim: '\x1b[2m'
}

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`)
}

function stepLog(stepNumber, stepName, status, details = '') {
    const statusColor = status === 'OK' ? colors.green : colors.red
    const prefix = `[Step ${stepNumber}]`
    const detailsSuffix = details ? ` ${colors.dim}(${details})${colors.reset}` : ''
    console.log(`${prefix} ${stepName}: ${statusColor}${status}${colors.reset}${detailsSuffix}`)
}

function fail(message) {
    log(`\n❌ SMOKE TEST FAILED: ${message}`, colors.red)
    process.exit(1)
}

function success() {
    log(`\n✓ SMOKE TEST PASSED: All traversal checks completed successfully`, colors.green)
    process.exit(0)
}

async function main() {
    log('\n🔥 Starting Smoke Test: Traversal Movement Loop\n', colors.blue)
    
    const visitedLocationIds = new Set()
    
    try {
        // Step 1: Bootstrap Player
        stepLog(1, 'Bootstrap Player', '...', 'creating guest player')
        const playerRepo = await getPlayerRepository()
        const { record, created } = await playerRepo.getOrCreate()
        
        if (!record || !record.id) {
            fail('Bootstrap failed: no player record returned')
        }
        if (!created) {
            fail('Bootstrap failed: expected new player creation')
        }
        if (!record.currentLocationId) {
            fail('Bootstrap failed: player has no current location')
        }
        
        stepLog(1, 'Bootstrap Player', 'OK', `player=${record.id.substring(0, 8)}..., location=${record.currentLocationId.substring(0, 8)}...`)
        const startLocationId = record.currentLocationId
        visitedLocationIds.add(startLocationId)
        
        // Step 2: Look (initial location)
        stepLog(2, 'Look (start location)', '...', `id=${startLocationId.substring(0, 8)}...`)
        const locationRepo = await getLocationRepository()
        const startLocation = await locationRepo.get(startLocationId)
        
        if (!startLocation) {
            fail(`Look failed: location ${startLocationId} not found`)
        }
        if (!startLocation.name || !startLocation.description) {
            fail('Look failed: location missing name or description')
        }
        if (!startLocation.exits || startLocation.exits.length === 0) {
            fail('Look failed: location has no exits (cannot test movement)')
        }
        
        stepLog(2, 'Look (start location)', 'OK', `"${startLocation.name}", ${startLocation.exits.length} exits`)
        
        // Step 3: Move (first available exit)
        const firstExit = startLocation.exits[0]
        if (!firstExit.direction || !firstExit.to) {
            fail('Move setup failed: first exit missing direction or destination')
        }
        
        stepLog(3, `Move (${firstExit.direction})`, '...', `from=${startLocationId.substring(0, 8)}... to=${firstExit.to.substring(0, 8)}...`)
        const moveResult = await locationRepo.move(startLocationId, firstExit.direction)
        
        if (moveResult.status !== 'ok') {
            fail(`Move failed: ${moveResult.reason || 'unknown error'}`)
        }
        if (!moveResult.location || !moveResult.location.id) {
            fail('Move failed: no destination location returned')
        }
        
        const destinationId = moveResult.location.id
        visitedLocationIds.add(destinationId)
        stepLog(3, `Move (${firstExit.direction})`, 'OK', `arrived at ${destinationId.substring(0, 8)}...`)
        
        // Step 4: Look (destination location)
        stepLog(4, 'Look (destination)', '...', `id=${destinationId.substring(0, 8)}...`)
        const destinationLocation = moveResult.location
        
        if (!destinationLocation.name || !destinationLocation.description) {
            fail('Look failed: destination location missing name or description')
        }
        
        stepLog(4, 'Look (destination)', 'OK', `"${destinationLocation.name}"`)
        
        // Final validation: Verify at least 2 distinct locations
        log(`\n${colors.yellow}Validation:${colors.reset}`)
        console.log(`  Distinct locations visited: ${visitedLocationIds.size}`)
        console.log(`  Start location: ${startLocation.name} (${startLocationId.substring(0, 8)}...)`)
        console.log(`  End location: ${destinationLocation.name} (${destinationId.substring(0, 8)}...)`)
        
        if (visitedLocationIds.size < 2) {
            fail('Validation failed: did not visit at least 2 distinct locations')
        }
        if (startLocationId === destinationId) {
            fail('Validation failed: start and destination are the same location')
        }
        
        success()
        
    } catch (error) {
        fail(`Unexpected error: ${error.message}\n${error.stack}`)
    }
}

main()
