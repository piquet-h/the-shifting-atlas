/**
 * ESLint rule: timer-unref-required
 *
 * Warn when long-lived Node.js timers are created without a matching `.unref()` call.
 * This helps prevent tests and short-lived processes from hanging due to timers keeping
 * the event loop alive.
 *
 * Current policy:
 * - `setInterval(...)` always requires `.unref()` when the timer handle is retained.
 * - `setTimeout(...)` requires `.unref()` only when the delay can be statically resolved
 *   to >= 60000 ms.
 */

function isTimerFactory(node) {
    return node?.type === 'CallExpression' && node.callee?.type === 'Identifier' && ['setTimeout', 'setInterval'].includes(node.callee.name)
}

function evaluateNumber(node) {
    if (!node) return null
    if (node.type === 'Literal' && typeof node.value === 'number') return node.value
    if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') {
        return -node.argument.value
    }
    if (node.type === 'BinaryExpression') {
        const left = evaluateNumber(node.left)
        const right = evaluateNumber(node.right)
        if (left === null || right === null) return null
        switch (node.operator) {
            case '+':
                return left + right
            case '-':
                return left - right
            case '*':
                return left * right
            case '/':
                return right === 0 ? null : left / right
            default:
                return null
        }
    }
    return null
}

function getHandleReference(node, sourceCode) {
    if (node.parent?.type === 'VariableDeclarator' && node.parent.id?.type === 'Identifier') {
        return node.parent.id.name
    }

    if (node.parent?.type === 'AssignmentExpression') {
        const left = node.parent.left
        if (left.type === 'Identifier' || left.type === 'MemberExpression') {
            return sourceCode.getText(left)
        }
    }

    return null
}

function getContainingStatement(node) {
    let current = node
    while (current && current.parent) {
        if (current.type.endsWith('Statement')) return current
        current = current.parent
    }
    return null
}

function hasFollowingUnref(statement, handleRef, sourceCode) {
    const container = statement?.parent
    if (!container || !Array.isArray(container.body)) return false

    const startIndex = container.body.indexOf(statement)
    if (startIndex === -1) return false

    for (let i = startIndex + 1; i < container.body.length; i++) {
        const sibling = container.body[i]
        if (sibling.type !== 'ExpressionStatement') continue

        const expr = sibling.expression
        if (expr?.type !== 'CallExpression') continue
        if (expr.callee?.type !== 'MemberExpression') continue
        if (expr.callee.property?.type !== 'Identifier' || expr.callee.property.name !== 'unref') continue

        const refText = sourceCode.getText(expr.callee.object)
        if (refText === handleRef) {
            return true
        }
    }

    return false
}

export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Warn when retained Node.js timers should call .unref() to avoid hanging the process'
        },
        schema: [],
        messages: {
            missingUnref:
                'Timer handle {{handle}} should call .unref() so it does not keep the Node.js process alive.'
        }
    },

    create(context) {
        const sourceCode = context.getSourceCode()

        return {
            CallExpression(node) {
                if (!isTimerFactory(node)) return

                const timerType = node.callee.name
                const handleRef = getHandleReference(node, sourceCode)
                if (!handleRef) return

                const delayArg = node.arguments[1]
                const delayMs = evaluateNumber(delayArg)

                const requiresUnref = timerType === 'setInterval' || (timerType === 'setTimeout' && delayMs !== null && delayMs >= 60_000)

                if (!requiresUnref) return

                const statement = getContainingStatement(node)
                if (hasFollowingUnref(statement, handleRef, sourceCode)) return

                context.report({
                    node,
                    messageId: 'missingUnref',
                    data: { handle: handleRef }
                })
            }
        }
    }
}