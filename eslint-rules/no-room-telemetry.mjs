// ESLint rule: forbid legacy Room.* telemetry names and enforce locationId on Command.Executed
export default {
    meta: {
        type: 'problem',
        docs: {description: 'Disallow Room.* telemetry events and require locationId in Command.Executed payload.'},
        schema: [],
        messages: {
            forbiddenName: 'Legacy telemetry name using "Room." detected: {{name}}. Use Location.* instead.',
            missingLocationId: 'Command.Executed telemetry payload must include a locationId property.'
        }
    },
    create(context) {
        function isTelemetryCall(node) {
            if (node.callee.type === 'Identifier') {
                return ['trackGameEventClient', 'trackGameEvent', 'trackGameEventStrict'].includes(node.callee.name)
            }
            return false
        }
        return {
            CallExpression(node) {
                if (!isTelemetryCall(node)) return
                const [nameArg, payloadArg] = node.arguments
                if (!nameArg || nameArg.type !== 'Literal' || typeof nameArg.value !== 'string') return
                const eventName = nameArg.value
                if (/^Room\./.test(eventName) || /\.Room\./.test(eventName) || /World\.Room\./.test(eventName)) {
                    context.report({node: nameArg, messageId: 'forbiddenName', data: {name: eventName}})
                }
                if (eventName === 'Command.Executed') {
                    if (!payloadArg || payloadArg.type !== 'ObjectExpression') {
                        context.report({node: node, messageId: 'missingLocationId'})
                        return
                    }
                    const hasLocationId = payloadArg.properties.some(
                        (p) => p.type === 'Property' && !p.computed && p.key.type === 'Identifier' && p.key.name === 'locationId'
                    )
                    if (!hasLocationId) {
                        context.report({node: payloadArg, messageId: 'missingLocationId'})
                    }
                }
            }
        }
    }
}
