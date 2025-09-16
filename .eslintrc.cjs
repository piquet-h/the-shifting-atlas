/* Unified ESLint config for the monorepo (frontend + Azure Functions backend)
 * -------------------------------------------------------------------------
 * Goals:
 *  - Single source of truth for lint rules
 *  - React + a11y rules only apply to frontend (TSX) files
 *  - Backend (Azure Functions) stays node-focused without unnecessary React plugins
 *  - Shared TypeScript rules everywhere
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: 'detect' } },
  ignorePatterns: [
    'dist',
    'node_modules',
    '**/dist',
    '**/.azure',
    '**/coverage'
  ],
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn'
  },
  overrides: [
    /* Frontend React + JSX/A11y rules */
    {
      files: ['frontend/src/**/*.{ts,tsx}', 'frontend/api/src/**/*.{ts,tsx}'],
      env: { browser: true },
      plugins: ['react', 'react-hooks', 'jsx-a11y'],
      extends: [
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'plugin:jsx-a11y/recommended'
      ],
      rules: {
        'react/prop-types': 'off',
        'jsx-a11y/no-autofocus': 'warn',
        'jsx-a11y/anchor-is-valid': ['error', { aspects: ['noHref', 'invalidHref'] }]
      }
    },
    /* Backend Azure Functions (no React) */
    {
      files: ['backend/src/**/*.ts'],
      env: { node: true },
      rules: {
        // Backend specific adjustments can go here
      }
    }
  ]
}
