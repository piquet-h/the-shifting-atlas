// ESLint rule: forbid inline DM.Humor.* telemetry event names
// Purpose: Enforce that humor telemetry events are referenced from GAME_EVENT_NAMES enumeration
// Applied to: All telemetry tracking calls outside of telemetryEvents.ts
export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow inline DM.Humor.* telemetry event names. Use constants from GAME_EVENT_NAMES instead.'
        },
        schema: [],
        messages: {
            inlineHumorEvent: 'Inline humor telemetry name "{{name}}" detected. Import and use the constant from GAME_EVENT_NAMES instead.'
        }
    },
    create(context) {
        function isTelemetryCall(node) {
            if (node.callee.type === 'Identifier') {
                return ['trackGameEventClient', 'trackGameEvent', 'trackGameEventStrict', 'trackEvent'].includes(node.callee.name)
            }
            return false
        }

        function isInTelemetryEventsFile() {
            const filename = context.getFilename()
            return filename.includes('telemetryEvents.ts')
        }

        return {
            CallExpression(node) {
                // Skip if we're in the telemetryEvents.ts file (where the enum is defined)
                if (isInTelemetryEventsFile()) return

                if (!isTelemetryCall(node)) return

                const [nameArg] = node.arguments
                if (!nameArg || nameArg.type !== 'Literal' || typeof nameArg.value !== 'string') return

                const eventName = nameArg.value

                // Check if this is a DM.Humor.* event
                if (/^DM\.Humor\./.test(eventName)) {
                    context.report({
                        node: nameArg,
                        messageId: 'inlineHumorEvent',
                        data: { name: eventName }
                    })
                }
            }
        }
    }
}
