// ESLint flat config (roadmap 5.1).
//
// The codebase's real failure mode — per the bug hunt — is an unawaited
// promise that drops a rejection on the floor, or a stale React effect
// dependency. This config targets exactly those with type-aware
// typescript-eslint + react-hooks, rather than flooding the tree with style
// nits. The handful of eslint-disable comments already scattered in the
// source finally mean something.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      'public/sw.js',
      'public/worklets/**',
      '*.config.js',
      '*.config.ts',
    ],
  },
  js.configs.recommended,
  // The non-type-checked recommended set catches genuine TS mistakes without
  // the stylistic noise of recommendedTypeChecked (unnecessary-assertion,
  // require-await, restrict-template-expressions, no-unsafe-*) that this
  // codebase's deliberate Web Audio / mock casts would drown the signal in.
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      // Type-aware linting is still on (projectService) — it's what powers
      // the two rules below that actually matter here.
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.worker,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // This app's signature failure mode: a dropped promise rejection that
      // silently kills audio, or a stale effect dep. Hard errors.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Deliberate patterns at the Web Audio / trust boundary.
      '@typescript-eslint/no-explicit-any': 'off',
      // tsc already enforces unused vars (noUnusedLocals/Parameters).
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // Tests and the dev-only engine harness lean on throwaway promises and
    // deliberate casts against mocks; neither ships to production.
    files: ['**/*.test.{ts,tsx}', 'src/test/**', 'src/dev/**'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-misused-promises': 'off',
    },
  }
);
