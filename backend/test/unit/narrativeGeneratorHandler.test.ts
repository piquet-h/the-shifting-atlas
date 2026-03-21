import type { InvocationContext } from '@azure/functions'
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { NarrativeGeneratorHandler } from '../../src/handlers/mcp/narrative-generator/narrative-generator.js'
import type { IAzureOpenAIClient } from '../../src/services/azureOpenAIClient.js'

function makeContext(): InvocationContext {
    return {
        invocationId: 'test-invocation',
        bindings: {},
        bindingData: {},
        traceContext: {},
        bindingDefinitions: [],
        log: (() => {}) as unknown as (msg?: unknown, ...params: unknown[]) => void
    } as unknown as InvocationContext
}

describe('NarrativeGeneratorHandler', () => {
    it('health returns ok JSON', async () => {
        const handler = new NarrativeGeneratorHandler()
        const result = await handler.health({ arguments: {} }, makeContext())
        const parsed = JSON.parse(result)

        assert.equal(parsed.ok, true)
        assert.equal(parsed.service, 'narrative-generator')
    })

    it('generateAmbience returns deterministic narrative for same inputs', async () => {
        const handler = new NarrativeGeneratorHandler()
        const args = {
            arguments: {
                locationName: 'Broken Bridge',
                timeOfDay: 'dusk',
                weather: 'fog',
                mood: 'tense'
            }
        }

        const first = JSON.parse(await handler.generateAmbience(args, makeContext()))
        const second = JSON.parse(await handler.generateAmbience(args, makeContext()))

        assert.equal(typeof first.narrative, 'string')
        assert.ok(first.narrative.length > 0)
        assert.equal(first.narrative, second.narrative)
        assert.equal(first.mode, 'template')
    })

    it('generateAmbience falls back to safe defaults when inputs omitted', async () => {
        const handler = new NarrativeGeneratorHandler()
        const result = JSON.parse(await handler.generateAmbience({ arguments: {} }, makeContext()))

        assert.equal(result.mode, 'template')
        assert.equal(result.inputs.locationName, 'the surrounding area')
        assert.equal(result.inputs.timeOfDay, 'an uncertain hour')
        assert.equal(result.inputs.weather, 'still air')
        assert.equal(result.inputs.mood, 'wary')
        assert.ok(typeof result.narrative === 'string' && result.narrative.length > 0)
    })

    it('generateAmbience uses ai mode when AI client returns safe output', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return {
                    content: 'Fog braids through the old stones while distant gulls argue with the wind.',
                    tokenUsage: { prompt: 1, completion: 1, total: 2 }
                }
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.generateAmbience(
                {
                    arguments: {
                        locationName: 'Broken Bridge',
                        timeOfDay: 'dusk',
                        weather: 'fog',
                        mood: 'tense',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'ai')
        assert.equal(typeof result.narrative, 'string')
        assert.ok(result.narrative.length > 0)
    })

    it('generateAmbience falls back to template when AI returns null', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return null
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.generateAmbience(
                {
                    arguments: {
                        locationName: 'Broken Bridge',
                        timeOfDay: 'dusk',
                        weather: 'fog',
                        mood: 'tense',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'template')
        assert.equal(result.fallbackReason, 'ai_unavailable')
    })

    it('generateAmbience blocks canonical-claim AI output and falls back to template', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return {
                    content: 'A new stairway appears to the north, leading into a hidden vault.',
                    tokenUsage: { prompt: 1, completion: 1, total: 2 }
                }
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.generateAmbience(
                {
                    arguments: {
                        locationName: 'Broken Bridge',
                        timeOfDay: 'dusk',
                        weather: 'fog',
                        mood: 'tense',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'template')
        assert.equal(result.fallbackReason, 'canonical_claim_blocked')
    })

    // ── narrateAction ────────────────────────────────────────────────────────

    it('narrateAction returns deterministic narrative for same inputs', async () => {
        const handler = new NarrativeGeneratorHandler()
        const args = {
            arguments: {
                actionVerb: 'examines',
                targetName: 'the rusted torch',
                locationName: 'dimly lit corridor',
                outcome: 'nothing happens'
            }
        }

        const first = JSON.parse(await handler.narrateAction(args, makeContext()))
        const second = JSON.parse(await handler.narrateAction(args, makeContext()))

        assert.equal(typeof first.narrative, 'string')
        assert.ok(first.narrative.length > 0)
        assert.equal(first.narrative, second.narrative)
        assert.equal(first.mode, 'template')
        assert.equal(first.inputs.actionVerb, 'examines')
        assert.equal(first.inputs.targetName, 'the rusted torch')
    })

    it('narrateAction falls back to safe defaults when inputs omitted', async () => {
        const handler = new NarrativeGeneratorHandler()
        const result = JSON.parse(await handler.narrateAction({ arguments: {} }, makeContext()))

        assert.equal(result.mode, 'template')
        assert.equal(result.inputs.actionVerb, 'interacts with')
        assert.equal(result.inputs.targetName, 'something nearby')
        assert.equal(result.inputs.locationName, 'the surrounding area')
        assert.equal(result.inputs.outcome, 'nothing notable happens')
        assert.ok(typeof result.narrative === 'string' && result.narrative.length > 0)
    })

    it('narrateAction uses ai mode when AI client returns safe output', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return {
                    content: 'The torch flickers as you examine it, casting long shadows across the stone.',
                    tokenUsage: { prompt: 1, completion: 1, total: 2 }
                }
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.narrateAction(
                {
                    arguments: {
                        actionVerb: 'examines',
                        targetName: 'the rusted torch',
                        locationName: 'dimly lit corridor',
                        outcome: 'nothing happens',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'ai')
        assert.equal(typeof result.narrative, 'string')
        assert.ok(result.narrative.length > 0)
    })

    it('narrateAction falls back to template when AI returns null', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return null
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.narrateAction(
                {
                    arguments: {
                        actionVerb: 'examines',
                        targetName: 'the rusted torch',
                        locationName: 'dimly lit corridor',
                        outcome: 'nothing happens',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'template')
        assert.equal(result.fallbackReason, 'ai_unavailable')
    })

    it('narrateAction blocks canonical-claim AI output and falls back to template', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return {
                    content: 'A new exit appears to the north as you examine the wall.',
                    tokenUsage: { prompt: 1, completion: 1, total: 2 }
                }
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.narrateAction(
                {
                    arguments: {
                        actionVerb: 'examines',
                        targetName: 'the wall',
                        locationName: 'dimly lit corridor',
                        outcome: 'nothing happens',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'template')
        assert.equal(result.fallbackReason, 'canonical_claim_blocked')
    })

    // ── narrateDiscovery ─────────────────────────────────────────────────────

    it('narrateDiscovery returns deterministic narrative for same inputs', async () => {
        const handler = new NarrativeGeneratorHandler()
        const args = {
            arguments: {
                discoveryKind: 'passage',
                subjectName: 'a narrow crack in the wall',
                locationName: 'the eastern hall'
            }
        }

        const first = JSON.parse(await handler.narrateDiscovery(args, makeContext()))
        const second = JSON.parse(await handler.narrateDiscovery(args, makeContext()))

        assert.equal(typeof first.narrative, 'string')
        assert.ok(first.narrative.length > 0)
        assert.equal(first.narrative, second.narrative)
        assert.equal(first.mode, 'template')
        assert.equal(first.inputs.discoveryKind, 'passage')
        assert.equal(first.inputs.subjectName, 'a narrow crack in the wall')
    })

    it('narrateDiscovery falls back to safe defaults when inputs omitted', async () => {
        const handler = new NarrativeGeneratorHandler()
        const result = JSON.parse(await handler.narrateDiscovery({ arguments: {} }, makeContext()))

        assert.equal(result.mode, 'template')
        assert.equal(result.inputs.discoveryKind, 'something')
        assert.equal(result.inputs.subjectName, 'an unidentified thing')
        assert.equal(result.inputs.locationName, 'the surrounding area')
        assert.ok(typeof result.narrative === 'string' && result.narrative.length > 0)
    })

    it('narrateDiscovery uses ai mode when AI client returns safe output', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return {
                    content: 'The crack breathes cold air across your fingers, a whisper of deeper chambers beyond.',
                    tokenUsage: { prompt: 1, completion: 1, total: 2 }
                }
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.narrateDiscovery(
                {
                    arguments: {
                        discoveryKind: 'passage',
                        subjectName: 'a narrow crack in the wall',
                        locationName: 'the eastern hall',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'ai')
        assert.equal(typeof result.narrative, 'string')
        assert.ok(result.narrative.length > 0)
    })

    it('narrateDiscovery falls back to template when AI returns null', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return null
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.narrateDiscovery(
                {
                    arguments: {
                        discoveryKind: 'passage',
                        subjectName: 'a narrow crack in the wall',
                        locationName: 'the eastern hall',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'template')
        assert.equal(result.fallbackReason, 'ai_unavailable')
    })

    it('narrateDiscovery blocks canonical-claim AI output and falls back to template', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return {
                    content: 'You find a glowing sword resting on a pedestal, waiting to be taken.',
                    tokenUsage: { prompt: 1, completion: 1, total: 2 }
                }
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.narrateDiscovery(
                {
                    arguments: {
                        discoveryKind: 'item',
                        subjectName: 'a glowing pedestal',
                        locationName: 'the eastern hall',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'template')
        assert.equal(result.fallbackReason, 'canonical_claim_blocked')
    })

    // ── narrateEncounter ─────────────────────────────────────────────────────

    it('narrateEncounter returns deterministic narrative for same inputs', async () => {
        const handler = new NarrativeGeneratorHandler()
        const args = {
            arguments: {
                encounterKind: 'ambush',
                npcName: 'a hooded figure',
                locationName: 'the narrow alley',
                tension: 'hostile'
            }
        }

        const first = JSON.parse(await handler.narrateEncounter(args, makeContext()))
        const second = JSON.parse(await handler.narrateEncounter(args, makeContext()))

        assert.equal(typeof first.narrative, 'string')
        assert.ok(first.narrative.length > 0)
        assert.equal(first.narrative, second.narrative)
        assert.equal(first.mode, 'template')
        assert.equal(first.inputs.encounterKind, 'ambush')
        assert.equal(first.inputs.npcName, 'a hooded figure')
    })

    it('narrateEncounter falls back to safe defaults when inputs omitted', async () => {
        const handler = new NarrativeGeneratorHandler()
        const result = JSON.parse(await handler.narrateEncounter({ arguments: {} }, makeContext()))

        assert.equal(result.mode, 'template')
        assert.equal(result.inputs.encounterKind, 'unexpected')
        assert.equal(result.inputs.npcName, 'an unknown figure')
        assert.equal(result.inputs.locationName, 'the surrounding area')
        assert.equal(result.inputs.tension, 'uneasy')
        assert.ok(typeof result.narrative === 'string' && result.narrative.length > 0)
    })

    it('narrateEncounter uses ai mode when AI client returns safe output', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return {
                    content: 'A hooded figure steps from the shadows, hand resting on an unseen blade.',
                    tokenUsage: { prompt: 1, completion: 1, total: 2 }
                }
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.narrateEncounter(
                {
                    arguments: {
                        encounterKind: 'ambush',
                        npcName: 'a hooded figure',
                        locationName: 'the narrow alley',
                        tension: 'hostile',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'ai')
        assert.equal(typeof result.narrative, 'string')
        assert.ok(result.narrative.length > 0)
    })

    it('narrateEncounter falls back to template when AI returns null', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return null
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.narrateEncounter(
                {
                    arguments: {
                        encounterKind: 'ambush',
                        npcName: 'a hooded figure',
                        locationName: 'the narrow alley',
                        tension: 'hostile',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'template')
        assert.equal(result.fallbackReason, 'ai_unavailable')
    })

    it('narrateEncounter blocks canonical-claim AI output and falls back to template', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return {
                    content: 'A merchant arrives with fresh goods from the northern pass.',
                    tokenUsage: { prompt: 1, completion: 1, total: 2 }
                }
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.narrateEncounter(
                {
                    arguments: {
                        encounterKind: 'trade',
                        npcName: 'a travelling merchant',
                        locationName: 'the market square',
                        tension: 'curious',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'template')
        assert.equal(result.fallbackReason, 'canonical_claim_blocked')
    })

    // ── generateRumor ────────────────────────────────────────────────────────

    it('generateRumor returns deterministic narrative for same inputs', async () => {
        const handler = new NarrativeGeneratorHandler()
        const args = {
            arguments: {
                subject: 'the collapsed northern bridge',
                locationName: 'the tavern',
                tone: 'fearful'
            }
        }

        const first = JSON.parse(await handler.generateRumor(args, makeContext()))
        const second = JSON.parse(await handler.generateRumor(args, makeContext()))

        assert.equal(typeof first.narrative, 'string')
        assert.ok(first.narrative.length > 0)
        assert.equal(first.narrative, second.narrative)
        assert.equal(first.mode, 'template')
        assert.equal(first.advisory, true)
        assert.equal(first.inputs.subject, 'the collapsed northern bridge')
        assert.equal(first.inputs.locationName, 'the tavern')
    })

    it('generateRumor falls back to safe defaults when inputs omitted', async () => {
        const handler = new NarrativeGeneratorHandler()
        const result = JSON.parse(await handler.generateRumor({ arguments: {} }, makeContext()))

        assert.equal(result.mode, 'template')
        assert.equal(result.advisory, true)
        assert.equal(result.inputs.subject, 'something unseen')
        assert.equal(result.inputs.locationName, 'these parts')
        assert.equal(result.inputs.tone, 'uncertain')
        assert.ok(typeof result.narrative === 'string' && result.narrative.length > 0)
    })

    it('generateRumor uses ai mode when AI client returns safe output', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return {
                    content: 'They say the bridge fell on a moonless night — though no one claims to have seen it themselves.',
                    tokenUsage: { prompt: 1, completion: 1, total: 2 }
                }
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.generateRumor(
                {
                    arguments: {
                        subject: 'the collapsed northern bridge',
                        locationName: 'the tavern',
                        tone: 'fearful',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'ai')
        assert.equal(result.advisory, true)
        assert.equal(typeof result.narrative, 'string')
        assert.ok(result.narrative.length > 0)
    })

    it('generateRumor falls back to template when AI returns null', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return null
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.generateRumor(
                {
                    arguments: {
                        subject: 'the collapsed northern bridge',
                        locationName: 'the tavern',
                        tone: 'fearful',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'template')
        assert.equal(result.advisory, true)
        assert.equal(result.fallbackReason, 'ai_unavailable')
    })

    it('generateRumor blocks canonical-claim AI output and falls back to template', async () => {
        const aiClient: IAzureOpenAIClient = {
            async generate() {
                return {
                    content: 'A new exit to the north opens beneath the collapsed stones.',
                    tokenUsage: { prompt: 1, completion: 1, total: 2 }
                }
            },
            async healthCheck() {
                return true
            }
        }

        const handler = new NarrativeGeneratorHandler(aiClient)
        const result = JSON.parse(
            await handler.generateRumor(
                {
                    arguments: {
                        subject: 'the collapsed northern bridge',
                        locationName: 'the tavern',
                        tone: 'fearful',
                        preferAi: true
                    }
                },
                makeContext()
            )
        )

        assert.equal(result.mode, 'template')
        assert.equal(result.advisory, true)
        assert.equal(result.fallbackReason, 'canonical_claim_blocked')
    })
})
