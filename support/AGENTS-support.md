# Support Module – AGENTS

## 1. Scope

`support/` holds the cross-cutting test infrastructure shared by every scenario:

- `CustomWorld` — the per-scenario context (`this` inside Steps).
- Cucumber hooks (`Before`, `After`, `BeforeAll`, `AfterAll`).
- Lifecycle of the shared `DatabaseClient` (`databaseLifecycle.ts`).

No business logic lives here. Reporting (JSON/HTML) is **not** generated from this module — Cucumber's own formatters (`cucumber.js`) produce it directly.

---

## 2. Files

- `world.ts` — defines `CustomWorld`: owns `browser`/`context`/`page`, `pages: Pages`, `repositories?: RepositoryContainer`, and `testContext: Record<string, unknown>`.
- `hooks.ts` — registers `BeforeAll`/`Before`/`After`/`AfterAll`.
- `databaseLifecycle.ts` — the single owner of the shared `DatabaseClient`'s lifecycle (create → share → close).

---

## 3. `CustomWorld` — world.ts

- **Class:** `CustomWorld extends World` (`@cucumber/cucumber`).
- **Properties:** `browser`, `context`, `page` (Playwright), `pages: Pages`, `repositories?: RepositoryContainer` (optional — only assigned when a `DatabaseClient` exists, see hooks below), `testContext: TestContext` (`Record<string, unknown>`, a fresh object per scenario, used only when a Step genuinely needs to share a value with a later Step).
- **`init(options?: { storageStatePath?: string; headless?: boolean })`:** launches the configured browser (`config.browser`; defaults from `HEADLESS`), creates a `BrowserContext` (with `storageState` if `storageStatePath` is passed) and a `Page`, and builds `this.pages = new Pages(this.page)`.
- **`close()`:** closes `page`/`context`/`browser` if they exist.
- **Does not know:** Oracle, `oracledb`, database credentials, or any specific Page/Repository — it only knows the `Pages`/`RepositoryContainer` container types.

---

## 4. Hooks — hooks.ts

- **`setDefaultTimeout(config.defaultTimeoutMs)`** — from central config (`DEFAULT_TIMEOUT_MS`), not hardcoded.
- **`BeforeAll`** (once, process-wide): `await initDatabaseClient()` — creates the shared `DatabaseClient` only if `config.db.enabled` is `true`. With `DB_ENABLED=false`, this is a no-op and `oracledb` is never imported.
- **`Before`** (per scenario): `await this.init()`; then, if `getDatabaseClient()` returns a client, `this.repositories = new RepositoryContainer(client)`. With DB disabled, `this.repositories` stays `undefined`.
- **`After`** (per scenario): `await this.close()` — Playwright teardown only. Never touches the database (closing/reopening the shared client per scenario would defeat the point of a shared pool).
- **`AfterAll`** (once): `await closeDatabaseClient()`, wrapped in `try/catch` that logs and does not rethrow (a close failure must never be mistaken for a test failure). This is the **only** thing `AfterAll` does — no reporting logic lives here (see `cucumber.js`).

There is no tag-based branching in `hooks.ts` (no `@auth`, no per-country logic) — hooks are the same for every scenario regardless of tags; tags only filter *which* scenarios run (see `README.md#tags`).

---

## 5. Database lifecycle — databaseLifecycle.ts

Sole owner of the shared `DatabaseClient`:

- `initDatabaseClient()` — no-op if `config.db.enabled` is `false`; otherwise dynamically imports `OracleDatabaseClient` (kept out of the process entirely when DB is disabled) and constructs it from `config.db`.
- `getDatabaseClient()` — returns the same shared instance to every caller (every scenario's `Before`).
- `closeDatabaseClient()` — closes the client and clears the module-level reference; safe to call even if no client was ever created.

---

## 6. Reporting

`cucumber.js` configures Cucumber's built-in formatters (`progress`, `json:reports/cucumber/cucumber-report.json`, `html:reports/cucumber/cucumber-report.html`). There is no custom reporter under `support/` or anywhere else in the codebase, and no Jenkins-specific output.

---

## 7. Extending this module

1. **New global hooks:** add `BeforeStep`/`AfterStep`/etc. in `hooks.ts` if a real, demonstrated need appears (e.g. screenshot-on-failure) — don't add speculatively.
2. **New `CustomWorld` state:** prefer `this.testContext` over adding new typed properties to `CustomWorld` itself, unless the new property is truly cross-cutting infrastructure (like `pages`/`repositories`).
3. **New reporting formats:** add/adjust entries in `cucumber.js`'s `format` array (e.g. `junit:...`); avoid reintroducing custom post-processing in `AfterAll` unless a native formatter genuinely can't cover the need.
