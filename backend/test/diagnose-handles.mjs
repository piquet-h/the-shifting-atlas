// Diagnostic script to find what's keeping Node alive
import whyIsNodeRunning from 'why-is-node-running'

// Give tests time to finish
setTimeout(() => {
    console.log('\n\n=== DIAGNOSING OPEN HANDLES ===\n')
    whyIsNodeRunning()
}, 5000)
