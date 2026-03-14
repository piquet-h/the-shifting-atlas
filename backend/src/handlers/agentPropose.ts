/**
 * Agent Propose Handler
 *
 * HTTP POST /api/agent/propose
 *
 * Accepts an AgentProposalEnvelope from an agent (e.g. Azure AI Foundry),
 * validates it deterministically using the shared proposal validator, and
 * returns the validation result without mutating any shared state.
 *
 * Flow (sense→decide→propose):
 *  1. Agent senses world state via MCP tools (WorldContext-*, Lore-*).
 *  2. Agent decides on actions and constructs a proposal.
 *  3. Agent submits proposal here; this endpoint validates and records the outcome.
 *
 * Validation outcomes:
 *  - 400 SchemaInvalid  — body is not a valid AgentProposalEnvelope
 *  - 200 rejected       — schema valid but deterministic rules failed; audit record included
 *  - 200 accepted       — schema valid and all rules passed
 *
 * Invalid proposals are recorded in telemetry as rejected audit records;
 * they never mutate world state.
 *
 * Request body:  AgentProposalEnvelope (JSON)
 * Response (200):
 *   { success: true, data: { outcome, proposalId, rejectionReasons, auditRecord? } }
 */

import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import {
    safeValidateAgentProposal,
    type AgentProposalEnvelope,
    type ProposalValidationResult,
    type RejectedProposalAuditRecord
} from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { errorResponse, okResponse } from './utils/responseBuilder.js'

@injectable()
export class AgentProposeHandler extends BaseHandler {
    constructor(@inject('ITelemetryClient') telemetry: ITelemetryClient) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        // Parse body
        let body: unknown
        try {
            const text = await req.text()
            body = text ? JSON.parse(text) : {}
        } catch {
            return errorResponse(400, 'InvalidJson', 'Request body must be valid JSON', {
                correlationId: this.correlationId
            })
        }

        // Validate proposal envelope (schema + business rules)
        const result = safeValidateAgentProposal(body)

        if (!result.success) {
            // Schema parse failed — agent produced malformed output
            const issueCount = result.schemaError.issues.length
            this.track('Agent.Proposal.SchemaInvalid', {
                issueCount,
                firstIssue: result.schemaError.issues[0]?.message ?? 'unknown'
            })

            return errorResponse(
                400,
                'SchemaInvalid',
                `Proposal body is not a valid AgentProposalEnvelope (${issueCount} schema issue${issueCount === 1 ? '' : 's'})`,
                { correlationId: this.correlationId }
            )
        }

        // Schema passed — body is a valid AgentProposalEnvelope
        const envelope = body as AgentProposalEnvelope
        const { validationResult } = result

        // Compute decision latency: time from when the agent issued the proposal to now.
        const decisionLatencyMs = Math.max(0, Date.now() - new Date(envelope.issuedUtc).getTime())

        const commonProps = {
            proposalId: validationResult.proposalId,
            actorKind: envelope.actor.kind,
            actionCount: envelope.proposedActions.length,
            decisionLatencyMs,
            proposalCorrelationId: envelope.correlationId,
            ...(envelope.causationId ? { causationId: envelope.causationId } : {})
        }

        // Always emit Received event for observability
        this.track('Agent.Proposal.Received', commonProps)

        if (validationResult.outcome === 'accepted') {
            this.track('Agent.Proposal.Accepted', commonProps)
            return okResponse(buildAcceptedResponse(validationResult), { correlationId: this.correlationId })
        }

        // Proposal rejected — record audit and return without mutating state
        this.track('Agent.Proposal.Rejected', {
            ...commonProps,
            rejectionCount: validationResult.rejectionReasons.length
        })

        const auditRecord: RejectedProposalAuditRecord = {
            proposalId: validationResult.proposalId,
            proposal: envelope,
            validationResult,
            auditedUtc: new Date().toISOString()
        }

        return okResponse(buildRejectedResponse(validationResult, auditRecord), { correlationId: this.correlationId })
    }
}

function buildAcceptedResponse(validationResult: ProposalValidationResult) {
    return {
        outcome: validationResult.outcome,
        proposalId: validationResult.proposalId,
        rejectionReasons: []
    }
}

function buildRejectedResponse(validationResult: ProposalValidationResult, auditRecord: RejectedProposalAuditRecord) {
    return {
        outcome: validationResult.outcome,
        proposalId: validationResult.proposalId,
        rejectionReasons: validationResult.rejectionReasons,
        auditRecord
    }
}

export async function agentProposeHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(AgentProposeHandler)
    return handler.handle(req, context)
}
