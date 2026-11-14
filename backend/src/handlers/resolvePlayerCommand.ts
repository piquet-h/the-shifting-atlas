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
 *       actionKind: 'Move' | 'Look' | 'Narrate' | 'Unknown',
 *       direction?: string,          // present for Move with resolved direction
 *       narration?: string,          // bounded DM narration for Narrate (non-mutating RPG intents)
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
import { inject, injectable, optional } from 'inversify'
import { TOKENS } from '../di/tokens.js'
import type { ILocationRepository } from '../repos/locationRepository.js'
import type { IPlayerRepository } from '../repos/playerRepository.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { IntentParserHandler } from './mcp/intent-parser/intent-parser.js'
import { NarrativeGeneratorHandler } from './mcp/narrative-generator/narrative-generator.js'
import { errorResponse, okResponse } from './utils/responseBuilder.js'

/** Maximum allowed input text length in characters. */
const MAX_INPUT_LENGTH = 500

/** Derived action kind for a resolved player command. */
export type ActionKind = 'Move' | 'Look' | 'Narrate' | 'Unknown'

/** Resolution data returned by the resolve-player-command endpoint. */
export type CommandResolutionData = {
    /** High-level action category derived from the primary intent. */
    actionKind: ActionKind
    /** Direction parameter for Move intents with a fully resolved direction. */
    direction?: string
    /** Bounded Dungeon Master narration for non-mutating RPG actions / targeted inspections. */
    narration?: string
    /** Presentation mode selection (Auto = caller decides). */
    presentationMode: 'Auto'
    /** Response tempo selection (Auto = caller decides). */
    responseTempo: 'Auto'
    /**
     * Whether executing this resolution would require a canonical write.
     * true for Move (navigation mutates player state); false for Look, Narrate, and Unknown.
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

const ROOM_WIDE_TARGETS = new Set([
    '',
    'around',
    'surroundings',
    'room',
    'the room',
    'area',
    'the area',
    'here',
    'location',
    'the location',
    'environment',
    'the environment'
])

const SENSORY_ONLY_VERBS = new Set(['listen', 'smell'])
const MANNER_ADVERBS = new Set(['quietly', 'carefully', 'closely', 'slowly', 'quickly', 'around', 'intently'])

const THIRD_PERSON_VERBS: Readonly<Record<string, string>> = {
    examine: 'examines',
    look: 'studies',
    inspect: 'inspects',
    listen: 'listens intently to',
    smell: 'inhales the scent of',
    read: 'reads',
    search: 'searches',
    take: 'reaches for',
    pick: 'reaches to pick up',
    grab: 'reaches for',
    get: 'reaches for',
    talk: 'speaks to',
    speak: 'speaks to',
    say: 'calls out toward',
    ask: 'questions',
    greet: 'greets',
    defend: 'raises a defensive stance against',
    block: 'braces to block',
    parry: 'readies a parry against',
    use: 'attempts to use',
    equip: 'readies',
    wield: 'readies',
    flee: 'backs away from',
    escape: 'looks for an escape route from',
    run_away: 'backs away from',
    interact: 'interacts with',
    open: 'tests',
    close: 'pushes against',
    push: 'presses against',
    pull: 'tugs at',
    touch: 'reaches out to touch'
}

interface ExtractedCommandSurface {
    leadingVerb: string
    targetPhrase: string | null
}

function extractCommandSurface(trimmedInput: string, intent: Intent | undefined): ExtractedCommandSurface {
    const match = trimmedInput.match(/^([a-z_]+)(?:\s+(.*))?$/i)
    const leadingVerb = (match?.[1] ?? intent?.verb ?? '').toLowerCase()
    const rawRemainder = (match?.[2] ?? '')
        .trim()
        .replace(/^(?:up|out|in|at|to|with|on|into|towards?|upon)\s+/i, '')
        .replace(/[.!?]+$/, '')
        .trim()

    if (!rawRemainder || MANNER_ADVERBS.has(rawRemainder.toLowerCase())) {
        return { leadingVerb, targetPhrase: null }
    }

    return { leadingVerb, targetPhrase: rawRemainder }
}

/**
 * Derives the high-level ActionKind from the primary PI-0 intent.
 *
 * Rules:
 * - move + resolved direction                 → Move (canonicalWritesPlanned: true)
 * - move without direction                    → Unknown (direction is ambiguous, no safe target)
 * - room-wide examine / look ("look", etc.)   → Look (canonicalWritesPlanned: false)
 * - targeted examine or other RPG intent verb → Narrate (canonicalWritesPlanned: false)
 * - unrecognized verb / no intent             → Unknown (canonicalWritesPlanned: false)
 */
function deriveActionKind(intent: Intent | undefined, surface: ExtractedCommandSurface): ActionKind {
    if (!intent) return 'Unknown'
    if (intent.verb === 'move') {
        return intent.direction ? 'Move' : 'Unknown'
    }
    if (intent.verb === 'examine') {
        if (SENSORY_ONLY_VERBS.has(surface.leadingVerb)) {
            return 'Narrate'
        }
        const normalizedTarget = (surface.targetPhrase ?? '').toLowerCase()
        return ROOM_WIDE_TARGETS.has(normalizedTarget) ? 'Look' : 'Narrate'
    }
    return 'Narrate'
}

function buildNarrationCue(intent: Intent, surface: ExtractedCommandSurface): { actionVerb: string; targetName: string; outcome: string } {
    const actionVerb = THIRD_PERSON_VERBS[surface.leadingVerb] ?? THIRD_PERSON_VERBS[intent.verb] ?? 'acts toward'

    if (surface.leadingVerb === 'listen' && !surface.targetPhrase) {
        return {
            actionVerb,
            targetName: 'the shifting quiet nearby',
            outcome: 'faint ambient sounds carry across the space without revealing immediate danger'
        }
    }
    if (surface.leadingVerb === 'smell' && !surface.targetPhrase) {
        return {
            actionVerb,
            targetName: 'the surrounding air',
            outcome: 'weathered stone and damp air linger without further change'
        }
    }

    const fallbackNoun = intent.surfaceTargetName ?? intent.surfaceItemName ?? 'the immediate surroundings'
    const targetName = surface.targetPhrase ?? fallbackNoun

    switch (intent.verb) {
        case 'examine':
            return {
                actionVerb,
                targetName,
                outcome: 'closer scrutiny reveals weathered detail without disturbing anything canonical'
            }
        case 'communicate':
            return {
                actionVerb,
                targetName,
                outcome: 'only guarded stillness answers in the immediate moment'
            }
        default:
            return {
                actionVerb,
                targetName,
                outcome: 'the scene holds steady without yielding a lasting change yet'
            }
    }
}

/**
 * Builds an ActionIntent-compatible structure from the resolved command.
 */
function buildActionIntent(
    rawInput: string,
    actionKind: ActionKind,
    primaryIntent: Intent | undefined,
    needsClarification: boolean,
    surface: ExtractedCommandSurface
): ActionIntent {
    const verb = primaryIntent?.verb ?? 'unknown'

    let firstTarget: ActionIntentTarget | undefined
    if (actionKind === 'Move' && primaryIntent?.direction) {
        firstTarget = { kind: 'direction', canonicalDirection: primaryIntent.direction }
    } else if (actionKind === 'Look') {
        firstTarget = { kind: 'location', name: 'current location' }
    } else if (actionKind === 'Narrate') {
        const latentText = surface.targetPhrase ?? primaryIntent?.surfaceTargetName ?? primaryIntent?.surfaceItemName
        firstTarget = latentText ? { kind: 'latent-reference', surfaceText: latentText } : { kind: 'location', name: 'current location' }
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
        @inject(IntentParserHandler) private readonly intentParser: IntentParserHandler,
        @inject(NarrativeGeneratorHandler) private readonly narrativeGenerator: NarrativeGeneratorHandler,
        @inject(TOKENS.PlayerRepository) @optional() private readonly playerRepo?: IPlayerRepository,
        @inject(TOKENS.LocationRepository) @optional() private readonly locationRepo?: ILocationRepository
    ) {
        super(telemetry)
    }

    private async resolveLocationName(playerId: string): Promise<string> {
        if (!this.playerRepo || !this.locationRepo) {
            return 'the surrounding area'
        }
        try {
            const player = await this.playerRepo.get(playerId)
            if (!player?.currentLocationId) return 'the surrounding area'
            const location = await this.locationRepo.get(player.currentLocationId)
            return location?.name || 'the surrounding area'
        } catch {
            return 'the surrounding area'
        }
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
        const surface = extractCommandSurface(trimmedInput, primaryIntent)
        const actionKind = deriveActionKind(primaryIntent, surface)
        const canonicalWritesPlanned = actionKind === 'Move'

        let narration: string | undefined
        if (actionKind === 'Narrate' && primaryIntent && !parsed.needsClarification) {
            const locationName = await this.resolveLocationName(playerId)
            const cue = buildNarrationCue(primaryIntent, surface)
            const rawNarration = await this.narrativeGenerator.narrateAction(
                {
                    arguments: {
                        actionVerb: cue.actionVerb,
                        targetName: cue.targetName,
                        locationName,
                        outcome: cue.outcome
                    }
                },
                context
            )
            const parsedNarration = JSON.parse(rawNarration) as { narrative?: string }
            narration = parsedNarration.narrative
        }

        const resolution: CommandResolutionData = {
            actionKind,
            ...(narration !== undefined ? { narration } : {}),
            presentationMode: 'Auto',
            responseTempo: 'Auto',
            canonicalWritesPlanned,
            parsedIntent: {
                verb: primaryIntent?.verb ?? null,
                confidence: primaryIntent?.confidence ?? 0,
                needsClarification: parsed.needsClarification
            },
            actionIntent: buildActionIntent(trimmedInput, actionKind, primaryIntent, parsed.needsClarification, surface)
        }

        if (actionKind === 'Move' && primaryIntent?.direction) {
            resolution.direction = primaryIntent.direction
        }

        if (parsed.ambiguities && parsed.ambiguities.length > 0) {
            resolution.parsedIntent.ambiguities = parsed.ambiguities
        }

        // --- Emit single low-cardinality resolved event ---
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
