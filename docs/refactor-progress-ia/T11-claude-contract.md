# T11 — Claude Project Contract

**Date:** 2026-09-07
**Status:** ✅ COMPLETED (con un finding de entorno reportado, no corregido — ver §11)
**Branch:** `feature/claude-ai-integration`
**Baseline commit:** `964e009` (Merge pull request #1 from Leafarc10/feature/ai-foundation)
**Fase:** 2 — Claude Code + agentes + Playwright MCP · primera tarea

---

## 1. Objetivo

Crear `CLAUDE.md` en la raíz del repositorio como **contrato operativo de IA**: el documento
que Claude Code y los futuros agentes especializados deben respetar al trabajar sobre este
framework.

T11 **no** crea agentes, **no** instala Playwright MCP, **no** crea `.claude/`, **no** crea
workflows funcionales y **no** modifica la arquitectura ni el código productivo. Su único
entregable de código es documentación: `CLAUDE.md` nuevo + una corrección documental mínima
de `README.md` para cerrar **F-05**.

Requisito explícito de la tarea: **no copiar la tabla "Architecture Guardrails" del README**,
porque la auditoría final (F-05) determinó que sobre-declara enforcement en ~6 filas y omite
por completo A9/A10/A11/A12. La tabla de reglas machine-enforced de `CLAUDE.md` fue construida
midiendo el código actual.

---

## 2. Fuentes utilizadas

**Documentación (trazabilidad y enforcement medido):**

- `docs/ai-foundation-readiness-final.md` — **fuente primaria** para §7 y §8 de `CLAUDE.md`
  (enforcement real, findings abiertos F-03…F-16, entry criteria de Fase 2)
- `docs/ai-foundation-final-audit.md` — findings originales, alcance de `tsconfig.include` y
  del bloque ESLint
- `README.md`, `AGENTS.md`, `support/AGENTS-support.md`, `src/database/AGENTS-database.md`
- `docs/refactor-progress-ia/T05-eslint-guardrails.md` — numeración y diseño de G1–G8
  (fuente de la aclaración sobre G6)
- `docs/refactor-progress-ia/T10.1`, `T10.1b`, `T10.2`, `T10.3`, `T10.4`

**Código (fuente final de verdad, leído en esta tarea):**

- `package.json` — scripts reales, `engines`, dependencias
- `eslint.config.js` — G1–G8 y sus overrides/excepciones reales
- `src/architecture.test.ts` (641 líneas) — A1–A7, A9–A12, el walker y sus ignores
- `tsconfig.json` — `include` real (3 raíces), `strict`
- `cucumber.js` — paths, import, loader, formatters
- `support/world.ts`, `support/hooks.ts`, `support/databaseLifecycle.ts`
- `src/config/index.ts`
- `src/base/BaseUiObject.ts`, `src/pages/base/BasePage.ts`, `src/components/base/BaseComponent.ts`
- `src/pages/example/ExamplePage.ts`, `src/components/example/ExampleNavigationComponent.ts`
- `src/pageContainer/Pages.ts`
- `src/database/RepositoryContainer.ts`, `repositories/BaseRepository.ts`,
  `repositories/example/ExampleRepository.ts`, `builders/QueryBuilder.ts`
- `features/example/example.feature`, `features/steps/example.steps.ts`
- `.prettierignore`, `.prettierrc.json`, `.github/workflows/ci.yml`

---

## 3. Diseño de CLAUDE.md

Decisiones de diseño:

1. **Operativo, no descriptivo.** No duplica el README (uso/setup) ni `AGENTS.md` (mapa de
   arquitectura). Responde: *¿qué puedo hacer, qué no, quién me va a atrapar, y cuándo
   pregunto?*
2. **Idioma español con terminología técnica en inglés**, consistente con
   `docs/refactor-progress-ia/`.
3. **Jerarquía de verdad explícita** en el encabezado: el código gana sobre el documento, y
   una contradicción se reporta.
4. **Separación estricta entre §7 (machine-enforced) y §8 (review-enforced).** Es la decisión
   central del documento: cada regla de §7 tiene una columna de *alcance real*; §8 dice
   explícitamente que `npm run quality` verde es necesario pero no suficiente.
5. **Corto y navegable**: 16 secciones, tablas en lugar de prosa donde se puede.

Estructura final (16 secciones):

| § | Sección |
|---|---|
| 1 | Identidad del framework |
| 2 | Flujo canónico UI |
| 3 | Arquitectura UI (jerarquía + locators) |
| 4 | Steps (permitido / prohibido) |
| 5 | Config |
| 6 | Database |
| 7 | Reglas verificadas por máquina (ESLint / architecture tests / TypeScript / unit tests) |
| 8 | Reglas que dependen de review humano (limitaciones conocidas) |
| 9 | Infraestructura protegida |
| 10 | Workflow para crear una automatización |
| 11 | Información faltante (UNKNOWN / NEEDS CONFIRMATION) |
| 12 | Definition of Done |
| 13 | Git |
| 14 | Scope discipline |
| 15 | Experiencia del QA |
| 16 | Dónde buscar más |

---

## 4. Arquitectura documentada

**Identidad:** TypeScript ESM strict · **Cucumber = único runner E2E** · Playwright como
librería · `@playwright/test` solo para `expect` y tipos (nunca como runner) · Page Object
Model + Components por composición · Repository + QueryBuilder · Oracle opcional
(`DB_ENABLED`, default `false`) · `node:test` para unit/architecture tests.

**Flujo canónico UI:**

```text
Feature → Step Definition → this.pages → Page → Component → Playwright
```

Un Step describe intención funcional; un Step no implementa browser automation.

**Jerarquía UI:**

```text
BaseUiObject
├── BasePage        (+ goto / reload / waitForUrlContains)
└── BaseComponent   (+ root: Locator)
```

Page concreto → `extends BasePage`. Component concreto → `extends BaseComponent`, trabaja
dentro de `this.root`, nunca `this.page`, nunca navega. Components se componen, no se heredan.
Locator estático → `private readonly` en el constructor; parametrizado → factory privado que
retorna `Locator`; las acciones/assertions consumen esos locators.

**Steps:** solo `this.pages` / `this.repositories` / `this.testContext`. Prohibido
`this.page`/`this.context`/`this.browser`, Playwright, Pages/Components/database importados
directo, SQL, `process.env`, `waitForTimeout`.

**Config:** único owner de `process.env` es `src/config/index.ts`; el resto consume `config` y
`requireBaseUrl()`.

**Database:** `Step → RepositoryContainer → Repository → BaseRepository/QueryBuilder →
DatabaseClient → OracleDatabaseClient`. Valores → binds; identificadores → allowlist propiedad
del Repository; SQL nunca en Steps; `oracledb` solo desde `OracleDatabaseClient.ts`; reutilizar
antes de crear.

---

## 5. Machine-enforced rules

Construidas **midiendo el código**, no copiando el README. Alcance real documentado por regla.

**ESLint (`eslint.config.js`), archivos `.ts`:**

| ID | Regla | Alcance medido |
|---|---|---|
| G1 | Runner de `@playwright/test` (`test`/`describe`/`it`/hooks) prohibido; `expect` y tipos permitidos | `import` estático en `.ts` |
| G2 | `*.waitForTimeout(...)` prohibido | `.ts` (re-listado en el override de Steps) |
| G3 | `process.env` prohibido | `.ts` excepto `src/config/**` y `**/*.test.ts` |
| G4 | `import 'oracledb'` prohibido | `.ts` excepto `src/database/clients/OracleDatabaseClient.ts` |
| G5 | Steps: sin `playwright`, `@playwright/test`, `oracledb`, `src/pages/**`, `src/components/**`, `src/database/**`; sin `this.page`/`this.context`/`this.browser`; sin `waitForTimeout` | `features/steps/**/*.ts` |
| G6 | SQL directo desde Steps — **sin regla propia**; protección estructural = G5 + miembros `protected` de `BaseRepository` | estructural |
| G7 | `*.spec.ts` falla completo | `**/*.spec.ts` |
| G8 | `playwright.config.*` falla completo | `**/playwright.config.*` |
| — | `no-explicit-any` = error | `.ts` excepto `OracleDatabaseClient.ts` |

**Architecture tests (`src/architecture.test.ts`, dentro de `test:unit`):**
A1 (no `playwright.config.*`), A2 (no `*.spec.ts`), A3 (ningún script invoca `playwright test`),
A4 (`setWorldConstructor` exactamente una vez desde `support/world.ts`), A5 (allowlist de
propiedades de `CustomWorld`), A6 (`oracledb` solo desde el cliente autorizado — cubre `import`,
`await import('oracledb')` y `createRequire` importado por nombre con un hop; + assertion
anti-obsolescencia), A7 (todo `.feature` con ≥1 tag), A9 (Pages `extends BasePage`), A10
(Components `extends BaseComponent`), A11 (Components sin `this.page`), A12 (todo `*.test.ts`
bajo una raíz de discovery).

**A8 documentado como inexistente a propósito**: la propiedad de `process.env` está cubierta
por G3 y no se duplica como architecture test.

Ignores del walker documentados (`node_modules`, `.git`, `reports`, `test-results`,
`playwright-report`, `blob-report`, `coverage`, `.cache`, `.vscode`, `.idea`,
`docs/refactor-progress/`, `.tmp-*`).

**TypeScript:** `tsc --noEmit`, `strict: true`, `include` = `src/**`, `features/**`, `support/**`.

**Unit tests:** `node --test` sobre las tres raíces — **61 tests / 23 suites** (`QueryBuilder`,
`config`, architecture).

Ninguna afirmación de enforcement más amplia que la real: cada gap medido está en §8 de
`CLAUDE.md`, no escondido.

---

## 6. Review-enforced rules

`CLAUDE.md` §8 abre con la frase operativa que pedía la tarea: **`npm run quality` verde es
obligatorio, pero no sustituye review arquitectónico humano.**

Findings de `docs/ai-foundation-readiness-final.md` §7 traducidos a **consecuencia práctica
para Claude** (no a explicación extensa del bypass):

| Finding | Consecuencia documentada |
|---|---|
| F-03 | Los `.js` no tienen guardrails → todo el código de framework es `.ts` |
| F-10 | `.ts` fuera de `src/`/`support/`/`features/` nunca se typechequea → no crear código ahí |
| F-06 | `playwright-core` escapa a G5 → nunca importarlo; los Steps solo usan `this.pages` |
| F-15 | El parámetro local `page` de un Component escapa a A11 → se usa **solo** para `super(page, root)` |
| F-16 | `node:module` por default/namespace import escapa a A6 → nunca acceso al driver fuera del cliente autorizado |
| F-07 | Aliasear `setWorldConstructor` escapa a A4 → un solo World |
| F-08 | A5 solo ve `PropertyDeclaration` → nada de estado de negocio en `CustomWorld` |
| F-09 | `.spec.js` pasa → no crear `*.spec.*` |
| F-11 | `await import('@playwright/test')` escapa a G1 → no importar el runner de ninguna forma |
| F-12 | El comentario de `src/architecture.test.ts:25` está obsoleto → no tomar comentarios como enforcement |
| F-13 / F-14 | Informativos |

Además se documenta explícitamente **qué sí está garantizado** hoy (no hay runner paralelo por
scripts ni CI, no se rompe la jerarquía UI, no hay tests silenciosamente muertos, no se filtran
secretos, `QueryBuilder` no arma SQL sin binds), para que la sección no se lea como
"nada está protegido".

---

## 7. Workflow para automatizaciones

`CLAUDE.md` §10, 14 pasos, con el orden **entender → identificar → buscar existente →
reutilizar → proponer mínimo → implementar solo lo aprobado → validar**:

1. entender la funcionalidad · 2. comportamiento esperado · 3. escenarios (incl. negativos) ·
4. precondiciones · 5. datos · 6. validaciones UI/DB/otras · 7. buscar
Pages/Components/Repositories existentes · 8. **reutilizar antes de crear** · 9. proponer
archivos mínimos · 10. implementar solo lo aprobado · 11. `npm run quality` · 12. E2E relevante ·
13. `git diff` · 14. resumir.

Regla anti-anticipación incluida: no crear abstracciones por adelantado (un Page por pantalla
real, un Component por región realmente reutilizable, un Repository por entidad realmente
necesaria).

§11 (información faltante) obliga a marcar `UNKNOWN` / `NEEDS CONFIRMATION` y pedir el dato en
lugar de inventar regla de negocio, estado inicial, resultado esperado, usuario, dato, ambiente,
credencial, validación de DB o comportamiento negativo.

§9 (infraestructura protegida) exige el protocolo de 4 pasos —motivo, propuesta, archivos,
autorización explícita— antes de tocar `src/base/**`, las base classes de Pages/Components,
`support/world.ts`, `support/hooks.ts`, `support/databaseLifecycle.ts`, la infraestructura de
`src/database/**`, `eslint.config.js`, `src/architecture.test.ts`, `tsconfig.json`,
`cucumber.js`, `package.json` y `.github/workflows/**`.

§13 (git) y §14 (scope discipline) cierran el contrato: sin `add`/`commit`/`push`/`reset`/`clean`
sin autorización, y los hallazgos laterales se documentan e informan pero no se implementan.

---

## 8. Definition of Done

`CLAUDE.md` §12:

- `npm run quality` → **PASS**
- y, cuando sea posible, el **E2E relevante** → **PASS**

Más: ningún guardrail relajado, ningún fixture temporal en el repo, ningún `TODO` escondiendo
comportamiento, ningún cambio fuera de scope, documentación actualizada si corresponde,
`git diff` revisado y resumido.

Y la regla dura, explícita: **nunca relajar un guardrail para hacer pasar código incorrecto** —
si un guardrail rechaza un cambio, se arregla el cambio; relajarlo es decisión de un mantenedor
humano.

---

## 9. Corrección F-05

Alcance: **solo** la sección `README.md → Architecture Guardrails` (más una línea en
*Internal Documentation*). No se reescribió el README.

**Qué se hizo:**

1. Se agregó una tercera columna **"Scope"**: cada fila declara ahora el alcance medido del
   check en lugar de leerse como absoluta.
2. Se **suavizaron las 6 sobre-declaraciones** medidas por la auditoría:
   - G1 → se aclara que es `import` estático y que el dinámico escapa (F-11)
   - `waitForTimeout` → dejó de decir "anywhere"; ahora dice `.ts` únicamente (F-03)
   - `oracledb` → se explicita qué formas cubre A6 y que default/namespace `node:module`
     escapa (F-16)
   - Steps → se explicita que `playwright-core` **no** está en la lista (F-06)
   - `setWorldConstructor` → aliasing escapa (F-07)
   - `CustomWorld` → getters y parameter properties escapan (F-08)
   - `*.spec.ts` → `.spec.js` no se detecta (F-09)
3. Se **agregaron las cuatro guardrails faltantes**: **A9** (Pages `extends BasePage`), **A10**
   (Components `extends BaseComponent`), **A11** (Component root scoping), **A12** (unit test
   discovery).
4. Se **reflejó A6 ampliado** (`import` + dynamic `import()` + `createRequire` con named import
   y un hop, más la assertion anti-obsolescencia).
5. Se **distinguió machine-enforced de review-enforced** con dos afirmaciones que la tabla
   ahora declara *no* hacer: (a) `quality` verde es necesario pero no suficiente, con puntero a
   `docs/ai-foundation-readiness-final.md` §7; (b) las convenciones de locators, "keep Steps
   thin" y "reuse before creating" son review-enforced, no machine-enforced.
6. Se agregó la fila **G6 / "No SQL in Step Definitions"** identificándola correctamente como
   protección **estructural** (G5 + miembros `protected`), no como una regla ESLint propia.
7. Se agregaron IDs (`G1`…`G8`, `A1`…`A12`) a cada fila, para que la tabla del README y §7 de
   `CLAUDE.md` sean trazables entre sí y contra el código.

**Resultado:** F-05 queda cerrado documentalmente. La tabla ya no sobre-declara y ya no omite
A9–A12. Diff: 31 inserciones / 17 borrados en `README.md`, todo dentro de la sección objetivo.

---

## 10. Archivos modificados

| Archivo | Cambio |
|---|---|
| `CLAUDE.md` | **NUEVO** — contrato operativo de IA, 16 secciones |
| `README.md` | Sección *Architecture Guardrails* reescrita con scope medido + A9–A12 (F-05); una línea agregada en *Internal Documentation* apuntando a `CLAUDE.md` |
| `docs/refactor-progress-ia/T11-claude-contract.md` | **NUEVO** — este registro |

**Cero** cambios en código productivo, ESLint, architecture tests, `tsconfig.json`,
`cucumber.js`, `package.json`, CI o dependencias. No se creó `.claude/`, no se instaló MCP, no
se crearon agentes.

---

## 11. Validaciones

**A) Paths citados en `CLAUDE.md` — todos existen.** Verificación automatizada extrayendo cada
path entre backticks y probando su existencia: 30/30 reales OK. Los únicos "misses" del script
fueron extensiones sueltas (`.ts`, `.js`, `.feature`, `.spec.js`) y fragmentos relativos usados
dentro del paréntesis de §9 (`clients/`, `builders/`, `repositories/BaseRepository.ts`,
`RepositoryContainer.ts`, `OracleDatabaseClient.ts`), que resuelven bajo `src/database/` —
verificados presentes.

**B) Scripts citados — todos existen.** `quality`, `typecheck`, `lint`, `format:check`,
`test:unit`, `test`, `test:ui`, `test:smoke`, `test:regression`, `test:db` → 10/10 presentes en
`package.json`.

**C) Capacidades inexistentes — ninguna declarada.** `CLAUDE.md` no menciona API layer, Test
Data Management, `storageState`/auth, screenshots/traces, logging estructurado, matriz de
ambientes, paralelismo ni retries, que son ausencias deliberadas del roadmap.

**D) Contradicciones con código / README / AGENTS — ninguna encontrada.** La jerarquía UI, los
límites de Steps, la propiedad de `process.env`, el flujo de database y el modelo de binds y
allowlists coinciden con `AGENTS.md` §3, con `README.md` y con el código leído.

**E) `npm run quality` → exit 1**, por una causa **preexistente y ajena a T11**:

| Etapa | Resultado |
|---|---|
| `typecheck` (`tsc --noEmit`) | ✅ exit 0 |
| `lint` (`eslint .`) | ✅ exit 0 |
| `format:check` (`prettier . --check`) | ❌ exit 1 — 19 archivos |
| `test:unit` (`node --test`) | ✅ **61 tests / 23 suites / 61 pass / 0 fail** |

Diagnóstico (verificado, no inferido):

- El fallo se reproduce con **working tree limpio en el commit base `964e009`**, antes de
  cualquier cambio de T11.
- Causa: `git config core.autocrlf = true` (local y global) hace checkout con **CRLF**, mientras
  Prettier usa `endOfLine: "lf"` por defecto y el repo no tiene `.gitattributes`.
- Prueba: `npx prettier --check --end-of-line auto .` → **"All matched files use Prettier code
  style!"**, exit 0. El único problema de formato es el fin de línea.
- Los 19 archivos son todos preexistentes (`eslint.config.js`, `cucumber.js`, `package.json`,
  `tsconfig.json`, `.github/workflows/ci.yml` y los `.ts` del framework). **Ninguno** es un
  archivo de T11: `.prettierignore` excluye `*.md`, así que `CLAUDE.md`, `README.md` y este
  registro no participan de `format:check`.

Es un finding de entorno/configuración, no de T11, y su corrección (agregar `.gitattributes`
con `* text=auto eol=lf`, o fijar `endOfLine` en `.prettierrc.json`) toca configuración fuera
del scope autorizado. **Se reporta, no se implementa** (§14 de `CLAUDE.md`). Candidato a
finding **F-17** del backlog.

**F) `git status`** → `M README.md`, `?? CLAUDE.md` (más este registro). Sin fixtures temporales.

**G) `git diff --stat`** → `README.md | 48 +++++----` · 1 archivo, 31 inserciones, 17 borrados.

**H) `git diff` revisado** → el cambio está contenido en la sección *Architecture Guardrails* y
en una línea de *Internal Documentation*. Nada fuera de scope.

No se ejecutó `git add` / `git commit` / `git push`.

---

## 12. Resultado

✅ **T11 COMPLETADA.**

- `CLAUDE.md` creado en la raíz: contrato operativo de 16 secciones, con separación explícita
  entre lo verificado por máquina y lo que depende de review humano.
- Las reglas machine-enforced fueron **medidas contra el código actual** (`eslint.config.js`,
  `src/architecture.test.ts`, `tsconfig.json`, `package.json`), no copiadas de la tabla del
  README, tal como exigía la tarea y el entry criteria #1 de
  `docs/ai-foundation-readiness-final.md` §12.
- **F-05 cerrado documentalmente**: la tabla del README ya no sobre-declara enforcement y ya
  incluye A9, A10, A11 y A12, con A6 ampliado reflejado correctamente y la distinción
  machine/review explícita.
- `typecheck`, `lint` y `test:unit` en verde (61/61). `format:check` rojo por CRLF preexistente
  del entorno — diagnosticado, reportado como finding, **no** corregido (fuera de scope).
- Cero cambios en código productivo, guardrails, CI o dependencias. Sin agentes, sin `.claude/`,
  sin MCP.

---

## 13. Aprendizaje técnico

1. **Un contrato de IA no puede heredar afirmaciones de documentación previa.** El valor de
   `CLAUDE.md` §7 está en que cada fila fue verificada contra el archivo que la implementa: G6
   no es una regla ESLint (es G5 + `protected`), A8 no existe como architecture test a propósito,
   y `waitForTimeout` no está prohibido "anywhere" sino solo en `.ts`. Copiar la tabla del README
   habría propagado exactamente los seis errores que F-05 identificó.

2. **La honestidad sobre los gaps es una feature, no una debilidad.** Un agente que cree que el
   gate lo protege de todo confía de más; un agente que sabe que `playwright-core` o un `.js`
   pasan en verde tiene una razón concreta para no escribirlos. §8 convierte cada finding abierto
   en una instrucción accionable en lugar de una advertencia genérica.

3. **Documentar el *alcance* de un guardrail es más útil que documentar su intención.** "No
   `waitForTimeout` anywhere" es la intención; "`.ts` únicamente" es lo que ocurre. La columna
   *Scope* del README es el patrón que hace la diferencia, y es reutilizable para cualquier
   guardrail que se agregue después.

4. **`npm run quality` puede fallar por razones que no son del repo.** El caso CRLF/`autocrlf`
   demuestra que el gate mezcla dos señales distintas: violaciones reales y desalineación de
   entorno. Un agente que trate un `format:check` rojo como "código incorrecto" va a intentar
   arreglar el código equivocado. Antes de reaccionar a un gate rojo hay que aislar la etapa y
   verificar que el rojo exista también en el commit base con working tree limpio.

5. **Un contrato tiene que decir explícitamente qué NO se puede tocar.** La lista de
   infraestructura protegida (§9) con protocolo de autorización de 4 pasos es lo que evita que un
   agente "arregle" un guardrail que lo está frenando legítimamente — el modo de falla más
   costoso posible en un framework cuyo valor está justamente en sus invariantes.

---

## 14. Próxima tarea

**T12 — Diseñar arquitectura de agentes especializados de Claude Code.**

No ejecutada en T11.
