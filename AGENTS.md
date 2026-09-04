# QA Automation Archetype – AGENTS (Orchestrator)

## 1. Purpose of this file

This `AGENTS.md` is the entry point for an AI assistant working in this repository. It summarizes the real architecture (Playwright + Cucumber + an optional Oracle-backed database layer) and points to the module-level `AGENTS-*.md` files that go deeper.

Before modifying code, an assistant should:

1. Read this file.
2. Open the module-level `AGENTS-*.md` relevant to the change.
3. Only then open the concrete source files.

For user-facing setup/usage documentation, see `README.md` — this file is for contributors/AI assistants, not end users.

---

## 2. Real architecture

```text
Feature (features/*.feature)
   ↓
Step Definition (features/steps/*.steps.ts)
   ↓
CustomWorld (support/world.ts)
   ├── pages: Pages                      (src/pageContainer/Pages.ts)
   │      └── Page Object (src/pages/**)
   │             └── Component (src/components/**, composed, not inherited)
   ├── repositories?: RepositoryContainer (src/database/RepositoryContainer.ts)
   │      └── Repository (src/database/repositories/**)
   │             └── BaseRepository → DatabaseClient → OracleDatabaseClient
   └── testContext: Record<string, unknown>
```

- **Features/Steps** (`features/`) — Gherkin scenarios and their step definitions. Steps only call `this.pages`/`this.repositories`; no locators, no SQL, no direct Playwright/Oracle imports.
- **Pages/Components** (`src/pages/`, `src/components/`) — Page Object Model. `BasePage` (`src/pages/base/BasePage.ts`) provides thin action/assertion wrappers over Playwright. Components are composed by Pages as properties, never inherited.
- **Support** (`support/`) — `CustomWorld` (browser/context/page/pages/repositories/testContext), Cucumber hooks (`Before`/`After`/`BeforeAll`/`AfterAll`), and `databaseLifecycle.ts` (sole owner of the shared `DatabaseClient`: create in `BeforeAll`, share per-scenario, close in `AfterAll`).
- **Config** (`src/config/index.ts`) — single source of typed configuration, reading `.env`. Nothing else in the codebase should read `process.env` directly.
- **Database** (`src/database/`) — `DatabaseClient` (contract) → `OracleDatabaseClient` (the one real implementation) → `BaseRepository` → concrete repositories, composed by `RepositoryContainer`. `QueryBuilder` builds parameterized `WHERE`/`INSERT`/`UPDATE` with binds and identifier allowlists.
- **Reporting** — native Cucumber formatters configured in `cucumber.js` (`progress`, `json:...`, `html:...`). No custom reporter code exists.

---

## 3. Module AGENTS files

- **Database (Oracle, repositories, QueryBuilder):**
  [src/database/AGENTS-database.md](src/database/AGENTS-database.md)
- **Support (CustomWorld, hooks, DB lifecycle):**
  [support/AGENTS-support.md](support/AGENTS-support.md)

There is no separate AGENTS file for `features/`, `src/pages/`, `src/components/`, or `src/pageContainer/` — those are small enough today (one example UI flow) that the code itself, plus `README.md`'s "UI Testing" section, is the reference. Add a module-level AGENTS file if/when that module grows enough to need one.

---

## 4. Typical end-to-end flow (Feature to DB)

1. **Feature** (`features/example/example.feature`): tagged (`@ui`, `@regression`, `@smoke`), no business-specific concepts.
2. **Hooks** (`support/hooks.ts`): `BeforeAll` creates the shared `DatabaseClient` only if `DB_ENABLED=true`; `Before` initializes `CustomWorld` (browser/context/page) and, if a `DatabaseClient` exists, builds `this.repositories`; `After` closes the browser; `AfterAll` closes the `DatabaseClient`.
3. **Steps** (`features/steps/*.steps.ts`): call `this.pages.<page>.<method>()` and, for DB-backed scenarios (none exist yet), would call `this.repositories.<repository>.<method>()`.
4. **Pages/Components**: encapsulate locators and UI actions/assertions.
5. **Database**: repositories build parameterized queries via `QueryBuilder` against `DatabaseClient`.
6. **Reporting**: Cucumber writes `reports/cucumber/cucumber-report.json`/`.html` directly — no post-processing step.

---

## 5. Using this documentation for future changes

1. Identify the area of impact: UI (Page/Component), Steps, or DB (Repository/QueryBuilder).
2. Go to the relevant module AGENTS file first (section 3).
3. Only then open the concrete files to apply the change, following the patterns already documented.
