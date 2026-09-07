# T15 — First AI-Assisted Automation

## 1. Objetivo

Ejecutar por primera vez el workflow completo `qa-automate` (`qa-analyst` → Gate 1 →
`automation-engineer` MODE: PLAN → Gate 2 → `automation-engineer` MODE: IMPLEMENT →
`npm run quality` + E2E → `automation-reviewer`) sobre un caso real pero controlado,
usando el ejemplo actual del framework (`features/example/**`), con los dos gates
aprobados explícitamente por el usuario y sin coordinación manual de agentes por fuera
del skill.

## 2. Requirement

Automatizar un flujo UI público sobre el sitio de ejemplo del framework:

1. Abrir la home usando el `BASE_URL` configurado por el framework.
2. Validar que el heading principal esperado sea visible.
3. Validar que la navegación principal sea visible.
4. Validar que exista el link "Docs".
5. Hacer click en "Docs".
6. Validar que la URL resultante contenga el texto `docs`.

Datos conocidos: sin auth, sin DB, sin API, sin datos sensibles, flujo únicamente UI,
link exactamente "Docs", navegación misma pestaña, validación final única = URL contiene
"docs", reutilizar el heading existente si ya está cubierto, no inventar validaciones
fuera de scope.

## 3. QA Analysis

`qa-analyst` devolvió `STATE: READY_FOR_AUTOMATION` (sin `UNKNOWN [blocking]`) en la
primera pasada. Puntos clave:

- **SCOPE:** un (1) flujo UI end-to-end; cobertura parcial ya existente en el repo.
- **TEST DATA:** heading `"Playwright"` (ya usado en `features/example/example.feature:10`),
  link `"Docs"`, subcadena de URL `"docs"`, nav accesible como `"Main"`.
- **VALIDATIONS:** V-1 (heading), V-2 (nav visible) y V-3 (link "Docs" visible) ya
  cubiertas por el Feature/Steps/Page/Component existentes. V-4 (URL contiene "docs") y
  la acción de click sobre "Docs" eran el único delta funcional.
- **RISKS:** dependencia de sitio público de terceros, ambigüedad de locator page-wide
  vs. scoped a la nav (se recomendó el scoped, de menor riesgo de strict-mode violation).
- **NEEDS CONFIRMATION:** cómo agregar el nuevo escenario al feature existente, si debía
  llevar `@smoke`, y confirmación del heading a reutilizar.

## 4. Gate 1

Decisiones del usuario:

1. El nuevo escenario (`S-1`) se agrega como **tercer escenario nuevo** en
   `features/example/example.feature`, sin tocar los 2 existentes.
2. `S-1` **sí** lleva el tag `@smoke` adicional (se aceptan 2 escenarios `@smoke` en el
   mismo feature).
3. El heading a reutilizar se confirma como el literal `"Playwright"`.
4. **Approve QA Analysis.**

## 5. Automation Plan

`automation-engineer` (MODE: PLAN) devolvió `STATE: PLAN_PROPOSED`:

- **REUSE:** steps existentes de `features/steps/example.steps.ts`, `ExamplePage`
  (`open()`, `expectHeadingToContain()`, y el método heredado `waitForUrlContains()` de
  `BasePage`), locator factory privado `linkByName()` y `click()` heredado de
  `BaseUiObject` en `ExampleNavigationComponent`. `Pages.ts` sin cambios.
- **CREATE:** ninguno.
- **MODIFY (exactamente 3 archivos):** `features/example/example.feature` (tercer
  escenario), `features/steps/example.steps.ts` (2 steps nuevos), y
  `ExampleNavigationComponent.ts` (método público `clickLink(linkName)`).
- **PROTECTED INFRASTRUCTURE IMPACT:** NONE.
- **NOT IMPLEMENTED:** validación de contenido/título del destino, escenario negativo,
  wrapper semántico propio en `ExamplePage` — dejado como punto abierto para el usuario.

## 6. Gate 2

Punto abierto resuelto: el step de validación de URL usa `waitForUrlContains` heredado
de `BasePage` **directamente**, sin agregar un wrapper semántico (`expectUrlContains`)
en `ExamplePage`. Decisión del usuario: **Approve Plan**, tal cual, sin el wrapper.

## 7. Implementation

`automation-engineer` (MODE: IMPLEMENT) reportó `STATE: READY_FOR_REVIEW`:

- Tercer escenario `S-1` agregado a `example.feature` (tag `@smoke` adicional), sin
  modificar los 2 escenarios existentes.
- Dos steps nuevos en `example.steps.ts`, usando exclusivamente `this.pages.example.*`.
- Método público `clickLink(linkName: string)` en `ExampleNavigationComponent`, que
  reutiliza `linkByName()` y `click()` heredado.
- Nada fuera de los 3 archivos aprobados.

## 8. Files changed

- `features/example/example.feature`
- `features/steps/example.steps.ts`
- `src/components/example/ExampleNavigationComponent.ts`

Ningún Page, Component ni Repository nuevo. Ninguna línea nueva en `Pages.ts`. Ninguna
infraestructura protegida tocada.

## 9. Quality

`npm run quality` → **PASS** (typecheck OK, lint OK, format:check OK, `test:unit`
61/61 tests, 23/23 suites). Re-ejecutado de forma independiente por `automation-reviewer`
dos veces con el mismo resultado.

## 10. E2E

- `BASE_URL=https://playwright.dev npm run test:smoke` → PASS: 2 scenarios (2 passed),
  9 steps (9 passed).
- `BASE_URL=https://playwright.dev npm run test:regression` → PASS: 3 scenarios
  (3 passed), 12 steps (12 passed) — incluye el nuevo `S-1`.
- `BASE_URL=https://playwright.dev npm test` (suite default, `not @db`) → PASS: 3
  scenarios / 12 steps — sin regresión en los 2 escenarios preexistentes.

Todo re-ejecutado de forma independiente por `automation-reviewer`, con dos controles
negativos adicionales para descartar verdes falsos:

- `BASE_URL=https://example.com` → falla real (`net::ERR_NAME_NOT_RESOLVED`).
- Mutation probe (feature efímero fuera del repo, ya borrado) con una URL esperada
  incorrecta → falla real (`expect(page).toHaveURL(...)` con la URL real
  `https://playwright.dev/docs/intro`), confirmando que el nuevo `Then` puede fallar y
  no es tautológico.

Nota preexistente (no introducida por este cambio): sin `BASE_URL` en el entorno, el
E2E falla con `BASE_URL is required before navigating to an application.` — no hay
`.env` en el repo, solo `.env.example`. Afecta también al `@smoke` preexistente.

## 11. Reviewer

`automation-reviewer` — **VERDICT: APPROVED**, `FINDINGS: none`.

Checklist de 12 puntos (cobertura, scope, steps thin, arquitectura Page/Component,
locators, literales sin fuente, assertions no tautológicas, database n/a, duplicación/
reuse, infraestructura protegida, evidencia, sobras): **PASS en los 12**. Incluye
verificación manual de los 5 gaps conocidos del repo (F-03, F-06, F-10, F-15, F-16) —
ninguno explotado por este cambio.

## 12. Findings

**Bloqueantes:** ninguno.

**No bloqueantes / fuera de scope (informados, no corregidos):**

- **Commit `f502e93`** ("feat: add QA automation orchestration skill"), previo a esta
  sesión, agregó `.claude/skills/qa-automate/SKILL.md` y
  `docs/refactor-progress-ia/T14-automation-workflow.md`. Toca `.claude/**`
  (infraestructura protegida) y CLAUDE.md §13 exige autorización explícita para
  `git commit`. No bloquea este veredicto porque es la línea base (HEAD) contra la que
  se calculó el diff revisado, y su contenido es documentación sin guardrails tocados.
  **Se informa para que el usuario confirme que ese commit fue suyo/autorizado.**
- `BasePage.waitForUrlContains(text)` implementa regex (`new RegExp(text)`), no
  "contains" literal. Para `"docs"` es equivalente, pero el nombre del step nuevo
  (`the current URL should contain {string}`) expone esa semántica regex a Gherkin sin
  advertirlo. Comportamiento preexistente de infraestructura protegida; el plan aprobado
  excluyó explícitamente un wrapper.
- El escenario `S-1` repite las validaciones de heading/nav/link ya cubiertas por los 2
  escenarios existentes antes de llegar al `When`/`Then` nuevos — consistente con la
  QA Analysis aprobada (flujo end-to-end pedido así), pero un `S-1` más magro sería
  posible para higiene futura.
- `ExampleNavigationComponent.ts` quedó en disco con CRLF (los otros 2 archivos en LF).
  Sin impacto: `.gitattributes` normaliza a LF, `format:check` pasa, el diff registrado
  no tiene churn.
- No existe `.env` en el repo (solo `.env.example`); cualquier corrida E2E local requiere
  `BASE_URL` en el entorno. Preexistente, no introducido por este cambio.

## 13. Final state

**STATE: AUTOMATION_APPROVED**

## 14. Developer Experience

- Los dos gates humanos funcionaron como se esperaba: el flujo se detuvo en cada uno y
  esperó una decisión explícita del usuario, incluso en modo auto — no hubo aprobación
  asumida por silencio.
- El `qa-analyst` identificó correctamente que casi todo el comportamiento pedido ya
  estaba cubierto por el ejemplo existente, y redujo el delta real a dos piezas
  concretas (click + validación de URL) — la regla "REUTILIZAR antes de crear" se
  cumplió sin necesidad de insistir desde el prompt del usuario.
  Consistencia con `[T13 — Claude Specialized Agents](T13-claude-agents.md)` (mismos tres agentes, sin un cuarto
  "Orchestrator").
- El `automation-reviewer` no se limitó a releer el reporte del Engineer: corrió su
  propia batería de comandos, agregó 2 controles negativos (URL inexistente + mutation
  probe) para descartar verdes falsos, y verificó a mano los 5 gaps conocidos del repo
  (F-03/F-06/F-10/F-15/F-16) en vez de asumir que el gate en verde alcanzaba.
- Ningún guardrail se relajó, ningún archivo fuera del plan aprobado fue tocado, y la
  infraestructura protegida (§9 de `CLAUDE.md`) no fue modificada en ningún momento.

## 15. Lessons learned

- El workflow `qa-automate` sostiene sus gates humanos de punta a punta incluso en modo
  auto: ni la sesión orquestadora ni los subagentes asumieron aprobación en ningún punto.
- Vale la pena que el orquestador resuelva los puntos `NEEDS CONFIRMATION` del
  `qa-analyst` **antes** de pedir la aprobación de Gate 1, en la misma tanda de
  preguntas — evita una vuelta adicional del ciclo.
- El `automation-reviewer` demostró valor real más allá de "correr los mismos comandos
  otra vez": el mutation probe y el control negativo de URL son evidencia mucho más
  fuerte que releer el código, y deberían ser el estándar esperado en próximas
  revisiones.
- Encontrar `f502e93` como hallazgo fuera de scope confirma que el Reviewer audita el
  estado real del repo (vía `git log`/HEAD), no solo el diff que se le entrega — un
  chequeo útil para detectar cambios de infraestructura no autorizados que ocurrieron
  fuera del flujo.

## 16. Next task

T16 — no ejecutado en esta sesión, por instrucción explícita del usuario. Queda
pendiente definir su alcance en una conversación futura, incluyendo (si el usuario lo
decide) resolver el hallazgo del punto 12 sobre `f502e93` antes de continuar.
