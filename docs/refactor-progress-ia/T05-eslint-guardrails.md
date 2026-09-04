# T05 — ESLint Architecture Guardrails

**Date:** 2026-09-04
**Status:** ✅ COMPLETED
**Branch:** `feature/ai-foundation`

---

## 1. Objetivo

Resolver la parte ESLint de P6 del AI Foundation Plan: convertir en reglas de ESLint, automáticamente verificables, un conjunto de convenciones arquitectónicas que hoy solo existían como intención de diseño (visible en el código y en [[T01-documentation-cleanup]]/[[T02-world-cleanup]], pero no exigible por herramienta):

- Cucumber sigue siendo el único runner E2E; Playwright se usa solo como librería.
- Los Steps son la frontera entre Cucumber y el resto del framework: no deben tocar Playwright, Pages, Components ni la capa de base de datos directamente.
- `process.env` tiene un único dueño (`src/config/**`), salvo la excepción ya establecida en [[T04-config-unit-tests]] para los tests que necesitan simular distintos entornos.
- `oracledb` solo puede importarse desde la implementación autorizada del driver.

Alcance explícitamente **excluido** de T05 (queda para T06 — Architecture Tests): verificación de `setWorldConstructor` único, allowlist de propiedades de `CustomWorld`, búsqueda por filesystem de `*.spec.ts`/`playwright.config.*`, inspección de `package.json`, detección de `createRequire('oracledb')`, tags obligatorios en `.feature`.

---

## 2. Estado inicial

Antes de editar nada se leyeron completos: `eslint.config.js`, `package.json`, `tsconfig.json`, `support/world.ts`, `features/steps/example.steps.ts` (único Step existente), `src/config/index.ts` y `src/database/clients/OracleDatabaseClient.ts`, para verificar la estructura real de imports en vez de asumirla:

- `eslint.config.js` no tenía ningún guardrail arquitectónico: solo `@typescript-eslint/no-explicit-any` (con una excepción documentada para `OracleDatabaseClient.ts`) y `@typescript-eslint/no-unused-vars`.
- `OracleDatabaseClient.ts` **no importa `oracledb` con `import`**: usa `createRequire(import.meta.url)` + `require('oracledb')` (línea 5-6), precisamente para aislar el driver sin tipos detrás de un `require` explícito. Esto significa que una regla `no-restricted-imports` sobre `oracledb` no dispara hoy contra este archivo — la excepción se agrega igualmente, de forma defensiva y acotada al archivo exacto, tal como pide la tarea, para el día en que ese require se exprese como import o para cualquier otro archivo futuro en esa misma ubicación autorizada.
- `support/world.ts` importa `chromium, firefox, webkit, Browser, BrowserContext, Page` desde `'playwright'` (la librería, no el runner) y expone `this.pages`, `this.repositories` (opcional), `this.testContext` en `CustomWorld` — confirma que la superficie legítima para Steps ya existe y no fue necesario crearla.
- `features/steps/example.steps.ts` es el único Step del repo. Ya sigue el patrón correcto: importa `Given/Then` de `@cucumber/cucumber` y el tipo `CustomWorld` de `support/world.js`, y solo llama a `this.pages.example.*`. Sirvió como referencia del "camino feliz" que los guardrails no deben romper.
- Búsqueda explícita (`grep`) de `process\.env`, imports de `playwright`/`@playwright/test`/`oracledb` y `waitForTimeout` en todo `**/*.ts`: **no se encontró ninguna violación preexistente** de ningún guardrail. `process.env` solo aparece en `src/config/index.ts` y `src/config/index.test.ts`; los imports de `@playwright/test` (`support/world.ts` usa `'playwright'`, `src/pages/**`/`src/components/**` usan `Page/Locator/expect`) son todos del tipo permitido; no existe ningún `*.spec.ts` ni `playwright.config.*` en el repo.

---

## 3. Guardrails implementados

| # | Guardrail | Mecanismo ESLint |
|---|---|---|
| G1 | Prohibir el runner de Playwright Test (`test`, `describe`, `it`, `beforeAll`, `beforeEach`, `afterAll`, `afterEach` desde `@playwright/test`); `expect` y tipos siguen permitidos | `no-restricted-imports` con `importNames`, global |
| G2 | Prohibir `*.waitForTimeout(...)` en cualquier archivo, incluyendo Steps | `no-restricted-syntax` con selector AST, global + re-listado en el override de Steps |
| G3 | `process.env` solo permitido en `src/config/**` y `**/*.test.ts` | `no-restricted-properties`, global + `off` en las dos excepciones |
| G4 | `oracledb` solo importable desde `src/database/clients/OracleDatabaseClient.ts` | `no-restricted-imports` con `paths`, global + excepción de archivo exacto |
| G5 | Steps no importan Playwright/Pages/Components/Database, ni acceden a `this.page`/`this.context`/`this.browser` | `no-restricted-imports` (`paths` + `patterns` recursivos) y `no-restricted-syntax` (selectores AST sobre `this.*`), override `features/steps/**/*.ts` |
| G6 | SQL directo desde Steps | **No requiere regla nueva** — cubierto por G5 (Steps no pueden importar la capa database) + las barreras `private`/`protected` ya existentes en `BaseRepository`/`RepositoryContainer`. No se implementó ningún regex sobre `SELECT/INSERT/UPDATE/DELETE` (produciría falsos positivos, tal como indicó la tarea) |
| G7 | Prohibir archivos `*.spec.ts` | `no-restricted-syntax` con selector `Program`, override `**/*.spec.ts` |
| G8 | Prohibir `playwright.config.*` | `no-restricted-syntax` con selector `Program`, override `**/playwright.config.*` |

---

## 4. Diseño de los overrides

### 4.1. El riesgo de reemplazo de reglas en flat config

ESLint flat config **no fusiona** las opciones de una regla entre distintos objetos de configuración que matchean el mismo archivo: cuando dos objetos configuran el mismo `ruleId` para el mismo archivo, el **último objeto que matchea gana por completo**, reemplazando el array de opciones anterior entero — no lo extiende. Esto ya había sido detectado como riesgo antes de esta tarea (mencionado explícitamente en el prompt de T05).

Esto afecta a T05 en dos puntos concretos:

1. El override de `features/steps/**/*.ts` configura `no-restricted-syntax` (para G5, prohibiendo `this.page`/`this.context`/`this.browser`) y `no-restricted-imports` (para G5, prohibiendo Playwright/Pages/Components/Database). Ambas reglas **ya estaban configuradas globalmente** por G2 (`waitForTimeout`) y G1+G4 (`no-restricted-imports`). Si el override de Steps solo hubiera declarado sus reglas nuevas, habría **reemplazado silenciosamente** la protección global de `waitForTimeout` y de `oracledb`/runner de Playwright para todo el árbol `features/steps/**`.
2. El override del archivo autorizado de Oracle (`OracleDatabaseClient.ts`) ya reconfigura `no-explicit-any` (algo preexistente de antes de T05); T05 le agrega también `no-restricted-imports` para exceptuarlo de G4, con el mismo riesgo.

**Solución aplicada:** se declararon constantes compartidas al inicio del archivo (`NO_PLAYWRIGHT_RUNNER_IMPORT`, `NO_ORACLEDB_IMPORT`, `WAIT_FOR_TIMEOUT_SELECTOR`, `NO_THIS_PAGE_SELECTOR`, `NO_THIS_CONTEXT_SELECTOR`, `NO_THIS_BROWSER_SELECTOR`, `NO_PROCESS_ENV`) y cada override que necesita reconfigurar una regla ya global **re-lista explícitamente** las entradas que quiere seguir enforzando, además de las nuevas:

- El override de `OracleDatabaseClient.ts` reconfigura `no-restricted-imports` con `paths: [NO_PLAYWRIGHT_RUNNER_IMPORT]` (mantiene la prohibición del runner de Playwright; omite `NO_ORACLEDB_IMPORT`, que es exactamente la excepción que ese archivo necesita).
- El override de `features/steps/**/*.ts` reconfigura `no-restricted-imports` con `paths: [NO_ORACLEDB_IMPORT, {name:'playwright',...}, {name:'@playwright/test',...}]` (mantiene la prohibición de `oracledb` y agrega las de Steps) y `no-restricted-syntax` con `[WAIT_FOR_TIMEOUT_SELECTOR, NO_THIS_PAGE_SELECTOR, NO_THIS_CONTEXT_SELECTOR, NO_THIS_BROWSER_SELECTOR]` (mantiene `waitForTimeout` y agrega los tres selectores de `this.*`).

Esta estrategia se validó empíricamente (ver §6 y §11): el caso crítico `this.page.waitForTimeout(500)` dentro de un Step reporta **ambas** violaciones, no solo una.

### 4.2. `no-restricted-imports` — `paths` vs `patterns`

- `paths` restringe módulos por **nombre exacto** (`'oracledb'`, `'playwright'`, `'@playwright/test'`), opcionalmente acotado a ciertos `importNames` (usado en G1 para permitir `expect`/tipos pero no el runner).
- `patterns` (con `group: [...]`) restringe por **glob contra el specifier del import**, no contra la ruta resuelta en disco. Se usaron los patrones recursivos `**/src/pages/**`, `**/src/components/**`, `**/src/database/**` (con el prefijo `src/` explícito para no matchear accidentalmente cualquier carpeta llamada "pages"/"database" fuera de `src/`). Se verificó empíricamente (§6) que un import relativo como `../../src/pages/example/ExamplePage.js` matchea el patrón, y que el patrón sigue matcheando a cualquier profundidad de anidamiento de Steps (`features/steps/nested/*.steps.ts`), es decir, es realmente recursivo y no solo de un nivel.

### 4.3. `no-restricted-properties` para G3

`no-restricted-properties` usa la utilidad interna de ESLint para obtener el nombre estático de una propiedad, que cubre tanto acceso no computado (`process.env`) como computado con literal de cadena (`process['env']`) — se restringe el acceso a `process.env` en sí mismo (el `MemberExpression` intermedio), lo cual cubre automáticamente tanto `process.env.X` como `process.env['X']` sin necesitar reglas separadas para cada forma, sin complicar la regla con patrones que hoy no existen en el repo (tal como pidió la tarea).

### 4.4. `no-restricted-syntax` con selectores AST (`esquery`)

- G2: `"CallExpression[callee.type='MemberExpression'][callee.property.name='waitForTimeout']"` — dispara sobre `x.waitForTimeout(...)` para cualquier `x`, sin acoplarse a si `x` es `this.page`, un `Locator` o cualquier otro objeto.
- G5: `"MemberExpression[object.type='ThisExpression'][property.name='page']"` (y análogos para `context`/`browser`) — dispara específicamente sobre `this.page`, `this.context`, `this.browser`, y **no** sobre `this.pages`, `this.repositories` ni `this.testContext` (nombres de propiedad distintos).
- G7/G8: selector `'Program'` — dispara siempre, en cualquier archivo que matchee el `files` del override, sin mirar el contenido. Es intencionalmente una prohibición incondicional del archivo completo.

---

## 5. Archivos modificados

- `eslint.config.js` — único archivo modificado. Se agregaron las 8 constantes de guardrail, las reglas `no-restricted-imports`/`no-restricted-syntax`/`no-restricted-properties` en el objeto global `**/*.ts`, y cuatro overrides nuevos: `src/database/clients/OracleDatabaseClient.ts` (regla `no-restricted-imports` agregada al override ya existente de `no-explicit-any`), `['src/config/**/*.ts', '**/*.test.ts']` (desactiva `no-restricted-properties`), `features/steps/**/*.ts` (nuevo) y `**/*.spec.ts` / `**/playwright.config.*` (nuevos).
- Formateado con `prettier --write eslint.config.js` (única acción de Prettier de esta tarea, limitada a este archivo).
- Ningún otro archivo del framework fue tocado.

---

## 6. Fixtures negativos utilizados

Todos los fixtures fueron temporales, ubicados en rutas reales del árbol (nunca bajo `.tmp-*/**`, que está en `ignores` y por lo tanto ESLint nunca lo evalúa — se probó y descartó esa ubicación antes de crear los fixtures definitivos), y **borrados inmediatamente después de validar cada guardrail**. Resultado de correr `npx eslint <fixture>` sobre cada uno:

| Fixture | Ubicación | Resultado |
|---|---|---|
| `import { test } from '@playwright/test'` | `src/` | ❌ FAIL — `no-restricted-imports` (G1) |
| `import { expect } from '@playwright/test'` | `src/` | ✅ PASS |
| Archivo `*.spec.ts` (contenido irrelevante) | `src/` | ❌ FAIL — `no-restricted-syntax` (G7) |
| Archivo `playwright.config.ts` (contenido irrelevante) | raíz del repo | ❌ FAIL — `no-restricted-syntax` (G8) |
| `process.env.SOME_VAR` y `process.env['SOME_OTHER_VAR']` | `src/` | ❌ FAIL (2 errores) — `no-restricted-properties` (G3) |
| `import oracledb from 'oracledb'` | `src/` (fuera de `database/clients`) | ❌ FAIL — `no-restricted-imports` (G4) |
| `import oracledb from 'oracledb'` | `src/database/clients/` pero en un archivo **distinto** a `OracleDatabaseClient.ts` | ❌ FAIL — confirma que la excepción de G4 está acotada al archivo exacto, no a todo el directorio |
| Step importando `ExamplePage` (`../../src/pages/...`) | `features/steps/` | ❌ FAIL — `no-restricted-imports` patterns (G5) |
| Step importando `ExampleNavigationComponent` (`../../src/components/...`) | `features/steps/` | ❌ FAIL — `no-restricted-imports` patterns (G5) |
| Step anidado importando `RepositoryContainer` (`../../../src/database/...`) | `features/steps/nested/` | ❌ FAIL — confirma que el patrón recursivo matchea a cualquier profundidad, no solo un nivel |
| Step importando `chromium` desde `'playwright'` | `features/steps/` | ❌ FAIL — `no-restricted-imports` paths (G5) |
| Step importando `expect` desde `'@playwright/test'` | `features/steps/` | ❌ FAIL — `no-restricted-imports` paths (G5, ban total en Steps, a diferencia de G1 que sí permite `expect` en el resto del repo) |
| Step con `this.page.getByRole(...)` | `features/steps/` | ❌ FAIL — `no-restricted-syntax` (G5, `this.page`) |
| **Step con `this.page.waitForTimeout(500)`** | `features/steps/` | ❌ **FAIL — 2 errores simultáneos**: `waitForTimeout(...)` (G2) **y** `this.page` (G5) — ver §11 |

Todos los fixtures importaban además `import type { CustomWorld } from '../../support/world.js'` (o `'../../../support/world.js'` en el anidado) para confirmar que ese import legítimo **nunca** fue señalado por ningún guardrail.

Los 14 fixtures fueron borrados con `rm` (incluyendo el directorio `features/steps/nested/` y `playwright.config.ts` en la raíz) inmediatamente después de registrar cada resultado; `git status --porcelain` confirmó, tras el borrado, que el único cambio pendiente en el repo es `eslint.config.js`.

---

## 7. Verificaciones positivas

- `npx eslint src/config/index.ts src/config/index.test.ts` → sin errores (G3 no rompe la excepción de config/tests).
- `npx eslint features/steps/example.steps.ts` (el único Step real del repo) → sin errores (G5 no rompe el camino feliz ya existente: `this.pages.example.*`, import de tipo `CustomWorld`).
- `npm run lint` sobre el repositorio completo (antes de los fixtures y de nuevo después de borrarlos) → sin errores en ambas corridas.

---

## 8. Qué NO cambió

- ✅ Cucumber sigue siendo el único runner E2E — no se creó `playwright.config.ts`, ningún `*.spec.ts`, ni se agregó Playwright Test como runner.
- ✅ Playwright sigue usándose únicamente como librería (`support/world.ts`, `src/pages/**`, `src/components/**` sin cambios).
- ✅ No se crearon architecture tests todavía (quedan para T06).
- ✅ No se creó CLAUDE.md, MCP, ni agentes.
- ✅ No se creó `BaseComponent`/`BaseUiObject`.
- ✅ No se agregó ningún test funcional nuevo.
- ✅ `src/config/index.ts`, `src/database/clients/OracleDatabaseClient.ts`, `support/world.ts`, `features/steps/example.steps.ts` y el resto del código productivo — **sin cambios**. Ningún guardrail reveló una violación real preexistente que obligara a tocar código productivo (ver §10).
- ✅ `package.json` / `tsconfig.json` — sin cambios; T05 es exclusivamente un cambio de configuración de ESLint.
- ✅ `quality` sigue siendo `typecheck && lint && format:check`, sin `test:unit` (esa integración es explícitamente el segundo objetivo de T06, no de T05).
- ✅ Sin nuevas dependencias.

---

## 9. Validaciones ejecutadas

### 9.1. `npm run lint` (repo real, sin fixtures)
```
> eslint .
```
PASS — sin salida, sin errores.

### 9.2. `npm run typecheck`
```
> tsc --noEmit
```
PASS — sin salida.

### 9.3. `npm run test:unit`
```
ℹ tests 49
ℹ suites 12
ℹ pass 49
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
PASS — los 49 tests preexistentes ([[T03-querybuilder-unit-tests]] + [[T04-config-unit-tests]]) siguen pasando sin cambios, confirmando que los guardrails de ESLint no interfieren con el runner de `node --test`.

### 9.4. `npm run format:check`
Primera corrida: reportó `eslint.config.js` con problemas de estilo (el archivo recién editado no coincidía exactamente con Prettier). Se corrigió con `npx prettier --write eslint.config.js` (única acción de Prettier de esta tarea, limitada al archivo modificado por T05). Segunda corrida:
```
Checking formatting...
All matched files use Prettier code style!
```
PASS.

### 9.5. `npm run quality`
```
typecheck: PASS
lint: PASS
format:check: All matched files use Prettier code style!
```
PASS — confirmado que `quality` sigue sin incluir `test:unit`.

### 9.6. `git status`
```
On branch feature/ai-foundation
Your branch is ahead of 'origin/feature/ai-foundation' by 1 commit.
Changes not staged for commit:
  modified:   eslint.config.js
```
(El commit "ahead" — `test: add config unit coverage` — corresponde al trabajo de T04, confirmado en el historial (`git log`) y realizado fuera de esta sesión, no a esta tarea.)

### 9.7. `git diff`
Diff completo limitado a `eslint.config.js` (todas las adiciones descritas en §3-§5; sin eliminar ni modificar ninguna regla existente).

### 9.8. `git diff --stat`
```
eslint.config.js | 194 +++++++++++++++++++++++++++++++++++++++++++++++++++++++
1 file changed, 194 insertions(+)
```

---

## 10. Problemas encontrados

**Ninguna violación real preexistente.** La búsqueda inicial (§2) y las corridas de `npm run lint` antes/después de los fixtures confirman que ningún archivo productivo del repositorio viola ninguno de los 8 guardrails. No fue necesario modificar código productivo.

**Matiz de diseño documentado (no es un bug):** `OracleDatabaseClient.ts` usa `require('oracledb')` vía `createRequire`, no `import`, por lo que la excepción de G4 en ese archivo es hoy defensiva/preventiva — la regla `no-restricted-imports` nunca dispararía contra ese archivo tal como está escrito ahora mismo, con o sin la excepción. Se agregó igual porque (a) la tarea lo pidió explícitamente como mínimo cubrir ese archivo, y (b) es el lugar correcto si ese `require` alguna vez se expresa como `import` sin cambiar de diseño. La detección de `createRequire('oracledb')` como patrón adicional queda, correctamente, fuera de alcance de T05 (pertenece al architecture test de T06, según la tarea).

---

## 11. Resultado

**Status:** ✅ **COMPLETADO SIN REGRESIONES**

- ✅ 8 guardrails (G1-G8) implementados en `eslint.config.js`, todos verificables por ESLint únicamente, sin nuevas dependencias.
- ✅ Caso crítico verificado empíricamente: un Step con `this.page.waitForTimeout(500)` produce **las dos violaciones esperadas simultáneamente** (`waitForTimeout` de G2 y `this.page` de G5) — el override de `features/steps/**/*.ts` no desactivó silenciosamente ninguna regla global, gracias a la estrategia de constantes compartidas re-listadas explícitamente (§4.1).
- ✅ 14 fixtures negativos/positivos temporales creados, ejecutados y **borrados por completo** — `git status` confirma que no queda ningún rastro en el repositorio.
- ✅ Código productivo real: **sin cambios**, sin violaciones preexistentes encontradas.
- ✅ `npm run lint`, `npm run typecheck`, `npm run test:unit` (49/49), `npm run format:check` y `npm run quality`: todos PASS contra el estado final del repositorio.

---

## 12. Aprendizaje técnico

1. **Convención vs. guardrail ejecutable.** Antes de T05, "Cucumber es el único runner", "los Steps no tocan Playwright directamente" o "`process.env` tiene un único dueño" eran afirmaciones de diseño verificables solo por lectura de código o por disciplina del equipo/de una IA generando código nuevo. Un guardrail ejecutable convierte esa prosa en un `npm run lint` que falla con un mensaje explícito y una línea exacta — la diferencia entre "esto no se debería hacer" y "esto no compila el pipeline de calidad".

2. **`no-restricted-imports` es la herramienta correcta para prohibir una API o un módulo completo sin tocar código de runtime.** Permite dos niveles de granularidad — módulo completo (`paths` con solo `name`) o nombres específicos dentro de un módulo (`paths` con `importNames`, como en G1, donde `expect` debe seguir permitido) — y, con `patterns`, prohibir por forma de ruta (glob) en vez de por nombre exacto, que es lo que hace posible G5 sin enumerar cada Page/Component uno por uno.

3. **Los Steps no deben conocer Playwright directamente porque son la capa de traducción entre el lenguaje de negocio (Gherkin) y la implementación técnica, no la implementación técnica en sí.** Si un Step pudiera hacer `this.page.click(...)`, cada Step se volvería un acoplamiento directo a Playwright, exactamente lo que Page Objects (`this.pages`) existen para evitar; un cambio futuro de librería de automatización tendría que tocar cientos de Steps en vez de una capa de Pages. El mismo razonamiento aplica a `this.repositories` para la base de datos.

4. **`process.env` necesita un único dueño porque es el único punto de entrada de configuración no tipado del proceso.** Si cualquier archivo pudiera leer `process.env` directamente, la validación fail-fast de `src/config/index.ts` (documentada y testeada en [[T04-config-unit-tests]]) dejaría de ser la única fuente de verdad: dos lugares podrían interpretar la misma variable de forma distinta, o un archivo podría leer una variable sin la validación/default que `config` ya le aplica. Los tests son la excepción documentada porque necesitan simular entornos distintos — no porque el principio no les aplique, sino porque su función es precisamente ejercitar esa validación.

5. **Prohibir el runner de Playwright Test evita que se forme una arquitectura paralela de facto.** Si `test`/`describe`/`it` de `@playwright/test` estuvieran disponibles, nada impediría que, con el tiempo, aparecieran archivos `*.spec.ts` corriendo con `npx playwright test` en paralelo a Cucumber — dos runners E2E coexistiendo, cada uno con su propia noción de fixtures, reportes y configuración. G1+G7+G8 cierran esa puerta en tres capas (API del runner, convención de nombre de archivo, archivo de configuración del runner), no en una sola, precisamente porque cualquiera de las tres, por sí sola, podría bypassearse.

6. **El problema de reemplazo de reglas en ESLint flat config es sutil porque falla en silencio.** Un override que agrega una restricción nueva sobre una regla ya configurada globalmente no produce ningún error de ESLint ni de sintaxis si "olvida" re-listar las restricciones anteriores — simplemente dejan de aplicarse para los archivos que matchean ese override, sin ningún aviso. La única forma de detectarlo es empírica (un fixture que debería violar ambas reglas y solo reporta una) o por disciplina de diseño (declarar cada lista de restricciones como una constante nombrada y grepeable, y exigir que todo override que toque ese `ruleId` la reutilice explícitamente). T05 aplicó la segunda y confirmó con la primera.

7. **Documentación + lint + architecture tests son tres capas independientes, no redundantes.** La documentación (T01/T02) explica el *por qué* a un lector humano o una IA que está diseñando; el lint (T05) rechaza la violación en el momento de escribir el código, con el costo más bajo posible (un guardado de archivo); un architecture test (T06) puede verificar invariantes que ESLint no puede expresar de forma estática — estructura de filesystem, contenido de `package.json`, uso de `createRequire` con un string dinámico, unicidad de `setWorldConstructor` en tiempo de ejecución. Ninguna de las tres reemplaza a las otras: G6 es el ejemplo más claro dentro de T05 — la protección real no es un regex de ESLint sobre palabras SQL (que produciría falsos positivos), sino la combinación de G5 (Steps no importan la capa database) con las barreras `private`/`protected` ya existentes en el código, más lo que T06 agregará después.

---

## 13. Próxima tarea

`T06 — Implementar Architecture Tests e integrar unit tests al quality gate.`

**NO EJECUTADO EN ESTA SESIÓN.**
