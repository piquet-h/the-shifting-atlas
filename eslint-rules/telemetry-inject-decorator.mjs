export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Require @inject(TelemetryService) on non-optional telemetryService constructor params in repositories.'
        },
        schema: [],
        messages: {
            missingTelemetryInject:
                'Constructor parameter "telemetryService" in class "{{className}}" must use @inject(TelemetryService) or be optional (telemetryService?: TelemetryService).',
            avoidStringToken: 'Avoid string tokens for TelemetryService; use @inject(TelemetryService).'
        }
    },
    create(context) {
        const filename = context.getFilename()
        if (!/backend\/src\/repos\/.*\.ts$/.test(filename)) {
            return {}
        }
        const isBase = /CosmosGremlinRepository\.ts$/.test(filename) || /CosmosDbSqlRepository\.ts$/.test(filename)
        if (isBase) return {}

        return {
            ClassDeclaration(classNode) {
                const className = classNode.id?.name || 'UnknownClass'
                if (!/Repository/.test(className)) return

                const ctor = classNode.body.body.find((m) => m.type === 'MethodDefinition' && m.kind === 'constructor')
                if (!ctor) return

                const params = ctor.value.params || []
                if (params.length === 0) return

                for (const param of params) {
                    if (param.type !== 'Identifier' && param.type !== 'AssignmentPattern') continue
                    const idNode = param.type === 'AssignmentPattern' ? param.left : param

                    if (idNode.type !== 'Identifier') continue
                    const name = idNode.name
                    if (name !== 'telemetryService') continue
                    const originalParam = param
                    const source = context.getSourceCode().getText(originalParam)
                    const isTelemetryType = /TelemetryService/.test(source)
                    if (!isTelemetryType) continue
                    const isOptional = /telemetryService\s*\?:/.test(source) || param.type === 'AssignmentPattern'
                    if (isOptional) continue
                    const decorators = originalParam.decorators || []
                    const hasClassInject = decorators.some((d) => {
                        if (d.expression.type === 'CallExpression') {
                            const callee = d.expression.callee
                            const args = d.expression.arguments
                            return (
                                callee.type === 'Identifier' &&
                                callee.name === 'inject' &&
                                args.length === 1 &&
                                ((args[0].type === 'Identifier' && args[0].name === 'TelemetryService') ||
                                    (args[0].type === 'MemberExpression' &&
                                        context.getSourceCode().getText(args[0]) === 'TelemetryService'))
                            )
                        }
                        return false
                    })

                    if (!hasClassInject) {
                        context.report({
                            node: originalParam,
                            messageId: 'missingTelemetryInject',
                            data: { className }
                        })
                    }
                    const hasStringToken = decorators.some((d) => {
                        if (d.expression.type === 'CallExpression') {
                            const callee = d.expression.callee
                            const args = d.expression.arguments
                            return (
                                callee.type === 'Identifier' &&
                                callee.name === 'inject' &&
                                args.length === 1 &&
                                args[0].type === 'Literal' &&
                                args[0].value === 'TelemetryService'
                            )
                        }
                        return false
                    })
                    if (hasStringToken) {
                        context.report({ node: originalParam, messageId: 'avoidStringToken' })
                    }
                }
            }
        }
    }
}
