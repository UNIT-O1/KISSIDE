import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // CLAUDE.md: all network calls live in src/services/*.
    files: ['src/**/*.ts'],
    ignores: ['src/services/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Network access belongs in src/services/.' },
        { name: 'XMLHttpRequest', message: 'Network access belongs in src/services/.' },
      ],
      'no-restricted-properties': [
        'error',
        ...['window', 'globalThis', 'self'].map((object) => ({
          object,
          property: 'fetch',
          message: 'Network access belongs in src/services/.',
        })),
      ],
    },
  },
  {
    // CLAUDE.md: src/core/* is pure and never imports from services/ or ui/.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['**/services/**', '**/ui/**', '../services', '../ui'] },
      ],
    },
  },
  prettierConfig,
];
