# AI Automation Archetype — Final Readiness

**Date:** 2026-09-08
**Branch:** `feature/claude-ai-integration`
**Baseline commit:** `7c8f929` (docs: record final phase 2 adversarial audit)
**Node:** v24.13.1 · **npm:** 11.8.0
**Supersedes (as the current state):** [docs/ai-automation-archetype-final-audit.md](./ai-automation-archetype-final-audit.md) — that audit remains the authoritative record of what was found **before** T20.1 and was deliberately left unmodified.
**Task record:** [docs/refactor-progress-ia/T20.1-contract-coherence.md](./refactor-progress-ia/T20.1-contract-coherence.md)

---

## 1. Verdict

# READY

| Criterion | Required | Actual |
|---|---|---|
| BLOCKER findings | 0 | **0** |
| HIGH findings | 0 | **0** |
| `npm run quality` | PASS | **PASS** — exit 0, 62 tests / 23 suites / 62 pass / 0 fail |
| `npm test` | PASS | **PASS** — exit 0, 2 scenarios / 20 steps |
| `npm run test:ui` | PASS | **PASS** — exit 0, 2 scenarios / 20 steps |
| Guardrails intact | yes | **yes** — no change to ESLint, architecture tests, CI, `package.json`, `.mcp.json` or `.claude/settings.json` |
| Contract matches the toolchain | yes | **yes** |

`READY` here means one specific thing: **the contract now describes what the toolchain actually
enforces.** It does not mean the archetype has no gaps. Two MEDIUM and six LOW findings remain
open and non-blocking; every one of them is named below, in `CLAUDE.md` §8, and — where an agent
can catch it — in the `automation-reviewer` checklist. An archetype that claimed zero gaps would
be reintroducing exactly the defect T20 found.

## 2. How this differs from the T20 audit

T20 verdict: **CONDITIONALLY READY** — 0 BLOCKER, 1 HIGH, 5 MEDIUM, 12 LOW.

The single HIGH was not a code defect. `CLAUDE.md` §8 guaranteed that *"no se puede romper la
jerarquía UI"*, and T20 falsified that by execution: a Page-like class outside `src/pages/**`,
imported straight into a Step, plus the public `BasePage.goto()` called from that Step, passes
`npm run quality` with exit 0 and 62/62. The UI guardrails are **path-anchored**, and nothing
constrains a UI class placed elsewhere.

T20.1 corrected the contract layer only — zero source, guardrail, CI or permission changes — and
closed H-01, M-01, M-02 and M-04. **The bypass itself was not removed and is not claimed to be
removed.** What changed is that it is now declared, scoped, and assigned to a reviewer.

## 3. What is machine-enforced

Green `npm run quality` is proof of correctness **only inside the measured scope below**.

| Guarantee | Enforced by |
|---|---|
| No parallel runner can be introduced through the project's scripts or CI | G1, G7, G8, A1, A2, A3 |
| Inside `src/pages/**`, every concrete class extends `BasePage` | A9 |
| Inside `src/components/**`, every concrete class extends `BaseComponent` | A10 |
| Inside `src/components/**`, no class accesses `this.page` | A11 (see F-15) |
| A Step cannot touch `this.page`/`this.context`/`this.browser`, import `playwright`/`@playwright/test`/`oracledb`/`src/pages/**`/`src/components/**`/`src/database/**`, call `waitForTimeout`, or read `process.env` | G5, G2, G3, G4 |
| `oracledb` is referenced only from `OracleDatabaseClient.ts` | G4 + A6 (see F-16) |
| `process.env` is read only from `src/config/**` and `*.test.ts` | G3 (see F-13) |
| Every `.feature` carries at least one tag | A7 |
| No silently dead test can exist | A12 |
| `CustomWorld` declares only infrastructure state | A5 (see F-08) |
| `QueryBuilder` never builds SQL without binds; identifiers go through an allowlist | 21 unit tests |
| No secret is committed | verified by sweep in T20 §16 |

## 4. What is not machine-enforced

These depend on human review and on `automation-reviewer`. All reproduce exactly as documented —
T20 re-attacked every one of them.

| ID | Gap | Watched by |
|---|---|---|
| **F-17** (was H-01) | A UI-like class **outside** `src/pages/**` / `src/components/**` — extending nothing, holding a raw `Page`, imported directly by a Step — passes the entire gate | Reviewer #3, #4 · Engineer PLAN (`ARCHITECTURE DEVIATION`) + IMPLEMENT |
| **F-18** (was M-05) | `BasePage.goto/reload/waitForUrlContains` are public, so a Step can navigate anywhere and hardcode a URL past central config | Reviewer #3 · Engineer IMPLEMENT · `CLAUDE.md` §4.1 |
| F-03 | `.js` files carry no guardrails at all | Reviewer #12 |
| F-06 | A Step may import `playwright-core` and launch its own browser | Reviewer #3 |
| F-07 | An aliased `setWorldConstructor` escapes A4 | review |
| F-08 | A5 sees only `PropertyDeclaration`; getters and parameter properties escape | review |
| F-09 | A `*.spec.js` passes the gate | Reviewer #12 |
| F-10 | A `.ts` outside `src/`/`support/`/`features/` is never typechecked | Reviewer #12 |
| F-11 | `await import('@playwright/test')` escapes G1 | review |
| F-12 | The rationale comment at `src/architecture.test.ts:22-29` is obsolete (ESLint *does* block `const { env } = process`) | review — see L-06 |
| F-13 | Aliasing `process` itself escapes G3 | review |
| F-15 | A Component can build a page-wide locator from the constructor's local `page` parameter | Reviewer #4 |
| F-16 | `oracledb` via a default/namespace `node:module` import, or a multi-hop loader | Reviewer #8 |
| L-11 | `automation-engineer` holds `Bash`; a shell rewrite of a protected file is not covered by an `Edit(...)` permission rule — that barrier is contractual, not mechanical | contract · `CLAUDE.md` §9 |
| L-12 | It has never been empirically confirmed that the leading-slash permission pattern (`Edit(/CLAUDE.md)`) fires the `ask` prompt at runtime | contract · `CLAUDE.md` §9 |

Also review-enforced, by design: the locator conventions (static → `private readonly`,
parameterized → private factory), "keep Steps thin", and "reuse before creating".

## 5. Open findings

| ID | Severity | State | Why it stays open |
|---|---|---|---|
| **M-03** | MEDIUM | **OPEN — NON-BLOCKING** | `claude plugin validate .claude/agents --strict --json` returns `success: true` with `manifest: null, contents: []` — zero files inspected, because project-scoped agents are not a plugin. No proven static validator exists for them, and none was invented. The false claim is gone: `SKILL.md` now says the command validates nothing. Real validation = runtime discovery + effective tool list + controlled dry run. **Tooling limitation.** |
| **M-05 / F-18** | MEDIUM | **OPEN — NON-BLOCKING** | `BasePage`'s navigation methods are still public. Making them `protected` and exposing only intention-named Page methods is a design decision for a human maintainer, out of scope for a documentation task. Covered by contract (`CLAUDE.md` §4.1) and by review (Engineer + Reviewer). |
| L-06 | LOW | OPEN — NON-BLOCKING | Obsolete comment in `src/architecture.test.ts`; that file was explicitly out of scope for T20.1. |
| L-07 | LOW | OPEN — NON-BLOCKING | `.env.example` has no trailing newline. Cosmetic. |
| L-08 | LOW | OPEN — NON-BLOCKING | CI pins actions by major tag rather than SHA; `push` + `pull_request` with no branch filter runs the suite twice on a PR. Low risk: `contents: read`, zero secrets. |
| L-10 | LOW | OPEN — NON-BLOCKING | Two theoretical, non-exploitable `QueryBuilder` notes (bind-name collision shape; repository-supplied `baseQuery` interpolation in pagination). |
| L-11 | LOW | OPEN — NON-BLOCKING | See §4. |
| L-12 | LOW | OPEN — NON-BLOCKING | See §4. |
| T19 R-4 | LOW | OPEN — NON-BLOCKING | Assertion-pattern caution in `expectOnCheckoutInformationForm()`. Probed 4/4 in T20 against a genuinely navigating case: the assertion failed correctly every time. Not an active defect. |

Closed by T20.1: **H-01, M-01, M-02, M-04**, and LOW **L-01, L-02, L-03, L-04, L-05, L-09**.

## 6. The AI layer

```text
/qa-automate                     skill — the orchestrator is the main session, not a fourth agent
      ↓
qa-analyst                       requirement → scenarios → UNKNOWNs
      ↓
GATE 1                           human approval of the QA Analysis
      ↓
automation-engineer  MODE: PLAN  proposes REUSE / CREATE / MODIFY — writes nothing
      ↓
GATE 2                           human decision: Approve / Request changes / Cancel
      ↓
automation-engineer  MODE: IMPLEMENT + literal marker `PLAN APPROVED`
      ↓
automation-reviewer              independent, read-only over the repo
```

| Agent | Repo write | Shell | Playwright MCP |
|---|---|---|---|
| `qa-analyst` | none | no | **0 tools** — withheld deliberately |
| `automation-engineer` | `Edit`, `Write` | yes | **10 tools** |
| `automation-reviewer` | none | yes | **5 tools** — a strict subset, no form-input tools |

Verified in T20 against the harness's own runtime registry, not against the files, and exercised
in three live dry runs: the Analyst refused to invent an environment or credentials; the Engineer
declared a protected-infrastructure impact, wrote nothing in `MODE: PLAN`, and refused to
implement a DB assertion that would have required inventing an ID; the Reviewer rejected fabricated
evidence handed to it, reproduced the real numbers itself, and returned `CHANGES_REQUESTED` without
editing anything.

Non-negotiable flow rules: gates are human; silence is never approval; `CHANGES_REQUESTED` returns
control to the user; `VALIDATION_FAILED` stops the flow; no auto-approval and no silent approval;
the Reviewer receives only the three handoff documents plus the working tree, never the Engineer's
transcript; and a green gate never substitutes for the review.

**MCP:** `@playwright/mcp@0.0.80`, project-scoped via `.mcp.json`, connected. It is for
**observation** — accessibility tree, roles, accessible names, URLs — never for deciding a business
rule, a scenario, a value, or architecture. Literals grounded in it are marked
`SOURCE: MCP_OBSERVED`.

## 7. Evidence

Run on the T20.1 working tree, after all documentation changes:

| Gate | Exit | Result |
|---|---|---|
| `npm run quality` | 0 | **PASS** — 62 tests / 23 suites / 62 pass / 0 fail |
| `npm test` | 0 | **PASS** — 2 scenarios (2 passed) / 20 steps (20 passed) |
| `npm run test:ui` | 0 | **PASS** — 2 scenarios (2 passed) / 20 steps (20 passed) |

Identical to the T20 baseline, as expected: T20.1 modified six Markdown files, and `*.md` is in
`.prettierignore`, so nothing the gate measures was touched. `git status` confirms no change under
`src/**`, `features/**`, `support/**`, `.github/workflows/**`, or to `eslint.config.js`,
`src/architecture.test.ts`, `tsconfig.json`, `cucumber.js`, `package.json`, `package-lock.json`,
`.mcp.json`, `.claude/settings.json`.

The E2E suite is real: T20's negative control (pointing `SAUCEDEMO_BASE_URL` at a non-existent
path) produced 2 scenarios failed, exit 1.

## 8. Where to look

| Need | File |
|---|---|
| Operating contract for any AI agent | `CLAUDE.md` — §7/§7.5 machine-enforced and its scope, §8/§8.1 review-enforced, §9 protected infrastructure, §17 the AI layer |
| Usage, setup, tags, commands, guardrail scope table | `README.md` |
| Architecture map for contributors | `AGENTS.md` |
| Agent contracts | `.claude/agents/*.md` |
| Workflow orchestration | `.claude/skills/qa-automate/SKILL.md` |
| Permission model | `.claude/settings.json` |
| Adversarial audit that produced these findings | `docs/ai-automation-archetype-final-audit.md` |
| Contract-coherence pass that closed them | `docs/refactor-progress-ia/T20.1-contract-coherence.md` |
| Per-guardrail design rationale | `docs/refactor-progress-ia/` |

## 9. Next

**T21 — SDET Playbook / Project Knowledge Guide**, now unblocked. Not executed here.

The Playbook should inherit §3 and §4 of this document rather than re-deriving them, and must not
restate a guarantee the toolchain does not deliver — that is the specific failure this readiness
pass exists to prevent from recurring.
