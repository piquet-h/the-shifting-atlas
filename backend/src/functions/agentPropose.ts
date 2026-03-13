import { app } from '@azure/functions'
import { agentProposeHandler } from '../handlers/agentPropose.js'

/**
 * HTTP endpoint for agent proposal submission.
 * POST /api/agent/propose
 *
 * Validates an AgentProposalEnvelope and returns the deterministic outcome.
 * Invalid proposals are recorded in telemetry; they never mutate world state.
 */
app.http('HttpAgentPropose', {
    route: 'agent/propose',
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: agentProposeHandler
})
