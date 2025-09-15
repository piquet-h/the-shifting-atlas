/* Shared ESLint config for TypeScript + React + Node (Functions) */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint','react','react-hooks','jsx-a11y'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended'
  ],
  settings: { react: { version: 'detect' } },
  ignorePatterns: ['dist','node_modules'],
  rules: {
    'react/prop-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    // Accessibility adjustments
    'jsx-a11y/no-autofocus': 'warn',
    'jsx-a11y/anchor-is-valid': ['error', { aspects: ['noHref', 'invalidHref'] }]
  }
}
