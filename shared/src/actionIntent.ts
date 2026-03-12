import { z } from 'zod'

import { DIRECTIONS } from './domainModels.js'

const NonEmptyStringSchema = z.string().trim().min(1)

export const ActionIntentTargetKindSchema = z.enum(['location', 'player', 'npc', 'item', 'direction', 'latent-reference'])
export type ActionIntentTargetKind = z.infer<typeof ActionIntentTargetKindSchema>

export const ActionIntentDirectionSchema = z.enum(DIRECTIONS)
export type ActionIntentDirection = z.infer<typeof ActionIntentDirectionSchema>

export const ActionIntentTargetSchema = z
    .object({
        kind: ActionIntentTargetKindSchema,
        id: NonEmptyStringSchema.optional(),
        name: NonEmptyStringSchema.optional(),
        surfaceText: NonEmptyStringSchema.optional(),
        canonicalDirection: ActionIntentDirectionSchema.optional()
    })
    .superRefine((target, ctx) => {
        const hasReference = Boolean(target.id || target.name || target.surfaceText)

        if (target.kind === 'direction') {
            if (!hasReference && !target.canonicalDirection) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Direction targets require a direction hint or bounded surface reference',
                    path: ['canonicalDirection']
                })
            }
            return
        }

        if (target.kind === 'latent-reference') {
            if (!target.surfaceText && !target.name) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Latent references require bounded unresolved surface text',
                    path: ['surfaceText']
                })
            }
            return
        }

        if (!hasReference) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Concrete targets require an id, name, or bounded surface reference',
                path: ['id']
            })
        }
    })
export type ActionIntentTarget = z.infer<typeof ActionIntentTargetSchema>

export const ActionIntentResourceKindSchema = z.enum(['item', 'currency', 'offer', 'proof', 'service', 'ability'])
export type ActionIntentResourceKind = z.infer<typeof ActionIntentResourceKindSchema>

export const ActionIntentResourceSchema = z
    .object({
        kind: ActionIntentResourceKindSchema,
        id: NonEmptyStringSchema.optional(),
        itemId: NonEmptyStringSchema.optional(),
        name: NonEmptyStringSchema.optional(),
        quantity: z.number().int().positive().optional(),
        charges: z.number().int().nonnegative().optional(),
        details: z.record(z.string(), z.unknown()).optional()
    })
    .superRefine((resource, ctx) => {
        if (!resource.id && !resource.itemId && !resource.name) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Resources require an id, itemId, or name',
                path: ['id']
            })
        }
    })
export type ActionIntentResource = z.infer<typeof ActionIntentResourceSchema>

export const ActionIntentValidationResultSchema = z.object({
    success: z.boolean(),
    errors: z.array(NonEmptyStringSchema).optional(),
    warnings: z.array(NonEmptyStringSchema).optional()
})
export type ActionIntentValidationResult = z.infer<typeof ActionIntentValidationResultSchema>

export const ActionIntentParsedIntentSchema = z.object({
    verb: NonEmptyStringSchema,
    method: NonEmptyStringSchema.optional(),
    targets: z.array(ActionIntentTargetSchema).nonempty().optional(),
    resources: z.array(ActionIntentResourceSchema).nonempty().optional(),
    context: z.record(z.string(), z.unknown()).optional()
})
export type ActionIntentParsedIntent = z.infer<typeof ActionIntentParsedIntentSchema>

export const ActionIntentSchema = z.object({
    rawInput: NonEmptyStringSchema,
    parsedIntent: ActionIntentParsedIntentSchema,
    validationResult: ActionIntentValidationResultSchema
})
export type ActionIntent = z.infer<typeof ActionIntentSchema>

export function validateActionIntent(data: unknown): ActionIntent {
    return ActionIntentSchema.parse(data)
}

export function safeValidateActionIntent(
    data: unknown
): { success: true; data: ActionIntent } | { success: false; error: z.ZodError<unknown> } {
    const result = ActionIntentSchema.safeParse(data)
    if (result.success) {
        return { success: true, data: result.data }
    }

    return { success: false, error: result.error }
}
