/**
 * ESLint rule: azure-function-naming
 *
 * Validates Azure Functions are registered with proper naming:
 * - HTTP: PascalCase action name (e.g., 'PlayerMove', 'GetExits')
 * - Queue/Timer/CosmosDB: camelCase with descriptive prefix
 *   (e.g., 'queueProcessWorldEvent', 'timerComputeIntegrityHashes')
 *
 * This prevents inconsistent function names and improves discoverability.
 *
 * Applies to: files in backend/src/functions/*.ts that register Azure Functions
 */

export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Validate Azure Function registration names follow naming conventions'
        },
        messages: {
            httpPatternInvalid: `HTTP function name "{{name}}" must be PascalCase without prefix (e.g., 'PlayerMove', 'GetExits'). Pattern: /^[A-Z][A-Za-z0-9]*$/`,
            queuePatternInvalid: `Queue function name "{{name}}" should be descriptive camelCase with 'queue' prefix (e.g., 'queueProcessWorldEvent'). Pattern: /^queue[A-Z][A-Za-z0-9]*$/`,
            timerPatternInvalid: `Timer function name "{{name}}" should be descriptive camelCase with 'timer' prefix (e.g., 'timerComputeIntegrityHashes'). Pattern: /^timer[A-Z][A-Za-z0-9]*$/`,
            cosmosDBPatternInvalid: `CosmosDB trigger name "{{name}}" should be descriptive camelCase with 'cosmosDB' prefix (e.g., 'cosmosDBProcessChanges'). Pattern: /^cosmosDB[A-Z][A-Za-z0-9]*$/`,
            serviceBusPatternInvalid: `Service Bus function name "{{name}}" should be descriptive camelCase with 'serviceBus' prefix (e.g., 'serviceBusProcessMessages'). Pattern: /^serviceBus[A-Z][A-Za-z0-9]*$/`
        }
    },

    create(context) {
        return {
            CallExpression(node) {
                // Match patterns like: app.http(...), app.serviceBusQueue(...), app.timer(...)
                if (node.callee.type !== 'MemberExpression' || node.callee.object.name !== 'app') {
                    return
                }

                const triggerType = node.callee.property.name
                const firstArg = node.arguments[0]

                if (!firstArg || firstArg.type !== 'Literal' || typeof firstArg.value !== 'string') {
                    return
                }

                const functionName = firstArg.value

                // Validate based on trigger type
                let messageId, pattern
                switch (triggerType) {
                    case 'http':
                        pattern = /^[A-Z][A-Za-z0-9]*$/
                        messageId = 'httpPatternInvalid'
                        break
                    case 'serviceBusQueue':
                    case 'serviceBusTopic':
                        pattern = /^serviceBus[A-Z][A-Za-z0-9]*$/
                        messageId = 'serviceBusPatternInvalid'
                        break
                    case 'timer':
                        pattern = /^timer[A-Z][A-Za-z0-9]*$/
                        messageId = 'timerPatternInvalid'
                        break
                    case 'cosmosDB':
                        pattern = /^cosmosDB[A-Z][A-Za-z0-9]*$/
                        messageId = 'cosmosDBPatternInvalid'
                        break
                    case 'queue': // Older Azure Functions SDK
                        pattern = /^queue[A-Z][A-Za-z0-9]*$/
                        messageId = 'queuePatternInvalid'
                        break
                    default:
                        return // Unknown trigger type, skip
                }

                if (!pattern.test(functionName)) {
                    context.report({
                        node: firstArg,
                        messageId,
                        data: { name: functionName }
                    })
                }
            }
        }
    }
}
