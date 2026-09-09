# AI Foundation Final Audit

**Date:** 2026-09-04
**Branch:** `feature/ai-foundation`
**Baseline commit:** `6b69930` (docs: finalize AI foundation documentation)
**Auditor role:** Senior SDET / architecture + security + DX reviewer, adversarial pre-flight before granting AI agents write access to this repository.

---

## 1. Executive Summary

This audit tried to break the AI Foundation, not to confirm it. Fourteen distinct bypass hypotheses were tested with real, throwaway fixtures against the real toolchain (`npm run quality`, `npx eslint`, `npx tsc --noEmit`, `node --test`), plus one read-only AST probe for an invariant that cannot be tested without modifying production code.

**The core invariants hold.** The things that would genuinely wreck this framework — a second E2E runner wired into npm scripts or a `playwright.config.*`, Steps reaching into Playwright/Pages/the database through ordinary imports, `process.env` escaping `src/config/`, secrets in the repo or in CI, SQL built without binds — all survived adversarial pressure. The database security model (binds for values, caller-supplied allowlists for identifiers, no unconditional `UPDATE`) is well designed and genuinely test-covered. `npm run quality` is real: 57 tests, exit 0, and it does not run Cucumber E2E.

**What did not hold is narrower but matters specifically for AI code generation.** Three findings stand out: (1) the two UI architectural patterns that T07 and T08 existed to establish have *zero* automated enforcement — a Component can extend `BasePage`, navigate, and inline unscoped locators, with `npm run quality` fully green; (2) `oracledb` driver isolation is bypassable via `await import('oracledb')` or by renaming the `createRequire` binding, defeating both ESLint and architecture test A6 — and the dynamic-import form is exactly the pattern `support/databaseLifecycle.ts` already models; (3) a unit test placed outside `src/` never executes, yet `test:unit` reports all-pass — and the README actively instructs contributors to colocate tests with the code they test, which for anything under `support/` or `features/` produces a silently dead test.

Separately, the README's "Architecture Guardrails" table — the single document an AI agent is most likely to trust when reasoning about what is safe — **overstates enforcement in five of its eleven rows**.

**No BLOCKER-class defect was found.** Nothing lets an agent exfiltrate a secret, silently ship a parallel runner through the project's own scripts or CI, or claim a capability the documentation says exists when it does not. The gaps are real but all require leaving the documented happy path, with one exception (F-04) that is reachable *by following* the documented convention.

**Verdict: CONDITIONALLY READY.** See §17.

---

## 2. Final Architecture

Verified against the code, not the documentation.

### 2.1. UI hierarchy

```text
BaseUiObject            src/base/BaseUiObject.ts
   ├── BasePage         src/pages/base/BasePage.ts
   └── BaseComponent    src/components/base/BaseComponent.ts
```

| Claim | Verified | Evidence |
|---|---|---|
| `BaseUiObject` holds only shared capabilities | ✅ | 17 methods, every one takes a `Locator` parameter; owns `protected readonly page: Page`; no navigation |
| `BasePage` adds page-level capabilities | ✅ | Exactly 3: `goto`, `reload`, `waitForUrlContains` — the only members touching `this.page` directly |
| `BaseComponent` cannot navigate | ✅ (type level) | Declares only `protected readonly root: Locator` + constructor; `goto` is not in its prototype chain |
| Components use `root` | ✅ | `ExampleNavigationComponent` builds both locators from `this.root` |
| `ExamplePage extends BasePage` | ✅ | `src/pages/example/ExamplePage.ts:11` |
| `ExampleNavigationComponent extends BaseComponent` | ✅ | `src/components/example/ExampleNavigationComponent.ts:8` |
| No duplicated wrappers | ✅ | The 17 shared methods exist in exactly one file |
| No import cycles | ✅ | `BaseUiObject` imports nothing from `pages/`/`components/`; `BaseComponent` never imports from `src/pages/**` |
| Locators follow the T07 pattern | ✅ (in existing code) | Static → `private readonly` in constructor (`heading`, `root`); parameterized → private factory (`linkByName`) |

**Important nuance, not currently documented.** T08's negative validation proved that a class extending `BaseComponent` cannot call `goto()`. That guarantee is real, but it is narrower than it reads: it constrains *subclasses of `BaseComponent`*, not *Components*. Nothing prevents a new Component from simply extending `BasePage` instead and regaining full navigation — see F-01.

### 2.2. Runtime chain

```text
Feature → Step → CustomWorld → Pages → Page Object → Component → Playwright
                      └─────→ RepositoryContainer → Repository → BaseRepository/QueryBuilder → DatabaseClient → OracleDatabaseClient
```

`CustomWorld` (`support/world.ts`) declares exactly the six allowlisted infrastructure properties, creates a fresh `BrowserContext` per scenario with no `storageState`, and knows nothing about Oracle or any concrete Page/Repository. `RepositoryContainer.client` is genuinely `private`.

---

## 3. Quality Gate

`npm run quality` = `typecheck && lint && format:check && test:unit`, in that order (`package.json:16`). Confirmed by execution, not by reading.

| Stage | Command | Baseline result |
|---|---|---|
| typecheck | `tsc --noEmit` | clean |
| lint | `eslint .` | clean |
| format:check | `prettier . --check` | clean |
| test:unit | `node --test "src/**/*.test.ts"` | 57 tests / 19 suites / 57 pass / 0 fail |

`test:unit` composition (verified by file discovery, not assumed):

- `src/database/builders/QueryBuilder.test.ts`
- `src/config/index.test.ts`
- `src/architecture.test.ts`

These are the only three `*.test.ts` files in the repository.

**`npm run quality` does not run Cucumber E2E** — confirmed: no `cucumber-js` invocation anywhere in the chain. `npm test` remains the separate E2E entry point.

### 3.1. Coverage boundaries of the gate (audited)

The gate is built from four independent allowlists. Anything outside all four is unchecked:

| Mechanism | Scope | Outside the scope |
|---|---|---|
| `tsconfig.json` `include` | `src/**/*.ts`, `features/**/*.ts`, `support/**/*.ts` | any other `.ts` path → never typechecked (F-10) |
| ESLint guardrail block | `files: ['**/*.ts']` | every `.js` file → zero guardrails (F-03) |
| `test:unit` glob | `src/**/*.test.ts` | tests elsewhere → never executed (F-04) |
| Architecture walker | whole repo, minus `node_modules`, `.git`, generated dirs, `docs/refactor-progress`, `.tmp-*` | `.tmp-*` directories (F-14) |

---

## 4. Guardrails Verification

Measured behaviour of every rule the README claims. "Claimed" = the README "Architecture Guardrails" table; "Actual" = observed.

| # | Rule as documented | Actual measured behaviour |
|---|---|---|
| 1 | No Playwright Test runner APIs from `@playwright/test` | Holds for named, aliased and namespace imports. **Does not hold for `await import('@playwright/test')`** (F-11) |
| 2 | No `waitForTimeout(...)` **anywhere** | Holds in `.ts`. **Does not hold in `.js`** (F-03) |
| 3 | `process.env` only in `src/config/**` and `*.test.ts` | Holds for `.X`, `['X']`, `const env = process.env`, **and `const { env } = process`**. Escapes only via aliasing `process` itself (F-13) |
| 4 | `oracledb` only from `OracleDatabaseClient.ts` | Holds for `import`. **Fails for `await import('oracledb')` and for `createRequire` bound to any name other than `require`** (F-02) |
| 5 | Steps never import Playwright / Pages / Components / DB | Holds for `playwright`, `@playwright/test`, and relative Page/Component/DB paths. **Does not hold for `playwright-core`** (F-06) |
| 6 | No `*.spec.ts` anywhere | Holds (ESLint + A2). `.spec.js` is out of scope of both (F-09) |
| 7 | No `playwright.config.*` anywhere | Holds — `.ts`, `.js`, `.mjs`, `.cjs` all caught by A1 and ESLint G8 |
| 8 | No npm script invokes `playwright test` | Holds (A3) |
| 9 | `setWorldConstructor` registered exactly once | **Fails under import aliasing** (F-07) |
| 10 | `CustomWorld` declares only infrastructure state | Holds for normal properties. **Fails for getters, constructor parameter properties, computed names, class expressions** (F-08) |
| 11 | Every `.feature` carries a tag | Holds (A7) |

**Five of eleven rows are broader in the README than in reality** (rows 1, 2, 4, 5, 9, 10 — six if row 10 is counted strictly). This is F-05, and it is the finding with the most direct AI impact, because that table is written precisely for a reader deciding what is safe to generate.

---

## 5. Adversarial Bypass Tests

Every fixture below was created, executed against the real toolchain, and deleted. Final `git status` is clean and no `__audit_t10*` artifact remains.

### 5.1. Playwright Test runner

| Fixture | Code | Result |
|---|---|---|
| F1 | `import { test } from '@playwright/test'` | **BLOCKED** — `no-restricted-imports` |
| F2 | `import { test as pwTest } from '@playwright/test'` | **BLOCKED** — rule matches the imported name, not the local alias |
| F3 | `import * as pw from '@playwright/test'; pw.test(...)` | **BLOCKED** — ESLint reports the namespace import explicitly |
| F4 | `const pw = await import('@playwright/test')` | **BYPASS** — eslint exit 0, tsc exit 0 |

F4 is a genuine lint gap but a weak exploit: `pw.test()` called outside a Playwright Test worker throws at runtime, and actually running a parallel suite still needs a config (blocked by A1) or an npm script (blocked by A3).

### 5.2. Playwright from Step Definitions

| Fixture | Code | Result |
|---|---|---|
| F5b | `import { chromium } from 'playwright'` | **BLOCKED** |
| F6 | `import { ExamplePage } from '../../src/pages/...'` | **BLOCKED** — relative paths do match the `**/src/pages/**` pattern |
| F6b | `import { QueryBuilder } from '../../src/database/...'` | **BLOCKED** |
| F5 | `import { chromium } from 'playwright-core'` | **BYPASS** — eslint exit 0 |

`playwright-core` is present in `node_modules` as a transitive dependency of `playwright`, resolves at runtime (`require.resolve` succeeds), and type-resolves under `tsc`. A Step can therefore launch its own browser and bypass `CustomWorld`/`Pages` entirely.

### 5.3. `process.env`

| Fixture | Code | Result |
|---|---|---|
| G1 | `process.env.SECRET_TOKEN` | **BLOCKED** |
| G2 | `process.env['SECRET_TOKEN']` | **BLOCKED** |
| G3 | `const env = process.env; env.X` | **BLOCKED** |
| G4 | `const { env } = process; env.X` | **BLOCKED** |
| G5 | `const p = process; p.env.X` | **BYPASS** (artificial) |

G4 is notable: `src/architecture.test.ts` (lines 22–29) documents this exact pattern as *"its one known gap … deliberately left open"*. Measurement contradicts the comment — ESLint's `no-restricted-properties` does catch destructuring. See F-12.

### 5.4. `oracledb`

| Fixture | Code | ESLint | Architecture test A6 |
|---|---|---|---|
| H1 | `import oracledb from 'oracledb'` | **BLOCKED** | **BLOCKED** |
| H2 | `const req = createRequire(...); req('oracledb')` | clean | **NOT DETECTED** |
| H3 | `await import('oracledb')` | clean | **NOT DETECTED** |

A6's stated purpose is to catch the `createRequire` + `require('oracledb')` form that no import-based lint rule can see. It does so only when the local binding is literally named `require` — the name `OracleDatabaseClient.ts` happens to use. Renaming it to `req` defeats the only check protecting driver isolation. H3 defeats it too, and is the more plausible of the two: `support/databaseLifecycle.ts:17` already establishes `await import(...)` as this repository's idiom for lazily loading the Oracle client.

### 5.5. Parallel runner artefacts

| Fixture | Result |
|---|---|
| `src/x.spec.ts` | **BLOCKED** — ESLint G7 + architecture A2 |
| `playwright.config.mjs` (canonical name) | **BLOCKED** — ESLint G8 + architecture A1 |
| `src/x.spec.js` | **BYPASS** — G7 is scoped to `**/*.spec.ts`; A2 tests `.endsWith('.spec.ts')` |

The `.spec.js` file cannot be executed through any project script (A3 holds, CI never invokes `playwright test`); it would require a human running `npx playwright test` by hand.

### 5.6. `setWorldConstructor`

```ts
import { setWorldConstructor as registerWorld, World } from '@cucumber/cucumber';
class ShadowWorld extends World {}
registerWorld(ShadowWorld);
```

**BYPASS.** A4 matches `ts.isIdentifier(node.expression) && node.expression.text === 'setWorldConstructor'`; under aliasing the callee identifier is `registerWorld`. ESLint reports nothing. A second World registered from `features/steps/**` (which Cucumber auto-loads) would silently change which World scenarios receive.

### 5.7. `CustomWorld` property shapes

`support/world.ts` is production code and was not modified. A5's exact `getClassPropertyNames` implementation was replicated in a read-only scratch script and fed synthetic variants:

| Variant | A5 result |
|---|---|
| `invoiceNumber!: string` (normal property) | **DETECTED** |
| `get invoiceNumber()` / `set invoiceNumber()` | **NOT DETECTED** |
| `constructor(public invoiceNumber: string)` | **NOT DETECTED** |
| `['invoiceNumber']!: string` (computed name) | **NOT DETECTED** |
| `export const CustomWorld = class CustomWorld extends World {...}` | **NOT DETECTED** (class expression is invisible to the walker) |

### 5.8. Quality-gate coverage holes — "wrong code, green gate"

The decisive test. All three fixtures were `prettier --write`-formatted first, so the gate could only fail on a real guardrail rather than on formatting:

| Fixture | Content | Outcome |
|---|---|---|
| K1 | `support/x.js`: `req('oracledb')` + `process.env.DB_PASSWORD` + `page.waitForTimeout(5000)` | eslint exit 0 |
| K2 | `support/x.test.ts`: `assert.equal(1, 2)` | `test:unit` reports **57 pass / 0 fail** — the failing test never ran |
| K3 | `scripts/x.ts`: `const n: number = 'not a number'` | `tsc --noEmit` clean — file is outside `include` |

**`npm run quality` → exit 0** with all three present simultaneously.

A second run with only the two UI anti-patterns present (a Component extending `BasePage` that calls `goto()`/`reload()`, and a Component ignoring `root` to build inline locators off `this.page`) also returned **exit 0, 57/57 pass**.

Mitigation found for K1: `allowJs` is unset, so a `.ts` file importing that `.js` helper fails typecheck with TS7016, and neither `cucumber.js` (`.ts`-only import globs) nor `test:unit` (`.ts`-only glob) loads `.js`. The `.js` blindness is therefore a defence-in-depth gap rather than a live execution path.

---

## 6. Unit / Architecture Test Coverage

**57 tests across 19 suites, all passing, no browser and no network.**

- **`QueryBuilder.test.ts`** — the security model is what is actually tested, not just the happy path: binds never interpolated, identifier allowlist rejection (including callers who bypass TypeScript), closed operator set validated at runtime, `IN []` rejected, `BETWEEN` arity enforced, `buildUpdate` refusing empty filters, pagination limit integer/positive validation. This is the strongest test asset in the repository.
- **`index.test.ts` (config)** — fail-fast validation with real `process.env` isolation and restoration per case.
- **`architecture.test.ts`** — 8 invariants (A1–A7, with A6 split in two). Well-conceived: it deliberately covers what ESLint structurally cannot (filesystem-level existence, whole-program AST). Its weaknesses are the specific matcher shapes documented in §5.4/§5.6/§5.7, not the approach.

**Coverage gap:** there is no test asserting that the *UI hierarchy itself* is respected (F-01) — which is the invariant most exposed to AI-generated code.

---

## 7. Cucumber / E2E

Baseline run, explicit environment:

```bash
BASE_URL=https://playwright.dev HEADLESS=true BROWSER=chromium DB_ENABLED=false npm test
→ 2 scenarios (2 passed), 6 steps (6 passed)
```

| Check | Result |
|---|---|
| Cucumber is the only E2E runner | ✅ every `test*` script is `cucumber-js`; A3 blocks `playwright test` |
| Playwright used as a library | ✅ `playwright` in `world.ts` for browser launch; `@playwright/test` only for `expect` + types |
| Steps are thin | ✅ all 5 steps are a single delegating call to `this.pages.*` |
| Steps use `this.pages` / `this.repositories` / `this.testContext` | ✅ |
| Steps never touch `this.page`/`this.context`/`this.browser` | ✅ enforced by ESLint selectors |
| Features carry tags | ✅ `@ui @regression` + `@smoke` (A7 enforces at least one) |
| `setWorldConstructor` unique | ✅ in current code (bypassable per F-07) |
| `cucumber.js` is the single source of truth | ✅ scripts add only `--tags` |

---

## 8. Configuration

| Check | Result |
|---|---|
| `src/config/index.ts` is the only legitimate `process.env` owner | ✅ code + ESLint enforcement |
| Fail-fast validation | ✅ throws at import time: boolean parsing, positive-integer timeout, browser allowlist, DB credential completeness |
| Tests hermetic | ✅ `index.test.ts` saves/restores `process.env` per case |
| Secrets absent from error messages | ✅ every `throw` names the *variable*, never the value — `DB_ENABLED=true requires: DB_USER, DB_PASSWORD` lists names only |
| Config genuinely consumed | ✅ `world.ts` (browser/headless), `hooks.ts` (timeout), `databaseLifecycle.ts` (db), `ExamplePage.open()` (`requireBaseUrl()`) |
| Documentation matches code | ✅ all nine variables, defaults and required-conditions in the README match the implementation |
| `.env` hygiene | ✅ `.env`/`.env.*` git-ignored, not tracked; `.env.example` ships empty credential placeholders |

One observation, INFO-level: `OracleDatabaseClient` wraps driver failures as `new DatabaseError(msg, err)`, propagating the raw driver error as `cause`. Framework code interpolates no credential, but an Oracle driver error surfaced in a log could carry connection-descriptor detail. Normal for a test framework; noted, not a finding requiring action.

---

## 9. Database

| Check | Result |
|---|---|
| Values travel as binds | ✅ `buildWhere`/`buildInsert`/`buildUpdate` never interpolate a value |
| Identifiers from caller allowlists | ✅ `assertAllowedIdentifier` requires both a strict identifier shape and allowlist membership; always rejects, never sanitizes |
| `UPDATE` protected | ✅ empty `data` rejected; empty `filters` rejected — no unconditional `UPDATE` |
| Operators validated at runtime | ✅ closed `ALLOWED_OPERATORS` list, not type-only |
| Pagination safe | ✅ `limit` interpolated only after `Number.isInteger && > 0` |
| Driver isolated | ⚠️ by design yes — `oracledb` referenced only in `OracleDatabaseClient.ts`, behind an unexported `any` alias; but the *enforcement* of that isolation is bypassable (F-02) |
| No SQL outside repositories/builders | ✅ verified — no SQL string anywhere in `features/**`, `support/**`, `src/pages/**`, `src/components/**` |
| Steps cannot reach `DatabaseClient` | ✅ `BaseRepository` helpers are `protected`; `RepositoryContainer.client` is `private`; ESLint blocks `src/database/**` imports from Steps |

The DB layer is the most rigorously constructed part of this framework. Its one weakness is not the design but the enforcement of the driver boundary.

---

## 10. CI

`.github/workflows/ci.yml`:

| Check | Result |
|---|---|
| Node version | ✅ `node-version: '24'` matches `engines: >=24.12` (local: v24.13.1) |
| Deterministic install | ✅ `npm ci` |
| Browser provisioning | ✅ `npx playwright install --with-deps chromium` |
| Quality gate | ✅ `npm run quality` |
| E2E | ✅ `npm test` (excludes `@db`) |
| No duplicated unit tests | ✅ `test:unit` runs once, inside `quality`; not repeated as its own step |
| Artifacts | ✅ `if: always()` + `if-no-files-found: ignore` — reports preserved on failure, no spurious second failure |
| Commands exist | ✅ every invoked script is defined in `package.json` |
| No hardcoded secrets | ✅ only public, non-sensitive values (`BASE_URL`, `HEADLESS`, `BROWSER`, `DB_ENABLED=false`); no GitHub secret referenced or needed |
| Permissions | ✅ `contents: read` (least privilege) |
| Timeout | ✅ `timeout-minutes: 15` |

CI is correct and matches the documentation. No finding.

---

## 11. Documentation Consistency

Checked against code, following T09/T09.1.

| Check | Result |
|---|---|
| All documented paths exist | ✅ 21/21 verified |
| All documented npm scripts exist | ✅ 12/12 verified |
| UI architecture description current | ✅ `BaseUiObject`/`BasePage`/`BaseComponent` correctly described in README + `AGENTS.md` |
| Locator convention documented | ✅ matches the code |
| Step rules documented | ✅ Can/Cannot lists match ESLint G5 exactly |
| Capabilities documented but non-existent | ✅ none found |
| Non-existent capabilities explicitly marked | ✅ auth/`storageState`, Test Data Management, API layer, structured logging, environment matrix, parallelism/retries, screenshots/traces all listed as absent |
| **Restrictions documented but not enforceable** | ❌ **five rows of the guardrail table overstate enforcement (F-05)** |
| Trazability links render | ✅ normalized to standard Markdown in T09.1 |

The documentation is accurate about *what exists*. Its one systematic inaccuracy is about *what is automatically prevented* — precisely the axis an AI agent relies on.

---

## 12. Developer Experience

### A) QA with basic/intermediate programming knowledge

Creating a normal UI test is genuinely simple, and the README's "Adding a new UI test" is a correct six-step happy path. The QA touches: a `.feature` file, a `*.steps.ts` file, one Page Object, optionally one Component, and one line in `Pages.ts`. They should never touch `src/base/**`, `support/**`, `src/database/**`, `eslint.config.js`, `src/architecture.test.ts`, or `cucumber.js`. The main friction is that guardrail messages tell you *what* is forbidden and *what to use instead* ("Interact through this.pages (Page Objects) instead") but not *where* to put the code — acceptable, since the README covers it.

### B) QA Automation Engineer

Well served. The abstractions are few and each earns its place: `BaseUiObject` (shared UI verbs), `BasePage` (navigation), `BaseComponent` (scoping), `Pages` (composition root), `BaseRepository`/`QueryBuilder` (SQL safety), `config` (typed environment). There is no speculative indirection — `BaseComponent` deliberately declares no methods of its own. Nothing here is abstraction for its own sake.

### C) SDET maintainer

Good. The guardrail layer is documented with rationale, the architecture tests explain *why* each invariant cannot be an ESLint rule, and `docs/refactor-progress-ia/` gives decision history. The maintenance risk this audit surfaces is that several matchers are shape-specific (a single identifier name, `PropertyDeclaration` only, `.spec.ts` only) and will silently stop covering what their comments claim as the codebase evolves.

### D) AI agent

This is where the gaps concentrate. An agent gets a clear happy path, an unambiguous single example of every pattern, and a machine-checkable gate — all genuinely valuable. But it will also read the README's guardrail table as ground truth and conclude that the UI hierarchy, driver isolation and `waitForTimeout` prohibition are machine-enforced. For UI structure they are not enforced at all (F-01); for driver isolation they are partially enforced (F-02); for `waitForTimeout` they are enforced only in `.ts` (F-03). An agent that writes a unit test for a `support/` module in the documented colocated position gets a green gate for a test that never ran (F-04).

### Summary answers

- **Is creating a normal UI test simple?** Yes.
- **Files a QA normally touches:** `features/**`, one Page, optionally one Component, `src/pageContainer/Pages.ts`.
- **Infrastructure a QA should not touch:** `src/base/**`, `support/**`, `src/database/**`, `eslint.config.js`, `src/architecture.test.ts`, `cucumber.js`, `tsconfig.json`, CI.
- **Too many abstractions?** No.
- **Do the abstractions earn their keep?** Yes — each maps to a distinct, demonstrated responsibility.
- **Is the happy path clear?** Yes.
- **Do guardrail errors explain the fix?** Mostly yes; every ESLint message names the correct alternative. Architecture-test failures are blunter but include the offending path.

---

## 13. AI Readiness

| Dimension | Assessment |
|---|---|
| Single, unambiguous example of every pattern | ✅ one Page, one Component, one Repository, one Feature |
| Machine-checkable definition of "done" | ✅ `npm run quality`, exit-code clean, ~4s |
| Layer boundaries enforced, not just described | ⚠️ strong for Steps/config/DB-values; **absent for UI hierarchy**; partial for driver isolation |
| Documentation trustworthy as agent ground truth | ⚠️ accurate on capabilities, **overstated on enforcement** |
| Fast, deterministic feedback loop | ✅ no browser/network in the gate |
| Wrong code reliably produces a red gate | ⚠️ four demonstrated "green gate, wrong code" paths |
| Secrets safe from agent-generated code | ✅ |
| Parallel runner cannot be introduced via project scripts/CI | ✅ |

**Phase 2 readiness (CLAUDE.md, specialized agents, Playwright MCP):** the foundation is strong enough to proceed *with the F-01/F-02/F-04/F-05 caveats explicitly written into `CLAUDE.md`*, or preferably after closing F-01 and F-04. It is not strong enough to grant an agent unreviewed write access on the assumption that a green `npm run quality` implies architectural correctness — because, demonstrably, it does not.

---

## 14. Findings

| ID | Severity | Area | Finding | Blocks Phase 2 |
|---|---|---|---|---|
| F-01 | HIGH | UI architecture | T07/T08 conventions have zero automated enforcement: a Component can extend `BasePage`, navigate, and inline unscoped locators with `quality` green | No |
| F-02 | HIGH | Database / guardrails | `oracledb` isolation bypassed by `await import('oracledb')` or by renaming the `createRequire` binding — defeats both ESLint G4 and architecture A6 | No |
| F-03 | MEDIUM | Guardrails coverage | `.js` files carry no guardrails at all (`process.env`, `oracledb`, `waitForTimeout` all pass) | No |
| F-04 | HIGH | Quality gate | Unit tests outside `src/**` never execute; `test:unit` still reports all-pass — reachable *by following* the README's colocation guidance | No |
| F-05 | MEDIUM | Documentation | README "Architecture Guardrails" table overstates enforcement in five rows | No |
| F-06 | MEDIUM | Steps isolation | A Step can `import { chromium } from 'playwright-core'` and bypass `CustomWorld`/`Pages` | No |
| F-07 | LOW | Architecture test A4 | Aliased `setWorldConstructor` import defeats the single-World check | No |
| F-08 | LOW | Architecture test A5 | Getters, constructor parameter properties, computed names and class expressions escape the `CustomWorld` allowlist | No |
| F-09 | LOW | Parallel runner | `.spec.js` covered by neither ESLint G7 nor architecture A2 | No |
| F-10 | MEDIUM | Quality gate | `.ts` outside `tsconfig.include` is never typechecked | No |
| F-11 | LOW | Guardrails | `await import('@playwright/test')` not blocked by ESLint | No |
| F-12 | LOW | Documentation | `src/architecture.test.ts:22-29` documents `const { env } = process` as an open gap; it is actually blocked | No |
| F-13 | INFO | Guardrails | Aliasing `process` itself (`const p = process`) escapes the `process.env` rule | No |
| F-14 | INFO | Architecture walker | `.tmp-*` directories are invisible to both ESLint and the architecture walker | No |

**Totals:** BLOCKER 0 · HIGH 3 · MEDIUM 4 · LOW 5 · INFO 2 — **14 findings.**

### Detail for the HIGH findings

**F-01 — UI architecture conventions unenforced**
*Evidence:* two fixtures under `src/components/audit/` — one `extends BasePage` calling `goto()`/`reload()` from a Component, one extending `BaseComponent` but building `this.page.getByRole(...)` inline instead of using `root`. *Reproduce:* create either, run `npm run quality` → exit 0, 57/57. *Impact:* the precise anti-pattern T08 was created to eliminate can be reintroduced with no signal; T08's type-level guarantee constrains subclasses of `BaseComponent`, not Components in general. *Recommendation (conceptual, not implemented):* an architecture test asserting that every class under `src/components/**` extends `BaseComponent` and every class under `src/pages/**` (excluding the base) extends `BasePage` would close it with the same AST technique A5 already uses.

**F-02 — `oracledb` isolation bypassable**
*Evidence:* `await import('oracledb')` and `const req = createRequire(import.meta.url); req('oracledb')` — both ESLint-clean and A6-clean; only the literal `import` form is caught. *Reproduce:* place either in any `.ts` outside the authorized client, run `npm run quality` → exit 0. *Impact:* the sole boundary isolating an untyped raw driver is defeated by a rename; the dynamic form mirrors the idiom already used in `support/databaseLifecycle.ts:17`, making it the pattern an agent is most likely to copy. *Recommendation:* broaden A6 to treat any `import('oracledb')` call expression and any `require`-like call with the `'oracledb'` argument as a reference, independent of the callee's identifier name.

**F-04 — Silently dead unit tests**
*Evidence:* `support/x.test.ts` containing `assert.equal(1, 2)` → `npm run test:unit` reports 57 pass / 0 fail; `npm run quality` exit 0. *Reproduce:* place any failing `*.test.ts` outside `src/`. *Impact:* false confidence — the most dangerous failure mode for AI-generated tests, since the agent receives a green signal for work that never executed. Aggravating factor: the README states unit tests "live alongside the code they test", which for `support/**` or `features/**` lands outside the glob. *Recommendation:* either widen the `test:unit` glob to the directories that can legitimately hold tests, or add an architecture assertion that every `*.test.ts` in the repo sits within the executed glob.

---

## 15. Blockers

**None.**

No finding meets the blocker bar defined for this audit. Specifically, nothing in this repository currently allows an agent to:

- expose or exfiltrate a secret — config never echoes values, `.env` is ignored and untracked, CI carries no secrets;
- introduce a parallel runner through the project's own scripts or CI — A1 and A3 hold, and CI never invokes `playwright test`;
- claim a capability the documentation says exists but does not — verified in T09 and re-verified here;
- modify critical infrastructure entirely undetected — `eslint.config.js`, `src/architecture.test.ts`, `cucumber.js`, `tsconfig.json` and CI are all tracked, reviewable files, and `AGENTS.md` explicitly forbids relaxing a guardrail to make a change pass.

The demonstrated "green gate on wrong code" paths (F-01, F-03, F-04, F-10) are real and are ranked accordingly, but each requires leaving the documented happy path, none corrupts production behaviour, and all remain visible in ordinary code review — which Phase 2 retains.

---

## 16. Non-blocking Improvements

Ordered by value for AI readiness. **None implemented — this audit changed no code.**

1. **F-01** — architecture test binding Components to `BaseComponent` and Pages to `BasePage`. Highest value: it converts the framework's central architectural claim from convention into enforcement.
2. **F-04** — make every `*.test.ts` in the repo either executed or flagged.
3. **F-02** — make A6 callee-name-independent and dynamic-import-aware.
4. **F-05** — restate the README guardrail table in terms of what is actually enforced, and say plainly which conventions are review-enforced rather than machine-enforced.
5. **F-06** — add `playwright-core` to the Step import restrictions.
6. **F-03 / F-10** — extend the guardrail block to `**/*.js` and widen `tsconfig.include`, or state explicitly that non-`.ts` and out-of-tree files are out of scope.
7. **F-07 / F-08 / F-09 / F-11** — tighten the shape-specific matchers where cheap.
8. **F-12** — correct the stale comment in `src/architecture.test.ts`.

Known-absent capabilities (API layer, Test Data Management, auth/`storageState`, screenshots/traces, structured logging, environment matrix, parallelism/retries) are **not** treated as findings. They are documented, deliberate Phase-2+ scope.

---

## 17. Final Verdict

**CONDITIONALLY READY**

The AI Foundation is architecturally sound, genuinely tested, honestly documented about its own limits, and enforced by a fast, real quality gate. Under deliberate adversarial pressure the invariants that matter most held. There are no blockers, and Phase 1's objectives were met.

The condition attaches to a single, specific gap between perception and reality: **a green `npm run quality` does not currently imply architectural correctness**, and the README's guardrail table invites an AI agent to believe that it does. Four demonstrated paths produce a green gate on incorrect code, and the two patterns T07 and T08 were created to establish are the ones with no enforcement at all.

Phase 2 may begin provided one of the following holds:

- **(a)** F-01 and F-04 are closed first (the two that most directly cause silent, wrong AI output); or
- **(b)** `CLAUDE.md` states explicitly that the UI hierarchy and locator conventions are **review-enforced, not machine-enforced**, that a green gate is necessary but not sufficient, and that changes under `src/pages/**`, `src/components/**` and `src/base/**` require human architectural review.

Option (a) is the stronger choice, and F-01 is a contained, well-scoped change using a technique the repository already employs.

---

## 18. Recommended Next Step

Close **F-01** and **F-04** as a small, focused task before writing `CLAUDE.md` — both are additive (one architecture test each, no production-code change), directly reduce the risk of silent AI regressions, and would let Phase 2 begin under an unconditional READY.

Then proceed to Phase 2 in this order: `CLAUDE.md` (encoding the honest enforcement boundary from §11/§13), then specialized agents, then Playwright MCP.

**Do not** treat the absent capabilities in §16 as prerequisites; they are independent roadmap items.
