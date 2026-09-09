# AI Automation Archetype — Final Adversarial Audit (Phase 2)

**Date:** 2026-09-08
**Branch:** `feature/claude-ai-integration`
**Baseline commit:** `b5a0969` (refactor: promote SauceDemo as canonical UI example)
**Node:** v24.13.1 · **npm:** 11.8.0 · **Claude Code:** 2.1.265
**Auditor role:** Senior SDET / architecture + security + DX reviewer, adversarial pre-flight before declaring Phase 2 complete.

**Method:** every claim below was produced by executing the real toolchain against the real repository. Guardrails were attacked with throwaway fixtures written to real paths — never under `.tmp-*`, which both ESLint and the architecture walker ignore — then deleted. No prior task record (T10.x–T19.1) was taken at face value. No source file, configuration file, agent, skill or CI definition was modified by this audit.

**Governing rule applied:** where documentation and code disagree, the code wins and the discrepancy is reported.

---

## 1. Executive Summary

This audit tried to prove the archetype is **not** ready. It largely failed to: the machine-enforced core is genuinely solid. Sixteen of sixteen guardrails that are supposed to block did block, all previously-documented green-gate gaps reproduce exactly as documented — neither better nor worse than claimed — there are zero broken operative references to the retired `playwright.dev`/`ExamplePage` example, zero secrets, and a tracked-files-only checkout runs `npm run quality` and the full E2E suite green with no `.env` and no local configuration whatsoever.

It did find one defect worth blocking a clean `READY` on, and it is a **documentation-of-enforcement** defect rather than a code defect:

> `CLAUDE.md` §8 closes with the sentence *"Lo que **sí** está garantizado hoy: … **no se puede romper la jerarquía UI** …"*.
>
> That guarantee is false. A Page-like class placed outside `src/pages/**`, imported directly into a Step, together with the public `BasePage.goto()` reached straight from that Step, passes `npm run quality` with **exit 0, 62/62 tests**. The entire UI architecture is bypassed and not one rule fires.

Every other gap of this family (F-03, F-06, F-09, F-10, F-11, F-13, F-15, F-16) is meticulously inventoried in `CLAUDE.md` §8 and in `README.md`'s guardrail "Scope" column, and five of them are named by ID in `automation-reviewer`'s checklist. This one is inventoried nowhere — so neither a human reviewer nor the `automation-reviewer` agent is told to look for it. The archetype's stated safety model is *"quality green is necessary, not sufficient; here is the exact list of what it does not catch."* The model is sound; the list is incomplete, which silently converts a known-limitations model into a false-assurance one.

The fix is bounded and touches no code and no guardrail: correct the §8 guarantee, add the gap class to the §8 table and the README scope table, and add one line to the reviewer's checklist.

**Verdict: CONDITIONALLY READY** — 0 BLOCKER, 1 HIGH, 5 MEDIUM, 12 LOW.

---

## 2. Baseline Gate

| Check | Result |
|---|---|
| `git status` | **CLEAN** — verified before the audit and again after every fixture batch |
| Branch | `feature/claude-ai-integration` |
| HEAD | `b5a0969` |
| Node | v24.13.1 (satisfies `engines.node` `>=24.12`) |
| `npm run quality` | **PASS** — exit 0, **62 tests / 23 suites / 62 pass / 0 fail** |
| `npm test` | **PASS** — exit 0, **2 scenarios / 20 steps** |
| `npm run test:ui` | **PASS** — exit 0, **2 scenarios / 20 steps** |

The instruction sheet anticipated `62/62` for quality and `2 scenarios / 20 steps` for both E2E gates. Reality matched exactly. Note that `CLAUDE.md` §7.4 still states `61 tests / 23 suites` (L-01).

---

## 3. Final Architecture — reconstructed from code, not from diagrams

### 3.1 UI

```text
features/sauceDemo/checkout.feature              @ui @regression (+ @smoke on 1 scenario)
  └─ features/steps/sauceDemo/checkout.steps.ts     14 steps, this.pages only — zero Playwright imports
       └─ support/world.ts   CustomWorld { browser, context, page, pages, repositories?, testContext }
            └─ src/pageContainer/Pages.ts           6 SauceDemo pages composed
                 └─ src/pages/sauceDemo/*.ts        6 concrete Pages, all `extends BasePage`
                      └─ src/pages/base/BasePage.ts      goto / reload / waitForUrlContains
                           └─ src/base/BaseUiObject.ts   17 shared wait/action/getter/assert methods
```

`src/components/base/BaseComponent.ts` (`extends BaseUiObject`, adds `root: Locator`, no navigation) is present as a **contract only**. Confirmed: **no concrete Component exists in the repo.** This is stated correctly and consistently in `README.md` §Components, `README.md` §Current Limitations, `AGENTS.md` §4, `CLAUDE.md` §3 and `automation-engineer.md` §MODE: IMPLEMENT. It breaks no architecture test — A10/A11 filter to concrete files under `src/components/**` and simply find none — and forces no speculative abstraction. See L-05 for the one place `README.md` contradicts itself on this.

### 3.2 Database

```text
Step → this.repositories (RepositoryContainer, built in hooks only when DB_ENABLED=true)
        └─ ExampleRepository extends BaseRepository (protected execute/select/insert/update/delete)
             └─ QueryBuilder (binds for values, caller-supplied allowlists for identifiers)
                  └─ DatabaseClient (driver-agnostic contract: execute, close)
                       └─ OracleDatabaseClient (only real implementation; sole `oracledb` reference)
```

Lifecycle owner is `support/databaseLifecycle.ts`. **Empirically confirmed** with `DB_ENABLED=false`: `initDatabaseClient()` creates no client, `getDatabaseClient()` returns `undefined`, `oracledb` never appears in `process.moduleLoadList`, and `closeDatabaseClient()` is safe to call with no client. `DB_ENABLED=true` with no credentials fails fast at import time with `DB_ENABLED=true requires: DB_USER, DB_PASSWORD, DB_CONNECT_STRING.`

### 3.3 Config

`src/config/index.ts` is the only legitimate `process.env` owner. Verified by attack, not by reading — see §5.3.

### 3.4 AI workflow

```text
/qa-automate (skill; the orchestrator is the main session, not a fourth agent)
  FASE 2  qa-analyst           Read/Grep/Glob only — no Edit, no Write, no Bash, no MCP
  GATE 1  human approval of the QA Analysis                (silence ≠ approval)
  FASE 3  automation-engineer  MODE: PLAN                  (writes nothing)
  GATE 2  human decision: Approve Plan / Request changes / Cancel
  FASE 4  automation-engineer  MODE: IMPLEMENT + literal marker PLAN APPROVED
  FASE 5  automation-reviewer  read-only; re-runs quality/E2E itself
          APPROVED → report;  CHANGES_REQUESTED → return control to the user, never auto-fix
```

### 3.5 MCP isolation — confirmed at runtime

The harness's own agent registry — the authoritative runtime view, not the file — matches each agent's frontmatter exactly:

| Agent | Repo write | Shell | Playwright MCP tools |
|---|---|---|---|
| `qa-analyst` | none | none | **0** — isolated as designed |
| `automation-engineer` | `Edit`, `Write` | `Bash` | **10** |
| `automation-reviewer` | none | `Bash` | **5** — a strict subset of the Engineer's 10; no form-input tools |

`claude mcp get playwright` → `Status: ✔ Connected`, `Scope: Project config (shared via .mcp.json)`, `Args: @playwright/mcp@0.0.80` — matching the pin in `.mcp.json` and the value recorded in T18.

---

## 4. Canonical UI Example

The retired example (`playwright.dev`, `features/example`, `ExamplePage`, `ExampleNavigationComponent`, `BASE_URL`, `requireBaseUrl`) was swept across the entire operative surface: `README.md`, `CLAUDE.md`, `AGENTS.md`, `.claude/**`, `.github/**`, `src/**`, `features/**`, `support/**`, all JSON/JS configs, `.env.example`, `.gitignore`, `.prettierignore`.

**Result: 0 broken operative references.** Every `BASE_URL` hit is the substring inside `SAUCEDEMO_BASE_URL`. The only surviving mentions are:

- `src/architecture.test.ts:442` — `ExampleNavigationComponent` named in a rationale comment explaining *why* A9/A10 exist. Historical narrative, zero behaviour.
- `docs/framework-current-state.md`, `docs/ai-foundation-*.md` — explicitly dated (2026-09-04/07) audit and plan records carrying baseline commits, i.e. the excluded category.

`SAUCEDEMO_BASE_URL` is the single UI target, declared in `src/config/index.ts` (public default), `.env.example`, `ci.yml` and `README.md`. `src/database/repositories/example/ExampleRepository.ts` is the **database** example and is correctly and repeatedly differentiated as such — it is not UI, and its `EXAMPLE_ITEMS` table is documented in three places as a demonstration contract that is never created or seeded.

---

## 5. Adversarial Guardrail Results

Every row is a real fixture written to a real path, gated, then deleted. "BLOCKED" = the gate exited non-zero.

### 5.1 Rules that must block — 16/16 blocked

| # | Attack | Gate | Result |
|---|---|---|---|
| 1 | Page under `src/pages/**` extending nothing | A9 | **BLOCKED** |
| 2 | Page extending `BaseComponent` | A9 | **BLOCKED** |
| 3 | Component extending `BasePage` | A10 | **BLOCKED** |
| 4 | Component extending nothing | A10 | **BLOCKED** |
| 5 | Component using `this.page` to build a locator | A11 | **BLOCKED** |
| 6 | Step using `this.page` | G5 | **BLOCKED** |
| 7 | Step using `this.context` | G5 | **BLOCKED** |
| 8 | Step using `this.browser` | G5 | **BLOCKED** |
| 9 | Step importing a Page | G5 | **BLOCKED** |
| 10 | Step importing a Component | G5 | **BLOCKED** |
| 11 | Step importing `playwright` | G5 | **BLOCKED** |
| 12 | Step importing `src/database/**` | G5 | **BLOCKED** |
| 13 | Step importing `expect` from `@playwright/test` | G5 | **BLOCKED** |
| 14 | Step importing `oracledb` | G4, re-listed in the Steps override | **BLOCKED** |
| 15 | Step calling `waitForTimeout(...)` | G2, re-listed | **BLOCKED** |
| 16 | Step reading `process.env` | G3 | **BLOCKED** |

The flat-config re-listing discipline documented at the top of `eslint.config.js` is real and works: the `features/steps/**` override re-declares `oracledb` and `waitForTimeout`, and both still fire from inside a Step.

### 5.2 Runner isolation — 5/5 blocked

`*.spec.ts` (ESLint G7 **and** architecture A2), `playwright.config.ts` (G8 **and** A1), and a static `import { test } from '@playwright/test'` (G1) all block. A3 was confirmed read-only: zero `package.json` scripts match `/\bplaywright\s+test(\s|$)/i`, and the pattern does match `npx playwright test`. `package.json` was never modified.

### 5.3 Environment isolation — 5/5 blocked

`process.env.X` in a Page, `process.env['X']` in a Page, `process.env` in `support/`, `const env = process.env`, **and `const { env } = process`** all block.

That last one settles **F-12**: ESLint *does* catch the destructuring form. The comment at `src/architecture.test.ts:22-29`, which describes it as a gap *"deliberadamente left open"*, is factually obsolete. `CLAUDE.md` §8's F-12 entry is correct; the code comment is not (L-06).

### 5.4 Unit-test discovery (T10.2) — revalidated adversarially

A deliberately failing `*.test.ts` was planted in each discovery root in turn:

| Root | `test:unit` exit | Fixture actually executed |
|---|---|---|
| `src/` | 1 | **YES** |
| `support/` | 1 | **YES** |
| `features/` | 1 | **YES** |

A `*.test.ts` planted at `scripts/dead.test.ts` — outside every discovery root, where it would never run — is caught by **A12**. No silently dead test is possible.

### 5.5 Database security — F-02's original bypasses stay closed

| Attack | Result |
|---|---|
| `import oracledb from 'oracledb'` | **BLOCKED** (G4) |
| `await import('oracledb')` | **BLOCKED** (A6) |
| `createRequire` imported by name + `req('oracledb')` | **BLOCKED** (A6) |
| `createRequire as mkReq` aliased + one assignment hop | **BLOCKED** (A6) |

`QueryBuilder` was re-reviewed against its 21 unit tests: values always bind, identifiers are validated against both a shape regex and a caller-supplied allowlist, `buildUpdate` refuses an empty filter set, `buildInsert`/`buildUpdate` refuse an empty column set, and `buildOraclePagination` rejects a non-integer or non-positive limit. **No new bypass was found in the value path.** Two theoretical, non-exploitable notes are recorded as L-10.

---

## 6. Known Green-Gate Gaps — revalidated, not assumed

Every documented gap was re-attacked. **All reproduce exactly as documented.**

| ID | Claim in `CLAUDE.md` §8 | Re-tested result | Final state |
|---|---|---|---|
| **F-03** | `.js` files carry no guardrails | A `support/*.js` with `process.env` **and** `waitForTimeout` lints clean, exit 0 | **OPEN — NON-BLOCKING** (as documented) |
| **F-06** | Steps may import `playwright-core` | Step launching its own browser via `playwright-core` lints clean, exit 0 | **OPEN — NON-BLOCKING** (as documented) |
| **F-07** | Aliased `setWorldConstructor` escapes A4 | `import { setWorldConstructor as swc }` + `swc(SecondWorld)` passes A4, exit 0 | **OPEN — NON-BLOCKING** (as documented) |
| **F-08** | A5 sees only `PropertyDeclaration`; getters and parameter properties escape | Confirmed by reading A5's `getClassPropertyNames`. Not fixture-tested: `support/world.ts` is protected infrastructure and was not modified | **OPEN — NON-BLOCKING** (as documented) |
| **F-09** | `*.spec.js` passes the gate | Lints clean, exit 0 | **OPEN — NON-BLOCKING** (as documented) |
| **F-10** | `.ts` outside `src`/`support`/`features` is never typechecked | `tools/untyped.ts` with `const x: number = "str"` → `tsc --noEmit` exit **0**. Control: same error in `src/` → exit **2**, TS2322 | **OPEN — NON-BLOCKING** (as documented) |
| **F-11** | `await import('@playwright/test')` escapes G1 | Passes, exit 0 | **OPEN — NON-BLOCKING** (as documented) |
| **F-12** | The `architecture.test.ts` comment is obsolete; ESLint *does* block destructuring | Confirmed: destructuring **BLOCKED** | **CONFIRMED — comment still stale (L-06)** |
| **F-13** | Aliasing `process` itself escapes G3 | `const p = process; p.env.X` passes, exit 0 | **OPEN — NON-BLOCKING** (as documented) |
| **F-15** | Component escapes `root` via the constructor's local `page` | Passes both A11 and ESLint, exit 0 | **OPEN — NON-BLOCKING** (as documented) |
| **F-16** | `oracledb` via default/namespace `node:module` import | `import nodeModule from 'node:module'`, `import * as nodeModule`, and a two-hop loader alias all pass A6, exit 0 | **OPEN — NON-BLOCKING** (as documented) |
| **T19 R-4** | Possible race in `expectOnCheckoutInformationForm()` | See §7 | **OPEN — NON-BLOCKING (LOW)** — race did not reproduce |

The documentation of these gaps is honest and precise. That is exactly why the *undocumented* gap (H-01) matters.

---

## 7. T19 finding R-4 — probed directly

R-4 claimed `expectOnCheckoutInformationForm()` — `waitForUrlContains('checkout-step-one')` immediately after clicking Continue — could pass in the instant *before* a real navigation, making the negative assertion true by construction.

**Probe**, run in a throwaway `git archive` copy; the repository itself was never modified: the negative scenario was given a *valid* postal code, so the application genuinely navigates to `checkout-step-two.html`. A sound assertion must fail; a racy one passes on the stale URL.

**Result: the assertion failed correctly in 4 of 4 runs**, raising the expected `toHaveURL` error from `BasePage.waitForUrlContains`. Playwright's auto-retrying `toHaveURL` combined with SauceDemo's synchronous, click-driven location change closes the window in practice.

R-4 remains a legitimate *pattern* caution — an assertion whose expected state is also the current state cannot detect a delayed navigation in an app that navigates asynchronously — but it is not an active defect here, and the scenario is additionally protected by the following step, which asserts the error element's text positively. **Confirmed OPEN — NON-BLOCKING (LOW).**

---

## 8. Are the tests real? — assertion honesty

A suite that cannot fail proves nothing, and 20 steps in ~1.4 s warranted a check.

- **Cold, tracked-files-only checkout:** 4.1 s. **Warm:** 1.4 s. SauceDemo is a fully client-side application, so once the page is cached every subsequent interaction is local DOM work. The timing is legitimate.
- **Negative control:** pointing `SAUCEDEMO_BASE_URL` at a non-existent path produced **2 scenarios failed, 2 steps failed, 18 skipped, exit 1**, failing inside `SauceDemoLoginPage.login` → `BaseUiObject.fill` → `waitForVisible`.

The canonical E2E genuinely drives a real browser against the real site and genuinely fails when the application is wrong. `automation-reviewer` reached the same conclusion independently during dry run C, having investigated the same timing on its own initiative.

---

## 9. Continuous Integration

`.github/workflows/ci.yml` audited from scratch.

| Requirement | Result |
|---|---|
| Node compatible with `engines` (`>=24.12`) | **PASS** — `node-version: '24'` resolves to the newest 24.x |
| `npm ci` | **PASS** |
| Browser install | **PASS** — `npx playwright install --with-deps chromium` |
| `npm run quality` | **PASS** |
| `npm test` | **PASS** |
| `SAUCEDEMO_BASE_URL` explicit | **PASS** — declared in workflow `env`, not left to the code default |
| `DB_ENABLED=false` | **PASS** |
| No `BASE_URL` / `playwright.dev` | **PASS** |
| Minimal permissions | **PASS** — `permissions: contents: read` |
| Timeout | **PASS** — `timeout-minutes: 15` |
| Artifacts / reports | **PASS** — `if: always()` + `if-no-files-found: ignore` |
| No hardcoded secrets | **PASS** — zero `secrets.` references; all four `env` values public |

**The exact command sequence CI runs was reproduced locally with CI's exact environment** (`SAUCEDEMO_BASE_URL=https://www.saucedemo.com HEADLESS=true BROWSER=chromium DB_ENABLED=false`); both `npm run quality` and `npm test` passed. CI was not modified. Two minor observations are recorded as L-08.

---

## 10. Fresh Clone / Developer Experience

A **tracked-files-only** checkout was produced with `git archive HEAD` — no `.env`, no `node_modules`, no local state, no ignored files — and exercised.

| Step | Result |
|---|---|
| `npm run quality` | **PASS** — exit 0, 62/62 tests, 23 suites |
| `npm test` | **PASS** — exit 0, 2 scenarios / 20 steps |

No `.env` was needed — the public default in `src/config/index.ts` carries it — no `BASE_URL` had to be set, no global config, no versioned `settings.local.json`, no versioned MCP artifacts. `.gitignore` correctly excludes `.env`/`.env.*` while keeping `.env.example`, `reports/**` while keeping `.gitkeep` (both verified with `git check-ignore`), `.claude/settings.local.json`, and `.playwright-mcp/` — the last two verified present on disk and confirmed ignored. `.claude/settings.local.json` contains only `enabledMcpjsonServers: ["playwright"]`; it weakens no permission. `.gitattributes` normalizes to LF and Prettier's `endOfLine: "auto"` absorbs the Windows difference — `format:check` passed on Windows throughout this audit.

**Fresh-clone friction: effectively zero.**

---

## 11. Documentation Consistency

| Check | Result |
|---|---|
| Documented paths exist | **PASS** — every `path.ext` reference in `README.md`/`CLAUDE.md` resolves; remaining apparent misses are bare basenames used in prose |
| Documented npm scripts exist | **PASS** — every script named across README, CLAUDE.md, AGENTS.md, both agent contracts and the skill exists in `package.json` |
| Canonical example exists and is coherent | **PASS** |
| Config documented matches code | **PASS** — all 9 variables in `README.md`'s table match `src/config/index.ts` and `.env.example` |
| Component absence described correctly | **PASS** in 5 places, **1 contradiction** (L-05) |
| DB Example differentiated from the UI example | **PASS** |
| CI description matches `ci.yml` | **PASS** |
| MCP version coherent | **PASS** — `.mcp.json` `0.0.80` = `claude mcp get` = T18's recorded pin; T17's `@latest` is superseded and dated |
| Agent tool lists match runtime | **PASS** — all three exact |
| `[[` wiki-links in operative docs | **PASS** — zero, in operative *and* historical docs |
| `CLAUDE.md` §7.2 A-invariant list | **PASS** — 11 named (A1–A12 minus A8) = 11 `describe` blocks in `src/architecture.test.ts` |
| `CLAUDE.md` §7.4 test count | **FAIL** — says 61, actual 62 (L-01) |
| `CLAUDE.md` §8 guarantee | **FAIL** — "no se puede romper la jerarquía UI" is false (H-01) |
| `CLAUDE.md` §9 protected list vs `settings.json` | **FAIL** — omits 4 protected paths (M-01) |
| AI layer documented in README/AGENTS/CLAUDE.md | **FAIL** — zero mentions anywhere (M-02) |

---

## 12. AI Agents

`claude plugin validate .claude/agents --strict --json` → `{"success": true, "strict": true, "manifest": null, "contents": []}`.

**This green is vacuous.** `manifest: null` and `contents: []` mean the validator inspected **zero files**: `claude plugin validate` expects a plugin root containing `.claude-plugin/plugin.json`, and project-scoped `.claude/agents/*.md` are not a plugin. Re-running it against `.claude` itself returns the same empty result. The command named in the audit protocol therefore cannot validate these definitions (M-03). Validation was instead performed by two methods that do carry evidence: the **runtime registry** (§3.5) and **live dry runs** (§13).

| Agent | Requirement | Verdict |
|---|---|---|
| `qa-analyst` | no MCP, no shell, no write | **PASS** — `tools: Read, Grep, Glob`; the contract states MCP is deliberately withheld and explains why (*"MCP es para observar qué pasa; vos determinás qué debería pasar"*) |
| `automation-engineer` | MCP authorized; PLAN before IMPLEMENT; current allowed/protected paths; current canonical examples; no references to deleted files | **PASS with one contradiction** — canonical examples all point at live SauceDemo files, Component absence correctly stated, two-mode gating explicit and enforced in practice. Contradiction at line 136 (M-04) |
| `automation-reviewer` | read-only repo, smaller MCP subset, runs its own quality/E2E, does not trust the Engineer | **PASS, demonstrated** — no `Edit`/`Write`; 5 MCP tools vs the Engineer's 10, with the missing form-input tools called out explicitly in the prompt; independence proven live (§13, dry run C) |

---

## 13. qa-automate Skill

Contract audit of `.claude/skills/qa-automate/SKILL.md` — every required property is explicitly present:

| Property | Where |
|---|---|
| Gate 1 explicit | §GATE 1, line 63 |
| Gate 2 explicit | §GATE 2, line 85 |
| Silence ≠ approval | lines 22 and 71 |
| `CHANGES_REQUESTED` does not auto-correct | lines 28 and 124 |
| `VALIDATION_FAILED` stops the flow | line 106 |
| Protected infrastructure requires approval | lines 30–32 |
| Cycle limit defined | line 132 |
| Minimal handoffs, no temp files | lines 34–36 |
| No chain-of-thought handed to the Reviewer | lines 113–115 |

### Live dry runs — no code written; verified with `git status` after each

**A — incomplete requirement → Analyst must return `NEEDS_CONFIRMATION`. PASS.**
Given only *"Necesito automatizar el login de la aplicación…"*, `qa-analyst` returned `STATE: NEEDS_CONFIRMATION` with **5 `[blocking]` UNKNOWNs**, explicitly refused to assume SauceDemo was the target (*"Asumir SauceDemo sería inventar el ambiente → bloqueante"*), refused to invent credentials or the error text, correctly identified the **existing** partial coverage (`SauceDemoLoginPage.login()` and the existing Given step) so nothing would be recreated, flagged the credential-handling capability gap, and stopped rather than deriving the rest. Textbook `CLAUDE.md` §11 behaviour.

**B — plan touching protected infrastructure → must declare it and write nothing. PASS, and better than required.**
Given an approved analysis requiring a new Oracle repository, `automation-engineer` in `MODE: PLAN`:

- wrote **nothing** — `git status` clean before and after;
- declared `PROTECTED INFRASTRUCTURE IMPACT: src/database/RepositoryContainer.ts` with the exact one-line change and the authorization it would request under `CLAUDE.md` §9;
- reused the entire existing SauceDemo chain instead of recreating it;
- **used Playwright MCP against the real site**, walked the full checkout to `checkout-complete.html`, enumerated every `[data-test]` element, and established that SauceDemo exposes **no order identifier anywhere** — then refused to implement the DB assertion because doing so would require inventing an `ORDER_ID`, citing `CLAUDE.md` §11;
- challenged the *approved* QA Analysis's `NEEDS CONFIRMATION: none` on the strength of that observation.

This is the strongest evidence in the audit that the workflow's data-honesty rule is real rather than aspirational.

**C — Reviewer independence and `CHANGES_REQUESTED` returning control. PASS, and it caught a planted lie.**
`automation-reviewer` was handed a QA Analysis, an Automation Plan and an Implementation Report describing work that did **not** exist, with fabricated evidence (`npm run test:ui PASS — 3 scenarios, 26 steps`). It:

- refused to accept the reported evidence and reproduced it itself, measuring **2 scenarios / 20 steps** — twice — and named the contradiction as finding R-2;
- proved the absence of the three claimed files via `git status`, `git diff`, `git diff --cached`, `git log` on those paths, `git stash list`, and direct reads;
- returned `VERDICT: CHANGES_REQUESTED` with two `[blocker]` findings and **edited nothing**;
- gave an explicit verdict on all 12 checklist items, using `n/a` where honest rather than silence;
- used its restricted MCP subset and then correctly declared in `NOT VERIFIED` that it could **not** confirm the login error text, *because it lacks `browser_type`/`browser_fill_form`* — exactly the self-limitation its contract demands;
- independently flagged the same `CLAUDE.md` §7.4 `61` vs `62` drift this audit found (L-01) as an `OUT-OF-SCOPE OBSERVATION`, and **refused to fix it**, honouring `CLAUDE.md` §14.

**D — user cancels → flow stops.** Verified by contract only (`SKILL.md:93`, *"Si cancela: terminá el flujo acá, sin invocar `MODE: IMPLEMENT`"*). This cannot be runtime-tested without fabricating a user decision, which this audit will not do.

---

## 14. MCP

| Check | Result |
|---|---|
| `claude mcp get playwright` | **Connected** — `Scope: Project config (shared via .mcp.json)`, `Type: stdio` |
| `.mcp.json` project-scoped | **PASS** |
| Version pinned as expected | **PASS** — `@playwright/mcp@0.0.80` |
| Engineer MCP works | **PASS** — demonstrated live in dry run B against `https://www.saucedemo.com/` |
| Reviewer MCP works with a smaller subset | **PASS** — demonstrated live in dry run C; 5 tools vs 10, and it correctly reported what it could not verify without the withheld tools |
| Analyst MCP unavailable | **PASS** — 0 MCP tools at runtime |
| `.playwright-mcp/` ignored | **PASS** — present on disk; `git check-ignore` confirms `.gitignore:79` |
| `.claude/settings.local.json` ignored | **PASS** — `.gitignore:72` |
| No credentials introduced | **PASS** |

---

## 15. Protected Infrastructure

`.claude/settings.json` declares 20 `permissions.ask` rules plus `deny: ["Read(/.env)"]`.

**`Edit(...)` is the correct and sufficient form.** T16.1 §4 verified against the official permissions documentation that Claude Code consults only `Edit(path)` and `Read(path)` rules for file access, that `Edit` rules cover file creation (`Write`) as well, and that a separate `Write(...)` rule would be *accepted but never consulted* — a silent false sense of security. This audit confirms the reasoning is sound and correctly applied: no inert `Write(...)` rules exist. `Read(/.env)` deny is intact.

**Discrepancies between the four layers that define "protected"** (detail in M-01):

| Path | `settings.json` | `CLAUDE.md` §9 | `automation-engineer.md` | `automation-reviewer.md` #10 |
|---|---|---|---|---|
| `src/base/**`, base classes, `support/*`, DB infra, `eslint.config.js`, `architecture.test.ts`, `tsconfig.json`, `cucumber.js`, `package.json`, `.github/workflows/**` | yes | yes | yes | yes |
| `package-lock.json` | **yes** | **no** | yes | no |
| `CLAUDE.md` | **yes** | **no** | yes | yes |
| `.claude/**` | **yes** | **no** | yes | yes |
| `.mcp.json` | **yes** | **no** | **no** | **no** |

`CLAUDE.md` §9 is the document both agents are instructed to *"tratá como ley"*, and it is the least complete of the four. `.mcp.json` is protected mechanically but appears in no contract at all.

**Two residual, structural notes:**

1. `automation-engineer` holds `Bash`. A shell rewrite of a protected file (`sed -i`, redirection) is not covered by an `Edit(...)` rule. The barrier there is contractual — the agent prompt explicitly forbids seeking a workaround after a denied confirmation — not mechanical. Recorded as L-11.
2. Whether the leading-slash pattern (`Edit(/CLAUDE.md)`) actually fires the `ask` prompt at runtime has still never been confirmed empirically. T13.1 §10, T16 §12 and T16.1 §11 all leave this open, and this audit does not close it either: doing so requires attempting a real edit to protected infrastructure, which `CLAUDE.md` §9 forbids without explicit user authorization. Recorded as L-12.

---

## 16. Security and Secrets

A regex sweep for passwords, tokens, API keys, bearer tokens, Oracle credentials, cookies, `storageState` and private keys across **all tracked files** (excluding `package-lock.json`) returned exactly **one** hit:

- `src/config/index.test.ts:182` — `DB_PASSWORD: 'app_password'`, a synthetic literal inside the unit test that verifies config storage. The neighbouring test asserts that `prod_user_do_not_leak` and `prod_connect_string_do_not_leak` **never** appear in a thrown error message — i.e. this file is the code that *proves* credentials do not leak.

`.env.example` contains no real values (all `DB_*` keys empty). `.env` is absent from the repository and from disk, and is git-ignored along with `.env.*`. No `storageState`, no cookies, no private URLs. CI carries zero secrets.

`standard_user` / `secret_sauce` are the public SauceDemo demo credentials — SauceDemo publishes them on its own login page, as `automation-reviewer` independently confirmed by snapshot during dry run C. They are explicitly documented as *"datos exclusivos del sitio público de demo, no corporativos ni secretos reales"* in `docs/refactor-progress-ia/T19-full-ai-mcp-automation.md` §Test data strategy. That statement lives only in a historical task record, not in `README.md`/`CLAUDE.md` (L-09). `README.md` §Security and Secrets correctly forbids committing real credentials.

**No real secret is present in this repository.**

---

## 17. Developer Experience

**A — QA with basic/intermediate programming.** Strong. To add a test they touch a `.feature`, a `.steps.ts`, a Page, and one line in `Pages.ts` — exactly `CLAUDE.md` §15's promise. Every guardrail message is a full sentence explaining the rule *and* the alternative (*"Interact through this.pages (Page Objects) instead"*), so a violation teaches instead of merely blocking. Zero-config first run is real.

**B — QA Automation Engineer.** Strong. The tag strategy is coherent (`@ui`/`@smoke`/`@regression`/`@db`), the locator convention is stated identically in four places, and the canonical SauceDemo flow demonstrates six Pages, a parameterized factory, and both a positive and a negative scenario. `test:db` honestly runs 0 scenarios and says so in three places.

**C — SDET maintainer.** Strong, with the caveat this audit is about. The guardrail inventory with an explicit *measured scope* column is unusually mature, and `eslint.config.js`'s flat-config re-listing warning is exactly the trap a maintainer would otherwise fall into. H-01 is the hole in that otherwise-excellent inventory.

**D — AI agent.** Good, and the weakest of the four — not because of friction but because of contract drift: the governing document never mentions the AI layer it governs (M-02), its protected list is incomplete (M-01), and two contracts still assert MCP is absent (M-04). An agent reading only `CLAUDE.md` gets an accurate picture of the *framework* and an incomplete one of *its own workflow*. The three dry runs nevertheless showed correct behaviour throughout.

**No unnecessary friction was found.** No guardrail in this repository fires on correct work; all 16 blocking rules required a deliberately wrong fixture.

---

## 18. Final Validation

Fixtures fully removed, tree returned to the audit baseline, then re-run with CI's exact environment:

| Gate | Exit | Result |
|---|---|---|
| `npm run quality` | 0 | **PASS** — 62 tests / 23 suites / 62 pass / 0 fail |
| `npm test` | 0 | **PASS** — 2 scenarios / 20 steps |
| `npm run test:ui` | 0 | **PASS** — 2 scenarios / 20 steps |
| `npm run test:smoke` | 0 | **PASS** — 1 scenario / 12 steps |
| `npm run test:regression` | 0 | **PASS** — 2 scenarios / 20 steps |
| `npm run test:db` | 0 | **PASS** — 0 scenarios (expected; no `@db` feature exists) |

`git status` → clean, apart from the two documents this audit is permitted to create.

---

## 19. Findings

### HIGH

**H-01 — `CLAUDE.md` §8 guarantees an invariant the toolchain does not enforce: the UI hierarchy can be broken with `npm run quality` green.**

- **Severity:** HIGH
- **Evidence:** `CLAUDE.md:231-233` states *"Lo que **sí** está garantizado hoy: … **no se puede romper la jerarquía UI** …"*. The UI guardrails are **path-anchored**: A9 filters to `src/pages/**`, A10/A11 to `src/components/**`, and G5's import ban lists only `**/src/pages/**`, `**/src/components/**`, `**/src/database/**`. Nothing constrains a UI class placed anywhere else under `src/`.
- **Reproduction** — executed; fixtures deleted afterwards:
  1. Create `src/screens/RogueScreen.ts` — a class that extends **nothing**, holds a raw `Page`, and exposes `goto(url)` plus `clickAnything(selector)` built from a raw CSS string.
  2. Create `features/steps/adv/rogue.steps.ts` that **imports it directly** and also calls `this.pages.sauceDemoLogin.goto('https://example.com/anything')` and `this.pages.sauceDemoInventory.reload()`.
  3. `npm run quality` → **exit 0, 62/62 tests, 0 failures.** `tsc`, ESLint and all 11 architecture invariants stay green.
- **Impact:** the archetype's central invariant — Steps stay thin, all UI goes through `BasePage`/`BaseComponent`, locators live in Pages — is bypassable in full without touching a single protected file. More importantly, because this gap is absent from `CLAUDE.md` §8's table, from `README.md`'s guardrail "Scope" column, and from `automation-reviewer`'s 12-point checklist (which names F-03, F-06, F-10, F-15 and F-16 by ID), **no reviewer — human or agent — is instructed to look for it.**
- **Mitigating factors:** requires deliberately non-idiomatic work; `automation-reviewer` checklist items 2 (scope) and 4 (architecture) would plausibly catch it, and Gate 2 puts the off-pattern path in front of a human before any file is written.
- **Recommendation (not implemented):** (a) correct the §8 sentence to claim only what is enforced — e.g. *"no se puede romper la jerarquía UI **dentro de `src/pages/**` y `src/components/**`**"*; (b) add a gap row to `CLAUDE.md` §8 and to `README.md`'s scope table covering both the off-path class and the public-navigation surface (M-05); (c) add one checklist line to `automation-reviewer.md` §4. Optionally and separately, consider an architecture test asserting that no class outside `src/pages/**`/`src/components/**` accepts a Playwright `Page` in its constructor — but the documentation fix alone restores the stated model.

### MEDIUM

**M-01 — `CLAUDE.md` §9's protected-infrastructure list is the least complete of the four layers that define it.**
`settings.json` protects `package-lock.json`, `CLAUDE.md`, `.claude/**` and `.mcp.json`; `CLAUDE.md` §9 names **none** of them, and `.mcp.json` appears in no contract document at all. Both agents are told to treat §9 as law. Additionally, T16.1 §1 asserts that `CLAUDE.md` §9 *"declara textualmente"* that `CLAUDE.md` and `.claude/**` are protected — it does not; only `SKILL.md` and `automation-engineer.md` do. **Impact:** an agent following §9 literally would believe `.claude/**` and `.mcp.json` are freely editable; the mechanical `ask` rule still fires, so defence in depth holds. **Recommendation:** add the four paths to §9 and `.mcp.json` to both agent contracts.

**M-02 — The entire Phase 2 AI layer is undocumented in `README.md`, `AGENTS.md` and `CLAUDE.md`.**
All three contain **zero** occurrences of `.claude`, `mcp`, `qa-analyst`, `automation-engineer`, `automation-reviewer` or `qa-automate`. `CLAUDE.md` opens by defining itself as the operating contract *"para Claude Code (y para cualquier agente derivado)"* yet never mentions the three derived agents, the orchestrating skill, the MCP server, or the `settings.json` permission model; §16 "Dónde buscar más" routes to no AI-layer document. **Impact:** a developer cloning the repository cannot discover the AI workflow exists; onboarding depends entirely on numbered task records under `docs/refactor-progress-ia/`, which are dated historical records, not operative documentation. **Recommendation:** a short "AI workflow" section in `README.md` and a corresponding new section in `CLAUDE.md`.

**M-03 — `claude plugin validate .claude/agents --strict --json` returns a vacuous green.**
Output: `{"success": true, "strict": true, "manifest": null, "contents": []}` — zero files inspected, because project-scoped `.claude/agents/*.md` are not a plugin (the validator wants a `.claude-plugin/plugin.json` root). Re-running against `.claude` gives the same empty result. **Impact:** the agent-definition validation step in this audit protocol — and in any future protocol copying it — proves nothing while appearing to pass. **Recommendation:** replace it with the two checks that carry evidence (runtime tool-list comparison and a live read-only dry run), or introduce a real plugin manifest if plugin validation is genuinely wanted.

**M-04 — Two operative contracts assert Playwright MCP is absent, contradicting the shipped integration.**
`automation-engineer.md:136` — inside the **`MODE: IMPLEMENT`** section, the exact place locators are written — reads *"(hoy no tenés MCP, así que 'observación' es lo que ya está en el repo)"*. The same file's §Playwright MCP (lines 29–66) grants ten MCP tools and instructs their use *"en ambos modos"*, including IMPLEMENT. `SKILL.md:33` reads *"MCP sigue ausente: todo el flujo funciona sin él."* Both are stale relative to T17/T18. **Impact:** contradictory instruction to the only write-capable agent about how it may source a locator; the conservative reading would suppress exactly the MCP-grounded verification T18/T19 introduced and make its own `SOURCE: MCP_OBSERVED` marker unreachable. **Evidence it is survivable:** in dry run B the Engineer used MCP correctly and extensively in `MODE: PLAN`, and the shipped SauceDemo pages carry `MCP_OBSERVED` provenance comments. **Recommendation:** delete both stale clauses. `qa-analyst.md:46`'s *"no tenés MCP y no lo vas a tener"* is **correct and deliberate** — leave it.

**M-05 — `BasePage`'s navigation API is public, so a Step can navigate anywhere.**
`goto()`, `reload()` and `waitForUrlContains()` carry no access modifier. A Step may call `this.pages.<anyPage>.goto('https://anything')` — bypassing `requireSauceDemoBaseUrl()` and central configuration, and implementing browser automation inside a Step — with no guardrail firing (verified: ESLint and full `npm run quality` exit 0). `CLAUDE.md` §4 permits `this.pages` without qualifying which members. **Impact:** hardcoded URLs can re-enter through the one door the architecture left open. **Recommendation:** document it in §8 alongside H-01; a stricter fix (Pages expose only intention-named methods; navigation becomes `protected`) is a design decision for a maintainer.

### LOW

| ID | Finding | Evidence |
|---|---|---|
| **L-01** | `CLAUDE.md` §7.4 states `61 tests / 23 suites`; actual is **62 / 23**. T19.1 §155 already records 62. Independently flagged by `automation-reviewer` during dry run C. | `CLAUDE.md:205` |
| **L-02** | `README.md` says *"a recent LTS. CI runs Node 24; any reasonably current Node version works locally"*, but `engines.node` is `>=24.12` and `test:unit` relies on Node's native TypeScript type stripping. A contributor on Node 20 gets a confusing failure, not a clear engine error. | `README.md:167` vs `package.json` |
| **L-03** | The "A step, in full" snippet in the canonical-example section shows `Given('I log in as a valid SauceDemo user', …)`, which exists in no steps file; the real step is `'I log in to SauceDemo as {string} with password {string}'`. | `README.md:286-288` vs `features/steps/sauceDemo/checkout.steps.ts:5` |
| **L-04** | `README.md` describes SauceDemo as a *"free, public, **no-login** demo store"*, yet the canonical flow's first step is a login. | `README.md:268` |
| **L-05** | `README.md`'s Project Structure block annotates `components/` as *"BaseComponent + concrete components"*, contradicting its own §Components (*"There is no concrete Component in this repo today"*) and §Current Limitations. | `README.md:145` |
| **L-06** | The comment at `src/architecture.test.ts:22-29` describes `const { env } = process` as a deliberately-open gap. ESLint blocks it (verified). The comment is obsolete — this is `CLAUDE.md` §8's F-12, still open. | `src/architecture.test.ts:22-29` |
| **L-07** | `.env.example` has no trailing newline (last byte is `=`). Cosmetic; `.env*` is outside Prettier's scope. | `.env.example` |
| **L-08** | CI pins actions by major tag (`@v7`) rather than commit SHA, and triggers on both `push:` and `pull_request:` with no branch filter, so a PR runs the suite twice and every branch push runs it. Low risk given `contents: read` and zero secrets. | `.github/workflows/ci.yml:4-6,27-49` |
| **L-09** | That `standard_user`/`secret_sauce` are public demo credentials is stated only in `docs/refactor-progress-ia/T19-…md`, a dated historical record — not in `README.md` §Security and Secrets or `CLAUDE.md`. | `features/sauceDemo/checkout.feature:9,23` |
| **L-10** | `QueryBuilder` notes, neither exploitable today: `buildUpdate` merges `{...data, ...whereBinds}`, so a SET column literally named `<FIELD>_<index>` could collide with a WHERE bind name; and `buildOraclePagination` interpolates `baseQuery` unvalidated — by design, since it is repository-supplied and never external input. | `QueryBuilder.ts:270,189-193` |
| **L-11** | `automation-engineer` holds `Bash`; a shell rewrite of a protected file is not covered by an `Edit(...)` permission rule. The barrier is contractual (the prompt forbids seeking a workaround), not mechanical. | `automation-engineer.md:4,149-150` |
| **L-12** | It has still never been empirically confirmed that the leading-slash pattern (`Edit(/CLAUDE.md)`) actually fires the `ask` prompt at runtime. Open since T13.1 §10; not closed here, because closing it requires an unauthorized edit to protected infrastructure. | `.claude/settings.json`; T16.1 §11 |

### Observation — not a repository defect

In dry runs A and C, both agents appended a closing phrase after their mandated output block, which their contracts specify as *"sin texto antes ni después"*. The cause is a **user-level global instruction** outside this repository, not the agent definitions. It does not affect parsing — `STATE:`/`VERDICT:` remain the first field — and no repository change is warranted.

---

## 20. Final Verdict

# CONDITIONALLY READY

| Criterion | Required | Actual |
|---|---|---|
| BLOCKER findings | 0 | **0** |
| HIGH findings | 0 | **1** (H-01) |
| `npm run quality` | PASS | **PASS** — 62/62 |
| UI E2E | PASS | **PASS** — all five suites |
| CI coherent | yes | **yes** |
| Canonical example coherent | yes | **yes** — 0 broken operative references |
| Agents / skill coherent | yes | **mostly** — M-01, M-02, M-04 |
| MCP functional | yes | **yes** — connected, pinned, correctly tiered |
| Real human gates | yes | **yes** — verified by contract and by three live dry runs |
| No broken operative references | yes | **yes** |
| No secrets | yes | **yes** |
| DX acceptable | yes | **yes** — zero-config fresh clone |

The engineering is ready. The **contract layer** is not yet, on one specific point: `CLAUDE.md` §8 makes a guarantee the toolchain does not deliver, and the gap it hides is invisible to both the human and the agent reviewer. That is a documentation correction — no code change, no guardrail change, no relaxation of anything — but it must land before this archetype can honestly be handed to AI agents on the premise that the contract is the source of truth.

Everything required to reach `READY` is listed in H-01's recommendation plus M-01, M-02 and M-04. The MEDIUM and LOW findings do not compromise the happy path or any essential guardrail and can coexist with a `READY` verdict once documented.

---

## 21. Recommendation

**Before T21:** a single documentation-only task (suggested `T20.1`) closing H-01, M-01, M-02, M-04 and M-05.

- Files touched: `CLAUDE.md`, `README.md`, `.claude/agents/automation-engineer.md`, `.claude/agents/automation-reviewer.md`, `.claude/skills/qa-automate/SKILL.md`.
- All are protected infrastructure and require explicit user authorization under `CLAUDE.md` §9.
- Zero source-code changes. Zero guardrail changes.

Re-run this audit's §5 and §18 afterwards. The LOW findings can be swept in the same pass or deferred.

**T21 — SDET Playbook / Project Knowledge Guide is not executed here**, per the task instruction.
