import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'reports/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      'coverage/**',
      'docs/refactor-progress/**',
      '.tmp-*/**',
      '**/*.tsbuildinfo',
    ],
  },
  {
    // Non-type-aware on purpose: `recommendedTypeChecked` was evaluated and
    // discarded — it fires ~24 no-unsafe-* errors, all of them inside
    // OracleDatabaseClient.ts, the one file that deliberately isolates the
    // untyped `oracledb` driver behind an `any` boundary. That isolation is
    // the point of the design, not a bug; type-aware linting can't tell the
    // difference, and `npm run typecheck` (tsc --noEmit) already provides
    // full, real type safety separately.
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Kept strict on purpose: the archetype has exactly one `any` today
      // (an internal, isolated driver-shape alias), disabled file-by-file
      // below with a documented reason.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // OracleDatabaseClient isolates the untyped `oracledb` driver behind an
    // internal `OraclePool = any` alias (see the file's own comment). This is
    // the one legitimate, documented exception to `no-explicit-any` in the
    // whole codebase, not a general escape hatch.
    files: ['src/database/clients/OracleDatabaseClient.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
  },
  eslintConfigPrettier
);
