export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow direct process.env access to secret keys; use getSecret() from the secrets helper.'
        },
        schema: [],
        messages: {
            forbidden: 'Direct access to secret "{{secretName}}" via process.env is forbidden. Use getSecret() from @piquet-h/shared.',
            deprecatedFunction: 'Deprecated secret access in "{{functionName}}". Use loadPersistenceConfigAsync().'
        }
    },
    create(context) {
        const filename = context.filename || context.getFilename()

        // Allowed files: the secrets helper and its tests, env example.
        const allowed =
            /shared\/src\/secrets\/secretsHelper\.ts$/.test(filename) ||
            /shared\/test\/secretsHelper\.test\.ts$/.test(filename) ||
            /\.env\.development\.example$/.test(filename)

        // Secret variables that must go through the helper.
        const secretEnvVars = ['COSMOS_SQL_KEY', 'SERVICE_BUS_CONNECTION_STRING', 'MODEL_PROVIDER_API_KEY', 'SIGNING_SECRET']

        return {
            MemberExpression(node) {
                if (allowed) return

                // Match process.env.SECRET_NAME
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
