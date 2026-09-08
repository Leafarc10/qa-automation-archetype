# CLAUDE.md — Contrato operativo de IA

Este archivo es el **contrato de trabajo** para Claude Code (y para cualquier agente derivado)
sobre este repositorio. No reemplaza a `README.md` (documentación de uso) ni a `AGENTS.md`
(mapa de arquitectura para contribuidores): define **cómo se trabaja acá**, qué está
verificado por máquina, qué no, y cuándo hay que detenerse a preguntar.

Orden de lectura recomendado antes de tocar código:
`CLAUDE.md` → `AGENTS.md` → el `AGENTS-*.md` del módulo → los archivos concretos.

**El código es la fuente final de verdad.** Si este documento y el código se contradicen,
gana el código y hay que reportar la discrepancia.

---

## 1. Identidad del framework

| Elemento | Realidad de este repo |
|---|---|
| Lenguaje | TypeScript (ESM, `"type": "module"`, `strict: true`) |
| Runner E2E | **Cucumber (`@cucumber/cucumber`) — el único** |
| Browser automation | **Playwright como librería** (`playwright`) |
| `@playwright/test` | Solo para `expect` y tipos (`Page`, `Locator`, …) |
| `@playwright/test` como runner | **Prohibido** (`test`/`describe`/`it`/hooks) |
| Patrón UI | Page Object Model + Components (composición, no herencia) |
| Patrón datos | Repository + QueryBuilder sobre `DatabaseClient` |
| Base de datos | Oracle **opcional** (`DB_ENABLED`, default `false`) |
| Unit / architecture tests | `node:test` (`node --test`), archivos `*.test.ts` |
| Gate de calidad | `npm run quality` = `typecheck` + `lint` + `format:check` + `test:unit` |
| Gate E2E | `npm test` (y variantes `test:ui` / `test:smoke` / `test:regression` / `test:db`) |

`npm run quality` **no** ejecuta Cucumber. Son dos gates separados.

---

## 2. Flujo canónico UI

```text
Feature (features/**/*.feature)
  → Step Definition (features/steps/**/*.steps.ts)
    → this.pages (CustomWorld → src/pageContainer/Pages.ts)
      → Page (src/pages/**, extends BasePage)
        → Component (src/components/**, extends BaseComponent)
          → Playwright
```

Un Step **describe intención funcional**.
Un Step **no implementa** browser automation.

---

## 3. Arquitectura UI

```text
BaseUiObject          (src/base/BaseUiObject.ts)             — esperas, acciones, getters, validaciones
├── BasePage          (src/pages/base/BasePage.ts)           — + goto / reload / waitForUrlContains
└── BaseComponent     (src/components/base/BaseComponent.ts) — + root: Locator
```

Reglas:

- Un Page concreto **extends `BasePage`**. Siempre. Sin excepciones.
- Un Component concreto **extends `BaseComponent`**. Siempre. Sin excepciones.
- Un Component trabaja **dentro de `this.root`** y **nunca usa `this.page`**.
- Un Component **nunca navega** (`goto`/`reload`/`waitForUrlContains` son exclusivos de `BasePage`).
- Los Components se **componen** desde el Page como propiedad; nunca se heredan.
- Cada Page nuevo se registra en `src/pageContainer/Pages.ts` (una línea).

Locators:

| Tipo | Forma correcta |
|---|---|
| Estático | `private readonly` construido en el constructor |
| Parametrizado | método privado *factory* que retorna `Locator` |

Las acciones y validaciones **consumen** esos locators; nunca construyen un locator inline
dentro de una acción o assertion.

Ejemplo canónico de Page (uno solo, a propósito): `src/pages/sauceDemo/SauceDemoLoginPage.ts`
(ver también el resto de `src/pages/sauceDemo/**`, que compone el flujo canónico de UI del
arquetipo — checkout completo en SauceDemo, `docs/refactor-progress-ia/T19.1-canonical-ui-cleanup.md`).

**No existe hoy ningún Component concreto en el repo** — el flujo canónico de SauceDemo no tiene
una región reutilizable que justifique uno, y no se crea un Component solo para tener un ejemplo.
`src/components/base/BaseComponent.ts` sigue siendo el contrato vigente (§3 más abajo); si una
tarea real necesita un Component, ese será el primer ejemplo vivo.

---

## 4. Steps

Desde un Step se puede usar **solo**:

- `this.pages`
- `this.repositories`
- `this.testContext`

Desde un Step está **prohibido**:

- `this.page`, `this.context`, `this.browser`
- importar Playwright (`playwright`, `@playwright/test`)
- importar Pages o Components directamente (`src/pages/**`, `src/components/**`)
- importar la capa database (`src/database/**`)
- SQL de cualquier forma
- `process.env`
- `waitForTimeout(...)`

El trabajo del Step es traducir **Gherkin → API del framework**. Nada más.

---

## 5. Config

Único owner legítimo de `process.env`: **`src/config/index.ts`**.

El resto del código consume:

- `config` — objeto tipado y validado (`sauceDemoBaseUrl`, `headless`, `browser`, `defaultTimeoutMs`, `db`)
- `requireSauceDemoBaseUrl()` — URL base del ejemplo canónico de UI (SauceDemo)

No leer `process.env` fuera de `src/config/**` y `*.test.ts`.
No inventar variables de ambiente nuevas sin necesidad real y sin actualizar
`src/config/index.ts`, `.env.example` y el README.

---

## 6. Database

```text
Step
  → this.repositories (RepositoryContainer)
    → Repository (src/database/repositories/**, extends BaseRepository)
      → BaseRepository / QueryBuilder
        → DatabaseClient (contrato)
          → OracleDatabaseClient (única implementación real)
```

Reglas:

- **Valores** de SQL viajan siempre como **binds**.
- **Identificadores** (tabla/columna) se validan contra un **allowlist** que el propio
  Repository define en su archivo — nunca se aceptan desde Steps, Features o input externo.
- **SQL nunca vive en un Step.** Vive en un Repository.
- `oracledb` se referencia **únicamente** desde `src/database/clients/OracleDatabaseClient.ts`.
- **Reutilizar** un Repository existente antes de crear uno nuevo; un Repository nuevo se
  compone en `src/database/RepositoryContainer.ts`.
- Los escenarios que tocan DB se taggean `@db` (el suite default corre `not @db`).

Detalle profundo: `src/database/AGENTS-database.md`.
Ciclo de vida del cliente compartido: `support/AGENTS-support.md` + `support/databaseLifecycle.ts`.

---

## 7. Reglas verificadas por máquina

Esta sección lista **solo** lo que hoy falla el gate de forma automática. Fue construida
midiendo `eslint.config.js`, `src/architecture.test.ts`, `tsconfig.json` y `package.json`,
no copiando documentación previa.

### 7.1. ESLint (`eslint.config.js`) — aplica a archivos `.ts`

| ID | Regla | Alcance real |
|---|---|---|
| G1 | Prohibido importar `test`/`describe`/`it`/`beforeAll`/`beforeEach`/`afterAll`/`afterEach` desde `@playwright/test` (`expect` y tipos siguen permitidos) | todos los `.ts` |
| G2 | Prohibido `*.waitForTimeout(...)` | todos los `.ts` |
| G3 | Prohibido `process.env` (dot, bracket, `const env = process.env` y destructuring) | todos los `.ts` excepto `src/config/**` y `**/*.test.ts` |
| G4 | Prohibido importar `oracledb` | todos los `.ts` excepto `src/database/clients/OracleDatabaseClient.ts` |
| G5 | Steps: prohibido importar `playwright`, `@playwright/test`, `oracledb`, `src/pages/**`, `src/components/**`, `src/database/**`; prohibido `this.page`/`this.context`/`this.browser`; prohibido `waitForTimeout` | `features/steps/**/*.ts` |
| G6 | SQL directo desde Steps — **no existe una regla propia**: la protección real es G5 (Steps no pueden importar la capa database) + los miembros `protected` de `BaseRepository` | estructural |
| G7 | Cualquier archivo `*.spec.ts` falla completo | `**/*.spec.ts` |
| G8 | Cualquier archivo `playwright.config.*` falla completo | `**/playwright.config.*` |
| — | `@typescript-eslint/no-explicit-any` = error | todos los `.ts` excepto `OracleDatabaseClient.ts` (excepción documentada) |

### 7.2. Architecture tests (`src/architecture.test.ts`, dentro de `test:unit`)

| ID | Invariante | Cómo verifica |
|---|---|---|
| A1 | No existe ningún archivo `playwright.config.*` en el repo | filesystem |
| A2 | No existe ningún archivo `*.spec.ts` en el repo | filesystem |
| A3 | Ningún script de `package.json` invoca `playwright test` | lectura de `package.json` |
| A4 | `setWorldConstructor` se llama exactamente una vez, y solo desde `support/world.ts` | AST TypeScript, repo completo |
| A5 | `CustomWorld` declara solo `browser`, `context`, `page`, `pages`, `repositories`, `testContext` | AST (`PropertyDeclaration`) |
| A6 | `oracledb` solo se referencia desde `OracleDatabaseClient.ts` — cubre `import`, `await import('oracledb')` y `createRequire` importado por nombre con un hop de asignación. Además verifica que la excepción **no esté obsoleta** | AST, repo completo |
| A7 | Todo `.feature` tiene al menos un tag Gherkin | filesystem + regex |
| A9 | Toda clase bajo `src/pages/**` extends `BasePage` | AST (`extends`), repo completo |
| A10 | Toda clase bajo `src/components/**` extends `BaseComponent` | AST (`extends`), repo completo |
| A11 | Ninguna clase bajo `src/components/**` accede a `this.page` | AST, por línea |
| A12 | Ningún `*.test.ts` vive fuera de `src/**`, `support/**`, `features/**` (fuera de ahí nunca se ejecutaría) | filesystem |

**A8 no existe como architecture test a propósito**: la propiedad de `process.env` está
cubierta por G3 en ESLint y no se duplica acá.

El walker de estos tests ignora: `node_modules`, `.git`, `reports`, `test-results`,
`playwright-report`, `blob-report`, `coverage`, `.cache`, `.vscode`, `.idea`,
`docs/refactor-progress/` y cualquier directorio `.tmp-*`.

### 7.3. TypeScript

`tsc --noEmit` con `strict: true`. `include` = `src/**/*.ts`, `features/**/*.ts`,
`support/**/*.ts`. Un `.ts` fuera de esas tres raíces **no se typechequea** (ver §8).

### 7.4. Unit tests

`test:unit` = `node --test` sobre `src/**/*.test.ts`, `support/**/*.test.ts`,
`features/**/*.test.ts`. Hoy: **61 tests / 23 suites** — `QueryBuilder`
(modelo de binds y allowlists), `config`, y los architecture tests.

---

## 8. Reglas que dependen de review humano (limitaciones conocidas)

> `npm run quality` verde es **obligatorio**, pero **no sustituye** review arquitectónico
> humano. Existen caminos donde código incorrecto todavía pasa el gate en verde.

Fuente medida: `docs/ai-foundation-readiness-final.md` §7.

| Finding | Qué sigue pasando en verde | Consecuencia para Claude |
|---|---|---|
| **F-03** | Los archivos `.js` no tienen ningún guardrail (`process.env`, `oracledb`, `waitForTimeout` pasan) | No escribir código de framework en `.js`. Todo el código productivo es `.ts`. |
| **F-10** | Un `.ts` fuera de `src/`, `support/`, `features/` nunca se typechequea | No crear código `.ts` fuera de esas tres raíces. |
| **F-06** | Un Step puede importar `playwright-core` y lanzar su propio browser (G5 no lo cubre) | Nunca importar `playwright-core`. Los Steps solo usan `this.pages`. |
| **F-15** | Un Component puede construir un locator page-wide desde el parámetro local `page` del constructor, escapando de su `root` (A11 solo cubre `this.page`) | En un Component, el parámetro `page` se usa **solo** para llamar a `super(page, root)`. Todo otro locator sale de `this.root`. |
| **F-16** | `oracledb` es alcanzable vía `import nodeModule from 'node:module'` / `import * as nodeModule` o un loader con varios hops | Nunca escribir acceso al driver fuera de `OracleDatabaseClient.ts`. |
| **F-07** | Aliasear `setWorldConstructor` escapa a A4 | Un solo World: `support/world.ts`. |
| **F-08** | A5 solo mira `PropertyDeclaration`: getters y *parameter properties* escapan | No agregar estado de negocio a `CustomWorld` de ninguna forma; usar `testContext`. |
| **F-09** | Un `.spec.js` pasa el gate | No crear archivos `*.spec.*`. |
| **F-11** | `await import('@playwright/test')` escapa a G1 | No importar el runner, ni estática ni dinámicamente. |
| **F-12** | El comentario en `src/architecture.test.ts:25` describe el destructuring de `process` como un gap abierto, cuando ESLint sí lo bloquea — comentario obsoleto | No tomar comentarios como enforcement; verificar contra la regla. |
| **F-13 / F-14** | Aliasear `process`; directorios `.tmp-*` invisibles al walker | Informativos. |

Lo que **sí** está garantizado hoy: no se puede introducir un runner paralelo por los
scripts del proyecto ni por CI, no se puede romper la jerarquía UI, no puede existir un test
silenciosamente muerto, no se filtran secretos, y `QueryBuilder` no construye SQL sin binds.

---

## 9. Infraestructura protegida

Claude **no modifica** estos archivos/directorios sin scope explícito del usuario:

- `src/base/**`
- `src/pages/base/BasePage.ts`, `src/components/base/BaseComponent.ts`
- `support/world.ts`, `support/hooks.ts`, `support/databaseLifecycle.ts`
- infraestructura de `src/database/**` (`clients/`, `builders/`, `repositories/BaseRepository.ts`, `RepositoryContainer.ts`)
- `eslint.config.js`
- `src/architecture.test.ts`
- `tsconfig.json`
- `cucumber.js`
- `package.json` (scripts / dependencias)
- `.github/workflows/**`

Si una tarea realmente necesita tocar infraestructura:

1. explicar el motivo;
2. proponer el cambio concreto;
3. listar los archivos afectados;
4. **esperar autorización explícita** antes de escribir.

**Nunca** relajar un guardrail para que código incorrecto pase. Si un guardrail rechaza un
cambio, se arregla el cambio. Relajar el guardrail es una decisión de un mantenedor humano.

---

## 10. Workflow para crear una automatización

1. Entender **qué funcionalidad** se quiere probar.
2. Identificar el **comportamiento esperado**.
3. Identificar los **escenarios** (incluyendo negativos).
4. Identificar **precondiciones**.
5. Identificar **datos** necesarios.
6. Identificar **validaciones** (UI / DB / otras).
7. Buscar Pages, Components y Repositories **existentes**.
8. **REUTILIZAR antes de crear.**
9. Proponer el **conjunto mínimo de archivos**.
10. Implementar **únicamente lo aprobado**.
11. `npm run quality`.
12. Ejecutar el E2E relevante (`npm test` o la variante por tag).
13. Revisar `git diff`.
14. Resumir los cambios.

No crear abstracciones por anticipado. Un Page nuevo por pantalla real, un Component nuevo
por región de UI realmente reutilizable, un Repository nuevo por entidad realmente necesaria.

---

## 11. Información faltante

Si falta cualquiera de estos, Claude **no lo inventa**:

regla de negocio · estado inicial · resultado esperado · usuario · dato · ambiente ·
credencial o token · validación de DB · comportamiento negativo esperado

Debe marcarlo explícitamente como:

```text
UNKNOWN
NEEDS CONFIRMATION
```

…y pedir la información antes de implementar esa parte. Un selector inventado, una URL
inventada o un dato inventado producen un test que miente.

---

## 12. Definition of Done

Una implementación **no está terminada** hasta que:

- `npm run quality` → **PASS**
- y, cuando sea posible, el **E2E relevante** → **PASS**

Además:

- ningún guardrail relajado;
- ningún fixture temporal dejado en el repo;
- ningún `TODO` escondiendo comportamiento faltante;
- ningún cambio fuera del scope acordado;
- documentación actualizada si corresponde;
- `git diff` revisado y resumido.

---

## 13. Git

Claude **no ejecuta** sin autorización explícita: `git add`, `git commit`, `git push`,
`git reset`, `git clean`, ni ninguna operación destructiva.

Claude **puede ejecutar** libremente: `git status`, `git diff`, `git diff --stat`,
`git log` (read-only).

---

## 14. Scope discipline

Si Claude descubre un bug distinto, deuda técnica, una mejora, un refactor posible, un
finding de seguridad o una optimización:

1. lo **documenta**;
2. lo **informa** al usuario;
3. **no lo implementa** automáticamente.

Una tarea = un scope. Los hallazgos laterales se reportan, no se arreglan de paso.

---

## 15. Experiencia del QA

Principio a preservar: **complejo por dentro, simple por fuera.**

Un QA debería poder trabajar normalmente solo en:

- `features/**/*.feature`
- `features/steps/**/*.steps.ts`
- `src/pages/**`
- `src/components/**`
- `src/pageContainer/Pages.ts`
- `src/database/repositories/**` cuando aplique

**No** debería necesitar tocar infraestructura (§9) para escribir un test nuevo. Cualquier
propuesta que obligue a un QA a abrir `src/base/**`, `support/world.ts` o
`src/architecture.test.ts` para agregar un test es, por defecto, la propuesta equivocada.

---

## 16. Dónde buscar más

| Necesidad | Archivo |
|---|---|
| Uso, setup, tags, comandos | `README.md` |
| Mapa de arquitectura para contribuidores | `AGENTS.md` |
| CustomWorld, hooks, ciclo de vida de DB | `support/AGENTS-support.md` |
| Oracle, repositories, QueryBuilder | `src/database/AGENTS-database.md` |
| Enforcement real medido + limitaciones | `docs/ai-foundation-readiness-final.md` |
| Auditoría previa (findings originales) | `docs/ai-foundation-final-audit.md` |
| Rationale de cada guardrail | `docs/refactor-progress-ia/` |
