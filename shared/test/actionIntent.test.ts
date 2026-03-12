import assert from 'node:assert'
import test from 'node:test'
import { ActionIntentSchema, validateActionIntent } from '../src/index.js'

const validActionIntent = {
    rawInput: 'set fire to the forest using my tinderbox',
    parsedIntent: {
        verb: 'ignite',
        method: 'tinderbox',
        targets: [
            {
                kind: 'location',
                id: 'forest-clearing',
                name: 'forest clearing'
            },
            {
                kind: 'latent-reference',
                surfaceText: 'the dry undergrowth'
            }
        ],
        resources: [
            {
                kind: 'item',
                itemId: 'tinderbox-abc',
                quantity: 1,
                charges: 1
            },
            {
                kind: 'offer',
                name: 'safe passage',
                quantity: 1
            }
        ],
        context: {
            urgency: 'high',
            weather: 'dry'
        }
    },
    validationResult: {
        success: true,
        warnings: ['dry fuel may spread quickly']
    }
}

test('action intent schema: valid payload passes', () => {
    const actionIntent = validateActionIntent(validActionIntent)

    assert.equal(actionIntent.rawInput, validActionIntent.rawInput)
    assert.equal(actionIntent.parsedIntent.verb, 'ignite')
    assert.equal(actionIntent.parsedIntent.targets?.[1]?.kind, 'latent-reference')
    assert.equal(actionIntent.parsedIntent.resources?.[1]?.kind, 'offer')
})

test('action intent schema: missing rawInput fails', () => {
    const result = ActionIntentSchema.safeParse({
        ...validActionIntent,
        rawInput: undefined
    })

    assert.equal(result.success, false)
})

test('action intent schema: missing verb fails', () => {
    const result = ActionIntentSchema.safeParse({
        ...validActionIntent,
        parsedIntent: {
            ...validActionIntent.parsedIntent,
            verb: undefined
        }
    })

    assert.equal(result.success, false)
})

test('action intent schema: invalid target kind fails', () => {
    const result = ActionIntentSchema.safeParse({
        ...validActionIntent,
        parsedIntent: {
            ...validActionIntent.parsedIntent,
            targets: [
                {
                    kind: 'portal',
                    name: 'mystery gate'
                }
            ]
        }
    })

    assert.equal(result.success, false)
})

test('action intent schema: empty-string fields fail', () => {
    const result = ActionIntentSchema.safeParse({
        ...validActionIntent,
        rawInput: '   ',
        parsedIntent: {
            ...validActionIntent.parsedIntent,
            verb: '   ',
            method: ''
        }
    })

    assert.equal(result.success, false)
})

test('action intent schema: bounded unresolved references pass without canonical ids', () => {
    const result = ActionIntentSchema.safeParse({
        ...validActionIntent,
        parsedIntent: {
            ...validActionIntent.parsedIntent,
            targets: [
                {
                    kind: 'latent-reference',
                    surfaceText: 'that suspicious stranger near the torch'
                }
            ]
        }
    })

    assert.equal(result.success, true)
})
