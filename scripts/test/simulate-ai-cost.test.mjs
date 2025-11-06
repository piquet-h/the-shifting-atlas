/**
 * Integration test for simulate-ai-cost.mjs script
 * Tests the CLI interface and telemetry simulation behavior
 */

import assert from 'node:assert'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, test } from 'node:test'
import { promisify } from 'node:util'

const execAsync = promisify(execFile)

const SCRIPT_PATH = resolve(new URL('..', import.meta.url).pathname, 'simulate-ai-cost.mjs')

describe('simulate-ai-cost.mjs CLI', () => {
    test('runs successfully with default configuration', async () => {
        const { stdout, stderr } = await execAsync('node', [SCRIPT_PATH])

        // Check for success indicators
        assert.ok(stdout.includes('🔬 AI Cost Telemetry Simulation Harness'), 'shows title')
        assert.ok(stdout.includes('Configuration:'), 'shows configuration')
        assert.ok(stdout.includes('Calls per template: 5'), 'shows default calls per template')
        assert.ok(stdout.includes('Completion ratio: 0.5'), 'shows default completion ratio')
        assert.ok(stdout.includes('Found 3 prompt templates'), 'found prompt templates')
        assert.ok(stdout.includes('Simulation Summary'), 'shows summary section')
        assert.ok(stdout.includes('Total AI calls: 15'), 'shows total calls (3 templates × 5 calls)')
        assert.ok(stdout.includes('Aggregate cost:'), 'shows aggregate cost')
        assert.ok(stdout.includes('microdollars'), 'cost in microdollars')
        assert.ok(stdout.includes('Top 3 prompt token buckets:'), 'shows prompt buckets')
        assert.ok(stdout.includes('Top 3 completion token buckets:'), 'shows completion buckets')
        assert.ok(stdout.includes('Window summaries emitted: 1'), 'shows window summaries')
        assert.ok(stdout.includes('✅ Simulation completed successfully'), 'shows success')
    })

    test('respects SIM_CALLS_PER_TEMPLATE environment variable', async () => {
        const { stdout } = await execAsync('node', [SCRIPT_PATH], {
            env: { ...process.env, SIM_CALLS_PER_TEMPLATE: '10' }
        })

        assert.ok(stdout.includes('Calls per template: 10'), 'uses custom calls per template')
        assert.ok(stdout.includes('Total AI calls: 30'), 'total calls = 3 templates × 10 calls')
    })

    test('respects COMPLETION_RATIO environment variable', async () => {
        const { stdout } = await execAsync('node', [SCRIPT_PATH], {
            env: { ...process.env, COMPLETION_RATIO: '0' }
        })

        assert.ok(stdout.includes('Completion ratio: 0'), 'uses custom completion ratio')
        // With 0 completion ratio, completion tokens should be minimal (0-32 bucket)
        assert.ok(stdout.includes('0-32: 15 calls (100.0%)'), 'all completions in 0-32 bucket')
    })

    test('handles high completion ratio', async () => {
        const { stdout } = await execAsync('node', [SCRIPT_PATH], {
            env: { ...process.env, COMPLETION_RATIO: '2' }
        })

        assert.ok(stdout.includes('Completion ratio: 2'), 'uses high completion ratio')
        // Higher completion ratio should result in higher costs
        const costMatch = stdout.match(/Aggregate cost: ([\d,]+) microdollars/)
        assert.ok(costMatch, 'has aggregate cost')
        const cost = parseInt(costMatch[1].replace(/,/g, ''), 10)
        assert.ok(cost > 500, 'cost is higher with larger completions')
    })

    test('rejects invalid SIM_CALLS_PER_TEMPLATE', async () => {
        await assert.rejects(
            async () => {
                await execAsync('node', [SCRIPT_PATH], {
                    env: { ...process.env, SIM_CALLS_PER_TEMPLATE: '-5' }
                })
            },
            (error) => {
                const output = error.stderr || ''
                assert.ok(output.includes('SIM_CALLS_PER_TEMPLATE must be a positive integer'), 'shows validation error')
                return true
            },
            'exits with error for negative calls'
        )
    })

    test('rejects invalid COMPLETION_RATIO', async () => {
        await assert.rejects(
            async () => {
                await execAsync('node', [SCRIPT_PATH], {
                    env: { ...process.env, COMPLETION_RATIO: '-1' }
                })
            },
            (error) => {
                const output = error.stderr || ''
                assert.ok(output.includes('COMPLETION_RATIO must be a non-negative number'), 'shows validation error')
                return true
            },
            'exits with error for negative ratio'
        )
    })

    test('rejects non-numeric SIM_CALLS_PER_TEMPLATE', async () => {
        await assert.rejects(
            async () => {
                await execAsync('node', [SCRIPT_PATH], {
                    env: { ...process.env, SIM_CALLS_PER_TEMPLATE: 'invalid' }
                })
            },
            (error) => {
                const output = error.stderr || ''
                assert.ok(output.includes('SIM_CALLS_PER_TEMPLATE must be a positive integer'), 'shows validation error')
                return true
            },
            'exits with error for non-numeric value'
        )
    })

    test('shows all required summary fields', async () => {
        const { stdout } = await execAsync('node', [SCRIPT_PATH])

        // Verify all acceptance criteria summary fields
        assert.ok(stdout.includes('Total AI calls:'), 'shows total calls')
        assert.ok(stdout.includes('Aggregate cost:'), 'shows aggregate cost')
        assert.ok(stdout.includes('microdollars'), 'cost in microdollars')
        assert.ok(/\$\d+\.\d{6}/.test(stdout), 'shows cost in USD with 6 decimals')
        assert.ok(stdout.includes('Top 3 prompt token buckets:'), 'shows prompt buckets')
        assert.ok(stdout.includes('Top 3 completion token buckets:'), 'shows completion buckets')
        assert.ok(stdout.includes('Window summaries emitted:'), 'shows window summaries count')
    })

    test('token buckets show frequency and percentage', async () => {
        const { stdout } = await execAsync('node', [SCRIPT_PATH])

        // Check that bucket output includes count and percentage
        const bucketMatch = stdout.match(/(\d+)\.\s+(\d+-\d+k?|\d+k?\+):\s+(\d+)\s+calls\s+\((\d+\.\d+)%\)/)
        assert.ok(bucketMatch, 'bucket line has expected format: "1. 33-128: 15 calls (100.0%)"')
    })

    test('emits window summary with correct fields', async () => {
        const { stdout } = await execAsync('node', [SCRIPT_PATH])

        // Check window summary format
        const summaryMatch = stdout.match(
            /\d+\.\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[([^\]]+)\]:\s+(\d+)\s+calls,\s+([\d,]+)µ\$\s+\(delayed:\s+(true|false)\)/
        )
        assert.ok(summaryMatch, 'window summary has expected format')
        assert.ok(summaryMatch[1], 'has ISO timestamp')
        assert.ok(summaryMatch[2], 'has model ID')
        assert.ok(parseInt(summaryMatch[3]) > 0, 'has positive call count')
        assert.ok(parseInt(summaryMatch[4].replace(/,/g, '')) > 0, 'has positive cost')
        assert.strictEqual(summaryMatch[5], 'false', 'not a delayed flush in normal run')
    })
})
