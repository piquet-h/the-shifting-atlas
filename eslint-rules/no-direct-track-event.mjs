// ESLint rule: forbid direct trackEvent usage outside approved telemetry modules
export default {
    meta: {
        type: 'problem',
        docs: { description: 'Disallow direct trackEvent calls outside central telemetry modules.' },
        schema: [],
        messages: {
            forbidden: 'Use trackGameEvent/trackGameEventClient instead of direct trackEvent outside telemetry modules.'
        }
    },
    create(context) {
        const filename = context.getFilename()
        const allowed = /shared\/src\/telemetry\.ts$/.test(filename) || /frontend\/src\/services\/telemetry\.ts$/.test(filename)
        return {
            CallExpression(node) {
                if (allowed) return
                if (node.callee.type === 'Identifier' && node.callee.name === 'trackEvent') {
                    context.report({ node, messageId: 'forbidden' })
                }
            }
        }
    }
}
