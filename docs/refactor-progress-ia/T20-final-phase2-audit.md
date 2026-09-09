# T20 — Final Phase 2 Audit

**Estado:** ✅ COMPLETED
**Fecha:** 2026-09-08
**Branch:** `feature/claude-ai-integration`
**Baseline commit:** `b5a0969` (refactor: promote SauceDemo as canonical UI example)
**Entorno:** Node v24.13.1 · npm 11.8.0 · Claude Code 2.1.265 · Windows 11
**Reporte completo:** [docs/ai-automation-archetype-final-audit.md](../history/ai-automation-archetype-final-audit.md)

---

## 1. Objective

Auditoría final adversarial de la Fase 2. El objetivo explícito era **intentar demostrar que el
arquetipo NO está listo**, no confirmarlo. Sin implementar funcionalidades, sin corregir findings,
sin refactorizar, sin modificar código/configuración/agentes/skills/CI, y sin ejecutar T21.

Método: todo se ejecutó contra el toolchain real. Los guardrails se atacaron con fixtures
descartables escritos en **paths reales** — nunca bajo `.tmp-*`, que tanto ESLint como el walker de
architecture tests ignoran — y se eliminaron después de cada medición. Ningún registro previo
(T10.x–T19.1) se tomó por válido sin re-testear.

---

## 2. Baseline

| Check | Resultado |
|---|---|
| `git status` | **CLEAN** (antes de auditar y después de cada tanda de fixtures) |
| Branch | `feature/claude-ai-integration` |
| HEAD | `b5a0969` |
| Node | v24.13.1 (cumple `engines.node` `>=24.12`) |
| `npm run quality` | **PASS** — exit 0, **62 tests / 23 suites / 62 pass / 0 fail** |
| `npm test` | **PASS** — exit 0, **2 scenarios / 20 steps** |
| `npm run test:ui` | **PASS** — exit 0, **2 scenarios / 20 steps** |

Coincide exactamente con lo esperado por la consigna. Único desvío: `CLAUDE.md` §7.4 sigue
diciendo `61 tests` (L-01).

---

## 3. Final Architecture

Reconstruida leyendo el código, no los diagramas.

- **UI:** `checkout.feature` → `checkout.steps.ts` (14 steps, solo `this.pages`) → `CustomWorld` →
  `Pages.ts` (6 pages) → 6 Pages `extends BasePage` → `BasePage` → `BaseUiObject`.
- **BaseComponent:** contrato vigente, **cero Components concretos** — descrito correctamente en 5
  lugares (README §Components, README §Current Limitations, AGENTS.md §4, CLAUDE.md §3,
  automation-engineer.md). No rompe A10/A11 y no obliga a inventar una abstracción.
- **Database:** `Step → this.repositories → RepositoryContainer → BaseRepository → QueryBuilder →
  DatabaseClient → OracleDatabaseClient`. Con `DB_ENABLED=false`, verificado empíricamente: no se
  crea cliente, `oracledb` **no aparece** en `process.moduleLoadList`, y `closeDatabaseClient()` no
  lanza. Con `DB_ENABLED=true` sin credenciales: falla al importar con el mensaje esperado.
- **Config:** `src/config/index.ts` único owner de `process.env` — verificado por ataque (§5).
- **AI:** `qa-automate` → `qa-analyst` → Gate 1 → Engineer `MODE: PLAN` → Gate 2 → `MODE: IMPLEMENT`
  + `PLAN APPROVED` → `automation-reviewer`.
- **MCP:** aislamiento confirmado en el **registro runtime** del harness (no en el archivo):
  Analyst 0 tools MCP / sin write / sin shell; Engineer 10; Reviewer 5 (subconjunto estricto).

---

## 4. Canonical UI Example

Barrido de `playwright.dev`, `features/example`, `example.feature`, `ExamplePage`,
`ExampleNavigationComponent`, `BASE_URL`, `requireBaseUrl` sobre toda la superficie operativa
(README, CLAUDE.md, AGENTS.md, `.claude/**`, `.github/**`, `src/**`, `features/**`, `support/**`,
configs, `.env.example`, `.gitignore`, `.prettierignore`).

**Resultado: 0 referencias operativas rotas.** Todo hit de `BASE_URL` es el substring dentro de
`SAUCEDEMO_BASE_URL`. Sobreviven solo: `src/architecture.test.ts:442` (comentario de rationale, sin
comportamiento) y los documentos históricos fechados 2026-09-04/07, que la consigna excluye.

---

## 5. Architecture Guardrails

**16/16 reglas que deben bloquear, bloquearon.** Jerarquía UI (A9/A10/A11) 5/5; runner isolation
(G1/G7/G8/A1/A2/A3) 5/5; environment isolation (G3) 5/5; oracledb (G4/A6) 4/4; unit-test discovery
(A12 + ejecución real en las 3 raíces) verificado.

Confirmado que la disciplina de *re-listing* documentada en `eslint.config.js` funciona: el
override de `features/steps/**` vuelve a declarar `oracledb` y `waitForTimeout`, y ambos siguen
disparando desde un Step.

**Gaps conocidos revalidados — todos reproducen exactamente como están documentados:** F-03, F-06,
F-07, F-08, F-09, F-10, F-11, F-13, F-15, F-16 → **OPEN — NON-BLOCKING**. F-12 → **el comentario de
`architecture.test.ts:22-29` sigue obsoleto**: ESLint **sí** bloquea `const { env } = process`
(verificado).

**Gap NO documentado encontrado (H-01):** los guardrails de UI están anclados por path. Una clase
Page-like en `src/screens/` que no extiende nada, importada directamente por un Step, más
`this.pages.<page>.goto(...)` público → `npm run quality` **exit 0, 62/62**. Esto falsifica la
garantía de `CLAUDE.md:231-233`.

---

## 6. Step Boundaries

11/11 fixtures adversariales bloqueados: `this.page`, `this.context`, `this.browser`, import de
Page, import de Component, import de `playwright`, import de `src/database/**`, import de `expect`
desde `@playwright/test`, import de `oracledb`, `waitForTimeout(...)`, `process.env`.

Dos superficies siguen abiertas: `playwright-core` (F-06, documentado) y `BasePage.goto/reload/
waitForUrlContains`, que son **públicos** y alcanzables desde un Step sin que ningún guardrail
dispare (M-05, no documentado).

---

## 7. Config

`process.env` bloqueado desde Page (dot y bracket), desde `support/`, vía `const env = process.env`
y vía `const { env } = process`. Escapa solo el alias de `process` mismo (F-13, documentado).

`BASE_URL` legacy: **no existe operativamente**. `SAUCEDEMO_BASE_URL` es el único target UI vigente,
con default público en código, más `.env.example`, `ci.yml` y README.

---

## 8. Database

`QueryBuilder` re-revisado contra sus 21 tests: valores siempre por bind, identificadores validados
por regex de forma **y** allowlist del repositorio, `buildUpdate` rechaza filtros vacíos, `buildInsert`/
`buildUpdate` rechazan columnas vacías, paginación rechaza límites no enteros o no positivos.
**Ningún bypass nuevo en el camino de valores.**

Los dos bypasses originales de F-02 siguen cerrados (`await import('oracledb')` y `createRequire`
aliaseado con un hop). F-16 sigue abierto tal como está documentado. Dos notas teóricas no
explotables quedan como L-10. Todas las pruebas corrieron con `DB_ENABLED=false`; **no se tocó
ninguna base real**.

---

## 9. CI

`.github/workflows/ci.yml` auditado de cero: Node compatible, `npm ci`, install de Chromium,
`npm run quality`, `npm test`, `SAUCEDEMO_BASE_URL` explícito, `DB_ENABLED=false`, sin `BASE_URL`/
`playwright.dev`, `permissions: contents: read`, `timeout-minutes: 15`, artefactos con
`if: always()` + `if-no-files-found: ignore`, **cero secretos**.

**Los comandos exactos de CI se reprodujeron localmente con el entorno exacto de CI** — ambos PASS.
CI no fue modificado. Observaciones menores en L-08.

---

## 10. Documentation

Paths documentados: existen. Scripts documentados: existen. Config documentada: coincide.
Ausencia de Components: correcta en 5 lugares, contradicha en 1 (L-05). CI: coincide. MCP:
versión coherente (`0.0.80` en `.mcp.json` = `claude mcp get` = T18). Tool lists de agentes:
coinciden exactamente con el runtime. `[[` en documentación operativa: **cero**.
`CLAUDE.md` §7.2 (11 invariantes A) = 11 `describe` en `architecture.test.ts`.

Fallos: §7.4 dice 61 tests y son 62 (L-01); §8 garantiza algo falso (H-01); §9 omite 4 paths
protegidos (M-01); toda la capa de IA no se menciona en README/AGENTS/CLAUDE.md (M-02).

---

## 11. Agents

`claude plugin validate .claude/agents --strict --json` → `success: true` pero `manifest: null`,
`contents: []` → **validó cero archivos**. Verde vacuo (M-03): estos agentes son project-scoped, no
un plugin. La validación real se hizo por registro runtime + dry runs vivos.

| Agente | Requisito | Veredicto |
|---|---|---|
| `qa-analyst` | sin MCP, sin shell, sin write | **PASS** |
| `automation-engineer` | MCP autorizado, PLAN antes de IMPLEMENT, paths y ejemplos canónicos actuales | **PASS con una contradicción** (M-04, línea 136) |
| `automation-reviewer` | read-only, MCP menor, quality/E2E propios, no confía en el Engineer | **PASS, demostrado en vivo** |

---

## 12. qa-automate

Los 9 requisitos del skill están explícitos: Gate 1, Gate 2, silencio ≠ aprobación,
`CHANGES_REQUESTED` sin auto-corrección, `VALIDATION_FAILED` detiene, infraestructura protegida
requiere aprobación, límite de ciclo, handoffs sin archivos, y prohibición de pasarle el transcript
del Engineer al Reviewer.

**Dry runs vivos, sin escribir una línea de código** (`git status` verificado después de cada uno):

- **A — requerimiento incompleto.** `qa-analyst` devolvió `NEEDS_CONFIRMATION` con **5 UNKNOWN
  `[blocking]`**, se negó a asumir SauceDemo como target, no inventó credenciales ni el texto del
  error, detectó la cobertura existente para no recrearla, y se detuvo. **PASS.**
- **B — plan con infraestructura protegida.** El Engineer en `MODE: PLAN` no escribió nada, declaró
  `PROTECTED INFRASTRUCTURE IMPACT: src/database/RepositoryContainer.ts` con la autorización que
  pediría, reutilizó todo lo existente, **usó MCP contra el sitio real**, recorrió el checkout
  completo, enumeró todos los `[data-test]` y demostró que SauceDemo **no expone ningún ORDER_ID** —
  y por eso se **negó** a implementar la validación DB, citando `CLAUDE.md` §11. Incluso cuestionó
  el `NEEDS CONFIRMATION: none` de la QA Analysis aprobada. **PASS, por encima de lo exigido.**
- **C — `CHANGES_REQUESTED` devuelve el control.** Al Reviewer se le entregaron tres documentos de
  handoff que describían trabajo **inexistente**, con evidencia fabricada (`test:ui — 3 scenarios,
  26 steps`). El Reviewer **no aceptó la evidencia**, la reprodujo él mismo, midió **2 scenarios /
  20 steps** dos veces, y denunció la contradicción como finding. Devolvió `CHANGES_REQUESTED` con
  2 blockers, **no editó nada**, dio veredicto explícito en los 12 puntos, y declaró en
  `NOT VERIFIED` que no podía confirmar el error de login *porque no tiene `browser_type`/
  `browser_fill_form`*. Además reportó como `OUT-OF-SCOPE OBSERVATION` el mismo drift `61` vs `62`
  de `CLAUDE.md` §7.4 y **se negó a corregirlo** (§14). **PASS.**
- **D — usuario cancela.** Verificado solo por contrato (`SKILL.md:93`). No se puede testear en
  runtime sin fabricar una decisión del usuario, y esta auditoría no lo hace.

---

## 13. MCP

`claude mcp get playwright` → **Connected**, project-scoped vía `.mcp.json`, `@playwright/mcp@0.0.80`
(pin esperado). Engineer: MCP funcionando, demostrado en vivo. Reviewer: MCP funcionando con
subconjunto menor, y reportando correctamente lo que **no** pudo verificar por las tools que no
tiene. Analyst: sin MCP. `.playwright-mcp/` y `.claude/settings.local.json` presentes en disco y
confirmados ignorados por `git check-ignore`. `settings.local.json` contiene únicamente
`enabledMcpjsonServers: ["playwright"]` — no debilita ningún permiso. Sin credenciales introducidas.

---

## 14. Protected Infrastructure

`.claude/settings.json`: 20 reglas `ask` + `deny: ["Read(/.env)"]`, intacto.

Confirmado que `Edit(...)` es la forma correcta y suficiente (cubre también creación vía `Write`);
una regla `Write(...)` sería aceptada pero **nunca consultada** — T16.1 §4 lo verificó contra la
documentación oficial y esta auditoría confirma que el razonamiento se aplicó bien: no hay reglas
inertes.

**Discrepancia real:** `settings.json` protege `package-lock.json`, `CLAUDE.md`, `.claude/**` y
`.mcp.json`; **`CLAUDE.md` §9 no nombra ninguno de los cuatro**, y `.mcp.json` no aparece en ningún
contrato. §9 es el documento que ambos agentes deben "tratar como ley" y es el menos completo de los
cuatro (M-01).

Dos residuales estructurales: el Engineer tiene `Bash`, y una reescritura por shell de un archivo
protegido no la cubre una regla `Edit(...)` — la barrera ahí es contractual (L-11); y sigue sin
confirmarse empíricamente que el patrón con slash inicial dispare el prompt `ask` en runtime, abierto
desde T13.1 §10 y no cerrable sin una edición no autorizada (L-12).

---

## 15. Known Findings

| Finding | Estado final |
|---|---|
| F-03 `.js` sin guardrails | **OPEN — NON-BLOCKING** (reproducido) |
| F-06 Step importa `playwright-core` | **OPEN — NON-BLOCKING** (reproducido) |
| F-07 `setWorldConstructor` aliaseado | **OPEN — NON-BLOCKING** (reproducido) |
| F-08 A5 solo ve `PropertyDeclaration` | **OPEN — NON-BLOCKING** (confirmado por lectura; `world.ts` no se modificó) |
| F-09 `*.spec.js` | **OPEN — NON-BLOCKING** (reproducido) |
| F-10 `.ts` fuera de las raíces de `tsconfig` | **OPEN — NON-BLOCKING** (reproducido con control) |
| F-11 `await import('@playwright/test')` | **OPEN — NON-BLOCKING** (reproducido) |
| F-12 comentario obsoleto en `architecture.test.ts` | **CONFIRMADO — el comentario sigue obsoleto** (L-06) |
| F-13 alias de `process` | **OPEN — NON-BLOCKING** (reproducido) |
| F-15 Component escapa de `root` vía param local | **OPEN — NON-BLOCKING** (reproducido) |
| F-16 `oracledb` vía `node:module` default/namespace | **OPEN — NON-BLOCKING** (3 variantes reproducidas) |
| Cierres previos T10.x (F-01, F-02, F-04) | **CLOSED — se mantienen cerrados** |
| **T19 R-4** race en `expectOnCheckoutInformationForm()` | **OPEN — NON-BLOCKING (LOW)**: probado en una copia descartable dándole postal code válido; la aserción **falló correctamente 4 de 4 veces**. La race no se reproduce contra SauceDemo |

---

## 16. Security

Barrido regex de passwords, tokens, API keys, bearer, credenciales Oracle, cookies, `storageState`
y claves privadas sobre **todos los archivos trackeados** → **un solo hit**:
`src/config/index.test.ts:182` (`DB_PASSWORD: 'app_password'`), literal sintético dentro del test que
justamente **prueba que las credenciales no se filtran** en los mensajes de error.

`.env.example` sin valores reales. `.env` ausente del repo y del disco, ignorado junto con `.env.*`.
CI sin secretos. `standard_user`/`secret_sauce` son credenciales públicas del demo — SauceDemo las
publica en su propia pantalla de login, como confirmó el Reviewer por snapshot — documentadas
explícitamente como datos públicos en T19 §9, aunque no en README/CLAUDE.md (L-09).

**No hay ningún secreto real en el repositorio.**

---

## 17. Developer Experience

Checkout **solo de archivos trackeados** (`git archive HEAD`): sin `.env`, sin `node_modules`, sin
estado local. `npm run quality` → **PASS 62/62**. `npm test` → **PASS 2 scenarios / 20 steps**.
Sin `.env`, sin `BASE_URL` manual, sin config global, sin `settings.local.json` versionado, sin
artefactos MCP versionados. **Fricción de fresh clone: prácticamente cero.**

Los cuatro perfiles (QA básico, QA Automation, SDET maintainer, agente de IA) quedan bien servidos.
El más débil es el agente de IA, no por fricción sino por drift de contrato (M-01, M-02, M-04).
**Ningún guardrail dispara sobre trabajo correcto**: los 16 bloqueos exigieron un fixture
deliberadamente incorrecto.

---

## 18. Final Validation

Fixtures eliminados, árbol devuelto al baseline, re-ejecución con el entorno exacto de CI:

| Gate | Exit | Resultado |
|---|---|---|
| `npm run quality` | 0 | **PASS** — 62 tests / 23 suites / 62 pass / 0 fail |
| `npm test` | 0 | **PASS** — 2 scenarios / 20 steps |
| `npm run test:ui` | 0 | **PASS** — 2 scenarios / 20 steps |
| `npm run test:smoke` | 0 | **PASS** — 1 scenario / 12 steps |
| `npm run test:regression` | 0 | **PASS** — 2 scenarios / 20 steps |
| `npm run test:db` | 0 | **PASS** — 0 scenarios (esperado) |

**Control negativo:** apuntando `SAUCEDEMO_BASE_URL` a una ruta inexistente → **2 scenarios failed,
exit 1**. El suite E2E es real y puede fallar de verdad.

`git status` → limpio salvo los dos documentos que esta tarea sí puede crear.

---

## 19. Findings

**0 BLOCKER · 1 HIGH · 5 MEDIUM · 12 LOW.** Detalle completo, con evidencia y reproducción, en
[docs/ai-automation-archetype-final-audit.md](../history/ai-automation-archetype-final-audit.md) §19.

- **H-01 [HIGH]** — `CLAUDE.md` §8 garantiza que *"no se puede romper la jerarquía UI"*; es falso.
  Clase Page-like fuera de `src/pages/**` + import directo desde un Step + `goto()` público →
  `npm run quality` exit 0, 62/62. El gap no está en §8, ni en la tabla de scope del README, ni en
  el checklist del Reviewer, así que **nadie está instruido para buscarlo**.
- **M-01** — `CLAUDE.md` §9 omite `package-lock.json`, `CLAUDE.md`, `.claude/**` y `.mcp.json`.
- **M-02** — La capa de IA no se menciona en README/AGENTS.md/CLAUDE.md.
- **M-03** — `claude plugin validate` sobre estos paths es verde vacuo (0 archivos).
- **M-04** — `automation-engineer.md:136` y `SKILL.md:33` afirman que MCP no existe.
- **M-05** — `BasePage.goto/reload/waitForUrlContains` son públicos y alcanzables desde un Step.
- **L-01…L-12** — drift documental, nits de CI/`.env.example`, notas de `QueryBuilder`, y los dos
  residuales de permisos.

Ningún finding fue corregido, por consigna.

---

## 20. Final Verdict

# CONDITIONALLY READY

La ingeniería está lista: 16/16 guardrails bloqueantes funcionan, todos los gaps documentados
reproducen exactamente como se documentaron, cero referencias operativas rotas, cero secretos, CI
coherente, MCP funcional y correctamente escalonado, gates humanos reales demostrados en vivo, y
fresh clone sin fricción.

Lo que falta es una corrección de **la capa de contrato**: `CLAUDE.md` §8 hace una promesa que el
toolchain no cumple, y el gap que esa promesa oculta es invisible tanto para el revisor humano como
para `automation-reviewer`. No requiere tocar código ni relajar ningún guardrail.

---

## 21. Recommendation

**T20.1 — Contract coherence pass (solo documentación).** Cierra H-01, M-01, M-02, M-04 y M-05.

- Archivos: `CLAUDE.md`, `README.md`, `.claude/agents/automation-engineer.md`,
  `.claude/agents/automation-reviewer.md`, `.claude/skills/qa-automate/SKILL.md`.
- Todos son infraestructura protegida → requieren autorización explícita del usuario (`CLAUDE.md` §9).
- Cero cambios de código. Cero cambios de guardrails.
- Después: re-correr §5 y §18 de esta auditoría.

Los LOW pueden ir en la misma pasada o diferirse.

---

## 22. Next Task

**T21 — SDET Playbook / Project Knowledge Guide.**

**No ejecutada en esta sesión**, por instrucción explícita de la consigna. Se recomienda ejecutar
T20.1 antes de T21, para que el Playbook no documente una garantía que hoy es falsa.

---

## Archivos creados por T20

| Archivo | Estado |
|---|---|
| `docs/ai-automation-archetype-final-audit.md` | **NUEVO** — reporte adversarial completo |
| `docs/refactor-progress-ia/T20-final-phase2-audit.md` | **NUEVO** — este registro |

Cero cambios en código, configuración, agentes, skills o CI.
