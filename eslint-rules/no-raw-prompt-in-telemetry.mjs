/**
 * Custom ESLint rule: no-raw-prompt-in-telemetry
 *
 * Prevents direct inclusion of raw prompt or completion text in telemetry emission calls.
 * Enforces use of prepareAICostTelemetry() which strips text before creating payload.
 *
 * ## Purpose
 *
 * Ensures PII safety by catching compile-time attempts to:
 * - Pass `promptText` or `completionText` directly to telemetry client
 * - Include these fields in telemetry event properties/customDimensions
 * - Store raw text in variables that are then emitted
 *
 * ## Valid Patterns
 *
 * ```typescript
 * // ✅ OK: Use prepareAICostTelemetry which strips text
 * const payload = prepareAICostTelemetry({ modelId, promptText, completionText })
 * telemetryClient.trackEvent({ name: 'AI.Cost.Estimated', properties: payload })
 *
 * // ✅ OK: Use prepared payload without text fields
 * const { modelId, promptTokens, completionTokens } = prepareAICostTelemetry(...)
 * telemetryClient.trackEvent({ name: 'AI.Cost.Estimated', properties: { modelId, promptTokens, completionTokens } })
 * ```
 *
 * ## Invalid Patterns
 *
 * ```typescript
 * // ❌ FORBIDDEN: Passing promptText to telemetry
 * telemetryClient.trackEvent({
 *     name: 'AI.Cost.Estimated',
 *     properties: { promptText: 'some text', ... }
 * })
 *
 * // ❌ FORBIDDEN: Including completionText in properties
 * telemetryClient.trackEvent({
 *     name: 'AI.Cost.Estimated',
 *     properties: { completionText: 'response', ... }
 * })
 *
 * // ❌ FORBIDDEN: Any reference to these field names in telemetry context
 * const props = { promptText, completionText }
 * telemetryClient.trackEvent({ name: 'AI.Cost.Estimated', properties: props })
 * ```
 */

export default {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Prevent direct inclusion of raw prompt or completion text in AI cost telemetry emission calls.',
            category: 'Security',
            recommended: true
        },
        schema: [],
        messages: {
            forbiddenPromptField:
                'Raw prompt text field "{{fieldName}}" must not be included in telemetry. Use prepareAICostTelemetry() to strip text before emission.',
            forbiddenCompletionField:
                'Raw completion text field "{{fieldName}}" must not be included in telemetry. Use prepareAICostTelemetry() to strip text before emission.',
            forbiddenTextField:
                'Raw text field "{{fieldName}}" must not be included in telemetry. Use token counts and buckets instead.'
        }
    },
    create(context) {
        /**
         * Forbidden field names that indicate raw text content.
         * Case-insensitive matching.
         */
        const FORBIDDEN_FIELDS = [
            'prompttext',
            'promptText',
            'prompt',
            'completiontext',
            'completionText',
            'completion',
            'responsetext',
            'responseText',
            'response',
            'text',
            'content',
            'message'
        ]

        /**
         * Check if identifier name is forbidden in telemetry context.
         */
        function isForbiddenField(name) {
            return FORBIDDEN_FIELDS.some((forbidden) => name.toLowerCase() === forbidden.toLowerCase())
        }

        /**
         * Get appropriate error message ID based on field name.
         */
        function getMessageId(fieldName) {
            const lower = fieldName.toLowerCase()
            if (lower.includes('prompt')) {
                return 'forbiddenPromptField'
            } else if (lower.includes('completion') || lower.includes('response')) {
                return 'forbiddenCompletionField'
            }
            return 'forbiddenTextField'
        }

        /**
         * Check if call is to a telemetry emission function.
         */
        function isTelemetryCall(node) {
            if (node.type !== 'CallExpression') {
                return false
            }

            // Check for trackEvent, emit, log, etc.
            if (node.callee.type === 'Identifier') {
                const calleeName = node.callee.name
                return ['trackEvent', 'emit', 'log', 'trace'].includes(calleeName)
            }

            // Check for telemetryClient.trackEvent(), client.emit(), etc.
            if (node.callee.type === 'MemberExpression') {
                const property = node.callee.property
                if (property.type === 'Identifier') {
                    return ['trackEvent', 'emit', 'log', 'trace'].includes(property.name)
                }
            }

            return false
        }

        /**
         * Check object expression for forbidden properties.
         */
        function checkObjectExpression(node) {
            if (node.type !== 'ObjectExpression') {
                return
            }

            for (const prop of node.properties) {
                if (prop.type === 'Property') {
                    // Check property key
                    let keyName = null
                    if (prop.key.type === 'Identifier') {
                        keyName = prop.key.name
                    } else if (prop.key.type === 'Literal') {
                        keyName = String(prop.key.value)
                    }

                    if (keyName && isForbiddenField(keyName)) {
                        context.report({
                            node: prop.key,
                            messageId: getMessageId(keyName),
                            data: { fieldName: keyName }
                        })
                    }

                    // Recursively check nested objects
                    if (prop.value.type === 'ObjectExpression') {
                        checkObjectExpression(prop.value)
                    }
                }
            }
        }

        return {
            CallExpression(node) {
                // Only check telemetry-related calls
                if (!isTelemetryCall(node)) {
                    return
                }

                // Check all arguments for object expressions containing forbidden fields
                for (const arg of node.arguments) {
                    if (arg.type === 'ObjectExpression') {
                        checkObjectExpression(arg)

                        // Also check nested properties object if present
                        for (const prop of arg.properties) {
                            if (
                                prop.type === 'Property' &&
                                prop.key.type === 'Identifier' &&
                                (prop.key.name === 'properties' || prop.key.name === 'customDimensions')
                            ) {
                                if (prop.value.type === 'ObjectExpression') {
                                    checkObjectExpression(prop.value)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
