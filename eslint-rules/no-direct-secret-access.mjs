// ESLint rule: forbid direct process.env access to secret keys outside secrets helper
export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow direct process.env access to secret keys. Use getSecret() from secrets helper instead.'
        },
        schema: [],
        messages: {
            forbidden:
                'Direct access to secret "{{secretName}}" via process.env is forbidden. Use getSecret() from @piquet-h/shared instead.',
            deprecatedFunction: 'Secret access in deprecated function "{{functionName}}". Use loadPersistenceConfigAsync() for new code.'
        }
    },
    create(context) {
        const filename = context.filename || context.getFilename()

        // Allow direct access in:
        // 1. The secrets helper itself
        // 2. Test files
        // 3. persistenceConfig.ts (contains deprecated sync function explicitly marked @deprecated)
        const allowed =
            /shared\/src\/secrets\/secretsHelper\.ts$/.test(filename) ||
            /shared\/test\/secretsHelper\.test\.ts$/.test(filename) ||
            /\.env\.development\.example$/.test(filename)

        // Secret environment variable names that should go through the helper
        const secretEnvVars = [
            // Gremlin key removed (AAD auth only)
            'COSMOS_SQL_KEY',
            'SERVICE_BUS_CONNECTION_STRING',
            'MODEL_PROVIDER_API_KEY',
            'SIGNING_SECRET'
        ]

        return {
            MemberExpression(node) {
                if (allowed) return

                // Check for process.env.SECRET_NAME patterns
                if (
                    node.object.type === 'MemberExpression' &&
                    node.object.object.type === 'Identifier' &&
                    node.object.object.name === 'process' &&
                    node.object.property.type === 'Identifier' &&
                    node.object.property.name === 'env' &&
                    node.property.type === 'Identifier'
                ) {
                    const envVarName = node.property.name
                    if (secretEnvVars.includes(envVarName)) {
                        context.report({
                            node,
                            messageId: 'forbidden',
                            data: { secretName: envVarName }
                        })
                    }
                }
            }
        }
    }
}
