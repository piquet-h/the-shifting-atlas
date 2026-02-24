import { app } from '@azure/functions'
import { MAX_BUDGET_LOCATIONS } from '../../services/AreaGenerationOrchestrator.js'
import { triggerAreaGeneration } from '../../handlers/mcp/world-operations/world-operations.js'

app.mcpTool('WorldOperations-triggerAreaGeneration', {
    toolName: 'trigger-area-generation',
    description:
        'Operator entrypoint: trigger bounded area generation from an anchor location. ' +
        'Validates inputs, emits a correlationId and a stable idempotency key, and enqueues a ' +
        'World.Location.BatchGenerate event. Providing the same idempotencyKey on repeated calls ' +
        'produces a stable event key, preventing duplicate area expansion within a short window. ' +
        'Supports urban (settlement/corridor), wilderness (open/natural), and auto (inferred from anchor) modes.',
    toolProperties: [
        {
            propertyName: 'mode',
            propertyType: 'string',
            description:
                'Required. Generation mode: "urban" (settlement/corridor topology), "wilderness" (open/natural terrain), or "auto" (terrain inferred from anchor location context).',
            isRequired: true
        },
        {
            propertyName: 'budgetLocations',
            propertyType: 'number',
            description: `Required. Number of locations to generate (1–${MAX_BUDGET_LOCATIONS}). Values above the maximum are clamped automatically.`,
            isRequired: true
        },
        {
            propertyName: 'anchorLocationId',
            propertyType: 'string',
            description: 'Optional. Anchor location ID (GUID). Defaults to the world starter location when omitted.',
            isRequired: false
        },
        {
            propertyName: 'realmHints',
            propertyType: 'string',
            description: 'Optional. Comma-separated narrative realm hints forwarded to generation (e.g., "coastal,mythic").',
            isRequired: false
        },
        {
            propertyName: 'idempotencyKey',
            propertyType: 'string',
            description:
                'Optional. Caller-supplied idempotency key. Repeated calls with the same key produce stable event keys, preventing duplicate area expansion.',
            isRequired: false
        }
    ],
    handler: triggerAreaGeneration
})
