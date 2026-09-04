import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

// ---------------------------------------------------------------------------
// Shared guardrail building blocks (T05).
//
// ESLint flat config does NOT merge a rule's options across matching config
// objects: when two objects that both match a given file configure the same
// rule id, the LAST matching object wins completely, replacing the entire
// options array from the earlier one. A directory override that needs an
// ADDITIONAL restriction on top of a global one must therefore re-list every
// selector/path it still wants enforced, not just the new one — otherwise it
// silently drops the global protection for that directory. The constants
// below exist so every place that needs to recompose a rule's options reuses
// the exact same base list instead of retyping (and risking drifting) it.
// ---------------------------------------------------------------------------

const PLAYWRIGHT_TEST_RUNNER_NAMES = [
  'test',
  'describe',
  'it',
  'beforeAll',
  'beforeEach',
  'afterAll',
  'afterEach',
];

// G1 — Playwright Test's runner API is prohibited everywhere: Cucumber is the
// only E2E runner. `expect` and type-only imports (Page, Locator, ...) from
// the same package stay legitimate, so only these specific names are banned.
const NO_PLAYWRIGHT_RUNNER_IMPORT = {
  name: '@playwright/test',
  importNames: PLAYWRIGHT_TEST_RUNNER_NAMES,
  message:
    'Playwright Test runner APIs are prohibited. Cucumber is the only E2E runner in this framework — `expect` and type-only imports from @playwright/test remain allowed.',
};

// G4 — oracledb has no type declarations and is a raw driver: only the one
// authorized client implementation may touch it directly.
const NO_ORACLEDB_IMPORT = {
  name: 'oracledb',
  message:
    'oracledb may only be imported from src/database/clients/OracleDatabaseClient.ts, the single authorized driver implementation.',
};

// G2 — waitForTimeout is a fixed, non-deterministic sleep; it produces flaky
// tests instead of waiting for an actual, observable condition.
const WAIT_FOR_TIMEOUT_SELECTOR = {
  selector: "CallExpression[callee.type='MemberExpression'][callee.property.name='waitForTimeout']",
  message:
    'waitForTimeout(...) is prohibited: it produces flaky, non-deterministic waits. Use an expect(...) assertion or a locator-based auto-waiting action instead.',
};

// G5 — Steps must drive the browser only through this.pages (Page Objects),
// never by touching the raw Playwright handles directly.
const NO_THIS_PAGE_SELECTOR = {
  selector: "MemberExpression[object.type='ThisExpression'][property.name='page']",
  message:
    'Step Definitions cannot access this.page directly. Interact through this.pages (Page Objects) instead.',
};
const NO_THIS_CONTEXT_SELECTOR = {
  selector: "MemberExpression[object.type='ThisExpression'][property.name='context']",
  message:
    'Step Definitions cannot access this.context directly. Interact through this.pages (Page Objects) instead.',
};
const NO_THIS_BROWSER_SELECTOR = {
  selector: "MemberExpression[object.type='ThisExpression'][property.name='browser']",
  message:
    'Step Definitions cannot access this.browser directly. Interact through this.pages (Page Objects) instead.',
};

// G3 — process.env has a single owner: src/config/** reads it at import time
// and exposes a validated `config` object; every other consumer (including
// tests, which need to simulate different environments) must go through that.
const NO_PROCESS_ENV = {
  object: 'process',
  property: 'env',
  message:
    'process.env is only allowed inside src/config/** (the single configuration owner) and in *.test.ts files. Import `config` from src/config/index.ts instead.',
};

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
      // T05 architectural guardrails — see the constants above for the "why"
      // behind each one, and docs/refactor-progress-ia/T05-eslint-guardrails.md
      // for the full design rationale.
      'no-restricted-imports': [
        'error',
        { paths: [NO_PLAYWRIGHT_RUNNER_IMPORT, NO_ORACLEDB_IMPORT] },
      ],
      'no-restricted-syntax': ['error', WAIT_FOR_TIMEOUT_SELECTOR],
      'no-restricted-properties': ['error', NO_PROCESS_ENV],
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
      // This is the one authorized driver implementation (G4): re-list the
      // base restrictions minus the oracledb ban, rather than dropping them.
      'no-restricted-imports': ['error', { paths: [NO_PLAYWRIGHT_RUNNER_IMPORT] }],
    },
  },
  {
    // G3 exemption: src/config/** is the single owner of process.env, and
    // *.test.ts files legitimately simulate different environments (see
    // src/config/index.test.ts). Both need process.env untouched by the rule.
    files: ['src/config/**/*.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
  {
    // G5 — Step Definitions are the boundary between Cucumber and the rest of
    // the framework: they may only reach the browser through this.pages, the
    // database through this.repositories, and scenario state through
    // this.testContext. They must never import Playwright, a Page, a
    // Component or the database layer directly, and never touch the raw
    // this.page/this.context/this.browser handles.
    files: ['features/steps/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            // Re-list G4's oracledb ban explicitly: this override replaces
            // the base object's `no-restricted-imports` entirely for files
            // under features/steps/**, so omitting it here would silently
            // re-allow oracledb imports from Steps.
            NO_ORACLEDB_IMPORT,
            {
              name: 'playwright',
              message:
                'Step Definitions cannot import the playwright library directly. Interact through this.pages (Page Objects) instead.',
            },
            {
              name: '@playwright/test',
              message:
                'Step Definitions cannot import @playwright/test directly. Interact through this.pages (Page Objects) instead.',
            },
          ],
          patterns: [
            {
              group: ['**/src/pages/**'],
              message:
                'Step Definitions cannot import Pages directly. Interact through this.pages (Page Objects) instead.',
            },
            {
              group: ['**/src/components/**'],
              message:
                'Step Definitions cannot import Components directly. Interact through this.pages (Page Objects), which compose Components internally.',
            },
            {
              group: ['**/src/database/**'],
              message:
                'Step Definitions cannot import the database layer directly. Interact through this.repositories instead.',
            },
          ],
        },
      ],
      // Re-list WAIT_FOR_TIMEOUT_SELECTOR alongside the Step-specific
      // this.page/this.context/this.browser bans: same reasoning as above —
      // this override replaces the base object's `no-restricted-syntax`
      // entirely, so dropping it here would silently re-allow
      // waitForTimeout(...) inside Steps.
      'no-restricted-syntax': [
        'error',
        WAIT_FOR_TIMEOUT_SELECTOR,
        NO_THIS_PAGE_SELECTOR,
        NO_THIS_CONTEXT_SELECTOR,
        NO_THIS_BROWSER_SELECTOR,
      ],
    },
  },
  {
    // G7 — this framework uses Cucumber as its only E2E runner. A *.spec.ts
    // file is the Playwright Test convention; its mere presence signals a
    // parallel runner creeping in, so the whole file fails unconditionally.
    // T06 will add a filesystem-level check as defense in depth.
    files: ['**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message:
            'Este framework usa Cucumber como único runner E2E.\nLos escenarios deben vivir en features/*.feature + Step Definitions.',
        },
      ],
    },
  },
  {
    // G8 — Playwright is used as a library, never as the test runner. A
    // playwright.config.* file signals the runner is being wired in, so the
    // whole file fails unconditionally. T06 will add a filesystem-level check
    // as defense in depth.
    files: ['**/playwright.config.*'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message: 'Playwright se utiliza como librería.\nCucumber es el único runner E2E.',
        },
      ],
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
