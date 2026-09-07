# QA Automation Archetype

Playwright + TypeScript + Cucumber

A reusable end-to-end testing archetype: Page Object Model, reusable Components, an optional Repository-pattern database layer, generic Cucumber reporting, static quality gates, and a minimal GitHub Actions CI. Built to be cloned as a starting point for a new project, not tied to any specific company or application.

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Running Tests](#running-tests)
- [Tags](#tags)
- [UI Testing](#ui-testing)
- [Database Testing](#database-testing)
- [Reporting](#reporting)
- [Code Quality](#code-quality)
- [Architecture Guardrails](#architecture-guardrails)
- [Continuous Integration](#continuous-integration)
- [Recommended Workflow](#recommended-workflow)
- [Best Practices](#best-practices)
- [Security and Secrets](#security-and-secrets)
- [Current Limitations](#current-limitations)
- [Extending the Archetype](#extending-the-archetype)
- [Troubleshooting](#troubleshooting)
- [Internal Documentation](#internal-documentation)

## Overview

This project is a template for automated end-to-end testing, built around:

- **Cucumber** as the test runner, with Gherkin features.
- **Playwright** as the browser automation library.
- **TypeScript** across the whole codebase.
- An optional **Oracle database layer**, built behind a small `DatabaseClient` contract so a repository never depends on the driver directly.
- **ESLint + Prettier** as static quality gates.
- A minimal **GitHub Actions** workflow.

It ships with one small, real, working example (UI) and one neutral database repository (used only in isolated validations today, not yet wired to a Cucumber scenario) — enough to show the pattern without pretending to be a full test suite for any particular application.

## Tech Stack

Based on `package.json` (no invented versions):

| Tool | Role |
|---|---|
| Node.js | Runtime (see [Getting Started](#getting-started) for the version used in CI). |
| TypeScript | Language for all source code (`src/`, `support/`, `features/steps/`). |
| Playwright (`playwright`, `@playwright/test`) | Browser automation (Chromium/Firefox/WebKit). |
| Cucumber (`@cucumber/cucumber`) | Test runner, Gherkin features, tags, reporting formatters. |
| ts-node | Loads `.ts` files directly for Cucumber (no build step). |
| oracledb | Node driver for the one real `DatabaseClient` implementation, `OracleDatabaseClient`. |
| ESLint (+ `typescript-eslint`) | Static code quality. |
| Prettier | Code formatting. |
| GitHub Actions | CI. |

Oracle is the only real database implementation today — see [Database Testing](#database-testing) for what that does and does not mean.

## Architecture

**UI flow:**

```text
Feature (Gherkin)
   ↓
Step Definition
   ↓
CustomWorld
   ↓
Pages (container)
   ↓
Page Object
   ↓
Component (optional)
   ↓
Playwright
```

**UI base classes:**

```text
BaseUiObject   (src/base/BaseUiObject.ts)
   ├── BasePage       (src/pages/base/BasePage.ts)
   └── BaseComponent  (src/components/base/BaseComponent.ts)
```

- `BaseUiObject` — the actions, waits, getters and assertions shared by every Page and Component (`click`, `fill`, `waitForVisible`, `expectContainsText`, etc.), all operating on a `Locator` received as a parameter. It owns `protected readonly page: Page`.
- `BasePage` — adds the capabilities exclusive to a whole page: `goto`, `reload`, `waitForUrlContains`. Only a Page Object extends this.
- `BaseComponent` — adds `protected readonly root: Locator`, the scope every locator inside the Component is built from. It does **not** get `goto`/`reload`/`waitForUrlContains` — a Component never navigates (enforced by the type system, not just convention).

See [Page Objects](#page-objects) and [Components](#components) for the concrete pattern.

**Database flow (architecture in place; not yet driven by a Cucumber Feature — see [Database Testing](#database-testing)):**

```text
Step
   ↓
CustomWorld
   ↓
RepositoryContainer
   ↓
Repository
   ↓
BaseRepository
   ↓
DatabaseClient
   ↓
OracleDatabaseClient
   ↓
Oracle
```

### Step Definitions

A Step is a translation from Gherkin (business intent) into framework actions — never a technical implementation of the browser or the database. That boundary is enforced automatically (see [Architecture Guardrails](#architecture-guardrails)), not just documented:

A Step **can** use:

- `this.pages` — drive the UI through Page Objects/Components;
- `this.repositories` — drive the database through Repositories;
- `this.testContext` — share free-form state with a later Step in the same scenario.

A Step must **never**:

- access `this.page`, `this.context`, or `this.browser` directly;
- import a Page, a Component, or anything under `src/database/**`;
- import `playwright` or `@playwright/test` directly;
- construct a Page or Repository manually (`new ExamplePage(page)`, `new ExampleRepository(client)`);
- contain locators or run SQL directly.

## Project Structure

```text
features/
  example/            Gherkin feature(s)
  steps/               Step definitions
support/
  world.ts             CustomWorld (browser/context/page, Pages, repositories, testContext)
  hooks.ts             Before/After/BeforeAll/AfterAll
  databaseLifecycle.ts Owns the shared DatabaseClient (create/share/close)
src/
  base/                BaseUiObject (actions/waits/assertions shared by Pages and Components)
  config/              Central, typed configuration (reads .env)
  pages/               Page Objects (BasePage + concrete pages)
  components/          Reusable UI Components (BaseComponent + concrete components)
  pageContainer/        Pages container (composes Page Objects)
  database/
    clients/           DatabaseClient contract + OracleDatabaseClient
    repositories/       BaseRepository + concrete repositories
    builders/           QueryBuilder
    types/               Shared DB types
  architecture.test.ts  Repo-wide architecture invariants (node --test)
reports/
  cucumber/            Generated JSON/HTML reports (git-ignored, .gitkeep only)
.github/workflows/      CI workflow
```

Each of these folders owns one responsibility: `base/` owns shared UI infrastructure, Pages/Components own UI, `database/` owns data access, `support/` owns cross-cutting test infrastructure, `config/` owns configuration. Business logic never lives in `support/` or `database/`. Unit tests (`*.test.ts`, e.g. `src/database/builders/QueryBuilder.test.ts`, `src/config/index.test.ts`) live alongside the code they test; `src/architecture.test.ts` is the one exception, since it checks invariants that span the whole repo rather than a single module.

## Getting Started

### Prerequisites

- **Node.js** — a recent LTS. CI runs Node 24; any reasonably current Node version works locally.
- **npm** (ships with Node).
- **Git**.
- **Playwright browsers** (installed via `npx playwright install`, see below).
- **Oracle** — optional. Only needed if you set `DB_ENABLED=true` (see [Database Testing](#database-testing)). UI testing needs no database at all.

### Installation

```bash
git clone <repository-url>
cd <repository-directory>
npm ci
```

`npm ci` installs exactly what `package-lock.json` specifies — the same install CI uses.

Install Playwright browsers:

```bash
npx playwright install
```

This downloads Chromium, Firefox and WebKit for local use. CI only installs Chromium (see [Continuous Integration](#continuous-integration)) — if you only need to run the default test suite locally, `npx playwright install chromium` is enough.

## Environment Configuration

Configuration is centralized in `src/config/index.ts`, which reads `.env` via `dotenv`. Copy the example file to get started:

```bash
# Windows PowerShell
Copy-Item .env.example .env

# macOS/Linux
cp .env.example .env
```

`.env` is git-ignored — never commit it (see [Security and Secrets](#security-and-secrets)).

| Variable | Default | Required | Description |
|---|---|---|---|
| `BASE_URL` | *(none)* | Only for UI scenarios | Base URL the UI example navigates to. `.env.example` ships `https://playwright.dev`. |
| `HEADLESS` | `true` | No | `true`/`false` — whether Playwright launches the browser headless. |
| `BROWSER` | `chromium` | No | `chromium`, `firefox`, or `webkit`. |
| `DEFAULT_TIMEOUT_MS` | `120000` | No | Default Cucumber step/scenario timeout, in milliseconds. |
| `DB_ENABLED` | `false` | No | `true`/`false` — whether a `DatabaseClient` is created at all. |
| `DB_USER` | *(none)* | Only if `DB_ENABLED=true` | Oracle username. |
| `DB_PASSWORD` | *(none)* | Only if `DB_ENABLED=true` | Oracle password. |
| `DB_CONNECT_STRING` | *(none)* | Only if `DB_ENABLED=true` | Oracle connect string. |
| `ORACLE_CLIENT_LIB_DIR` | *(none)* | No | Path to Oracle Instant Client — only needed for Thick mode (see [Database Testing](#database-testing)). |

With `DB_ENABLED=false` (the default), none of the `DB_*`/`ORACLE_CLIENT_LIB_DIR` variables are needed, and `oracledb` is never even loaded into the process.

`src/config/index.ts` is the single owner of `process.env` in this codebase — enforced automatically (see [Architecture Guardrails](#architecture-guardrails)). Every other module consumes the typed `config` object (or `requireBaseUrl()`) instead of reading environment variables itself. Validation is fail-fast: an invalid value (an unrecognized `HEADLESS`/`BROWSER`, a non-numeric or non-positive `DEFAULT_TIMEOUT_MS`, or `DB_ENABLED=true` missing a required credential) throws immediately when the module is first imported, before any scenario runs — covered by `src/config/index.test.ts`.

## Running Tests

All commands below run through `cucumber-js --config cucumber.js`, with `cucumber.js` as the single source of truth for feature paths, step discovery, and reporting formatters — the npm scripts only add a tag filter.

| Command | Runs |
|---|---|
| `npm test` | Everything except `@db`. The safe default — no database required. |
| `npm run test:ui` | `@ui and not @db` |
| `npm run test:smoke` | `@smoke and not @db` — the smallest representative subset. |
| `npm run test:regression` | `@regression and not @db` |
| `npm run test:db` | `@db` only. **Runs 0 scenarios today** — see [Database Testing](#database-testing) for why, and [Tags](#tags). |

Example:

```bash
DB_ENABLED=false HEADLESS=true BROWSER=chromium BASE_URL=https://playwright.dev npm test
```

(On Windows PowerShell, set each variable with `$env:NAME = "value"` first, or use `.env`.)

## Tags

| Tag | Meaning |
|---|---|
| `@ui` | Exercises the UI layer (Feature → Step → CustomWorld → Pages → Page/Component → Playwright). |
| `@smoke` | The smallest subset that quickly signals whether the application is reachable and one critical path responds. Applied to one representative scenario per feature, not to everything. |
| `@regression` | The broader functional set for a feature. |
| `@db` | Reserved for scenarios that require a real database. No feature uses it yet (see [Database Testing](#database-testing)). |

Current example feature:

```gherkin
@ui @regression
Feature: Example application

  @smoke
  Scenario: The homepage shows the expected heading and call to action
    ...

  Scenario: The main navigation exposes the documentation link
    ...
```

## UI Testing

### The example

`features/example/example.feature` opens `https://playwright.dev` (a free, public, no-login demo site — chosen because it has a real, reusable navigation component to demonstrate the Component pattern) and checks its main heading, a call-to-action link, and its navigation bar.

Flow:

```text
example.feature
   ↓
example.steps.ts   (this.pages.example...)
   ↓
Pages.example       (ExamplePage)
   ↓
ExamplePage          (extends BasePage; composes navigation)
   ↓
ExampleNavigationComponent  (extends BaseComponent; scoped to its root, the <nav>)
```

A step, in full:

```ts
Given('I open the example application', async function (this: CustomWorld) {
  await this.pages.example.open();
});
```

`ExamplePage.open()` reads the URL from config (`requireBaseUrl()`) — never hardcoded in a Feature, Step, Page, or Component.

### Adding a new UI test

1. Add a `.feature` file under `features/` with tags (`@ui` plus `@smoke`/`@regression` as appropriate).
2. Add step definitions under `features/steps/`, calling `this.pages.<yourPage>...` — no locators, no `new SomePage(page)` inside the step.
3. Create a Page Object under `src/pages/<yourArea>/` extending `BasePage`.
4. If part of the page is a reusable, identifiable region (nav bar, modal, sidebar), extract it into a Component under `src/components/<yourArea>/`, extending `BaseComponent` (receiving `page` and its `root` Locator via `super(page, root)`), and compose it as a property of the Page.
5. Register the new Page in `src/pageContainer/Pages.ts`.
6. Run it: `npm test` (or `npm run test:ui`).

### Page Objects

`BasePage` (`src/pages/base/BasePage.ts`) adds whole-page navigation (`goto`, `reload`, `waitForUrlContains`) on top of the actions/waits/assertions it inherits from `BaseUiObject` (`src/base/BaseUiObject.ts` — see [Architecture](#architecture)). A concrete Page extends `BasePage`, declares its locators, and exposes intention-named methods.

**Locators follow one convention** (see `docs/refactor-progress-ia/T07-canonical-locators.md` for the design history), based on whether the locator depends on a runtime value:

- **Static** (no parameter) — a `private readonly` property, built once in the constructor.
- **Parameterized** (depends on a runtime value) — a private factory method that returns a `Locator`, never built inline inside an action/assertion method.

```ts
export class ExamplePage extends BasePage {
  private readonly heading: Locator; // static

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { level: 1 });
  }

  async expectHeadingToContain(text: string) {
    await this.expectContainsText(this.heading, text);
  }

  async expectLinkVisible(linkName: string) {
    await this.waitForVisible(this.linkByName(linkName)); // consumes the factory
  }

  private linkByName(linkName: string): Locator {
    // parameterized: a factory, never inlined into expectLinkVisible above
    return this.page.getByRole('link', { name: linkName, exact: true });
  }
}
```

Prefer semantic locators (`getByRole`, `getByLabel`, `getByText`, `getByTestId`) over CSS/XPath, and avoid `waitForTimeout` (blocked automatically — see [Architecture Guardrails](#architecture-guardrails)); use Playwright's built-in waiting via `expect(...)`.

### Components

Use a Component for a reusable, identifiable region of a page: navigation bars, headers, sidebars, modals, widgets that appear across multiple pages or repeat within one. `BaseComponent` (`src/components/base/BaseComponent.ts`) scopes a Component to its own `root: Locator`, received in the constructor alongside `page`:

```ts
export class ExampleNavigationComponent extends BaseComponent {
  constructor(page: Page) {
    super(page, page.getByRole('navigation', { name: 'Main' }));
  }
}
```

Every locator inside the Component is built from `this.root` — never `this.page` directly — following the same static/parameterized convention as Pages. A Component never gets `goto`/`reload`/`waitForUrlContains`; those stay exclusive to `BasePage` (the type system rejects them, not just a convention).

A Page **composes** its Components as properties — it does not inherit from them:

```text
ExamplePage
  └── navigation: ExampleNavigationComponent
```

Don't create a Component just to split a file; it should represent something a person would point to and call "the nav" or "the modal".

## Database Testing

### Database support is optional

UI tests never require a database. With `DB_ENABLED=false` (the default), no `DatabaseClient` is created and `oracledb` is never loaded.

### Architecture

```text
RepositoryContainer
   ↓
Repository (e.g. ExampleRepository)
   ↓
BaseRepository
   ↓
DatabaseClient        (contract: execute, close)
   ↓
OracleDatabaseClient  (the one real implementation today)
```

`DatabaseClient` is a small, driver-agnostic contract. Repositories and `BaseRepository` depend only on it — never on `OracleDatabaseClient` or `oracledb` directly. The architecture allows a future project to add another `DatabaseClient` implementation (e.g. for Postgres) without changing `BaseRepository`/`RepositoryContainer` — this is **not implemented**, only a property of the design.

`RepositoryContainer.client` is intentionally private — a Step can only reach `this.repositories.<repository>.<method>()`, never `this.repositories.client.execute(...)`.

### Oracle Thin / Thick mode

- No `ORACLE_CLIENT_LIB_DIR` set → Thin mode (default; no Oracle Instant Client needed).
- `ORACLE_CLIENT_LIB_DIR` set → Thick mode.

A process is locked to whichever mode its first real database call used; mixing modes fails with a clear error instead of switching silently.

### ExampleRepository

`src/database/repositories/example/ExampleRepository.ts` is a neutral, read-only repository (`findById`, `findByStatus`) demonstrating the pattern: it extends `BaseRepository`, declares its own allowlist of table/column names, and builds its `WHERE` clause with `QueryBuilder` so values always travel as binds.

**`EXAMPLE_ITEMS` (its table) is not created by this framework.** It is a demonstration contract only — there is no schema, no seed data, and `npm run test:db` does not exercise it against a real Oracle instance out of the box.

### Creating a new Repository

1. Extend `BaseRepository`; receive `DatabaseClient` in the constructor and call `super(client)`.
2. Define domain methods (`findById`, `findActiveByX`, ...) — never a generic `find(table, filters)` or `executeQuery(sql)`.
3. Use `QueryBuilder` with your own table/column allowlists when building `WHERE`/`INSERT`/`UPDATE`.
4. Register the repository as a property of `RepositoryContainer`.

Never call `this.repositories.client.execute(...)` — that field is private on purpose.

### QueryBuilder

- Values always travel as binds — never interpolated into SQL.
- Table/column/`ORDER BY` identifiers must come from an allowlist supplied by the calling repository, never from Scenario/Step data.
- `buildUpdate` refuses to run without at least one filter (no accidental unconditional `UPDATE`).
- Pagination (`buildOraclePagination`) is explicitly Oracle-specific (`ROWNUM`), not a generic multi-engine helper.
- Covered by a permanent unit test suite (`src/database/builders/QueryBuilder.test.ts`), run via `npm run test:unit` — part of `npm run quality`.

## Reporting

Every real run of `cucumber-js --config cucumber.js` generates:

- `reports/cucumber/cucumber-report.json` — machine-readable, for CI/tooling.
- `reports/cucumber/cucumber-report.html` — human-readable.

Both come from Cucumber's own built-in formatters (configured in `cucumber.js`) — there is no custom report generator and no Jenkins-specific reporting. Both files are git-ignored (generated artifacts); only `reports/cucumber/.gitkeep` is versioned.

## Code Quality

| Command | Runs |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint over the project |
| `npm run lint:fix` | ESLint with `--fix` |
| `npm run format` | Prettier, writing changes |
| `npm run format:check` | Prettier, check only (no writes) |
| `npm run quality` | `typecheck` + `lint` + `format:check` + `test:unit`, in that order |

`npm run quality` runs the framework's own unit and architecture tests (`test:unit` — `src/**/*.test.ts`, `support/**/*.test.ts`, and `features/**/*.test.ts`, via `node --test`, no browser, no network) alongside the static checks. Those three globs are exactly the TypeScript source roots `tsconfig.json` recognizes — a `*.test.ts` placed outside them would never run, so an architecture test (see [Architecture Guardrails](#architecture-guardrails)) fails the build if one ever is. `test:unit` currently runs three suites: `QueryBuilder` (`src/database/builders/QueryBuilder.test.ts`), configuration (`src/config/index.test.ts`), and architecture invariants (`src/architecture.test.ts`). `npm run quality` still does **not** run the E2E Cucumber suite: it and `npm test` remain two separate checks (see [Continuous Integration](#continuous-integration)).

## Architecture Guardrails

`npm run quality` doesn't just check style — ESLint (`eslint.config.js`) and the architecture tests (`src/architecture.test.ts`, part of `test:unit`) automatically enforce most of the conventions used throughout this README, so a violation fails the gate instead of relying on a reviewer to catch it.

The table below states each rule's **measured** scope (see `docs/ai-foundation-readiness-final.md`): the "Scope" column names the exact reach of the check, so a rule that holds only for `.ts` files, or only for one import form, says so rather than reading as absolute.

| Rule | Enforced by | Scope |
|---|---|---|
| No Playwright Test runner APIs (`test`, `describe`, `it`, `beforeAll`/`beforeEach`/`afterAll`/`afterEach`) from `@playwright/test` — `expect` and types remain allowed | ESLint (G1) | Static `import` in `.ts`; a dynamic `await import('@playwright/test')` is not caught |
| No `waitForTimeout(...)` | ESLint (G2) | `.ts` files only (`.js` files carry no guardrails) |
| `process.env` only inside `src/config/**` and `*.test.ts` | ESLint (G3) | `.ts` files; covers `process.env.X`, `process.env['X']`, `const env = process.env` and destructuring |
| `oracledb` only referenced from `src/database/clients/OracleDatabaseClient.ts` | ESLint (G4) + architecture test (A6) | A6 also catches `await import('oracledb')` and a **named** `createRequire` import with one assignment hop; a default/namespace `node:module` import still escapes |
| Step Definitions never import Playwright, a Page, a Component, or the database layer, and never touch `this.page`/`this.context`/`this.browser` | ESLint (G5) | Covers `playwright`, `@playwright/test`, `oracledb` and relative `src/pages`/`src/components`/`src/database` paths; `playwright-core` is **not** in the list |
| No SQL in Step Definitions | Structural (G5 + `protected` members of `BaseRepository`) | No dedicated rule: Steps cannot import the database layer, and `execute`/`select`/`insert`/`update`/`delete` are `protected` |
| No `*.spec.ts` file anywhere in the repo | ESLint (G7) + architecture test (A2) | `.ts` only — a `.spec.js` is not caught |
| No `playwright.config.*` file anywhere in the repo | ESLint (G8) + architecture test (A1) | Any extension (A1 is a filesystem check) |
| No npm script invokes `playwright test` | Architecture test (A3) | `package.json` scripts |
| `setWorldConstructor` is registered exactly once, from `support/world.ts` | Architecture test (A4) | Direct calls by that name; an aliased import escapes |
| `CustomWorld` declares only infrastructure state (`browser`, `context`, `page`, `pages`, `repositories`, `testContext`) — no business fields | Architecture test (A5) | Property declarations; getters and parameter properties escape |
| Every `.feature` file carries at least one Cucumber tag | Architecture test (A7) | All `.feature` files |
| Every concrete Page under `src/pages/**` extends `BasePage` | Architecture test (A9) | Every class declared in those files |
| Every concrete Component under `src/components/**` extends `BaseComponent` (never `BasePage`) | Architecture test (A10) | Every class declared in those files |
| Components scope UI access through `this.root`, never `this.page` | Architecture test (A11) | `this.page` accesses inside those classes; a locator built from the constructor's local `page` parameter escapes |
| Every `*.test.ts` lives under a `test:unit` discovery root (`src/**`, `support/**`, `features/**`) so it actually runs | Architecture test (A12) | Whole repo (filesystem) |

Two things this table deliberately does **not** claim:

- **`npm run quality` green is necessary, not sufficient.** The residual gaps named in the "Scope" column above — plus `.ts` files outside `tsconfig.json`'s `include`, which are never typechecked — mean architectural review by a human still matters. `docs/ai-foundation-readiness-final.md` §7 tracks each one.
- **Not every convention in this README is machine-enforced.** The locator conventions (static → `private readonly` field; parameterized → private factory), "keep Steps thin", and "reuse before creating" are review-enforced: they are how this codebase is written, but no rule fails the build if you deviate.

See `eslint.config.js` and `src/architecture.test.ts` for the exact implementation, `docs/refactor-progress-ia/T05-eslint-guardrails.md`/`T06-architecture-tests.md` for the design rationale behind each rule, and `CLAUDE.md` for the operating contract an AI agent follows in this repo.

## Continuous Integration

`.github/workflows/ci.yml` ("QA Automation CI") runs on `push`, `pull_request`, and manual `workflow_dispatch`, on `ubuntu-latest`:

```text
Checkout
   ↓
Setup Node
   ↓
npm ci
   ↓
Install Chromium
   ↓
npm run quality
   ↓
npm test
   ↓
Upload Cucumber reports (cucumber-reports artifact)
```

CI runs with `DB_ENABLED=false` and the default `not @db` test suite — no Oracle credentials, no Oracle Instant Client, nothing to configure. `BASE_URL`/`HEADLESS`/`BROWSER`/`DB_ENABLED` are plain workflow `env` values (all public, non-sensitive) — not GitHub secrets.

Only Chromium is installed in CI, for a fast signal; Firefox/WebKit were validated manually but are not part of the automated pipeline yet.

The `cucumber-reports` artifact upload uses `if: always()` (so reports are preserved even on failure) and `if-no-files-found: ignore` (so a missing report — e.g. because `quality` failed before tests ran — doesn't add a second, unrelated failure).

**Cross-repository note:** if your application code and this automation ever live in separate repositories, this workflow can be extended with `repository_dispatch`/`workflow_dispatch` triggered from the application's own deploy pipeline. That extension is not implemented here.

## Recommended Workflow

1. Create a feature branch.
2. Implement your Feature/Step/Page/Component (or Repository).
3. `npm run quality`
4. `npm test` (and any relevant `test:*` variant)
5. Commit, push.
6. Let CI confirm quality + tests on the pull request.

This repository does not impose a specific branching model (no required `main`/`develop`/`release` convention) — adapt it to your team's own convention.

## Best Practices

- Keep Step Definitions thin: they call `this.pages`/`this.repositories`/`this.testContext`, nothing else.
- Locators live in Pages/Components, never in Steps: a static locator is a `private readonly` field built in the constructor; a parameterized one is a private factory method — never build a locator inline inside an action/assertion.
- Components extend `BaseComponent`, scoped to a `root` Locator — they never get `goto`/`reload`/`waitForUrlContains`; only a Page extends `BasePage` for that.
- No `waitForTimeout` — use Playwright's built-in waiting.
- Prefer semantic locators (`getByRole`, `getByLabel`, `getByText`, `getByTestId`).
- No SQL in Steps; only Repositories build queries.
- Values always travel as binds, never string-interpolated into SQL.
- Configuration and secrets come from environment variables, never hardcoded.
- Treat the database as optional — don't couple UI tests to it.
- Run `npm run quality` before pushing.
- Tag scenarios with intent (`@smoke` for the critical few, `@regression` for the rest, `@db` only when a real database is required).

## Security and Secrets

Never commit:

- `.env` (git-ignored; only `.env.example` — with no real values — is versioned).
- Real `DB_PASSWORD`/`DB_USER`/`DB_CONNECT_STRING` values.
- Tokens or credentials of any kind.
- Generated `storageState` files or other session artifacts.
- Report artifacts (`reports/**`, ignored except `.gitkeep`).

See `.gitignore` for the enforced rules.

## Current Limitations

This is an honest list — none of the following is implemented today:

- Oracle is the only real `DatabaseClient` implementation; no other engine is wired in.
- `ExampleRepository` does not point at a real, existing table — `EXAMPLE_ITEMS` is a demonstration contract only.
- No `@db` Feature exists yet, so `npm run test:db` currently runs 0 scenarios.
- There is no API-testing layer.
- CI installs and runs against Chromium only (Firefox/WebKit are validated manually, not in CI); Cucumber runs sequentially, with no parallelism or automatic retries configured.
- The UI example depends on an external public site, `https://playwright.dev`, being reachable and keeping its current heading/navigation.
- No authentication/session-reuse layer: `CustomWorld.init()` always creates a brand-new, empty `BrowserContext` — no `storageState`, no programmatic login, no session sharing between scenarios.
- No Test Data Management layer — repositories build ad hoc queries; there is no seeding/factory framework.
- No structured logging framework.
- No multi-environment configuration matrix (e.g. named `staging`/`production` profiles) — `src/config/index.ts` reads plain environment variables once, at import time.

## Extending the Archetype

Possible future extensions — **not implemented**, listed to show where this archetype is designed to grow:

- Another `DatabaseClient` implementation (e.g. Postgres), passed into `RepositoryContainer` without touching `BaseRepository`.
- Additional browsers in the CI matrix.
- An API-testing layer, following the same container/composition pattern as `Pages`/`RepositoryContainer`.
- `repository_dispatch`-based cross-repository CI triggering.
- Screenshots/traces on failure.
- Additional tags/scripts for other test subsets.

## Troubleshooting

**`BASE_URL is required before navigating to an application.`**
`BASE_URL` isn't set. Add it to `.env` or export it before running (see [Environment Configuration](#environment-configuration)).

**Browser not installed / Playwright launch error**
Run `npx playwright install` (or `npx playwright install chromium` if you only need the default suite).

**`DB_ENABLED=true` but a config error is thrown at startup**
Set `DB_USER`, `DB_PASSWORD`, and `DB_CONNECT_STRING` — all three are required once `DB_ENABLED=true`.

**`npm run format:check` fails**
Run `npm run format` to apply Prettier's formatting, then re-check. On Windows, this is most often line endings, not real style drift: `.gitattributes` normalizes the repository to LF and Prettier's `endOfLine: "auto"` (`.prettierrc.json`) accepts whatever line ending is already on disk, so `npm run quality` passes regardless of a contributor's local `core.autocrlf` setting.

**`npm run lint` fails**
Try `npm run lint:fix` for auto-fixable issues first, then address whatever remains manually.

## Internal Documentation

Module-level `AGENTS-*.md` files (`src/database/AGENTS-database.md`, `support/AGENTS-support.md`, and the root `AGENTS.md`) document implementation details for contributors and AI coding assistants working in this repository.

`CLAUDE.md` (repo root) is the operating contract for Claude Code and any derived agent: the canonical UI flow, the layer boundaries, which invariants are machine-enforced vs. review-enforced, which infrastructure requires explicit authorization to modify, and the definition of done.
