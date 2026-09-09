# AI Foundation Final Readiness

**Date:** 2026-09-04
**Branch:** `feature/ai-foundation`
**Baseline commit:** `57d3802` (docs: record AI foundation audit findings)
**Scope:** Independent re-verification of the T10 audit's three HIGH findings after T10.1, T10.1b, T10.2 and T10.3, plus a fresh adversarial sweep of everything else.

**Method note:** every claim below was re-tested with real throwaway fixtures against the real toolchain. No T10.x record was taken at face value; the two originally-demonstrated F-02 bypasses were reproduced against the current code before being re-checked, and this audit surfaced two residual gaps the corrective tasks did not report.

---

## 1. Executive Summary

The three HIGH findings that made the original audit *CONDITIONALLY READY* are closed against every bypass the audit actually demonstrated:

- **F-01** — all five UI-architecture bypasses (Component extending `BasePage`, Page extending `BaseComponent`, and three `this.page` scoping violations) now fail the gate, each named individually by the correct invariant, while ESLint and `tsc` stay clean — confirming the architecture tests are the real and only defense, and that they hold.
- **F-04** — a failing test in `support/` and in `features/` now executes and fails loudly (62 tests, exit 1); a test outside the discovery roots is correctly *not* executed but is caught by A12.
- **F-02** — all four driver-isolation bypasses fail, including both forms the original audit demonstrated, with no false positive on a legitimate dynamic import of another module.

Critically, **no correct code was made harder to write**: a freshly-authored, correctly-structured Page and Component — including the legitimate `super(page, page.getByRole(...))` constructor — pass cleanly. The guardrails punish the wrong shape, not the normal workflow.

This audit did find **two residual gaps not reported by the corrective tasks**, both narrower than the originals and neither reopening them:

- **F-15 (new)** — a Component can still build an *unscoped* locator from the constructor's local `page` parameter (`this.x = page.getByRole(...)`), escaping its `root`, with quality green. A11 only governs `this.page`.
- **F-16 (new)** — `oracledb` can still be reached via a **default or namespace import** of `node:module` (`import nodeModule from 'node:module'; nodeModule.createRequire(...)`), or via a re-aliased loader. A6 only recognizes *named* `createRequire` imports and single-hop bindings.

Neither is a blocker. Both require deliberately doing an unusual thing (writing raw driver access outside the authorized client; building a page-wide locator inside a Component constructor), both are plainly visible in review, and neither enables the outcomes that would actually be dangerous: no parallel runner can enter through the project's scripts or CI, no secret can leak, no test can silently die, and the UI hierarchy cannot be broken.

The one finding with real Phase-2 leverage is **F-05**: the README's "Architecture Guardrails" table now both **overstates** enforcement in ~5 rows and **omits the four strongest new guardrails entirely** (A9/A10/A11/A12). Since `CLAUDE.md` will plausibly be derived from that table, it should be written from this document's measured table instead.

**Verdict: READY.** See §11.

---

## 2. Baseline

Gate condition (audit halts on a dirty tree) — passed.

| Check | Result |
|---|---|
| Branch | `feature/ai-foundation` ✅ |
| Working tree | **clean** ✅ (all T10.1–T10.3 work committed through `57d3802`) |
| Node | v24.13.1 |
| `engines` | `>=24.12` → ✅ compatible |
| `npm run quality` | **exit 0** |
| Tests | **61 tests / 23 suites / 61 pass / 0 fail** |
| `test:unit` duration | ~0.94 s (full `quality` wall-clock ≈ 10.3 s) |
| `npm test` (E2E) | **2 scenarios / 6 steps, PASS** |
| CI commands exist | ✅ all 12 npm scripts referenced resolve |

Actual scripts, read from `package.json` rather than assumed:

```
quality   : npm run typecheck && npm run lint && npm run format:check && npm run test:unit
test:unit : node --test "src/**/*.test.ts" "support/**/*.test.ts" "features/**/*.test.ts"
test      : cucumber-js --config cucumber.js --tags "not @db"
```

`npm run quality` output contains **zero** references to Cucumber — confirmed by execution, not by reading the script.

---

## 3. F-01 Revalidation

Five fixtures, created simultaneously, all typecheck-clean and ESLint-clean so that only the architecture tests could fail the gate.

| # | Bypass | Expected | Result | Caught by |
|---|---|---|---|---|
| A | class under `src/components/**` `extends BasePage` (calls `goto`/`reload`) | FAIL | ✅ **FAIL** | A10 |
| B | class under `src/pages/**` `extends BaseComponent` | FAIL | ✅ **FAIL** | A9 |
| C | correct Component using `this.page.getByRole(...)` | FAIL | ✅ **FAIL** | A11 |
| D | correct Component using `this.page.locator(...)` | FAIL | ✅ **FAIL** | A11 |
| E | correct Component using `const p = this.page` | FAIL | ✅ **FAIL** | A11 |

`npm run quality` → **exit 1**, `61 tests / 58 pass / 3 fail`. The three failures are exactly A9, A10 and A11, each naming its offenders precisely:

```
Every concrete Page Object must extend BasePage — never BaseComponent, nothing, or any
other class. Offenders: src/pages/audit/BadHierarchyPage.ts (class BadHierarchyPage
extends BaseComponent)

Components must extend BaseComponent. Components must never extend BasePage.
Offenders: src/components/audit/BadHierarchyComponent.ts (class BadHierarchyComponent
extends BasePage)

Components must scope UI access through this.root, never this.page. Offenders:
src/components/audit/BareThisPageComponent.ts:10 (class BareThisPageComponent);
src/components/audit/PageGetByRoleComponent.ts:10 (class PageGetByRoleComponent);
src/components/audit/PageLocatorComponent.ts:10 (class PageLocatorComponent)
```

**ESLint and `tsc` were clean on all five** — the architecture tests are genuinely the only thing standing between these bypasses and a green gate, and they hold.

### 3.1. No false positives

A newly-written, *correct* Page and Component — including a parameterized private locator factory built from `this.root` and the legitimate `super(page, page.getByRole(...))` constructor — passed with **exit 0, 61/61**. The existing `ExamplePage extends BasePage` and `ExampleNavigationComponent extends BaseComponent` (which uses `this.root` for both locators) pass unchanged.

### 3.2. Residual gap found by this audit → F-15

A Component may still reach outside its own `root` by building a locator from the **constructor's local `page` parameter**:

```ts
constructor(page: Page) {
  super(page, page.getByRole('navigation', { name: 'Main' }));
  this.outsideRoot = page.getByRole('button', { name: 'Anywhere On Page' }); // page-wide
}
```

`npm run quality` → **exit 0, 61/61**. A11 governs `this.page` only, and the local `page` parameter cannot simply be banned because building `root` requires it. Closing this would mean distinguishing "the `page` expression passed to `super()`" from "every other use of `page` in the constructor" — real analysis, and beyond what T10.1b scoped.

**Severity: LOW–MEDIUM, non-blocking.** The central guarantees still hold (the class is a `BaseComponent`, has a `root`, cannot navigate), the anti-pattern is conspicuous in review, and it is confined to the constructor.

**F-01 verdict: CLOSED** for every bypass the original audit demonstrated; F-15 tracked separately as a narrower successor.

---

## 4. F-02 Revalidation

Four fixtures outside `src/database/clients/OracleDatabaseClient.ts`:

| # | Form | Expected | A6 result | ESLint |
|---|---|---|---|---|
| A | `import oracledb from 'oracledb'` | FAIL | ✅ **FAIL** | also blocked (G4) |
| B | `await import('oracledb')` | FAIL | ✅ **FAIL** | clean |
| C | `import { createRequire } from 'node:module'` → `req('oracledb')` | FAIL | ✅ **FAIL** | clean |
| D | `import { createRequire as makeRequire }` → `oracleLoader('oracledb')` | FAIL | ✅ **FAIL** | clean |

A6's message named all four offenders. ESLint catches only A — **B, C and D are closed by A6 alone**, which is precisely the gap F-02 described.

**Positive controls, both verified:**
- `src/database/clients/OracleDatabaseClient.ts` still passes, and A6's companion assertion ("the authorized file still references oracledb — the exception is not stale") still passes. The production file was not modified.
- A dynamic import of a **different** module (`await import('../types/db.types.js')`) produced **no false positive**, and neither does `support/databaseLifecycle.ts`, which legitimately dynamic-imports `OracleDatabaseClient.js`.

### 4.1. Residual variants found by this audit → F-16

T10.3 documented a deliberate "single-hop, named-import" limitation. This audit tested whether that limitation is reachable by *plausible* code, and it is:

| Variant | Result |
|---|---|
| `import nodeModule from 'node:module'; nodeModule.createRequire(...)` (default import) | ⚠️ **NOT detected** — quality exit 0 |
| `import * as nodeModule from 'node:module'; nodeModule.createRequire(...)` (namespace import) | ⚠️ **NOT detected** — quality exit 0 |
| `const req = createRequire(...); const load = req; load('oracledb')` (multi-hop) | ⚠️ **NOT detected** — quality exit 0 |

A6 resolves `createRequire` only through **named** import specifiers and tracks only a **single** assignment hop. Default and namespace imports of `node:module` are ordinary, idiomatic TypeScript — less common than the named form the repo itself uses, but not artificial.

**Severity: MEDIUM, non-blocking.** Reaching it requires an agent to write raw driver access outside the authorized client *and* choose a non-repo-idiomatic import form; the in-repo pattern to copy (`import { createRequire } from 'module'`) is the one that is caught. Closing it is a contained change (resolve `createRequire` through default/namespace imports too, and follow one more assignment hop).

**F-02 verdict: CLOSED** for both originally-demonstrated bypasses; F-16 tracked as a narrower successor.

---

## 5. F-04 Revalidation

`test:unit` discovery verified by reading the real script: `src/**/*.test.ts`, `support/**/*.test.ts`, `features/**/*.test.ts`.

| Case | Fixture | Expected | Result |
|---|---|---|---|
| 1 | `support/__audit_final_fail.test.ts` (`assert.equal(1,2)`) | executes and fails | ✅ `test:unit` **exit 1**, 62 tests / 61 pass / 1 fail |
| 2 | `features/__audit_final_fail.test.ts` (`assert.equal(1,2)`) | executes and fails | ✅ `test:unit` **exit 1**, 62 tests / 61 pass / 1 fail |
| 3 | `scripts/__audit_final_dead.test.ts` | not executed, but detected | ✅ `quality` **exit 1**; test count stays 61 (correctly *not* run); A12 fires |

A12's message:

```
Unit test is outside the test:unit discovery roots and would never execute. test:unit only
runs src/**/*.test.ts, support/**/*.test.ts, features/**/*.test.ts.
Offenders: scripts/__audit_final_dead.test.ts
```

Case 3 is the important one: the dead test is genuinely never executed (count stays 61), yet the build still goes red — the defense-in-depth design works as intended.

- Tests in `src/**` execute ✅
- Tests in `support/**` execute ✅
- Tests in `features/**` execute ✅
- Any `*.test.ts` outside those roots produces a red signal ✅

**F-04 verdict: CLOSED.** No configuration was found in which a test can be silently dead while quality stays green.

---

## 6. Quality Gate

Confirmed by execution:

| Stage | Command | Result |
|---|---|---|
| 1 | `tsc --noEmit` | clean |
| 2 | `eslint .` | clean |
| 3 | `prettier . --check` | clean |
| 4 | `node --test` × 3 globs | 61 pass |

**Totals: 61 tests, 23 suites, 0 fail, exit 0.** `test:unit` ≈ 0.94 s; full `quality` ≈ 10.3 s wall-clock — fast enough to be run on every change, which is what makes it usable as an agent's definition of done.

Architecture invariants present and individually exercised in this audit: **A1, A2, A3, A4, A5, A6 (extended), A7, A9, A10, A11, A12**. (A8 remains intentionally ESLint-only.)

`npm run quality` does **not** run Cucumber — verified by grepping its full output for "cucumber": zero matches. `npm test` remains the separate E2E entry point.

---

## 7. Remaining Findings

Every original finding was re-tested rather than assumed.

| ID | Original | Re-tested result | Current status | Severity |
|---|---|---|---|---|
| F-01 | HIGH | 5/5 bypasses now fail | **CLOSED** | — |
| F-02 | HIGH | 4/4 bypasses now fail | **CLOSED** | — |
| F-04 | HIGH | 3/3 cases correct | **CLOSED** | — |
| F-03 | MEDIUM | `.js` with `oracledb` + `process.env` + `waitForTimeout` → eslint clean, quality **exit 0** | **OPEN** | MEDIUM |
| F-05 | MEDIUM | table still overstates ~5 rows **and now omits A9–A12** | **OPEN** | MEDIUM |
| F-06 | MEDIUM | `playwright-core` from a Step → eslint clean, tsc clean, quality **exit 0**, module resolvable | **OPEN** | MEDIUM |
| F-07 | LOW | aliased `setWorldConstructor` → quality **exit 0** | **OPEN** | LOW |
| F-08 | LOW | A5 still `PropertyDeclaration`-only (getters / parameter properties escape) | **OPEN** | LOW |
| F-09 | LOW | `.spec.js` → quality **exit 0** | **OPEN** | LOW |
| F-10 | MEDIUM | `tools/x.ts` with a hard type error → never typechecked, quality **exit 0** | **OPEN** | MEDIUM |
| F-11 | LOW | `await import('@playwright/test')` → eslint clean | **OPEN** | LOW |
| F-12 | LOW | comment at `architecture.test.ts:25` still calls `const { env } = process` a "known gap"; ESLint **does** block it → comment is factually stale | **OPEN** | LOW |
| F-13 | INFO | aliasing `process` itself | **OPEN** | INFO |
| F-14 | INFO | `.tmp-*` dirs invisible to walker | **OPEN** | INFO |
| **F-15** | *new* | Component escapes `root` via constructor-local `page` | **OPEN** | LOW–MEDIUM |
| **F-16** | *new* | `oracledb` via default/namespace `node:module` import, or multi-hop loader | **OPEN** | MEDIUM |

**Totals: 3 CLOSED · 0 BLOCKER · 0 HIGH · 6 MEDIUM · 5 LOW · 2 INFO.** None classified *CLOSED INDIRECTLY* or *NO LONGER RELEVANT* — every open finding was independently reproduced in this session.

### 7.1. Green-gate bypasses that remain

Situations where plausible wrong code still yields `npm run quality` exit 0:

1. **F-03** — any `.js` file (no guardrails at all). Bounded: `allowJs` is unset, so a `.ts` file cannot cleanly import it, and neither `cucumber.js` nor `test:unit` loads `.js`.
2. **F-10** — any `.ts` outside `src/`/`support/`/`features/` (never typechecked).
3. **F-06** — a Step importing `playwright-core` and launching its own browser.
4. **F-16** — driver access via default/namespace `node:module` import.
5. **F-15** — a Component building a page-wide locator in its constructor.

What is **not** reachable: introducing a parallel runner through the project's own scripts or CI (A1/A3 hold), a second `World` through the normal API (A4 holds for the unaliased form), a silently dead test (A12 holds), a broken UI hierarchy (A9/A10/A11 hold), a leaked secret (config never echoes values; `.env` ignored and untracked; CI carries no secrets), or SQL built without binds (QueryBuilder's model is genuinely test-covered).

---

## 8. Documentation Accuracy

Verified against code, not against the T10.x records:

| Check | Result |
|---|---|
| All 12 npm scripts referenced exist | ✅ |
| All key documented paths exist | ✅ |
| UI hierarchy described correctly (`AGENTS.md` §3, README) | ✅ `BaseUiObject` / `BasePage` / `BaseComponent` accurate, incl. "never extend `BasePage`" |
| `test:unit` discovery description | ✅ accurate — README already names all three globs and explains the A12 backstop |
| Capabilities documented but non-existent | ✅ none found (no false `storageState` / API / Test-Data claims) |
| **Guardrails table vs. real enforcement** | ❌ **inaccurate in both directions — F-05** |

### 8.1. F-05 in detail

Measured, row by row, against this audit:

**Now fully true:** `process.env` ownership (dot, bracket, `const env = process.env` *and* destructuring are all blocked); no `*.spec.ts`; no `playwright.config.*`; no npm script invoking `playwright test`; every `.feature` tagged.

**Still broader than enforcement:**
- "No Playwright Test runner APIs" — dynamic `import()` escapes (F-11).
- "No `waitForTimeout(...)` **anywhere**" — `.js` files are exempt (F-03).
- "`oracledb` only imported/required from …" — default/namespace `node:module` import escapes (F-16).
- "Step Definitions never import Playwright" — `playwright-core` escapes (F-06).
- "`setWorldConstructor` registered exactly once" — aliasing escapes (F-07).
- "`CustomWorld` declares only infrastructure state" — getters and parameter properties escape (F-08).

**Newly missing:** the table lists none of **A9** (Pages extend `BasePage`), **A10** (Components extend `BaseComponent`), **A11** (Component root scoping) or **A12** (unit-test discovery) — the four strongest guardrails now in the framework, and precisely the ones an agent working on UI code most needs to know exist.

**Could this induce an agent to generate architecturally incorrect code?** Mostly no, and asymmetrically:
- The *omissions* are harmless in direction — an agent that doesn't know A9–A12 exist still gets caught by them.
- The *overstatements* could cause misplaced trust, but none of them *encourages* the bypass; each requires the agent to independently choose an unusual form (write `.js`, import `playwright-core`, alias `setWorldConstructor`).

**F-05 classification: NON-BLOCKING**, but it is the finding with the most Phase-2 leverage: `CLAUDE.md` should be authored from §7 of this document rather than from the README table, and the README table should be corrected as an early Phase-2 task.

---

## 9. Developer Experience

**A) QA with basic/intermediate programming.** Unchanged and still simple. The normal path is a `.feature`, a `*.steps.ts`, one Page, optionally one Component, one line in `Pages.ts`. Nothing added by T10.1–T10.3 touches that path: the new guardrails only fire on shapes a QA following the README would never write. Verified directly — a correctly-written new Page and Component pass with 61/61.

**B) QA Automation Engineer.** Better off than before the corrections. The rules that were previously prose ("a Component must extend `BaseComponent`", "locators come from `root`", "put tests next to the code") are now machine-checked, so the feedback arrives in ~10 seconds from `npm run quality` instead of in code review.

**C) SDET maintainer.** Manageable, with one caveat: the guardrails are shape-specific by design (a named import here, a `PropertyDeclaration` there, a single assignment hop), and F-15/F-16 are exactly the kind of drift that produces. The `docs/refactor-progress-ia/` trail documents *why* each shape was chosen, which is what makes that maintainable.

**D) AI agent.** The strongest of the four profiles now. There is one canonical example of every pattern, a fast machine-checkable definition of done, and — post-T10.1/T10.1b/T10.2/T10.3 — the central architectural claims are actually enforced rather than merely documented. The remaining risk is trusting the README's guardrail table (F-05), which is a documentation fix, not a framework fix.

**Did the corrections add too much complexity?**
- **Do A9–A12 make normal use harder?** No. All four are *repo-wide invariants* that a correct file never triggers; none changes how a Page, Component, Step or test is written.
- **Do the error messages let you fix the problem?** Yes. Each names the file, the class, and often the line and the offending relation (`class BadComponent extends BasePage`), and states the required shape.
- **Does a QA need to understand ASTs?** No. The AST work is entirely inside `src/architecture.test.ts` — infrastructure a QA never opens. What a QA sees is a plain-language failure telling them what to change.

The "complex inside, simple outside" goal holds: all added complexity landed in one infrastructure file, and the outward-facing workflow is unchanged.

---

## 10. AI Readiness

| Dimension | Assessment |
|---|---|
| Single unambiguous example of every pattern | ✅ |
| Machine-checkable definition of done | ✅ `npm run quality`, exit-code clean, ~10 s |
| Central architecture enforced, not just described | ✅ **UI hierarchy, root scoping, test discovery and driver isolation all now enforced** |
| Wrong code reliably produces a red gate | ⚠️ largely — five narrow green-gate paths remain (§7.1), none central |
| Documentation trustworthy as agent ground truth | ⚠️ accurate on capabilities/paths/scripts; guardrail table inaccurate (F-05) |
| Parallel runner cannot enter via project scripts/CI | ✅ |
| Secrets safe from agent-generated code | ✅ |
| Silently dead tests impossible | ✅ |

Compared with the original audit, the three dimensions that were ⚠️ *because the central architecture was unenforced* are now ✅. What remains is peripheral: file types outside the supported roots, one non-idiomatic import form per boundary, and a documentation table.

---

## 11. Final Verdict

# READY

Measured against the stated criteria:

- **F-01 closed** — 5/5 demonstrated bypasses now fail the gate ✅
- **F-02 closed** — 4/4 demonstrated bypasses now fail the gate ✅
- **F-04 closed** — 3/3 cases behave correctly ✅
- **0 BLOCKERS** ✅
- **No remaining finding reasonably lets an AI agent break the central architecture with a green gate** ✅ — the five residual green-gate paths all require deliberately stepping outside the framework's own idioms (writing `.js` in a TypeScript repo, placing `.ts` outside the three source roots, importing `playwright-core` instead of `playwright`, reaching `node:module` through a default/namespace import, or building a page-wide locator inside a Component constructor). Each is conspicuous in review, and none touches the UI hierarchy, the runner boundary, the test-execution guarantee, or secret handling.
- **Remaining findings manageable via `CLAUDE.md` + agents + human review + backlog** ✅

*CONDITIONALLY READY* was considered and rejected: it is reserved for a concrete technical condition that must be resolved **before** creating `CLAUDE.md`/agents/MCP, and no such condition exists. F-05 is the closest candidate, but it is satisfiable by writing `CLAUDE.md` accurately from §7 of this document — it does not require changing the framework first.

*NOT READY* was rejected: there is no blocker, and the foundation withstood every adversarial probe aimed at its central guarantees.

This verdict does not claim the framework is perfect — this audit deliberately found two gaps the corrective tasks did not report (F-15, F-16). It claims the foundation is sound enough that an AI agent working inside it, with a quality gate this fast and this honest, plus human review, will be caught when it matters.

---

## 12. Phase 2 Entry Criteria

Phase 2 (Claude Code integration + specialized agents + Playwright MCP) may begin now. To keep the foundation honest as it does:

1. **Write `CLAUDE.md` from §7 of this document, not from the README guardrail table.** State plainly which invariants are machine-enforced (A1–A12 + ESLint G1–G8) and which remain review-enforced, and that a green `npm run quality` is necessary but not sufficient.
2. **Correct the README guardrail table early in Phase 2** (F-05): add A9/A10/A11/A12, and soften the six rows measured as broader than enforcement.
3. **Backlog, in priority order:** F-16 (driver isolation via default/namespace import) → F-06 (`playwright-core` from Steps) → F-03/F-10 (`.js` and out-of-root `.ts` coverage) → F-15 (Component constructor scoping) → F-07/F-08/F-09/F-11/F-12 → F-13/F-14.
4. **Keep human review on `src/base/**`, `src/pages/**`, `src/components/**` and `src/database/**`** while agents are new to the repo — those are where the residual gaps live.
5. **Do not treat the known-absent capabilities** (API layer, Test Data Management, auth/`storageState`, screenshots/traces, structured logging, environment matrix, parallelism/retries) **as prerequisites** — they are documented, deliberate roadmap items.
