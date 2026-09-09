# SDET Playbook — Playwright Automation Archetype

> **Qué es este documento.** La guía de estudio y de trabajo del arquetipo. No es el `README.md`
> (uso y setup), ni `CLAUDE.md` (contrato operativo para agentes), ni `AGENTS.md` (mapa para
> contribuidores). Es el documento que explica **por qué** el repo es como es, para que puedas
> mantenerlo, extenderlo y explicarlo.
>
> **Fuente de verdad:** el código. Todo lo que se afirma acá fue verificado contra los archivos
> reales del repositorio en el commit `b277b76`. Si algo del Playbook y el código se contradicen,
> gana el código.
>
> **Estado del arquetipo:** `FINAL VERDICT: READY` — ver §36.

---

## Índice

| # | Sección | # | Sección |
|---|---|---|---|
| 1 | [Qué construimos](#1-qué-construimos) | 19 | [Claude Code Contract](#19-claude-code-contract) |
| 2 | [Arquitectura general](#2-arquitectura-general) | 20 | [AI Agents](#20-ai-agents) |
| 3 | [BDD — Cucumber + Gherkin](#3-bdd--cucumber--gherkin) | 21 | [Human Gates](#21-human-gates) |
| 4 | [CustomWorld](#4-customworld) | 22 | [/qa-automate](#22-qa-automate) |
| 5 | [Hooks](#5-hooks) | 23 | [Playwright MCP](#23-playwright-mcp) |
| 6 | [Pages Container](#6-pages-container) | 24 | [Infraestructura protegida](#24-infraestructura-protegida) |
| 7 | [Page Object Model](#7-page-object-model) | 25 | [Git workflow](#25-git-workflow) |
| 8 | [BaseUiObject / BasePage / BaseComponent](#8-baseuiobject--basepage--basecomponent) | 26 | [Cómo agregaría una funcionalidad nueva](#26-cómo-agregaría-una-funcionalidad-nueva) |
| 9 | [Configuración](#9-configuración) | 27 | [Cómo adaptar este arquetipo a una empresa](#27-cómo-adaptar-este-arquetipo-a-una-empresa) |
| 10 | [Database Layer](#10-database-layer) | 28 | [Qué decisiones SDET tomamos](#28-qué-decisiones-sdet-tomamos) |
| 11 | [QueryBuilder y SQL seguro](#11-querybuilder-y-sql-seguro) | 29 | [Anti-patterns](#29-anti-patterns) |
| 12 | [DB lifecycle](#12-db-lifecycle) | 30 | [Preguntas de entrevista](#30-preguntas-de-entrevista) |
| 13 | [ESLint Guardrails](#13-eslint-guardrails) | 31 | [Speech del proyecto](#31-speech-del-proyecto) |
| 14 | [Architecture Tests](#14-architecture-tests) | 32 | [Checklist de conocimientos](#32-checklist-de-conocimientos) |
| 15 | [Machine-Enforced vs Review-Enforced](#15-machine-enforced-vs-review-enforced) | 33 | [Plan de estudio](#33-plan-de-estudio-del-proyecto) |
| 16 | [Testing Strategy](#16-testing-strategy) | 34 | [Glosario](#34-glosario) |
| 17 | [CI/CD](#17-cicd) | 35 | [Qué NO hace todavía](#35-qué-no-hace-todavía-este-arquetipo) |
| 18 | [SauceDemo — flujo completo](#18-saucedemo--flujo-completo) | 36 | [Estado final](#36-estado-final) |

---

## 1. Qué construimos

### Explicación simple

Un **arquetipo de automatización E2E**: un repositorio base, listo para clonar, que ya trae
resueltas las decisiones que normalmente se toman mal y tarde en un proyecto de automatización —
dónde vive un locator, quién lee la configuración, cómo se evita SQL injection, qué impide que
alguien meta un segundo runner, y cómo se trabaja con asistentes de IA sin que escriban lo que se
les ocurra.

No es "un framework con tests". Son **cinco capas** que conviene no confundir:

| Capa | Qué es | Dónde vive |
|---|---|---|
| **Framework** | Las clases base y la infraestructura reutilizable: `BaseUiObject`, `BasePage`, `BaseComponent`, `CustomWorld`, config, capa de base de datos | `src/base/**`, `src/pages/base/**`, `src/components/base/**`, `support/**`, `src/config/**`, `src/database/**` |
| **Tests** | Los escenarios reales: Gherkin + Steps + Page Objects concretos | `features/**`, `src/pages/sauceDemo/**` |
| **Guardrails** | Reglas que **fallan el build** si alguien rompe la arquitectura: ESLint + architecture tests | `eslint.config.js`, `src/architecture.test.ts` |
| **CI** | Pipeline que corre todo en cada push/PR | `.github/workflows/ci.yml` |
| **AI-assisted workflow** | Tres agentes con gates humanos + un contrato operativo | `.claude/**`, `CLAUDE.md`, `.mcp.json` |

Y una herramienta que se confunde seguido con el framework: **Playwright MCP** (§23), que es un
browser separado que usan los **agentes** para *mirar* la aplicación, no para correr tests.

### Tecnologías reales

Verificado contra `package.json` — sin versiones inventadas:

| Herramienta | Versión | Rol |
|---|---|---|
| Node.js | `>=24.12` (`engines`) | Runtime. El mínimo es real: `test:unit` usa el *type stripping* nativo de Node para correr `.ts` con `node --test` |
| TypeScript | `^5.3.3` | Todo el código, `strict: true`, ESM (`"type": "module"`) |
| `@cucumber/cucumber` | `12.6.0` | **El único runner E2E** |
| `playwright` | `1.58.0` | Automatización de browser, usado **como librería** |
| `@playwright/test` | `1.58.0` | Solo `expect` y tipos (`Page`, `Locator`). **Nunca como runner** |
| `oracledb` | `^6.10.0` | Driver de la única implementación real de `DatabaseClient` |
| `dotenv` | `^17.3.1` | Carga `.env` dentro de `src/config/index.ts` |
| `ts-node` | `^10.9.2` | Loader ESM para que Cucumber lea `.ts` sin build step |
| ESLint + Prettier | `^10.9.1` / `^3.9.6` | Guardrails y formato |
| GitHub Actions | — | CI |

**La decisión que define todo el repo:** Playwright es una **librería**, no el runner. El runner es
Cucumber. Eso no es una preferencia estética: hay cuatro guardrails (`G1`, `G7`, `G8`, `A1`, `A2`,
`A3`) que existen únicamente para que nadie introduzca un segundo runner en paralelo, ni por
accidente ni por costumbre.

### Diagrama del sistema completo

```text
                          ┌─────────────────────────────────────────┐
                          │            AI-ASSISTED LAYER            │
                          │  /qa-automate                           │
                          │    qa-analyst → GATE 1 (humano)         │
                          │    automation-engineer PLAN             │
                          │                → GATE 2 (humano)        │
                          │    automation-engineer IMPLEMENT        │
                          │    automation-reviewer                  │
                          │  + Playwright MCP (observación)         │
                          └───────────────────┬─────────────────────┘
                                              │ escribe / revisa
                                              ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │                              TESTS                                        │
   │   features/sauceDemo/checkout.feature        (Gherkin, tags)              │
   │   features/steps/sauceDemo/checkout.steps.ts (14 steps, solo this.pages)  │
   └───────────────────────────────┬──────────────────────────────────────────┘
                                   ▼
   ┌──────────────────────────────────────────────────────────────────────────┐
   │                            FRAMEWORK                                      │
   │   support/world.ts        CustomWorld (browser/context/page/pages/…)      │
   │   support/hooks.ts        Before / After / BeforeAll / AfterAll           │
   │   src/pageContainer/      Pages (compone las 6 Pages de SauceDemo)        │
   │   src/pages/**            Page Objects  → BasePage → BaseUiObject         │
   │   src/components/**       BaseComponent (contrato, sin Component concreto)│
   │   src/config/index.ts     único dueño de process.env                      │
   │   src/database/**         Repository → QueryBuilder → DatabaseClient      │
   └───────────────────────────────┬──────────────────────────────────────────┘
                                   ▼
                        Playwright (librería)  ·  Oracle (opcional)

   ┌──────────────────────────────────────────────────────────────────────────┐
   │  GUARDRAILS  eslint.config.js (G1–G8)  ·  src/architecture.test.ts (A1–A12)│
   │  CI          .github/workflows/ci.yml → quality + npm test + artifacts     │
   └──────────────────────────────────────────────────────────────────────────┘
```

### Por qué se diseñó así

El problema que resuelve no es "no tenemos tests". Es **la entropía del segundo año**: un framework
de automatización arranca limpio y a los seis meses tiene locators en los Steps, `waitForTimeout`
por todos lados, tres formas de leer configuración y dos runners conviviendo. Este arquetipo apuesta
a que **las convenciones que no fallan el build, no se cumplen**. Por eso una parte grande del
repositorio son guardrails, no features.

### Cómo lo explicaría en una entrevista

> "Es un arquetipo de automatización E2E en TypeScript con Cucumber como runner y Playwright usado
> como librería. Lo que lo diferencia de un boilerplate típico es que las convenciones de
> arquitectura están **verificadas por máquina**: hay reglas de ESLint y tests de arquitectura que
> fallan el build si un Step toca `this.page`, si una Page no extiende `BasePage`, o si alguien
> intenta meter un segundo runner. Además tiene una capa de trabajo asistido por IA con tres
> agentes y gates humanos obligatorios."

---

## 2. Arquitectura general

### El flujo canónico, con paths reales

```text
features/sauceDemo/checkout.feature                  Gherkin: qué se prueba
        ↓
features/steps/sauceDemo/checkout.steps.ts           traduce Gherkin → API del framework
        ↓
support/world.ts  →  CustomWorld                     estado por escenario
        ↓
src/pageContainer/Pages.ts                           compone las Pages, una sola vez
        ↓
src/pages/sauceDemo/SauceDemoLoginPage.ts            Page Object concreto
        ↓
src/pages/base/BasePage.ts                           + goto / reload / waitForUrlContains
        ↓
src/base/BaseUiObject.ts                             17 métodos compartidos (esperas/acciones/asserts)
        ↓
Playwright
```

### Responsabilidades y límites

| Capa | Sí hace | No hace |
|---|---|---|
| **Feature** | Describe comportamiento de negocio en lenguaje natural, con tags | Detalles técnicos, selectores, URLs |
| **Step** | Traduce Gherkin a `this.pages` / `this.repositories` / `this.testContext` | Locators, SQL, `process.env`, `this.page`, navegación (`goto`) |
| **CustomWorld** | Guarda estado de infraestructura por escenario | Lógica de negocio, estado de dominio |
| **Pages (container)** | Instancia y expone las Pages | Lógica; es solo composición |
| **Page Object** | Locators + acciones semánticas + validaciones de esa pantalla | Conocer otras pantallas, leer `process.env` |
| **BasePage** | Navegación de página completa | Nada específico de una pantalla |
| **BaseUiObject** | Esperas, acciones, getters y asserts genéricos sobre `Locator` | Navegación (eso es de `BasePage`) |

La regla que resume todo: **un Step describe intención funcional; un Step no implementa browser
automation.**

### Qué debería conocer un QA vs un SDET

| | QA Automation | SDET |
|---|---|---|
| **Trabaja normalmente en** | `features/**/*.feature`, `features/steps/**`, `src/pages/**`, `src/pageContainer/Pages.ts` | todo lo anterior **más** `src/base/**`, `support/**`, `src/database/**`, `eslint.config.js`, `src/architecture.test.ts`, CI |
| **Debe entender** | POM, tags, cómo agregar una Page y registrarla, por qué un Step es fino | además: por qué existe cada guardrail, cómo se hace cumplir, qué **no** cubre, y cómo evolucionar la base sin romper a los QA |
| **Debe poder responder** | "¿dónde pongo este locator?" | "¿por qué esta regla no detecta este caso?" |

El principio de diseño detrás de esa división está escrito en `CLAUDE.md` §15: **complejo por
dentro, simple por fuera.** Si una propuesta obliga a un QA a abrir `src/base/**` o
`support/world.ts` para agregar un test, es —por defecto— la propuesta equivocada.

### Preguntas que podrían hacerme

**"¿Por qué tantas capas para hacer click en un botón?"**
Porque el costo no está en el primer test, está en el test número doscientos. Las capas existen para
que un cambio de UI se arregle en un solo archivo (la Page) y no en cuarenta Steps, y para que el
Step siga siendo legible por alguien que no programa.

**"¿No es sobre-ingeniería?"**
Se puede medir: no hay ninguna abstracción especulativa. No existe un Component concreto porque el
flujo canónico no tiene una región reutilizable que lo justifique (§8), y no hay una segunda
implementación de `DatabaseClient` porque no hay una segunda base. Las capas que existen tienen un
consumidor real hoy.

---

## 3. BDD — Cucumber + Gherkin

### Explicación simple

**BDD** (Behavior Driven Development) escribe los tests en lenguaje natural estructurado, para que
un no-programador pueda leerlos. **Gherkin** es ese lenguaje. **Cucumber** es el runner que
convierte cada línea de Gherkin en una función TypeScript.

| Palabra | Qué significa |
|---|---|
| `Feature` | Una funcionalidad. Un archivo `.feature` |
| `Scenario` | Un caso de prueba concreto |
| `Given` | Precondición: el estado en el que arranca el escenario |
| `When` | La acción bajo prueba |
| `Then` | El resultado esperado (la aserción) |
| `And` / `But` | Continúa el bloque anterior; no cambia la semántica |
| **tag** | Etiqueta (`@ui`, `@smoke`) para filtrar qué corre |
| **Step Definition** | La función TypeScript que implementa una línea de Gherkin |

### Cómo está implementado en este repo

- Los `.feature` viven en `features/**` — `cucumber.js` define `paths: ['features/**/*.feature']`.
- Los Steps viven en `features/steps/**` y se cargan vía `import: [...]` en `cucumber.js`, junto con
  `support/world.ts` y `support/hooks.ts`.
- El loader es `ts-node/esm`: **no hay build step**, Cucumber lee TypeScript directo.
- Los formatters son nativos de Cucumber: `progress` + `json:reports/cucumber/cucumber-report.json`
  + `html:reports/cucumber/cucumber-report.html`. No hay código de reporting propio.

### Ejemplo real

`features/sauceDemo/checkout.feature`, primer escenario (verbatim):

```gherkin
@ui @regression
Feature: SauceDemo checkout
  As a shopper on SauceDemo
  I want to complete the purchase of a product
  So that I can validate the end-to-end checkout flow

  @smoke
  Scenario: Complete checkout for a single product
    Given I log in to SauceDemo as "standard_user" with password "secret_sauce"
    When I add "Sauce Labs Backpack" to the cart
    Then the cart badge should show "1"
    ...
```

Y su Step (`features/steps/sauceDemo/checkout.steps.ts`):

```ts
When('I add {string} to the cart', async function (this: CustomWorld, productName: string) {
  await this.pages.sauceDemoInventory.addProductToCart(productName);
});
```

Una línea. Eso es exactamente lo que debe ser un Step: **traducción, no implementación.**

> `standard_user` / `secret_sauce` son las **credenciales públicas de demo** que el propio SauceDemo
> publica en su pantalla de login. No son corporativas ni secretas, y no son un patrón a imitar:
> cualquier credencial real va por configuración, nunca en un Feature.

### Tags y su impacto real en los scripts

| Tag | Dónde está | Qué significa |
|---|---|---|
| `@ui` | nivel Feature | El escenario maneja browser |
| `@regression` | nivel Feature | Parte del set amplio |
| `@smoke` | primer Scenario | El subconjunto crítico y rápido |
| `@db` | *no se usa hoy* | Requiere base de datos real |

Cómo los consumen los scripts de `package.json` (literal):

```jsonc
"test":            "cucumber-js --config cucumber.js --tags \"not @db\"",
"test:ui":         "cucumber-js --config cucumber.js --tags \"@ui and not @db\"",
"test:smoke":      "cucumber-js --config cucumber.js --tags \"@smoke and not @db\"",
"test:regression": "cucumber-js --config cucumber.js --tags \"@regression and not @db\"",
"test:db":         "cucumber-js --config cucumber.js --tags \"@db\""
```

Detalle importante y honesto: **`npm run test:db` corre 0 escenarios hoy**, porque no existe ningún
`.feature` taggeado `@db`. Está documentado así en tres lugares del repo; no es un test roto.

El invariante `A7` obliga a que **todo `.feature` tenga al menos un tag**. Sin tag, el archivo
quedaría fuera de todos los filtros y sería un test invisible.

### Qué NO debe contener un Step

Prohibido por ESLint (`G5`), no por convención:

```ts
// ❌ todo esto falla el build
await this.page.click('#login');              // this.page
import { chromium } from 'playwright';        // import de Playwright
import { SauceDemoLoginPage } from '...';     // import de una Page
await this.page.waitForTimeout(2000);         // espera fija
const url = process.env.BASE_URL;             // process.env
await client.execute('SELECT ...');           // capa database
```

Y prohibido por **contrato** (no lo detecta ninguna regla — §15):

```ts
// ❌ pasa el gate en verde, y aun así está mal
await this.pages.sauceDemoLogin.goto('https://www.saucedemo.com/');
```

### Cómo lo explicaría en una entrevista

> "Usamos Cucumber con Gherkin para que el escenario sea legible por negocio, pero la disciplina
> importante no es escribir Gherkin lindo: es que el Step sea una sola línea que delega en un Page
> Object. En este repo eso está forzado por ESLint — un Step que toca `this.page` o importa
> Playwright no compila el gate."

### Preguntas que podrían hacerme

**"¿BDD sirve si negocio no lee los tests?"**
El valor de Gherkin no depende de que negocio lo lea. Aun sin esa audiencia, obliga a separar
*qué* se prueba de *cómo* se prueba, y eso es lo que mantiene los Steps finos. Lo que sí es honesto
decir: si nadie de negocio participa, BDD es una convención de diseño, no una práctica colaborativa.

**"¿Cuándo usarías `Scenario Outline`?"**
Cuando el mismo comportamiento se valida con varios juegos de datos. Hoy este repo no lo usa —
tiene dos escenarios distintos, no uno parametrizado — así que sería una decisión nueva, no una que
ya esté tomada acá.

---

## 4. CustomWorld

### Explicación simple

Cucumber crea **una instancia nueva de un objeto "World" por cada escenario**, y ese objeto es el
`this` dentro de cada Step. `CustomWorld` es nuestra versión: ahí viven el browser, la página y las
Pages de ese escenario.

### Qué problema resuelve

Sin World tendrías que guardar el browser en una variable global o module-level. Eso trae tres
problemas concretos:

1. **Contaminación entre escenarios** — el escenario 2 hereda el estado del 1, y un test que pasa
   solo falla en suite (o al revés).
2. **Imposible paralelizar** — dos workers escribiendo la misma variable global.
3. **Nadie sabe quién es dueño de qué** — cualquier archivo puede pisar el estado.

El World le pone dueño y ciclo de vida al estado: **nace y muere con el escenario.**

### Cómo está implementado

`support/world.ts` — contenido real:

```ts
export class CustomWorld extends World {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  pages!: Pages;
  repositories?: RepositoryContainer;
  testContext: TestContext = {};      // Record<string, unknown>, fresco por escenario

  async init(): Promise<void> { /* lanza browser, crea context y page, arma Pages */ }
  async close(): Promise<void> { /* cierra page, context y browser */ }
}

setWorldConstructor(CustomWorld);
```

| Propiedad | Para qué | Quién la usa |
|---|---|---|
| `browser` | Instancia de browser del escenario | solo `init`/`close` |
| `context` | `BrowserContext` aislado (cookies/storage limpios) | solo `init`/`close` |
| `page` | La pestaña | las Pages; **jamás un Step** |
| `pages` | Contenedor de Page Objects | los Steps |
| `repositories` | Contenedor de Repositories — **opcional** (`?`), solo existe si `DB_ENABLED=true` | los Steps |
| `testContext` | Estado libre para compartir entre Steps del mismo escenario | los Steps |

Dos detalles de diseño que valen oro y son fáciles de perder:

- El import de `RepositoryContainer` es **type-only** (`import type`). Eso mantiene toda la capa de
  base de datos fuera del grafo de ejecución en corridas UI-only.
- El browser se elige por config: `{ chromium, firefox, webkit }[config.browser]`, con
  `headless: config.headless`. Nada de `process.env` acá.

### Ciclo de vida

```text
BeforeAll  ─ una vez por corrida ──→ initDatabaseClient()   (solo si DB_ENABLED=true)
   Before  ─ por escenario ────────→ new CustomWorld() → init() → (repositories si hay client)
      Step ─ Step ─ Step  …                 this === ese CustomWorld
   After   ─ por escenario ────────→ close()  (page → context → browser)
AfterAll   ─ una vez por corrida ──→ closeDatabaseClient()
```

### Ejemplo práctico desde un Step

```ts
When('I add {string} to the cart', async function (this: CustomWorld, productName: string) {
  await this.pages.sauceDemoInventory.addProductToCart(productName);
});
```

`this: CustomWorld` es la anotación de tipo que da autocompletado y chequeo — no cambia el runtime,
Cucumber ya inyecta el World.

### Por qué se diseñó así

El invariante `A5` obliga a que `CustomWorld` declare **solo** `browser`, `context`, `page`, `pages`,
`repositories` y `testContext`. La tentación clásica es agregar `currentUser`, `orderId`,
`selectedProduct`… y en seis meses el World es un objeto de dominio que nadie entiende. Para eso
está `testContext`: estado de negocio libre, en un solo lugar, sin ensuciar el contrato.

### Qué error evita

- Estado global compartido entre escenarios (tests que se pisan).
- Un World por módulo: `A4` verifica que `setWorldConstructor` se llame **exactamente una vez**, y
  solo desde `support/world.ts`.
- Que el World se convierta en un cajón de sastre de negocio (`A5`).

### Cómo lo explicaría en una entrevista

**Respuesta corta:**
> "El World es el contexto por escenario de Cucumber. Ahí guardo browser, context, page y los Page
> Objects, así cada escenario arranca aislado y no uso variables globales."

**Respuesta senior:**
> "El World resuelve ownership y ciclo de vida del estado de test. Cucumber instancia uno por
> escenario, así que es el lugar natural para el aislamiento: browser y `BrowserContext` nuevos,
> sin `storageState` compartido. En este repo además está acotado por un test de arquitectura: el
> World solo puede declarar estado de *infraestructura* — browser, context, page, pages,
> repositories y un `testContext` libre. Estado de negocio va en `testContext`, no como propiedad
> nueva, para que el World no derive en un god object. Y `repositories` es opcional a propósito:
> solo se construye si hay un `DatabaseClient`, de modo que una corrida UI ni siquiera carga el
> driver de Oracle."

### Preguntas que podrían hacerme

**"¿Cómo compartís datos entre Steps?"**
Con `this.testContext`, que es `Record<string, unknown>` y se crea nuevo por escenario. Nunca con
variables de módulo.

**"¿Por qué `browser` está en el World y no compartido entre escenarios?"**
Aislamiento sobre velocidad. Hoy cada escenario levanta su propio browser en `init()`. Compartir
browser y crear solo un `BrowserContext` por escenario sería más rápido y sigue siendo aislado — es
una optimización razonable, pero **no es lo que hace el repo hoy**, y decir lo contrario sería
inventar.

---

## 5. Hooks

### Explicación simple

Los Hooks son las funciones que Cucumber corre **antes y después**, para preparar y limpiar. No son
tests: son el andamiaje.

### Cómo está implementado

`support/hooks.ts`, completo en lo esencial:

```ts
setDefaultTimeout(config.defaultTimeoutMs);          // 120000 ms por defecto

BeforeAll(async () => { await initDatabaseClient(); });

Before(async function (this: CustomWorld) {
  await this.init();
  const client = getDatabaseClient();
  if (client) { this.repositories = new RepositoryContainer(client); }
});

After(async function (this: CustomWorld) { await this.close(); });

AfterAll(async () => {
  try { await closeDatabaseClient(); }
  catch (err) { console.error('Error closing database client:', err); }
});
```

| Hook | Cuándo | Qué hace acá |
|---|---|---|
| `BeforeAll` | una vez, al inicio | Crea el `DatabaseClient` compartido — **solo** si `DB_ENABLED=true` |
| `Before` | antes de cada escenario | `world.init()` (browser → context → page → Pages) y arma `repositories` si hay client |
| `After` | después de cada escenario | `world.close()`: cierra page, context y browser |
| `AfterAll` | una vez, al final | Cierra el `DatabaseClient` |

### Relación con el World

Los Hooks **no guardan estado**: lo crean y lo destruyen en el World. `Before` corre con
`this: CustomWorld` — es el mismo objeto que después recibirán los Steps. Esa es toda la conexión:
Hooks = ciclo de vida, World = estado.

### Qué pasa si el test falla

`After` corre igual — Cucumber ejecuta los hooks de cierre tanto si el escenario pasó como si falló.
Por eso el browser siempre se cierra y no quedan procesos colgados. El escenario se reporta como
fallado; el cierre no lo cambia.

Detalle deliberado en `AfterAll`: el `closeDatabaseClient()` está envuelto en `try/catch` que
**loguea pero no relanza**. Razón, escrita en el propio comentario del archivo: un error cerrando la
conexión no debe poder confundirse con un fallo de test ni alterar el resultado real de la corrida.

### Qué NO debería ponerse en Hooks

- **Lógica de negocio o pasos de test** ("logueame antes de cada escenario"): eso es un `Given`, y
  debe verse en el Gherkin. Un login escondido en un hook hace que el escenario mienta sobre sus
  precondiciones.
- **Reporting propio**: acá lo hacen los formatters nativos de Cucumber (`cucumber.js`). El hook lo
  dice explícitamente.
- **Creación de datos ad hoc para un escenario puntual**: eso pertenece al escenario o a un
  Repository.
- **Manejo de conexiones DB por fuera de `databaseLifecycle.ts`**: ese módulo es el único dueño.

### Qué error evita

El clásico: hooks que crecen hasta ser un segundo framework paralelo, con logins, seteos de datos y
lógica condicional por tag, donde nadie puede leer un escenario y saber en qué estado arranca.

### Cómo lo explicaría en una entrevista

> "Los hooks acá tienen una sola responsabilidad: ciclo de vida. `Before` construye el World —
> browser, context, page y Page Objects — y `After` lo cierra. La conexión a base de datos se crea
> en `BeforeAll` y se cierra en `AfterAll`, y solo si está habilitada por configuración.
> Deliberadamente no hay lógica de test en los hooks: si un escenario necesita estar logueado, eso
> se ve en el `Given`, no escondido en un hook."

---

## 6. Pages Container

### Explicación simple

`Pages` es un objeto que instancia **todas** las Page Objects una vez, y las expone con nombre.
El Step escribe `this.pages.sauceDemoLogin` en vez de construir la Page a mano.

### Cómo está implementado

`src/pageContainer/Pages.ts` — completo:

```ts
export class Pages {
  readonly sauceDemoLogin: SauceDemoLoginPage;
  readonly sauceDemoInventory: SauceDemoInventoryPage;
  readonly sauceDemoCart: SauceDemoCartPage;
  readonly sauceDemoCheckoutInfo: SauceDemoCheckoutInfoPage;
  readonly sauceDemoCheckoutOverview: SauceDemoCheckoutOverviewPage;
  readonly sauceDemoCheckoutComplete: SauceDemoCheckoutCompletePage;

  constructor(page: Page) {
    this.sauceDemoLogin = new SauceDemoLoginPage(page);
    // … las seis, todas con la misma `page`
  }
}
```

Se instancia en un solo lugar: `CustomWorld.init()` hace `this.pages = new Pages(this.page)`.

### ¿Por qué `this.pages` y no `new SauceDemoLoginPage(page)`?

Cuatro razones concretas:

| Razón | Qué pasa sin el container |
|---|---|
| **El Step no necesita `page`** | Para hacer `new SauceDemoLoginPage(page)` el Step necesita `this.page` — que está **prohibido** por `G5`. El container es lo que hace posible esa prohibición |
| **Una instancia por escenario** | Sin container, cada Step crea su propia Page. Funciona, pero se pierde cualquier estado de instancia y se paga construcción repetida |
| **Un solo lugar de cableado** | Agregar una Page = una línea en `Pages.ts`. No hay que tocar Steps existentes |
| **Descubribilidad** | `this.pages.` en el editor lista todas las pantallas disponibles. Es la mejor documentación posible para un QA nuevo |

### Ejemplo real

```ts
// ✅ así se ve en features/steps/sauceDemo/checkout.steps.ts
When('I open the cart', async function (this: CustomWorld) {
  await this.pages.sauceDemoInventory.openCart();
});

// ❌ esto no compila el gate: this.page está prohibido en un Step (G5)
When('I open the cart', async function (this: CustomWorld) {
  const inventory = new SauceDemoInventoryPage(this.page);
  await inventory.openCart();
});
```

### Por qué se diseñó así (trade-off honesto)

El costo es real: **todas** las Pages se construyen en cada escenario, aunque el escenario use una
sola. Con seis Pages cuyo constructor solo arma locators (que en Playwright son objetos perezosos,
no consultas al DOM), el costo es despreciable. Si esto creciera a doscientas Pages, la respuesta
correcta sería lazy getters — no volver a `new Page()` en los Steps.

### Qué error evita

Steps que construyen su propia infraestructura, y con eso la necesidad de exponer `this.page`.
Es un caso lindo de diseño: el container no es solo comodidad, es **lo que hace cumplible** la regla
de que un Step nunca vea el `Page` de Playwright.

### Cómo lo explicaría en una entrevista

> "Es un contenedor de composición: instancia todas las Page Objects con la misma `page` y las
> expone por nombre en el World. El beneficio no es solo ergonómico — es lo que permite prohibir
> `this.page` en los Steps, porque si el Step no tiene que construir la Page, no necesita el objeto
> `Page`. Registrar una pantalla nueva es una línea."

---

## 7. Page Object Model

### Explicación simple

Un **Page Object** es una clase que representa una pantalla. Encapsula *dónde están* los elementos
(locators) y *qué se puede hacer* ahí (acciones y validaciones), para que cuando la UI cambie haya
un solo archivo que tocar.

### Qué contiene y qué no

| Sí | No |
|---|---|
| Locators de esa pantalla | Locators de otra pantalla |
| Acciones semánticas (`login`, `addProductToCart`, `finish`) | Métodos técnicos sin sentido de negocio (`clickButton3`) |
| Validaciones de esa pantalla (`expectCartBadgeCount`) | Aserciones de negocio que corresponden a otra capa |
| Lectura de config vía `requireSauceDemoBaseUrl()` | `process.env` directo (prohibido por `G3`) |
| `extends BasePage` | `extends` de otra Page; herencia entre Pages |

### Locators: las dos formas, y solo dos

**Estático** → propiedad `private readonly`, construida en el constructor:

```ts
// src/pages/sauceDemo/SauceDemoLoginPage.ts
private readonly usernameInput: Locator;

constructor(page: Page) {
  super(page);
  this.usernameInput = page.getByRole('textbox', { name: 'Username' });
}
```

**Parametrizado** (depende de un valor de runtime) → método privado *factory* que retorna `Locator`:

```ts
// src/pages/sauceDemo/SauceDemoInventoryPage.ts
private productCard(productName: string): Locator {
  return this.page
    .locator('[data-test="inventory-item"]')
    .filter({ has: this.page.getByRole('link', { name: productName, exact: true }) });
}

private addToCartButton(productName: string): Locator {
  return this.productCard(productName).getByRole('button', { name: 'Add to cart' });
}
```

La regla que las une: **las acciones consumen locators, nunca los construyen inline.**

```ts
// ✅
async addProductToCart(productName: string): Promise<void> {
  await this.click(this.addToCartButton(productName));
}

// ❌ locator armado dentro de la acción
async addProductToCart(productName: string): Promise<void> {
  await this.page.locator(`.inventory_item:has-text("${productName}") button`).click();
}
```

### Acciones semánticas y validaciones

Las seis Pages de SauceDemo muestran el patrón completo:

| Page | Acciones | Validaciones |
|---|---|---|
| `SauceDemoLoginPage` | `open()`, `login(u, p)` | — |
| `SauceDemoInventoryPage` | `addProductToCart(name)`, `openCart()` | `expectCartBadgeCount(count)` |
| `SauceDemoCartPage` | `proceedToCheckout()` | `expectProductVisible(name)` |
| `SauceDemoCheckoutInfoPage` | `fillBuyerInfo(f, l, zip)`, `continueToOverview()` | `expectOnCheckoutInformationForm()`, `expectErrorMessage(text)` |
| `SauceDemoCheckoutOverviewPage` | `finish()` | `expectProductVisible(name)`, `expectPriceSummaryPresent()` |
| `SauceDemoCheckoutCompletePage` | — | `expectConfirmationMessage(text)` |

Sí, las aserciones viven dentro de la Page. Es una decisión con trade-off:

- **A favor:** el Step queda de una línea y la aserción usa los locators privados de la Page, que es
  la única que debería conocerlos.
- **En contra:** mezcla "objeto de página" con "objeto de aserción", y un purista los separaría.
- **Por qué se eligió:** la alternativa obliga a exponer locators públicamente (peor) o a duplicar
  selectores en el Step (mucho peor).

### Estrategia de selectores, verificable en el repo

Prioridad: **semántica accesible primero**, `data-test` cuando no hay semántica.

```ts
page.getByRole('textbox', { name: 'Username' })       // ✅ preferido
page.getByRole('button', { name: 'Finish' })          // ✅
page.locator('[data-test="shopping-cart-badge"]')     // ✅ justificado: sin rol/nombre accesible
```

Los comentarios de cada Page documentan **por qué** se eligió cada uno, con la evidencia de
observación por MCP. Por ejemplo, en `SauceDemoInventoryPage`: el badge del carrito *"has no
accessible role/name at all when the cart is empty, so it is targeted via `data-test`"*. Eso es
trazabilidad de decisión, no adorno.

### Qué error evita

- Un cambio de UI que obliga a tocar cuarenta Steps.
- Selectores CSS frágiles acoplados a estructura (`div > div:nth-child(3)`).
- Locators duplicados en varios archivos, que se arreglan en uno y quedan rotos en otro.

### Cómo lo explicaría en una entrevista

> "Cada pantalla real es una Page que extiende `BasePage`. Los locators estáticos son campos
> `private readonly` armados en el constructor; los que dependen de un dato son factories privados
> que devuelven `Locator`. Las acciones consumen esos locators y nunca los construyen inline.
> Priorizo `getByRole` con nombre accesible, y uso `data-test` solo cuando el elemento no tiene
> semántica — y dejo escrito por qué."

### Preguntas que podrían hacerme

**"¿Aserciones dentro del Page Object o en el Step?"**
Acá adentro de la Page, para que el Step quede fino y no haya que exponer locators. Es un trade-off
consciente: se gana encapsulamiento y se pierde pureza de responsabilidad. Lo que no haría nunca es
la tercera opción — locators públicos consumidos por el Step.

**"¿Cómo manejás un elemento que aparece en varias pantallas?"**
Ese es el caso de uso de un Component (§8). Hoy no existe ninguno en el repo porque el flujo
canónico no tiene una región así, y no se crea uno solo para tener un ejemplo.
---

## 8. BaseUiObject / BasePage / BaseComponent

> Esta sección es el corazón del diseño UI. Si tuvieras que explicar una sola cosa del repo en una
> entrevista, elegí esta.

### La jerarquía, visualmente

```text
                    BaseUiObject                 src/base/BaseUiObject.ts
                    protected page: Page
                    17 métodos sobre Locator
                    (esperas · acciones · getters · asserts)
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
         BasePage                    BaseComponent        src/pages/base/BasePage.ts
         + goto()                    + protected root     src/components/base/BaseComponent.ts
         + reload()                    : Locator
         + waitForUrlContains()
              │                           │
              ▼                           ▼
    src/pages/**  (6 Pages)      src/components/**  (0 Components concretos hoy)
```

Lo clave: **es un árbol, no una cadena.** `BaseComponent` no hereda de `BasePage`. Esa decisión es
la sección entera.

### BaseUiObject

**Dónde:** `src/base/BaseUiObject.ts` — fuera de `pages/` y de `components/`, a propósito. Si viviera
dentro de uno de los dos, el otro dependería de un directorio ajeno, y la jerarquía diría que un
Component "es una especie de Page". Vive arriba porque es de los dos por igual.

**Qué comparte** (los 17 métodos reales, todos operando sobre un `Locator` recibido por parámetro):

| Grupo | Métodos |
|---|---|
| Esperas | `waitForVisible`, `waitForHidden`, `waitForEnabled` |
| Acciones | `click`, `fill`, `clear`, `check`, `uncheck`, `pressEnter`, `clearAndFill` |
| Getters | `getText`, `getInputValue` |
| Validaciones | `expectText`, `expectContainsText`, `expectValue`, `expectChecked`, `expectNotChecked` |

Detalle de diseño: las acciones esperan antes de actuar.

```ts
async click(locator: Locator) {
  await this.waitForVisible(locator);   // expect(locator).toBeVisible()
  await locator.click();
}
```

Eso significa que **el usuario del framework nunca escribe una espera manual**, y por eso
`waitForTimeout` puede prohibirse sin dejar a nadie sin salida (§13).

También es dueño de `protected readonly page: Page`. `protected` es intencional: las subclases lo
usan; nadie desde afuera.

### BasePage

**Dónde:** `src/pages/base/BasePage.ts`. **Qué agrega** — solo tres métodos, los de página completa:

```ts
async goto(url: string)              { await this.page.goto(url); }
async reload()                       { await this.page.reload(); }
async waitForUrlContains(text: string) { await expect(this.page).toHaveURL(new RegExp(text)); }
```

**Por qué solo una Page navega:** navegar es una operación sobre *toda la pestaña*. Un Component es
un pedazo de pantalla; si un modal pudiera hacer `goto()`, se rompería la premisa de que el
Component vive dentro de su propio `root`. Acá la restricción la impone el **sistema de tipos**: un
Component no tiene esos métodos porque no los hereda. No hace falta una regla de lint — no compila.

> **Límite honesto (F-18):** esos tres métodos son **públicos**, así que un Step puede alcanzarlos
> vía `this.pages.<page>.goto(...)`. Ningún guardrail lo bloquea. La prohibición existe (`CLAUDE.md`
> §4.1) pero es contractual, y la vigila el review — ver §15.

### BaseComponent

**Dónde:** `src/components/base/BaseComponent.ts`. **Qué agrega:** exactamente una cosa.

```ts
export class BaseComponent extends BaseUiObject {
  protected readonly root: Locator;
  constructor(page: Page, root: Locator) { super(page); this.root = root; }
}
```

`root` es el **scope**: todos los locators del Component se construyen desde `this.root`, nunca desde
`this.page`. Así dos instancias del mismo Component en la misma pantalla no se pisan, y un
`getByRole('button', { name: 'Delete' })` dentro de una fila encuentra *el de esa fila*.

Eso está verificado por máquina: `A11` falla si una clase bajo `src/components/**` accede a
`this.page`.

> **Límite honesto (F-15):** `A11` solo detecta `this.page`. Un Component podría construir un locator
> page-wide desde el **parámetro local `page`** del constructor y escaparse. La regla es: el
> parámetro `page` se usa **solo** para `super(page, root)`.

### Por qué NO existe ningún Component concreto hoy

Es una decisión, no un olvido, y está documentada igual en cinco lugares del repo. El flujo canónico
(checkout de SauceDemo) no tiene una región de UI reutilizable que justifique uno: cada pantalla se
maneja bien con su Page.

Ejemplos **hipotéticos** válidos, que **no existen en este repositorio**:

```text
HeaderComponent      → barra superior repetida en todas las pantallas
SidebarComponent     → menú lateral con navegación
ProductCardComponent → tarjeta que se repite N veces en la misma grilla
ConfirmModalComponent→ modal reutilizado por varias acciones
```

El principio: **no crear una abstracción antes de que exista una responsabilidad reutilizable real.**
Un Component creado "para tener un ejemplo" es deuda: hay que mantenerlo, documentarlo y explicarlo,
y no resuelve ningún problema. `BaseComponent` sigue siendo el contrato vigente y los guardrails
`A10`/`A11` ya están activos — simplemente hoy filtran sobre cero archivos y encuentran cero
violaciones. El día que exista una región real, el patrón ya está listo.

### Qué error evita esta jerarquía

| Anti-pattern | Qué pasa | Cómo lo evita este diseño |
|---|---|---|
| `Component extends BasePage` | Un modal puede navegar y romper la pantalla | `A10`: falla el build |
| `Page extends OtraPage` | Herencia frágil entre pantallas | `A9`: toda Page extiende `BasePage`, no otra Page |
| Component que usa `this.page` | Locator page-wide, se rompe con dos instancias | `A11`: falla el build |
| Duplicar `click`/`fill` en cada Page | Cuarenta variantes de "esperar y hacer click" | `BaseUiObject` centraliza los 17 métodos |

### Cómo lo explicaría en una entrevista

**Pregunta: "¿Por qué separaste `BasePage` de `BaseComponent`?"**

**Respuesta corta:**
> "Porque comparten capacidades de UI pero no comparten alcance. Las acciones y esperas son iguales
> para los dos, así que viven en una clase común, `BaseUiObject`. Lo que los distingue es que una
> Page representa la pantalla entera y puede navegar, y un Component representa una región y está
> confinado a su `root`."

**Respuesta senior:**
> "Es una jerarquía en árbol, no en cadena, y la forma del árbol codifica una regla de arquitectura.
> `BaseUiObject` tiene lo genérico sobre `Locator` — esperas, acciones, getters, asserts — y vive
> fuera de `pages/` y `components/` para no darle jerarquía a ninguno de los dos. `BasePage` agrega
> lo único que es intrínsecamente de página completa: `goto`, `reload` y aserción de URL.
> `BaseComponent` agrega `root`, que es el scope del que salen todos sus locators.
>
> El beneficio concreto es que 'un Component no navega' deja de ser un comentario y pasa a ser el
> sistema de tipos: el método no existe en esa rama. Si hubiera hecho `BaseComponent extends
> BasePage` por comodidad, habría heredado navegación y tendría que prohibirla con una convención.
> Además hay tests de arquitectura que verifican la jerarquía sobre el repo entero, así que tampoco
> se puede romper por accidente.
>
> Y hoy no hay ningún Component concreto: el flujo canónico no tiene una región reutilizable real, y
> preferí no inventar una abstracción sin consumidor. El contrato y los guardrails están, listos
> para el primer caso legítimo."

### Preguntas que podrían hacerme

**"¿Y si necesito navegar desde un Component?"**
Es la señal de que no era un Component. Si esa región dispara un cambio de pantalla, la navegación
la coordina la Page que lo compone; el Component expone un método de intención (`submit()`), y la
Page decide qué sigue.

**"¿Por qué composición y no herencia para los Components?"**
Porque una Page *tiene* un header, no *es* un header. Con composición una Page puede tener varios
Components y un mismo Component puede vivir en varias Pages. Con herencia, ninguna de las dos cosas.

---

## 9. Configuración

### Explicación simple

Toda la configuración entra por **variables de entorno**, y hay **un único archivo** autorizado a
leerlas: `src/config/index.ts`. El resto del código importa un objeto `config` ya tipado y validado.

### Cómo está implementado

```text
.env  (local, git-ignored)          ─┐
variables de entorno del sistema     ├─→  src/config/index.ts  ─→  export const config
CI: env: del workflow               ─┘         (dotenv + validación)      export requireSauceDemoBaseUrl()
```

`src/config/index.ts` hace tres cosas, en orden:

1. `dotenv.config()` — carga `.env` si existe.
2. Parsea y **valida** cada variable con helpers propios: `optionalEnv`, `parseBoolean`,
   `parsePositiveInteger`, `parseBrowser`, `validateDatabaseConfig`.
3. Exporta un objeto `config: AppConfig` congelado en su forma, más `requireSauceDemoBaseUrl()`.

Si una variable está mal, **falla al importar** con un mensaje claro — no a mitad de un test:

```text
BROWSER must be one of: chromium, firefox, webkit.
DEFAULT_TIMEOUT_MS must be a positive integer.
DB_ENABLED=true requires: DB_USER, DB_PASSWORD, DB_CONNECT_STRING.
```

### Las variables reales (las nueve, sin inventar ninguna)

| Variable | Default | Qué hace |
|---|---|---|
| `SAUCEDEMO_BASE_URL` | `https://www.saucedemo.com` | URL base del ejemplo canónico de UI |
| `HEADLESS` | `true` | Browser sin ventana. Solo acepta `"true"` / `"false"` |
| `BROWSER` | `chromium` | Uno de `chromium` \| `firefox` \| `webkit` |
| `DEFAULT_TIMEOUT_MS` | `120000` | Timeout de Cucumber (`setDefaultTimeout` en hooks) |
| `DB_ENABLED` | `false` | Interruptor maestro de la capa de base de datos |
| `DB_USER` | — | Requerido **solo si** `DB_ENABLED=true` |
| `DB_PASSWORD` | — | Requerido **solo si** `DB_ENABLED=true` |
| `DB_CONNECT_STRING` | — | Requerido **solo si** `DB_ENABLED=true` |
| `ORACLE_CLIENT_LIB_DIR` | — | Opcional: directorio del Instant Client (modo thick) |

Todas están en `.env.example` (sin valores reales) y las cuatro relevantes están declaradas
explícitamente en el `env:` de `ci.yml`.

**El default público importa:** `sauceDemoBaseUrl` tiene su valor por defecto **en el código**, así
que un clone nuevo corre `npm test` sin crear ningún `.env`. Fricción de primer arranque: cero.

### Por qué `process.env` está centralizado

| Sin centralizar | Con `src/config/index.ts` |
|---|---|
| `process.env.TIMEOUT` esparcido en 20 archivos | Un solo punto de lectura |
| `undefined` que revienta a mitad de un test | Falla al importar, con mensaje explícito |
| `string \| undefined` en todos lados | `AppConfig` tipado: `headless: boolean`, `browser: BrowserName` |
| Nadie sabe qué variables existen | La lista es el archivo, y está en `.env.example` |
| Un typo (`HEADLES`) pasa silencioso | El default aplica y el resto está validado |

Esto está **verificado por máquina**: la regla `G3` de ESLint prohíbe `process.env` en todo `.ts`
excepto `src/config/**` y `**/*.test.ts`, y cubre `process.env.X`, `process.env['X']`,
`const env = process.env` y el destructuring `const { env } = process`.

> Límite conocido (`F-13`): aliasear `process` mismo (`const p = process; p.env.X`) escapa a la
> regla. Documentado, no explotable por accidente.

### Por qué una Page NO debe leer `process.env`

Tres razones, en orden de importancia:

1. **Testeabilidad:** una Page que lee entorno no se puede razonar sin saber el entorno.
2. **Ownership:** si cinco archivos leen `BASE_URL`, cambiar el nombre de la variable es una
   cacería. Con un dueño, es una línea.
3. **Validación:** `config` ya validó. Una Page que lee `process.env` reintroduce `undefined`.

Ejemplo real de la forma correcta:

```ts
// src/pages/sauceDemo/SauceDemoLoginPage.ts
import { requireSauceDemoBaseUrl } from '../../config/index.js';

async open(): Promise<void> {
  await this.goto(requireSauceDemoBaseUrl());
}
```

### Qué error evita

Un test que falla en CI y pasa local porque alguien leyó una variable que en CI no existía, y el
error apareció tres capas más abajo como `TypeError: Cannot read property of undefined`.

### Cómo lo explicaría en una entrevista

> "Configuración por variables de entorno, con un único módulo dueño que las lee, las valida y
> exporta un objeto tipado. Todo lo demás importa ese objeto. Está forzado por ESLint: `process.env`
> fuera de `src/config/**` falla el lint. El efecto práctico es que un error de configuración
> aparece como un mensaje claro al arrancar, y no como un `undefined` a mitad de un escenario."

### Preguntas que podrían hacerme

**"¿Cómo manejarías múltiples ambientes (dev/staging/prod)?"**
Hoy el repo lee variables planas una sola vez, al importar — **no** hay matriz de ambientes con
perfiles nombrados, y está listado como limitación. La extensión natural sería un perfil por
`ENV_NAME` resuelto dentro del mismo `src/config/index.ts`, sin cambiar a los consumidores.

**"¿Dónde pondrías un secreto real?"**
Nunca en el repo. En CI, como secret del proveedor, inyectado como variable de entorno. En este repo
CI no tiene ni un secreto: las cuatro variables del workflow son públicas.

---

## 10. Database Layer

### Explicación simple

Una capa opcional para que un test pueda **validar contra la base de datos** lo que vio en la UI, sin
que un Step escriba SQL nunca.

### La arquitectura, con paths reales

```text
Step  (features/steps/**)
  └─ this.repositories                    ← CustomWorld
       └─ RepositoryContainer             src/database/RepositoryContainer.ts
            └─ ExampleRepository          src/database/repositories/example/ExampleRepository.ts
                 └─ BaseRepository        src/database/repositories/BaseRepository.ts
                      └─ QueryBuilder     src/database/builders/QueryBuilder.ts
                           └─ DatabaseClient        src/database/clients/DatabaseClient.ts   (interfaz)
                                └─ OracleDatabaseClient  src/database/clients/OracleDatabaseClient.ts
                                     └─ oracledb
```

### Responsabilidad de cada pieza

| Pieza | Responsabilidad | Detalle real |
|---|---|---|
| `RepositoryContainer` | Composición | Recibe un `DatabaseClient` ya construido y arma los repositories. Hoy expone `example` |
| Repository concreto | Lenguaje de dominio | Métodos como `findById(id)`; **acá vive el SQL** y la allowlist de columnas |
| `BaseRepository` | Acceso protegido al client | `execute`, `select`, `insert`, `update`, `delete`, `executeProcedure` — todos `protected` |
| `QueryBuilder` | Construcción segura de SQL | `buildWhere`, `buildOrderBy`, `buildOraclePagination`, `buildInsert`, `buildUpdate` (estáticos) |
| `DatabaseClient` | Contrato agnóstico | Solo `execute(...)` y `close()`. **No** depende de `oracledb` |
| `OracleDatabaseClient` | Única implementación real | El **único** archivo del repo que puede tocar `oracledb` |

Dos detalles que muestran la calidad del diseño:

- Los métodos de `BaseRepository` son **`protected`**. Un Step no podría llamar `select()` aunque
  tuviera el repository — no está en la superficie pública. Eso es lo que hace que "no hay SQL en un
  Step" sea estructural y no solo una regla.
- `DatabaseClient` deliberadamente **no** re-exporta `oracledb.ExecuteOptions`; define su propio
  `ExecuteOptions = { autoCommit?: boolean }` para que el contrato siga sirviendo a otro motor.

### Ejemplo real

`ExampleRepository` — el patrón completo en pocas líneas:

```ts
const EXAMPLE_TABLE = 'EXAMPLE_ITEMS';
const EXAMPLE_FIELDS = ['ID', 'NAME', 'STATUS'] as const;   // allowlist, dueño: este archivo

async findById(id: number): Promise<QueryResult<ExampleItem>> {
  const where = QueryBuilder.buildWhere(
    [{ field: 'ID', operator: '=', value: id }],
    EXAMPLE_FIELDS
  );
  return this.select<ExampleItem>(
    `SELECT ID, NAME, STATUS FROM ${EXAMPLE_TABLE} ${where.clause}`,
    where.binds
  );
}
```

Todo lo importante está ahí: el valor viaja por **bind**, el identificador se valida contra una
**allowlist definida en este archivo**, y el método expone lenguaje de dominio (`findById`), no SQL.

### No confundir los dos ejemplos del repo

| Ejemplo | Qué es | Estado |
|---|---|---|
| **SauceDemo** (`features/sauceDemo/**`, `src/pages/sauceDemo/**`) | El **canonical UI example**: flujo real, ejecutable, contra un sitio público | Corre en cada `npm test` |
| **ExampleRepository** (`src/database/repositories/example/**`) | El **ejemplo del patrón de base de datos** | `EXAMPLE_ITEMS` es un contrato de demostración; **no se crea ni se puebla en ninguna base real**, y ningún `.feature` lo usa |

Son ejemplos de cosas distintas y no se mezclan. Decir "el ejemplo del repo" sin aclarar cuál es una
fuente de confusión típica.

### Por qué se diseñó así

El objetivo es que la base de datos sea **opcional de verdad**: el 100% de la suite UI corre sin
Oracle, sin credenciales y sin Instant Client. Y que el día que haga falta, agregar una entidad sea
un archivo nuevo bajo `repositories/` más una línea en el container — sin tocar `BaseRepository` ni
el client.

### Qué error evita

- SQL disperso en Steps, imposible de auditar.
- Acoplamiento al driver: si mañana entra Postgres, se escribe un `PostgresDatabaseClient` y
  `BaseRepository` no se entera.
- Que un test UI cargue el driver de Oracle sin necesitarlo (§12).

### Cómo lo explicaría en una entrevista

> "Repository pattern sobre un contrato `DatabaseClient` agnóstico del motor. El Step llama a un
> repository por su método de dominio; el repository construye la query con `QueryBuilder`, que
> obliga a que los valores vayan por bind y los identificadores contra una allowlist que define el
> propio repository. Los métodos de acceso de `BaseRepository` son `protected`, así que un Step
> estructuralmente no puede ejecutar SQL. Y toda la capa es opcional: con `DB_ENABLED=false` ni
> siquiera se importa el driver."

---

## 11. QueryBuilder y SQL seguro

### El problema que resuelve

Concatenar strings para armar SQL:

```ts
// ❌ SQL injection: si status viene de un dato de test, cualquiera puede cerrar la comilla
const sql = `SELECT * FROM ORDERS WHERE STATUS = '${status}'`;
// status = "x' OR '1'='1"  →  devuelve toda la tabla
// status = "x'; DROP TABLE ORDERS; --"  →  peor
```

En automatización esto se subestima ("son datos de test, no input de usuario"), y es un error: los
datos de test vienen de Features, de CSV, de un ticket. Si el framework permite concatenar, alguien
va a concatenar.

### La solución: dos mecanismos distintos para dos problemas distintos

La distinción clave, que en entrevista separa a un candidato del resto:

| Qué | Se puede parametrizar | Cómo se protege acá |
|---|---|---|
| **Valores** (`WHERE ID = ?`) | **Sí** — es para lo que existen los binds | Siempre bind, sin excepción |
| **Identificadores** (nombres de tabla/columna, `ORDER BY`) | **No** — ningún motor permite bindear un nombre de columna | Regex de forma **+ allowlist** del repository |

Esa asimetría es la razón de ser del `QueryBuilder`.

### Cómo está implementado

**1. Valores → binds.** `buildWhere` genera un nombre de bind por condición:

```ts
const where = QueryBuilder.buildWhere(
  [{ field: 'STATUS', operator: '=', value: status }],
  EXAMPLE_FIELDS
);
// where.clause → "WHERE STATUS = :STATUS_0"
// where.binds  → { STATUS_0: status }
```

Casos especiales resueltos: `IN` genera un bind por elemento (`:F_0_0`, `:F_0_1`, …) y rechaza array
vacío; `BETWEEN` exige exactamente dos valores y genera `:F_0_start` / `:F_0_end`.

**2. Identificadores → doble validación.** `assertAllowedIdentifier` exige las dos cosas:

```ts
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;   // forma válida

function assertAllowedIdentifier(value, allowed, kind) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) throw new QueryBuilderError(...);
  if (!allowed.includes(value)) throw new QueryBuilderError(...);
  return value;
}
```

Nunca *sanitiza* ni reescribe: si el identificador es inválido, **lanza**. Sanitizar es lo que
produce bypasses; rechazar, no.

Y la allowlist **la provee siempre el repository**, nunca el input:

```ts
const EXAMPLE_FIELDS = ['ID', 'NAME', 'STATUS'] as const;   // en ExampleRepository.ts
```

El comentario del propio `QueryBuilder` lo deja escrito: *"never from Scenario data, Step arguments,
or any other runtime/user-controlled input"*.

**3. UPDATE safety.** Tres protecciones verificadas por unit tests:

| Regla | Por qué |
|---|---|
| `buildUpdate` **rechaza** un set de filtros vacío | Evita un `UPDATE` sin `WHERE`, que actualiza la tabla entera |
| `buildInsert` / `buildUpdate` rechazan un set de columnas vacío | Query sin sentido |
| Las columnas del `SET` también pasan por allowlist | Un `SET` es tan inyectable como un `WHERE` |

**4. Paginación.** `buildOraclePagination` rechaza un límite que no sea entero positivo.

Todo esto tiene **31 unit tests** en `src/database/builders/QueryBuilder.test.ts`, y son parte de
`npm run quality`.

### Ejemplo conceptual, lado a lado

```ts
// ❌ el anti-pattern
`SELECT * FROM ${table} WHERE ${field} = '${value}' ORDER BY ${sortField}`

// ✅ el patrón de este repo
const where = QueryBuilder.buildWhere([{ field, operator: '=', value }], ALLOWED_FIELDS);
const order = QueryBuilder.buildOrderBy(sortField, ALLOWED_FIELDS);
return this.select(`SELECT ID, NAME FROM EXAMPLE_ITEMS ${where.clause} ${order}`, where.binds);
//                         ↑ tabla literal en el código, no una variable de entrada
```

### Límites honestos (registrados como L-10)

Dos notas teóricas, **no explotables hoy**:

- `buildUpdate` mergea `{...data, ...whereBinds}`: una columna del `SET` llamada literalmente
  `<FIELD>_<índice>` podría colisionar con el nombre de un bind del `WHERE`.
- `buildOraclePagination` interpola `baseQuery` sin validar — por diseño, porque esa query la provee
  el repository y nunca input externo.

Decirlas en una entrevista suma más que ocultarlas: muestra que conocés los límites de tu propia
defensa.

### Cómo lo explicaría en una entrevista

**Pregunta: "¿Cómo evitás SQL Injection desde tu framework de automatización?"**

**Respuesta corta:**
> "Los valores siempre viajan como bind variables, nunca concatenados. Y como los nombres de tabla y
> columna no se pueden bindear en ningún motor, los valido contra una allowlist que define el propio
> repository en su código, más una regex de forma. Si no está en la lista, lanza excepción."

**Respuesta extendida:**
> "Separo dos problemas que suelen mezclarse. Los valores son parametrizables: para eso existen los
> binds, y el `QueryBuilder` genera un nombre de bind por condición, incluyendo los casos molestos
> como `IN`, que genera un bind por elemento, y `BETWEEN`, que exige exactamente dos.
>
> Los identificadores no son parametrizables por definición, así que ahí la defensa es distinta:
> doble validación, forma —una regex de identificador SQL simple— y pertenencia a una allowlist que
> siempre viene del código del repository, nunca de un Step ni de un Feature. Y nunca sanitizo: un
> identificador inválido lanza, porque los intentos de sanitizar son justamente los que terminan
> teniendo bypasses.
>
> Además hay protecciones de seguridad operativa que no son injection pero sí destructivas: un
> `UPDATE` sin filtros está rechazado explícitamente para que nadie actualice una tabla entera por
> un bug. Todo eso está cubierto por 31 unit tests que corren en el gate de calidad."

### Preguntas que podrían hacerme

**"¿Por qué no usar un ORM?"**
Un ORM resuelve persistencia de una aplicación. Acá se necesita lo contrario: verificación puntual y
explícita de estado, con queries que se leen tal cual. Un ORM agregaría una capa de mapeo y un
modelo que habría que mantener sincronizado con un esquema que no es nuestro.

**"¿Y si necesito un `ORDER BY` dinámico que viene del test?"**
Va por `buildOrderBy` con la allowlist del repository, y solo acepta `ASC`/`DESC`. Si el campo pedido
no está en la lista, lanza. El test tiene que elegir dentro de un conjunto conocido, no proponer un
identificador arbitrario.

---

## 12. DB lifecycle

### Explicación simple

Quién abre la conexión, cuándo, y —lo más interesante— **cómo se garantiza que ni siquiera se cargue
el driver** cuando no hace falta.

### Los dos modos

| | `DB_ENABLED=false` (default) | `DB_ENABLED=true` |
|---|---|---|
| `initDatabaseClient()` | Retorna de inmediato, no crea nada | Importa dinámicamente `OracleDatabaseClient` y lo instancia |
| `getDatabaseClient()` | `undefined` | El client compartido |
| `this.repositories` en el World | **queda `undefined`** (el hook no lo arma) | `new RepositoryContainer(client)` |
| `oracledb` en el proceso | **nunca aparece** en `process.moduleLoadList` | cargado |
| Credenciales | ninguna necesaria | `DB_USER`, `DB_PASSWORD`, `DB_CONNECT_STRING` obligatorias (validado al importar config) |
| `closeDatabaseClient()` | seguro de llamar, no hace nada | cierra el client |

### Cómo está implementado

`support/databaseLifecycle.ts` es el **único dueño** del client compartido. La pieza técnica clave:

```ts
export async function initDatabaseClient(): Promise<void> {
  if (!config.db.enabled) return;                 // ← corta antes de cualquier import
  if (sharedClient) return;

  const { OracleDatabaseClient } = await import('../src/database/clients/OracleDatabaseClient.js');
  //    ↑ import DINÁMICO: solo se evalúa si llegamos hasta acá
  sharedClient = new OracleDatabaseClient({ /* … */ });
}
```

Un `import` estático arriba del archivo se evalúa **siempre**, apenas se carga el módulo. Un
`await import(...)` dentro de un `if` se evalúa **solo si se ejecuta esa línea**. Esa diferencia es
lo que mantiene `oracledb` completamente fuera del proceso en una corrida UI.

El segundo mecanismo que colabora está en `support/world.ts`:

```ts
import type { RepositoryContainer } from '../src/database/RepositoryContainer.js';
//     ↑ type-only: TypeScript lo borra al compilar, no genera import en runtime
```

### Por qué esto importa para tests UI sin base de datos

1. **Fresh clone que arranca:** `npm test` funciona sin `.env`, sin credenciales y sin Oracle
   Instant Client. Verificado en un checkout de solo archivos trackeados.
2. **CI simple y barata:** el workflow corre con `DB_ENABLED=false`; no hay que proveer secretos ni
   levantar una base.
3. **Menos superficie de fallo:** el driver de Oracle es nativo. Si no se carga, no puede fallar por
   una librería de sistema que falta.
4. **Arranque más rápido**, aunque es el beneficio menor.

Los tres primeros son los que hacen que "la base de datos es opcional" sea verdad y no un eslogan.

### Qué error evita

El clásico: un proyecto donde la capa de DB es "opcional" pero el driver se importa en el módulo raíz,
así que todo el mundo necesita Instant Client instalado para correr un test de login.

### Cómo lo explicaría en una entrevista

> "La conexión la maneja un único módulo: se crea en `BeforeAll`, se comparte entre escenarios y se
> cierra en `AfterAll`. Lo que me parece más interesante es cómo está hecho el 'opcional': el client
> de Oracle se carga con un import dinámico dentro del `if` de la feature flag, y el tipo del
> container entra por `import type`. Con la flag apagada, `oracledb` no aparece en la lista de
> módulos cargados del proceso — está verificado. El efecto es que alguien que clona el repo corre
> toda la suite UI sin instalar nada de Oracle."

### Preguntas que podrían hacerme

**"¿Por qué una sola conexión compartida y no una por escenario?"**
Abrir una conexión Oracle es caro. El estado que hay que aislar entre escenarios es el del browser,
no el del client. Por eso el client vive a nivel de corrida (`BeforeAll`/`AfterAll`) y lo que se
construye por escenario es el `RepositoryContainer`, que es barato.

**"¿Qué pasa si falla el cierre de la conexión?"**
Se loguea y no se relanza, a propósito: un error de cierre en `AfterAll` podría confundirse con un
fallo de test y alterar el resultado real de la corrida. Está comentado así en `support/hooks.ts`.
---

## 13. ESLint Guardrails

### Explicación simple

ESLint acá no revisa estilo (de eso se encarga Prettier). Revisa **arquitectura**: cada regla existe
para hacer imposible un error concreto que ya vimos romper proyectos. Son *machine-enforced*: no son
sugerencias, **fallan el build**.

Viven en `eslint.config.js` y corren con `npm run lint`, dentro de `npm run quality`.

### Grupo 1 — Runner paralelo (`G1`, `G7`, `G8`)

**Qué impide:** que exista un segundo runner E2E además de Cucumber.

**Por qué:** dos runners significan dos formas de escribir un test, dos reportes, dos configuraciones
de timeouts y dos verdades sobre qué pasó. Es la forma más rápida de que un framework se parta al
medio. Playwright acá es **librería**; Cucumber es **el** runner.

```ts
// ❌ G1
import { test, expect } from '@playwright/test';
test('login', async ({ page }) => { /* … */ });

// ✅ expect y tipos siguen permitidos — es solo el runner lo prohibido
import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
```

`G7` hace fallar **cualquier** archivo `*.spec.ts`, y `G8` cualquier `playwright.config.*`. No es
que revisen su contenido: el archivo entero es la violación.

### Grupo 2 — Esperas fijas (`G2`)

**Qué impide:** `waitForTimeout(...)` en cualquier `.ts`.

**Por qué:** una espera fija es una apuesta. Dos segundos alcanzan en tu máquina y no en CI; y cuando
falla, la "solución" es subirlo a cinco. Es la causa número uno de suites lentas y flaky.

```ts
// ❌ G2
await this.page.waitForTimeout(2000);
await expect(locator).toBeVisible();

// ✅ esperar la condición observable
await this.waitForVisible(locator);   // BaseUiObject → expect(locator).toBeVisible()
```

Que se pueda prohibir sin dejar a nadie sin salida es mérito de `BaseUiObject`: **cada acción ya
espera** antes de actuar (§8).

### Grupo 3 — Configuración (`G3`)

**Qué impide:** `process.env` fuera de `src/config/**` y `*.test.ts`. Cubre las cuatro formas:
`process.env.X`, `process.env['X']`, `const env = process.env`, `const { env } = process`.

```ts
// ❌ G3, en una Page
await this.goto(process.env.SAUCEDEMO_BASE_URL!);

// ✅
import { requireSauceDemoBaseUrl } from '../../config/index.js';
await this.goto(requireSauceDemoBaseUrl());
```

### Grupo 4 — Acceso al driver (`G4`)

**Qué impide:** importar `oracledb` desde cualquier archivo que no sea
`src/database/clients/OracleDatabaseClient.ts`.

**Por qué:** un solo lugar del repo conoce el driver. Así el contrato `DatabaseClient` sigue siendo
agnóstico y mañana entra otro motor sin tocar repositories. Además `oracledb` no trae tipos, así que
concentrarlo permite aislar el `any` en un único archivo con excepción documentada.

### Grupo 5 — Límites del Step (`G5`)

El grupo más grande, y el que más protege la arquitectura. En `features/steps/**/*.ts` está
prohibido:

| Prohibido | Mensaje que da la regla (resumido) | Alternativa correcta |
|---|---|---|
| `this.page`, `this.context`, `this.browser` | *"Interact through this.pages (Page Objects) instead"* | `this.pages.<page>.<método>()` |
| `import` de `playwright` / `@playwright/test` | Cucumber es el runner; el Step no maneja browser | Delegar en la Page |
| `import` de `src/pages/**`, `src/components/**` | El Step no construye UI | `this.pages` |
| `import` de `src/database/**` | El Step no habla con la base | `this.repositories` |
| `import` de `oracledb` | Solo el client autorizado | — |
| `waitForTimeout(...)` | Espera no determinística | Espera por condición |
| `process.env` | Config tiene un solo dueño | `config` |

Notá algo que se aprende leyendo el archivo: `oracledb` y `waitForTimeout` están **re-declarados**
dentro del override de `features/steps/**`. En flat config, un override **reemplaza** el valor de la
regla en vez de acumularlo, así que si no se re-listan, se pierden justo donde más importan. Está
comentado en el propio `eslint.config.js` — es exactamente el tipo de trampa que un mantenedor
necesita saber.

### Grupo 6 — SQL en un Step (`G6`)

No existe una regla propia. La protección es **estructural**, y es más sólida:

1. `G5` impide importar `src/database/**` desde un Step.
2. Los métodos de acceso de `BaseRepository` (`execute`, `select`, `insert`, `update`, `delete`) son
   **`protected`** — no están en la superficie pública ni siquiera teniendo el repository.

Vale la pena entender esta diferencia: **cuando el diseño hace imposible el error, no hace falta una
regla que lo prohíba.** Una regla es la segunda mejor opción.

### Y una regla de tipos

`@typescript-eslint/no-explicit-any` en **error** para todo `.ts`, con una sola excepción documentada:
`OracleDatabaseClient.ts`, donde el `any` es la frontera deliberada contra un driver sin tipos.

### Qué significa "machine-enforced"

Que no depende de que un reviewer se acuerde. Corre en `npm run quality` y en CI, y falla con un
mensaje que **explica la regla y da la alternativa** — por ejemplo *"Step Definitions cannot access
this.page directly. Interact through this.pages (Page Objects) instead."* Un guardrail que solo dice
"prohibido" enseña menos que uno que dice qué hacer en su lugar.

### Cómo lo explicaría en una entrevista

> "Las convenciones que no fallan el build no se cumplen. Así que las reglas importantes de
> arquitectura están como reglas de ESLint: un Step que toca `this.page` o importa Playwright no
> pasa el gate, `waitForTimeout` está prohibido en todo el repo, `process.env` solo se puede leer en
> el módulo de config, y `oracledb` solo desde el client autorizado. Cada mensaje de error explica
> la alternativa, así que el guardrail enseña en vez de solo bloquear."

---

## 14. Architecture Tests

### Explicación simple

Son **tests de verdad** (corren con `node --test`) que verifican propiedades del **repositorio
entero**: que no exista cierto archivo, que toda clase de cierta carpeta extienda cierta base, que
cierto símbolo se use una sola vez. Viven en `src/architecture.test.ts`.

### Las tres herramientas, y cuándo usar cada una

| Herramienta | Alcance | Responde a | Ejemplo |
|---|---|---|---|
| **Regla ESLint** | Un archivo por vez, mientras se escribe | "¿Este archivo respeta la regla?" | Este Step usa `this.page` |
| **Architecture test** | Todo el repo, como conjunto | "¿El repo mantiene esta propiedad global?" | ¿Existe **algún** `playwright.config.*`? ¿`setWorldConstructor` se llama **una sola vez**? |
| **Unit test** | Una función o clase | "¿Este código hace lo que dice?" | `buildUpdate` rechaza filtros vacíos |

La diferencia que importa: ESLint no puede contar. No puede decir "esta llamada debe existir
exactamente una vez en todo el repositorio", ni "no debe existir ningún archivo con este nombre". Un
architecture test camina el filesystem y parsea el AST de TypeScript, así que sí puede.

### Los invariantes reales

Hay **11 bloques `describe`** en `src/architecture.test.ts`. Son A1–A12 **menos A8**, que no existe
a propósito: la propiedad de `process.env` ya está cubierta por `G3` en ESLint y no se duplica.

| ID | Invariante | Cómo verifica |
|---|---|---|
| `A1` | No existe ningún `playwright.config.*` | filesystem |
| `A2` | No existe ningún `*.spec.ts` | filesystem |
| `A3` | Ningún script de `package.json` invoca `playwright test` | lee `package.json` |
| `A4` | `setWorldConstructor` se llama **exactamente una vez**, solo desde `support/world.ts` | AST, repo completo |
| `A5` | `CustomWorld` declara solo `browser`, `context`, `page`, `pages`, `repositories`, `testContext` | AST (`PropertyDeclaration`) |
| `A6` | `oracledb` solo se referencia desde `OracleDatabaseClient.ts` — cubre `import`, `await import()` y `createRequire` importado por nombre con un hop. Además verifica que la excepción **no esté obsoleta** | AST |
| `A7` | Todo `.feature` tiene al menos un tag | filesystem + regex |
| `A9` | Toda clase bajo `src/pages/**` extiende `BasePage` | AST |
| `A10` | Toda clase bajo `src/components/**` extiende `BaseComponent` | AST |
| `A11` | Ninguna clase bajo `src/components/**` accede a `this.page` | AST, por línea |
| `A12` | Ningún `*.test.ts` vive fuera de `src/**`, `support/**`, `features/**` | filesystem |

No hace falta entender el recorrido AST línea por línea. Sí hace falta entender **qué garantiza cada
uno y qué no**.

### Los cuatro que más vale entender

**`A9`/`A10` — jerarquía UI.** Convierten "toda Page extiende `BasePage`" en algo que no se puede
olvidar. Cuando fallan, nombran archivo, clase y relación ofensora — no dicen solo "falló".

**`A12` — descubrimiento de unit tests.** El más sutil y el más valioso. `test:unit` busca en tres
raíces: `src/**`, `support/**`, `features/**`. Un `*.test.ts` en `scripts/` **nunca correría**, y
peor: nadie se daría cuenta, porque el gate seguiría verde. `A12` hace fallar el build si aparece uno
fuera de las raíces. Traducción: **en este repo no puede existir un test silenciosamente muerto.**

**`A4` — un solo World.** Dos `setWorldConstructor` significan que el segundo pisa al primero y
mitad de tus Steps corren con un World que no esperabas. Cazar eso a mano es horrible.

**`A6` — aislamiento del driver.** No solo mira `import oracledb`: cubre también
`await import('oracledb')` y `createRequire` importado por nombre con un hop de asignación. Y además
verifica que la propia excepción no haya quedado obsoleta.

### Límites conocidos, dichos de frente

Ningún invariante es total, y el repo lo documenta en vez de esconderlo:

- `A5` solo mira `PropertyDeclaration` → getters y *parameter properties* escapan (`F-08`).
- `A4` no ve un `setWorldConstructor` **aliaseado** (`F-07`).
- `A11` solo ve `this.page`, no el parámetro local `page` (`F-15`).
- `A6` no cubre `import nodeModule from 'node:module'` ni namespace imports (`F-16`).
- `A9`/`A10`/`A11` filtran **por path**: una clase UI fuera de `src/pages/**` y `src/components/**`
  no la ve nadie (`F-17` — §15).

El walker ignora: `node_modules`, `.git`, `reports`, `test-results`, `playwright-report`,
`blob-report`, `coverage`, `.cache`, `.vscode`, `.idea`, `docs/refactor-progress/` y cualquier
directorio `.tmp-*`.

### Cómo lo explicaría en una entrevista

> "Además de ESLint hay tests de arquitectura que corren con `node --test` y verifican propiedades
> del repositorio completo, cosas que una regla por archivo no puede expresar: que no exista ningún
> `playwright.config`, que `setWorldConstructor` se llame exactamente una vez, que toda clase bajo
> `src/pages` extienda `BasePage`, y que no exista ningún unit test fuera de las carpetas donde el
> runner los busca — que es mi favorito, porque evita el test muerto que nadie nota. Están escritos
> parseando el AST de TypeScript, y conozco sus límites: cada uno tiene documentado qué forma de
> escape no cubre."

---

## 15. Machine-Enforced vs Review-Enforced

> Si te llevás una sola idea de todo el Playbook, que sea esta.

### La afirmación central

```text
npm run quality  →  PASS  62/62
```

es **NECESARIO** pero **NO SUFICIENTE**.

Más preciso todavía: el gate verde es prueba de corrección **solo dentro del scope explícitamente
medido**. Fuera de ese scope, no dice nada. Está escrito así en `CLAUDE.md` §7.5 y §8.1.

### Por qué el scope es limitado — dos ejes

| Eje | Límite real |
|---|---|
| **Extensión** | ESLint solo mira `.ts` (`F-03`: un `.js` puede tener `process.env` **y** `waitForTimeout` y lintea limpio). `tsc` solo mira `src/**`, `support/**`, `features/**` (`F-10`: un `.ts` en `tools/` con un error de tipos evidente typechequea en verde) |
| **Path** | Los guardrails de UI están **anclados por path**: `A9` filtra a `src/pages/**`, `A10`/`A11` a `src/components/**`, y la lista de imports prohibidos de `G5` nombra `src/pages/**`, `src/components/**` y `src/database/**`. **Nada** restringe una clase UI ubicada en otro lado |

### F-17 — clase UI fuera del path canónico

El caso que hizo falsa una garantía del contrato hasta que se corrigió en T20.1. Reproducido de
verdad, no teorizado:

```ts
// src/screens/RogueScreen.ts   ← path no canónico
export class RogueScreen {                 // no extiende nada
  constructor(private page: Page) {}
  async goto(url: string) { await this.page.goto(url); }
  async clickAnything(selector: string) { await this.page.locator(selector).click(); }
}

// features/steps/adv/rogue.steps.ts
import { RogueScreen } from '../../../src/screens/RogueScreen.js';   // G5 no lo prohíbe
```

Resultado medido: **`npm run quality` → exit 0, 62/62, cero advertencias.** `tsc`, ESLint y los 11
invariantes quedan verdes. Toda la arquitectura UI fue evitada sin tocar un solo archivo protegido.

### F-18 — navegación desde un Step

`goto()`, `reload()` y `waitForUrlContains()` son **públicos** en `BasePage`. Entonces:

```ts
// ❌ pasa el gate en verde
await this.pages.sauceDemoLogin.goto('https://cualquier-cosa.com');
```

Hardcodea una URL, saltea `requireSauceDemoBaseUrl()` e implementa navegación dentro de un Step. Nada
dispara. La regla existe (`CLAUDE.md` §4.1) pero es **contractual**, y la vigila el review.

### El cuadro completo

**MACHINE ENFORCED — garantizado hoy:**

- no se puede introducir un runner paralelo por los scripts del proyecto ni por CI;
- **dentro de `src/pages/**`**, toda clase concreta extiende `BasePage`;
- **dentro de `src/components/**`**, toda clase concreta extiende `BaseComponent` y no usa
  `this.page`;
- un Step no puede tocar `this.page`/`this.context`/`this.browser`, ni importar Playwright / la capa
  DB / `oracledb`, ni usar `waitForTimeout`, ni leer `process.env`;
- no puede existir un test silenciosamente muerto;
- `QueryBuilder` no construye SQL sin binds.

**NOT MACHINE ENFORCED — depende de review:**

- clases UI-like fuera de los paths canónicos (`F-17`);
- patterns o directorios UI nuevos que los guardrails no conocen;
- navegación desde un Step (`F-18`);
- los bypasses documentados `F-03`, `F-06`…`F-16`;
- las convenciones de locators, "Steps finos" y "reutilizar antes de crear".

### Por qué existen Engineer + Reviewer además de los guardrails

Ahora se entiende la capa de IA (§20). Si el gate verde fuera suficiente, alcanzaría con correr
`npm run quality` después de que el agente escriba. No lo es. Entonces:

```text
guardrails  →  cubren el scope medido, automáticamente, siempre
   Gate 2   →  un humano ve el plan ANTES de que se escriba nada
  Reviewer  →  revisa lo que el gate no puede ver, con un checklist que
                nombra F-03, F-06, F-10, F-15, F-16, F-17 y F-18 por ID
```

El checklist del `automation-reviewer` incluye textualmente la instrucción de **no** tratar un
`quality` verde como prueba de que la arquitectura está bien: *"Si tu veredicto se apoya en 'quality
pasó', no revisaste."*

### La lección de diseño, que es lo que se lleva un entrevistador

Un sistema de guardrails maduro no es el que promete cobertura total. Es el que **sabe y publica
dónde termina su cobertura**. Un inventario incompleto es peor que no tener inventario: convierte un
modelo de "limitaciones conocidas" en uno de "falsa seguridad". Eso fue exactamente el finding HIGH
de la auditoría T20, y se corrigió documentando el gap —no fingiendo que no existía.

### Cómo lo explicaría en una entrevista

> "El gate verde es condición necesaria, nunca suficiente, y sé exactamente por qué: el enforcement
> de UI está anclado por path, así que una clase que maneje browser fuera de `src/pages` o
> `src/components` no la ve ningún guardrail; y los métodos de navegación de `BasePage` son públicos,
> así que un Step podría llamarlos. Las dos cosas están documentadas con ID, están en la tabla de
> alcance del README y están en el checklist del reviewer. Prefiero un inventario honesto de lo que
> mis herramientas **no** cubren antes que una promesa de cobertura total, porque la promesa falsa es
> la que hace que nadie revise."

---

## 16. Testing Strategy

### Los dos gates, que son independientes

```text
npm run quality  →  typecheck → lint → format:check → test:unit      (sin browser, sin red)
npm test         →  Cucumber contra un browser real                   (E2E)
```

`npm run quality` **no** ejecuta Cucumber. Son dos verdades separadas y se corren por separado: uno
te dice que el código y la arquitectura están sanos, el otro que la aplicación funciona.

### Tabla de comandos

| Comando | Qué ejecuta | Browser | Tags | Cuándo usarlo | Resultado esperado hoy |
|---|---|---|---|---|---|
| `npm run quality` | `typecheck` + `lint` + `format:check` + `test:unit` | no | — | Antes de cada commit; es la Definition of Done mínima | **62 tests / 23 suites / 0 fail** |
| `npm run typecheck` | `tsc --noEmit` | no | — | Feedback rápido de tipos | — |
| `npm run lint` | `eslint .` | no | — | Verificar guardrails | — |
| `npm run format:check` | `prettier . --check` | no | — | Formato (los `.md` están ignorados) | — |
| `npm run test:unit` | `node --test` sobre las 3 raíces | no | — | Unit + architecture tests | 62 tests |
| `npm test` | Cucumber, `not @db` | sí | `not @db` | El suite por defecto | **2 scenarios / 20 steps** |
| `npm run test:ui` | Cucumber, `@ui and not @db` | sí | `@ui` | Solo UI | **2 scenarios / 20 steps** |
| `npm run test:smoke` | Cucumber, `@smoke and not @db` | sí | `@smoke` | Validación rápida (deploy, PR urgente) | **1 scenario / 12 steps** |
| `npm run test:regression` | Cucumber, `@regression and not @db` | sí | `@regression` | Set amplio | **2 scenarios / 20 steps** |
| `npm run test:db` | Cucumber, `@db` | sí | `@db` | Escenarios con base real | **0 scenarios** — no existe ningún `.feature` `@db` todavía |

Los tres suites que hoy dan el mismo número (`test`, `test:ui`, `test:regression`) coinciden porque
el repo tiene un solo Feature. La separación no es decorativa: es la estructura que hace falta el día
que haya veinte.

### Qué corre el browser y qué no

Un detalle que se pregunta seguido: `test:unit` **no abre browser ni usa red**. Son unit tests puros
(`QueryBuilder`, `config`) y architecture tests (filesystem + AST). Por eso `npm run quality` tarda
segundos y se puede correr en cada cambio.

### La pirámide en este repo, sin marketing

```text
        /\          E2E (Cucumber)         2 scenarios / 20 steps — flujo real de negocio
       /  \
      /────\        Architecture tests     11 invariantes sobre el repo completo
     /      \
    /────────\      Unit tests             QueryBuilder (31) + config
```

Honestidad: **este repositorio es un arquetipo, no un producto**, así que la punta E2E es chica a
propósito — hay un flujo canónico, no una suite de regresión completa. Lo que está desarrollado es la
base sobre la que esa suite se construye.

### Cómo lo explicaría en una entrevista

> "Separo dos gates. `quality` es estático y rápido — tipos, lint de arquitectura, formato y los
> unit/architecture tests, sin browser — y es lo que corro en cada cambio. El E2E es Cucumber contra
> un browser real, filtrado por tags: `smoke` para lo crítico, `regression` para el set amplio, y
> `db` reservado para escenarios que necesiten base, que hoy son cero y está documentado como tal.
> Los dos corren en CI, en ese orden, porque no tiene sentido levantar un browser si el código no
> typechequea."

---

## 17. CI/CD

### Explicación simple

**CI** (Continuous Integration) = cada push corre automáticamente la verificación, para que un
problema aparezca en minutos y no en la demo. **CD** (Continuous Delivery/Deployment) = además,
desplegar automáticamente.

**Este repositorio implementa CI. No implementa CD** — y no tendría por qué: no es una aplicación
desplegable, es un arquetipo de tests. Decirlo con precisión en una entrevista suma; decir "tengo
CI/CD" cuando solo hay CI, resta.

### El pipeline real

`.github/workflows/ci.yml` — "QA Automation CI":

```text
Trigger: push · pull_request · workflow_dispatch (manual)
Runner:  ubuntu-latest   ·   timeout-minutes: 15   ·   permissions: contents: read

  1. Checkout                     actions/checkout@v7
  2. Setup Node                   actions/setup-node@v7 · node-version: '24' · cache: 'npm'
  3. npm ci                       instalación reproducible desde package-lock.json
  4. npx playwright install --with-deps chromium
  5. npm run quality              typecheck + lint + format:check + test:unit
  6. npm test                     E2E, excluye @db
  7. Upload artifact              cucumber-reports (JSON + HTML)
```

### Las decisiones que vale la pena señalar

| Decisión | Por qué |
|---|---|
| `npm ci` y no `npm install` | Instala exactamente el `package-lock.json`. Reproducible; `install` puede mover versiones |
| Solo Chromium | Señal rápida. Firefox/WebKit se validaron a mano pero **no** están en el pipeline — está documentado así |
| `quality` **antes** de `npm test` | Falla barato primero. Si no typechequea, no hace falta levantar un browser |
| `SAUCEDEMO_BASE_URL` explícito en `env:` | El target que CI valida se ve leyendo `ci.yml`, sin depender del default del código |
| `DB_ENABLED: 'false'` | Sin Oracle, sin credenciales, sin Instant Client |
| `permissions: contents: read` | Mínimo privilegio: el workflow no puede escribir en el repo |
| `timeout-minutes: 15` | Un test colgado no consume el runner indefinidamente |
| `if: always()` en el artifact | Los reportes se suben **también cuando el test falla**, que es justo cuando se necesitan |
| `if-no-files-found: ignore` | Si `quality` falló antes de generar reportes, no agrega un segundo fallo sin relación |

**Cero secretos:** las cuatro variables del `env:` son públicas. No hay ni una referencia a
`secrets.`.

### Diferencia CI vs CD, aplicada acá

| | Qué es | En este repo |
|---|---|---|
| **CI** | Integrar y verificar continuamente: build, lint, tests en cada cambio | **Implementado**: `ci.yml` |
| **CD** | Entregar/desplegar automáticamente lo verificado | **No implementado**, y no aplica: no hay artefacto desplegable |

Lo que sí está previsto y **no implementado**: disparo cruzado entre repos vía
`repository_dispatch`/`workflow_dispatch`, para el caso en que la aplicación viva en otro repositorio
y su pipeline quiera lanzar esta suite. Está descrito en el README como extensión, no como feature.

### Cómo lo explicaría en una entrevista

**Pregunta: "¿Cómo integrarías tus tests a CI?"**

> "En este proyecto el workflow corre en cada push y PR sobre ubuntu, con Node 24 y caché de npm.
> El orden importa: primero `npm ci`, después instalo solo Chromium, después el gate estático —
> typecheck, lint, formato y unit/architecture tests — y recién ahí el E2E. Así falla barato: si no
> compila, no gasto tres minutos levantando un browser.
>
> El pipeline corre con la base de datos deshabilitada y con la URL del sitio bajo prueba declarada
> explícitamente en el workflow, así que no hay secretos y cualquiera puede leer `ci.yml` y saber
> contra qué se validó. Los reportes de Cucumber se suben como artifact con `if: always()`, porque el
> reporte que más necesitás es el de la corrida que falló. Y el workflow tiene permisos de solo
> lectura y timeout, que son dos cosas que se olvidan seguido.
>
> Esto es CI, no CD: acá no hay nada que desplegar. Para un caso real donde la aplicación vive en
> otro repositorio, extendería el workflow con `repository_dispatch` para que el deploy de la app
> dispare esta suite."

### Preguntas que podrían hacerme

**"¿Cómo manejarías tests flaky en CI?"**
Primero, no permitiéndolos: `waitForTimeout` está prohibido y toda acción espera por condición
observable, que es la causa raíz más común. Este repo **no** configura reintentos automáticos —
está listado como limitación. Mi postura es que el reintento automático esconde flakiness en vez de
arreglarla; si se usa, tiene que venir con visibilidad de cuántas veces reintentó.

**"¿Correrías el E2E completo en cada PR?"**
Depende del tamaño. La estructura de tags ya está para eso: `@smoke` en cada PR, `@regression`
nocturno o antes de release. Hoy el repo corre todo en cada push porque son 20 steps y tarda
segundos.

---

## 18. SauceDemo — flujo completo

### Por qué SauceDemo es el canonical UI example

| Criterio | Por qué importa |
|---|---|
| Público y gratuito | Cualquiera clona y corre, sin credenciales corporativas |
| Estable | Aplicación de demo pensada para automatizarse; su copy no cambia todos los días |
| Multi-pantalla real | Login → catálogo → carrito → formulario → resumen → confirmación: seis pantallas, un flujo de negocio |
| Tiene camino negativo | La validación de código postal permite un escenario negativo real, no inventado |
| Sin dato sensible | Sus credenciales están publicadas en su propia pantalla de login |

Lo que evita: un ejemplo apuntando a una aplicación interna que nadie de afuera puede correr, o un
ejemplo tan trivial (un solo `goto` + un assert) que no demuestra el patrón.

### El flujo, capa por capa

```text
  @smoke Scenario: Complete checkout for a single product
        │
        ├─ Given I log in to SauceDemo as "standard_user" with password "secret_sauce"
        │     → pages.sauceDemoLogin.open()      → goto(requireSauceDemoBaseUrl())  → config
        │     → pages.sauceDemoLogin.login(u,p)  → fill · fill · click              → BaseUiObject
        │
        ├─ When I add "Sauce Labs Backpack" to the cart
        │     → pages.sauceDemoInventory.addProductToCart(name)
        │       → addToCartButton(name) → productCard(name).getByRole('button', {name:'Add to cart'})
        │                                  ↑ factory parametrizado, scope por tarjeta
        │
        ├─ Then the cart badge should show "1"
        │     → pages.sauceDemoInventory.expectCartBadgeCount("1")  → expectText(cartBadge, "1")
        │
        ├─ When I open the cart          → sauceDemoInventory.openCart()
        ├─ Then I should see … in the cart → sauceDemoCart.expectProductVisible(name)
        ├─ When I proceed to checkout    → sauceDemoCart.proceedToCheckout()
        ├─ And  I fill in the checkout information …
        │     → sauceDemoCheckoutInfo.fillBuyerInfo(first, last, zip)
        ├─ And  I continue to the checkout overview
        │     → sauceDemoCheckoutInfo.continueToOverview()
        ├─ Then I should see … in the checkout overview
        │     → sauceDemoCheckoutOverview.expectProductVisible(name)
        ├─ And  the price summary should be present
        │     → sauceDemoCheckoutOverview.expectPriceSummaryPresent()
        ├─ When I finish the checkout    → sauceDemoCheckoutOverview.finish()
        └─ Then I should see the order confirmation message "Thank you for your order!"
              → sauceDemoCheckoutComplete.expectConfirmationMessage(msg)
```

Seis Pages, una por pantalla real. Ninguna Page conoce a otra: la secuencia la arma el Feature, que
es donde debe estar.

### Las dos rutas

**Happy path** (`@smoke`, 12 steps): compra completa hasta *"Thank you for your order!"*.

**Negative path** (8 steps): código postal vacío.

```gherkin
Scenario: Postal code is required to continue checkout
  …
  And I fill in the checkout information with first name "QA", last name "Automation" and postal code ""
  And I continue to the checkout overview
  Then I should remain on the checkout information form
  And I should see the checkout information error "Error: Postal Code is required"
```

Este escenario es más interesante de lo que parece, y da tema de conversación en una entrevista.
Tiene **dos aserciones complementarias**:

1. `expectOnCheckoutInformationForm()` → `waitForUrlContains('checkout-step-one')` — verifica que
   **no** avanzó.
2. `expectErrorMessage(...)` → verifica el texto exacto del error.

La primera, sola, tendría una debilidad de patrón: el estado esperado es también el estado actual, así
que en una app que navega de forma asíncrona podría pasar por casualidad, antes de que la navegación
ocurra. Se probó de verdad —forzando una navegación real y verificando que la aserción fallara—: falló
correctamente **4 de 4 veces**, porque el `toHaveURL` de Playwright reintenta y SauceDemo navega de
forma síncrona. Queda registrado como precaución de patrón (`T19 R-4`), no como defecto activo. La
segunda aserción, positiva, es la que cierra el caso.

### Cómo se conecta todo

| Capa | Archivo | Rol en este flujo |
|---|---|---|
| Feature | `features/sauceDemo/checkout.feature` | 2 escenarios, tags `@ui @regression` + `@smoke` |
| Steps | `features/steps/sauceDemo/checkout.steps.ts` | 14 steps, **cero** imports de Playwright |
| Pages | `src/pages/sauceDemo/*.ts` | 6 Pages, todas `extends BasePage` |
| Container | `src/pageContainer/Pages.ts` | Las 6 registradas |
| Config | `src/config/index.ts` | `SAUCEDEMO_BASE_URL`, con default público |
| CI | `.github/workflows/ci.yml` | Corre este flujo en cada push |

### ¿Los tests son reales? — la prueba que conviene poder citar

Una suite que no puede fallar no prueba nada. 20 steps en ~1.4 s despierta sospecha legítima. Se
verificó de dos formas:

- **Explicación del tiempo:** SauceDemo es una app cliente; una vez cacheada, cada interacción es
  trabajo local de DOM. Arranque en frío: 4.1 s. En caliente: 1.4 s.
- **Control negativo:** apuntando `SAUCEDEMO_BASE_URL` a una ruta inexistente → **2 escenarios
  fallados, exit 1**, fallando dentro de `SauceDemoLoginPage.login` → `BaseUiObject.fill` →
  `waitForVisible`.

Es decir: el suite maneja un browser real y **falla de verdad** cuando la aplicación está mal. Poder
demostrar eso sobre tu propia suite es una respuesta muy fuerte en una entrevista.
---

## 19. Claude Code Contract

### Explicación simple

`CLAUDE.md` **no es un prompt**. Es un **contrato operativo**: un documento versionado, en la raíz del
repo, que define cómo se trabaja acá — para Claude Code, para cualquier agente derivado y, en la
práctica, también para una persona.

La diferencia importa. Un prompt es una instrucción de una conversación, se pierde y nadie la revisa.
Un contrato vive en el repo, entra por pull request, se versiona con el código y se puede auditar.

### Qué gobierna

| Sección | Qué define |
|---|---|
| §1 | Identidad del framework: Cucumber es el único runner, Playwright es librería |
| §3 | Arquitectura UI, jerarquía de clases y **paths canónicos** |
| §4 / §4.1 | Qué puede y qué no puede hacer un Step, incluida la prohibición de navegar |
| §5 | `src/config/index.ts` como único dueño de `process.env` |
| §6 | Reglas de la capa de base de datos: binds, allowlists, SQL solo en Repository |
| §7 / §7.5 | **Reglas verificadas por máquina** y el alcance real de esa verificación |
| §8 / §8.1 | **Reglas que dependen de review**: el inventario de gaps con ID |
| §9 | Infraestructura protegida, en dos capas (§24) |
| §10 | Workflow de 14 pasos para crear una automatización |
| §11 | Información faltante: `UNKNOWN` / `NEEDS CONFIRMATION`, nunca inventar |
| §12 | **Definition of Done** |
| §13 | Git: qué se puede correr sin autorización y qué no |
| §14 | Scope discipline: un hallazgo lateral se reporta, no se arregla de paso |
| §15 | La experiencia del QA: complejo por dentro, simple por fuera |
| §17 | La capa AI-assisted |

### Las cuatro reglas que más cambian el resultado

**1. "El código es la fuente final de verdad."** Si el contrato y el código se contradicen, gana el
código y hay que **reportar la discrepancia**. Es lo que evita que el documento se vuelva ficción.

**2. Definition of Done (§12).** Una implementación no está terminada hasta que `npm run quality`
pasa y, cuando sea posible, el E2E relevante también. Además: ningún guardrail relajado, ningún
fixture temporal, ningún `TODO` escondiendo comportamiento faltante, ningún cambio fuera del scope
acordado, y `git diff` revisado.

**3. Nunca relajar un guardrail (§9).** Si un guardrail rechaza un cambio, **se arregla el cambio**.
Relajar la regla es decisión de un mantenedor humano, no un atajo. Esta es probablemente la línea más
valiosa del documento: sin ella, el primer error de un agente sería editar `eslint.config.js`.

**4. Scope discipline (§14).** Si aparece un bug distinto, deuda técnica o una mejora: se documenta,
se informa, **no se implementa**. Una tarea, un scope.

### Información faltante (§11)

Si falta una regla de negocio, un estado inicial, un resultado esperado, un usuario, un dato, un
ambiente, una credencial o una validación de DB, no se inventa: se marca `UNKNOWN` /
`NEEDS CONFIRMATION` y se pregunta.

> *"Un selector inventado, una URL inventada o un dato inventado producen un test que miente."*

Un test que miente es peor que no tener test: da confianza falsa.

### Cómo lo explicaría en una entrevista

> "`CLAUDE.md` es un contrato operativo versionado, no un prompt. Define arquitectura, límites por
> capa, qué está verificado por máquina y qué no, qué infraestructura requiere autorización explícita
> para tocarse, y la definition of done. Dos reglas lo sostienen: si el documento y el código se
> contradicen gana el código, y nunca se relaja un guardrail para que pase un cambio. Sirve igual
> para un agente de IA y para alguien que entra al equipo."

---

## 20. AI Agents

### El pipeline

```text
/qa-automate  (skill: el orquestador es la sesión principal, NO un cuarto agente)
      ↓
  qa-analyst                requerimiento → escenarios → UNKNOWNs
      ↓
  GATE 1  (humano)          aprobación de la QA Analysis
      ↓
  automation-engineer  MODE: PLAN        propone; NO escribe nada
      ↓
  GATE 2  (humano)          Approve Plan / Request changes / Cancel
      ↓
  automation-engineer  MODE: IMPLEMENT + marca literal `PLAN APPROVED`
      ↓
  automation-reviewer       review independiente, read-only sobre el repo
```

### Los tres agentes

| | `qa-analyst` | `automation-engineer` | `automation-reviewer` |
|---|---|---|---|
| **Recibe** | El requerimiento tal cual lo dio el usuario | QA Analysis aprobada (+ Plan aprobado y `PLAN APPROVED` en IMPLEMENT) | QA Analysis + Plan + Implementation Report + el working tree |
| **Hace** | Comportamiento esperado, escenarios positivos y negativos, precondiciones, datos, validaciones, riesgos, `UNKNOWN` | PLAN: propone REUSE/CREATE/MODIFY. IMPLEMENT: escribe exactamente eso, corre `quality` + E2E | Relee el árbol, **re-ejecuta** `quality` y E2E él mismo, verifica el checklist de 12 puntos |
| **NO puede** | Escribir código, Gherkin ni locators. Sin write, sin shell, **sin MCP** | Escribir fuera del plan aprobado. Tocar infraestructura protegida sin autorización. `git add/commit/push` | Editar **nada**, ni un typo. Aprobar con findings abiertos |
| **Devuelve** | `# QA Analysis` con `STATE: READY_FOR_AUTOMATION \| NEEDS_CONFIRMATION` | `# Automation Plan` (`PLAN_PROPOSED`) o `# Implementation Report` (`READY_FOR_REVIEW \| VALIDATION_FAILED`) | `# Review Report` con `VERDICT: APPROVED \| CHANGES_REQUESTED` |
| **Write / Shell** | no / no | `Edit`,`Write` / `Bash` | no / `Bash` |
| **MCP** | **0 tools** | **10 tools** | **5 tools** (sin tools de formulario) |

### Por qué el Analyst no tiene MCP

Es la decisión más fina del diseño, y está escrita en su propio contrato:

> *"MCP es para observar **qué pasa**; vos determinás **qué debería pasar**, y esas dos cosas no se
> mezclan."*

Si el Analyst pudiera mirar la aplicación, describiría lo que la aplicación **hace** y lo llamaría
"comportamiento esperado". Eso convierte el análisis en documentación del bug: si la app está mal, el
test la valida mal y pasa en verde. El comportamiento esperado viene del requerimiento y del usuario,
nunca de la observación.

### Por qué el Reviewer tiene MENOS tools que el Engineer

El Reviewer tiene `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_evaluate` y
`browser_close` — **no** tiene `browser_type`, `browser_fill_form` ni `browser_select_option`. Puede
reproducir y observar, no puede completar formularios.

Su contrato le pide que, si no puede validar algo por falta de esas tools, lo diga en `NOT VERIFIED`
en vez de asumir. Y funcionó de verdad: en una prueba controlada, el Reviewer declaró que **no** podía
confirmar el texto de error del login *porque no tiene `browser_type`/`browser_fill_form`*. Un agente
que reconoce su propio límite vale más que uno que rellena el hueco con una suposición.

### Independencia del Reviewer

Es la razón de que exista, y está protegida por tres reglas:

1. Recibe **solo** los tres documentos de handoff más el working tree — **nunca** el transcript ni el
   razonamiento del Engineer.
2. **No acepta** el `EVIDENCE` del Implementation Report: re-ejecuta `quality` y el E2E él mismo.
   *"Un veredicto basado en los exit codes que reportó el Engineer no es una revisión independiente."*
3. Da veredicto explícito en los 12 puntos del checklist — `n/a` es válido, el silencio no.

Esto se validó de forma adversarial: se le entregaron tres documentos que describían trabajo
**inexistente**, con evidencia fabricada (`test:ui — 3 scenarios, 26 steps`). El Reviewer rechazó la
evidencia, la reprodujo él mismo, midió **2 scenarios / 20 steps**, denunció la contradicción, probó
la ausencia de los archivos con `git status`/`git diff`/`git log`, devolvió `CHANGES_REQUESTED` y
**no editó nada**.

### El checklist de 12 puntos, resumido

1. Cobertura del requerimiento · 2. Scope (cada archivo del diff está en el plan) · 3. Steps finos
(incluye `playwright-core` `F-06`, navegación `F-18` e imports UI no canónicos `F-17`) ·
4. Arquitectura Page/Component (incluye `F-15` y clases UI fuera de path `F-17`) · 5. Locators ·
6. Literales sin fuente · 7. Assertions que pueden fallar de verdad · 8. Database (binds, allowlist,
`F-16`) · 9. Duplicación/reuse · 10. Infraestructura protegida intacta · 11. Evidencia reproducida
por él mismo · 12. Sobras (`F-03`, `F-10`, `*.spec.*`, `playwright.config.*`).

### Cómo lo explicaría en una entrevista

> "Tres agentes con responsabilidades separadas y permisos distintos. El analista convierte un
> requerimiento en escenarios y marca lo que falta como bloqueante — no tiene acceso ni de escritura
> ni al browser, a propósito, porque su trabajo es decir qué *debería* pasar, no describir lo que la
> app hace. El engineer es el único que escribe, y trabaja en dos modos: primero propone un plan sin
> tocar nada, y solo implementa después de una aprobación humana explícita. El reviewer es read-only
> sobre el repo, no ve cómo trabajó el engineer, y re-ejecuta la evidencia por su cuenta en vez de
> confiar en el reporte. Lo probamos con un reporte falsificado y lo detectó."

---

## 21. Human Gates

### Explicación simple

Un **gate** es un punto donde el flujo **se detiene** y no sigue hasta que una persona decide.
Hay dos, y están en los dos momentos exactos donde un error sale caro.

```text
qa-analyst  →  ┃ GATE 1 ┃  →  Engineer PLAN  →  ┃ GATE 2 ┃  →  Engineer IMPLEMENT
               ¿el análisis                       ¿el plan                (primera escritura
                es correcto?                       es correcto?            de un archivo)
```

### Gate 1 — Aprobación de la QA Analysis

**Qué se muestra:** `SCOPE`, `SCENARIOS`, `TEST DATA`, `VALIDATIONS`, `RISKS` y cualquier
`UNKNOWN [non-blocking]`, **tal cual los devolvió el agente**, sin resumir ni reinterpretar.

**Qué se decide:** si lo que se va a automatizar es lo correcto.

**Por qué acá:** un error de entendimiento del requerimiento se propaga a todo lo demás. Corregirlo
acá cuesta un mensaje; corregirlo después de implementar cuesta el ciclo entero.

Antes del gate hay un semáforo adicional: si el Analyst devuelve `STATE: NEEDS_CONFIRMATION`, el
flujo **no avanza** — se muestran los `UNKNOWN` y se espera respuesta. No se llega a Gate 1 con un
bloqueante abierto.

### Gate 2 — Aprobación del Automation Plan

**Qué se muestra:** `REUSE`, `CREATE`, `MODIFY`, `PROTECTED INFRASTRUCTURE IMPACT`,
`ARCHITECTURE DEVIATION` y `TESTS TO RUN`.

**Qué se decide:** si la solución propuesta es la correcta — **antes de que se escriba un solo byte**.

**Por qué acá:** es el último punto sin costo. Después de este gate hay archivos en el disco y un
`git diff` que revisar.

Y es el gate donde se ven dos cosas que ningún guardrail puede evaluar: si el agente está
**reutilizando** lo que ya existe en vez de duplicarlo, y si está proponiendo salirse de la
arquitectura canónica (`ARCHITECTURE DEVIATION` — §15).

### Las tres decisiones de Gate 2

| Decisión | Qué pasa |
|---|---|
| **Approve Plan** | Continúa a `MODE: IMPLEMENT`, con el plan **exacto** que el usuario vio. El orquestador **nunca** agrega paths nuevos |
| **Request changes** | Vuelve a `MODE: PLAN` con el feedback como contexto adicional |
| **Cancel** | El flujo termina ahí. No se invoca `MODE: IMPLEMENT` |

### `silence != approval`

La regla más importante de las dos, y está escrita literalmente en el skill:

> *"Nunca asumís una respuesta del usuario por silencio o por inferencia; si no contestó
> explícitamente, el flujo espera."*

Sin esa regla, un agente educado interpreta "ok", "dale", o directamente la ausencia de objeción como
aprobación. Y una aprobación inferida no es una aprobación: nadie miró.

Corolarios, todos explícitos en el contrato:

- El orquestador **nunca** aprueba en nombre del usuario.
- `CHANGES_REQUESTED` **devuelve el control al usuario** — no hay auto-corrección ni loop automático
  Engineer ↔ Reviewer.
- `VALIDATION_FAILED` **detiene** el flujo; no se invoca al Reviewer.
- No hay más de un ciclo Engineer → Reviewer sin que el usuario lo pida cada vez.

### Por qué esto reduce implementaciones incorrectas de IA

Un modelo genera texto plausible. Sobre un requerimiento ambiguo genera una interpretación plausible
—y sigue— porque completar es lo que hace. Los gates atacan eso en tres puntos:

| Riesgo del agente | Contramedida |
|---|---|
| Inventar un dato faltante | `UNKNOWN [blocking]` + el flujo se frena antes de Gate 1 |
| Entender mal el requerimiento | Gate 1 |
| Elegir una solución desproporcionada, o duplicar lo que ya existe | Gate 2 sobre `REUSE`/`CREATE`/`MODIFY` |
| Salirse de la arquitectura | `ARCHITECTURE DEVIATION` declarada en el plan, visible en Gate 2 |
| Tocar infraestructura protegida | `PROTECTED INFRASTRUCTURE IMPACT` + prompt nativo de permisos |
| Auto-aprobar su propio trabajo | Reviewer independiente que re-ejecuta la evidencia |

El costo de un gate es un mensaje. El costo de no tenerlo es descubrir en el `git diff` que se
escribieron ocho archivos que no había que escribir.

### Cómo lo explicaría en una entrevista

> "Dos gates humanos obligatorios: uno sobre el análisis del requerimiento y otro sobre el plan, y el
> segundo está justo antes de la primera escritura de archivo. La regla que los sostiene es que el
> silencio nunca cuenta como aprobación. Además, cuando el reviewer pide cambios, el control vuelve
> al usuario: no hay corrección automática ni loop entre agentes. La idea es que la IA acelere la
> ejecución, no que tome las decisiones de qué probar y cómo."

---

## 22. /qa-automate

### Qué es un Skill

Un **Skill** en Claude Code es un procedimiento versionado en el repositorio
(`.claude/skills/<nombre>/SKILL.md`) que la sesión principal sigue cuando la tarea encaja. No es un
agente ni un script: es la **secuencia determinística** que el orquestador ejecuta.

Y ese es el punto clave de `/qa-automate`: el orquestador **es la sesión principal**, no un cuarto
agente. No existe un "Orchestrator".

### Qué hace

Convierte un pedido en lenguaje natural en el workflow estructurado completo:

```text
Requirement (texto libre del usuario)
    ↓  FASE 1 — Input
qa-analyst                                    FASE 2
    ↓  (si NEEDS_CONFIRMATION → preguntar y volver a analizar)
GATE 1 — el usuario aprueba la QA Analysis
    ↓
automation-engineer  MODE: PLAN               FASE 3
    ↓
GATE 2 — Approve / Request changes / Cancel
    ↓
automation-engineer  MODE: IMPLEMENT          FASE 4
    ↓  quality + E2E ejecutados por el Engineer
    ↓  (VALIDATION_FAILED → frena, no se invoca al Reviewer)
automation-reviewer                           FASE 5
    ↓
APPROVED → reporte final    ·    CHANGES_REQUESTED → control al usuario
```

### Lo importante: **no tenés que escribir un prompt enorme**

Durante el desarrollo del arquetipo (T19) se usaron instrucciones larguísimas y muy detalladas. Eso
era necesario para *construir y validar* el sistema. **Para usarlo, no.** El skill ya contiene la
secuencia, los gates, los formatos de handoff y las reglas de seguridad.

Uso cotidiano real:

```text
/qa-automate

Tengo esta HU.
El objetivo es que un usuario pueda aplicar un cupón de descuento en el carrito.
Te adjunto la documentación funcional: <texto o link pegado>
Casos importantes:
  A. cupón válido → descuenta el 10%
  B. cupón vencido → muestra "Coupon expired"
  C. cupón ya usado → muestra "Coupon already redeemed"
Automatizalo.
```

Con eso alcanza. El skill se encarga de:

1. Pasarle el requerimiento **tal cual** al `qa-analyst` (sin reinterpretarlo).
2. Mostrarte los `UNKNOWN` si falta información — por ejemplo: ¿en qué ambiente?, ¿qué cupón de
   prueba uso?, ¿el texto del error es exactamente ese?
3. Frenar en Gate 1 y mostrarte escenarios, datos y validaciones para que apruebes.
4. Pedirle el plan al Engineer y frenar en Gate 2 con `REUSE`/`CREATE`/`MODIFY`.
5. Recién ahí implementar, correr `quality` y el E2E.
6. Pasarle al Reviewer **solo** los tres documentos, y mostrarte el veredicto.

Lo que **vos** aportás y ningún agente puede inventar: el requerimiento, los datos reales, el
ambiente, y las dos decisiones de los gates.

### Reglas de seguridad que el skill sostiene siempre

- Nunca relaja `CLAUDE.md`, ni modifica agentes, `.claude/settings.json` ni ningún guardrail.
- Nunca aprueba en nombre del usuario, ni asume aprobación por silencio.
- Nunca ejecuta `git add`/`commit`/`push`/`reset`/`clean` ni instala dependencias.
- Nunca salta al Engineer con un `UNKNOWN [blocking]` sin resolver.
- Nunca salta al Reviewer si el Engineer devolvió `VALIDATION_FAILED`.
- Nunca corrige por su cuenta un `CHANGES_REQUESTED` ni arma un loop automático.
- Los handoffs viajan **en la conversación**: no crea archivos temporales para ellos.
- **`npm run quality` verde no sustituye la review** (§15).

### Cómo lo explicaría en una entrevista

> "Es un skill versionado en el repo que orquesta el pipeline completo desde un pedido en lenguaje
> natural. Lo valioso es que la secuencia y los gates están en el repositorio y entran por pull
> request, en vez de vivir en el prompt de cada persona. Yo escribo la historia de usuario y los
> casos importantes; el skill se encarga del resto y me frena en los dos puntos donde tengo que
> decidir."

---

## 23. Playwright MCP

### Qué es MCP

**MCP** (Model Context Protocol) es un protocolo estándar para conectar un modelo con herramientas
externas. Un **servidor MCP** expone un conjunto de "tools" que el agente puede invocar.

### Qué hace Playwright MCP

Expone un browser real como herramientas: navegar, sacar un *snapshot* del árbol de accesibilidad,
hacer click, escribir, evaluar JavaScript, cerrar.

Está declarado en `.mcp.json`, **project-scoped** — versionado con el repo, no configurado por
persona:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@0.0.80"],
      "env": {}
    }
  }
}
```

La versión está **pineada** (`0.0.80`), no `@latest`: una herramienta que cambia de comportamiento
sola no es una herramienta confiable.

### La distinción que hay que tener clara

| | **Playwright del framework** | **Playwright MCP** |
|---|---|---|
| Qué es | La librería `playwright@1.58.0` en `package.json` | Un servidor MCP separado, lanzado por `npx` |
| Quién lo usa | El código de los tests (`CustomWorld`, Pages) | **El agente de IA**, durante una conversación |
| Cuándo corre | En `npm test` / CI | Mientras el agente trabaja, nunca en CI |
| Para qué | **Ejecutar** los tests | **Observar** la aplicación para descubrir roles, nombres accesibles, URLs, comportamiento |
| Deja rastro en el repo | Los tests, los reportes | Nada: `.playwright-mcp/` está git-ignored |

Son dos browsers distintos. El MCP **no reemplaza ni reutiliza** el del framework.

### Ejemplo concreto de para qué sirve

Sin MCP, el agente escribe un locator por deducción a partir de un HTML que nunca vio correr:

```ts
// "seguramente el botón se llama así"
page.getByRole('button', { name: 'Add to Cart' })   // ❌ en SauceDemo es 'Add to cart'
```

Con MCP, navega, saca un snapshot del árbol de accesibilidad y **ve** el nombre accesible real. Por
eso las Pages de este repo tienen comentarios como:

> *"MCP confirmed each product card has `data-test="inventory-item"` (no accessible role/name of its
> own) and contains a `link` with the product's accessible name plus a `button` whose accessible name
> is "Add to cart"…"*

Eso no es decoración: es **trazabilidad de origen** del locator. Y cuando un literal viene de una
observación MCP, se marca explícitamente:

```text
SOURCE: MCP_OBSERVED — navigation "Main" → link "Docs"
```

frente a `SOURCE: REQUIREMENT` (vino del usuario) o `SOURCE: EXISTING_CODE` (ya estaba en el repo).

### El escalonamiento por agente, y su razón

| Agente | Tools MCP | Por qué |
|---|---|---|
| `qa-analyst` | **0** | Debe decir qué *debería* pasar. Si mirara la app, describiría lo que *hace* y validaría el bug (§20) |
| `automation-engineer` | **10** | Es quien escribe locators; necesita ver la UI real en PLAN y en IMPLEMENT |
| `automation-reviewer` | **5** | Reproduce y observa, pero **sin** tools de formulario: si no puede validar algo, lo declara en `NOT VERIFIED` |

Es un caso concreto de **mínimo privilegio** aplicado a agentes: cada uno recibe exactamente lo que su
rol necesita, y ni una tool más.

### Límites que el propio contrato le pone

MCP **nunca** decide una regla de negocio, un escenario, la cobertura, un dato correcto ni la
arquitectura. Eso sale de la QA Analysis aprobada y de `CLAUDE.md`. Y una observación MCP **no** hace
que un locator sea definitivo: sigue sujeto a la misma review de arquitectura y semántica que
cualquier otro literal.

Si el servidor MCP no está disponible, todo el flujo sigue siendo válido sin él.

### Cómo lo explicaría en una entrevista

> "MCP es un protocolo para darle herramientas al modelo. El servidor de Playwright le da un browser
> real, pero para **observar**, no para correr tests: el agente navega la aplicación y saca el árbol
> de accesibilidad, así el locator que escribe está basado en lo que la app realmente renderiza y no
> en una suposición. Está versionado en el repo con la versión pineada, y los permisos están
> escalonados: el analista no tiene MCP a propósito, el engineer lo tiene completo y el reviewer tiene
> un subconjunto sin herramientas de formulario, para que cuando no pueda validar algo lo declare en
> vez de asumirlo."

---

## 24. Infraestructura protegida

### Explicación simple

Hay archivos que si un agente (o alguien apurado) modifica, se rompe la garantía del repo:
`eslint.config.js`, los architecture tests, las clases base, el World, el CI. Están protegidos en
**dos capas distintas**, y la diferencia importa.

### Las dos capas

| Capa | Qué es | Qué la hace fallar |
|---|---|---|
| **native permission ask** | Una regla en `.claude/settings.json` que hace que el harness **levante un prompt de confirmación real** ante un `Edit`/`Write` | El usuario deniega el prompt |
| **contract-only** | No hay regla nativa; la única barrera es `CLAUDE.md` | Nada mecánico: depende de que el agente respete el contrato y de la review |

`.claude/settings.json` declara **20 reglas `ask`** más un `deny`:

```json
{
  "permissions": {
    "ask": [
      "Edit(/src/base/**)", "Edit(/src/pages/base/BasePage.ts)",
      "Edit(/src/components/base/BaseComponent.ts)",
      "Edit(/support/world.ts)", "Edit(/support/hooks.ts)", "Edit(/support/databaseLifecycle.ts)",
      "Edit(/src/database/clients/**)", "Edit(/src/database/builders/**)",
      "Edit(/src/database/repositories/BaseRepository.ts)", "Edit(/src/database/RepositoryContainer.ts)",
      "Edit(/eslint.config.js)", "Edit(/src/architecture.test.ts)",
      "Edit(/tsconfig.json)", "Edit(/cucumber.js)",
      "Edit(/package.json)", "Edit(/package-lock.json)", "Edit(/.github/workflows/**)",
      "Edit(/CLAUDE.md)", "Edit(/.claude/**)", "Edit(/.mcp.json)"
    ],
    "deny": ["Read(/.env)"]
  }
}
```

Dos detalles que se aprenden leyendo esto:

- **`Edit(...)` es la forma correcta y suficiente.** Claude Code consulta reglas `Edit(path)` y
  `Read(path)` para acceso a archivos, y `Edit` cubre también la creación vía `Write`. Una regla
  `Write(...)` sería **aceptada pero nunca consultada** — es decir, daría una sensación de seguridad
  falsa. Por eso no existe ninguna en este archivo.
- **`deny: ["Read(/.env)"]`** es lo único que está prohibido de plano, no consultado: el agente no
  puede leer el archivo con credenciales locales.

Notá que se protege también el **meta-nivel**: `CLAUDE.md` (el contrato), `.claude/**` (los agentes,
el skill y el propio `settings.json`) y `.mcp.json`. Un agente que pudiera editar su propio contrato
no tendría contrato.

### Limitaciones, dichas honestamente

Dos cosas que **no** están verificadas y que sería incorrecto presentar como protección sólida:

**1. `Bash` no está cubierto por una regla `Edit(...)`.** El `automation-engineer` tiene `Bash`. Una
reescritura por shell (`sed -i`, una redirección, `Set-Content`) **no** dispara una regla `Edit`. La
barrera ahí es **contractual**: su prompt le prohíbe explícitamente buscar un rodeo después de una
confirmación denegada. No es mecánica, y decir que "Bash está bloqueado" sería falso.

**2. El patrón con slash inicial nunca se confirmó en runtime.** Nunca se verificó empíricamente que
`Edit(/CLAUDE.md)` dispare efectivamente el prompt. Está abierto desde T13.1 y sigue abierto, porque
cerrarlo requeriría intentar una edición no autorizada de infraestructura protegida — que es
justamente lo que el contrato prohíbe. La lista vale como contrato **aunque** el prompt no aparezca.

Esta honestidad es parte del diseño: el repo prefiere documentar una protección incierta antes que
declararla garantizada.

### Defensa en profundidad

Ninguna capa alcanza sola; el valor está en la suma:

```text
1. CLAUDE.md §9        el agente sabe qué no debe tocar             (contrato)
2. settings.json       el harness pregunta antes de escribir        (mecánico, con los límites de arriba)
3. Automation Plan     PROTECTED INFRASTRUCTURE IMPACT declarado    (visible en Gate 2)
4. Gate 2              el usuario lo aprueba o no                   (humano)
5. Reviewer #10        cualquier cambio ahí es CHANGES_REQUESTED    (review independiente)
```

### Cómo lo explicaría en una entrevista

> "Las clases base, el World, los guardrails, el CI y los propios contratos de los agentes están
> protegidos en dos capas: reglas de permisos que hacen que el harness pregunte antes de escribir, y
> el contrato que el agente lee al arrancar. Y soy explícito sobre los límites: el agente tiene shell,
> así que una reescritura por `sed` no la cubre una regla de edición de archivos — ahí la barrera es
> contractual, y lo digo en la documentación en vez de sobrevender la protección. Sobre eso hay dos
> capas humanas más: el plan declara el impacto en infraestructura protegida y el reviewer rechaza
> automáticamente cualquier cambio ahí sin autorización registrada."

---

## 25. Git workflow

### El flujo recomendado

```text
main
  │
  ├─ git checkout -b feature/<descripción-corta>
  │       ↓
  │   implementar (Feature / Steps / Page / Repository)
  │       ↓
  │   npm run quality          ← Definition of Done, parte 1
  │       ↓
  │   npm test  (o la variante por tag)   ← Definition of Done, parte 2
  │       ↓
  │   git diff  → revisarlo antes de commitear
  │       ↓
  │   commit → push → Pull Request
  │       ↓
  │   CI corre quality + npm test sobre el PR
  │       ↓
  └── merge cuando CI está verde y la review aprobó
```

> `feature/claude-ai-integration` es la rama donde se construyó la Fase 2 de este arquetipo. Es un
> **ejemplo histórico**, no un nombre obligatorio ni una convención impuesta.

El repositorio **no impone un modelo de ramas**: no exige `main`/`develop`/`release`. Se adapta a la
convención del equipo.

### Reglas de git del contrato (§13 de `CLAUDE.md`)

| Claude puede correr libremente | Claude **no** ejecuta sin autorización explícita |
|---|---|
| `git status`, `git diff`, `git diff --stat`, `git log` | `git add`, `git commit`, `git push`, `git reset`, `git clean`, y cualquier operación destructiva |

La razón es simple: el historial es del equipo. Un commit automático que mezcla trabajo del agente con
trabajo de la persona ensucia el historial y el `git blame` para siempre. Leer es gratis; escribir es
del usuario.

### Buenas prácticas específicas de un repo de automatización

- **Un scope por rama.** Un hallazgo lateral se reporta, no se arregla de paso (`CLAUDE.md` §14). Un
  PR que arregla un bug *y* reformatea 30 archivos es irrevisable.
- **`git diff` antes de commitear**, siempre. Es el paso 13 del workflow de §10 del contrato.
- **Nunca commitear `.env`**, `reports/**` ni artefactos MCP. Ya están en `.gitignore`, verificado.
- **No commitear con el gate en rojo.** Si `format:check` falla solo en archivos que no tocaste,
  aislá la etapa antes de "arreglar" código que estaba bien: en Windows suele ser line endings, y el
  repo ya lo resuelve con `.gitattributes` (LF) + `endOfLine: "auto"` de Prettier.

---

## 26. Cómo agregaría una funcionalidad nueva

### El caso genérico, punta a punta

Supongamos una HU nueva: *"como comprador quiero poder eliminar un producto del carrito"*.

```text
1. Requerimiento          leer la HU. ¿Qué comportamiento se espera? ¿Hay caso negativo?
        ↓
2. qa-analyst             escenarios positivos y negativos, precondiciones, datos, validaciones
                          → si falta algo: UNKNOWN [blocking] y se pregunta
        ↓
3. GATE 1                 el usuario aprueba la QA Analysis
        ↓
4. Engineer MODE: PLAN    busca qué YA existe antes de proponer nada:
                            REUSE:  SauceDemoLoginPage, SauceDemoInventoryPage, SauceDemoCartPage
                            CREATE: (¿hace falta algo nuevo?)
                            MODIFY: features/sauceDemo/checkout.feature (o un .feature nuevo)
                                    features/steps/sauceDemo/checkout.steps.ts
                                    src/pages/sauceDemo/SauceDemoCartPage.ts  ← método removeProduct()
                            PROTECTED INFRASTRUCTURE IMPACT: NONE
                            ARCHITECTURE DEVIATION: NONE
        ↓
5. GATE 2                 el usuario aprueba / pide cambios / cancela
        ↓
6. MODE: IMPLEMENT        escribe exactamente esos archivos, ni uno más
        ↓
7. npm run quality        62/62 + los nuevos, si agregaste unit tests
        ↓
8. npm run test:ui        el escenario nuevo corre en verde
        ↓
9. automation-reviewer    12 puntos, evidencia reproducida por él mismo
        ↓
10. git diff → commit → PR → CI
```

### Qué carpetas se tocan normalmente

Para el 90% de las automatizaciones nuevas, **solo estas**:

```text
features/<área>/<nombre>.feature              ← el escenario, con tags
features/steps/<área>/<nombre>.steps.ts       ← los steps, una línea cada uno
src/pages/<área>/<Pantalla>Page.ts            ← si es una pantalla nueva
src/pageContainer/Pages.ts                    ← una línea para registrarla
src/database/repositories/<entidad>/…         ← solo si hace falta validar contra DB
```

Si tu cambio te obliga a abrir `src/base/**`, `support/world.ts` o `src/architecture.test.ts` para
agregar un test, **parate y repensalo**: por defecto, es la solución equivocada (`CLAUDE.md` §15).

### La regla de oro: REUSE antes de CREATE

Es el paso 8 del workflow del contrato, y no es opcional. Antes de crear una Page nueva:

- ¿Existe ya una Page para esa pantalla? → agregale el método.
- ¿Existe ya un step con esa intención? → reusalo.
- ¿Existe ya un Repository para esa entidad? → agregale el método.
- ¿Esta región de UI se repite de verdad en varias pantallas? → recién ahí, un Component.

**Un Page nuevo por pantalla real. Un Component nuevo por región realmente reutilizable. Un
Repository nuevo por entidad realmente necesaria.** Nada por anticipado.

### Cómo lo explicaría en una entrevista

> "Primero convierto el requerimiento en escenarios explícitos, incluyendo los negativos, y marco lo
> que falta en vez de asumirlo. Después reviso qué existe ya en el repo y propongo el conjunto mínimo
> de archivos, separando lo que reuso de lo que creo. Recién con eso aprobado implemento, corro el
> gate de calidad y el E2E, y reviso el diff antes de commitear. Para una automatización típica toco
> cuatro archivos: el feature, los steps, la page y una línea en el contenedor."

---

## 27. Cómo adaptar este arquetipo a una empresa

### La duda real

*"Entro a una empresa que ya tiene un proyecto Playwright andando. ¿Reemplazo todo con esto?"*

**No.** Llegar a un equipo y proponer reescribir su framework en la primera semana es la forma más
rápida de que no te escuchen más — y además suele ser técnicamente incorrecto: un framework en
producción tiene conocimiento acumulado que un arquetipo genérico no tiene.

Lo que sí sirve: traer las **ideas** y dejar que el contexto decida el resto.

### Tres estrategias, de menor a mayor riesgo

**A. Adoptar ideas y guardrails progresivamente** *(bajo riesgo, valor inmediato — el default)*

No se toca la arquitectura. Se agregan verificaciones al proyecto existente, de a una:

1. Prohibir `waitForTimeout` con una regla de ESLint. Es la de mejor relación valor/conflicto: casi
   nadie la defiende, y arregla flakiness real.
2. Centralizar `process.env` en un módulo de config, y prohibirlo en el resto.
3. Un architecture test que verifique la jerarquía que el equipo **ya** usa (no una nueva).
4. Documentar qué está machine-enforced y qué no (§15) — a veces esto solo ya cambia las code reviews.

Ventaja: cada paso es un PR chico, discutible por separado, y no obliga a nadie a reaprender nada.

**B. Refactor incremental** *(riesgo medio, requiere acuerdo del equipo)*

Se adopta la arquitectura del arquetipo **solo en lo nuevo**, y lo viejo se migra cuando se toca:

- Los tests nuevos siguen el patrón (`BasePage`, container, Steps finos).
- Los viejos se migran cuando ya hay que modificarlos por otra razón.
- El guardrail se activa primero como *warning* y se sube a *error* cuando el código ya cumple.

Ventaja: no hay un big bang y el equipo aprende el patrón escribiendo, no leyendo.

**C. Migrar al arquetipo** *(alto riesgo, solo con justificación fuerte)*

Solo si se cumplen varias condiciones a la vez: el framework actual está bloqueando entregas, no hay
tests confiables que perder, el equipo está de acuerdo, y hay tiempo asignado de verdad. Es una
decisión de proyecto, no una decisión técnica individual.

### Criterios para decidir

| Preguntá | Si la respuesta es… | Estrategia |
|---|---|---|
| ¿La suite actual da confianza? | Sí | **A** — no toques lo que funciona |
| | No, es flaky y nadie la mira | B o C |
| ¿Cuántos tests hay? | Cientos, con valor de negocio | A, después B |
| | Pocos y desactualizados | C es viable |
| ¿El equipo pidió mejorar el framework? | Sí | B |
| | No, están conformes | A, y con datos que muestren el problema |
| ¿Hay un runner ya elegido y funcionando? | Sí (ej. Playwright Test) | **A** — la arquitectura de Pages es portable; no cambies el runner por preferencia |
| ¿Hay presión de entrega alta? | Sí | A solamente |
| ¿Podés medir el problema (flakiness, tiempo de mantenimiento)? | Sí | Empezá por ahí: los datos convencen, las opiniones no |

### Lo que **siempre** es portable, sin importar el stack

Estas ideas no dependen de Cucumber ni de este repo:

- Los locators viven en una capa de página, nunca en el test.
- Configuración con un solo dueño y validada al arrancar.
- Nada de esperas fijas; siempre esperar por condición observable.
- Valores por bind; identificadores por allowlist.
- Las convenciones importantes se verifican por máquina, no por memoria del reviewer.
- Documentar **qué no cubren** tus verificaciones.

### Cómo lo explicaría en una entrevista

> "No llegaría proponiendo reemplazar el framework. Empezaría por medir dónde duele —flakiness,
> tiempo de mantenimiento, tests que nadie mira— y llevaría ideas puntuales que se puedan adoptar de
> a un PR: prohibir esperas fijas por lint, centralizar configuración, un test de arquitectura sobre
> la convención que el equipo ya usa. Si después de eso el equipo quiere ir más lejos, un refactor
> incremental donde lo nuevo sigue el patrón y lo viejo se migra al tocarlo. Migrar todo solo lo
> propondría con el equipo de acuerdo y tiempo asignado; si no, es riesgo puro."
---

## 28. Qué decisiones SDET tomamos

Cada fila es una decisión real del repo, con su costo. **Una decisión sin trade-off declarado no es
una decisión: es una preferencia.**

| # | Problema | Decisión | Beneficio | Trade-off aceptado |
|---|---|---|---|---|
| 1 | Pages y Components necesitan los mismos `click`/`fill`/`waitFor…` | **`BaseUiObject`** como raíz común, fuera de `pages/` y `components/` | 17 métodos en un solo lugar; toda acción espera antes de actuar | Una clase base más que entender al entrar al repo |
| 2 | Un Component no debe poder navegar | **Árbol, no cadena**: `BasePage` y `BaseComponent` como ramas hermanas | La restricción la impone el **sistema de tipos**, no una convención | No se puede reusar `goto` en un Component ni con una excepción justificada |
| 3 | Los Steps necesitaban `page` para construir Pages | **`Pages` container** inyectado en el World | Permite prohibir `this.page` en Steps; agregar pantalla = 1 línea | Se instancian las 6 Pages siempre, aunque el escenario use una |
| 4 | `process.env` disperso y sin validar | **Un solo dueño**: `src/config/index.ts`, más `G3` | Falla al importar con mensaje claro; tipos reales en vez de `string \| undefined` | Toda variable nueva obliga a tocar config, `.env.example` y README |
| 5 | SQL en los tests, sin auditoría | **Repository + `DatabaseClient`** agnóstico | SQL concentrado y auditable; cambiar de motor no toca repositories | Más capas para una query simple |
| 6 | SQL injection y `UPDATE` sin `WHERE` | **`QueryBuilder`**: binds para valores, allowlist + regex para identificadores | Injection cerrada por construcción, con 31 unit tests | No se puede armar una query arbitraria; hay que declarar la allowlist |
| 7 | El driver de Oracle cargaba siempre | **Import dinámico** dentro de la feature flag + `import type` en el World | Con `DB_ENABLED=false`, `oracledb` **no** entra al proceso | La inicialización es asíncrona y menos obvia de leer |
| 8 | Las convenciones se degradan con el tiempo | **Guardrails machine-enforced**: ESLint + architecture tests | Un error de arquitectura falla el build, no depende del reviewer | Hay que mantener los guardrails y conocer sus límites |
| 9 | Dos runners conviviendo | **Cucumber único runner**, Playwright como librería, con 6 reglas que lo sostienen | Una sola forma de escribir un test, un solo reporte | Se pierden features del runner de Playwright (fixtures, retries nativos, paralelismo propio) |
| 10 | Un ejemplo que nadie puede correr | **SauceDemo como canonical UI example** | Cualquiera clona y corre sin credenciales; flujo multi-pantalla real | Dependencia de un sitio externo público |
| 11 | Un Component "de ejemplo" sin uso | **No crear ninguno**: `BaseComponent` queda como contrato | Cero abstracción especulativa | El patrón está documentado pero no demostrado por un archivo vivo |
| 12 | La IA escribe lo primero que le parece | **Dos gates humanos** + `silence != approval` | Las decisiones de qué probar y cómo siguen siendo humanas | El flujo es más lento que "pedile que lo haga" |
| 13 | Un agente que se aprueba a sí mismo | **Reviewer independiente** que re-ejecuta la evidencia | Detectó evidencia fabricada en una prueba controlada | Un agente más, y un ciclo más de ida y vuelta |
| 14 | Un agente que inventa locators | **Playwright MCP** para observación, escalonado por agente | Locators basados en lo que la app renderiza, con `SOURCE: MCP_OBSERVED` | Una dependencia externa más; el Analyst queda sin browser a propósito |
| 15 | Un agente que edita su propio contrato | **`CLAUDE.md`, `.claude/**` y `.mcp.json` protegidos** | El meta-nivel no se puede modificar solo | La protección de shell es contractual, no mecánica (§24) |
| 16 | Un gate verde tomado como prueba de corrección | **Inventario público de gaps** (`F-03`…`F-18`) con IDs | Nadie confunde "el build pasó" con "la arquitectura está bien" | Hay que mantener el inventario actualizado y admitir públicamente los límites |

Si te preguntan por **una sola** decisión, la 2 y la 16 son las que mejor muestran criterio de SDET:
una convierte una regla en tipos, la otra convierte una promesa en un inventario honesto.

---

## 29. Anti-patterns

| # | Anti-pattern | Por qué está mal | Qué usar en este repo | Detectado por |
|---|---|---|---|---|
| 1 | `await page.waitForTimeout(2000)` | Espera fija: lenta si sobra, flaky si falta. Cuando falla, la "solución" es subirla | `waitForVisible(locator)` — o directamente la acción, que ya espera | **ESLint `G2`** |
| 2 | `process.env.X` en una Page | Reintroduce `undefined` sin validar y rompe el ownership de config | `import { config }` / `requireSauceDemoBaseUrl()` | **ESLint `G3`** |
| 3 | Locator dentro de un Step | El Step deja de ser traducción y se acopla al DOM; un cambio de UI rompe N Steps | Locator en la Page (`private readonly` o factory) | **ESLint `G5`** (no puede importar Playwright ni Pages) |
| 4 | `new SauceDemoLoginPage(this.page)` en un Step | Necesita `this.page`, que es lo que la arquitectura prohíbe | `this.pages.sauceDemoLogin` | **ESLint `G5`** |
| 5 | SQL dentro de un Step | Imposible de auditar; mezcla capas; el Step deja de ser legible | Un método de dominio en un Repository | **Estructural**: `G5` + miembros `protected` de `BaseRepository` |
| 6 | `import oracledb` fuera del client | Acopla todo el repo a un driver y rompe el contrato agnóstico | Usar `DatabaseClient`; solo `OracleDatabaseClient.ts` importa el driver | **ESLint `G4`** + **`A6`** |
| 7 | Concatenar valores en SQL | SQL injection | `QueryBuilder.buildWhere(...)` con binds | **31 unit tests** + review |
| 8 | `UPDATE` sin `WHERE` | Actualiza la tabla entera | `buildUpdate` lo rechaza explícitamente | **Unit test** |
| 9 | Una clase que maneja `Page` fuera de `src/pages/**` | Evita **toda** la jerarquía UI y ningún guardrail la ve | Page en `src/pages/**` (`extends BasePage`) | ❌ **Nada** — `F-17`, solo review (§15) |
| 10 | `this.pages.<page>.goto('https://…')` desde un Step | Hardcodea URL, saltea config, mete navegación en el Step | Método semántico en la Page (`open()`) | ❌ **Nada** — `F-18`, solo review |
| 11 | `Component extends BasePage` | Un pedazo de pantalla puede navegar y romper la página entera | `extends BaseComponent`, con scope en `root` | **`A10`** |
| 12 | Locator page-wide dentro de un Component | Se rompe con dos instancias del mismo Component | Todo locator sale de `this.root` | **`A11`** (parcial: `F-15`) |
| 13 | `import { test } from '@playwright/test'` | Segundo runner en paralelo | Cucumber; `expect` y tipos siguen permitidos | **`G1`** (parcial: `F-11` no cubre el import dinámico) |
| 14 | Un archivo `*.spec.ts` o `playwright.config.ts` | Igual que el anterior, por otra puerta | `.feature` + `.steps.ts` | **`G7`/`G8`** + **`A1`/`A2`** |
| 15 | `*.test.ts` fuera de `src/`, `support/`, `features/` | Nunca se ejecuta: test muerto y nadie se entera | Ponerlo en una de las tres raíces | **`A12`** |
| 16 | Código de framework en `.js` | Ningún guardrail lo mira: `process.env` y `waitForTimeout` pasan | Todo el código productivo en `.ts` | ❌ **Nada** — `F-03`, solo review |
| 17 | Estado de negocio como propiedad del World | El World se vuelve un god object de dominio | `this.testContext` | **`A5`** (parcial: `F-08`) |
| 18 | Login escondido en un hook | El escenario miente sobre sus precondiciones | Un `Given` explícito en el Feature | Review |
| 19 | Relajar un guardrail para que pase un cambio | Destruye la garantía completa del repo | Arreglar el cambio | `CLAUDE.md` §9 + Reviewer #10 |
| 20 | Aserción cierta por construcción | El test pasa siempre; no puede detectar el bug | Verificar que el test **falla** cuando debe (control negativo) | Reviewer #7 |

Fijate en las filas 9, 10 y 16: la columna "Detectado por" dice **Nada**. Ese es exactamente el
contenido de §15, y la razón de que existan el reviewer humano y el `automation-reviewer`.

---

## 30. Preguntas de entrevista

> 32 preguntas con respuesta corta (lo que decís primero) y respuesta extendida (adónde llevás la
> conversación, usando este proyecto).

### Fundamentos — Junior / Mid

**1. ¿Qué es el Page Object Model?**
*Corta:* Un patrón donde cada pantalla es una clase que encapsula sus locators y sus acciones, para
que un cambio de UI se arregle en un solo archivo.
*Extendida:* En este repo cada pantalla real de SauceDemo es una Page que extiende `BasePage`. Los
locators estáticos son campos `private readonly` armados en el constructor y los parametrizados son
factories privados que devuelven `Locator`. Las acciones tienen nombre de negocio —`addProductToCart`,
no `clickButton`— y las aserciones viven en la Page para que el Step quede de una línea.

**2. ¿Por qué los locators no deben estar en el test?**
*Corta:* Porque acoplan el test al DOM: un cambio de UI rompe todos los tests que lo usan, en vez de
un archivo.
*Extendida:* Y hay un efecto secundario peor: el test deja de ser legible como comportamiento. Acá
está forzado por ESLint — un Step no puede importar Playwright ni una Page, así que ni siquiera tiene
cómo construir un locator.

**3. ¿Qué es Gherkin y para qué sirve?**
*Corta:* Un lenguaje estructurado (`Given`/`When`/`Then`) para escribir escenarios legibles.
*Extendida:* Su valor real, aun si negocio no lo lee, es que obliga a separar *qué* se prueba de
*cómo*. `Given` es precondición, `When` la acción bajo prueba y `Then` el resultado esperado. En este
repo cada línea mapea a un Step de una sola línea que delega en un Page Object.

**4. ¿Qué diferencia hay entre `Given`, `When` y `Then`?**
*Corta:* Precondición, acción, verificación.
*Extendida:* La confusión típica es meter aserciones en el `When` o acciones en el `Then`. Si un
`Then` cambia estado, el escenario deja de ser reproducible.

**5. ¿Para qué sirven los tags?**
*Corta:* Para filtrar qué corre. Acá `@ui`, `@smoke`, `@regression` y `@db`.
*Extendida:* Cada tag tiene su script: `test:smoke` corre `@smoke and not @db`. El suite por defecto
excluye `@db` para no depender de una base. Y un architecture test (`A7`) exige que todo `.feature`
tenga al menos un tag, para que ningún escenario quede fuera de todos los filtros sin que nadie lo
note.

**6. ¿Qué es un hook?**
*Corta:* Código que corre antes o después de cada escenario o de toda la corrida.
*Extendida:* Acá `Before` construye el World y `After` lo cierra; `BeforeAll`/`AfterAll` manejan la
conexión a base de datos. Deliberadamente no hay lógica de test en los hooks: si un escenario necesita
estar logueado, eso se ve en el `Given`.

**7. ¿Por qué no usar `sleep` o `waitForTimeout`?**
*Corta:* Porque es una apuesta: sobra o falta, y en ambos casos perdés.
*Extendida:* Está prohibido por ESLint en todo el repo. La alternativa es esperar la condición
observable, y acá ni siquiera hace falta escribirla: las acciones de `BaseUiObject` esperan antes de
actuar.

**8. ¿Qué es un flaky test y cómo lo atacás?**
*Corta:* Uno que pasa y falla sin que cambie el código. La causa más común son esperas mal hechas.
*Extendida:* Ataco la causa: prohibir esperas fijas, esperar siempre por condición, y aislar estado
entre escenarios —acá cada escenario tiene su propio `BrowserContext`, sin `storageState` compartido.
Este repo **no** configura reintentos automáticos, y me parece correcto: el reintento esconde
flakiness. Si se usa, tiene que venir con visibilidad de cuántas veces reintentó.

### Senior QA Automation

**9. ¿Para qué usás el `CustomWorld` en Cucumber?**
*Corta:* Es el contexto por escenario: ahí viven browser, context, page y los Page Objects, así cada
escenario arranca aislado sin variables globales.
*Extendida:* (ver §4 — la respuesta senior completa)

**10. ¿Cómo compartís datos entre Steps?**
*Corta:* Con `this.testContext`, que es un objeto libre y nuevo por escenario.
*Extendida:* Nunca con variables de módulo, que se filtran entre escenarios. Y a propósito no agrego
propiedades de negocio al World: hay un architecture test que verifica que el World declare solo
estado de infraestructura, para que no derive en un god object.

**11. ¿Por qué un contenedor de Pages y no instanciarlas en el Step?**
*Corta:* Porque instanciarlas requiere `this.page`, que es justo lo que la arquitectura prohíbe.
*Extendida:* El container es lo que hace **cumplible** esa prohibición. Además centraliza el cableado:
una pantalla nueva es una línea, sin tocar Steps existentes.

**12. ¿Aserciones en la Page o en el Step?**
*Corta:* Acá en la Page, para que el Step quede fino y no haya que exponer locators.
*Extendida:* Es un trade-off consciente: se pierde pureza de responsabilidad y se gana
encapsulamiento. Lo que no haría es la tercera opción, que es exponer los locators públicamente para
que el Step asserte — eso rompe el patrón de verdad.

**13. ¿Cómo elegís un selector?**
*Corta:* Semántica accesible primero (`getByRole` con nombre), `data-test` cuando el elemento no
tiene semántica, y CSS estructural nunca.
*Extendida:* En este repo cada Page documenta por qué eligió cada uno. Por ejemplo el badge del
carrito de SauceDemo se targetea por `data-test` porque cuando está vacío no tiene rol ni nombre
accesible — y eso está escrito en el comentario de la clase, con la evidencia de observación.

**14. ¿Cómo sabés que tus tests realmente prueban algo?**
*Corta:* Verificando que **fallen** cuando la aplicación está mal.
*Extendida:* Es la pregunta que más me gusta. Un suite de 20 steps en 1.4 segundos da sospecha
legítima. Acá se hizo un control negativo: apuntando la URL base a una ruta inexistente, el suite
falla con exit 1 dentro del login. Y el tiempo se explica: SauceDemo es una app cliente, una vez
cacheada cada interacción es DOM local. En frío tarda 4.1 s.

**15. ¿Cómo estructurás una suite que crece?**
*Corta:* Por área funcional en features y pages, con tags para separar smoke de regresión.
*Extendida:* Y con reglas que no dependan de la disciplina: una Page por pantalla real, un Component
solo si la región se repite de verdad, y guardrails que fallen el build cuando alguien se sale del
patrón. El problema de una suite grande no es escribirla, es que no se degrade.

**16. ¿Cuándo crearías un Component?**
*Corta:* Cuando una región identificable se repite en varias pantallas o dentro de una misma.
*Extendida:* Hoy este repo no tiene ninguno, a propósito: el flujo canónico no tiene una región así, y
no creo abstracciones sin consumidor. El contrato `BaseComponent` y los guardrails ya están; el día
que aparezca un header o un modal reutilizado, el patrón está listo.

### SDET / Arquitectura

**17. ¿Por qué separaste `BasePage` de `BaseComponent`?**
(ver §8 — es la pregunta bandera del proyecto)

**18. ¿Qué es un architecture test y en qué se diferencia de una regla de ESLint?**
*Corta:* ESLint mira un archivo por vez; un architecture test verifica propiedades del repositorio
completo, como "esto existe exactamente una vez" o "este archivo no existe".
*Extendida:* Acá hay 11 invariantes escritos parseando el AST de TypeScript. El que más me gusta es
`A12`: verifica que no haya ningún `*.test.ts` fuera de las carpetas donde el runner los busca, así
que en este repo no puede existir un test silenciosamente muerto. ESLint no puede expresar eso porque
no puede contar ni mirar el repo entero.

**19. ¿Cómo evitás que el framework se degrade con el tiempo?**
*Corta:* Haciendo que las convenciones importantes fallen el build.
*Extendida:* La premisa es que una convención que no falla el build no se cumple: a los seis meses hay
locators en los Steps y tres formas de leer configuración. Por eso una parte del repo son guardrails y
no features. Pero con una condición: hay que saber y publicar qué **no** cubren.

**20. ¿`npm run quality` en verde significa que el código está bien?**
*Corta:* No. Es necesario, nunca suficiente.
*Extendida:* (ver §15 — `F-17` y `F-18` con la reproducción real. Es la mejor respuesta del
proyecto para mostrar criterio.)

**21. Contame un problema real que hayas encontrado en tu propio framework.**
*Corta:* El contrato garantizaba que "no se puede romper la jerarquía UI", y era falso.
*Extendida:* En una auditoría adversarial se probó que una clase Page-like fuera de `src/pages`,
importada por un Step, más el `goto` público, pasa el gate con 62/62 en verde. El problema no era el
bypass en sí —todo enforcement por path tiene ese límite— sino que la garantía estaba escrita como
absoluta y el gap no figuraba en ningún inventario, así que nadie estaba instruido para buscarlo. Se
corrigió documentándolo con ID, agregándolo a la tabla de alcance y al checklist del reviewer. No
fingimos haberlo eliminado técnicamente, porque no lo eliminamos.

**22. ¿Por qué Cucumber como runner y Playwright como librería?**
*Corta:* Para tener una sola forma de escribir un test y un solo reporte.
*Extendida:* Es una decisión con costo real: se pierden fixtures, retries y el paralelismo nativos del
runner de Playwright. Se aceptó a cambio de que la capa de negocio sea Gherkin. Y como es una decisión
fácil de erosionar, hay seis reglas que la sostienen — prohibición del runner, de `*.spec.ts`, de
`playwright.config.*`, y un test que verifica que ningún script de npm invoque `playwright test`.

**23. ¿Cómo diseñarías la capa de acceso a datos de un framework de tests?**
*Corta:* Repository pattern sobre un contrato agnóstico del motor, con los métodos de ejecución
`protected` para que un test no pueda ejecutar SQL.
*Extendida:* Acá el Step llama a un repository por su método de dominio; el repository arma la query
con `QueryBuilder` y la ejecuta vía `DatabaseClient`, que es una interfaz de dos métodos que no depende
de `oracledb`. El detalle que más me interesa es que `execute`/`select`/`insert` son `protected`: el
"no hay SQL en un Step" es estructural, no una regla.

**24. ¿Cómo haces que una dependencia pesada sea realmente opcional?**
*Corta:* Import dinámico dentro de la feature flag, y `import type` para los tipos.
*Extendida:* Un import estático se evalúa siempre; uno dinámico dentro de un `if`, solo si se ejecuta
esa rama. Acá con `DB_ENABLED=false` se verificó que `oracledb` no aparece en `process.moduleLoadList`.
El resultado práctico es que alguien clona el repo y corre toda la suite UI sin instalar nada de
Oracle.

**25. ¿Cómo manejás la configuración?**
(ver §9)

### CI/CD

**26. ¿Cómo integrarías tus tests a CI?**
(ver §17 — respuesta completa)

**27. ¿Qué diferencia hay entre CI y CD?**
*Corta:* CI verifica cada cambio automáticamente; CD además despliega lo verificado.
*Extendida:* Este repo implementa CI, no CD, y prefiero decirlo con precisión: no hay artefacto
desplegable, es un arquetipo de tests. Lo que sí está previsto como extensión —y no implementado— es
disparo cruzado con `repository_dispatch` para cuando la aplicación vive en otro repositorio.

**28. ¿Qué orden le darías a los pasos del pipeline?**
*Corta:* Lo barato y rápido primero: instalar, typecheck, lint, unit tests, y recién ahí el E2E.
*Extendida:* Si no compila, no tiene sentido levantar un browser. Además uso `npm ci` en vez de
`npm install` para que la instalación sea reproducible desde el lock, instalo solo Chromium para tener
señal rápida, y subo los reportes con `if: always()` porque el reporte que más se necesita es el de la
corrida que falló.

**29. ¿Cómo manejás secretos en CI?**
*Corta:* Como secrets del proveedor, inyectados como variables de entorno; nunca en el repo.
*Extendida:* En este proyecto CI no tiene ni un secreto: las cuatro variables del workflow son
públicas, y la URL del sitio bajo prueba está declarada explícitamente para que se vea leyendo el YAML.
El workflow además corre con `permissions: contents: read` y timeout, que son dos cosas que se olvidan
seguido.

### AI-assisted testing

**30. ¿Usás IA para escribir tests? ¿Cómo evitás que escriba cualquier cosa?**
*Corta:* Sí, pero con un pipeline de tres agentes y dos gates humanos obligatorios antes de que se
escriba un archivo.
*Extendida:* El analista convierte el requerimiento en escenarios y marca lo que falta como bloqueante
en vez de inventarlo. Después hay una aprobación humana. El engineer propone un plan sin tocar nada,
y hay una segunda aprobación humana justo antes de la primera escritura. Recién ahí implementa. Y un
reviewer independiente, que no vio cómo trabajó el engineer, re-ejecuta la evidencia por su cuenta.
La regla que lo sostiene todo es que el silencio nunca cuenta como aprobación.

**31. ¿Qué es MCP y para qué lo usás?**
(ver §23)

**32. ¿Cómo validás el trabajo de un agente?**
*Corta:* Con un reviewer independiente que no confía en el reporte y re-ejecuta la evidencia, más un
checklist fijo de 12 puntos.
*Extendida:* Y lo probamos de forma adversarial: le entregamos documentos que describían trabajo
inexistente con evidencia fabricada. Rechazó la evidencia, la reprodujo, midió los números reales,
denunció la contradicción, probó la ausencia de los archivos con git y devolvió `CHANGES_REQUESTED`
sin editar nada. Además su checklist nombra por ID los gaps conocidos que el gate no detecta, y le
dice explícitamente que un `quality` verde no es prueba de que la arquitectura esté bien.

---

## 31. Speech del proyecto

### 30 segundos

> "Armé un arquetipo de automatización E2E en TypeScript, con Cucumber como runner y Playwright usado
> como librería, siguiendo Page Object Model. Lo que lo diferencia de un boilerplate es que las reglas
> de arquitectura están verificadas por máquina: hay reglas de ESLint y tests de arquitectura que
> fallan el build si un Step toca el browser directamente o si una Page no extiende la clase base.
> Incluye también una capa de trabajo asistido por IA con tres agentes y aprobaciones humanas
> obligatorias antes de que se escriba cualquier archivo."

### 1 minuto

> "Es un arquetipo de automatización E2E pensado para clonarse como base de un proyecto nuevo.
> TypeScript en modo estricto, Cucumber como único runner y Playwright como librería, con Page Object
> Model sobre una jerarquía de clases base donde `BasePage` y `BaseComponent` son ramas hermanas de un
> `BaseUiObject` común. Eso hace que 'un componente no navega' sea el sistema de tipos y no una
> convención.
>
> Tiene una capa de base de datos opcional con repositories y un `QueryBuilder` que obliga a que los
> valores viajen por bind y los identificadores contra una allowlist. Y es opcional de verdad: con la
> flag apagada, el driver de Oracle ni siquiera se carga en el proceso.
>
> La parte que más me interesa es el enforcement. Hay reglas de ESLint y once tests de arquitectura
> que verifican propiedades del repositorio completo, y una documentación explícita de qué **no**
> cubren: sé exactamente dónde el gate verde deja de ser prueba de nada, y eso está escrito con IDs
> en el contrato y en el checklist del reviewer.
>
> Encima de eso hay un pipeline de tres agentes de IA —análisis, implementación y review
> independiente— con dos gates humanos obligatorios y la regla de que el silencio nunca cuenta como
> aprobación."

### 3 minutos

> "El problema que quise resolver no es 'no tenemos tests'. Es la degradación: un framework de
> automatización arranca limpio y a los seis meses tiene locators en los Steps, esperas fijas por
> todos lados y tres formas distintas de leer configuración. Mi premisa fue que **una convención que
> no falla el build, no se cumple**. Así que una parte grande del repositorio son guardrails, no
> features.
>
> La base es TypeScript estricto con Cucumber como único runner y Playwright como librería. Esa
> decisión tiene costo —se pierden fixtures y retries nativos de Playwright— y como es fácil de
> erosionar, la sostienen seis reglas: prohibición de importar el runner, de archivos `.spec.ts`, de
> `playwright.config`, y un test que verifica que ningún script de npm invoque `playwright test`.
>
> La arquitectura UI es un árbol: `BaseUiObject` tiene lo genérico sobre locators —esperas, acciones,
> aserciones— y de ahí salen dos ramas, `BasePage`, que agrega navegación, y `BaseComponent`, que
> agrega un `root` que acota el scope. Un Component no puede navegar porque el método no existe en su
> rama: la regla la impone el compilador. Y hay tests de arquitectura que verifican la jerarquía sobre
> el repo entero.
>
> Los Steps son deliberadamente finos, una línea que delega en un Page Object, y eso está forzado: un
> Step no puede tocar `this.page`, ni importar Playwright, ni la capa de base de datos, ni leer
> `process.env`. La configuración tiene un solo dueño que valida al arrancar, así que un error de
> entorno aparece como un mensaje claro y no como un `undefined` tres capas más abajo.
>
> Lo que más me enseñó fue la auditoría final. La hice adversarial, intentando probar que el arquetipo
> **no** estaba listo, y encontró algo importante: el contrato garantizaba que no se podía romper la
> jerarquía UI, y era falso. Los guardrails de UI están anclados por path, así que una clase que
> maneje browser fuera de `src/pages` pasa el gate con todo en verde. El bypass en sí es esperable;
> el problema era la garantía absoluta y que el gap no estuviera en ningún inventario, así que nadie
> lo buscaba. Lo corregí documentándolo con ID, agregándolo a la tabla de alcance y al checklist del
> reviewer, y **sin** afirmar que lo había eliminado, porque no lo eliminé.
>
> Encima está la capa de IA: tres agentes con permisos distintos y dos gates humanos. El analista
> convierte el requerimiento en escenarios y marca lo que falta en vez de inventarlo —a propósito no
> tiene acceso al browser, porque su trabajo es decir qué debería pasar, no describir lo que la app
> hace. El engineer propone un plan sin tocar nada, y solo implementa después de una aprobación
> explícita. Y el reviewer es independiente: no ve cómo trabajó el engineer y re-ejecuta la evidencia
> por su cuenta. Lo probamos con un reporte falsificado y lo detectó.
>
> El estado final es READY, con dos findings medios y seis menores abiertos, todos documentados. No
> es perfecto, y eso también es parte del punto."

---

## 32. Checklist de conocimientos

### Debo poder explicar sin mirar

- [ ] Qué es POM y por qué los locators no van en el test
- [ ] El flujo completo: Feature → Steps → World → Pages → Page → BasePage → BaseUiObject
- [ ] Qué es el `CustomWorld` y qué problema resuelve
- [ ] Por qué `BasePage` y `BaseComponent` son ramas hermanas y no una cadena
- [ ] Qué puede y qué **no** puede hacer un Step (la lista completa)
- [ ] Por qué `process.env` tiene un solo dueño
- [ ] Diferencia entre bind variable e identificador, y por qué se protegen distinto
- [ ] Qué hace `npm run quality` vs `npm test`
- [ ] Los tags y qué script corre cada uno
- [ ] El pipeline de CI paso por paso, y por qué en ese orden
- [ ] Diferencia entre CI y CD, y qué implementa este repo
- [ ] **Machine-enforced vs review-enforced**, con `F-17` y `F-18` como ejemplos
- [ ] Los tres agentes: qué recibe, qué hace, qué no puede hacer cada uno
- [ ] Qué son los dos gates humanos y por qué `silence != approval`
- [ ] Qué es MCP y la diferencia con el Playwright del framework
- [ ] Por qué el `qa-analyst` **no** tiene MCP

### Debo entender técnicamente (puedo razonarlo, no necesito recitarlo)

- [ ] Los 17 métodos de `BaseUiObject` agrupados por familia, y que las acciones ya esperan
- [ ] Locator estático (`private readonly`) vs parametrizado (factory privado), con ejemplo
- [ ] El ciclo de vida completo: `BeforeAll` → `Before` → Steps → `After` → `AfterAll`
- [ ] Por qué el import de `OracleDatabaseClient` es dinámico y el de `RepositoryContainer` es `import type`
- [ ] Qué garantiza cada grupo de reglas de ESLint y cuál es su alcance
- [ ] La diferencia entre regla ESLint, architecture test y unit test
- [ ] Qué hacen `A4`, `A9`/`A10`/`A11`, `A6` y `A12`
- [ ] Las protecciones del `QueryBuilder`: binds, regex + allowlist, rechazo de `UPDATE` sin filtros
- [ ] Las dos capas de infraestructura protegida y por qué `Bash` no está cubierto
- [ ] El escalonamiento de MCP por agente y su razón
- [ ] Por qué no existe ningún Component concreto

### Puedo consultar documentación (nadie espera que lo recuerdes)

- [ ] La implementación AST de los architecture tests, línea por línea
- [ ] La lista exacta de las 20 reglas `ask` de `settings.json`
- [ ] Los IDs y el texto exacto de cada finding `F-03` … `F-18`
- [ ] Los números de versión exactos de cada dependencia
- [ ] La firma completa de cada método estático de `QueryBuilder`
- [ ] Los 12 puntos del checklist del reviewer, textuales
- [ ] Qué hizo cada tarea T01–T20.1

---

## 33. Plan de estudio del proyecto

> Cuatro semanas, **45–60 minutos por día**. Cada semana cierra con un ejercicio práctico que se hace
> en el repo, no en la cabeza.

### Semana 1 — Arquitectura UI

| Día | Qué leer | Qué hacer |
|---|---|---|
| 1 | Playbook §1, §2 · `README.md` §Overview y §Architecture | Dibujar el flujo Feature→Playwright de memoria y compararlo |
| 2 | §3 · `features/sauceDemo/checkout.feature` + `checkout.steps.ts` completos | Contar los steps y verificar que **ninguno** importa Playwright |
| 3 | §4, §5 · `support/world.ts`, `support/hooks.ts` | Escribir en una hoja qué existe en cada momento del ciclo de vida |
| 4 | §6, §7 · `src/pageContainer/Pages.ts` + `SauceDemoLoginPage.ts` e `InventoryPage.ts` | Identificar los dos tipos de locator en `SauceDemoInventoryPage` |
| 5 | §8 completa · `BaseUiObject.ts`, `BasePage.ts`, `BaseComponent.ts` | Explicar en voz alta por qué `BaseComponent` no hereda de `BasePage` |

**Ejercicio de cierre (día 6–7):** agregá una Page nueva para la pantalla de **error de login** de
SauceDemo (usuario bloqueado). Registrala en `Pages.ts`, escribí un `.feature` con el escenario
negativo y sus steps. Corré `npm run quality` y `npm run test:ui`.
*Verificá que:* la Page extiende `BasePage`, los locators son campos o factories, el Step es de una
línea, y el escenario **falla** si le cambiás el texto esperado del error.

### Semana 2 — Config, base de datos y guardrails

| Día | Qué leer | Qué hacer |
|---|---|---|
| 8 | §9 · `src/config/index.ts` completo | Listar las 9 variables con su default, sin mirar |
| 9 | §10 · `RepositoryContainer.ts`, `ExampleRepository.ts`, `BaseRepository.ts` | Seguir el camino de `findById` hasta `DatabaseClient` |
| 10 | §11 · `QueryBuilder.ts` (las funciones `assert*` y `buildWhere`) | Escribir un ejemplo de SQL injection y su versión segura |
| 11 | §12 · `support/databaseLifecycle.ts` | Explicar por qué el import es dinámico |
| 12 | §13 · `eslint.config.js` completo | Por cada grupo, escribir el ejemplo incorrecto y el correcto |
| 13 | §14 · `src/architecture.test.ts` — **solo los nombres de los `describe`** | Explicar qué garantiza `A12` y por qué importa |

**Ejercicio de cierre (día 14):** rompé un guardrail **a propósito** y mirá el mensaje de error. Poné
`await this.page.waitForTimeout(1000)` en un Step, corré `npm run lint`, leé el mensaje, y revertilo.
Repetí con `process.env.X` en una Page. *Objetivo:* que la próxima vez que veas ese error en un PR
sepas exactamente qué pasó.

### Semana 3 — Enforcement, CI y capa de IA

| Día | Qué leer | Qué hacer |
|---|---|---|
| 15 | **§15 completa** — la sección más importante | Explicar `F-17` y `F-18` con sus ejemplos de código |
| 16 | §16 · los scripts de `package.json` | Correr los cinco suites E2E y anotar los números reales |
| 17 | §17 · `.github/workflows/ci.yml` completo | Justificar cada paso: por qué `npm ci`, por qué solo Chromium, por qué `if: always()` |
| 18 | §19 · `CLAUDE.md` §7.5, §8, §8.1, §9, §12 | Escribir la Definition of Done de memoria |
| 19 | §20 · los tres archivos de `.claude/agents/` | Armar una tabla comparativa de permisos sin mirar la del Playbook |
| 20 | §21, §22 · `.claude/skills/qa-automate/SKILL.md` | Escribir el pedido de una HU tuya en el formato de §22 |
| 21 | §23, §24 · `.mcp.json`, `.claude/settings.json` | Explicar por qué el Analyst no tiene MCP y por qué `Bash` no está cubierto |

**Ejercicio de cierre:** corré `/qa-automate` con un requerimiento chico y real (por ejemplo: *"quiero
validar que al agregar dos productos distintos el badge muestre 2"*). Frená en Gate 1 y leé la QA
Analysis con ojo crítico: ¿los escenarios son los que vos hubieras escrito?, ¿marcó bien lo que
falta? Aprobá o pedí cambios de verdad.

### Semana 4 — Entrevista y práctica

| Día | Qué hacer |
|---|---|
| 22 | §30, preguntas 1–8. Responder **en voz alta**, cronometrando |
| 23 | §30, preguntas 9–16 |
| 24 | §30, preguntas 17–25 — las de arquitectura, las más importantes |
| 25 | §30, preguntas 26–32 (CI/CD e IA) |
| 26 | §31: practicar el speech de 30 segundos y el de 1 minuto hasta que salgan naturales |
| 27 | §31: el de 3 minutos. Grabarte y escucharte |
| 28 | §28 y §29: poder citar **cinco** decisiones con su trade-off y **cinco** anti-patterns con su alternativa |

**Ejercicio final:** explicale el proyecto a alguien que no sea del rubro, en cinco minutos, sin
jerga. Si podés hacer eso, la entrevista técnica es más fácil.

### Tres reglas para que el plan funcione

1. **No memorices implementación.** Nadie te va a pedir el AST. Sí te van a pedir *por qué*.
2. **Preferí explicar en voz alta antes que releer.** Si no podés explicarlo, no lo entendiste.
3. **Cuando el Playbook y el código no coincidan, gana el código** — y corregí el Playbook.

---

## 34. Glosario

| Término | En palabras simples |
|---|---|
| **POM** (Page Object Model) | Patrón donde cada pantalla es una clase con sus locators y sus acciones, para que un cambio de UI se arregle en un solo archivo |
| **Page Object** | Esa clase. Acá extiende `BasePage` y vive en `src/pages/**` |
| **Component** | Clase que representa una **región** reutilizable de una pantalla (nav, modal, sidebar), acotada a su `root`. Extiende `BaseComponent`. Hoy no existe ninguno concreto en el repo |
| **Locator** | Objeto de Playwright que sabe *cómo encontrar* un elemento. Es perezoso: no busca hasta que lo usás |
| **World** | Objeto que Cucumber crea **una vez por escenario** y que es el `this` de cada Step. Acá, `CustomWorld` |
| **Hook** | Función que corre antes o después de cada escenario (`Before`/`After`) o de toda la corrida (`BeforeAll`/`AfterAll`) |
| **Step Definition** | La función TypeScript que implementa una línea de Gherkin |
| **Tag** | Etiqueta de Cucumber (`@smoke`) para filtrar qué escenarios corren |
| **Repository** | Clase que expone operaciones de datos en lenguaje de dominio (`findById`) y esconde el SQL |
| **QueryBuilder** | Utilidad que arma SQL de forma segura: valores por bind, identificadores por allowlist |
| **Bind (bind variable)** | Un parámetro de la query (`:ID_0`) cuyo valor viaja aparte del texto SQL. Es lo que hace imposible la injection en valores |
| **Allowlist** | Lista cerrada de valores permitidos. Acá, los nombres de columna que un repository acepta — porque un identificador **no** se puede bindear |
| **SQL Injection** | Ataque donde un valor concatenado en la query cambia su significado (`x' OR '1'='1`) |
| **Guardrail** | Regla automática que **falla el build** cuando alguien rompe una decisión de arquitectura |
| **Machine-enforced** | Verificado por una máquina: ESLint, architecture tests, `tsc`. No depende de que alguien se acuerde |
| **Review-enforced** | Depende de que una persona (o el `automation-reviewer`) lo mire. Todo lo que está fuera del alcance medido |
| **AST** (Abstract Syntax Tree) | El código representado como un árbol de nodos. Permite preguntar "¿esta clase extiende X?" en vez de buscar texto con regex |
| **Architecture test** | Test que verifica una propiedad del **repositorio completo** (que algo no exista, que ocurra exactamente una vez) |
| **Unit test** | Test de una función o clase aislada. Acá: `QueryBuilder` y `config` |
| **CI** (Continuous Integration) | Verificar automáticamente cada cambio: build, lint, tests |
| **CD** (Continuous Delivery/Deployment) | Además, entregar o desplegar automáticamente. **Este repo no lo implementa** |
| **MCP** (Model Context Protocol) | Protocolo estándar para darle herramientas externas a un modelo de IA |
| **Playwright MCP** | Servidor MCP que expone un browser real para que el **agente observe** la aplicación. No es el Playwright que corre los tests |
| **Agent** (subagente) | Asistente de IA con un rol acotado, sus propios permisos y su propio contrato. Acá hay tres |
| **Skill** | Procedimiento versionado en el repo que la sesión principal sigue. Acá, `/qa-automate` |
| **Human Gate** | Punto donde el flujo se detiene hasta que una persona decide explícitamente. Hay dos |
| **Handoff** | Los documentos que pasan de un agente al siguiente: QA Analysis, Automation Plan, Implementation Report, Review Report |
| **Definition of Done** | Cuándo un trabajo está terminado. Acá: `quality` en verde, E2E relevante en verde, sin guardrails relajados, sin sobras, diff revisado |
| **Canonical example** | El ejemplo de referencia del repo. UI → SauceDemo. Base de datos → `ExampleRepository` |
| **Finding** | Hallazgo de una auditoría, con ID (`F-17`), severidad y estado (`OPEN — NON-BLOCKING`) |

---

## 35. Qué NO hace todavía este arquetipo

> Lista honesta, basada en las limitaciones documentadas y en el estado de readiness vigente. Está
> separada en tres categorías, porque no todo lo ausente es una deuda.

### A. Limitaciones deliberadas (decisiones, no faltantes)

| Qué | Por qué es deliberado |
|---|---|
| **No existe ningún Component concreto** | El flujo canónico no tiene una región reutilizable real. No se crea una abstracción sin consumidor (§8) |
| **`npm run test:db` corre 0 escenarios** | No hay ningún `.feature` `@db` todavía. Está documentado en tres lugares; no es un test roto |
| **`EXAMPLE_ITEMS` no existe en ninguna base real** | Es un contrato de demostración del patrón, nunca creado ni poblado |
| **Sin paralelismo ni reintentos automáticos** | Cucumber corre secuencial. El reintento automático esconde flakiness en vez de arreglarla |
| **`qa-analyst` sin MCP** | Debe decir qué *debería* pasar, no describir lo que la app hace |
| **Git de escritura solo con autorización** | El historial es del equipo (`CLAUDE.md` §13) |

### B. Gaps conocidos, abiertos y no bloqueantes

Todos documentados con ID en `CLAUDE.md` §8 y en el readiness vigente:

| ID | Gap |
|---|---|
| `F-03` | Los archivos `.js` no tienen ningún guardrail |
| `F-06` | Un Step puede importar `playwright-core` y lanzar su propio browser |
| `F-07` | Aliasear `setWorldConstructor` escapa a `A4` |
| `F-08` | `A5` solo ve `PropertyDeclaration`: getters y parameter properties escapan |
| `F-09` | Un `*.spec.js` pasa el gate |
| `F-10` | Un `.ts` fuera de las tres raíces nunca se typechequea |
| `F-11` | `await import('@playwright/test')` escapa a `G1` |
| `F-12` | Un comentario obsoleto en `src/architecture.test.ts` describe como abierto un gap que ESLint sí bloquea |
| `F-13` | Aliasear `process` escapa a `G3` |
| `F-15` | Un Component puede escapar de su `root` vía el parámetro local `page` |
| `F-16` | `oracledb` alcanzable vía `node:module` default/namespace import |
| **`F-17`** | **Una clase UI-like fuera de los paths canónicos pasa el gate completo** |
| **`F-18`** | **Las primitivas de navegación de `BasePage` son públicas y alcanzables desde un Step** |
| `M-03` | No existe un validador estático real para agentes project-scoped (limitación de tooling) |
| `L-11` | `Bash` no está cubierto por una regla `Edit(...)`: esa barrera es contractual |
| `L-12` | Nunca se confirmó en runtime que el patrón con slash inicial dispare el prompt `ask` |

### C. Fuera de scope hoy (no implementado, no prometido)

- **Sin capa de API testing.** Crecería con el mismo patrón de contenedor, pero no existe.
- **Sin otro motor de base de datos.** Oracle es la única implementación real de `DatabaseClient`.
- **Sin capa de autenticación/reuso de sesión.** `CustomWorld.init()` siempre crea un
  `BrowserContext` nuevo y vacío: sin `storageState`, sin login programático.
- **Sin Test Data Management.** No hay seeding ni factories; los repositories arman queries ad hoc.
- **Sin logging estructurado.**
- **Sin matriz multi-ambiente.** `src/config/index.ts` lee variables planas una sola vez, al importar.
- **CI solo con Chromium.** Firefox y WebKit se validaron a mano, no en el pipeline.
- **Sin screenshots ni traces on failure.**
- **Sin CD.** No hay artefacto desplegable.
- **Dependencia de un sitio externo.** El ejemplo canónico necesita que `saucedemo.com` esté
  disponible y mantenga su comportamiento y sus textos.

### Cómo lo explicaría en una entrevista

> "Puedo decirte exactamente qué no hace, porque está documentado con IDs. Hay limitaciones que son
> decisiones —no hay ningún componente concreto porque no hay una región reutilizable real, y no hay
> reintentos automáticos porque esconden flakiness—, hay gaps conocidos y no bloqueantes, sobre todo
> los dos de enforcement por path, y hay cosas que simplemente están fuera de scope, como una capa de
> API o test data management. Prefiero esa lista antes que decir que está todo cubierto."

---

## 36. Estado final

```text
FINAL VERDICT: READY
```

| Criterio | Requerido | Real |
|---|---|---|
| Findings BLOCKER | 0 | **0** |
| Findings HIGH | 0 | **0** |
| `npm run quality` | PASS | **PASS** — 62 tests / 23 suites / 0 fail |
| `npm test` | PASS | **PASS** — 2 scenarios / 20 steps |
| `npm run test:ui` | PASS | **PASS** — 2 scenarios / 20 steps |
| Guardrails intactos | sí | **sí** |
| Contrato coherente con el toolchain | sí | **sí** |

### Qué significa READY acá

Significa **una** cosa muy concreta: **el contrato describe lo que el toolchain realmente hace
cumplir.** No hay ninguna garantía escrita que la herramienta no entregue.

Ese fue exactamente el camino de las dos últimas tareas. La auditoría adversarial (T20) cerró en
`CONDITIONALLY READY` con un finding HIGH que no era un defecto de código: `CLAUDE.md` garantizaba
que "no se puede romper la jerarquía UI" y eso era **falso** — se probó ejecutándolo. La corrección
(T20.1) no tocó una línea de código productivo: eliminó la garantía falsa, publicó el alcance real
del enforcement, le dio ID al gap y lo agregó al checklist del reviewer.

### READY **no** significa perfecto

Y esa distinción es la parte más valiosa del proyecto para contar en una entrevista.

- Quedan **2 findings MEDIUM** y **6 LOW** abiertos, todos `OPEN — NON-BLOCKING`.
- `F-17` y `F-18` **siguen siendo técnicamente posibles**. No se eliminaron, se documentaron.
- La protección de infraestructura tiene dos límites reconocidos y no verificados (`L-11`, `L-12`).

Un arquetipo que dijera "cero gaps" estaría cometiendo el mismo error que la auditoría encontró:
convertir un modelo de limitaciones conocidas en uno de falsa seguridad. **El inventario honesto es
la garantía; la promesa absoluta es el riesgo.**

### La frase que resume el proyecto

> Un gate verde es **necesario, nunca suficiente** — y saber exactamente dónde termina su alcance
> vale más que fingir que no termina nunca.

---

## Dónde seguir

| Necesidad | Archivo |
|---|---|
| Navegar todo el conocimiento del repo | `docs/PROJECT-KNOWLEDGE-MAP.md` |
| Uso, setup, comandos, tabla de guardrails | `README.md` |
| Contrato operativo (arquitectura, gaps, DoD) | `CLAUDE.md` |
| Mapa para contribuidores | `AGENTS.md` |
| Estado de readiness vigente | `docs/ai-automation-archetype-final-readiness.md` |
| Auditoría adversarial completa | `docs/history/ai-automation-archetype-final-audit.md` |
| Por qué se tomó cada decisión | `docs/refactor-progress-ia/` y `docs/refactor-progress/` (históricos) |
