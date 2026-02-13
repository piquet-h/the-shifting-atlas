/**
 * ESLint rule: telemetry-registry-pattern
 *
 * Validates telemetry event names in the GAME_EVENT_NAMES registry.
 * Enforces: Domain.Subject?.Action pattern with 2-3 PascalCase segments.
 *
 * Failures:
 * - Less than 2 segments (e.g., "Event") or more than 3 (e.g., "A.B.C.D")
 * - Non-PascalCase segments (e.g., "player.get", "my_event")
 *
 * This catches violations at the source before they spread to usage sites.
 */

const PATTERN = /^[A-Z][A-Za-z]+(\.[A-Z][A-Za-z]+){1,2}$/

export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Validate telemetry event names in GAME_EVENT_NAMES: pattern Domain[.Subject].Action (2-3 PascalCase segments).'
        },
        messages: {
            invalid: `Telemetry event name "{{name}}" violates pattern: must be 2-3 PascalCase segments (Domain[.Subject].Action). Regex: /^[A-Z][A-Za-z]+(\\.[A-Z][A-Za-z]+){1,2}$/`
        }
    },
    create(context) {
        return {
            ArrayExpression(node) {
                // Check if this is the GAME_EVENT_NAMES array
                const parent = node.parent
                if (parent?.type !== 'VariableDeclarator' || parent?.id?.name !== 'GAME_EVENT_NAMES') {
                    return
                }

                // Validate each string element
                for (const element of node.elements) {
                    if (!element || element.type !== 'Literal' || typeof element.value !== 'string') {
                        continue
                    }

                    const name = element.value
                    if (!PATTERN.test(name)) {
                        context.report({
                            node: element,
                            messageId: 'invalid',
                            data: { name }
                        })
                    }
                }
            }
        }
    }
}
