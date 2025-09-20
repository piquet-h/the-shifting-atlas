/**
 * Prettier configuration enforcing 4-space indentation across the monorepo.
 */
module.exports = {
    useTabs: false,
    tabWidth: 4,
    printWidth: 100,
    singleQuote: true,
    trailingComma: 'all',
    semi: true,
    bracketSpacing: true,
    // Enforce parentheses around single arrow function params for consistency
    arrowParens: 'always',
};
