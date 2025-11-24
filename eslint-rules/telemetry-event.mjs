// Unified ESLint rule: telemetry-event
// Purpose: Combine naming pattern validation (Domain[.Subject].Action PascalCase 2-3 segments)
// and enumeration membership validation against GAME_EVENT_NAMES in shared/src/telemetryEvents.ts.
// Applies to: trackEvent(...), trackGameEvent(...), trackGameEventStrict(...)
// Simplification: Replaces telemetry-event-name + telemetry-event-membership rules.

import fs from 'node:fs'
import path from 'node:path'

let cachedNames = null
function loadEventNames(context) {
    if (cachedNames) return cachedNames
    try {
        // Resolve repository root by walking upward until we find a directory that contains both
        // a package.json AND a 'shared' subdirectory (the monorepo root)
        let dir = path.dirname(context.getFilename())
        while (dir !== path.parse(dir).root) {
            const hasPackageJson = fs.existsSync(path.join(dir, 'package.json'))
            const hasShared = fs.existsSync(path.join(dir, 'shared'))
            if (hasPackageJson && hasShared) {
                break // Found monorepo root
            }
            dir = path.dirname(dir)
        }
        const target = path.join(dir, 'shared', 'src', 'telemetryEvents.ts')
        const text = fs.readFileSync(target, 'utf8')
        // Match quoted event literals (PascalCase dot-separated segments) from enumeration source
        const matches = [...text.matchAll(/'([A-Z][A-Za-z]+(?:\.[A-Z][A-Za-z]+){1,2})'/g)]
        cachedNames = new Set(matches.map((m) => m[1]))
    } catch (e) {
        cachedNames = new Set()
    }
    return cachedNames
}

const SEGMENT = /^[A-Z][A-Za-z]+$/

export default {
    meta: {
        type: 'problem',
        docs: {
            description:
                'Validate telemetry event names: pattern Domain[.Subject].Action (2-3 PascalCase segments) and membership in GAME_EVENT_NAMES.'
        },
        schema: [],
        messages: {
            invalid: 'Telemetry event name "{{name}}" must match pattern Domain[.Subject].Action (2-3 PascalCase segments).',
            notMember: 'Telemetry event name "{{name}}" is not declared in GAME_EVENT_NAMES enumeration.'
        }
    },
    create(context) {
        const names = loadEventNames(context)

        function validateLiteral(node) {
            if (!node || node.type !== 'Literal' || typeof node.value !== 'string') return
            const name = node.value
            const parts = name.split('.')
            const patternOk = parts.length >= 2 && parts.length <= 3 && parts.every((p) => SEGMENT.test(p))
            if (!patternOk) {
                context.report({ node, messageId: 'invalid', data: { name } })
                return // If pattern invalid, skip membership check to reduce noise
            }
            if (!names.has(name)) {
                context.report({ node, messageId: 'notMember', data: { name } })
            }
        }

        return {
            CallExpression(node) {
                if (node.callee.type !== 'Identifier') return
                const fn = node.callee.name
                if (fn === 'trackEvent' || fn === 'trackGameEvent' || fn === 'trackGameEventStrict') {
                    validateLiteral(node.arguments[0])
                }
            }
        }
    }
}
