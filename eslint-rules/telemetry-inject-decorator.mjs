// ESLint rule: enforce @inject(TelemetryService) decorator on non-optional telemetryService constructor params
// Rationale: Prevent silent DI metadata loss when TelemetryService is a secondary parameter.
// Exemptions: Abstract base repository classes may accept optional telemetryService without decorator.
// Scope: backend/src/repos/*.ts
export default {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Ensure repository classes inject TelemetryService explicitly with @inject(TelemetryService) when the telemetryService constructor parameter is required (non-optional). Prevents DI failures when parameter index > 0.'
        },
        schema: [],
        messages: {
            missingTelemetryInject:
                'Constructor parameter "telemetryService" in class "{{className}}" must be decorated with @inject(TelemetryService) or marked optional (telemetryService?: TelemetryService).',
            avoidStringToken:
                'Do not use string tokens for TelemetryService injection; use @inject(TelemetryService) instead per DI consistency policy.'
        }
    },
    create(context) {
        const filename = context.getFilename()

        // Only apply inside backend/src/repos
        if (!/backend\/src\/repos\/.*\.ts$/.test(filename)) {
            return {}
        }

        // Exempt known abstract/base repository files
        const isBase = /CosmosGremlinRepository\.ts$/.test(filename) || /CosmosDbSqlRepository\.ts$/.test(filename)
        if (isBase) return {}

        return {
            ClassDeclaration(classNode) {
                const className = classNode.id?.name || 'UnknownClass'

                // Focus on repository-like classes (naming convention)
                if (!/Repository/.test(className)) return

                const ctor = classNode.body.body.find(
                    (m) => m.type === 'MethodDefinition' && m.kind === 'constructor'
                )
                if (!ctor) return

                const params = ctor.value.params || []
                if (params.length === 0) return

                for (const param of params) {
                    if (param.type !== 'Identifier' && param.type !== 'AssignmentPattern') continue

                    // Handle parameter with default value (AssignmentPattern)
                    const idNode = param.type === 'AssignmentPattern' ? param.left : param

                    if (idNode.type !== 'Identifier') continue
                    const name = idNode.name
                    if (name !== 'telemetryService') continue

                    // Obtain original parameter (could be TS parameter property)
                    // Decorators reside on param (MethodDefinition value params entries)
                    const originalParam = param

                    // Heuristic: look at source text of parameter for its type annotation
                    const source = context.getSourceCode().getText(originalParam)
                    const isTelemetryType = /TelemetryService/.test(source)
                    if (!isTelemetryType) continue

                    // Optional if contains '?:' or '=' initializer (assignment pattern already optional via default)
                    const isOptional = /telemetryService\s*\?:/.test(source) || param.type === 'AssignmentPattern'
                    if (isOptional) continue

                    // Check decorators for @inject(TelemetryService)
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
                                    (args[0].type === 'MemberExpression' && context.getSourceCode().getText(args[0]) === 'TelemetryService'))
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

                    // Warn if someone used a string token variant
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
