// Custom ESLint rule enforcing telemetry event naming pattern: Domain[.Subject].Action
// Pattern: 2-3 segments, each PascalCase (^[A-Z][A-Za-z]+$)

export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Enforce telemetry event name pattern Domain[.Subject].Action with PascalCase segments (2-3 segments).'
        },
        schema: [],
        messages: {
            invalid: 'Telemetry event name "{{name}}" must match pattern Domain[.Subject].Action with 2-3 PascalCase segments.'
        }
    },
    create(context) {
        const SEGMENT = /^[A-Z][A-Za-z]+$/
        return {
            CallExpression(node) {
                if (node.callee.type === 'Identifier' && node.callee.name === 'trackEvent') {
                    const first = node.arguments[0]
                    if (!first) return
                    if (first.type === 'Literal' && typeof first.value === 'string') {
                        const name = first.value
                        const parts = name.split('.')
                        if (parts.length < 2 || parts.length > 3 || !parts.every((p) => SEGMENT.test(p))) {
                            context.report({node: first, messageId: 'invalid', data: {name}})
                        }
                    }
                }
            }
        }
    }
}
