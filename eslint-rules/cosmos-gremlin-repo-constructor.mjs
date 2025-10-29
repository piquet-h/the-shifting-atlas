// ESLint rule: enforce that classes extending CosmosGremlinRepository have explicit constructors
// This prevents Inversify dependency injection issues with inherited constructor parameters
export default {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Ensure classes extending CosmosGremlinRepository have explicit constructors with @inject decorator for proper Inversify DI. ' +
                'Without this, Inversify may fail to resolve the GremlinClient dependency from the base class constructor.'
        },
        schema: [],
        messages: {
            missingConstructor:
                'Class "{{className}}" extends CosmosGremlinRepository but lacks an explicit constructor. ' +
                "Add: constructor(@inject('GremlinClient') client: IGremlinClient) { super(client) }",
            missingInjectDecorator:
                'Constructor in "{{className}}" must use @inject(\'GremlinClient\') decorator for the client parameter to ensure proper Inversify dependency injection.',
            missingSuperCall:
                'Constructor in "{{className}}" must call super(client) to properly initialize CosmosGremlinRepository base class.'
        }
    },
    create(context) {
        const filename = context.getFilename()

        // Only apply to files in backend/src/repos/ that use Cosmos implementations
        const isRepoFile = /backend\/src\/repos\/.*\.ts$/.test(filename)
        const isBaseFile = /CosmosGremlinRepository\.ts$/.test(filename)

        if (!isRepoFile || isBaseFile) {
            return {}
        }

        return {
            ClassDeclaration(node) {
                // Check if this class extends CosmosGremlinRepository
                const extendsCosmosGremlin = node.superClass?.type === 'Identifier' && node.superClass.name === 'CosmosGremlinRepository'

                if (!extendsCosmosGremlin) {
                    return
                }

                const className = node.id?.name || 'UnknownClass'

                // Find constructor in the class body
                const constructor = node.body.body.find((member) => member.type === 'MethodDefinition' && member.kind === 'constructor')

                if (!constructor) {
                    // No constructor found - this will cause DI issues
                    context.report({
                        node: node.id || node,
                        messageId: 'missingConstructor',
                        data: { className }
                    })
                    return
                }

                // Constructor exists - verify it has proper @inject decorator
                const constructorParams = constructor.value.params
                const clientParam = constructorParams[0]

                if (!clientParam) {
                    // Constructor has no parameters
                    context.report({
                        node: constructor,
                        messageId: 'missingConstructor',
                        data: { className }
                    })
                    return
                }

                // Check for @inject decorator on the first parameter
                const hasInjectDecorator = clientParam.decorators?.some((decorator) => {
                    if (decorator.expression.type === 'CallExpression') {
                        const callee = decorator.expression.callee
                        const args = decorator.expression.arguments
                        return (
                            callee.name === 'inject' && args.length > 0 && args[0].type === 'Literal' && args[0].value === 'GremlinClient'
                        )
                    }
                    return false
                })

                if (!hasInjectDecorator) {
                    context.report({
                        node: clientParam,
                        messageId: 'missingInjectDecorator',
                        data: { className }
                    })
                }

                // Check for super() call in constructor body
                const constructorBody = constructor.value.body
                const hasSuperCall = constructorBody.body.some(
                    (statement) =>
                        statement.type === 'ExpressionStatement' &&
                        statement.expression.type === 'CallExpression' &&
                        statement.expression.callee.type === 'Super'
                )

                if (!hasSuperCall) {
                    context.report({
                        node: constructor,
                        messageId: 'missingSuperCall',
                        data: { className }
                    })
                }
            }
        }
    }
}
