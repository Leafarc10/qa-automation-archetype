# QA Automation Archetype – AGENTS (Orchestrator)

## 1. Purpose of this file

This `AGENTS.md` is the entry point for an AI assistant working in this repository. It summarizes the real architecture (Playwright + Cucumber + an optional Oracle-backed database layer) and points to the module-level `AGENTS-*.md` files that go deeper.

Before modifying code, an assistant should:

1. Read this file.
2. Open the module-level `AGENTS-*.md` relevant to the change.
3. Only then open the concrete source files.

For user-facing setup/usage documentation, see `README.md` — this file is for contributors/AI assistants, not end users.

---

## 2. Before modifying code

1. **Identify the correct layer** for the change: UI (Page/Component), Steps, Database (Repository/QueryBuilder), or Config — see the architecture below and the relevant module `AGENTS-*.md` (section 4 of this file).
2. **Reuse before creating**: `BaseUiObject`/`BasePage`/`BaseComponent` for UI, `BaseRepository`/`RepositoryContainer` for data access, `config`/`requireSauceDemoBaseUrl()` for configuration. A new base class or a new way of reading `process.env` is very rarely the right first move.
3. **Respect layer boundaries**: Steps only call `this.pages`/`this.repositories`/`this.testContext`; a Component never navigates (`goto`/`reload`/`waitForUrlContains` are exclusive to `BasePage`); a Repository is the only code that talks to `DatabaseClient` directly.
4. **Keep UI code in its canonical path and Steps out of navigation.** A Page lives in `src/pages/**`, a Component in `src/components/**` — there is no third location. Both rules below are **review-enforced, not machine-enforced**, because the UI guardrails are anchored by path and `BasePage`'s navigation methods are public:
    - a UI-like class outside those two paths escapes A9/A10/A11 and G5's import ban entirely (`CLAUDE.md` §8, F-17);
    - a Step can reach `this.pages.<page>.goto(...)`/`.reload()`/`.waitForUrlContains(...)` with no rule firing (`CLAUDE.md` §4.1 and §8, F-18). Steps call intention-named Page methods (`open()`, `login()`, `expect…()`); the Page consumes the primitives.
5. **Run `npm run quality`** (typecheck + lint + format:check + unit/architecture tests) before considering a change done — see [Code Quality](README.md#code-quality)/[Architecture Guardrails](README.md#architecture-guardrails) in `README.md`.
6. **Never bypass a guardrail** (the `no-restricted-*` ESLint rules in `eslint.config.js`, the invariants in `src/architecture.test.ts`) to make a change compile or pass.
7. **Never edit `eslint.config.js` or `src/architecture.test.ts` to force an otherwise-incorrect change to pass.** If a guardrail rejects a change, fix the change; relaxing the guardrail is a decision for a human maintainer, not a shortcut to take silently.

---

## 3. Real architecture

```text
Feature (features/*.feature)
   ↓
Step Definition (features/steps/*.steps.ts)
   ↓
CustomWorld (support/world.ts)
   ├── pages: Pages                      (src/pageContainer/Pages.ts)
   │      └── Page Object (src/pages/**, extends BasePage)
   │             └── Component (src/components/**, extends BaseComponent, composed not inherited)
   ├── repositories?: RepositoryContainer (src/database/RepositoryContainer.ts)
   │      └── Repository (src/database/repositories/**)
   │             └── BaseRepository → DatabaseClient → OracleDatabaseClient
   └── testContext: Record<string, unknown>
```

- **Features/Steps** (`features/`) — Gherkin scenarios and their step definitions. Steps only call `this.pages`/`this.repositories`/`this.testContext`; no locators, no SQL, no direct Playwright/Oracle imports, no `this.page`/`this.context`/`this.browser`.
- **Pages/Components** (`src/pages/`, `src/components/`) — Page Object Model. `BaseUiObject` (`src/base/BaseUiObject.ts`) owns the action/wait/assertion wrappers shared by both; `BasePage` adds whole-page navigation (`goto`/`reload`/`waitForUrlContains`); `BaseComponent` adds a scoped `root: Locator` and nothing else. Components are composed by Pages as properties, never inherited, and never extend `BasePage`.
- **Support** (`support/`) — `CustomWorld` (browser/context/page/pages/repositories/testContext), Cucumber hooks (`Before`/`After`/`BeforeAll`/`AfterAll`), and `databaseLifecycle.ts` (sole owner of the shared `DatabaseClient`: create in `BeforeAll`, share per-scenario, close in `AfterAll`).
- **Config** (`src/config/index.ts`) — single source of typed configuration, reading `.env`. Nothing else in the codebase should read `process.env` directly (enforced by ESLint).
- **Database** (`src/database/`) — `DatabaseClient` (contract) → `OracleDatabaseClient` (the one real implementation) → `BaseRepository` → concrete repositories, composed by `RepositoryContainer`. `QueryBuilder` builds parameterized `WHERE`/`INSERT`/`UPDATE` with binds and identifier allowlists.
- **Reporting** — native Cucumber formatters configured in `cucumber.js` (`progress`, `json:...`, `html:...`). No custom reporter code exists.

---

## 4. Module AGENTS files

- **Database (Oracle, repositories, QueryBuilder):**
  [src/database/AGENTS-database.md](src/database/AGENTS-database.md)
- **Support (CustomWorld, hooks, DB lifecycle):**
  [support/AGENTS-support.md](support/AGENTS-support.md)

There is no separate AGENTS file for `features/`, `src/pages/`, `src/components/`, `src/base/`, or `src/pageContainer/` — those are small enough today (one canonical UI flow, SauceDemo checkout, and no concrete Component) that the code itself, plus `README.md`'s "UI Testing"/"Architecture" sections, is the reference. Add a module-level AGENTS file if/when that module grows enough to need one.

---

## 5. AI-assisted layer (`.claude/`)

Beyond this file, the repository ships an **AI-assisted automation workflow** with explicit human gates. It is optional, but if you work here through Claude Code it governs how automation is produced:

```text
/qa-automate  →  qa-analyst  →  GATE 1 (human)  →  automation-engineer MODE: PLAN
              →  GATE 2 (human)  →  automation-engineer MODE: IMPLEMENT  →  automation-reviewer
```

- **`qa-analyst`** — requirement → scenarios → `UNKNOWN`/`NEEDS CONFIRMATION`. Read-only, no shell, **no MCP** (deliberately: it decides what *should* happen, not what does).
- **`automation-engineer`** — the only agent with write access. Proposes a plan first (writing nothing), implements only the approved file set, then runs `npm run quality` and the relevant E2E. **Playwright MCP: yes** (10 tools).
- **`automation-reviewer`** — independent, read-only over the repo; re-runs `quality`/E2E itself instead of trusting the Engineer's report; issues `APPROVED` or `CHANGES_REQUESTED`. **Playwright MCP: yes**, a smaller 5-tool subset with no form-input tools.

Gates are human and cannot be inferred from silence; `CHANGES_REQUESTED` and `VALIDATION_FAILED` return control to the user; nothing is auto-approved or auto-corrected; and a green `npm run quality` does not substitute for the review.

Definitions: `.claude/agents/*.md`, `.claude/skills/qa-automate/SKILL.md`, `.claude/settings.json` (permission model), `.mcp.json` (project-scoped `@playwright/mcp`). Operative summary: `CLAUDE.md` §17. Audit and readiness: `docs/history/ai-automation-archetype-final-audit.md`, `docs/ai-automation-archetype-final-readiness.md`.

---

## 6. Typical end-to-end flow (Feature to DB)

1. **Feature** (`features/sauceDemo/checkout.feature`): tagged (`@ui`, `@regression`, `@smoke`), the canonical UI example.
2. **Hooks** (`support/hooks.ts`): `BeforeAll` creates the shared `DatabaseClient` only if `DB_ENABLED=true`; `Before` initializes `CustomWorld` (browser/context/page) and, if a `DatabaseClient` exists, builds `this.repositories`; `After` closes the browser; `AfterAll` closes the `DatabaseClient`.
3. **Steps** (`features/steps/*.steps.ts`): call `this.pages.<page>.<method>()` and, for DB-backed scenarios (none exist yet), would call `this.repositories.<repository>.<method>()`.
4. **Pages/Components**: encapsulate locators (static → `private readonly` field; parameterized → private factory method) and UI actions/assertions.
5. **Database**: repositories build parameterized queries via `QueryBuilder` against `DatabaseClient`.
6. **Reporting**: Cucumber writes `reports/cucumber/cucumber-report.json`/`.html` directly — no post-processing step.

---

## 7. Using this documentation for future changes

1. Identify the area of impact: UI (Page/Component), Steps, or DB (Repository/QueryBuilder).
2. Go to the relevant module AGENTS file first (section 4 of this file).
3. Only then open the concrete files to apply the change, following the patterns already documented.
