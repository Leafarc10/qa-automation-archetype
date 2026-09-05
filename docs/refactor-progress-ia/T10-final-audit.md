# T10 — AI Foundation Final Audit

**Date:** 2026-09-04
**Status:** ✅ COMPLETED — Fase 1 **NO** cerrada incondicionalmente (ver §10)
**Branch:** `feature/ai-foundation`
**Baseline commit:** `6b69930`

---

## 1. Objetivo

Última tarea de la Fase 1. No es implementación: es una auditoría adversarial cuyo objetivo explícito era **intentar demostrar que la AI Foundation NO está lista**, y declararla lista solo si tras intentar romperla no aparecían blockers reales.

Se auditó desde cuatro roles simultáneos: Senior SDET, reviewer de arquitectura, reviewer de seguridad del framework y reviewer de Developer Experience — con la pregunta de fondo: *¿es seguro dejar que un agente de IA modifique este repositorio confiando en que `npm run quality` verde significa "correcto"?*

El informe completo vive en [ai-foundation-final-audit.md](../ai-foundation-final-audit.md). Este registro documenta el proceso.

---

## 2. Estado inicial

Gate de baseline (la tarea exigía detener la auditoría si el working tree no estaba limpio):

| Verificación | Resultado |
|---|---|
| Branch | `feature/ai-foundation` |
| Working tree | ✅ limpio (T09/T09.1 ya commiteados como `6b69930`) |
| Node | v24.13.1 |
| `engines` de package.json | `>=24.12` → ✅ compatible |
| `npm run quality` | ✅ PASS, exit 0 |
| Tests totales | 57 tests / 19 suites / 0 fail |
| E2E ejemplo | ✅ 2 escenarios, 6 steps, PASS |
| CI usa comandos existentes | ✅ los 12 scripts invocados existen en `package.json` |

Baseline válido → auditoría habilitada.

---

## 3. Metodología

El código actual tuvo prioridad absoluta sobre la documentación histórica: cada afirmación de este informe se verificó ejecutando algo, no leyendo un registro T01–T09.

1. **Lectura completa de la superficie de enforcement**: `eslint.config.js` (254 líneas), `src/architecture.test.ts` (354), `tsconfig.json`, `cucumber.js`, `.github/workflows/ci.yml`, `package.json`.
2. **Lectura del código real**: `src/base/**`, `src/pages/**`, `src/components/**`, `src/pageContainer/**`, `src/config/**`, `src/database/**`, `support/**`, `features/**`.
3. **Batería adversarial con fixtures reales**: 14 hipótesis de bypass, cada una escrita como archivo real y ejecutada contra el toolchain real (`npx eslint`, `npx tsc --noEmit`, `node --test`, `npm run quality`). No se razonó "esto probablemente pasaría" — se midió.
4. **Sonda AST read-only** para el invariante A5 (`CustomWorld`), que no se puede probar sin modificar `support/world.ts` — código productivo, intocable en T10. Se replicó la función `getClassPropertyNames` exacta de A5 en un script fuera del repo y se le alimentaron variantes sintéticas.
5. **Limpieza total** de todo fixture, verificada con `find` + `git status`.

**Corrección de método durante la ejecución:** el primer intento de probar `playwright.config.mjs` usó el prefijo `__audit_t10_`, lo que rompía el ancla `^playwright` del regex de A1 y habría producido un falso positivo ("A1 no detecta .mjs"). Se repitió la prueba con el nombre canónico y A1 **sí** lo detecta. Del mismo modo, una corrida de `npm run quality` falló por el formato Prettier del propio script de sondeo, no por los fixtures; se movió el script fuera del repositorio y se repitió para obtener el resultado real.

---

## 4. Auditoría adversarial

Resumen de las 14 hipótesis. Detalle completo en §5 del informe principal.

| Grupo | Variante | Resultado |
|---|---|---|
| Playwright runner | `import { test }` / `test as pwTest` / `import * as pw` | ✅ los 3 BLOQUEADOS |
| Playwright runner | `await import('@playwright/test')` | ⚠️ BYPASS (explotabilidad baja) |
| Steps | `playwright`, Page relativo, DB relativo | ✅ los 3 BLOQUEADOS |
| Steps | `playwright-core` | ⚠️ **BYPASS REAL** (resoluble en `node_modules`) |
| `process.env` | `.X`, `['X']`, `const env = process.env`, `const { env } = process` | ✅ los 4 BLOQUEADOS |
| `process.env` | `const p = process; p.env.X` | ⚠️ BYPASS (artificial) |
| `oracledb` | `import ... from 'oracledb'` | ✅ BLOQUEADO (ESLint + A6) |
| `oracledb` | `createRequire` con binding renombrado | ⚠️ **BYPASS REAL** (ESLint + A6 ciegos) |
| `oracledb` | `await import('oracledb')` | ⚠️ **BYPASS REAL** (ESLint + A6 ciegos) |
| Runner paralelo | `*.spec.ts`, `playwright.config.mjs` | ✅ BLOQUEADOS |
| Runner paralelo | `*.spec.js` | ⚠️ BYPASS (no ejecutable vía scripts del proyecto) |
| World | `setWorldConstructor as registerWorld` | ⚠️ **BYPASS REAL** de A4 |
| `CustomWorld` | getter / parameter property / nombre computado / class expression | ⚠️ los 4 escapan a A5 |
| Quality gate | `.js` con 3 violaciones · test fuera de `src/` · `.ts` fuera de `include` | ⚠️ **quality exit 0 con las 3 presentes** |
| Arquitectura UI | Component `extends BasePage` + locator inline sin `root` | ⚠️ **quality exit 0** |

**Bypasses reales encontrados: 6** (`playwright-core` desde Steps; `oracledb` por dynamic import; `oracledb` por `createRequire` renombrado; `setWorldConstructor` aliasado; tests fuera de `src/` que nunca corren; convenciones UI T07/T08 sin enforcement alguno).

Hallazgo colateral relevante: el comentario de `src/architecture.test.ts:22-29` afirma que `const { env } = process` es un hueco conocido "deliberadamente dejado abierto". La medición lo contradice — ESLint **sí** lo bloquea. Es documentación desactualizada dentro de un archivo de enforcement permanente.

---

## 5. Findings

| Severidad | Cantidad | IDs |
|---|---|---|
| BLOCKER | **0** | — |
| HIGH | 3 | F-01, F-02, F-04 |
| MEDIUM | 4 | F-03, F-05, F-06, F-10 |
| LOW | 5 | F-07, F-08, F-09, F-11, F-12 |
| INFO | 2 | F-13, F-14 |
| **Total** | **14** | |

Los tres HIGH, en una línea cada uno:

- **F-01** — Las convenciones de T07 (locators) y T08 (jerarquía Page/Component) no tienen **ningún** enforcement automático. La garantía de T08 es "una subclase de `BaseComponent` no puede navegar", no "un Component no puede navegar": basta extender `BasePage` para recuperar `goto`/`reload`, con `quality` verde.
- **F-02** — El aislamiento de `oracledb` se rompe con `await import('oracledb')` o renombrando el binding de `createRequire`. A6 detecta el patrón `require` solo si la variable se llama literalmente `require`. El dynamic import es especialmente plausible porque `support/databaseLifecycle.ts:17` ya usa exactamente ese idioma.
- **F-04** — Un `*.test.ts` fuera de `src/**` nunca se ejecuta y `test:unit` igual reporta 57/57. Agravante: el README indica colocar los tests junto al código que prueban, lo que para `support/**` o `features/**` produce un test muerto en silencio.

Ninguno alcanza el umbral de BLOCKER definido para esta auditoría: no permiten exponer secretos, ni introducir un runner paralelo vía los scripts o el CI del proyecto, ni usar una capacidad inexistente, ni modificar infraestructura crítica sin dejar rastro revisable.

---

## 6. Quality Gate

Composición confirmada por ejecución: `typecheck && lint && format:check && test:unit`, y `test:unit` = `QueryBuilder.test.ts` + `index.test.ts` + `architecture.test.ts` (los únicos tres `*.test.ts` del repositorio). **No ejecuta Cucumber E2E** — confirmado.

Baseline y estado final: **PASS, exit 0, 57/57**.

El hallazgo estructural del gate es que está construido sobre cuatro allowlists independientes (`tsconfig.include`, `files: ['**/*.ts']` de ESLint, el glob `src/**/*.test.ts`, y el walker de arquitectura). Todo lo que cae fuera de las cuatro queda sin verificar — origen de F-03, F-04 y F-10.

---

## 7. E2E

```bash
BASE_URL=https://playwright.dev HEADLESS=true BROWSER=chromium DB_ENABLED=false npm test
→ 2 scenarios (2 passed), 6 steps (6 passed)
```

Cucumber es el único runner (los cinco scripts `test*` invocan `cucumber-js`; A3 impide un script con `playwright test`). Playwright se usa como librería: `playwright` para lanzar el browser en `world.ts`, `@playwright/test` solo para `expect` y tipos. Los 5 Steps son delegaciones de una línea a `this.pages.*`.

---

## 8. Developer Experience

Evaluado desde los cuatro perfiles pedidos:

- **QA básico/intermedio:** crear un test UI normal es simple y el happy path del README es correcto. Toca `features/**`, un Page, opcionalmente un Component, y una línea en `Pages.ts`.
- **QA Automation Engineer:** bien servido. Las abstracciones son pocas y cada una corresponde a una responsabilidad demostrada; no hay indirección especulativa (`BaseComponent` deliberadamente no declara métodos propios).
- **SDET mantenedor:** bien. El riesgo de mantenimiento real es que varios matchers son dependientes de forma (un nombre de identificador, solo `PropertyDeclaration`, solo `.spec.ts`) y dejarán de cubrir lo que sus comentarios afirman a medida que el código evolucione.
- **Agente IA:** es donde se concentran los huecos. Un agente leerá la tabla "Architecture Guardrails" del README como verdad y concluirá que la jerarquía UI, el aislamiento del driver y la prohibición de `waitForTimeout` están garantizados por máquina. Para la jerarquía UI no lo están en absoluto.

No se reportaron refactors cosméticos como problemas. No hay exceso de abstracciones.

---

## 9. AI Readiness

Lo que está listo: ejemplo único e inequívoco de cada patrón; definición de "hecho" verificable por máquina en ~4 s sin browser ni red; fronteras de Steps, config y valores SQL realmente enforced; higiene de secretos correcta; imposible introducir un runner paralelo por los scripts o el CI del proyecto.

Lo que no: **un `npm run quality` verde no implica corrección arquitectónica**, y la documentación invita a creer que sí. Se demostraron cuatro caminos "gate verde / código incorrecto", y las dos convenciones que T07 y T08 existieron para establecer son justamente las que no tienen enforcement.

---

## 10. Verdict

**CONDITIONALLY READY**

Fase 1 cumplió sus objetivos y **no existen BLOCKERS**, por lo que no corresponde declararla fallida. Pero tampoco se la marca como cerrada incondicionalmente: la condición es cerrar la brecha entre enforcement percibido y real.

La Fase 2 puede comenzar si se cumple una de estas dos:

- **(a)** se cierran F-01 y F-04 antes (los dos que más directamente producen salida de IA incorrecta y silenciosa); o
- **(b)** `CLAUDE.md` deja explícito que la jerarquía UI y las convenciones de locators son **review-enforced, no machine-enforced**, que un gate verde es necesario pero no suficiente, y que los cambios en `src/pages/**`, `src/components/**` y `src/base/**` requieren revisión arquitectónica humana.

La opción (a) es la más sólida: F-01 es un cambio acotado y aditivo que usa la misma técnica AST que A5 ya emplea.

---

## 11. Próximos pasos

1. **Cerrar F-01 y F-04** como tarea breve y enfocada (dos architecture tests aditivos, sin tocar código productivo) → habilitaría un READY incondicional.
2. Escribir **`CLAUDE.md`** codificando la frontera honesta de enforcement documentada en §11 y §13 del informe principal.
3. Agentes especializados.
4. Playwright MCP.

Las capacidades ausentes conocidas (API layer, Test Data Management, auth/`storageState`, screenshots/traces, logging estructurado, matriz de ambientes, paralelismo/retries) **no** son prerequisitos: son roadmap independiente y están correctamente documentadas como inexistentes.

---

## 12. Estado del repositorio al cerrar T10

Ningún código productivo, configuración, test, guardrail, documentación operativa ni CI fue modificado. Los 14 fixtures temporales fueron eliminados y su ausencia verificada (`find` + `git status` limpios).

Archivos permanentes creados por T10 — los dos únicos permitidos:

- `docs/ai-foundation-final-audit.md`
- `docs/refactor-progress-ia/T10-final-audit.md`
