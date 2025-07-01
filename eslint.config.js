import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Disable rules that conflict with Prettier or are not needed
      indent: 'off',
      'linebreak-style': ['error', 'unix'],
      quotes: ['error', 'double'],
      semi: ['error', 'always'],
      '@typescript-eslint/no-explicit-any': 'warn', // Warn instead of error for 'any'
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ], // Warn for unused vars, ignore args starting with _
      '@typescript-eslint/no-require-imports': 'error', // Keep this to enforce ES modules
      'no-undef': 'error', // Ensure no-undef is still active
      'no-useless-catch': 'warn', // Warn for useless catch
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': 'allow-with-description' },
      ], // Allow ts-ignore with description
    },
  },
  {
    files: ['**/*.test.ts'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      'no-undef': 'off', // Jest globals are handled by globals.jest
    },
  },
  prettier,
);
