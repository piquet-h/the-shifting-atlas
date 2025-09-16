// Flat ESLint config (ESLint v9+) unified for frontend + backend
// Migrated from legacy .eslintrc.cjs
import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import ts from 'typescript-eslint'

export default [
  {
    ignores: [
      'dist',
      '**/dist/**',
      'node_modules',
      '**/.azure/**',
      '**/coverage/**'
    ]
  },
  // Base JS + TS recommended
  js.configs.recommended,
  ...ts.configs.recommended,
  // Frontend React overrides
  {
    files: ['frontend/src/**/*.{ts,tsx}', 'frontend/api/src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react/prop-types': 'off',
      'jsx-a11y/no-autofocus': 'warn',
      'jsx-a11y/anchor-is-valid': ['error', { aspects: ['noHref', 'invalidHref'] }],
      '@typescript-eslint/no-explicit-any': 'warn'
    },
    settings: { react: { version: 'detect' } }
  },
  // Backend Azure Functions (Node env, no React)
  {
    files: ['backend/src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
]