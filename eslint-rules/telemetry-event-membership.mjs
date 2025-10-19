// ESLint rule: enforce that telemetry event literals used in tracking APIs
// are members of the canonical GAME_EVENT_NAMES array (source of truth).
// Applies to: trackGameEventStrict(...), trackGameEvent(...)
// Implementation: lazy-parse shared/src/telemetryEvents.ts to build a Set.

import fs from 'node:fs'
import path from 'node:path'

let cachedNames = null
function loadEventNames(context) {
    if (cachedNames) return cachedNames
    try {
        // Resolve repository root by traversing upward until package.json found
        let dir = path.dirname(context.getFilename())
        while (dir !== path.parse(dir).root) {
            if (fs.existsSync(path.join(dir, 'package.json'))) break
            dir = path.dirname(dir)
        }
        const target = path.join(dir, 'shared', 'src', 'telemetryEvents.ts')
        const text = fs.readFileSync(target, 'utf8')
        const matches = [...text.matchAll(/'([A-Z][A-Za-z]+(?:\.[A-Z][A-Za-z]+){1,2})'/g)]
        cachedNames = new Set(matches.map((m) => m[1]))
    } catch (e) {
        cachedNames = new Set()
    }
    return cachedNames
}

export default {
    meta: {
        type: 'problem',
        docs: { description: 'Ensure telemetry event names are declared in GAME_EVENT_NAMES.' },
        schema: [],
        messages: {
            notMember: 'Telemetry event name "{{name}}" is not in GAME_EVENT_NAMES enumeration.'
        }
    },
    create(context) {
        const names = loadEventNames(context)
        function checkArg(node) {
            if (node && node.type === 'Literal' && typeof node.value === 'string') {
                const value = node.value
                // Allow intentionally invalid sentinel emission which is part of enum
                if (!names.has(value)) {
                    context.report({ node, messageId: 'notMember', data: { name: value } })
                }
            }
        }
        return {
            CallExpression(node) {
                if (
                    node.callee.type === 'Identifier' &&
                    (node.callee.name === 'trackGameEventStrict' || node.callee.name === 'trackGameEvent')
                ) {
                    checkArg(node.arguments[0])
                }
            }
        }
    }
}
