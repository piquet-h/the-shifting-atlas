#!/usr/bin/env node
/**
 * Diagnostic script to identify what's keeping Node alive after tests complete
 */
import { exec } from 'child_process'
import whyIsNodeRunning from 'why-is-node-running'

// Run tests
const testProcess = exec('NODE_ENV=test node --test --import=tsx test/unit/*.test.ts', {
    cwd: process.cwd()
})

testProcess.stdout.pipe(process.stdout)
testProcess.stderr.pipe(process.stderr)

testProcess.on('exit', (code) => {
    console.log('\n=== TESTS COMPLETED WITH EXIT CODE:', code, '===')
    console.log('\n=== CHECKING WHAT IS KEEPING NODE ALIVE ===\n')

    // Wait a moment for any cleanup to happen
    setTimeout(() => {
        whyIsNodeRunning()

        // Force exit after showing diagnostics
        setTimeout(() => {
            console.log('\n=== FORCING EXIT ===')
            process.exit(0)
        }, 1000)
    }, 500)
})
