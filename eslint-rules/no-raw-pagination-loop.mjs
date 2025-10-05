// ESLint custom rule: forbid direct usage of pageInfo.hasNextPage / endCursor outside pagination abstraction
// Intent: enforce use of shared paginate / paginateProjectItems helpers (scripts/shared/pagination.mjs)

export default {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow raw GraphQL pagination cursor loops; require shared paginator helpers',
            recommended: false
        },
        messages: {
            avoidRawPagination: 'Use shared paginate()/paginateProjectItems() abstraction instead of raw pageInfo.hasNextPage or endCursor access.'
        },
        schema: []
    },
    create(context) {
        const filename = context.getFilename().replace(/\\/g, '/');
        // Allow in the canonical paginator file itself
        const allow = /shared\/pagination\.mjs$/.test(filename);
        if (allow) return {};
        function report(node) {
            context.report({ node, messageId: 'avoidRawPagination' });
        }
        return {
            MemberExpression(node) {
                if (node.property && !node.computed && node.property.name === 'hasNextPage') {
                    report(node.property);
                }
            },
            Identifier(node) {
                if (node.name === 'endCursor') {
                    // If part of a property definition like { endCursor } still discourage; helpers should capture it internally.
                    report(node);
                }
            }
        };
    }
};
