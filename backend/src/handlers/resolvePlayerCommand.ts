/**
 * Resolve Player Command Handler
 *
 * POST /api/player/command
 *
 * Non-mutating endpoint that resolves a free-form player input string into a
 * deterministic next-action plan using the PI-0 heuristic intent parser.
 *
 * This is the orchestration seam described in docs/workflows/foundry/resolve-player-command.md.
 * It returns a resolution only (no canonical writes), enabling callers to choose
 * presentation mode/tempo and then invoke existing canonical endpoints
 * (/player/{id}/move, /location/{id}/look, etc.).
 *
 * Request body: { playerId: string, inputText: string }
 * Response (200):
 *   {
 *     success: true,
 *     data: {
 *       actionKind: 'Move' | 'Look' | 'Unknown',
 *       direction?: string,          // present for Move with resolved direction
 *       presentationMode: 'Auto',
 *       responseTempo: 'Auto',
 *       canonicalWritesPlanned: boolean,
 *       parsedIntent: {
 *         verb: string | null,
 *         confidence: number,
 *         needsClarification: boolean,
 *         ambiguities?: AmbiguityIssue[]
 *       },
 *       actionIntent: {              // ActionIntent-compatible; replayable + auditable
 *         rawInput: string,
 *         parsedIntent: { verb: string, targets?: ActionIntentTarget[] },
 *         validationResult: { success: boolean, errors?: string[] }
 *       }
 *     }
 *   }
 *
 * Validation errors (400): MissingPlayerId, MissingField, ValidationError, InvalidJson
 * No persistence writes are performed.
 *
 * Risk: RUNTIME-BEHAVIOR
 */

import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { ActionIntent, ActionIntentTarget, AmbiguityIssue, Intent, ParsedCommand } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { IntentParserHandler } from './mcp/intent-parser/intent-parser.js'
import { errorResponse, okResponse } from './utils/responseBuilder.js'

/** Maximum allowed input text length in characters. */
const MAX_INPUT_LENGTH = 500

/** Derived action kind for a resolved player command. */
export type ActionKind = 'Move' | 'Look' | 'Unknown'

/** Resolution data returned by the resolve-player-command endpoint. */
export type CommandResolutionData = {
    /** High-level action category derived from the primary intent. */
    actionKind: ActionKind
    /** Direction parameter for Move intents with a fully resolved direction. */
    direction?: string
    /** Presentation mode selection (Auto = caller decides). */
    presentationMode: 'Auto'
    /** Response tempo selection (Auto = caller decides). */
    responseTempo: 'Auto'
    /**
     * Whether executing this resolution would require a canonical write.
     * true for Move (navigation mutates player state); false for Look and Unknown.
     */
    canonicalWritesPlanned: boolean
    /** Parsed intent detail – supports downstream ActionIntent adoption (issue #788). */
    parsedIntent: {
        /** Canonical verb from PI-0 parser, or null if no intent was extracted. */
        verb: string | null
        /** Parser confidence score (0–1). */
        confidence: number
        /** Whether a critical ambiguity blocks safe execution. */
        needsClarification: boolean
        /** Ambiguity issues surfaced by the parser, if any. */
        ambiguities?: AmbiguityIssue[]
    }
    /**
     * ActionIntent-compatible structure for downstream replayability and auditability.
     * Contains rawInput, parsedIntent (verb + structured targets), and validationResult.
     * validationResult.success is false for Unknown/ambiguous resolutions.
     */
    actionIntent: ActionIntent
}

/**
 * Derives the high-level ActionKind from the primary PI-0 intent.
 *
 * Rules:
 * - move + resolved direction → Move (canonicalWritesPlanned: true)
 * - move without direction    → Unknown (direction is ambiguous, no safe target)
 * - examine / look            → Look (canonicalWritesPlanned: false)
 * - anything else / no intent → Unknown (canonicalWritesPlanned: false)
 */
function deriveActionKind(intent: Intent | undefined): ActionKind {
    if (!intent) return 'Unknown'
    if (intent.verb === 'move') {
        return intent.direction ? 'Move' : 'Unknown'
    }
    if (intent.verb === 'examine') return 'Look'
    return 'Unknown'
}

/**
 * Builds an ActionIntent-compatible structure from the resolved command.
 *
 * Rules:
 * - rawInput: the trimmed player input text
 * - parsedIntent.verb: canonical verb from PI-0, or 'unknown' as fallback
 * - parsedIntent.targets:
 *   - Move → [{ kind: 'direction', canonicalDirection }]
 *   - Look → [{ kind: 'location', name: 'current location' }]
 *   - Unknown → omitted
 * - validationResult.success: true for Move/Look; false for Unknown
 * - validationResult.errors: populated for Unknown with a descriptive message
 */
function buildActionIntent(
    rawInput: string,
    actionKind: ActionKind,
    primaryIntent: Intent | undefined,
    needsClarification: boolean
): ActionIntent {
    const verb = primaryIntent?.verb ?? 'unknown'

    let firstTarget: ActionIntentTarget | undefined
    if (actionKind === 'Move' && primaryIntent?.direction) {
        firstTarget = { kind: 'direction', canonicalDirection: primaryIntent.direction }
    } else if (actionKind === 'Look') {
        firstTarget = { kind: 'location', name: 'current location' }
    }

    const errors: string[] = []
    if (actionKind === 'Unknown') {
        if (needsClarification) {
            errors.push('Command is ambiguous and requires clarification')
        } else if (primaryIntent?.verb === 'move' && !primaryIntent?.direction) {
            errors.push('Direction could not be determined from the input')
        } else {
            errors.push('Command could not be resolved to a known action')
        }
    }

    return {
        rawInput,
        parsedIntent: {
            verb,
            ...(firstTarget !== undefined ? { targets: [firstTarget] } : {})
        },
        validationResult: {
            success: actionKind !== 'Unknown',
            ...(errors.length > 0 ? { errors } : {})
        }
    }
}

@injectable()
export class ResolvePlayerCommandHandler extends BaseHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject(IntentParserHandler) private readonly intentParser: IntentParserHandler
    ) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
        // --- Parse request body ---
        let body: { playerId?: unknown; inputText?: unknown }
        try {
            const text = await req.text()
            body = text ? (JSON.parse(text) as { playerId?: unknown; inputText?: unknown }) : {}
        } catch {
            return errorResponse(400, 'InvalidJson', 'Request body must be valid JSON', {
                correlationId: this.correlationId
            })
        }

        const { playerId, inputText } = body

        // --- Validate playerId ---
        if (!playerId || typeof playerId !== 'string') {
            return errorResponse(400, 'MissingPlayerId', 'playerId is required', {
                correlationId: this.correlationId
            })
        }

        // --- Validate inputText ---
        if (inputText === undefined || inputText === null || typeof inputText !== 'string') {
            return errorResponse(400, 'MissingField', 'inputText is required', {
                correlationId: this.correlationId
            })
        }

        const trimmedInput = inputText.trim()
        if (!trimmedInput) {
            return errorResponse(400, 'MissingField', 'inputText must not be empty', {
                correlationId: this.correlationId
            })
        }

        // Enforce max length before delegating to the parser.
        if (trimmedInput.length > MAX_INPUT_LENGTH) {
            return errorResponse(400, 'ValidationError', `Input exceeds maximum length of ${MAX_INPUT_LENGTH} characters`, {
                correlationId: this.correlationId
            })
        }

        // --- Delegate to PI-0 heuristic parser (non-mutating) ---
        const parsedJson = await this.intentParser.parseCommand({ arguments: { text: trimmedInput, playerId } }, context)
        const parsed = JSON.parse(parsedJson) as ParsedCommand

        // --- Derive resolution from primary intent ---
        const primaryIntent = parsed.intents[0] as Intent | undefined
        const actionKind = deriveActionKind(primaryIntent)
        const canonicalWritesPlanned = actionKind === 'Move'

        const resolution: CommandResolutionData = {
            actionKind,
            presentationMode: 'Auto',
            responseTempo: 'Auto',
            canonicalWritesPlanned,
            parsedIntent: {
                verb: primaryIntent?.verb ?? null,
                confidence: primaryIntent?.confidence ?? 0,
                needsClarification: parsed.needsClarification
            },
            actionIntent: buildActionIntent(trimmedInput, actionKind, primaryIntent, parsed.needsClarification)
        }

        if (actionKind === 'Move' && primaryIntent?.direction) {
            resolution.direction = primaryIntent.direction
        }

        if (parsed.ambiguities && parsed.ambiguities.length > 0) {
            resolution.parsedIntent.ambiguities = parsed.ambiguities
        }

        // --- Emit single low-cardinality resolved event ---
        // TODO: replace with this.track('PlayerCommand.Resolved', ...) once @piquet-h/shared
        // is republished with the event added to GAME_EVENT_NAMES (see shared/src/telemetryEvents.ts).
        // Using this.telemetry.trackEvent() directly to avoid the GameEventName type constraint
        // in the currently installed package version.
        this.telemetry.trackEvent({
            name: 'PlayerCommand.Resolved',
            properties: {
                actionKind,
                canonicalWritesPlanned: String(canonicalWritesPlanned),
                needsClarification: String(parsed.needsClarification),
                correlationId: this.correlationId,
                latencyMs: String(this.latencyMs)
            }
        })

        return okResponse(resolution, { correlationId: this.correlationId })
    }
}

export async function handleResolvePlayerCommand(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(ResolvePlayerCommandHandler)
    return handler.handle(req, context)
}
