/**
 * Example: Using AI Cost Aggregator for Hourly Telemetry
 *
 * This example demonstrates how to use the AI cost aggregator
 * in a backend service to track and emit hourly cost summaries.
 */

import { recordEstimatedAICost, forceFlushAICostSummary, type AICostWindowSummary } from '../src/aiCostAggregator.js'

// Simulated telemetry client (in real backend, use Application Insights)
interface TelemetryClient {
    emit(eventName: string, payload: unknown): void
}

const telemetryClient: TelemetryClient = {
    emit(eventName: string, payload: unknown) {
        console.log(`[Telemetry] ${eventName}:`, JSON.stringify(payload, null, 2))
    }
}

// Example 1: Recording AI costs during normal operation
console.log('=== Example 1: Normal Operation ===\n')

// Simulate AI operations across different hours
const hour1 = new Date('2025-11-05T20:30:00.000Z').getTime()
const hour2 = new Date('2025-11-05T21:15:00.000Z').getTime()

// Record some operations in hour 1
let summaries = recordEstimatedAICost(
    {
        modelId: 'gpt-4o-mini',
        promptTokens: 150,
        completionTokens: 450,
        estimatedCostMicros: 375
    },
    hour1
)
console.log(`Hour 1, Operation 1: ${summaries.length} summaries to emit`)

summaries = recordEstimatedAICost(
    {
        modelId: 'gpt-4o-mini',
        promptTokens: 200,
        completionTokens: 600,
        estimatedCostMicros: 500
    },
    hour1
)
console.log(`Hour 1, Operation 2: ${summaries.length} summaries to emit`)

// Hour rollover - this will flush hour 1
summaries = recordEstimatedAICost(
    {
        modelId: 'gpt-4o-mini',
        promptTokens: 100,
        completionTokens: 300,
        estimatedCostMicros: 250
    },
    hour2
)
console.log(`Hour 2, Operation 1: ${summaries.length} summaries to emit\n`)

// Emit the summaries
for (const summary of summaries) {
    telemetryClient.emit('AI.Cost.WindowSummary', summary)
}

// Example 2: Graceful shutdown with force flush
console.log('\n=== Example 2: Graceful Shutdown ===\n')

// Force flush remaining summaries
const remainingSummaries = forceFlushAICostSummary()
console.log(`Force flush: ${remainingSummaries.length} summaries to emit\n`)

for (const summary of remainingSummaries) {
    telemetryClient.emit('AI.Cost.WindowSummary', summary)
}

// Example 3: Delayed flush scenario
console.log('\n=== Example 3: Delayed Flush (Idle >1 hour) ===\n')

const earlyMorning = new Date('2025-11-06T02:00:00.000Z').getTime()
const afternoon = new Date('2025-11-06T15:30:00.000Z').getTime()

// Activity in early morning
recordEstimatedAICost(
    {
        modelId: 'gpt-4o',
        promptTokens: 500,
        completionTokens: 1500,
        estimatedCostMicros: 5000
    },
    earlyMorning
)

// Long idle period, then activity in afternoon
// This will emit early morning summary with delayedFlush=true
const delayedSummaries = recordEstimatedAICost(
    {
        modelId: 'gpt-4o',
        promptTokens: 300,
        completionTokens: 900,
        estimatedCostMicros: 3000
    },
    afternoon
)

console.log(`Delayed flush: ${delayedSummaries.length} summaries to emit`)
console.log(`delayedFlush flag: ${delayedSummaries[0]?.delayedFlush}\n`)

for (const summary of delayedSummaries) {
    telemetryClient.emit('AI.Cost.WindowSummary', summary)
}

console.log('\n=== Examples Complete ===')
