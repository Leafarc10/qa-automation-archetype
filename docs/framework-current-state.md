# Framework Current State Assessment

> **Tipo de documento:** inventario + gap analysis. Solo análisis, sin cambios de código.
> **Fecha:** 2026-09-04
> **Alcance analizado:** `features/`, `support/`, `src/`, `cucumber.js`, `tsconfig.json`, `package.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.env.example`, `.gitignore`, `.vscode/settings.json`, `.github/workflows/ci.yml`, `README.md`, `AGENTS.md`, `src/database/AGENTS-database.md`, `support/AGENTS-support.md`, `docs/refactor-progress/**` (como antecedente).
> **Regla aplicada:** cuando documentación y código se contradicen, **manda el código**. Cada afirmación relevante lleva evidencia (`archivo:línea`).
> **Verificación ejecutada:** `npm run quality` (read-only) → **PASS**. No se ejecutó `npm test` para no generar artefactos en `reports/`.

---

## 1. Executive Summary

1. **Lo que existe es correcto, pero es muy poco.** El framework son **16 archivos TypeScript / 1.008 líneas**, **1 feature**, **2 escenarios**, **5 step definitions**, **1 Page**, **1 Component**, **1 Repository**. No es un framework maduro: es un **arquetipo/plantilla limpia y ejecutable** con un ejemplo de cada patrón.

2. **La columna vertebral es sólida y coherente.** `Feature → Step → CustomWorld → Pages → Page → Component` y `Step → RepositoryContainer → Repository → BaseRepository → DatabaseClient → OracleDatabaseClient` están implementados de verdad, sin atajos: 0 locators en steps (`features/steps/example.steps.ts` son 5 delegaciones de una línea), 0 `expect()` en steps, 0 SQL en steps, 0 `waitForTimeout`, 1 único lector de `process.env` (`src/config/index.ts:26`).

3. **La capa DB es la pieza más fuerte y la más "framework" del repo.** Contrato agnóstico de driver (`DatabaseClient.ts`, solo tipos), pool lazy con lifecycle de dueño único (`support/databaseLifecycle.ts`), `BaseRepository` con helpers `protected` (no se puede llegar a SQL crudo desde un step), y un `QueryBuilder` con **modelo de seguridad real**: valores siempre por binds, identificadores solo por allowlist del repositorio, rechazo explícito (nunca sanitizar) — `src/database/builders/QueryBuilder.ts:49-110`.

4. **Pero ese `QueryBuilder` crítico para seguridad tiene 0 tests automatizados en el repo.** Las 37 validaciones que menciona `docs/refactor-progress/T12-query-builder.md` fueron scripts ad-hoc borrados. No existe runner de tests unitarios (no hay vitest/jest/`node:test`). Es el gap más peligroso del inventario.

5. **No hay `playwright.config.ts` y esto no es un olvido: es la causa raíz de tres gaps.** Playwright se usa como **librería** (`support/world.ts:2`, launchers importados de `playwright`), no como runner. Consecuencia directa: **sin traces, sin screenshots, sin video, sin retries, sin workers/paralelismo** — nada de eso viene "gratis" porque esa infraestructura vive en el runner de Playwright, no en Cucumber.

6. **Observabilidad = casi cero.** Reporting es solo formatters nativos de Cucumber (JSON + HTML, `cucumber.js:12-16`). **0 screenshots, 0 traces, 0 videos, 0 Allure, 0 logger.** Todo el logging del framework es **una sola línea**: `console.error` en `support/hooks.ts:36`. Un fallo en CI hoy produce texto y nada más.

7. **Ejecución serial y costosa.** `cucumber.js` no declara `parallel` ni `retry`, y `world.init()` **lanza un browser completo por escenario** (`support/world.ts:32`), sin reutilización. Aislamiento perfecto, escalabilidad mala.

8. **No existe capa de Test Data.** No hay `factories/`, `builders/` de datos, `fixtures/`, constantes de dominio ni namespacing. El único mecanismo es `testContext: Record<string, unknown>` (`support/world.ts:24`), libre y sin tipar. No hay data prep, ni cleanup, ni seeding, ni transacciones.

9. **No existe capa de API.** Confirmado: no hay `src/api`, ni clients, ni auth, ni schema validation, ni integración API+UI+DB. El README ya lo declara honestamente (`README.md:453`).

10. **Configuración: centralizada y bien validada, pero plana.** `src/config/index.ts` valida estrictamente (`HEADLESS` solo `'true'/'false'`, `BROWSER` contra lista, `DEFAULT_TIMEOUT_MS` entero positivo, credenciales DB requeridas solo si `DB_ENABLED=true`). Pero es **una sola dimensión**: un `BASE_URL`, sin matriz de ambientes (dev/qa/uat/prod) ni de países. La configuración por país fue eliminada deliberadamente y **no fue reemplazada** por un mecanismo genérico.

11. **Secretos: limpio.** No hay `.env` en el repo, `.env.example` solo placeholders vacíos, `.gitignore` cubre `.env`/`.env.*` con whitelist de `.env.example`, y el CI **no usa ningún GitHub secret** (`.github/workflows/ci.yml:16-23`). 0 credenciales hardcodeadas en `src/`, `support/`, `features/`.

12. **CI existe y es real, pero es mínimo.** Un job (`quality` + `npm test`), Chromium únicamente, artifacts de reportes con `if: always()`, permisos de menor privilegio. **No hay** matriz de browsers, ni job `@db`, ni split smoke/regression, ni `schedule`, ni quality gates más allá del exit code. A diferencia de lo que dice `docs/refactor-progress/T20-final-audit.md`, **el repo ya tiene remote** (`origin → github.com/Leafarc10/qa-automation-archetype`), así que el pipeline ya es ejecutable; no pude verificar el resultado de la corrida (no hay `gh` CLI instalado).

13. **Deuda documental concreta y medible: `docs/refactor-progress/` está en `.gitignore:65` y NO está trackeado** (`git ls-files` no lo lista), pero **15 archivos trackeados lo referencian** — incluidos `AGENTS.md:50`, `AGENTS.md:71`, `README.md:133`, `README.md:405`, `cucumber.js:6`, `eslint.config.js:22`, `.env.example:2`, `.github/workflows/ci.yml:18`. Para cualquiera que clone el repo — **y para cualquier agente de IA** — son referencias muertas. La nota IN-03 del T20 ("resuelven a `docs/refactor-progress/*.md`, que viaja con el repo") **ya es falsa**.

14. **Contradicción doc↔código vigente:** `support/AGENTS-support.md:27` documenta `init(options?: { storageStatePath?: string; headless?: boolean })` con soporte de `storageState`. En el código **eso no existe**: `support/world.ts:10-12` solo tiene `headless?`. `storageState` fue eliminado (T20/FA-005) y la doc del módulo nunca se actualizó. **No hay autenticación de ningún tipo** en el framework.

15. **Veredicto AI:** **PARTIALLY READY.** El tamaño (1.008 LOC entra completo en contexto), la coherencia arquitectónica y `AGENTS.md` son excelentes insumos para IA. Pero faltan las **barreras**: no hay `CLAUDE.md`, no hay reglas de lint que impidan violar capas, no hay red de tests que atrape una regresión de la IA, y **nada impide que un agente cree `playwright.config.ts` + `*.spec.ts` en paralelo** — `@playwright/test` ya está instalado como devDependency (`package.json:19`).

---

## 2. Current Architecture

### Stack real (versiones del `package.json`)

| Componente | Versión | Rol real |
|---|---|---|
| `@cucumber/cucumber` | 12.6.0 | **Runner** (único) |
| `playwright` | 1.58.0 | Librería: launchers `chromium/firefox/webkit` (`support/world.ts:2`) |
| `@playwright/test` | 1.58.0 | Solo `expect` + tipos `Page`/`Locator` (`BasePage.ts:2`) — **no** como runner |
| `typescript` | ^5.3.3 | `strict: true`, ESM `NodeNext` |
| `ts-node` | ^10.9.2 | Loader ESM para Cucumber (`cucumber.js:19`) |
| `oracledb` | ^6.10.0 | Único driver DB real (import dinámico) |
| `dotenv` | ^17.3.1 | Solo dentro de `src/config/index.ts` |
| `eslint` / `typescript-eslint` | ^10.9.1 / ^8.69.0 | Flat config |
| `prettier` | ^3.9.6 | 4 opciones, `printWidth: 100` |
| Node en CI | 24 | Sin `engines` ni `.nvmrc` en el repo |

### Flujo de ejecución verificado

```text
npm test  →  cucumber-js --config cucumber.js --tags "not @db"
   │
   ├─ cucumber.js: paths=features/**/*.feature
   │               import=[support/world.ts, support/hooks.ts, features/steps/**]
   │               loader=ts-node/esm
   │               format=[progress, json:…, html:…]
   │
   ├─ import de support/hooks.ts → setDefaultTimeout(config.defaultTimeoutMs)   (hooks.ts:7)
   │  (side effect: src/config/index.ts se evalúa y VALIDA en tiempo de import)
   │
   ├─ BeforeAll  → initDatabaseClient()          (hooks.ts:9)  — no-op si DB_ENABLED=false
   ├─ Before     → this.init()                   (hooks.ts:14) — launch browser + context + page + new Pages(page)
   │             → if (client) this.repositories = new RepositoryContainer(client)   (hooks.ts:18)
   ├─ Steps      → this.pages.example.* / this.repositories.example.*
   ├─ After      → this.close()                  (hooks.ts:23) — page → context → browser
   └─ AfterAll   → closeDatabaseClient()         (hooks.ts:31) — try/catch que loguea y NO relanza
```

### Árbol de código fuente (real, completo)

```text
features/
  example/example.feature            (2 escenarios, tags @ui @regression + @smoke)
  steps/example.steps.ts             (5 steps, 28 líneas)
support/
  world.ts                (50)  CustomWorld
  hooks.ts                (38)  Before/After/BeforeAll/AfterAll
  databaseLifecycle.ts    (37)  dueño único del DatabaseClient
  AGENTS-support.md
src/
  config/index.ts         (100) ÚNICO lector de process.env
  pages/base/BasePage.ts  (112) 20 wrappers finos sobre Playwright
  pages/example/ExamplePage.ts        (33)
  components/example/ExampleNavigationComponent.ts (23)
  pageContainer/Pages.ts  (10)  contenedor de Pages
  database/
    RepositoryContainer.ts          (15)
    clients/DatabaseClient.ts       (23)  contrato, solo tipos
    clients/OracleDatabaseClient.ts (143) pool lazy, thin/thick lock
    repositories/BaseRepository.ts  (37)  helpers protected
    repositories/example/ExampleRepository.ts (57) read-only
    builders/QueryBuilder.ts        (273) WHERE/ORDER BY/INSERT/UPDATE + allowlists
    types/db.types.ts               (29)
    AGENTS-database.md
.github/workflows/ci.yml
docs/refactor-progress/  ← 18 archivos, GITIGNORED / NO TRACKEADO
```

**Total: 16 archivos `.ts`, 1.008 líneas.** No existen: `src/api`, `src/data`, `src/fixtures`, `src/factories`, `src/utils`, `src/helpers`, `src/logger`, `src/types`, `tests/`, `e2e/`, `playwright.config.ts`, `CLAUDE.md`, `.mcp.json`, `.claude/`.

---

## 3. Current Capabilities

| Área | Existe | Estado | Evidencia |
|---|---|---|---|
| Runner Cucumber (perfil ESM único) | Sí | **IMPLEMENTADO** | `cucumber.js:10-21`; nota del fix de `default` anidado en `cucumber.js:1-9` |
| Gherkin + tags | Sí | **IMPLEMENTADO (mínimo)** | `features/example/example.feature:1,6`; 4 tags documentados en `README.md:216-222` |
| Step Definitions finos | Sí | **IMPLEMENTADO** | `features/steps/example.steps.ts` — 5 steps, 0 locators, 0 `expect`, 0 SQL |
| CustomWorld | Sí | **IMPLEMENTADO** | `support/world.ts:17-48`; solo infraestructura (`browser/context/page/pages/repositories?/testContext`) |
| Hooks | Sí | **IMPLEMENTADO** | `support/hooks.ts:9,13,22,26`; sin branching por tags |
| Page Object Model + BasePage | Sí | **IMPLEMENTADO (1 ejemplo)** | `src/pages/base/BasePage.ts` (20 métodos); `src/pages/example/ExamplePage.ts` |
| Components | Sí | **IMPLEMENTADO (1 ejemplo)** | `ExampleNavigationComponent.ts`, compuesto como propiedad en `ExamplePage.ts:12,20` |
| Pages container | Sí | **IMPLEMENTADO** | `src/pageContainer/Pages.ts:5-11` |
| Locators semánticos | Sí | **IMPLEMENTADO** | Solo `getByRole` en los 3 archivos UI; 0 XPath, 0 CSS frágil, 0 `nth()` |
| Config central + validación | Sí | **IMPLEMENTADO** | `src/config/index.ts:26` (único `process.env`), validadores `:29-71` |
| Config por ambiente / país | No | **PENDIENTE** | Un solo `BASE_URL` (`:87`); 0 matches de `country/pais` en código |
| `.env` + `.env.example` | Sí | **IMPLEMENTADO** | `.env.example` (10 vars, placeholders vacíos); `.gitignore:57-59` |
| Headless / browser / timeout configurables | Sí | **IMPLEMENTADO** | `src/config/index.ts:88-90`; consumidos en `world.ts:27-32` y `hooks.ts:7` |
| Retries | No | **PENDIENTE** | 0 matches de `retry` en `cucumber.js`/`package.json`/CI |
| Paralelismo / workers | No | **PENDIENTE** | 0 matches de `parallel` en `cucumber.js`; browser completo por escenario (`world.ts:32`) |
| `playwright.config.ts` | No | **N/A por diseño** | Playwright es librería, no runner — pero arrastra los gaps de trace/screenshot/retry |
| DatabaseClient (contrato agnóstico) | Sí | **IMPLEMENTADO** | `src/database/clients/DatabaseClient.ts` — solo `interface`/`type`, 0 imports de driver |
| OracleDatabaseClient | Sí | **IMPLEMENTADO** | `OracleDatabaseClient.ts:80-142`: pool lazy, `finally { connection.close() }`, thin/thick lock `:44-70` |
| BaseRepository | Sí | **IMPLEMENTADO** | `BaseRepository.ts:5-36`; helpers `protected` (no alcanzables desde steps) |
| RepositoryContainer | Sí | **IMPLEMENTADO** | `RepositoryContainer.ts:11-16`; `client` es `private readonly` |
| Repository concreto | Sí | **PARCIAL (demo, read-only)** | `ExampleRepository.ts:31-56` sobre `EXAMPLE_ITEMS`, tabla **no real** (`:7-10`) |
| QueryBuilder + binds + allowlists | Sí | **IMPLEMENTADO** | `QueryBuilder.ts:49-110` (assert identifier/operator), `:118-172` (WHERE), `:245-252` (rechaza UPDATE sin WHERE) |
| Lifecycle de pool DB | Sí | **IMPLEMENTADO** | `support/databaseLifecycle.ts:14-37`; dueño único, import dinámico |
| Feature/Step `@db` ejecutable | No | **PENDIENTE (decisión explícita)** | 0 matches de `@db` en `features/`; `npm run test:db` → 0 escenarios |
| Data prep / cleanup / transacciones DB | No | **PENDIENTE** | `ExampleRepository` es read-only; 0 `beginTransaction`/`rollback`/`truncate`/`seed` |
| Logging de queries + binds | No | **PENDIENTE** | 0 logging en toda la capa DB; único `console.*` del repo es `hooks.ts:36` |
| Manejo de errores DB | Sí | **IMPLEMENTADO** | `DatabaseError` con `cause` (`OracleDatabaseClient.ts:18-23`), `QueryBuilderError` (`QueryBuilder.ts:24-29`); mensajes sin valores de credenciales |
| API layer | No | **PENDIENTE** | `src/api` no existe; declarado en `README.md:453` |
| Autenticación / `storageState` | No | **PENDIENTE** | 0 matches en código; solo mencionado (erróneamente) en `support/AGENTS-support.md:27` |
| Test Data (factories/builders/fixtures) | No | **PENDIENTE** | No existen `src/data|fixtures|factories|testdata`; solo `testContext` libre (`world.ts:24`) |
| Aislamiento de datos / namespacing | No | **PENDIENTE** | Sin generador de datos únicos; `testContext` es por escenario pero no resuelve datos en DB |
| Reporting Cucumber JSON + HTML | Sí | **IMPLEMENTADO** | `cucumber.js:12-16`; `reports/cucumber/.gitkeep` trackeado, resto ignorado |
| Allure | No | **PENDIENTE** | 0 matches de `allure` en `package.json`/`cucumber.js`/CI/docs |
| Screenshots on failure | No | **PENDIENTE** | 0 matches en código; solo sugerido en `support/AGENTS-support.md:65` |
| Traces / videos | No | **PENDIENTE** | `world.ts:36` → `newContext()` sin opciones; 0 `tracing.start` |
| ESLint flat config | Sí | **IMPLEMENTADO** | `eslint.config.js`; `no-explicit-any: error` con 1 override justificado y de archivo único `:44-52` |
| Prettier | Sí | **IMPLEMENTADO** | `.prettierrc.json` (4 opciones); `.prettierignore` excluye `*.md` |
| TypeScript strict | Sí | **PARCIAL** | `tsconfig.json:9` `strict: true`, pero sin `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `noUnusedLocals` |
| Quality gate agregada | Sí | **IMPLEMENTADO (verificado)** | `npm run quality` → PASS (typecheck + lint + format:check) |
| Reglas de arquitectura automatizadas | No | **PENDIENTE** | 0 `no-restricted-imports`; nada impide que un step importe `playwright` u `oracledb` directamente |
| Tests unitarios del propio framework | No | **PENDIENTE** | Sin runner de unit tests; `QueryBuilder` (273 líneas, crítico en seguridad) sin cobertura |
| CI GitHub Actions | Sí | **IMPLEMENTADO (mínimo)** | `.github/workflows/ci.yml` — 1 job, Chromium, artifacts, `permissions: contents: read` |
| CI: matriz de browsers / job `@db` / schedule / split smoke-regression | No | **PENDIENTE** | Un solo job; sin `strategy.matrix`, sin `schedule`, sin `needs`, sin gates |
| Documentación de uso | Sí | **IMPLEMENTADO** | `README.md` (490 líneas, 26 secciones) + `AGENTS.md` + 2 `AGENTS-*.md` de módulo |
| Documentación "cómo crear X" | Sí | **PARCIAL** | Cubre Page/Component/Repository/UI test; **no** cubre API, test data, debugging de flaky, anti-patterns |
| `CLAUDE.md` / agentes / MCP | No | **PENDIENTE** | No existe `CLAUDE.md`, `.claude/`, `.mcp.json` |

---

## 4. Previous Improvements Verification

Antecedentes usados: `docs/refactor-progress/ARCHITECTURE-REVIEW.md` (review de la suite corporativa **original**), `FINAL-REFACTOR-PLAN.md` (plan T04–T20), `T20-final-audit.md` (auditoría final). **Nota importante:** `docs/framework-audit.md` y `docs/framework-improvement-plan.md` — mencionados en el pedido y citados por `ARCHITECTURE-REVIEW.md` — **no existen hoy en el repositorio**.

| # | Problema previamente identificado | Estado | Evidencia en el código actual |
|---|---|---|---|
| 1 | Credenciales / secretos hardcodeados | ✅ **RESUELTO** | 0 literales de secreto en `src/`/`support/`/`features/`; los únicos hits de `password` son claves de config y tipos (`src/config/index.ts:12,65,79`; `OracleDatabaseClient.ts:10,26,89`). No existe `.env`; CI sin secrets (`ci.yml:16-23`) |
| 2 | `waitForTimeout` / sleeps | ✅ **RESUELTO** | 0 matches de `waitForTimeout|sleep(|setTimeout(` en `src`, `support`, `features` |
| 3 | Timeouts hardcodeados | ✅ **RESUELTO** | 0 matches de `timeout: <número>`; único timeout viene de config (`hooks.ts:7` ← `config.defaultTimeoutMs`, default 120.000 en `config/index.ts:90`) |
| 4 | Configuración distribuida | ✅ **RESUELTO** | `src/config/index.ts:26` es el **único** lector de `process.env` en todo el repo (los otros 2 hits son prosa en `AGENTS-database.md:60,99`) |
| 5 | Screenshots | ❌ **PENDIENTE** | Nunca se implementó. 0 matches de `screenshot` en código; solo una sugerencia en `support/AGENTS-support.md:65` |
| 6 | Manejo de país en Oracle | ⚪ **YA NO APLICA** | Eliminado con el código corporativo: 0 matches de `country/Country/currentCountry/setCountry/pais`. **Pero no se reemplazó** por un mecanismo genérico de ambientes (ver #21) |
| 7 | Namespacing de datos | ❌ **PENDIENTE** | No hay capa de test data ni generador de identificadores únicos; `testContext` (`world.ts:24`) no resuelve esto |
| 8 | Headless configurable | ✅ **RESUELTO** | `config/index.ts:88` (`parseBoolean('HEADLESS', true)`) → `world.ts:27`; `HEADLESS` en `.env.example:6` y `ci.yml:19` |
| 9 | Convención de tags | 🟡 **PARCIAL** | Convención definida y documentada (`README.md:216-222`) y aplicada correctamente en la única feature (`example.feature:1,6`), pero **no automatizada**: nada valida que una feature nueva traiga tags, y `@db` no tiene consumidor real |
| 10 | Scripts npm | ✅ **RESUELTO** | 11 scripts limpios en `package.json:5-17`; todos delegan config a `cucumber.js` vía `--config`; 0 flags duplicados; sin `generate:reports`/`test:jenkins` |
| 11 | Centralización de `playwright.config.ts` | ⚪ **YA NO APLICA** | No existe ni debe existir con este diseño: Playwright es librería, no runner. La centralización real vive en `src/config/index.ts` + `cucumber.js`. **Efecto lateral real:** sin runner de Playwright no hay trace/screenshot/retry/workers nativos (ver #5, #22) |
| 12 | Logging de queries + binds | ❌ **PENDIENTE** | 0 logging en la capa DB. Todo el repo tiene **1** `console.*`: `hooks.ts:36`. Un fallo de query hoy no deja rastro de SQL ni de binds |
| 13 | Duplicación de código | ✅ **RESUELTO** | Con 1.008 líneas y 1 ejemplo por patrón no hay duplicación medible. Assertions centralizadas en `BasePage`; `new ExamplePage()` aparece solo en `Pages.ts:9` |
| 14 | Configuración ESLint / Prettier | ✅ **RESUELTO** | `eslint.config.js` flat (sin `.eslintrc*`), `eslint-config-prettier` al final `:53`; `no-explicit-any: error` con override de **un solo archivo** justificado `:44-52`; 0 `eslint-disable` en el código |
| 15 | Documentación AGENTS | 🟡 **PARCIAL** | Existen `AGENTS.md` + `AGENTS-database.md` + `AGENTS-support.md` y son de buena calidad. **Pero:** (a) `AGENTS-support.md:27` documenta `storageStatePath`, que **no existe** en `world.ts:10-12`; (b) `AGENTS.md:50,71` apunta a `docs/refactor-progress/`, que **no está trackeado** (`.gitignore:65`) |
| 16 | Duplicación relacionada con ChangeStatus | ⚪ **YA NO APLICA** | 0 matches de `changestatus` (case-insensitive) en todo el código activo; era código corporativo eliminado en T05/T06 |
| 17 | Responsabilidades excesivas en `CustomWorld` ("god object") | ✅ **RESUELTO** | `support/world.ts:17-24`: solo `browser`, `context`, `page`, `pages`, `repositories?`, `testContext`. 0 campos de negocio (los `currentLineStatus`/`usuarioCreado`/`selectedUserMail` que denunciaba `ARCHITECTURE-REVIEW.md` ya no existen). `testContext` es **instance field** (`= {}`), no static → sin fuga entre escenarios |
| 18 | Worlds paralelos (`EtiquetasWorld = CustomWorld & {...}`) | ✅ **RESUELTO** | 0 matches de `CustomWorld &` o casteos `this as`; `features/steps/Etiquetas.steps.ts` no existe |
| 19 | Autenticación | ❌ **PENDIENTE** | No hay ninguna estrategia de auth: 0 matches de auth/login en código; `support/auth.ts` no existe; el ejemplo usa un sitio público sin login |
| 20 | `storageState` | 🟡 **PARCIAL** (código limpio, doc sucia) | Eliminado del código (T20/FA-005): `world.ts:36` es `newContext()` sin argumentos. **Pero `support/AGENTS-support.md:27` sigue documentándolo como existente** → contradicción doc↔código vigente |
| 21 | Configuración / referencias muertas | ❌ **PENDIENTE (regresión nueva)** | `.gitignore:65` ignora `docs/refactor-progress/` (no trackeado, confirmado con `git ls-files`), pero **15 archivos trackeados lo referencian**: `AGENTS.md:50,71`, `README.md:133,405`, `cucumber.js:6`, `eslint.config.js:22,25,36`, `.env.example:2`, `ci.yml:18,22`, `.prettierignore:13-19`, `AGENTS-database.md:42,85`, `AGENTS-support.md:53,59`, `QueryBuilder.ts:181,249`, `ExampleRepository.ts:9,27`, `db.types.ts:27`, `OracleDatabaseClient.ts:115`, `hooks.ts:29`. La nota IN-03 del T20 ("ships with the repo") es hoy incorrecta |
| 22 | Regresiones introducidas por mejoras anteriores | 🟡 **PARCIAL** | (a) La #21 es una regresión real de trazabilidad. (b) **Nuevo código muerto del mismo tipo que FA-005:** `InitOptions.headless` (`world.ts:10-12`) tiene **cero callers** — `hooks.ts:14` llama `this.init()` sin argumentos; es exactamente el patrón de opción sin consumidor que T20 eliminó. (c) `support/databaseLifecycle.ts:20-22` usa tres casts `as string` para saltear los tipos opcionales de `config.db` — seguro en la práctica (la validación tira al importar), pero es un escape de tipos copiable |
| 23 | Artefactos generados commiteados | ✅ **RESUELTO** | Único archivo bajo `reports/` es `reports/cucumber/.gitkeep`; `.gitignore:24-27` cubre el resto; 0 `.png/.zip/.webm/.log` en el repo |
| 24 | Residuo corporativo | ✅ **RESUELTO** | 0 matches de `Claro|CML|CMLACT|CMLDES` en archivos activos; `package.json:2` = `qa-automation-archetype`; `.vscode/settings.json` solo con settings de Cucumber |
| 25 | CI no verificado en runners de GitHub (limitación declarada por T20) | 🟡 **PARCIAL — cambió** | T20 decía "el workspace no tiene `.git`/remote". Hoy **sí hay remote**: `origin → https://github.com/Leafarc10/qa-automation-archetype.git`, branch `main` en `[origin/main]`, commit `6245e63`. El workflow dispara en `push` (`ci.yml:3`), así que muy probablemente ya corrió — **no verificable localmente** (no hay `gh` CLI instalado) |

**Score:** ✅ 12 · 🟡 6 · ❌ 5 · ⚪ 3.

---

## 5. UI Automation

### Lo que está bien (verificado)

- **Separación de capas real.** `features/steps/example.steps.ts` son 5 funciones de una línea que delegan en `this.pages.example.*`. **0 locators**, **0 `expect()`**, **0 imports de Playwright** en steps.
- **`BasePage` es fino y sin lógica de negocio** — 112 líneas, 20 métodos, agrupados en Navegación / Esperas / Acciones / Obtener Valores / Validaciones. Todos son wrappers de una o dos líneas.
- **Esperas correctas por diseño.** `waitForVisible` usa `expect(locator).toBeVisible()` (`BasePage.ts:29-31`), es decir web-first assertions con auto-retry, no polling manual. Las acciones (`click`, `fill`, `check`) esperan visibilidad antes de actuar (`BasePage.ts:47-49`).
- **Component real y con scope propio.** `ExampleNavigationComponent` acota sus búsquedas dentro del `<nav>` (`this.nav.getByRole('link', …)`, `:21`), así que un link "Docs" en otra parte de la página no satisface la assertion. Se **compone** como propiedad (`ExamplePage.ts:12,20`), no se hereda.
- **Locators 100% semánticos.** Solo `getByRole` con `name`/`level`/`exact`. 0 XPath, 0 clases CSS, 0 `nth()`.
- **Navegación centralizada en config.** `ExamplePage.open()` usa `requireBaseUrl()` (`ExamplePage.ts:26-28`), que falla con mensaje claro si falta `BASE_URL` (`config/index.ts:94-99`). 0 URLs hardcodeadas en Pages.

### Problemas reales de la capa UI

1. **No existe `BaseComponent`.** `ExampleNavigationComponent extends BasePage` (`:12`), así que **un Component hereda `goto()`, `reload()`, `waitForUrlContains()`** — métodos de página completa que un componente no debería poder ejecutar. Con un solo componente es inocuo; con 30 componentes es una invitación a que un Component navegue.
2. **Inconsistencia en la declaración de locators.** `ExamplePage` declara `heading` en el constructor (`:16,21`) pero construye el locator del link *dentro* del método (`:35`, `this.page.getByRole('link', …)`). Dos convenciones distintas en un archivo de 33 líneas: la IA copiará la que le toque.
3. **`BasePage.getText()` devuelve `Promise<string | null>`** (`:88-91`) y varios métodos no declaran tipo de retorno explícito. Menor, pero contagioso.
4. **`page` es `protected` en `BasePage`** (`:5`), lo que permite que cualquier Page/Component construya locators ad-hoc en línea, esquivando la convención de declararlos.
5. **El único ejemplo depende de un sitio externo** (`https://playwright.dev`, `.env.example:3`, `ci.yml:18`). Si ese sitio cambia su `<h1>` o su nav, el CI se pone rojo por una causa ajena al framework. Declarado en `README.md:456`.
6. **Un browser completo por escenario** (`world.ts:32`, `browserType.launch()` dentro de `init()`, llamado en cada `Before`). Aislamiento máximo, costo máximo: no hay reutilización de browser con contextos frescos por escenario.

---

## 6. Cucumber / Gherkin

| Aspecto | Estado real |
|---|---|
| Perfil | **Uno solo** (`default`), plano, ESM — `cucumber.js:10-21`. El comentario `:1-9` documenta un bug real ya resuelto (el `default:{}` anidado rompía `paths`/`import`/`loader` silenciosamente) |
| Features | **1** (`features/example/example.feature`), 2 escenarios, 6 steps |
| Step definitions | **1 archivo**, 5 steps, todos `Given`/`Then` (**no hay ningún `When`**) |
| Tags | `@ui @regression` a nivel Feature, `@smoke` en 1 escenario. `@db` **reservado sin usar** (0 matches en `features/`) |
| Hooks | `BeforeAll`/`Before`/`After`/`AfterAll` en `support/hooks.ts`. **0 branching por tags** — verificado; los tags solo filtran qué corre |
| `BeforeStep`/`AfterStep` | No existen |
| World | `CustomWorld extends World`, registrado con `setWorldConstructor` (`world.ts:50`) |
| Sharing de estado | `testContext: Record<string, unknown>` (`world.ts:24`), instancia nueva por escenario, **sin tipar y sin usar en ningún step hoy** |
| Separación negocio / automatización | **Buena en forma, vacía en contenido.** El Gherkin está bien escrito (`As a / I want / So that`) pero describe el propio framework, no un dominio: "I open the example application". No hay lenguaje de negocio porque no hay negocio |
| Data tables / Scenario Outline / Doc strings | **No se usan en ningún lado** — 0 ejemplos de `Examples:`, tablas `|` o `"""` |
| Paralelismo | **No configurado** (0 matches de `parallel`) |
| Retries | **No configurados** (0 matches de `retry`) |
| Timeout por step | Global, desde config (`hooks.ts:7`) |
| Idioma Gherkin | Inglés, sin `# language:` |

**Riesgo estructural:** no existe **ningún patrón de referencia** para `Scenario Outline`, data tables, ni pasos `When` (acción). Un generador de tests por IA no tiene de dónde copiar esos patrones y los inventará.

---

## 7. API Automation

**NO EXISTE. Cero.** Verificado por búsqueda de directorios y de contenido:

- No existen `src/api`, `src/clients`, `src/requests`, `src/schemas`.
- 0 uso de `request`/`APIRequestContext` de Playwright, 0 `fetch`, 0 axios/supertest en `package.json`.
- No hay clientes reutilizables, ni autenticación, ni builders de request, ni validación de schema (no hay zod/ajv/joi), ni assertions de response.
- No hay integración API+UI+DB: `CustomWorld` solo expone `pages` y `repositories?` (`world.ts:18-24`).

Está correctamente declarado como no implementado en `README.md:453` y como extensión futura en `README.md:462`. El plan de refactor lo puso explícitamente fuera de alcance (`FINAL-REFACTOR-PLAN.md`, sección "No agregar todavía": *"API layer antes de finalizar el core"*).

**Impacto:** hoy no se puede preparar estado vía API (lo más rápido y estable para setup de datos), ni validar contratos, ni hacer un test híbrido. Para un framework SDET "potente" esta es la ausencia más grande junto con Test Data.

---

## 8. Database Framework

**Esta es la capa más madura del repositorio.** ¿Tenemos "un verdadero framework común de BBDD para que todos los QA trabajen bajo el mismo patrón"? **Sí en cuanto a patrón y barreras; no todavía en cuanto a operación real.**

### Lo que hay, con evidencia

| Pieza | Archivo | Estado |
|---|---|---|
| Contrato agnóstico | `clients/DatabaseClient.ts` (23 líneas) | Solo `interface DatabaseClient { execute, close }` + `ExecuteOptions`. **0 imports de driver**; el comentario `:12-13` prohíbe explícitamente re-exportar tipos de `oracledb`. Compila a nada |
| Implementación Oracle | `clients/OracleDatabaseClient.ts` (143) | Config inmutable por constructor con `assertConfig` `:28-34`; **pool lazy** en `getPool()` `:84-107`; `execute()` siempre devuelve la conexión en `finally` `:135`; `outFormat` **por llamada**, no como estado global del driver `:114`; `close()` idempotente `:138-149` |
| Lock Thin/Thick | `OracleDatabaseClient.ts:44-70` | Modo por proceso; un segundo client que pida el modo contrario **falla con error explícito** en vez de cambiar silenciosamente. `initOracleClient` solo alcanzable desde `getPool()`, nunca como side effect de import |
| Errores | `OracleDatabaseClient.ts:18-23` | `DatabaseError extends Error` con `cause`; mensajes con **nombres** de campos, nunca valores (`:31`) |
| BaseRepository | `repositories/BaseRepository.ts` (37) | `abstract`; `constructor(protected readonly client: DatabaseClient)`; helpers **`protected`**: `select` (con `autoCommit:false`), `insert`, `update`, `delete`, `executeProcedure`. No conoce Oracle ni `process.env` |
| RepositoryContainer | `RepositoryContainer.ts` (15) | Recibe el client ya construido; `client` es **`private readonly`** → un step no puede hacer `this.repositories.client.execute(...)` (falla en compilación, TS2341) |
| Repository concreto | `repositories/example/ExampleRepository.ts` (57) | Extiende `BaseRepository`; expone **solo** métodos de dominio (`findById`, `findByStatus`); allowlist propia `EXAMPLE_FIELDS` `:23`; nombre de tabla como **constante de código** `:17`, nunca parámetro |
| QueryBuilder | `builders/QueryBuilder.ts` (273) | `buildWhere`, `buildOrderBy`, `buildOraclePagination`, `buildInsert`, `buildUpdate` |
| Tipos | `types/db.types.ts` (29) | `QueryResult<T>`, `BindParams`, `WhereClause`, `SqlOperator` (unión cerrada), `FilterCondition`, `IdentifierList` |
| Lifecycle | `support/databaseLifecycle.ts` (37) | **Dueño único**: `initDatabaseClient` (import dinámico de Oracle, solo si `DB_ENABLED=true`), `getDatabaseClient`, `closeDatabaseClient`. Un client compartido por proceso, no un pool por escenario |

### Modelo de seguridad del QueryBuilder (real, no documental)

- **Valores → siempre binds.** `buildWhere` genera `:FIELD_0` y mete el valor en `binds` (`:169-171`); `IN` genera un bind por valor (`:132-139`); `BETWEEN` exige exactamente dos (`:142-155`).
- **Identificadores → doble barrera.** `assertAllowedIdentifier` (`:49-64`) exige (a) forma de identificador SQL simple `/^[A-Za-z_][A-Za-z0-9_]*$/` y (b) pertenencia a un `IdentifierList` que **provee el repositorio llamante**. Nunca sanitiza: siempre `throw`.
- **Operadores validados en runtime**, no solo por tipos (`:66-72`, `ALLOWED_OPERATORS`) — un caller que ignore TypeScript no puede inyectar un operador arbitrario. Ídem `AND/OR` (`:74-82`).
- **`buildUpdate` rechaza UPDATE sin WHERE** (`:245-252`) — no se puede tocar toda la tabla por accidente.
- **`buildOraclePagination`** está honestamente nombrado como Oracle-specific (`ROWNUM`), no como paginación genérica (`:178-190`).

### Gaps reales de la capa DB

1. **0 tests automatizados.** `QueryBuilder` es la pieza de mayor riesgo (construcción de SQL) y no tiene ni un test en el repo. Las validaciones existieron como scripts temporales, hoy borrados.
2. **0 logging.** No hay forma de ver qué SQL se ejecutó con qué binds. Depurar un fallo de query en CI hoy es imposible.
3. **No hay preparación ni cleanup de datos.** `ExampleRepository` es read-only por diseño (`:26-28`). No hay seeding, no hay teardown de datos, no hay transacciones/rollback (`select` usa `autoCommit:false` pero nunca se abre ni se revierte una transacción explícita).
4. **`buildInsert`/`buildUpdate` no tienen ningún consumidor.** Existen y están validados por tipos, pero ningún repositorio los usa → patrón sin ejemplo de referencia.
5. **Nunca se ejecutó contra una base real** dentro de este repo. `EXAMPLE_ITEMS` es un contrato de demostración (`:7-10`), `npm run test:db` corre 0 escenarios, y no hay feature `@db`.
6. **`as string` x3** en `support/databaseLifecycle.ts:20-22` para saltear los tipos opcionales de `config.db`.
7. **Sin manejo de reintentos ni timeouts de query** a nivel client (`execute` no acepta timeout).
8. **`close()` limpia la referencia al pool antes de esperar el cierre** (`:143-148`): si el cierre falla, no se puede reintentar sobre ese pool. Tradeoff aceptado y documentado en su momento (IN-04 de T20).

---

## 9. Test Data Management

**NO EXISTE como capa.** Es, junto con API, el gap más grande.

| Capacidad | Estado | Evidencia |
|---|---|---|
| Factories / builders de datos | ❌ No existe | No hay `src/factories`, `src/data`, `src/testdata`, `src/fixtures` (verificado por `find`) |
| Fixtures | ❌ No existe | No hay archivos JSON/YAML de datos; `resolveJsonModule: true` en `tsconfig.json:6` está habilitado pero sin uso |
| Constantes de dominio | 🟡 Mínimo | Solo constantes de infraestructura: `EXAMPLE_TABLE`/`EXAMPLE_FIELDS` (`ExampleRepository.ts:17,23`), `browserNames` (`config/index.ts:3`) |
| Datos dinámicos / únicos | ❌ No existe | 0 generadores; no hay faker, no hay timestamps/uuid para unicidad |
| Datos hardcodeados en tests | 🟡 Sí, pero en Gherkin | `"Playwright"`, `"Get started"`, `"Docs"` viajan como parámetros del step desde el `.feature` (`example.feature:9-11`) — que es el lugar correcto. No hay datos hardcodeados escondidos en Pages o Steps |
| Aislamiento entre escenarios | 🟡 Parcial | `testContext` es instance field (`world.ts:24`) → no hay fuga de estado **en memoria**. Pero no hay aislamiento de datos **en la base** ni en la app |
| Namespacing | ❌ No existe | Sin prefijos/sufijos por run/worker; sin estrategia para correr en paralelo sin colisión |
| Datos por ambiente | ❌ No existe | Un solo `BASE_URL`; sin `data/qa.json` vs `data/uat.json` |
| Datos por país | ⚪ Ya no aplica / ❌ no reemplazado | La dimensión país fue eliminada con el código corporativo y no existe mecanismo genérico equivalente |
| Cleanup / teardown de datos | ❌ No existe | `After` solo cierra el browser (`hooks.ts:22-24`); nunca toca la base |

**Consecuencia práctica:** hoy no se puede activar paralelismo con seguridad, porque sin namespacing ni cleanup dos workers colisionarían sobre los mismos datos. Test Data es el **prerequisito de paralelismo**, y el propio plan original ya lo había marcado así (`FINAL-REFACTOR-PLAN.md`: *"Paralelismo antes de resolver DB y test data"* está en la lista de "No agregar todavía").

---

## 10. Configuration / Environments / Secrets

### Configuración

`src/config/index.ts` (100 líneas) es un buen módulo de config y el **único** lector de `process.env` del repo (`:26`).

- **Tipada:** `AppConfig` con `baseUrl?`, `headless`, `browser`, `defaultTimeoutMs`, `db` (`:17-23`).
- **Validación estricta y fail-fast:** `parseBoolean` acepta **solo** `'true'`/`'false'` y tira si no (`:34-42`); `parseBrowser` valida contra `['chromium','firefox','webkit']` (`:56-63`); `parsePositiveInteger` exige entero positivo (`:44-54`); `validateDatabaseConfig` exige `DB_USER`/`DB_PASSWORD`/`DB_CONNECT_STRING` **solo** si `DB_ENABLED=true` y reporta **nombres**, nunca valores (`:65-79`).
- **`requireBaseUrl()`** (`:94-99`) evita navegar a `undefined` con un error explícito.
- **La validación corre en tiempo de import** (top-level, `:81-92`), así que una config inválida rompe antes de arrancar el primer escenario. Correcto, pero implica que **no se puede tener config por escenario ni por tag**.

### Environments — el gap real

**No hay concepto de ambiente.** La config es plana y unidimensional: un `BASE_URL`, un set de credenciales DB. No existe:

- matriz `dev/qa/uat/prod` (ni `ENV=qa` que seleccione un bloque de config);
- archivos `.env.qa` / `.env.uat` (`.gitignore:58` ignora `.env.*` pero nadie los lee — `dotenv.config()` en `:3` carga solo `.env`);
- dimensión país (eliminada, no reemplazada);
- URLs por servicio (solo una URL de app; ninguna de API porque no hay capa API).

Solo hay 10 variables: `BASE_URL`, `HEADLESS`, `BROWSER`, `DEFAULT_TIMEOUT_MS`, `DB_ENABLED`, `DB_USER`, `DB_PASSWORD`, `DB_CONNECT_STRING`, `ORACLE_CLIENT_LIB_DIR`.

### Secrets — limpio ✅

- No existe `.env` en el repo; `.env.example` tiene los 4 campos sensibles **vacíos** (`.env.example:10-13`).
- `.gitignore:57-59`: ignora `.env` y `.env.*`, con whitelist explícita de `.env.example`.
- CI **sin ningún secret**: `ci.yml:16-23` define solo valores públicos (`BASE_URL=https://playwright.dev`, `HEADLESS`, `BROWSER`, `DB_ENABLED=false`). No hay job DB, por lo tanto no hay credenciales en el pipeline.
- 0 credenciales hardcodeadas en `src/`/`support/`/`features/`.
- **No hay gestor de secretos** (Vault, GitHub Secrets en uso, Azure KV) porque todavía no se necesita — el día que exista un job `@db`, hará falta.

---

## 11. Reporting & Observability

| Capacidad | Estado | Evidencia |
|---|---|---|
| Cucumber `progress` (consola) | ✅ Sí | `cucumber.js:13` |
| Cucumber JSON | ✅ Sí | `cucumber.js:14` → `reports/cucumber/cucumber-report.json` |
| Cucumber HTML | ✅ Sí | `cucumber.js:15` → `reports/cucumber/cucumber-report.html` |
| Reporter custom / Jenkins | ⚪ Eliminado a propósito | 0 matches de `JenkinsReport`/`DetailedReport`/`support/report.js`; `README.md:367` lo declara |
| **Allure** | ❌ **No existe** | 0 matches de `allure` en `package.json`, `cucumber.js`, CI y docs. **Nunca se instaló ni se planificó** |
| **Screenshots on failure** | ❌ **No existe** | 0 matches de `screenshot` en código |
| **Traces** | ❌ **No existe** | `world.ts:36` → `newContext()` sin opciones; 0 `context.tracing.start()` |
| **Videos** | ❌ **No existe** | 0 matches de `recordVideo` |
| **Logs estructurados** | ❌ **No existe** | Todo el logging del repo = 1 línea: `console.error` en `hooks.ts:36` |
| Attachments en Cucumber | ❌ No se usan | 0 `this.attach(...)` |
| JUnit XML | ❌ No configurado | Solo sugerido en `AGENTS-support.md:69` |
| Artifacts en CI | ✅ Sí | `ci.yml:44-53`, `if: always()` + `if-no-files-found: ignore` |
| Diagnóstico de fallos | ❌ **Prácticamente nulo** | Un fallo produce el stack de Playwright en el JSON/HTML de Cucumber. Sin screenshot, sin trace, sin DOM, sin SQL/binds |

**Este es el gap más urgente en términos operativos.** Hoy, si un escenario falla en CI, un QA tiene solo un mensaje de texto. Y es también el gap que **bloquea cualquier agente "healer"**: un agente de IA no puede reparar un test si no tiene trace, screenshot ni DOM del momento del fallo.

---

## 12. Code Quality

| Dimensión | Estado |
|---|---|
| **ESLint** | ✅ Flat config (`eslint.config.js`), sin `.eslintrc*`. `js.configs.recommended` + `tseslint.configs.recommended`, `eslintConfigPrettier` al final `:53`. Ignores razonables `:8-18` |
| **`no-explicit-any`** | ✅ `error` `:34`, con **un** override de archivo único y justificado (`OracleDatabaseClient.ts`, `:44-52`) para aislar el driver sin tipos. 0 `eslint-disable` en todo el código |
| **`no-unused-vars`** | ✅ `error` con `argsIgnorePattern: '^_'` `:35` |
| **Lint type-aware** | 🟡 **Deliberadamente desactivado** (`:20-31`): `recommendedTypeChecked` disparaba ~24 `no-unsafe-*` en el archivo del driver. Decisión razonable **pero** deja fuera reglas valiosas como `no-floating-promises` — clave en un framework 100% `async` |
| **Prettier** | ✅ `.prettierrc.json` (4 opciones), `format:check` verificado en PASS. `.prettierignore:22` excluye **todos los `*.md`** → la documentación nunca se formatea |
| **TypeScript strictness** | 🟡 `strict: true` (`tsconfig.json:9`) pero **faltan**: `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `forceConsistentCasingInFileNames` |
| **Quality gate** | ✅ `npm run quality` = typecheck + lint + format:check. **Verificado en esta sesión: PASS** |
| **Reglas de arquitectura** | ❌ **Ninguna.** 0 `no-restricted-imports`. Nada impide que un Step importe `playwright` u `oracledb`, ni que una Page importe un Repository, ni que alguien cree `*.spec.ts` |
| **Duplicación** | ✅ No medible a 1.008 líneas; assertions centralizadas en `BasePage`; `new ExamplePage()` solo en `Pages.ts:9` |
| **Waits / timeouts** | ✅ 0 `waitForTimeout`, 0 sleeps, 0 timeouts hardcodeados |
| **Selectors** | ✅ Solo `getByRole`; 0 XPath, 0 CSS frágil |
| **Manejo de errores** | 🟡 Bien en DB (`DatabaseError`/`QueryBuilderError` con `cause`); **ausente en UI** (BasePage no envuelve errores, no agrega contexto de página/locator) |
| **Logging** | ❌ 1 sola línea en todo el repo (`hooks.ts:36`) |
| **Tests del framework** | ❌ **No existen.** Sin runner de unit tests. `QueryBuilder` (273 líneas, crítico en seguridad) sin cobertura. Los 2 escenarios de Cucumber son el único "test" y validan un sitio externo |
| **Code review / hooks de git** | ❌ Sin Husky, sin `lint-staged`, sin `CODEOWNERS`, sin plantilla de PR |
| **Convenciones** | 🟡 Consistentes en el código, pero **no escritas ni verificables**: no hay documento de naming, y hay mezcla de idiomas (comentarios en español en `BasePage.ts:15,25,40,79,93` y `QueryBuilder.ts:114,176,192,224`; el resto en inglés) |
| **Node version pinning** | ❌ CI fija Node 24 (`ci.yml:31`) pero el repo no tiene `engines` ni `.nvmrc` |

---

## 13. CI/CD

**Existe UN workflow real:** `.github/workflows/ci.yml` (55 líneas, 1 job).

### Lo que hay (verificado línea por línea)

| Elemento | Valor real |
|---|---|
| Triggers | `push`, `pull_request`, `workflow_dispatch` (`:3-6`) — sin filtro de branch |
| **Ejecución programada** | ❌ **No hay `schedule`** |
| **Ejecución manual** | ✅ `workflow_dispatch` `:6` |
| Permisos | ✅ `contents: read` (menor privilegio) `:8-9` |
| Runner / timeout | `ubuntu-latest`, `timeout-minutes: 15` `:13-14` |
| Env | `BASE_URL`, `HEADLESS=true`, `BROWSER=chromium`, `DB_ENABLED=false` `:16-23` — **0 secrets** |
| Pasos | `checkout@v7` → `setup-node@v7` (Node 24, cache npm) → `npm ci` → `playwright install --with-deps chromium` → `npm run quality` → `npm test` `:25-43` |
| **Quality gate** | 🟡 Sí en el sentido de que `npm run quality` corre **antes** de los tests y su exit code frena el job. **0 `continue-on-error`**. Pero no hay gates de umbral (cobertura, flaky rate, duración) |
| Artifacts | ✅ `upload-artifact@v7` con JSON + HTML, `if: always()`, `if-no-files-found: ignore` `:45-53` |
| **Smoke** | ❌ No hay job/step de smoke — el CI corre `npm test` (todo lo que no sea `@db`) |
| **Regression** | ❌ No hay job de regression separado |
| **Tags** | 🟡 Solo implícito: `npm test` = `--tags "not @db"` |
| **Ambientes** | ❌ Un solo set de env inline; sin `environment:`, sin matriz dev/qa/uat |
| **Matriz de browsers** | ❌ Chromium únicamente (`:38`); Firefox/WebKit soportados por el código pero nunca en pipeline (`README.md:405`) |
| **Job `@db`** | ❌ No existe |
| **Reporting publicado** | 🟡 Solo artifact descargable; sin GitHub Pages, sin comentario en PR, sin check de test summary |
| Docker / deploy / dispatch cross-repo | ❌ No existen |

### Estado de ejecución real

`docs/refactor-progress/T20-final-audit.md` declaraba: *"GitHub-hosted execution NOT YET VERIFIED — the repository has no remote yet"*. **Eso cambió:** hoy existe `origin → https://github.com/Leafarc10/qa-automation-archetype.git`, con `main` trackeando `origin/main` en el commit `6245e63`. Como el workflow dispara en `push`, con altísima probabilidad ya corrió. **No pude verificar el resultado** — `gh` CLI no está instalado en este entorno. Queda como el único punto del inventario que requiere confirmación externa.

---

## 14. Documentation & Developer Experience

### Lo que hay — y es genuinamente bueno

- **`README.md`** (490 líneas, 26 secciones): overview, stack, arquitectura con diagrama, estructura, getting started, config de entorno, cómo correr tests, tabla de tags, UI testing (incluido *"cómo agregar un test nuevo"*, *"Page Objects"*, *"Components"*), Database testing (incluido *"cómo crear un Repository"*), reporting, code quality, CI, workflow recomendado, best practices, seguridad, **limitaciones actuales** (honestas), extensiones futuras y troubleshooting.
- **`AGENTS.md`** (orquestador): diagrama de arquitectura real, flujo end-to-end, y una instrucción de proceso excelente para asistentes de IA (*"1. leer este archivo → 2. abrir el `AGENTS-*.md` del módulo → 3. solo entonces abrir el código"*).
- **`AGENTS-database.md`** y **`AGENTS-support.md`**: profundos, precisos, con guía explícita de extensión.
- **`.vscode/settings.json`**: soporte de Cucumber en el IDE (autocompletado de steps, sync de features) — DX real.
- Todos los 11 comandos documentados existen; el gate `npm run quality` funciona.

### Problemas reales de documentación

1. **Referencias muertas (el hallazgo más concreto del inventario).** `docs/refactor-progress/` está en `.gitignore:65` y **no está trackeado**, pero **15 archivos trackeados lo referencian**, incluidos `AGENTS.md:50,71`, `README.md:133` (lo lista en el árbol del proyecto como si viajara con el repo), `README.md:405`, `cucumber.js:6`, `eslint.config.js:22`, `.env.example:2`, `ci.yml:18,22`. Además ~14 referencias a IDs internos (`T09`, `T11`, `T12`, `T14`, `T16`, `T17`) esparcidas en comentarios de código fuente que no resuelven a nada en un clon.
2. **Contradicción doc↔código:** `AGENTS-support.md:27` documenta `init(options?: { storageStatePath?: string; headless?: boolean })` con soporte de `storageState`. El código tiene solo `headless?` (`world.ts:10-12`).
3. **Documentación faltante para lo que no existe** (coherente, pero es un vacío para quien va a extender): **no hay** guía de API testing, **no hay** guía de test data management, **no hay** catálogo de anti-patterns, **no hay** guía de debugging de flaky tests, **no hay** documento de convenciones de naming.
4. **`AGENTS.md:47-52` decide explícitamente no tener un `AGENTS-*.md` para `features/`, `src/pages/`, `src/components/`** — razonable con 1 ejemplo, pero es precisamente la capa que una IA va a tocar más.
5. **Idiomas mezclados:** README/AGENTS/AGENTS-support en inglés; AGENTS-database y `docs/refactor-progress/**` en español; comentarios de código mezclados (`BasePage.ts:15` *"Navegación"*, `QueryBuilder.ts:114` *"WHERE DINÁMICO"*).
6. **`.prettierignore:22` excluye `*.md`** → la documentación nunca pasa por el formateador ni por el gate.

---

## 15. Architecture Problems / Technical Debt

Solo problemas **reales, verificados hoy**. Ordenados por severidad.

### ALTO

| # | Problema | Evidencia | Por qué importa |
|---|---|---|---|
| A1 | **`QueryBuilder` sin tests** — 273 líneas de construcción de SQL con modelo de seguridad por allowlist, y cero cobertura automatizada en el repo | No hay runner de unit tests en `package.json`; 0 archivos `*.test.ts`/`*.spec.ts` | Cualquier cambio (humano o de IA) puede romper una barrera anti-inyección sin que nada lo detecte. `npm run quality` es solo estático |
| A2 | **Sin evidencia de fallos** — 0 screenshots, 0 traces, 0 videos, 0 logs | `world.ts:36` `newContext()` sin opciones; único `console.*` en `hooks.ts:36` | Un fallo en CI no es diagnosticable. Bloquea el trabajo diario del QA **y** cualquier agente "healer" |
| A3 | **Sin capa de Test Data** — sin factories, sin datos únicos, sin namespacing, sin cleanup | No existen `src/data|fixtures|factories`; `After` solo cierra el browser (`hooks.ts:22-24`) | Es el prerequisito de paralelismo y de tests `@db` reales. Sin esto, escalar features genera flakiness por colisión de datos |
| A4 | **Sin reglas de arquitectura automatizadas** — 0 `no-restricted-imports`; nada impide violar capas ni crear un runner paralelo | `eslint.config.js:32-37` solo tiene 2 reglas custom; `@playwright/test` está instalado (`package.json:19`) y `playwright.config.ts` no está prohibido | **Este es el riesgo #1 para la integración de IA**: un agente puede crear `playwright.config.ts` + `*.spec.ts` y montar una arquitectura paralela sin que ningún gate lo frene |

### MEDIO

| # | Problema | Evidencia |
|---|---|---|
| A5 | **Referencias muertas a `docs/refactor-progress/`** (gitignored, no trackeado) desde 15 archivos trackeados | `.gitignore:65` vs `AGENTS.md:50,71`, `README.md:133,405`, `cucumber.js:6`, `eslint.config.js:22`, `.env.example:2`, `ci.yml:18,22` |
| A6 | **Doc contradice código:** `storageState` documentado como existente | `AGENTS-support.md:27` vs `world.ts:10-12` |
| A7 | **Ejecución serial + un browser completo por escenario** | 0 `parallel` en `cucumber.js`; `browserType.launch()` dentro de `init()` (`world.ts:32`), llamado en cada `Before` |
| A8 | **Sin retries controlados ni estrategia de flaky** | 0 matches de `retry` en config/scripts/CI |
| A9 | **Config plana: sin ambientes ni matriz** | Un solo `BASE_URL` (`config/index.ts:87`); `dotenv.config()` solo lee `.env` (`:3`) |
| A10 | **Sin capa API** → no se puede preparar estado por el camino rápido ni validar contratos | `src/api` no existe |
| A11 | **Sin `BaseComponent`:** los Components heredan navegación de página | `ExampleNavigationComponent.ts:12` `extends BasePage` (hereda `goto`/`reload`/`waitForUrlContains`) |
| A12 | **Sin lint type-aware** → sin `no-floating-promises` en un framework 100% async | `eslint.config.js:20-31` (decisión documentada) |
| A13 | **`tsconfig` strict incompleto** | falta `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `noUnusedLocals` |
| A14 | **El único test depende de un sitio externo** (`playwright.dev`) | `.env.example:3`, `ci.yml:18` |

### BAJO

| # | Problema | Evidencia |
|---|---|---|
| A15 | **Código muerto nuevo:** `InitOptions.headless` tiene 0 callers (mismo patrón que el `storageStatePath` que T20 eliminó) | `world.ts:10-12` vs `hooks.ts:14` (`this.init()` sin argumentos) |
| A16 | 3 casts `as string` para saltear tipos opcionales de config | `support/databaseLifecycle.ts:20-22` |
| A17 | `buildInsert`/`buildUpdate` sin ningún consumidor → patrón sin ejemplo de referencia | `QueryBuilder.ts:196-271` |
| A18 | Inconsistencia en declaración de locators (constructor vs inline) | `ExamplePage.ts:16,21` vs `:35` |
| A19 | Sin `engines`/`.nvmrc` aunque CI fija Node 24 | `package.json` vs `ci.yml:31` |
| A20 | Sin `When` steps, sin `Scenario Outline`, sin data tables en ningún ejemplo | `features/` completo |
| A21 | Idiomas mezclados en comentarios y docs | `BasePage.ts:15`, `QueryBuilder.ts:114` (español) vs resto en inglés |
| A22 | `.prettierignore:22` excluye `*.md` → docs fuera del gate de formato | `.prettierignore` |
| A23 | `dotenv` no valida la ausencia de `.env` ni soporta `.env.local`/`.env.<env>` | `config/index.ts:3` |

**No son problemas** (verificado, para evitar falsos positivos): la coexistencia de `playwright` + `@playwright/test` (ambos con consumidores reales); la ausencia de `playwright.config.ts` (coherente con usar Playwright como librería); que `test:db` corra 0 escenarios (decisión explícita y documentada); la privacidad solo en compile-time de `RepositoryContainer.client` (adecuada porque todos los steps son TS y `typecheck` está en el gate).

---

## 16. Missing Capabilities

### MUST HAVE — necesario antes de seguir creciendo

| # | Capacidad | Por qué es bloqueante |
|---|---|---|
| M1 | **Tests unitarios del propio framework** (runner + cobertura de `QueryBuilder`, `config`, `BasePage`) con gate en CI | Sin esto no hay red de seguridad para ningún cambio — y menos para uno hecho por IA. Es lo que convierte "código limpio hoy" en "código que se mantiene limpio" |
| M2 | **Capa de evidencia de fallos**: screenshot + trace de Playwright + attachments de Cucumber en `After` cuando el escenario falla | Sin evidencia no hay diagnóstico. Es lo que hace usable el framework en el día a día y lo que habilita cualquier auto-healing |
| M3 | **Logging estructurado** (niveles, con logging de query+binds en la capa DB, y redacción de valores sensibles) | Hoy hay 1 línea de log en todo el repo. Un fallo de SQL es una caja negra |
| M4 | **Test Data Management**: factories/builders, datos únicos por run, namespacing por worker, y cleanup/teardown | Prerequisito de paralelismo, de tests `@db` reales y de estabilidad. Sin esto la suite se vuelve flaky al crecer |
| M5 | **Guardrails de arquitectura automatizados**: `no-restricted-imports` por capa + prohibición explícita de un runner paralelo (`playwright.config.ts` / `*.spec.ts`) | Es lo único que convierte las convenciones del `README` en reglas verificables. **Sin esto, la IA no tiene barreras** |
| M6 | **Estrategia de autenticación** (login programático o `storageState` reutilizable, con secretos por env) | Ninguna aplicación real se testea sin login. Hoy no existe nada, y la doc miente sobre `storageState` |
| M7 | **Matriz de ambientes** (`ENV=qa|uat|...` que seleccione URLs/credenciales) | Con un solo `BASE_URL` el framework no puede usarse en más de un ambiente sin editar `.env` a mano |
| M8 | **Cerrar la deuda de referencias muertas** (`docs/refactor-progress/` + `storageState` en `AGENTS-support.md`) | Baratísimo y de alto impacto: hoy la documentación manda a leer archivos que no existen en un clon — y una IA los va a intentar leer |

### SHOULD HAVE — importante, no bloqueante

| # | Capacidad |
|---|---|
| S1 | **Capa de API testing**: client reutilizable sobre `APIRequestContext`, auth, schema validation (zod/ajv), assertions de response, e integración API+UI+DB en `CustomWorld` |
| S2 | **Feature `@db` real ejecutable** contra un schema propio (con seeding y cleanup), para que `test:db` deje de correr 0 escenarios |
| S3 | **Paralelismo + retries controlados** (`parallel: N`, `retry` con `retryTagFilter`), habilitables **después** de M4 |
| S4 | **Reporting rico** (Allure o `@cucumber/html-formatter` enriquecido) con screenshots/traces embebidos y publicación en CI (Pages o comentario en PR) |
| S5 | **CI ampliado**: job smoke rápido en PR + regression completa en `main`/nocturna (`schedule`), matriz de browsers, job `@db` con secrets |
| S6 | **`BaseComponent`** separado de `BasePage`, para que un Component no herede navegación de página |
| S7 | **`tsconfig` más estricto** + **lint type-aware selectivo** (al menos `no-floating-promises`) |
| S8 | **Reemplazar el target externo** (`playwright.dev`) por una app de demo local/pineada, para que el CI no dependa de un tercero |
| S9 | **Ejemplos de referencia faltantes**: un step `When`, un `Scenario Outline`, una data table, un `buildInsert`/`buildUpdate` en uso |
| S10 | **Documentación faltante**: cómo trabajar con API, cómo trabajar con test data, catálogo de anti-patterns, debugging de flaky, convenciones de naming |
| S11 | **Data prep transaccional** en la capa DB (transacción + rollback por escenario) |
| S12 | **Husky + lint-staged + `CODEOWNERS` + plantilla de PR** |

### NICE TO HAVE — mejoras futuras

| # | Capacidad |
|---|---|
| N1 | Segunda implementación de `DatabaseClient` (Postgres) para probar el contrato en producción |
| N2 | Accesibilidad (axe) y visual regression |
| N3 | Dashboard de métricas de calidad (duración, flaky rate, tendencia) |
| N4 | Dockerización de la ejecución |
| N5 | Generador/scaffolder de Pages/Steps/Repositories (CLI de plantillas) |
| N6 | Testing de performance / carga |
| N7 | Sharding de la suite en CI |
| N8 | `engines`/`.nvmrc` y Renovate/Dependabot |

---

## 17. AI Readiness

# **PARTIALLY READY**

### Por qué SÍ está parcialmente listo (fortalezas reales para IA)

1. **Cabe entero en contexto.** 16 archivos, 1.008 líneas. Un agente puede leer **todo** el framework y razonar con el sistema completo, no con fragmentos. Esta es la ventaja más grande y no hay que perderla.
2. **Arquitectura sin excepciones.** Un solo camino para cada cosa: `Feature → Step → World → Pages → Page → Component` y `Step → Container → Repository → BaseRepository → Client`. 0 atajos, 0 worlds paralelos, 0 casteos. La IA no tiene que elegir entre patrones en conflicto.
3. **`AGENTS.md` ya existe y está bien diseñado**, con el proceso correcto (orquestador → AGENTS de módulo → código) y `AGENTS-*.md` por módulo.
4. **Frontera de configuración de un solo punto** (`config/index.ts:26`): fácil de instruir ("nunca leas `process.env`") y fácil de verificar.
5. **Gate estático real y verde:** `npm run quality` (typecheck + lint + format:check) da a la IA un ciclo de feedback inmediato y objetivo.
6. **Modelo de seguridad DB explícito y documentado** (`QueryBuilder`): allowlists, binds, reject-never-sanitize. Es una restricción que una IA puede respetar porque está codificada, no solo escrita.
7. **Ejemplo canónico de cada patrón** para imitar (1 Page, 1 Component, 1 Repository, 1 Feature, 1 set de Steps).

### Por qué NO está listo (bloqueantes reales)

1. **No hay barreras que impidan una arquitectura paralela.** `@playwright/test` está instalado (`package.json:19`), `playwright.config.ts` no existe pero **nada lo prohíbe**, no hay `no-restricted-imports`, y `tsconfig.json:14` incluye solo `src|features|support` — un `tests/foo.spec.ts` quedaría fuera del typecheck. **Exactamente el escenario que querés evitar es hoy trivialmente posible y no lo detecta ningún gate.**
2. **No hay red de tests.** La única validación funcional son 2 escenarios de UI contra un sitio externo. Si una IA rompe `QueryBuilder`, `BasePage` o la config, `npm run quality` pasa igual y nada lo atrapa.
3. **No hay evidencia de fallos.** Sin trace/screenshot/logs, un agente "healer" no tiene insumos: solo puede adivinar. Un Playwright MCP puede *explorar* la app en vivo, pero no puede diagnosticar un fallo pasado del CI.
4. **No existe `CLAUDE.md`**, ni `.claude/agents/`, ni `.mcp.json`. `AGENTS.md` es un excelente punto de partida, pero no está en el formato que Claude Code carga automáticamente, y no contiene las **prohibiciones** (solo descripciones).
5. **La documentación manda a leer archivos que no existen en un clon.** Un agente que siga `AGENTS.md:50,71` o `cucumber.js:6` intentará abrir `docs/refactor-progress/*.md` y fallará; en el mejor caso pierde tiempo, en el peor alucina el contenido. Y hay ~14 referencias a IDs internos (`T09`…`T17`) sin destino resoluble.
6. **Patrones faltantes = invención garantizada.** No hay ejemplo de `When`, ni de `Scenario Outline`, ni de data table, ni de test data, ni de API, ni de un `INSERT`/`UPDATE` en uso. Donde no hay patrón que copiar, un LLM inventa uno — y probablemente distinto cada vez.
7. **Convenciones no verificables.** Las "Best Practices" de `README.md:424-434` son prosa. Nada falla si se violan (por ejemplo `waitForTimeout`: hoy simplemente no se usa, pero no hay regla de lint que lo prohíba).
8. **Ambigüedad de idioma.** Comentarios y docs mezclan español e inglés sin regla; la IA replicará la mezcla.

### Riesgos específicos de nuestro stack (Playwright + TS + Cucumber + Gherkin + POM + Components + Oracle)

| Riesgo | Probabilidad | Por qué, concretamente |
|---|---|---|
| **La IA genera `*.spec.ts` + `playwright.config.ts` en paralelo a Cucumber** | **ALTA** | Es el patrón dominante en el corpus de Playwright, y nuestro repo **no lo prohíbe en ningún lado**, además de tener `@playwright/test` instalado |
| **La IA pone locators y `expect()` directamente en los steps** | ALTA | Es el atajo más común en ejemplos de Cucumber+Playwright; el único ejemplo correcto son 5 líneas |
| **La IA agrega campos de negocio a `CustomWorld`** | ALTA | Es exactamente el "god object" que `ARCHITECTURE-REVIEW.md` denunció y que costó un refactor completo eliminar. `testContext` existe para evitarlo, pero **hoy ningún step lo usa** → no hay ejemplo de uso correcto |
| **La IA hereda Components de BasePage y navega desde un Component** | MEDIA-ALTA | Es literalmente lo que hace el único ejemplo (`ExampleNavigationComponent.ts:12`), por falta de `BaseComponent` |
| **La IA escribe SQL crudo en un repositorio (o en un step) esquivando `QueryBuilder`** | MEDIA-ALTA | `BaseRepository.select/insert/update` aceptan **strings de query libres** (`BaseRepository.ts:20-33`) — usar `QueryBuilder` es una convención, no una obligación técnica. Y `buildInsert`/`buildUpdate` no tienen ningún ejemplo de uso |
| **La IA inyecta identificadores desde datos del Scenario a la allowlist** | MEDIA | Rompería el modelo de seguridad. `QueryBuilder.ts:32-46` lo advierte en prosa, pero nada lo impide en código |
| **La IA introduce `waitForTimeout`/sleeps** | MEDIA | Prohibido por convención (`README.md:427`) pero **sin regla de lint** que lo haga fallar |
| **La IA lee `process.env` directamente en una Page/Step** | MEDIA | Prohibido en prosa (`AGENTS.md:38`), sin regla que lo verifique |
| **La IA crea un `Country`/multi-país nuevo** | BAJA-MEDIA | Fue eliminado deliberadamente, pero no hay nota que diga "no lo reintroduzcas", y el vacío de ambientes invita a rellenarlo |
| **La IA "arregla" tests rotos por el sitio externo debilitando assertions** | MEDIA | El target es `playwright.dev`, fuera de nuestro control |
| **Playwright MCP explora en vivo y genera código con locators de MCP, no con nuestro POM** | ALTA | El output natural de un generador basado en MCP son locators inline y `*.spec.ts`, no Page Objects + Gherkin |

---

## 18. Prerequisites Before AI Integration

Concreto, y ordenado por relación impacto/costo. Los marcados **[BLOQUEANTE]** conviene resolverlos **antes** de dejar que una IA escriba automatizaciones.

### Guardrails (evitan que la IA se desvíe)

1. **[BLOQUEANTE] `CLAUDE.md` en la raíz** con las **prohibiciones explícitas**, no solo descripciones: prohibido crear `playwright.config.ts` o `*.spec.ts`; prohibido usar `@playwright/test` como runner (solo `expect` y tipos); prohibido locators/`expect`/SQL/`process.env` en steps; prohibido agregar campos de negocio a `CustomWorld` (usar `testContext`); prohibido `waitForTimeout`; prohibido SQL crudo sin `QueryBuilder`; prohibido pasar datos del Scenario a una allowlist de identificadores; prohibido reintroducir `Country`. Debe apuntar a `AGENTS.md` y a los `AGENTS-*.md` de módulo (que ya son buenos).
2. **[BLOQUEANTE] Reglas de arquitectura ejecutables en ESLint** — la contraparte verificable del punto 1: `no-restricted-imports` por capa (steps no importan `playwright`/`oracledb`/Pages concretas; Pages no importan Repositories; nada fuera de `config/` lee `process.env`), `no-restricted-syntax` para `waitForTimeout`, y ban de patrones `*.spec.ts`. **Sin esto, `CLAUDE.md` es una sugerencia.**
3. **[BLOQUEANTE] Resolver la deuda de referencias muertas**: decidir si `docs/refactor-progress/` se trackea o se saca de todas las referencias, y corregir `AGENTS-support.md:27` (`storageState` no existe). Una IA que lee documentación falsa produce código falso.
4. Definir **una sola regla de idioma** para código y docs, y escribirla en `CLAUDE.md`.

### Red de seguridad (detecta cuando la IA se desvía)

5. **[BLOQUEANTE] Runner de unit tests + cobertura de `QueryBuilder`** (los ~37 casos de seguridad ya están especificados en `docs/refactor-progress/T12-query-builder.md`: recuperarlos como tests reales) **+ `config/index.ts`**, agregado a `npm run quality` y al CI. Es el único mecanismo que atrapa una regresión de IA en la pieza crítica.
6. **[BLOQUEANTE] Evidencia de fallos**: screenshot + trace + attachment de Cucumber en `After` cuando falla el escenario. Sin esto, ningún "healer" es viable y ningún fallo generado por IA es diagnosticable.
7. **Un test de arquitectura** que falle si aparece un `*.spec.ts`, un `playwright.config.ts` o un segundo World. Trivial de escribir, y es la defensa directa contra el riesgo que más preocupa.
8. **Reemplazar el target externo** por algo estable, para que "test rojo" signifique siempre "el cambio está mal" y no "playwright.dev cambió su home".

### Patrones de referencia (le dan a la IA algo correcto que copiar)

9. **Un ejemplo canónico de cada patrón que hoy falta**, aunque sea mínimo: un step `When`, un `Scenario Outline` con `Examples`, una data table, un uso real de `testContext`, un `buildInsert`/`buildUpdate` en un repositorio, y un feature `@db` ejecutable. La IA imita ejemplos mucho mejor de lo que sigue prosa.
10. **`BaseComponent`** separado, para que el ejemplo a copiar no sea el que hereda navegación.

### Antes de MCP específicamente

11. **Definir el rol de Playwright MCP como exploración/verificación, nunca generación directa.** Su output natural (locators inline + `*.spec.ts`) es exactamente lo que no queremos. El flujo aceptable es: MCP explora la app → propone locators semánticos → el humano/agente los coloca en un Page Object → el step se escribe en Gherkin.
12. **Scoping y credenciales del MCP:** decidir contra qué ambiente puede navegar (nunca prod), y con qué usuario. Hoy no hay estrategia de auth (M6), así que un MCP no puede pasar de un login.
13. **Definir el contrato de cada agente antes de escribirlo**: qué archivos puede tocar cada uno (p. ej. un "Automation Engineer Agent" escribe en `features/`, `src/pages/`, `src/components/` pero **nunca** en `support/`, `src/config/`, `src/database/clients/`), y qué gate debe pasar antes de proponer un cambio.
14. **Definir la política de Oracle para IA:** una IA no debería poder ejecutar SQL arbitrario contra un ambiente real. Con `DB_ENABLED` y credenciales fuera del repo estamos bien; hace falta la regla explícita.

---

## 19. Recommended Next Step

Los próximos **4 movimientos lógicos**, en este orden. No es un roadmap: es la secuencia mínima para pasar de "arquetipo limpio" a "framework al que se le puede soltar una IA".

### Movimiento 1 — Cerrar la deuda de verdad y sentar la base de IA (bajo costo, alto impacto)

Corregir las referencias muertas (`docs/refactor-progress/` en 15 archivos trackeados; `storageState` en `AGENTS-support.md:27`), eliminar el código muerto nuevo (`InitOptions.headless`), y escribir el **`CLAUDE.md`** con las prohibiciones explícitas apoyándose en el `AGENTS.md` que ya existe y es bueno. Es el movimiento más barato del inventario y desbloquea todo lo demás.

### Movimiento 2 — Red de seguridad: tests del framework + guardrails ejecutables

Agregar un runner de unit tests con cobertura de `QueryBuilder` (recuperando los casos de seguridad ya especificados) y de `config/index.ts`, sumarlo a `npm run quality` y al CI; y agregar las reglas de ESLint que hacen verificables las convenciones (`no-restricted-imports` por capa, ban de `waitForTimeout`, ban de `*.spec.ts`/`playwright.config.ts`). **Este movimiento es el que convierte "no hay barreras para la IA" en "hay barreras".**

### Movimiento 3 — Capa de evidencia (screenshot + trace + logging)

Screenshot y trace de Playwright adjuntados al reporte de Cucumber cuando un escenario falla, más logging estructurado con query+binds en la capa DB (con redacción de valores sensibles). Resuelve el problema operativo más doloroso de hoy y es **prerequisito técnico** de cualquier agente "healer" y de un reporting rico más adelante.

### Movimiento 4 — Test Data Management + primer flujo `@db` real

Factories/builders, datos únicos por run, namespacing por worker y cleanup; y con eso, el primer feature `@db` ejecutable contra un schema propio. Desbloquea, en este orden: tests de datos reales → paralelismo → retries controlados → CI con matriz.

### Después de estos cuatro (no antes)

Entonces sí: agentes especializados + Playwright MCP, con la capa de API (S1) y el CI ampliado (S5) como los dos frentes de crecimiento siguientes.

---

## Anexo — Método y limitaciones de este análisis

**Qué se leyó completo:** los 16 archivos `.ts`, `cucumber.js`, `tsconfig.json`, `package.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.env.example`, `.gitignore`, `.vscode/settings.json`, `.github/workflows/ci.yml`, `features/example/example.feature`, `AGENTS.md`, `src/database/AGENTS-database.md`, `support/AGENTS-support.md`, `docs/refactor-progress/T20-final-audit.md`, y las secciones de decisión de `FINAL-REFACTOR-PLAN.md`. De `README.md` (490 líneas) se leyó el índice y las secciones de tags, reporting, code quality, best practices, seguridad, limitaciones, extensiones y troubleshooting. De `ARCHITECTURE-REVIEW.md` (445 líneas) se leyó el executive summary — describe la **suite corporativa original**, no el estado actual, por lo que se usó solo como fuente de la lista de problemas a verificar.

**Qué NO se escaneó** (por instrucción): `node_modules/`, `.git/`, reportes generados, screenshots, traces, videos, artifacts, caches, binarios.

**Verificaciones ejecutadas:** `npm run quality` (PASS), `git ls-files`, `git remote -v`, `git branch -avv`, conteo de líneas por archivo, `find` de directorios, y greps dirigidos de `waitForTimeout|sleep|setTimeout`, `timeout:<n>`, `process.env`, `storageState`, `country|pais|Claro|CML`, `changestatus`, `password|secret|token|credential|apiKey`, `expect(` en features, `allure`, `screenshot|trace|video`, `parallel|worker|retry`, `console.`, `as string|as any`, y `refactor-progress|T[0-9]{2}`.

**No verificable en este entorno:** el resultado real de la corrida de GitHub Actions (no hay `gh` CLI instalado). Es el único punto del inventario que queda abierto.

**No se ejecutó `npm test`** para no generar artefactos en `reports/`. La evidencia de ejecución funcional (2 escenarios / 6 steps PASS) proviene de `docs/refactor-progress/T20-final-audit.md`; el código no cambió desde entonces salvo por lo señalado.
