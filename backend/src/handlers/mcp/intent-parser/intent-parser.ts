import type { InvocationContext } from '@azure/functions'
import type { AmbiguityIssue, Intent, IntentVerb, ParsedCommand } from '@piquet-h/shared'
import { isDirection } from '@piquet-h/shared'
import { Container, inject, injectable } from 'inversify'
import { v4 as uuidv4 } from 'uuid'
import type { ITelemetryClient } from '../../../telemetry/ITelemetryClient.js'

/** Parse version emitted in every ParsedCommand response. */
const PARSE_VERSION = '1.0.0'

/** Maximum allowed input length (chars). Inputs beyond this are rejected. */
const MAX_INPUT_LENGTH = 500

/**
 * Recognised action verbs with associated confidence multipliers.
 * Keys are lowercase; values are the canonical IntentVerb.
 */
const VERB_MAP: Readonly<Record<string, IntentVerb>> = {
    throw: 'throw',
    attack: 'attack',
    hit: 'attack',
    strike: 'attack',
    move: 'move',
    go: 'move',
    walk: 'move',
    run: 'move',
    chase: 'move',
    examine: 'examine',
    look: 'examine',
    inspect: 'examine',
    take: 'take',
    pick: 'take',
    grab: 'take',
    get: 'take',
    talk: 'communicate',
    speak: 'communicate',
    say: 'communicate',
    defend: 'defend',
    block: 'defend',
    parry: 'defend',
    use: 'use_item',
    equip: 'use_item',
    wield: 'use_item',
    flee: 'flee',
    escape: 'flee',
    run_away: 'flee',
    interact: 'interact',
    open: 'interact',
    close: 'interact',
    push: 'interact',
    pull: 'interact'
}

/**
 * Sequential connectors that signal ordered intent chains.
 * Matching any of these makes the command sequence 'sequential'.
 */
const SEQUENTIAL_PATTERNS = /\b(and\s+then|then|after\s+that|after|next|followed\s+by)\b/i

/**
 * Modifier words that indicate an adverbial role for a verb (e.g. "chase" as a modifier on "move").
 */
const MODIFIER_VERBS: Readonly<Set<string>> = new Set(['chase', 'sneak', 'rush', 'carefully', 'slowly', 'quickly'])

/**
 * Articles / prepositions whose following noun we want to capture.
 * The optional inner group handles chains: "at the seagull" → captures "seagull".
 */
const ARTICLE_PREP_NOUN_PATTERN = /\b(?:a|an|the|at|with|using|towards?)\s+(?:(?:a|an|the)\s+)?([a-z_]+)/gi

/**
 * Words that are never useful as noun candidates (connectors, articles, pronouns).
 */
const NOUN_STOPWORDS = new Set([
    'a',
    'an',
    'the',
    'at',
    'with',
    'and',
    'then',
    'after',
    'or',
    'but',
    'to',
    'of',
    'in',
    'on',
    'by',
    'for',
    'it',
    'me',
    'him',
    'her',
    'that',
    'this',
    'towards',
    'toward',
    'using',
    'next',
    'followed'
])

type ToolArgs<T> = { arguments?: T }

type ParseCommandArgs = {
    text?: string
    playerId?: string
    locationId?: string
}

/**
 * Extracts recognised action verbs from raw text.
 * Returns lowercase canonical verb strings (keys of VERB_MAP).
 */
export function extractVerbs(text: string): string[] {
    const words = text.toLowerCase().match(/[a-z_]+/g) ?? []
    const seen = new Set<string>()
    const result: string[] = []
    for (const word of words) {
        if (VERB_MAP[word] && !seen.has(word)) {
            seen.add(word)
            result.push(word)
        }
    }
    return result
}

/**
 * Determines whether the command intends sequential execution.
 */
export function detectSequence(text: string): 'sequential' | 'parallel' {
    return SEQUENTIAL_PATTERNS.test(text) ? 'sequential' : 'parallel'
}

/**
 * Extracts simple noun candidates from text using two strategies:
 * 1. Words following articles/prepositions (including article chains: "at the seagull")
 * 2. Bare direct objects that immediately follow a known verb (e.g. "attack goblin", "go north")
 *
 * De-duplicates results while preserving order of first occurrence.
 * Stopwords (articles, pronouns, connectors) are filtered from results.
 */
export function extractNouns(text: string): string[] {
    const seen = new Set<string>()
    const result: string[] = []

    function tryAdd(word: string): void {
        const w = word.toLowerCase()
        if (!NOUN_STOPWORDS.has(w) && !seen.has(w)) {
            seen.add(w)
            result.push(w)
        }
    }

    // Strategy 1: words after articles/prepositions (handles "at the seagull")
    const articlePattern = new RegExp(ARTICLE_PREP_NOUN_PATTERN.source, 'gi')
    let match: RegExpExecArray | null
    while ((match = articlePattern.exec(text)) !== null) {
        tryAdd(match[1])
    }

    // Strategy 2: bare direct objects immediately after a known verb word
    // (handles "attack goblin", "go north", "throw rock")
    const lower = text.toLowerCase()
    for (const verbWord of Object.keys(VERB_MAP)) {
        const verbPattern = new RegExp(`\\b${verbWord}\\s+([a-z_]+)`, 'i')
        const vm = lower.match(verbPattern)
        if (vm) {
            tryAdd(vm[1])
        }
    }

    return result
}

/**
 * Builds an Intent from a surface verb and an ordered noun list.
 */
function buildIntent(surfaceVerb: string, order: number, nouns: string[]): Intent {
    const verb = VERB_MAP[surfaceVerb] ?? 'interact'
    const isChase = surfaceVerb === 'chase'

    const intent: Intent = {
        id: uuidv4(),
        verb,
        order,
        confidence: isChase ? 0.75 : 0.8
    }

    if (isChase) {
        intent.modifiers = ['chase']
        intent.tacticalRole = 'pursuit'
    }

    // For 'move' verbs, check if the first noun is a direction and assign it accordingly.
    // For item-verb intents ('throw', 'use_item'), the first noun is the item and the second is the target.
    // For all other verbs, the first noun is the surface target.
    const [first, second] = nouns

    if (verb === 'move' && first && isDirection(first)) {
        intent.direction = first
    } else if (verb === 'throw' || verb === 'use_item') {
        if (first) intent.surfaceItemName = first
        if (second) intent.surfaceTargetName = second
    } else {
        if (first) intent.surfaceTargetName = first
    }

    return intent
}

/**
 * MCP-style handler for the PI-0 heuristic intent parser.
 *
 * Pure TypeScript heuristics — no AI/LLM calls.
 * Target latency: <50 ms.
 */
@injectable()
export class IntentParserHandler {
    constructor(@inject('ITelemetryClient') private readonly telemetry: ITelemetryClient) {}

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async parseCommand(toolArguments: unknown, _context: InvocationContext): Promise<string> {
        const started = Date.now()
        const toolArgs = toolArguments as ToolArgs<ParseCommandArgs>
        const args = toolArgs?.arguments ?? {}

        const text = (args.text ?? '').trim()
        const playerId = args.playerId ?? ''
        const locationId = args.locationId ?? ''

        this.telemetry.trackEvent({
            name: 'PlayerCommand.Received',
            properties: {
                rawLength: String(text.length),
                playerId: playerId || undefined,
                locationId: locationId || undefined
            }
        })

        // --- Input validation ---
        if (!text) {
            this.telemetry.trackEvent({
                name: 'PlayerCommand.ParseFailed',
                properties: { failurePhase: 'validation', reasonCode: 'empty_input' }
            })
            const empty: ParsedCommand = {
                rawText: '',
                intents: [],
                ambiguities: [],
                needsClarification: false,
                parseVersion: PARSE_VERSION,
                playerId,
                locationId,
                createdAt: new Date().toISOString()
            }
            return JSON.stringify(empty)
        }

        if (text.length > MAX_INPUT_LENGTH) {
            this.telemetry.trackEvent({
                name: 'PlayerCommand.ParseFailed',
                properties: { failurePhase: 'validation', reasonCode: 'input_too_long' }
            })
            const tooLong: ParsedCommand = {
                rawText: text.slice(0, MAX_INPUT_LENGTH),
                intents: [],
                ambiguities: [
                    {
                        id: 'ambig-toolong',
                        spanText: text.slice(0, 40),
                        issueType: 'multi_interpretation',
                        suggestions: ['Shorten the command'],
                        critical: true
                    }
                ],
                needsClarification: true,
                parseVersion: PARSE_VERSION,
                playerId,
                locationId,
                createdAt: new Date().toISOString()
            }
            return JSON.stringify(tooLong)
        }

        // --- Heuristic extraction ---
        const surfaceVerbs = extractVerbs(text)
        const nouns = extractNouns(text)
        const sequenceType = detectSequence(text)

        const intents: Intent[] = []
        const ambiguities: AmbiguityIssue[] = []

        if (surfaceVerbs.length === 0) {
            // No known verbs – flag as ambiguous unknown command
            ambiguities.push({
                id: 'ambig-unknown-verb',
                spanText: text.slice(0, 40),
                issueType: 'multi_interpretation',
                suggestions: ['Use a known action verb such as: move, look, take, attack, throw'],
                critical: false
            })

            this.telemetry.trackEvent({
                name: 'PlayerCommand.AmbiguityDetected',
                properties: {
                    ambiguityCount: '1',
                    criticalCount: '0'
                }
            })

            const ambiguous: ParsedCommand = {
                rawText: text,
                intents: [],
                ambiguities,
                needsClarification: false,
                parseVersion: PARSE_VERSION,
                playerId,
                locationId,
                createdAt: new Date().toISOString()
            }
            this.telemetry.trackEvent({
                name: 'PlayerCommand.ParseSucceeded',
                properties: {
                    intentCount: '0',
                    ambiguityCount: '1',
                    sequenceType,
                    latencyMs: String(Date.now() - started)
                }
            })
            return JSON.stringify(ambiguous)
        }

        // Build intents in sequence order.
        // In sequential mode each verb becomes a separate ordered intent (order = index).
        // In parallel mode, modifier-only verbs (e.g. "chase") are merged as modifiers rather than
        // creating separate intents, so they are filtered out before building.
        const allVerbs = sequenceType === 'sequential' ? surfaceVerbs : surfaceVerbs.filter((v) => !MODIFIER_VERBS.has(v))

        for (let i = 0; i < allVerbs.length; i++) {
            const verb = allVerbs[i]
            intents.push(buildIntent(verb, sequenceType === 'sequential' ? i : 0, nouns))
        }

        // Flag noun targets that look unresolved (not a direction and not a known game entity id format)
        for (const noun of nouns) {
            if (!isDirection(noun)) {
                ambiguities.push({
                    id: `ambig-${noun}`,
                    spanText: noun,
                    issueType: 'unknown_entity',
                    suggestions: [`Resolve "${noun}" from world context`, `Promote "${noun}" as latent entity`],
                    critical: false
                })
            }
        }

        const criticalCount = ambiguities.filter((a) => a.critical).length

        if (ambiguities.length > 0) {
            this.telemetry.trackEvent({
                name: 'PlayerCommand.AmbiguityDetected',
                properties: {
                    ambiguityCount: String(ambiguities.length),
                    criticalCount: String(criticalCount)
                }
            })
        }

        const parsed: ParsedCommand = {
            rawText: text,
            intents,
            ambiguities: ambiguities.length > 0 ? ambiguities : undefined,
            needsClarification: criticalCount > 0,
            parseVersion: PARSE_VERSION,
            playerId,
            locationId,
            createdAt: new Date().toISOString()
        }

        this.telemetry.trackEvent({
            name: 'PlayerCommand.ParseSucceeded',
            properties: {
                intentCount: String(intents.length),
                ambiguityCount: String(ambiguities.length),
                sequenceType,
                latencyMs: String(Date.now() - started)
            }
        })

        return JSON.stringify(parsed)
    }
}

// ---------------------------------------------------------------------------
// Exported wrapper functions for Azure Functions MCP tool bindings.
// The DI container is extracted from the invocation context so the handler
// class can be resolved and its dependencies injected.
// ---------------------------------------------------------------------------

export async function parseCommand(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(IntentParserHandler)
    return handler.parseCommand(toolArguments, context)
}
