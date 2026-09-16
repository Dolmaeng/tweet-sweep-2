import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['.output/**', '.wxt/**', 'node_modules/**', 'docs/**', 'tests/fixtures/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // core는 브라우저·확장 API에 의존하지 않는다 (plan §1, NFR-10)
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'chrome',
        'browser',
        'localStorage',
        'indexedDB',
      ],
      'no-restricted-imports': [
        'error',
        { patterns: ['wxt/*', '*/platform/*', '*/executors/*', 'react', 'idb'] },
      ],
    },
  },
);
