# AI Agent Architecture Plan

**Date:** 2026-09-07
**Status:** DESIGN ONLY — nothing implemented. No agent, no `.claude/`, no MCP, no skill.
**Task:** T12 (Phase 2 — Claude Code + agents + Playwright MCP)
**Branch:** `feature/claude-ai-integration`
**Baseline commit:** `a1855eb` (chore: normalize cross-platform line endings)
**Governing contract:** `CLAUDE.md` — this plan is subordinate to it. Where they disagree, `CLAUDE.md` wins.

---

## 1. Executive Summary

**Decision: three specialized agents, orchestrated by the main Claude Code session.**

| Agent | Mode | Model tier | Writes code? | MCP later |
|---|---|---|---|---|
| `qa-analyst` | read-only, no shell | high-reasoning | **no** | **no** |
| `automation-engineer` | write, scoped shell | mid, escalates | yes (scoped) | **yes** (primary consumer) |
| `automation-reviewer` | read-only + read-only shell | high-reasoning | **no** | yes, limited |

**Not created:** `orchestrator`, `automation-planner`, and nine other candidate agents (§14).

Two arguments decided the shape:

1. **The workflow has human gates, so the coordinator must be the actor that owns the user
   channel.** Approving an analysis and approving a file plan are *user* decisions
   (`CLAUDE.md` §10 step 10, §11). A subagent cannot hold a dialogue with the user, so an
   "Orchestrator" subagent would have to bounce every question back through the main session
   anyway — an extra lossy hop with no authority. The main session already *is* the orchestrator.
2. **Independence is worth an agent; planning is not.** This repository has direct evidence:
   `docs/ai-foundation-readiness-final.md` was written by an audit that explicitly refused to take
   the T10.x corrective records at face value, and it found two real gaps (F-15, F-16) that the
   agents doing the corrective work had not reported. A reviewer that inherits the implementer's
   reasoning finds nothing. A *planner* that hands prose to an implementer, by contrast, throws
   away exactly the repo context (constructor signatures, existing locator conventions, what
   `Pages.ts` already composes) that made the plan correct, and forces the implementer to re-read
   everything. Planning is a **phase** of the Engineer with a mandatory stop, not an agent.

The pipeline is therefore:

```text
user (HU / requirement)
  → qa-analyst            → QA Analysis        → [USER GATE: confirm / answer UNKNOWNs]
  → automation-engineer   → Automation Plan    → [USER GATE: approve file set]
  → automation-engineer   → implementation + quality + E2E
  → automation-reviewer   → APPROVED | CHANGES_REQUESTED
  → user commits (no agent ever commits)
```

Nothing in this design requires Playwright MCP. MCP is an **optional accelerator** for the
Engineer and (narrowly) the Reviewer; the whole flow must work — and will be implemented in T13 —
with MCP absent.

---

## 2. Goals

**Primary goal.** Make this exact sequence reliable and repeatable for a QA who is not a
full-time programmer:

```text
requirement → understand what to test → detect missing information → design scenarios and
validations → check what already exists → implement only what is needed → quality + E2E →
independent review
```

**Design goals.**

| # | Goal | How this plan serves it |
|---|---|---|
| G-1 | No invented business rules, data, selectors or URLs | The only agent that *interprets* a requirement is read-only and cannot write a test; every literal in generated code must carry a source (§12 FM-2) |
| G-2 | One scope per run | Handoffs carry a scope line; the Reviewer fails any file outside the approved plan |
| G-3 | Reuse before creating | It is a gated deliverable (the Plan lists `Reuse` before `Create`), not a hope |
| G-4 | Protected infrastructure stays protected | Denied at the permission layer *and* re-checked by the Reviewer (§7, §12 FM-3/FM-4) |
| G-5 | The QA never orchestrates by hand | One entry point; the main session drives (§13) |
| G-6 | Affordable | No Orchestrator, no Planner, mid tier for the token-heavy role, handoffs capped at one page (§10) |

**Explicit non-goals for this architecture.**

- Not building capabilities the framework does not have. Auth/`storageState`, an API layer, test
  data management, screenshots/traces, structured logging, environment matrix, parallelism and
  retries are documented deliberate absences (`docs/ai-foundation-readiness-final.md` §12.5). No
  agent here assumes any of them.
- Not automating git history. No agent stages, commits or pushes (`CLAUDE.md` §13).
- Not replacing human review. `npm run quality` green is necessary and not sufficient
  (`CLAUDE.md` §8); the Reviewer agent raises the floor, the human keeps the final word.

**Anti-goals taken from the task brief, treated as acceptance criteria for this design:** no
duplicated responsibilities, no handoffs that exist only to move text, no agent too small to own a
decision, no agent powerful enough to change the architecture, no orchestration without value.

---

## 3. Alternatives Evaluated

### 3.1. The three candidates

- **A — 2 agents:** `analysis-planning`, `implementation-review`.
- **B — 3 agents:** `qa-analyst`, `automation-engineer`, `automation-reviewer`.
- **C — 4 agents:** `qa-analyst`, `automation-planner`, `automation-engineer`, `automation-reviewer`.

### 3.2. Comparison

| Criterion | A (2) | B (3) | C (4) |
|---|---|---|---|
| Clarity of responsibility | Medium — each agent owns two different jobs with different failure modes | **High** — analyse / build / judge; one verb each | High, but the planner/engineer split is artificial (both "decide the file set") |
| Duplication | Low by count, but *review duplicates implementation reasoning inside one head* | **None** | **Real**: Planner and Engineer must both read the same Pages/Components/Repositories |
| Handoffs | 1 | **2** | 3 |
| Context-loss risk | Low between agents, **high inside** the implement-then-review agent (it cannot forget its own rationalizations) | Low — the one lossy hop (plan → code) is eliminated by keeping planning inside the Engineer | **Highest** — the plan hop discards precise repo knowledge and re-reading is imperfect |
| Token cost | Lowest nominal, but a self-review that misses a defect costs a full extra cycle | **Moderate** — Reviewer sees the diff, not the repo; Engineer reads the repo once | **Highest** — the repo is explored twice for one change |
| Ease of use for a QA | Same in all three: the main session drives (§13) | Same | Same, plus one more approval prompt with no new decision in it |
| Error control | **Weak** — no independent verdict; the implementer grades its own work | **Strong** — a fresh context re-runs the gate and re-reads the diff against `CLAUDE.md` | Strong, but no stronger than B: the extra agent adds no verification |
| Scalability | Poor — adding UI + DB + future API work makes each agent's role vaguer | **Good** — roles are stable; new capability = new *skill* or Engineer knowledge, not a new agent | Good, at a permanent per-run cost |

### 3.3. Why A was rejected

A's fatal flaw is not the analysis/planning merge — it is `implementation-review`. The single most
expensive failure mode in this repo is *code that passes the gate while being architecturally
wrong or silently fabricated* (`CLAUDE.md` §8 lists five green-gate paths that remain: F-03, F-06,
F-10, F-15, F-16). Catching that requires reading the diff **without** the story that produced it.
An agent reviewing its own output has already decided its output is fine — every one of those five
paths is invisible to it, because in each case the agent chose the unusual form on purpose. A also
fails G-1: the actor that must say "UNKNOWN, I will not implement this" is the same actor whose job
is to produce code, and that pressure resolves toward inventing the missing rule.

### 3.4. Why C was rejected

See §14.2 for the full argument. Short version: the Planner's output is a list of files, and to
produce a *correct* list it must read the same code the Engineer must read to write it — so C pays
twice for one exploration and then transmits the result through prose, which is where the details
that matter (does `ExamplePage` already expose `linkByName`? what does `BaseComponent`'s
constructor require?) go missing. The valuable part of C is not the agent, it is the **gate**: the
user approving a file set before code exists. B keeps the gate and drops the agent.

### 3.5. Decision

**B — three agents.** Each additional split beyond B buys either nothing (C) or negative value (A).
Each of B's three agents owns a decision that the other two must not make, has a different
permission profile, and has a different failure mode.

---

## 4. Selected Architecture

```text
┌──────────────────────────────────────────────────────────────────────────┐
│  MAIN CLAUDE CODE SESSION  (orchestrator — the only actor talking to the │
│  user; holds the workflow state; passes handoffs; never bypasses a gate) │
└───┬──────────────────────┬───────────────────────────┬───────────────────┘
    │ 1. delegate          │ 3. delegate               │ 5. delegate
    ▼                      ▼                           ▼
┌──────────────┐     ┌──────────────────────┐   ┌──────────────────────┐
│ qa-analyst   │     │ automation-engineer  │   │ automation-reviewer  │
│ READ-ONLY    │     │ WRITE (scoped)       │   │ READ-ONLY (+ gate)   │
│              │     │  phase 1: PLAN ──────┼──▶│                      │
│ QA Analysis  │     │  phase 2: IMPLEMENT  │   │ APPROVED /           │
│              │     │  phase 3: VALIDATE   │   │ CHANGES_REQUESTED    │
└──────┬───────┘     └──────────┬───────────┘   └──────────┬───────────┘
       │ 2. USER GATE           │ 4. USER GATE             │ 6. verdict
       ▼                        ▼                          ▼
   confirm scope /        approve the file set        user reviews & commits
   answer UNKNOWNs        (Reuse / Create / Modify)   (agents never commit)
```

### AGENTS TO CREATE (T13)

1. **`qa-analyst`** — turns a requirement into scenarios, preconditions, data, validations, risks
   and an explicit list of what is unknown. Writes no code.
2. **`automation-engineer`** — plans the minimal file set, then implements it inside the QA-facing
   surface only, then runs `npm run quality` and the relevant E2E.
3. **`automation-reviewer`** — independently verifies requirement coverage, architecture
   compliance, scope and evidence. Emits a verdict. Changes nothing.

### AGENTS NOT NEEDED

`orchestrator` · `automation-planner` · `gherkin-writer` · `page-object-generator` ·
`locator-specialist` · `database/repository-specialist` · `test-data-generator` ·
`doc-updater` · `guardrail-maintainer` · `flaky-test-triager` · `ci-agent`

Reasons in §14.

---

## 5. Agent Responsibilities

### 5.1. `qa-analyst`

**Purpose.** Answer one question: *"What do we need to know before automating this, and what
exactly should be automated?"*

| | |
|---|---|
| **Inputs** | The requirement / user story / bug, verbatim, as provided by the user. Optionally: an existing `.feature` to extend, and the repo itself (read-only) to see which flows already exist. |
| **Output** | One **QA Analysis** (§8.1), ≤ 1 page. Nothing else. |
| **Reads** | `CLAUDE.md`, `README.md`, `AGENTS.md`, `features/**`, `src/pages/**`, `src/components/**`, `src/database/repositories/**`, `src/pageContainer/Pages.ts`, `docs/**` |
| **Never reads** | `.env` (secrets) |
| **Never writes** | anything — no `Edit`, no `Write`, no shell |

**Does:**

- Restates the expected behaviour in its own words, so a misreading becomes visible before code.
- Lists scenarios with stable ids (`S-1`, `S-2`, …), each marked positive or negative, each with a
  proposed Cucumber tag (`@ui`, `@db`, `@smoke`, `@regression` — the real tags, per `README.md`).
- Lists preconditions, test data, and validations split into UI / DB / other.
- Lists risks (ambiguity, dependence on absent capabilities, data that cannot be reset, etc.).
- Marks every gap as `UNKNOWN` or `NEEDS CONFIRMATION`, each labelled **blocking** or
  **non-blocking**, per `CLAUDE.md` §11.
- Notes when a requirement needs a capability the framework does not have (auth, API, test data
  management, screenshots, retries) instead of pretending it can be tested today.
- Says so plainly when existing coverage already satisfies part of the requirement.

**Does NOT:**

- write or sketch code, Gherkin syntax, step definitions, locators or SQL;
- decide which Page/Component/Repository to create — that is the Engineer's plan;
- decide a business rule, an expected result, a credential, an environment or a data value that
  was not given to it;
- explore the running application (no MCP — §11);
- claim a UI structure it has not been shown.

**Stop conditions (return immediately with what it has):**

- a blocking `UNKNOWN` makes the core behaviour undefined → return the analysis with the questions;
- the requirement needs an absent framework capability → return, naming the capability;
- the requirement is really several requirements → return, proposing a split (one scope per run);
- it is asked to implement, fix or run anything → return, restating that it is analysis-only.

### 5.2. `automation-engineer`

**Purpose.** Turn an **approved** analysis into the smallest correct change, and prove it.

| | |
|---|---|
| **Inputs** | The approved QA Analysis (§8.1) + the user's answers to its `NEEDS CONFIRMATION` items. |
| **Outputs** | Phase 1: an **Automation Plan** (§8.2) — then it stops. Phase 3: an **Implementation Report** (§8.3) with commands, exit codes and `git diff --stat`. |
| **Writes** | Only the QA-facing surface (§7.2) — which is deliberately the same list as `CLAUDE.md` §15. |
| **Runs** | `npm run quality`, the relevant E2E script, read-only git (§7.3). |

**Three phases, with a hard stop between 1 and 2:**

1. **PLAN.** Search the repo for what already exists (`Pages.ts`, existing Pages/Components,
   `RepositoryContainer`, existing steps and features). Produce `Reuse` / `Create` / `Modify` with
   exact paths and a one-line justification each, plus `Protected infrastructure impact` (expected:
   `NONE`) and the scenarios it will **not** implement because a blocking `UNKNOWN` remains.
   **Then stop and wait for the user.** No file is touched in phase 1.
2. **IMPLEMENT.** Only the approved paths, following the canonical examples
   (`features/example/example.feature`, `features/steps/example.steps.ts`,
   `src/pages/example/ExamplePage.ts`, `src/components/example/ExampleNavigationComponent.ts`,
   `src/database/repositories/example/ExampleRepository.ts`). Steps stay thin; locators are
   `private readonly` fields or private factory methods; a new Page gets its line in `Pages.ts`; a
   new Repository gets its property in `RepositoryContainer` — and since `RepositoryContainer.ts`
   is protected infrastructure, that one line requires the §9 authorization protocol, which the
   Plan must have flagged.
3. **VALIDATE.** `npm run quality`, then the relevant E2E by tag, then `git diff` /
   `git diff --stat`, then report — including failures, verbatim.

**Does NOT:**

- decide anything the analysis left `UNKNOWN` and blocking — it implements the rest and reports
  what it skipped (`CLAUDE.md` §11);
- write a selector, URL, credential or data value it cannot source (an existing Page, the user, or
  — once available — a real MCP observation);
- touch protected infrastructure, or relax any guardrail, ever (`CLAUDE.md` §9);
- fix an unrelated bug, refactor, or improve something it noticed — it reports it (`CLAUDE.md` §14);
- run `git add` / `commit` / `push` / `reset` / `clean`, or install dependencies;
- declare done while `npm run quality` is red.

**Stop conditions:**

- the analysis it received has a blocking `UNKNOWN` covering the whole scope → refuse and return;
- the plan was not approved → do not write;
- doing the job correctly *requires* protected infrastructure → stop and run the §9 protocol
  (reason → concrete change → files → wait for explicit authorization);
- a guardrail rejects the change → fix the change; if the only way forward looks like editing
  `eslint.config.js` or `src/architecture.test.ts`, stop and escalate (this is a hard stop, not a
  judgment call);
- `npm run quality` fails in `format:check` only, on files it never touched → isolate the stage and
  check whether the failure reproduces on a clean tree at the base commit before treating it as a
  code defect (the CRLF lesson of `docs/refactor-progress-ia/T11.1-line-endings.md`).

### 5.3. `automation-reviewer`

**Purpose.** Say `APPROVED` or `CHANGES_REQUESTED`, with evidence, from a context that never saw
the Engineer's reasoning.

| | |
|---|---|
| **Inputs** | The approved QA Analysis, the approved Automation Plan, the Implementation Report, and the working tree. **Not** the Engineer's transcript. |
| **Output** | One **Review Report** (§8.4): verdict + findings + evidence + out-of-scope observations. |
| **Reads** | The whole repo, read-only. Never `.env`. |
| **Runs** | `npm run quality`, the relevant E2E, read-only git. It re-runs the gate itself — a verdict based on the Engineer's reported exit codes is not independent. |
| **Writes** | nothing |

**Review checklist** (each item gets an explicit verdict, `n/a` allowed, silence is not):

1. **Requirement coverage** — every scenario in the analysis is implemented or explicitly listed as
   skipped-with-reason. No scenario invented that the analysis does not contain.
2. **Scope** — every file in `git diff` appears in the approved plan. Any extra file is a finding,
   including an unrequested formatting sweep.
3. **Steps thin** — steps use only `this.pages` / `this.repositories` / `this.testContext`; no
   Playwright import (including `playwright-core`, which G5 does **not** catch — F-06), no SQL, no
   `process.env`, no `waitForTimeout`.
4. **UI architecture** — Pages extend `BasePage`; Components extend `BaseComponent`, live inside
   `this.root`, never navigate, and do not build a page-wide locator from the constructor's local
   `page` parameter (A11 does **not** catch that — F-15). Components composed, not inherited.
5. **Locators** — static → `private readonly`; parameterized → private factory; no locator built
   inline inside an action or an assertion.
6. **Unsourced literals** — every selector, URL, id, user and data value traces to an existing
   Page, the user's own words, or a recorded observation. An unsourced literal is a finding
   regardless of whether the test passes.
7. **Assertions** — the test can actually fail. No assertion that is true by construction; the
   expected result matches the analysis, not the observed behaviour.
8. **Database** — values as binds; identifiers via the Repository's own allowlist; no SQL outside a
   Repository; `oracledb` referenced nowhere but `OracleDatabaseClient.ts` (including via
   `node:module` default/namespace import — F-16); `@db` tag present.
9. **Duplication** — nothing created that already existed; `Pages.ts` / `RepositoryContainer`
   wiring correct.
10. **Guardrails and protected infrastructure** — `eslint.config.js`, `src/architecture.test.ts`,
    `tsconfig.json`, `cucumber.js`, `package.json`, `support/**`, `src/base/**` and the base
    classes are untouched, and no guardrail was weakened. **Any change here is an automatic
    `CHANGES_REQUESTED`** unless the report shows explicit user authorization per §9.
11. **Evidence** — `npm run quality` exit 0 with the test count, and the relevant E2E result,
    reproduced by the Reviewer itself.
12. **Leftovers** — no temporary fixture, no `TODO` hiding missing behaviour, no `.js` framework
    code (F-03), no `.ts` outside the three typechecked roots (F-10), no `*.spec.*` (F-09),
    no `playwright.config.*`.

**Does NOT:** edit code, "just fix" a small finding, approve to be agreeable, or approve with
findings outstanding. It must also state what it did **not** verify (for example: DB scenarios it
could not execute because `DB_ENABLED=false`).

**Stop conditions:** the diff is empty; the plan or analysis is missing (it cannot review against
nothing); the diff is too large to be a single scope → `CHANGES_REQUESTED` with "split this".

---

## 6. Agent Boundaries

Who is allowed to decide what — the table that prevents the roles from bleeding:

| Decision | Owner | Never decided by |
|---|---|---|
| Business rule, expected result, credential, environment, data value | **User** | any agent (`CLAUDE.md` §11) |
| What is worth testing / scenario coverage | `qa-analyst` proposes → **user approves** | Engineer, Reviewer, MCP |
| Which files to create / reuse / modify | `automation-engineer` proposes → **user approves** | Analyst |
| How code must be shaped (architecture) | **`CLAUDE.md` + the guardrails** | every agent — it is inherited, not negotiated |
| Whether the change is acceptable | `automation-reviewer` | Engineer (no self-approval) |
| Touching protected infrastructure | **User**, via the §9 protocol | every agent |
| Relaxing a guardrail | **Human maintainer only** | every agent, unconditionally |
| Committing / pushing | **User** | every agent (`CLAUDE.md` §13) |
| What the UI actually contains (structure) | Observation — the repo today, MCP later | never a guess |

One-line version: **the Analyst decides nothing about code, the Engineer decides nothing about the
requirement, the Reviewer decides nothing at all except the verdict, and the user decides
everything that would otherwise have to be invented.**

---

## 7. Permissions

Design rule: **capability follows responsibility.** An agent that must not write gets no write
tool — the boundary is enforced by the tool list, not by asking it nicely.

### 7.1. Tool access

| Capability | `qa-analyst` | `automation-engineer` | `automation-reviewer` |
|---|---|---|---|
| Read / Grep / Glob | ✅ | ✅ | ✅ |
| Edit / Write | ❌ | ✅ (scoped, §7.2) | ❌ |
| Shell | ❌ **none** | ✅ (allowlist, §7.3) | ✅ (read-only subset) |
| Playwright MCP | ❌ (§11) | later ✅ | later ✅ limited |
| Spawn other agents | ❌ | ❌ | ❌ |

The Analyst gets **no shell at all**: it needs none (Grep/Glob cover repo search), and removing it
removes the entire git/`rm`/`npm` risk surface for that role. The Reviewer *does* get a shell,
because a reviewer that cannot re-run the gate has to trust the Engineer's numbers, which is not a
review.

### 7.2. Write allowlist — `automation-engineer` only

Deliberately identical to the QA-facing surface of `CLAUDE.md` §15:

```text
features/**/*.feature
features/steps/**/*.steps.ts
src/pages/**                     (except src/pages/base/**)
src/components/**                (except src/components/base/**)
src/pageContainer/Pages.ts
src/database/repositories/**     (except repositories/BaseRepository.ts)
**/*.test.ts                     only under src/**, support/**, features/** (A12)
docs/**                          task records / documentation updates
```

**Denied to every agent** (`CLAUDE.md` §9, plus secrets and agent self-modification):

```text
src/base/**
src/pages/base/**  ·  src/components/base/**
support/**                                  (world.ts, hooks.ts, databaseLifecycle.ts)
src/database/clients/**  ·  src/database/builders/**
src/database/repositories/BaseRepository.ts  ·  src/database/RepositoryContainer.ts
eslint.config.js  ·  src/architecture.test.ts  ·  tsconfig.json  ·  cucumber.js
package.json  ·  package-lock.json  ·  .github/workflows/**
CLAUDE.md  ·  .claude/**                    (no agent rewrites its own contract)
.env  ·  .env.*                             (never read, never written; .env.example is fine)
```

`RepositoryContainer.ts` being denied is intentional even though a new Repository needs one line
there: that line is exactly the moment a human should look. The Plan flags it, the user authorizes
it, the user or the session applies it.

### 7.3. Shell allowlist

| Command | Engineer | Reviewer |
|---|---|---|
| `npm run quality` / `typecheck` / `lint` / `format:check` / `test:unit` | ✅ | ✅ |
| `npm test`, `test:ui`, `test:smoke`, `test:regression`, `test:db` | ✅ | ✅ |
| `npm run format`, `npm run lint:fix` | ✅ (any unrelated file it reformats becomes a scope finding) | ❌ |
| `git status`, `git diff`, `git diff --stat`, `git log` | ✅ | ✅ |

**Denied to every agent, without exception:**

```text
git add  ·  git commit  ·  git push  ·  git reset  ·  git clean
git checkout / restore / stash / rebase / merge      (destructive to uncommitted work)
npm install  ·  npm ci  ·  npm update                (dependencies are protected — §9)
rm -rf and any bulk deletion
```

Note: running the E2E writes `reports/cucumber/*` — gitignored and expected, not a scope violation.

### 7.4. Capability assumptions to verify at T13

This design uses only capabilities Claude Code is expected to provide. Each must be **verified
against the installed version before writing the agent files**, and any mismatch reported rather
than worked around:

| Assumption | Needed for | Status |
|---|---|---|
| Subagents are defined as files under `.claude/agents/` with frontmatter for name/description/tools/model | all three agents | verify exact key names at T13 |
| A subagent's tool list can exclude write/shell tools | Analyst and Reviewer being genuinely read-only | verify |
| A subagent runs in its own context and returns a final report to the main session | independence of the Reviewer | verify |
| A per-agent model can be selected | §10 | verify (do not invent syntax; read the docs at T13) |
| Command/path-level permission rules (allow / deny) exist in settings | §7.2, §7.3 denials | verify; if path-level `Edit` denial is unavailable, the deny list degrades to contract-only and the Reviewer's check #10 becomes the primary defense — this must be stated, not silently assumed |
| MCP tools can be granted per agent | §11 | verify at MCP install time, not now |

**NEEDS CONFIRMATION (non-blocking for T12):** whether path-scoped write denial is available in the
installed version. It changes how strong §7.2 is, not the architecture.

---

## 8. Handoff Contracts

Three documents, each **≤ 1 page**, plain markdown, passed in the conversation. They are not
committed to the repo by default — persisting them is the user's choice, and `CLAUDE.md` §12
forbids leaving stray artifacts behind. Fields are mandatory: an empty section must say `none`,
because a missing section and an empty one are not the same claim.

### 8.1. QA Analysis (`qa-analyst` → user → `automation-engineer`)

```text
STATE: NEEDS_CONFIRMATION | READY_FOR_AUTOMATION
SCOPE: one or two lines — what is being automated, and explicitly what is not
EXPECTED BEHAVIOR: the rule as understood, restated
SCENARIOS:
  S-1 [positive|negative] [tags] intent (given / when / then in plain language)
  S-2 ...
PRECONDITIONS: state the system must be in before each scenario
TEST DATA: every value the test needs + where it comes from (given | to be provided | derived)
VALIDATIONS: UI: ... | DB: ... | other: ...
RISKS: ambiguity, absent framework capability, non-resettable data, timing
UNKNOWN: [blocking|non-blocking] the fact that is missing
NEEDS CONFIRMATION: the concrete question to ask the user
```

### 8.2. Automation Plan (`automation-engineer` → user)

```text
STATE: PLAN_PROPOSED
SCOPE: scenarios covered, by id (S-1, S-2) — and which are deferred, with the blocking UNKNOWN
REUSE:  path — what it already gives us
CREATE: path — why nothing existing fits
MODIFY: path — the exact change (e.g. "one line in Pages.ts")
PROTECTED INFRASTRUCTURE IMPACT: NONE | path + reason + the §9 authorization being requested
TESTS TO RUN: npm run quality; npm run test:ui (or the relevant tag)
```

### 8.3. Implementation Report (`automation-engineer` → user → `automation-reviewer`)

```text
STATE: READY_FOR_REVIEW
IMPLEMENTED: S-1, S-2  ·  NOT IMPLEMENTED: S-3 (blocking UNKNOWN: ...)
FILES: created / modified (must equal the approved plan)
SOURCES: for every selector / URL / data value — where it came from
EVIDENCE: npm run quality → exit N (tests X/Y); npm run test:ui → N scenarios, N steps, PASS/FAIL
GIT: git diff --stat output
OUT-OF-SCOPE FINDINGS: reported, not fixed (CLAUDE.md §14)
```

### 8.4. Review Report (`automation-reviewer` → user)

```text
VERDICT: APPROVED | CHANGES_REQUESTED
FINDINGS:
  R-1 [blocker|major|minor] file:line — what is wrong — the contract/rule it violates — required change
EVIDENCE: commands the reviewer ran itself, with exit codes and counts
CHECKLIST: the 12 items of §5.3, each pass / fail / n/a
NOT VERIFIED: what could not be checked, and why
OUT-OF-SCOPE OBSERVATIONS: reported, not fixed
```

**Why these fields and no more.** Every field either (a) is a decision the next actor cannot make
itself (scope, scenarios, approved paths), (b) is the thing that prevents fabrication (`TEST DATA`
provenance, `SOURCES`), or (c) is the evidence a verdict depends on. Anything else — narrative,
rationale, restated architecture — is already in `CLAUDE.md` and must not be re-transmitted per run.

---

## 9. Workflow States

Seven states. Three are human gates; the rest are an agent working.

```text
                ┌──────────────────────┐
                │      ANALYSIS        │  qa-analyst working
                └──────────┬───────────┘
                           ▼
                ┌──────────────────────┐
        ┌──────▶│ NEEDS_CONFIRMATION   │  ◀── GATE 1: user answers UNKNOWNs
        │       └──────────┬───────────┘
        │                  ▼
        │       ┌──────────────────────┐
        │       │ READY_FOR_AUTOMATION │  analysis approved by the user
        │       └──────────┬───────────┘
        │                  ▼
        │       ┌──────────────────────┐
        └───────│   PLAN_PROPOSED      │  ◀── GATE 2: user approves the file set
   (new gap     └──────────┬───────────┘
    found)                 ▼
                ┌──────────────────────┐
        ┌──────▶│    IMPLEMENTING      │  automation-engineer writing + validating
        │       └──────────┬───────────┘
        │                  ▼
        │       ┌──────────────────────┐
        │       │  READY_FOR_REVIEW    │  automation-reviewer working
        │       └──────┬────────┬──────┘
        │              │        │
        │  CHANGES_REQUESTED    │ APPROVED
        └──────────────┘        ▼
                        ┌──────────────────────┐
                        │      APPROVED        │  ◀── GATE 3: user reviews & commits
                        └──────────────────────┘
```

| State | Who acts | Exit condition |
|---|---|---|
| `ANALYSIS` | `qa-analyst` | analysis produced |
| `NEEDS_CONFIRMATION` | **user** | every blocking `UNKNOWN` answered, or explicitly deferred |
| `READY_FOR_AUTOMATION` | main session | Engineer invoked for phase 1 |
| `PLAN_PROPOSED` | **user** | file set approved (possibly reduced) |
| `IMPLEMENTING` | `automation-engineer` | quality + E2E run and reported, pass or fail |
| `READY_FOR_REVIEW` | `automation-reviewer` | verdict emitted |
| `APPROVED` | **user** | user commits — the workflow ends here, by design |

Rules that keep the machine small:

- **The only loop is `READY_FOR_REVIEW → IMPLEMENTING`, bounded at 2 cycles.** A third
  `CHANGES_REQUESTED` stops and escalates to the user; repeated review failure is a signal about
  the plan or the analysis, not something to grind on.
- **The Analyst is never re-invoked automatically.** If implementation exposes a new gap, the flow
  returns to `NEEDS_CONFIRMATION` — to the *user*, not to the Analyst. This makes an
  Analyst ↔ Engineer ping-pong structurally impossible (FM-7).
- A blocking `UNKNOWN` discovered at any point sends the workflow back to `NEEDS_CONFIRMATION`.
- No state is skipped, and no gate is self-approved: an agent may never advance a state whose exit
  condition is a user decision.

---

## 10. Model Strategy

Conceptual tiers only — the exact configuration key is read from the Claude Code docs at T13, not
invented here.

| Role | Recommended tier | Why | Token profile |
|---|---|---|---|
| Main session (orchestrator) | **high-reasoning** | holds the gates and the user dialogue; a coordination mistake here costs a whole cycle | small per turn |
| `qa-analyst` | **high-reasoning** | this is where fabrication risk lives: deciding what a requirement *means*, and having the discipline to say `UNKNOWN` instead of filling the gap. A cheap model is agreeable, and agreeable is exactly wrong here | small — no code, no long tool loops |
| `automation-engineer` | **mid, with escalation** | the work is pattern-following against one canonical example per pattern, which mid-tier does well; it is also the token-heaviest role by far (repo search + writing + gate runs) | large |
| `automation-reviewer` | **high-reasoning** | adversarial reading is exactly the skill that found F-15 and F-16 in this repo. A complacent reviewer is worse than none, because it manufactures false confidence | moderate — diff + contracts, not the whole repo |

**Escalate the Engineer to the high tier when:**

- the change introduces a pattern the repo has no example of (first real `@db` scenario, first
  Repository for a new entity, a UI + DB scenario in one flow);
- the plan reports any `PROTECTED INFRASTRUCTURE IMPACT`;
- the Reviewer returned `CHANGES_REQUESTED` once already;
- the analysis carries non-blocking `UNKNOWN`s that must be navigated without inventing anything.

**No role gets the cheapest tier.** Every one of the three either interprets a requirement, writes
code inside a contract with a dozen machine-checked invariants, or issues a verdict; the saving is
small and the cost of a miss is a test that lies. The saving comes from *structure* instead: no
Orchestrator agent, no Planner agent, one-page handoffs, the Reviewer reading a diff rather than a
repository, and one scope per run.

---

## 11. Future MCP Access

**MCP is not installed and this architecture must not require it.** T13 ships all three agents with
no MCP. When Playwright MCP arrives (T15+), access is granted like this:

| Agent | MCP later? | Scope |
|---|---|---|
| `qa-analyst` | **No** | — |
| `automation-engineer` | **Yes — primary consumer** | navigate, inspect the accessibility tree / roles / names / test ids, confirm a locator resolves and is unique, observe real UI structure instead of guessing a selector |
| `automation-reviewer` | **Yes, limited** | reproduce a scenario, confirm a locator in the diff actually resolves, verify an assertion can fail. Read-only browsing; still never edits |

**Why the Analyst gets no MCP.** Its job is *what should happen*; a browser only shows *what does
happen*. Letting it explore the app converts observed behaviour into expected behaviour — so a bug
in the application would silently become the requirement, and `UNKNOWN`s would be "resolved" by
looking instead of by asking. That is precisely the substitution `CLAUDE.md` §11 exists to prevent.
If UI *structure* is genuinely needed to finish an analysis, the correct move is the Engineer
observing it during phase 1 and reporting it as an observation, or the user providing it.

**Hard rules for MCP, to be restated in the agent definitions:**

1. MCP is a tool for **observation and execution**. It never decides a business rule, test
   coverage, or architecture.
2. An MCP observation is labelled as an observation, with its URL/state, never as a requirement.
3. A locator discovered via MCP still lives in a Page or Component (`CLAUDE.md` §3) — MCP does not
   create a shortcut past the architecture, and never puts a selector in a Step.
4. MCP output never resolves an `UNKNOWN` about expected behaviour, only about structure.
5. Every agent must remain fully functional with MCP absent or failing.
6. MCP browses the application under test only, and never authenticates with credentials the user
   has not supplied for that purpose.

---

## 12. Failure Modes

| # | Failure | Mitigation | Where the mitigation lives |
|---|---|---|---|
| FM-1 | **Incomplete analysis** passes as complete | `UNKNOWN` and `NEEDS CONFIRMATION` are mandatory fields that must say `none` explicitly; blocking vs non-blocking is required; the Engineer refuses blocked scenarios and lists them as `NOT IMPLEMENTED` | §8.1, §8.3, GATE 1 |
| FM-2 | **An agent invents** a selector, URL, credential, rule or data value | The interpreting agent cannot write code; the writing agent must record a source for every literal (`SOURCES`); the Reviewer treats an unsourced literal as a finding *even if the test passes* | §5.1, §8.3, §5.3 check 6 |
| FM-3 | **Engineer changes the architecture** | Write allowlist = QA surface only; base classes, `support/**` and DB infrastructure denied; A9/A10/A11 fail the gate; Reviewer check 4 | §7.2, `CLAUDE.md` §7.2 |
| FM-4 | **Engineer relaxes a guardrail** to turn the gate green | `eslint.config.js`, `src/architecture.test.ts`, `tsconfig.json`, `package.json` are denied paths; it is a hard stop, not a judgment call; **any** diff there is an automatic `CHANGES_REQUESTED` | §5.2, §7.2, §5.3 check 10 |
| FM-5 | **Complacent Reviewer** approves anything | Fresh context, no Engineer transcript; must re-run the gate itself; verdict requires per-item checklist output and a `NOT VERIFIED` section; `APPROVED` with an open finding is invalid by contract | §5.3, §8.4 |
| FM-6 | **Information lost between handoffs** | Fixed minimal field set; stable scenario ids carried end to end; the Engineer restates implemented vs skipped; the Reviewer maps requirement → scenario → file | §8 |
| FM-7 | **Infinite Analyst ↔ Engineer loop** | The Analyst is never re-invoked automatically; new gaps go to the *user*. The only loop is Engineer ↔ Reviewer, bounded at 2 cycles, then escalate | §9 |
| FM-8 | **Token blowup** | No Orchestrator, no Planner, mid-tier Engineer, one-page handoffs, Reviewer reads the diff not the repo, one scope per run, repo explored once | §3.4, §10 |
| FM-9 | **MCP used as a business-rule generator** | Analyst has no MCP; observations are labelled as observations; MCP may only resolve structural unknowns | §11 |
| FM-10 | **A red gate misread as a code defect** (the CRLF case) | Isolate the failing stage; reproduce on a clean tree at the base commit before "fixing" code; `.gitattributes` already normalizes line endings | §5.2 stop conditions, `docs/refactor-progress-ia/T11.1-line-endings.md` |
| FM-11 | **An agent writes git history** | Every git-mutating command denied for all three agents; only the user commits; `APPROVED` is the terminal state | §7.3, `CLAUDE.md` §13 |
| FM-12 | **Scope creep disguised as helpfulness** (fixing an unrelated bug, sweeping formatting) | `CLAUDE.md` §14 restated in the Engineer's contract; `OUT-OF-SCOPE FINDINGS` is a report field, not a task list; the Reviewer fails any file outside the approved plan | §5.2, §8.3, §5.3 check 2 |
| FM-13 | **A green gate mistaken for correctness** | `CLAUDE.md` §8's five residual green-gate paths (F-03, F-06, F-10, F-15, F-16) are explicit Reviewer checklist items, not general advice | §5.3 checks 3, 4, 8, 12 |
| FM-14 | **Secrets pulled into an agent's context** | `.env` denied to every agent; `.env.example` is the only environment reference; config is consumed through `config` / `requireBaseUrl()` | §7.2 |

---

## 13. Example End-to-End Flow

The QA types one thing. The session drives the rest.

```text
QA: "Necesito automatizar esta HU: el usuario filtra la grilla de items por estado
     y solo ve los items de ese estado."
```

**1 · ANALYSIS.** The main session delegates to `qa-analyst`, which reads the requirement plus
`features/**` and `src/pages/**` to see what exists. It returns (abridged):

```text
STATE: NEEDS_CONFIRMATION
SCOPE: filtrado de la grilla de items por estado (UI). No incluye creación de items.
SCENARIOS:
  S-1 [positive] @ui @regression  filtrar por un estado con resultados
  S-2 [positive] @ui              filtrar por un estado sin resultados → empty state
  S-3 [negative] @ui              limpiar el filtro restaura la lista completa
VALIDATIONS: UI: cada fila visible tiene el estado filtrado; el contador coincide
UNKNOWN:
  [blocking]     lista cerrada de estados válidos
  [blocking]     comportamiento exacto del empty state (mensaje? tabla vacía?)
  [non-blocking] URL de la pantalla (hoy solo existe BASE_URL)
NEEDS CONFIRMATION: ¿qué estados existen? ¿la HU cubre el caso "sin resultados"?
```

**2 · GATE 1.** The session asks those questions. The QA answers: states are `ACTIVE`,
`INACTIVE`, `ARCHIVED`; the empty state shows a message; the screen is at `/items`. State becomes
`READY_FOR_AUTOMATION`. Nothing has been written yet — and note what did *not* happen: no agent
guessed the state list.

**3 · PLAN.** `automation-engineer` phase 1 searches the repo and returns:

```text
STATE: PLAN_PROPOSED
SCOPE: S-1, S-2, S-3
REUSE:  src/pages/base/BasePage.ts, src/base/BaseUiObject.ts (waits/assertions ya existen)
CREATE: src/pages/items/ItemsPage.ts            — no hay Page para esta pantalla
        src/components/items/ItemsGridComponent.ts — región reutilizable (grilla + contador)
        features/items/items-filter.feature
        features/steps/items.steps.ts
MODIFY: src/pageContainer/Pages.ts — una línea: items: ItemsPage
PROTECTED INFRASTRUCTURE IMPACT: NONE
TESTS TO RUN: npm run quality; npm run test:ui
```

**4 · GATE 2.** The QA approves (or trims — e.g. "no crees el Component todavía").

**5 · IMPLEMENTING.** The Engineer writes only those files, keeps the steps thin, puts the
locators in the Page/Component as `private readonly` fields and private factories, then runs
`npm run quality` and `npm run test:ui`, and reports exit codes, counts and `git diff --stat`.
Selectors come from the QA's answers and from what it could verify — anything it could not source
is reported, not invented.

**6 · REVIEW.** `automation-reviewer` starts from the analysis, the plan and the diff — not from
the Engineer's reasoning — re-runs the gate itself, and returns either `APPROVED` with evidence, or
for example:

```text
VERDICT: CHANGES_REQUESTED
FINDINGS:
  R-1 [major] src/components/items/ItemsGridComponent.ts:14 — locator construido desde el
      parámetro local `page` en lugar de `this.root`: escapa del scope del Component (F-15;
      A11 no lo detecta). Requerido: derivarlo de this.root.
  R-2 [minor] features/steps/items.steps.ts:22 — el estado "ACTIVE" está hardcodeado en el
      Step en lugar de venir del Gherkin como parámetro.
EVIDENCE: npm run quality → exit 0 (61/61 + nuevos); npm run test:ui → 3 escenarios PASS
NOT VERIFIED: nada de DB (DB_ENABLED=false)
```

**7 · Loop, bounded.** The Engineer fixes those two findings only, re-validates, and the Reviewer
re-checks. On `APPROVED`, the session summarizes the diff and stops. **The QA commits.**

Total agent invocations: 3–4. Manual orchestration by the QA: **zero**. Approvals asked of the QA:
**two**, both of them decisions only a human can make.

---

## 14. Why We Did NOT Create More Agents

### 14.1. No `orchestrator` agent

The decisive reason is technical, not aesthetic: **the workflow's gates are user interactions, and
a subagent has no user channel.** An Orchestrator subagent would have to relay every question and
every approval through the main session, which means the main session is the orchestrator anyway —
with an extra hop that can only lose information and spend tokens. It would also need to spawn
subagents, i.e. nested delegation, which is fragile and disallowed by this design (§7.1).

What *is* worth building later is not an agent but a **skill / slash command** (T14) that encodes
the sequence deterministically — same coordination, no extra context, no extra model call. The
user's initial preference was correct, and it is correct for a reason stronger than preference.

### 14.2. No `automation-planner` agent

The plan is a list of files. Producing a *correct* list requires knowing what
`ExamplePage`/`ExampleNavigationComponent` already expose, what `Pages.ts` composes, what
`BaseComponent`'s constructor demands, and which Repository already covers the entity. That is the
same reading the Engineer needs in order to write the code. Splitting them means:

- the repository is explored **twice** for one change (FM-8);
- the exploration context that justified the plan is **discarded**, and the plan arrives as prose —
  losing precisely the details that prevent duplication;
- one more approval prompt appears with no new human decision inside it.

The genuinely valuable part of C is the **stop before writing**, and B keeps it: the Engineer's
phase 1 ends in `PLAN_PROPOSED` and it may not touch a file until the user approves. We kept the
gate and dropped the agent. If, after several real automations, the Engineer's plans turn out to be
systematically weak, promoting phase 1 into its own agent is a small, reversible change — but there
is no evidence for it today, and `CLAUDE.md` §10's "do not create abstractions in advance" applies
to agents too.

### 14.3. The other nine

| Candidate | Why not |
|---|---|
| `gherkin-writer` | Writing a `.feature` is two of the Engineer's minutes and needs the same context as the steps. A separate agent would split one thought across two contexts |
| `page-object-generator` | There is exactly one canonical Page example and one canonical Component example; following them is not a specialization. Generation without the surrounding scenario context is how duplicated Pages appear |
| `locator-specialist` | Locators are a *sourcing* problem (observe, don't guess), not a reasoning problem. The answer is MCP for the Engineer (§11), not another agent |
| `database/repository-specialist` | `src/database/AGENTS-database.md` already encodes the rules, and the DB layer is `protected` by design; today the repo has zero `@db` scenarios. Revisit only if real DB work becomes a large, recurring share |
| `test-data-generator` | Test data management is a documented *absent capability*. An agent generating data would be inventing exactly what `CLAUDE.md` §11 forbids |
| `doc-updater` | Documentation is part of the Definition of Done (`CLAUDE.md` §12) for whoever made the change. Delegating it guarantees docs written by an actor that did not see the change |
| `guardrail-maintainer` | Guardrails are a **human maintainer's** decision (`CLAUDE.md` §9). An agent whose purpose is editing them is the single most dangerous agent this repo could have |
| `flaky-test-triager` | Depends on retries, traces and history — none of which exist yet. It would have nothing to read |
| `ci-agent` | `.github/workflows/**` is protected infrastructure and CI runs the same two gates a human can run locally |

Also deliberately **not duplicated**: Claude Code's built-in `Explore` (read-only fan-out search)
and `Plan` agents, and the generic `/code-review` skill. `Explore` is a fine tool for "find the
existing Pages" and the Engineer can use ordinary search directly — another reason a Planner agent
is unnecessary. Our `automation-reviewer` is *not* a duplicate of `/code-review`: the generic
reviewer knows nothing about `CLAUDE.md`, the A1–A12 invariants, the five residual green-gate paths,
or the requirement that a diff match an approved plan. That framework-specific contract is the
entire reason it exists.

---

## 15. Implementation Order

T13 creates the agents in **safety order**: read-only agents first, and the only write-capable
agent last, after the thing that can catch it already exists.

| Step | Deliverable | Rationale |
|---|---|---|
| 1 | Verify §7.4 capability assumptions against the installed Claude Code version | Do not write an agent that depends on a key or a permission form that does not exist |
| 2 | `qa-analyst` | Read-only, zero risk, immediate standalone value (it is useful even with no other agent) |
| 3 | `automation-reviewer` | Read-only. Landing it before the Engineer means the first agent-written code is reviewable on day one |
| 4 | Permission rules (deny lists of §7.2 / §7.3) | Must exist **before** any write-capable agent |
| 5 | `automation-engineer` | The only agent that writes; lands last, with the guardrails and the reviewer already in place |
| 6 | Dry run on a real requirement, MCP absent | Proves the architecture works without MCP, as §11 requires |
| 7 | `docs/refactor-progress-ia/T13-*.md` | Record what was built and what was measured, per repo convention |

**Belongs to later tasks, not T13:** the orchestration skill / slash command (T14), Playwright MCP
installation and the per-agent MCP grants (T15+), and any revisit of the Planner question driven by
real evidence from step 6.

**Definition of done for T13** (inherited from `CLAUDE.md` §12): `npm run quality` green,
no guardrail relaxed, no protected file touched, no `.env` read, and the three agent definitions
reviewed by the user before first real use.
