#!/usr/bin/env node
/**
 * Integration test for temporal configuration environment variable override
 *
 * This script verifies that environment variables correctly override default config values.
 * It spawns child processes with different env vars to ensure module singleton reloads.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const TEST_CASES = [
    {
        name: 'Default configuration',
        env: {},
        expected: {
            epsilonMs: 300000,
            slowThresholdMs: 3600000,
            compressThresholdMs: 86400000,
            driftRate: 1.0,
            waitMaxStepMs: 1800000,
            slowMaxStepMs: 600000,
        },
    },
    {
        name: 'Custom epsilon',
        env: { TEMPORAL_EPSILON_MS: '600000' },
        expected: {
            epsilonMs: 600000,
            slowThresholdMs: 3600000,
            compressThresholdMs: 86400000,
            driftRate: 1.0,
            waitMaxStepMs: 1800000,
            slowMaxStepMs: 600000,
        },
    },
    {
        name: 'All custom values',
        env: {
            TEMPORAL_EPSILON_MS: '120000',
            TEMPORAL_SLOW_THRESHOLD_MS: '1800000',
            TEMPORAL_COMPRESS_THRESHOLD_MS: '43200000',
            TEMPORAL_DRIFT_RATE: '2.0',
            TEMPORAL_WAIT_MAX_STEP_MS: '900000',
            TEMPORAL_SLOW_MAX_STEP_MS: '300000',
        },
        expected: {
            epsilonMs: 120000,
            slowThresholdMs: 1800000,
            compressThresholdMs: 43200000,
            driftRate: 2.0,
            waitMaxStepMs: 900000,
            slowMaxStepMs: 300000,
        },
    },
    {
        name: 'Zero drift rate (paused time)',
        env: {
            TEMPORAL_DRIFT_RATE: '0',
        },
        expected: {
            epsilonMs: 300000,
            slowThresholdMs: 3600000,
            compressThresholdMs: 86400000,
            driftRate: 0,
            waitMaxStepMs: 1800000,
            slowMaxStepMs: 600000,
        },
    },
]

const INVALID_TEST_CASES = [
    {
        name: 'Invalid: epsilon >= slowThreshold',
        env: {
            TEMPORAL_EPSILON_MS: '3600000',
            TEMPORAL_SLOW_THRESHOLD_MS: '3600000',
        },
        expectedError: 'epsilonMs must be less than slowThresholdMs',
    },
    {
        name: 'Invalid: negative epsilon',
        env: { TEMPORAL_EPSILON_MS: '-1000' },
        expectedError: 'epsilonMs must be positive',
    },
    {
        name: 'Invalid: negative drift rate',
        env: { TEMPORAL_DRIFT_RATE: '-0.5' },
        expectedError: 'driftRate must be non-negative',
    },
]

/**
 * Helper function to run a test case in a child process
 */
function runTestCase(testCase, shouldFail = false) {
    return new Promise((resolve, reject) => {
        const scriptPath = join(__dirname, 'temporal-config-test-helper.mjs')
        const child = spawn('node', [scriptPath], {
            env: {
                ...process.env,
                ...testCase.env,
            },
            stdio: 'pipe',
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (data) => {
            stdout += data.toString()
        })

        child.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        child.on('close', (code) => {
            if (shouldFail) {
                if (code !== 0) {
                    // Expected failure
                    if (stderr.includes(testCase.expectedError)) {
                        resolve({ success: true, stderr })
                    } else {
                        reject(
                            new Error(
                                `Expected error "${testCase.expectedError}" but got: ${stderr}`
                            )
                        )
                    }
                } else {
                    reject(new Error('Expected test to fail but it succeeded'))
                }
            } else {
                if (code === 0) {
                    try {
                        const result = JSON.parse(stdout)
                        resolve(result)
                    } catch (error) {
                        reject(new Error(`Failed to parse output: ${stdout}\nError: ${error.message}`))
                    }
                } else {
                    reject(new Error(`Process failed with code ${code}\nStderr: ${stderr}`))
                }
            }
        })

        child.on('error', reject)
    })
}

/**
 * Main test runner
 */
async function main() {
    console.log('🧪 Running temporal configuration integration tests...\n')

    let passed = 0
    let failed = 0

    // Test valid configurations
    for (const testCase of TEST_CASES) {
        try {
            console.log(`  Testing: ${testCase.name}`)
            const result = await runTestCase(testCase)

            // Compare result with expected
            const matches = Object.entries(testCase.expected).every(
                ([key, value]) => result[key] === value
            )

            if (matches) {
                console.log(`    ✅ PASS`)
                passed++
            } else {
                console.log(`    ❌ FAIL - Config mismatch`)
                console.log(`       Expected:`, testCase.expected)
                console.log(`       Got:`, result)
                failed++
            }
        } catch (error) {
            console.log(`    ❌ FAIL - ${error.message}`)
            failed++
        }
    }

    // Test invalid configurations
    for (const testCase of INVALID_TEST_CASES) {
        try {
            console.log(`  Testing: ${testCase.name}`)
            await runTestCase(testCase, true)
            console.log(`    ✅ PASS (correctly rejected invalid config)`)
            passed++
        } catch (error) {
            console.log(`    ❌ FAIL - ${error.message}`)
            failed++
        }
    }

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)

    if (failed > 0) {
        process.exit(1)
    } else {
        console.log('✅ All integration tests passed!')
        process.exit(0)
    }
}

main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
})
