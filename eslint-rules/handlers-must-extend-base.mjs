// ESLint rule: enforce that all handler classes extend BaseHandler
export default {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Ensure all handler classes extend BaseHandler to have access to ITelemetryClient and common handler functionality.'
        },
        schema: [],
        messages: {
            missingBaseHandler:
                'Handler class "{{className}}" must extend BaseHandler to access ITelemetryClient and common handler utilities.',
            useClassNotFunction: 'Handler "{{functionName}}" should be a class extending BaseHandler, not a standalone function.'
        }
    },
    create(context) {
        const filename = context.getFilename()

        // Only apply to files in backend/src/handlers/ that end with .handler.ts
        const isHandlerFile = /backend\/src\/handlers\/.*\.handler\.ts$/.test(filename)

        // Exclude the BaseHandler itself and utility files
        const isBaseHandler = /BaseHandler\.ts$/.test(filename)
        const isUtilFile = /\/utils\//.test(filename)

        if (!isHandlerFile || isBaseHandler || isUtilFile) {
            return {}
        }

        return {
            // Check exported class declarations
            ExportNamedDeclaration(node) {
                if (node.declaration?.type === 'ClassDeclaration') {
                    const classNode = node.declaration
                    const className = classNode.id?.name

                    // Only check classes that end with 'Handler'
                    if (className && className.endsWith('Handler')) {
                        const extendsBaseHandler = classNode.superClass?.name === 'BaseHandler'

                        if (!extendsBaseHandler) {
                            context.report({
                                node: classNode.id,
                                messageId: 'missingBaseHandler',
                                data: { className }
                            })
                        }
                    }
                }

                // Check for exported async functions (old pattern we want to discourage for handlers)
                if (node.declaration?.type === 'FunctionDeclaration') {
                    const functionName = node.declaration.id?.name

                    // Only check functions that look like handlers (end with 'Handler' or match common patterns)
                    if (
                        functionName &&
                        (functionName.endsWith('Handler') ||
                            functionName.includes('handle') ||
                            functionName === 'ping' ||
                            functionName === 'backendHealth' ||
                            functionName === 'backendPing')
                    ) {
                        // This is an old-style handler function - suggest converting to class
                        // But allow wrapper functions that delegate to classes
                        const functionBody = context.getSourceCode().getText(node.declaration.body)
                        const isDelegatingWrapper = functionBody.includes('container.get(') && functionBody.includes('Handler')

                        if (!isDelegatingWrapper) {
                            context.report({
                                node: node.declaration.id,
                                messageId: 'useClassNotFunction',
                                data: { functionName }
                            })
                        }
                    }
                }
            }
        }
    }
}
