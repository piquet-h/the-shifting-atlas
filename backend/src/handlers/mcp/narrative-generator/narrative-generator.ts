import type { InvocationContext } from '@azure/functions'
import { Container, inject, injectable, optional } from 'inversify'
import { TOKENS } from '../../../di/tokens.js'
import type { IAzureOpenAIClient } from '../../../services/azureOpenAIClient.js'

type ToolArgs<T> = { arguments?: T }

type GenerateAmbienceArgs = {
    locationName?: string
    timeOfDay?: string
    weather?: string
    mood?: string
    preferAi?: boolean
}

type AmbienceInput = {
    locationName: string
    timeOfDay: string
    weather: string
    mood: string
}

type NarrateActionArgs = {
    actionVerb?: string
    targetName?: string
    locationName?: string
    outcome?: string
    preferAi?: boolean
}

type ActionInput = {
    actionVerb: string
    targetName: string
    locationName: string
    outcome: string
}

type NarrateDiscoveryArgs = {
    discoveryKind?: string
    subjectName?: string
    locationName?: string
    preferAi?: boolean
}

type DiscoveryInput = {
    discoveryKind: string
    subjectName: string
    locationName: string
}

const DEFAULTS: Readonly<AmbienceInput> = {
    locationName: 'the surrounding area',
    timeOfDay: 'an uncertain hour',
    weather: 'still air',
    mood: 'wary'
}

const ACTION_DEFAULTS: Readonly<ActionInput> = {
    actionVerb: 'interacts with',
    targetName: 'something nearby',
    locationName: 'the surrounding area',
    outcome: 'nothing notable happens'
}

const DISCOVERY_DEFAULTS: Readonly<DiscoveryInput> = {
    discoveryKind: 'something',
    subjectName: 'an unidentified thing',
    locationName: 'the surrounding area'
}

const AMBIENCE_TEMPLATES: readonly string[] = [
    'At {locationName}, {timeOfDay} settles in with {weather}; the air feels {mood}, as if the world is listening before it speaks.',
    '{locationName} holds its breath through {weather}. In {timeOfDay}, every shadow turns deliberate and the mood stays {mood}.',
    'Across {locationName}, {weather} drifts through {timeOfDay}. The place feels {mood}, poised between stillness and story.',
    'You take in {locationName}: {weather}, {timeOfDay}, and a distinctly {mood} hush that suggests something just beyond sight.'
]

const ACTION_TEMPLATES: readonly string[] = [
    'As you {actionVerb} {targetName} at {locationName}, {outcome}.',
    'You {actionVerb} {targetName}. At {locationName}, {outcome}.',
    'Your attempt to {actionVerb} {targetName} in {locationName} meets its result: {outcome}.',
    'At {locationName}, you {actionVerb} {targetName} — {outcome}.'
]

const DISCOVERY_TEMPLATES: readonly string[] = [
    'You discover {subjectName} — a {discoveryKind} that emerges from {locationName}.',
    'Hidden within {locationName}, {subjectName} reveals itself as a {discoveryKind}.',
    'Your eye catches {subjectName}, a {discoveryKind} noticed for the first time in {locationName}.',
    'Something shifts in {locationName}: {subjectName} makes its presence known — a {discoveryKind}.'
]

const CANONICAL_CLAIM_PATTERNS: readonly RegExp[] = [
    /\bnew\s+(?:exit|path|passage|stair(?:case|way)|door|portal)\b/i,
    /\b(?:appears?|opens?|reveals?|unlocks?)\b.{0,40}\b(?:door|path|exit|passage|portal|stairs?)\b/i,
    /\byou\s+(?:find|discover|obtain|acquire|take)\b.{0,40}\b(?:key|sword|item|artifact|treasure|relic)\b/i,
    /\b(?:npc|merchant|guard|dragon|villager|stranger)\s+(?:arrives?|appears?|emerges?)\b/i
]

function normalizeOptionalString(input: unknown): string | undefined {
    if (typeof input !== 'string') return undefined
    const trimmed = input.trim()
    if (!trimmed) return undefined
    return trimmed
}

function normalizeOptionalBoolean(input: unknown): boolean | undefined {
    if (typeof input === 'boolean') return input
    if (typeof input === 'string') {
        const value = input.trim().toLowerCase()
        if (value === 'true') return true
        if (value === 'false') return false
    }
    return undefined
}

function normalizeAmbienceInput(args?: GenerateAmbienceArgs): AmbienceInput {
    return {
        locationName: normalizeOptionalString(args?.locationName) ?? DEFAULTS.locationName,
        timeOfDay: normalizeOptionalString(args?.timeOfDay) ?? DEFAULTS.timeOfDay,
        weather: normalizeOptionalString(args?.weather) ?? DEFAULTS.weather,
        mood: normalizeOptionalString(args?.mood) ?? DEFAULTS.mood
    }
}

function normalizeActionInput(args?: NarrateActionArgs): ActionInput {
    return {
        actionVerb: normalizeOptionalString(args?.actionVerb) ?? ACTION_DEFAULTS.actionVerb,
        targetName: normalizeOptionalString(args?.targetName) ?? ACTION_DEFAULTS.targetName,
        locationName: normalizeOptionalString(args?.locationName) ?? ACTION_DEFAULTS.locationName,
        outcome: normalizeOptionalString(args?.outcome) ?? ACTION_DEFAULTS.outcome
    }
}

function normalizeDiscoveryInput(args?: NarrateDiscoveryArgs): DiscoveryInput {
    return {
        discoveryKind: normalizeOptionalString(args?.discoveryKind) ?? DISCOVERY_DEFAULTS.discoveryKind,
        subjectName: normalizeOptionalString(args?.subjectName) ?? DISCOVERY_DEFAULTS.subjectName,
        locationName: normalizeOptionalString(args?.locationName) ?? DISCOVERY_DEFAULTS.locationName
    }
}

function deterministicIndex(input: string, modulo: number): number {
    // djb2 hash for stable, fast deterministic selection.
    let hash = 5381
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 33) ^ input.charCodeAt(i)
    }
    // unsigned int and modulo for array index.
    return (hash >>> 0) % modulo
}

function renderTemplate(template: string, input: AmbienceInput): string {
    return template
        .replaceAll('{locationName}', input.locationName)
        .replaceAll('{timeOfDay}', input.timeOfDay)
        .replaceAll('{weather}', input.weather)
        .replaceAll('{mood}', input.mood)
}

function renderActionTemplate(template: string, input: ActionInput): string {
    return template
        .replaceAll('{actionVerb}', input.actionVerb)
        .replaceAll('{targetName}', input.targetName)
        .replaceAll('{locationName}', input.locationName)
        .replaceAll('{outcome}', input.outcome)
}

function renderDiscoveryTemplate(template: string, input: DiscoveryInput): string {
    return template
        .replaceAll('{discoveryKind}', input.discoveryKind)
        .replaceAll('{subjectName}', input.subjectName)
        .replaceAll('{locationName}', input.locationName)
}

function hasCanonicalClaimRisk(text: string): boolean {
    for (const pattern of CANONICAL_CLAIM_PATTERNS) {
        if (pattern.test(text)) return true
    }
    return false
}

type AIGenerationResult = {
    narrative: string | null
    fallbackReason: 'ai_unavailable' | 'canonical_claim_blocked'
}

/**
 * MCP-style handler for narrative generation tools.
 *
 * Foundation scope (#762):
 * - health
 * - generateAmbience (read-only, deterministic template mode)
 *
 * Extension scope (#763):
 * - narrateAction
 * - narrateDiscovery
 */
@injectable()
export class NarrativeGeneratorHandler {
    constructor(@inject(TOKENS.AzureOpenAIClient) @optional() private readonly aiClient: IAzureOpenAIClient | undefined) {}

    async health(toolArguments: unknown, context: InvocationContext): Promise<string> {
        void toolArguments
        void context

        return JSON.stringify({ ok: true, service: 'narrative-generator' })
    }

    async generateAmbience(toolArguments: unknown, context: InvocationContext): Promise<string> {
        void context

        const toolArgs = toolArguments as ToolArgs<GenerateAmbienceArgs>
        const input = normalizeAmbienceInput(toolArgs?.arguments)
        const preferAi = normalizeOptionalBoolean(toolArgs?.arguments?.preferAi) ?? true

        let fallbackReason: 'ai_unavailable' | 'canonical_claim_blocked' | undefined

        if (preferAi && this.aiClient) {
            const aiAttempt = await this.tryGenerateAIAmbience(input)
            if (aiAttempt.narrative) {
                return JSON.stringify({
                    mode: 'ai',
                    narrative: aiAttempt.narrative,
                    inputs: input
                })
            }
            fallbackReason = aiAttempt.fallbackReason
        }

        const salt = `${input.locationName}|${input.timeOfDay}|${input.weather}|${input.mood}`
        const templateIndex = deterministicIndex(salt, AMBIENCE_TEMPLATES.length)
        const narrative = renderTemplate(AMBIENCE_TEMPLATES[templateIndex], input)

        return JSON.stringify({
            mode: 'template',
            templateIndex,
            narrative,
            inputs: input,
            fallbackReason
        })
    }

    async narrateAction(toolArguments: unknown, context: InvocationContext): Promise<string> {
        void context

        const toolArgs = toolArguments as ToolArgs<NarrateActionArgs>
        const input = normalizeActionInput(toolArgs?.arguments)
        const preferAi = normalizeOptionalBoolean(toolArgs?.arguments?.preferAi) ?? true

        let fallbackReason: 'ai_unavailable' | 'canonical_claim_blocked' | undefined

        if (preferAi && this.aiClient) {
            const prompt = [
                'You write brief action narration for a fantasy text adventure.',
                'Constraints:',
                '- Keep output to 1-2 sentences.',
                '- Describe the sensory and dramatic result of the action.',
                '- Do NOT invent canonical state changes (no new exits, items, NPC arrivals, or structural world facts).',
                '- Keep details ephemeral and action-forward.',
                '',
                `Action: ${input.actionVerb}`,
                `Target: ${input.targetName}`,
                `Location: ${input.locationName}`,
                `Outcome: ${input.outcome}`
            ].join('\n')

            const aiAttempt = await this.tryGenerateAI(prompt)
            if (aiAttempt.narrative) {
                return JSON.stringify({
                    mode: 'ai',
                    narrative: aiAttempt.narrative,
                    inputs: input
                })
            }
            fallbackReason = aiAttempt.fallbackReason
        }

        const salt = `${input.actionVerb}|${input.targetName}|${input.locationName}|${input.outcome}`
        const templateIndex = deterministicIndex(salt, ACTION_TEMPLATES.length)
        const narrative = renderActionTemplate(ACTION_TEMPLATES[templateIndex], input)

        return JSON.stringify({
            mode: 'template',
            templateIndex,
            narrative,
            inputs: input,
            fallbackReason
        })
    }

    async narrateDiscovery(toolArguments: unknown, context: InvocationContext): Promise<string> {
        void context

        const toolArgs = toolArguments as ToolArgs<NarrateDiscoveryArgs>
        const input = normalizeDiscoveryInput(toolArgs?.arguments)
        const preferAi = normalizeOptionalBoolean(toolArgs?.arguments?.preferAi) ?? true

        let fallbackReason: 'ai_unavailable' | 'canonical_claim_blocked' | undefined

        if (preferAi && this.aiClient) {
            const prompt = [
                'You write brief discovery narration for a fantasy text adventure.',
                'Constraints:',
                '- Keep output to 1-2 sentences.',
                '- Evoke the sense of surprise or wonder at finding something new.',
                '- Do NOT invent canonical state changes (no new exits, items, NPC arrivals, or structural world facts).',
                '- Keep details ephemeral and discovery-forward.',
                '',
                `Discovery kind: ${input.discoveryKind}`,
                `Subject: ${input.subjectName}`,
                `Location: ${input.locationName}`
            ].join('\n')

            const aiAttempt = await this.tryGenerateAI(prompt)
            if (aiAttempt.narrative) {
                return JSON.stringify({
                    mode: 'ai',
                    narrative: aiAttempt.narrative,
                    inputs: input
                })
            }
            fallbackReason = aiAttempt.fallbackReason
        }

        const salt = `${input.discoveryKind}|${input.subjectName}|${input.locationName}`
        const templateIndex = deterministicIndex(salt, DISCOVERY_TEMPLATES.length)
        const narrative = renderDiscoveryTemplate(DISCOVERY_TEMPLATES[templateIndex], input)

        return JSON.stringify({
            mode: 'template',
            templateIndex,
            narrative,
            inputs: input,
            fallbackReason
        })
    }

    private async tryGenerateAIAmbience(input: AmbienceInput): Promise<AIGenerationResult> {
        const prompt = [
            'You write atmospheric fantasy ambience text for a text adventure.',
            'Constraints:',
            '- Keep output to 1-3 sentences.',
            '- Add sensory richness and evocative tone.',
            '- Do NOT invent canonical state changes (no new exits, items, NPC arrivals, or structural world facts).',
            '- Keep details ephemeral and mood-forward.',
            '',
            `Location: ${input.locationName}`,
            `Time of day: ${input.timeOfDay}`,
            `Weather: ${input.weather}`,
            `Mood: ${input.mood}`
        ].join('\n')

        return this.tryGenerateAI(prompt)
    }

    private async tryGenerateAI(prompt: string): Promise<AIGenerationResult> {
        const result = await this.aiClient?.generate({
            prompt,
            maxTokens: 140,
            temperature: 0.9,
            timeoutMs: 1200
        })

        const narrative = result?.content?.trim()
        if (!narrative) return { narrative: null, fallbackReason: 'ai_unavailable' }
        if (hasCanonicalClaimRisk(narrative)) {
            return { narrative: null, fallbackReason: 'canonical_claim_blocked' }
        }
        return { narrative, fallbackReason: 'ai_unavailable' }
    }
}

export async function health(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(NarrativeGeneratorHandler)
    return handler.health(toolArguments, context)
}

export async function generateAmbience(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(NarrativeGeneratorHandler)
    return handler.generateAmbience(toolArguments, context)
}

export async function narrateAction(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(NarrativeGeneratorHandler)
    return handler.narrateAction(toolArguments, context)
}

export async function narrateDiscovery(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(NarrativeGeneratorHandler)
    return handler.narrateDiscovery(toolArguments, context)
}
