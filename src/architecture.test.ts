import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * Architecture tests (T06).
 *
 * These protect invariants that ESLint (T05) cannot express robustly, or
 * cannot express at all:
 *
 * - A1/A2/A6 need to inspect the FILESYSTEM (which files exist, by name),
 *   not the syntax of any single file — ESLint only ever sees one file's AST
 *   at a time, scoped by its own `files` glob, and a glob-based override can
 *   still be bypassed by a directory the linter's `ignores` never visits.
 * - A4/A5 need to reason about an actual TypeScript program (a specific
 *   class, by name, across the whole repo, or a call to a specific function
 *   by name wherever it appears) rather than a single, local AST pattern.
 *
 * A8 (process.env has a single owner) is intentionally NOT duplicated here:
 * T05's `no-restricted-properties` guardrail already covers it precisely
 * (`process.env.X` and `process.env['X']`, in every file except
 * `src/config/**` and `*.test.ts`). Its one known gap — `const { env } =
 * process` — was evaluated in docs/ai-foundation-plan.md and deliberately
 * left open: closing it would add real complexity for a pattern nobody uses
 * in this codebase. Architecture tests exist to complement ESLint's blind
 * spots, not to re-implement guardrails ESLint already enforces.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Directories that hold no live framework code: generated artifacts, VCS
// internals, editor state, and (see IGNORED_RELATIVE_PATHS below) one
// specific folder of historical documentation from a prior refactor pass.
const IGNORED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'reports',
  'test-results',
  'playwright-report',
  'blob-report',
  'coverage',
  '.cache',
  '.vscode',
  '.idea',
]);

// docs/refactor-progress/ is superseded, historical documentation (see
// docs/refactor-progress-ia/T01-documentation-cleanup.md) — not live code,
// and already excluded the same way from ESLint and git.
const IGNORED_RELATIVE_PATHS = new Set(['docs/refactor-progress']);

function isIgnoredDirectory(relativePath: string): boolean {
  const posixPath = relativePath.split(path.sep).join('/');
  if (IGNORED_RELATIVE_PATHS.has(posixPath)) return true;

  const name = path.basename(relativePath);
  if (IGNORED_DIR_NAMES.has(name)) return true;
  if (name.startsWith('.tmp-')) return true;

  return false;
}

/** Every file in the repo, as POSIX-style paths relative to REPO_ROOT, skipping generated/VCS/historical directories. */
function walkRepoFiles(): string[] {
  const results: string[] = [];

  function walk(absoluteDir: string, relativeDir: string): void {
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      const absolutePath = path.join(absoluteDir, entry.name);

      if (entry.isDirectory()) {
        if (isIgnoredDirectory(relativePath)) continue;
        walk(absolutePath, relativePath);
      } else if (entry.isFile()) {
        results.push(relativePath);
      }
    }
  }

  walk(REPO_ROOT, '');
  return results;
}

function readSourceFile(relativePath: string): ts.SourceFile {
  const text = fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
  return ts.createSourceFile(relativePath, text, ts.ScriptTarget.ES2022, true);
}

// ---------------------------------------------------------------------------
// A1 — No playwright.config.* anywhere. Playwright is used as a library;
// Cucumber is the only E2E runner. ESLint (G8) already fails any such file on
// content; this is the filesystem-level check that survives even if a future
// change narrowed ESLint's `files`/`ignores` for that override.
// ---------------------------------------------------------------------------

const PLAYWRIGHT_CONFIG_FILENAME_PATTERN = /^playwright\.config\.(c|m)?[jt]s$/i;

describe('architecture — no Playwright Test runner configuration', () => {
  it('has no playwright.config.* file anywhere in the repo', () => {
    const offenders = walkRepoFiles().filter((relativePath) =>
      PLAYWRIGHT_CONFIG_FILENAME_PATTERN.test(path.basename(relativePath))
    );

    assert.deepEqual(
      offenders,
      [],
      `Playwright se usa como librería; Cucumber es el único runner E2E. Found: ${offenders.join(', ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// A2 — No *.spec.ts (the Playwright Test convention) anywhere. *.test.ts
// (the node:test convention used by this framework's own unit tests) must
// remain untouched by this check.
// ---------------------------------------------------------------------------

describe('architecture — no Playwright Test *.spec.ts files', () => {
  it('has no *.spec.ts file anywhere in the repo (*.test.ts remains the unit test convention)', () => {
    const offenders = walkRepoFiles().filter((relativePath) => relativePath.endsWith('.spec.ts'));

    assert.deepEqual(
      offenders,
      [],
      'Este framework usa Cucumber como único runner E2E.\n' +
        'Los escenarios deben vivir en features/*.feature + Step Definitions.\n' +
        `Found: ${offenders.join(', ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// A3 — package.json cannot wire Playwright Test in as a second runner.
// ---------------------------------------------------------------------------

// Matches "playwright test", "npx playwright test", "npx --yes playwright
// test", etc. Requires a word boundary after "test" (whitespace or end of
// string) so it does not misfire on an unrelated future script that merely
// contains the substring "test-something" after the word "playwright".
const PLAYWRIGHT_TEST_RUNNER_COMMAND_PATTERN = /\bplaywright\s+test(\s|$)/i;

describe('architecture — package.json cannot run Playwright Test as a runner', () => {
  it('has no npm script invoking "playwright test"', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')
    ) as { scripts?: Record<string, string> };
    const scripts = packageJson.scripts ?? {};

    const offenders = Object.entries(scripts)
      .filter(([, command]) => PLAYWRIGHT_TEST_RUNNER_COMMAND_PATTERN.test(command))
      .map(([scriptName]) => scriptName);

    assert.deepEqual(
      offenders,
      [],
      `Cucumber es el único runner E2E; ningún script de package.json puede invocar "playwright test". Offending scripts: ${offenders.join(', ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// A4 — setWorldConstructor must be registered exactly once, from
// support/world.ts. A second World would silently change which CustomWorld
// Cucumber actually uses for a given scenario.
// ---------------------------------------------------------------------------

function findSetWorldConstructorCallSites(sourceFile: ts.SourceFile): number {
  let count = 0;

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'setWorldConstructor'
    ) {
      count += 1;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return count;
}

describe('architecture — setWorldConstructor is registered exactly once', () => {
  it('is called only from support/world.ts, and nowhere else', () => {
    const callers: string[] = [];

    for (const relativePath of walkRepoFiles().filter((file) => file.endsWith('.ts'))) {
      const occurrences = findSetWorldConstructorCallSites(readSourceFile(relativePath));
      for (let i = 0; i < occurrences; i += 1) callers.push(relativePath);
    }

    assert.deepEqual(
      callers,
      ['support/world.ts'],
      `setWorldConstructor debe registrarse exactamente una vez, desde support/world.ts. Un segundo World cambiaría en silencio qué CustomWorld usa Cucumber. Found calls in: ${callers.join(', ') || '(none)'}`
    );
  });
});

// ---------------------------------------------------------------------------
// A5 — CustomWorld holds only infrastructure state. Business state belongs in
// testContext (per-scenario, free-form) or in a purpose-built abstraction,
// never as a new field bolted onto the World itself.
// ---------------------------------------------------------------------------

const CUSTOM_WORLD_FILE = 'support/world.ts';
const CUSTOM_WORLD_CLASS_NAME = 'CustomWorld';
const ALLOWED_CUSTOM_WORLD_PROPERTIES = new Set([
  'browser',
  'context',
  'page',
  'pages',
  'repositories',
  'testContext',
]);

/** Property (not method) names declared directly on the named class, via the real TypeScript AST — not a regex over the file's text. */
function getClassPropertyNames(sourceFile: ts.SourceFile, className: string): string[] {
  const propertyNames: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node) && node.name?.text === className) {
      for (const member of node.members) {
        if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
          propertyNames.push(member.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return propertyNames;
}

describe('architecture — CustomWorld holds only infrastructure state', () => {
  it('declares no property outside the infrastructure allowlist', () => {
    const propertyNames = getClassPropertyNames(
      readSourceFile(CUSTOM_WORLD_FILE),
      CUSTOM_WORLD_CLASS_NAME
    );
    const unexpected = propertyNames.filter((name) => !ALLOWED_CUSTOM_WORLD_PROPERTIES.has(name));

    assert.deepEqual(
      unexpected,
      [],
      'No agregues estado de negocio a CustomWorld. Usá testContext para estado por escenario o diseñá una abstracción específica.'
    );
  });
});

// ---------------------------------------------------------------------------
// A6 — oracledb (no type declarations, a raw driver) may only be referenced
// from the one authorized client implementation. ESLint's `no-restricted-imports`
// (T05, G4) already blocks `import ... from 'oracledb'` everywhere else; this
// test additionally catches the actual pattern OracleDatabaseClient.ts itself
// uses — `createRequire` + `require('oracledb')` — which no import-based lint
// rule can see, since it is never expressed as an `import`.
// ---------------------------------------------------------------------------

const ORACLEDB_AUTHORIZED_FILE = 'src/database/clients/OracleDatabaseClient.ts';

function referencesOracledb(sourceFile: ts.SourceFile): boolean {
  let found = false;

  function visit(node: ts.Node): void {
    if (found) return;

    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === 'oracledb'
    ) {
      found = true;
      return;
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === 'oracledb'
    ) {
      found = true;
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

describe('architecture — oracledb is only referenced from the authorized driver client', () => {
  it('is not imported or required from any other .ts file', () => {
    const offenders = walkRepoFiles()
      .filter(
        (relativePath) => relativePath.endsWith('.ts') && relativePath !== ORACLEDB_AUTHORIZED_FILE
      )
      .filter((relativePath) => referencesOracledb(readSourceFile(relativePath)));

    assert.deepEqual(
      offenders,
      [],
      `oracledb solo puede referenciarse (import o require) desde ${ORACLEDB_AUTHORIZED_FILE}. Found in: ${offenders.join(', ')}`
    );
  });

  it('the authorized file still references oracledb (the exception is not stale)', () => {
    assert.equal(referencesOracledb(readSourceFile(ORACLEDB_AUTHORIZED_FILE)), true);
  });
});

// ---------------------------------------------------------------------------
// A7 — every Feature file carries at least one Gherkin tag. Not a full
// taxonomy check (which tags, on which node) — only that a new Feature can
// never land completely untagged.
// ---------------------------------------------------------------------------

const FEATURE_TAG_LINE_PATTERN = /^\s*@[A-Za-z0-9_-]+/m;

describe('architecture — every Feature file has at least one tag', () => {
  it('has no untagged .feature file', () => {
    const featureFiles = walkRepoFiles().filter(
      (relativePath) => relativePath.startsWith('features/') && relativePath.endsWith('.feature')
    );

    assert.ok(
      featureFiles.length > 0,
      'Expected at least one .feature file to exist under features/.'
    );

    const offenders = featureFiles.filter(
      (relativePath) =>
        !FEATURE_TAG_LINE_PATTERN.test(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'))
    );

    assert.deepEqual(
      offenders,
      [],
      `Every .feature file must carry at least one Cucumber tag (e.g. @ui, @smoke, @regression). Untagged: ${offenders.join(', ')}`
    );
  });
});

// ---------------------------------------------------------------------------
// A9/A10 — UI hierarchy invariants (T10.1, closing finding F-01 of
// docs/ai-foundation-final-audit.md).
//
// Before this test existed, nothing stopped a new Component from extending
// BasePage instead of BaseComponent — regaining goto/reload/waitForUrlContains,
// the exact anti-pattern T08 removed from ExampleNavigationComponent — with
// npm run quality staying green throughout. This needs a whole-program,
// name-based check (which class does a given class extend, wherever it's
// declared in the repo) that a single-file ESLint rule cannot express; it
// reuses the same TypeScript AST technique as A4/A5/A6 above.
// ---------------------------------------------------------------------------

const PAGES_BASE_FILE = 'src/pages/base/BasePage.ts';
const REQUIRED_PAGE_BASE_CLASS = 'BasePage';

const COMPONENTS_BASE_FILE = 'src/components/base/BaseComponent.ts';
const REQUIRED_COMPONENT_BASE_CLASS = 'BaseComponent';

type ClassHeritage = { name: string; extendsName: string | undefined };

/** Every class declared directly in the file, with the identifier its `extends` clause names — `undefined` if the class extends nothing, or extends something other than a simple identifier. */
function getClassHeritages(sourceFile: ts.SourceFile): ClassHeritage[] {
  const heritages: ClassHeritage[] = [];

  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node) && node.name) {
      const extendsClause = node.heritageClauses?.find(
        (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword
      );
      const extendsExpression = extendsClause?.types[0]?.expression;
      const extendsName =
        extendsExpression && ts.isIdentifier(extendsExpression)
          ? extendsExpression.text
          : undefined;

      heritages.push({ name: node.name.text, extendsName });
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return heritages;
}

function findHierarchyOffenders(relativePaths: string[], requiredBaseClass: string): string[] {
  const offenders: string[] = [];

  for (const relativePath of relativePaths) {
    for (const { name, extendsName } of getClassHeritages(readSourceFile(relativePath))) {
      if (extendsName !== requiredBaseClass) {
        offenders.push(`${relativePath} (class ${name} extends ${extendsName ?? 'nothing'})`);
      }
    }
  }

  return offenders;
}

describe('architecture — Page Objects extend BasePage', () => {
  it('every concrete class under src/pages/** extends BasePage', () => {
    const files = walkRepoFiles().filter(
      (relativePath) =>
        relativePath.startsWith('src/pages/') &&
        relativePath.endsWith('.ts') &&
        !relativePath.endsWith('.test.ts') &&
        relativePath !== PAGES_BASE_FILE
    );

    const offenders = findHierarchyOffenders(files, REQUIRED_PAGE_BASE_CLASS);

    assert.deepEqual(
      offenders,
      [],
      `Every concrete Page Object must extend BasePage — never BaseComponent, nothing, or any other class. Offenders: ${offenders.join('; ') || '(none)'}`
    );
  });
});

describe('architecture — Components extend BaseComponent', () => {
  it('every concrete class under src/components/** extends BaseComponent', () => {
    const files = walkRepoFiles().filter(
      (relativePath) =>
        relativePath.startsWith('src/components/') &&
        relativePath.endsWith('.ts') &&
        !relativePath.endsWith('.test.ts') &&
        relativePath !== COMPONENTS_BASE_FILE
    );

    const offenders = findHierarchyOffenders(files, REQUIRED_COMPONENT_BASE_CLASS);

    assert.deepEqual(
      offenders,
      [],
      `Components must extend BaseComponent. Components must never extend BasePage. Offenders: ${offenders.join('; ') || '(none)'}`
    );
  });
});
