// ESLint rule: forbid manual operationId insertion outside telemetry helper
// Issue: piquet-h/the-shifting-atlas#314 - Event Correlation (operationId + correlationId)
// 
// This rule prevents developers from manually setting operationId in telemetry properties.
// The operationId should only be attached automatically by trackGameEvent/trackGameEventStrict
// helpers, which extract it from Application Insights context.
//
// Forbidden patterns:
// - trackGameEvent('Event', { operationId: '...' })
// - trackGameEventStrict('Event', { operationId: someVar })
// - properties.operationId = '...'
// - properties['operationId'] = '...'
//
// Allowed:
// - Reading operationId: const id = properties.operationId
// - operationId in telemetry.ts helper functions (getOperationId, trackGameEvent, trackGameEventStrict)

export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow manual operationId insertion outside telemetry helpers. Use trackGameEvent which attaches operationId automatically from Application Insights context.',
            category: 'Telemetry',
            recommended: true
        },
        schema: [],
        messages: {
            manualOperationId: 'Manual operationId insertion is forbidden. The trackGameEvent/trackGameEventStrict helpers automatically attach operationId from Application Insights context.',
            operationIdInProperties: 'Do not manually set operationId in properties object. Let trackGameEvent attach it automatically.'
        }
    },
    create(context) {
        const filename = context.getFilename()
        
        // Allow operationId manipulation only in telemetry helper files
        const isTelemetryHelper = 
            /backend\/src\/telemetry\.ts$/.test(filename) ||
            /shared\/src\/telemetry.*\.ts$/.test(filename) ||
            /frontend\/src\/services\/telemetry\.ts$/.test(filename)
        
        // Allow in test files (for mocking/assertions)
        const isTestFile = /\.test\.ts$/.test(filename) || /test\//.test(filename)
        
        if (isTelemetryHelper || isTestFile) {
            return {}
        }

        return {
            // Detect: { operationId: ... } in object literals
            Property(node) {
                if (node.key.type === 'Identifier' && node.key.name === 'operationId') {
                    // Check if this is part of a trackGameEvent/trackGameEventStrict call
                    let parent = node.parent
                    while (parent) {
                        if (parent.type === 'CallExpression') {
                            const callee = parent.callee
                            const calleeName = callee.type === 'Identifier' ? callee.name : 
                                             callee.type === 'MemberExpression' ? callee.property.name : null
                            
                            if (calleeName === 'trackGameEvent' || calleeName === 'trackGameEventStrict') {
                                context.report({
                                    node,
                                    messageId: 'manualOperationId'
                                })
                                return
                            }
                        }
                        parent = parent.parent
                    }
                    
                    // Also flag standalone operationId in properties objects
                    context.report({
                        node,
                        messageId: 'operationIdInProperties'
                    })
                }
            },
            
            // Detect: properties.operationId = ... or properties['operationId'] = ...
            AssignmentExpression(node) {
                if (node.left.type === 'MemberExpression') {
                    const property = node.left.property
                    if (property.type === 'Identifier' && property.name === 'operationId') {
                        context.report({
                            node,
                            messageId: 'operationIdInProperties'
                        })
                    } else if (property.type === 'Literal' && property.value === 'operationId') {
                        context.report({
                            node,
                            messageId: 'operationIdInProperties'
                        })
                    }
                }
            }
        }
    }
}
