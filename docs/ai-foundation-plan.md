# AI Foundation Plan — Fase 1 (saneamiento + guardrails)

> **Fuente principal:** `docs/framework-current-state.md`
> **Fecha:** 2026-09-04
> **Estado:** plan para revisión. **Nada implementado todavía.**
> **Invariante:** Cucumber sigue siendo el **único runner E2E**. Playwright sigue siendo **librería**. No se agrega `playwright.config.ts`, ni `*.spec.ts`, ni MCP, ni agentes, ni `.claude/`.
>
> **Verificado empíricamente antes de escribir este plan** (probes temporales, ya eliminados; repo sin cambios):
> 1. `node --test` con type stripping nativo de Node 24 ejecuta tests en TypeScript **sin agregar dependencias** — PASS con `QueryBuilder` y con `config`.
> 2. `ts-node/esm` + `node:test` **falla** en Node 24 (`ERR_REQUIRE_CYCLE_MODULE`) — descartado como runner de unit tests.
> 3. El type stripping nativo **no soporta parameter properties** (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`) ni especificadores `.js` que resuelven a `.ts` (`ERR_MODULE_NOT_FOUND`) → esto **limita qué módulos son testeables** (ver §5).
> 4. Todas las reglas ESLint propuestas en §4 disparan correctamente sobre fixtures de violación.
> 5. **Gotcha crítico:** en ESLint flat config, `no-restricted-syntax` / `no-restricted-imports` **no se fusionan entre bloques** — un override posterior con el mismo nombre de regla **reemplaza** al anterior. Un override en `features/steps/**` desactivó silenciosamente el ban de `waitForTimeout`. Ver §4.4 y §7-R1.
> 6. `no-restricted-properties` sobre `process.env` **rompe el propio test de config** (que necesita escribir env) → requiere whitelist de archivos de test. Ver §4.4 y §7-R2.
>
> **Nota sobre `docs/refactor-progress/`:** es documentación local/histórica (gitignored, `.gitignore:65`). Este plan la cita como antecedente de P1, pero no es necesaria para usar ni extender el framework — ningún archivo operativo debe apuntar a ella.

---

## 1. Problemas que resolveremos en esta fase

| ID | Problema | Confirmado hoy contra el código | Tipo |
|---|---|---|---|
| **P1** | **Referencias muertas a `docs/refactor-progress/`.** El directorio está en `.gitignore:65` y **no está trackeado** (`git ls-files` no lo lista), pero **15 archivos trackeados lo referencian**, más ~14 punteros a IDs internos (`T09`…`T17`) en comentarios de código. En un clon, todo eso apunta a la nada | ✅ Sí | Documentación / comentarios |
| **P2** | **Documentación incorrecta de `storageState`.** `support/AGENTS-support.md:27` documenta `init(options?: { storageStatePath?: string; headless?: boolean })` con soporte de `storageState`; el código no lo tiene | ✅ Sí | Documentación |
| **P3** | **Código muerto: `InitOptions.headless`.** Re-confirmado: `support/world.ts:10-12` declara `InitOptions { headless?: boolean }`, y `support/hooks.ts:14` llama `this.init()` **sin argumentos**. Cero callers en todo el repo | ✅ Sí | Código muerto |
| **P4** | **Inconsistencia del ejemplo canónico de locators.** `ExamplePage` declara `heading` en el constructor (`:14,17`) pero construye el locator del link **inline dentro del método** (`:31`). Dos convenciones en un archivo de 33 líneas. Ídem `ExampleNavigationComponent:20-22` | ✅ Sí | Ejemplo canónico |
| **P5** | **`BasePage` sin separación de `BaseComponent`.** `ExampleNavigationComponent extends BasePage` → un Component hereda `goto()`, `reload()`, `waitForUrlContains()`. El único ejemplo enseña el patrón incorrecto | ✅ Sí | Arquitectura |
| **P6** | **Ausencia total de guardrails ejecutables.** 0 `no-restricted-imports`, 0 `no-restricted-properties`, 0 `no-restricted-syntax`. Las 10 prohibiciones del framework existen solo como prosa en `README.md` | ✅ Sí | Guardrails |
| **P7** | **Ausencia de red de tests interna.** No hay runner de unit tests; `QueryBuilder` (273 líneas, crítico en seguridad) y `config/index.ts` (100 líneas de validación) tienen **cobertura cero** | ✅ Sí | Tests |

**Nota sobre P1:** hay una decisión de una línea que necesito de vos (ver §3-P1): o el historial **se trackea** (deja de ser referencia muerta) o **se mantiene local** y se limpian todos los punteros. Recomiendo la segunda, respetando la intención de quien agregó la regla a `.gitignore`.

---

## 2. Archivos afectados

### 2.1. Se modifican

| Archivo | Problema(s) | Naturaleza del cambio |
|---|---|---|
| `AGENTS.md` | P1, P2, P5 | Quitar 2 punteros muertos (`:50`, `:71`); actualizar el diagrama/descripción con `BaseComponent` |
| `README.md` | P1, P5, P7 | Quitar `docs/refactor-progress/` del árbol (`:133`) y el puntero de `:405`, más la nota de `:490`; documentar `BaseComponent` y el nuevo script de tests; corregir la frase "`quality` nunca corre tests" |
| `support/AGENTS-support.md` | P1, P2, P3 | Corregir la firma de `init()` (sin `storageState`, sin options); nota explícita "no existe capa de autenticación"; quitar punteros de `:53`, `:59` |
| `src/database/AGENTS-database.md` | P1 | Quitar punteros de `:42`, `:85`; reescribir menciones `T11`/`T12`/`T14` como rationale sin ID |
| `support/world.ts` | P3 | Eliminar `InitOptions` y el parámetro `options` de `init()` |
| `cucumber.js` | P1 | Reescribir el comentario `:1-9` conservando el rationale, sin el puntero a `T13` |
| `eslint.config.js` | P1, P6 | Quitar punteros `T17`/`T09`/`T10`; **agregar todos los guardrails** (§4) |
| `package.json` | P7 | Agregar `test:unit`; incorporarlo a `quality`; agregar `engines.node` |
| `.env.example` | P1 | Quitar "T13" del comentario `:2` |
| `.github/workflows/ci.yml` | P1 | Quitar "T13"/"T16" de los comentarios `:18`, `:22` |
| `.prettierignore` | P1 | Quitar el rationale con IDs `T17`/`T19`; mantener las reglas |
| `src/database/builders/QueryBuilder.ts` | P1 | Quitar "(see T12 report)" de `:181`, `:249` (conservando el texto explicativo) |
| `src/database/repositories/example/ExampleRepository.ts` | P1 | Quitar "(see T14 report)" de `:9`, `:27` |
| `src/database/types/db.types.ts` | P1 | Quitar "(see T12)" de `:27` |
| `src/database/clients/OracleDatabaseClient.ts` | P1 | Reescribir el comentario `:115` sin el ID `T11` |
| `support/hooks.ts` | P1 | Reescribir el comentario `:29` sin el ID `T11` |
| `src/pages/base/BasePage.ts` | P5 | Pasar a extender la base compartida; conserva navegación. **API pública sin cambios** |
| `src/pages/example/ExamplePage.ts` | P4 | Locator parametrizado a través de un factory privado |
| `src/components/example/ExampleNavigationComponent.ts` | P4, P5 | Pasar a extender `BaseComponent`; locator parametrizado por factory privado |
| `docs/framework-current-state.md` | P1 | Nota al inicio: cita un directorio local-only (evita ser una nueva fuente de referencias muertas) |

### 2.2. Se crean

| Archivo | Propósito |
|---|---|
| `src/base/BaseUiObject.ts` | Base compartida: acciones + esperas + assertions a nivel elemento (§3-P5) |
| `src/components/base/BaseComponent.ts` | Base de Components: `BaseUiObject` + `root: Locator` + scoping |
| `src/database/builders/QueryBuilder.test.ts` | Suite de seguridad de `QueryBuilder` (§5) |
| `src/config/index.test.ts` | Validación de configuración (§5) |
| `src/architecture.test.ts` | Reglas de arquitectura no expresables en ESLint (§4.3) |

### 2.3. NO se tocan

`tsconfig.json` (los tests bajo `src/**` ya quedan type-checked por el `include` actual), `features/**` (el `.feature` y los steps ya son correctos), `.gitignore`, `.vscode/settings.json`, `.prettierrc.json`, `src/pageContainer/Pages.ts`, `src/database/clients/DatabaseClient.ts`, `src/database/repositories/BaseRepository.ts`, `src/database/RepositoryContainer.ts`, `support/databaseLifecycle.ts`.

---

## 3. Cambio propuesto para cada problema

### P1 — Referencias muertas a `docs/refactor-progress/`

**Decisión que necesito de vos (una línea):**

| Opción | Consecuencia | Recomendación |
|---|---|---|
| **A — Mantener local + limpiar punteros** | El historial sigue siendo un archivo personal, gitignored. Se eliminan los 15 punteros de archivos trackeados | ✅ **Recomendada.** Respeta la intención explícita de `.gitignore:65` y elimina el problema de raíz |
| B — Trackear el directorio | Los 18 reportes históricos viajan con el repo; los punteros dejan de estar muertos | Válida, pero suma ~5.200 líneas de historial corporativo al repo y a lo que una IA puede leer |

**Cambio propuesto (opción A), con un criterio importante:** los comentarios con IDs `T##` **no se borran, se reescriben**. Casi todos contienen el *rationale* real (por qué el perfil de Cucumber es plano, por qué el lint no es type-aware, por qué la paginación es Oracle-specific). Borrar solo el puntero perdería la trazabilidad; borrar el comentario perdería el "por qué". La regla es: **el comentario debe explicarse solo, sin depender de un archivo externo.**

Ejemplo (`cucumber.js:1-9`):

```
ANTES: "... see docs/refactor-progress/T13-ui-example.md for the full trace.
        Exporting the flat profile object directly ..."
DESPUÉS: "... Nesting the profile under an extra `default: {}` key collides with
          that wrapper and silently breaks paths/import/loader resolution.
          Exporting the flat profile object directly ..."
```

Mismo criterio en `eslint.config.js` (el rationale de por qué se descartó `recommendedTypeChecked` se conserva íntegro, sin "see T17 report"), `QueryBuilder.ts`, `ExampleRepository.ts`, `db.types.ts`, `OracleDatabaseClient.ts`, `hooks.ts`, `.prettierignore`, `.env.example`, `ci.yml`.

En los `.md` (`AGENTS.md`, `README.md`, `AGENTS-support.md`, `AGENTS-database.md`) los punteros se **eliminan**, incluida la fila `docs/refactor-progress/` del árbol de proyecto en `README.md:133` y la sección de `README.md:490`.

**Detalle a no olvidar:** `docs/framework-current-state.md` (creado en la fase de inventario) cita ese directorio ~15 veces como fuente de su análisis. No se reescribe — se le agrega **una nota al inicio** aclarando que el directorio es local-only, para que no se convierta en una nueva fuente de referencias muertas.

---

### P2 — Documentación incorrecta de `storageState`

**Cambio:** reemplazar `support/AGENTS-support.md:27` por la firma real, que tras P3 queda sin options:

```
ANTES: **`init(options?: { storageStatePath?: string; headless?: boolean })`:**
       launches the configured browser ... (with `storageState` if
       `storageStatePath` is passed) ...

DESPUÉS: **`init()`:** launches the configured browser (`config.browser`,
         `config.headless`), creates a fresh `BrowserContext` and a `Page`,
         and builds `this.pages = new Pages(this.page)`. It takes no
         arguments and no options.
```

Y agregar una línea explícita en la sección de scope del módulo:

> **No existe capa de autenticación.** No hay `storageState`, ni login programático, ni reuso de sesión. Cualquier escenario que requiera autenticación necesita que esa capa se diseñe primero — no la improvises dentro de un Step ni de un hook.

**Por qué esta línea importa:** es la diferencia entre una IA que pregunta y una IA que inventa un `support/auth.ts` con credenciales hardcodeadas.

**Nota:** `README.md` menciona `storageState` en "Security and Secrets" ("nunca commitear archivos `storageState` generados"). Eso es una **prohibición**, no una afirmación de que exista. Se mantiene tal cual.

---

### P3 — Código muerto: `InitOptions.headless`

**Confirmado hoy:** `world.ts:10-12` declara el tipo; `hooks.ts:14` invoca `this.init()` sin argumentos; cero callers.

**Cambio (mínimo):** eliminar el tipo `InitOptions` y el parámetro completo.

```ts
// ANTES
type InitOptions = { headless?: boolean };
async init(options: InitOptions = {}): Promise<void> {
  const { headless = config.headless } = options;
  ...
  this.browser = await browserType.launch({ headless });

// DESPUÉS
async init(): Promise<void> {
  ...
  this.browser = await browserType.launch({ headless: config.headless });
```

**Criterio:** es exactamente el mismo tipo de superficie sin consumidor que la auditoría anterior eliminó (`storageStatePath`). Si mañana aparece una necesidad real de headless por escenario, se re-agrega **con su caller**. No dejamos parámetros especulativos: son justamente los que una IA interpreta como API a usar.

---

### P4 — Inconsistencias del ejemplo canónico de locators

**Matiz importante:** no es una inconsistencia gratuita. `heading` es un locator **estático** (va al constructor); el del link es **parametrizado** por `linkName` (no puede ser un campo del constructor). El ejemplo no está mal por construir el locator en el método — está mal por **no hacer explícita la distinción**, así que la IA copiará la forma inline también para locators estáticos.

**Cambio: hacer la convención explícita con un factory privado.**

```ts
// src/pages/example/ExamplePage.ts — DESPUÉS
export class ExamplePage extends BasePage {
  readonly navigation: ExampleNavigationComponent;

  // Locators estáticos: declarados una vez, en el constructor.
  private readonly heading: Locator;

  constructor(page: Page) {
    super(page);
    this.navigation = new ExampleNavigationComponent(page);
    this.heading = page.getByRole('heading', { level: 1 });
  }

  // Locators parametrizados: un factory privado con nombre, nunca un
  // locator inline dentro de un método de assertion.
  private linkByName(linkName: string): Locator {
    return this.page.getByRole('link', { name: linkName, exact: true });
  }

  async expectLinkVisible(linkName: string): Promise<void> {
    await this.waitForVisible(this.linkByName(linkName));
  }
}
```

Y el mismo patrón en `ExampleNavigationComponent` (con el locator acotado a `root`, ver P5):

```ts
private linkByName(linkName: string): Locator {
  return this.root.getByRole('link', { name: linkName, exact: true });
}
```

**Regla resultante, documentable en una línea:** *locator estático → campo `private readonly` en el constructor; locator parametrizado → método `private` que devuelve `Locator`. Nunca un locator inline dentro de un método de acción o assertion.*

---

### P5 — Separación `BasePage` / `BaseComponent`

**Problema concreto:** `ExampleNavigationComponent extends BasePage` le da a un componente `goto()`, `reload()` y `waitForUrlContains()` — capacidades de página completa. Es el único ejemplo de Component que existe, o sea: es el patrón que una IA va a replicar 30 veces.

**Opciones evaluadas:**

| Opción | Costo | Problema |
|---|---|---|
| (a) `BaseComponent` con sus propios wrappers | 1 archivo nuevo | Duplica ~8 wrappers de `BasePage` |
| (b) **Extraer base compartida; `BasePage` y `BaseComponent` la extienden** | 1 archivo nuevo + 2 ediciones | Ninguno relevante |
| (c) Composición (helper `UiActions` inyectado) | 3+ archivos, cambia todas las firmas | Sobreingeniería para 1 Page y 1 Component |

**Propuesta: opción (b).** Sin duplicación, sin ciclos, sin cambiar la API pública de `BasePage`.

```
src/base/BaseUiObject.ts        (NUEVO)  protected page; esperas + acciones + assertions a nivel elemento
   ├── src/pages/base/BasePage.ts        extends BaseUiObject; AGREGA goto/reload/waitForUrlContains
   └── src/components/base/BaseComponent.ts (NUEVO)  extends BaseUiObject; AGREGA `protected readonly root: Locator`
```

`BaseUiObject` recibe los 17 métodos de elemento que hoy están en `BasePage` (esperas, acciones, getters, validaciones). `BasePage` retiene únicamente los 3 de navegación. `BaseComponent`:

```ts
export abstract class BaseComponent extends BaseUiObject {
  protected readonly root: Locator;
  constructor(page: Page, root: Locator) {
    super(page);
    this.root = root;
  }
  async expectVisible(): Promise<void> {
    await this.waitForVisible(this.root);
  }
}
```

**Ganancia concreta:** un Component ya no puede navegar (no compila), y `root` vuelve el scoping el camino por defecto en lugar de una disciplina opcional. Hoy el scoping correcto de `ExampleNavigationComponent` depende de que quien lo escribió se acordara de usar `this.nav.getByRole(...)`.

**Ubicación de `src/base/`:** un directorio nuevo de un archivo. La alternativa (dejarlo en `src/pages/base/`) obligaría a que `src/components/**` importe desde `src/pages/**`, una dirección de dependencia que después no podríamos prohibir con ESLint. Vale el directorio.

**Este es el único ítem del plan que es legítimamente diferible** (YAGNI: hay un solo Component). Recomiendo hacerlo ahora precisamente porque el objetivo de la fase es que el ejemplo canónico sea correcto **antes** de que una IA lo multiplique.

---

### P6 — Guardrails

Ver §4 (tabla completa, mecanismo elegido y justificación por prohibición).

---

### P7 — Tests internos mínimos

Ver §5 (runner, alcance, límites verificados).

---

## 4. Guardrails ejecutables recomendados

**Criterio aplicado:** el mecanismo más simple que **verifique automáticamente**. Documentación **solo** cuando ninguna herramienta puede verificarlo. Cero dependencias nuevas.

### 4.1. Tabla de decisión

| # | Prohibición | Mecanismo | Por qué ese y no otro | Verificado |
|---|---|---|---|---|
| G1 | **`*.spec.ts` E2E** | **ESLint** override `files: ['**/*.spec.ts']` + `no-restricted-syntax` con selector `Program` (dispara siempre, mensaje explícito) | ESLint no puede chequear existencia de archivos, pero **sí** puede fallar sobre cualquier archivo que matchee el patrón. Error inmediato en el editor, sin script nuevo. **+ chequeo fs en el architecture test** como defensa en profundidad (cubre directorios ignorados por ESLint) | ✅ dispara |
| G2 | **`playwright.config.ts`** | **ESLint** override `files: ['**/playwright.config.*']`, mismo patrón `Program`. **+ chequeo fs** en el architecture test | Idem G1 | ✅ dispara |
| G3 | **Playwright Test como runner** | **ESLint** `no-restricted-imports` con `importNames: ['test','describe','it','beforeAll','beforeEach','afterAll','afterEach']` sobre `@playwright/test` | **Es el guardrail más importante del plan y es estructural:** mata el runner sin romper el uso legítimo (`expect` + tipos siguen permitidos). Verificado: banea `test`, deja pasar `expect` y `type Page/Locator`. **+** el architecture test verifica que ningún script de `package.json` invoque `playwright test` | ✅ dispara |
| G4 | **Locators en Step Definitions** | **ESLint**, override `features/steps/**`: `no-restricted-imports` (bloquea `playwright`, `@playwright/test`, y por patrón `**/src/pages/*`, `**/src/components/*`) **+** `no-restricted-syntax` bloqueando `this.page`, `this.context`, `this.browser` | El ban de imports solo no alcanza: `CustomWorld.page` es público, así que un step podría hacer `this.page.getByRole(...)` **sin ningún import**. El selector `MemberExpression[object.type='ThisExpression'][property.name='page']` cierra ese agujero de forma precisa | ✅ dispara |
| G5 | **`expect()` en Step Definitions** | **ESLint** — cubierto por el mismo ban de `@playwright/test` en `features/steps/**` (G4) | `@playwright/test` es la **única** fuente de `expect` en el repo: prohibir el import elimina el `expect`. Sin regla extra | ✅ dispara |
| G6 | **SQL en Step Definitions** | **TypeScript (ya vigente)** + ESLint (ban de `**/src/database/*` en steps, incluido en G4) + **documentación** | **Deliberadamente NO agregamos un regex de keywords SQL** (frágil, falsos positivos). Un step hoy es estructuralmente **incapaz** de ejecutar SQL: `RepositoryContainer.client` es `private`, y `select/insert/update/delete/executeProcedure` de `BaseRepository` son `protected`. La única vía sería un método de dominio que acepte un string SQL — eso es regla de code review, no de linter | ✅ ya vigente (TS2341) |
| G7 | **`oracledb` fuera de la implementación DB** | **ESLint** `no-restricted-imports` global sobre `oracledb`, con override permitiéndolo en `src/database/clients/**` **+** assertion en el architecture test | El código actual carga el driver con `createRequire()('oracledb')`, que un `no-restricted-imports` no ve; el ban igual bloquea cualquier `import ... from 'oracledb'` nuevo, y el test fs cubre el `require` | ✅ dispara |
| G8 | **`process.env` fuera de config** | **ESLint** `no-restricted-properties` (`object: 'process'`, `property: 'env'`), con override permitiéndolo en `src/config/**` **y en `**/*.test.ts`** | Verificado: cubre `process.env.X` y `process.env[name]`. **La whitelist de tests es obligatoria** — sin ella el propio test de config falla al lint (lo comprobé). Hueco conocido: `const { env } = process` lo evade; no vale complejidad extra | ✅ dispara |
| G9 | **`waitForTimeout`** | **ESLint** `no-restricted-syntax`, selector `CallExpression[callee.property.name='waitForTimeout']` | Preciso y sin falsos positivos. **Atención al gotcha de §4.4:** hay que re-declararlo en cada override que use `no-restricted-syntax` | ✅ dispara |
| G10 | **Lógica de negocio en `CustomWorld`** | **Architecture test** (assertion sobre las propiedades declaradas en `support/world.ts` contra una allowlist) | No es expresable en ESLint de forma razonable. `world.ts` son 50 líneas estables, así que una assertion sobre sus declaraciones de propiedades es simple y precisa. Falla con un mensaje que dice qué hacer: *"usá `this.testContext`, no un campo nuevo en CustomWorld"* | Diseño |

### 4.2. Reglas ESLint — forma de implementación

Para evitar el gotcha de §4.4, las listas de prohibiciones se declaran **una sola vez** como constantes al principio de `eslint.config.js` y se re-expanden en cada override:

```js
// eslint.config.js — forma propuesta (esquema, no implementación final)
const BANNED_SYNTAX_BASE = [
  { selector: "CallExpression[callee.property.name='waitForTimeout']",
    message: 'waitForTimeout está prohibido: usá web-first assertions (expect(locator).toBeVisible()).' },
];

const BANNED_SYNTAX_STEPS = [
  ...BANNED_SYNTAX_BASE,               // <-- imprescindible: los overrides NO heredan
  { selector: "MemberExpression[object.type='ThisExpression'][property.name=/^(page|context|browser)$/]",
    message: 'Un Step no toca this.page/context/browser: usá this.pages.<page>.<método>().' },
];
```

Overrides necesarios, en este orden:

1. **Base** (`**/*.ts`): G3, G7, G8, G9.
2. **`src/config/**`**: relaja G8 (es el único lector legítimo de env).
3. **`**/*.test.ts`**: relaja G8 (los tests de config escriben env).
4. **`src/database/clients/**`**: relaja G7.
5. **`support/world.ts`**: único lugar autorizado a importar los launchers de `playwright`.
6. **`features/steps/**`**: G4 + G5 + G6 (imports) y `BANNED_SYNTAX_STEPS`.
7. **`**/*.spec.ts`**: G1.
8. **`**/playwright.config.*`**: G2.

Se conserva intacto lo que ya existe: `no-explicit-any: error`, su override de archivo único para `OracleDatabaseClient.ts`, `no-unused-vars`, y `eslintConfigPrettier` **último**.

### 4.3. Architecture test — solo lo que ESLint no puede ver

Un único archivo (`src/architecture.test.ts`), con `node:test` + `node:fs` (`readdirSync(root, { recursive: true })`, verificado disponible). Sin dependencias, sin parser, sin AST:

| Assertion | Qué previene |
|---|---|
| No existe ningún `playwright.config.*` en el repo | Runner paralelo (respaldo de G2, cubre directorios que ESLint ignora) |
| No existe ningún `*.spec.ts` | Suite E2E paralela (respaldo de G1) |
| Ningún script de `package.json` invoca `playwright test` | Cucumber sigue siendo el único runner E2E |
| `setWorldConstructor` aparece **solo** en `support/world.ts` | Worlds paralelos (el problema `EtiquetasWorld` que ya costó un refactor) |
| Las propiedades declaradas en `CustomWorld` ⊆ `{browser, context, page, pages, repositories, testContext}` | G10: lógica/estado de negocio en el World |
| `'oracledb'` solo se menciona en `src/database/clients/OracleDatabaseClient.ts` | G7 incluyendo la vía `createRequire` |
| Todo `.feature` tiene al menos un tag | Convención de tags (hoy definida solo en prosa) |

### 4.4. Dos gotchas verificados que condicionan la implementación

**R1 — Los overrides reemplazan, no fusionan.** Probé un override en `**/steps/**` que declaraba `no-restricted-syntax` con su propio selector: el archivo tenía `this.page.waitForTimeout(500)` y ESLint reportó **solo** "no this.page", **no** el ban de `waitForTimeout`. El override desactivó silenciosamente la regla base. → Mitigación: constantes compartidas re-expandidas (§4.2) **+** un fixture de verificación durante la implementación.

**R2 — `no-restricted-properties` sobre `process.env` rompe el test de config.** El test de config necesita escribir `process.env` antes de cada import. Sin el override de `**/*.test.ts`, `npm run lint` falla con 10 errores en el propio test. → Mitigación: override explícito (paso 3 de §4.2).

---

## 5. Tests mínimos del framework

### 5.1. Runner: `node --test` nativo — cero dependencias nuevas

| Candidato | Resultado | Decisión |
|---|---|---|
| **`node --test` + type stripping nativo (Node 24)** | **PASS** verificado con `QueryBuilder` y `config` | ✅ **Elegido** |
| `ts-node/esm` (ya es dependencia) + `node:test` | **FALLA** en Node 24: `ERR_REQUIRE_CYCLE_MODULE` | ❌ Descartado |
| vitest / jest / tsx | Funcionarían | ❌ Dependencia nueva innecesaria |

Script propuesto: `"test:unit": "node --test \"src/**/*.test.ts\""`.

**Requisito de versión:** el type stripping requiere Node ≥ 22.18 / 24. CI ya usa Node 24; local es 24.13.1. Propongo agregar `engines: { "node": ">=22.18" }` a `package.json` para que un dev con Node más viejo reciba un mensaje claro en lugar de un error de parseo incomprensible.

### 5.2. Límite verificado que define el alcance

El type stripping **no transpila**, solo borra tipos. Por eso **no puede cargar**:

- **parameter properties** → `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Afecta a `BaseRepository` (`constructor(protected readonly client: DatabaseClient)`) y `RepositoryContainer`.
- **especificadores `.js` que resuelven a `.ts`** → `ERR_MODULE_NOT_FOUND`. Afecta a casi todo el grafo de imports en runtime del repo (convención NodeNext).

**Consecuencia (no es un problema, es un alcance):** los módulos testeables hoy sin loader son exactamente los que más valor tienen:

| Módulo | Testeable | Por qué |
|---|---|---|
| `QueryBuilder.ts` | ✅ | Solo tiene `import type` → se borra completo, no hay resolución en runtime |
| `config/index.ts` | ✅ | Su único import runtime es `dotenv` (bare specifier) |
| `architecture.test.ts` | ✅ | Solo usa `node:fs` |
| `BaseRepository`, `RepositoryContainer`, `world`, Pages/Components | ❌ hoy | Parameter properties y/o especificadores `.js` |

`BaseRepository` son 37 líneas de delegación pura y `RepositoryContainer` 15 de composición: cobertura de bajo valor. Si en el futuro los queremos testear, hará falta un loader moderno (dependencia nueva) — **fuera de esta fase** (§10).

### 5.3. Suites propuestas

**A. `src/database/builders/QueryBuilder.test.ts` — el test más importante del plan** (273 líneas de construcción de SQL, hoy con cobertura cero):

| Grupo | Casos |
|---|---|
| Binds (valores nunca interpolados) | `=` genera `:ID_0` y el valor viaja en `binds`; el valor **no aparece** en el string SQL; `IN` genera un bind por valor; `BETWEEN` genera exactamente dos |
| Allowlist de identificadores | campo fuera de la allowlist → `QueryBuilderError`; identificador con forma maliciosa (`"users; DROP TABLE users"`) rechazado **incluso si está inyectado en la allowlist**; tabla fuera de allowlist rechazada |
| Operadores | operador arbitrario (caller que ignora TypeScript) rechazado; `AND`/`OR` validados en runtime |
| Casos límite | `IN []` rechazado; `BETWEEN` con 1 o 3 valores rechazado; `IS NULL`/`IS NOT NULL` no generan bind; `filters: []` devuelve `{ clause: '', binds: {} }` |
| Escrituras | `buildUpdate` **sin filtros** rechazado (nunca un UPDATE sin WHERE); `buildInsert` sin columnas rechazado; columnas validadas contra allowlist |
| `ORDER BY` / paginación | dirección distinta de `ASC`/`DESC` rechazada; límite de paginación no entero positivo rechazado |

~15-18 casos. La especificación ya existe (los ~37 casos de la validación histórica): esto es recuperarla como tests reales y permanentes.

**B. `src/config/index.test.ts`** — verificado que funciona con import dinámico + query de cache-busting (`import(url + '?case=N')`), necesario porque `config` valida en tiempo de import:

`HEADLESS` no booleano → throw · `BROWSER` desconocido → throw · `DEFAULT_TIMEOUT_MS` no entero positivo → throw · `DB_ENABLED=true` sin credenciales → throw listando **solo nombres** (nunca valores) · `DB_ENABLED=false` no exige credenciales · `requireBaseUrl()` sin `BASE_URL` → error claro · defaults correctos (`headless: true`, `chromium`, `120000`).

~8 casos.

**C. `src/architecture.test.ts`** — las 7 assertions de §4.3.

### 5.4. Integración en el gate

Propongo que `quality` **incluya** los tests unitarios:

```
"test:unit": "node --test \"src/**/*.test.ts\"",
"quality":   "npm run typecheck && npm run lint && npm run format:check && npm run test:unit"
```

**Por qué:** el guardrail más fuerte frente a una IA es que exista **un único comando que debe pasar**. Corren en <1s y no necesitan browser ni red. Requiere corregir la frase de `README.md` ("`quality` es un gate puramente estático — nunca corre la suite de tests"), que dejaría de ser cierta.

**Alternativa** si preferís mantener `quality` estático: dejarlo como está y agregar `"verify": "npm run quality && npm run test:unit"`, usando `verify` como el gate de CI y de IA. Funciona igual; me quedo con la primera por simplicidad de instrucción.

CI: si los tests van dentro de `quality`, el workflow **no necesita cambios** (ya ejecuta `npm run quality`).

---

## 6. Correcciones del ejemplo canónico

Después de esta fase, el ejemplo debe enseñar **una sola forma correcta** de cada cosa. Resumen de lo que cambia:

| Aspecto | Hoy enseña | Debe enseñar |
|---|---|---|
| Locator estático | Campo `private readonly` en constructor ✅ | Igual (sin cambios) |
| Locator parametrizado | Construcción inline dentro del método de assertion ❌ | Método `private linkByName(name): Locator` |
| Base de un Component | `extends BasePage` (hereda navegación) ❌ | `extends BaseComponent` (sin navegación, con `root`) |
| Scoping de un Component | Disciplina manual (`this.nav.getByRole`) 🟡 | `this.root` como camino por defecto |
| Composición Page→Component | Propiedad `readonly` en el constructor ✅ | Igual (sin cambios) |
| Step Definition | 5 delegaciones de una línea ✅ | Igual (sin cambios) |
| Navegación | `requireBaseUrl()` desde config ✅ | Igual (sin cambios) |

**Fuera de esta fase, a propósito** (§10): agregar un step `When`, un `Scenario Outline`, una data table, un uso real de `testContext`, o un `buildInsert`/`buildUpdate` en uso. Son **patrones nuevos**, no correcciones del ejemplo actual, y el pedido de esta fase es sanear lo que ya existe. Los sigo considerando necesarios antes de habilitar generación automática de escenarios.

---

## 7. Riesgos

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| **R1** | **Los overrides de ESLint reemplazan reglas en lugar de fusionarlas** (verificado: un override en steps desactivó el ban de `waitForTimeout`) | **Alto** — creeríamos tener un guardrail que no existe | Constantes compartidas re-expandidas (§4.2) + fixture de violación por regla durante la implementación, verificando que **cada** regla dispara donde debe |
| **R2** | **`no-restricted-properties` sobre `process.env` rompe el test de config** (verificado: 10 errores de lint) | Medio — bloquea el paso 3 | Override de `**/*.test.ts` incluido desde el inicio |
| **R3** | **El refactor de `BasePage` toca el archivo más copiado del framework** | Medio | API pública idéntica; se hace **último**, con los tests ya en su lugar; validación con `npm test` (2 escenarios / 6 steps) |
| **R4** | **Guardrails demasiado agresivos bloquean código legítimo.** Ej.: banear `**/src/pages/*` en steps también banea importar un *tipo* de Page | Medio | Hoy los steps solo importan el tipo `CustomWorld` desde `support/`, así que no rompe nada. Si mañana un step necesita un tipo de dominio, el lugar correcto es `support/` o un módulo de tipos — no `src/pages/**` |
| **R5** | **El type stripping nativo limita el alcance de los tests** (sin `BaseRepository`, `world`, Pages) | Bajo | Alcance explícito y declarado (§5.2). Cobertura donde está el riesgo real (`QueryBuilder`) |
| **R6** | **Dependencia de la versión de Node** para `node --test` con TS | Bajo | `engines.node >= 22.18`; CI ya usa 24 |
| **R7** | **Borrar los punteros `T##` puede perder el rationale** de decisiones no obvias | Medio | Regla explícita: **reescribir, no borrar** — el comentario debe explicarse solo (§3-P1) |
| **R8** | **Meter tests dentro de `quality` contradice la documentación actual** | Bajo | Corregir la frase de `README.md`; o usar la alternativa `verify` (§5.4) |
| **R9** | **El architecture test que lee `world.ts` con regex es sensible al formato** | Bajo-Medio | Se aplica a un archivo de 50 líneas, estable, con Prettier fijando el formato; el mensaje de error explica qué hacer. Si diera falsos positivos, se acota a leer solo el cuerpo de la clase |
| **R10** | **Un nuevo directorio `src/base/`** agrega una tercera ubicación UI | Bajo | Un solo archivo; la alternativa (components importando de pages) crea una dirección de dependencia que después no podríamos prohibir |
| **R11** | **`npm test` escribe artefactos y depende de un sitio externo** (`playwright.dev`) | Bajo | Los artefactos están gitignorados. Si la validación E2E falla por red, se distingue del cambio revisando que el error sea de conectividad — no se "arregla" debilitando assertions |
| **R12** | **Ningún guardrail impide que una IA edite `eslint.config.js`** para desactivar los bans | Medio | Fuera del alcance técnico de esta fase (es política de permisos de agente, §10). El architecture test sí sobrevive a cambios en los `ignores` de ESLint, lo que cubre el caso accidental |

---

## 8. Orden exacto de implementación

Principio: **primero la red, después los refactors.** Los pasos 1-2 no tienen riesgo de comportamiento; el paso 6 es el único que toca el runtime UI y llega con tests y guardrails ya activos.

| Paso | Qué | Problemas | Riesgo |
|---|---|---|---|
| **1** | **Saneamiento documental y de código muerto.** Reescribir los ~29 punteros muertos (P1, criterio "reescribir, no borrar"); corregir `AGENTS-support.md` (P2); eliminar `InitOptions` de `world.ts` (P3); nota en `framework-current-state.md` | P1, P2, P3 | Nulo |
| **2** | **Runner de tests + suites de `QueryBuilder` y `config`.** Agregar `test:unit`, `engines.node`, y las dos suites. Todavía **sin** integrar a `quality` | P7 (parcial) | Nulo (solo agrega) |
| **3** | **Guardrails ESLint.** Constantes compartidas + los 8 overrides (§4.2). Verificar **cada** regla con un fixture temporal y confirmar que R1 no ocurrió | P6 (G1-G9) | Medio — es donde vive R1/R2 |
| **4** | **Architecture test** (§4.3) + integrar `test:unit` a `quality` + corregir la frase de `README.md` | P6 (G10), P7 | Bajo |
| **5** | **Corrección del ejemplo canónico de locators** (factories privados en `ExamplePage` y en el Component) | P4 | Bajo |
| **6** | **Extracción de `BaseUiObject` + `BaseComponent`** y migración del Component | P5 | Medio — el más invasivo, por eso último |
| **7** | **Documentación final.** `README.md` y `AGENTS.md`: `BaseComponent`, la regla de locators, el comando de tests, y las prohibiciones ahora verificadas automáticamente | — | Nulo |

**Por qué el paso 3 va después del 2:** los guardrails cambian `eslint.config.js`, y R2 se manifiesta precisamente como un fallo de lint **en los tests del paso 2**. Con los tests ya escritos, el problema aparece de inmediato y se corrige con el override, en lugar de descubrirse más tarde.

**Por qué el paso 6 va último:** es el único que modifica jerarquía de clases en runtime. Cuando llega, ya tenemos `npm run quality` con tests + architecture test + los 2 escenarios de Cucumber como red.

---

## 9. Validación después de cada cambio

### 9.1. Comandos por paso

| Paso | Validación | Resultado esperado |
|---|---|---|
| 1 | `npm run quality` · `npm test` · `git ls-files` cruzado contra los punteros: `grep -rIn "refactor-progress\|\bT[0-9]\{2\}\b"` sobre archivos trackeados | quality PASS; 2 escenarios / 6 steps PASS; **0 punteros muertos** |
| 2 | `npm run test:unit` · `npm run typecheck` · `npm run lint` | Todos los casos PASS; los tests type-checkean (quedan dentro del `include` de `tsconfig`); lint **fallará** por R2 → confirma la necesidad del override del paso 3 |
| 3 | `npm run lint` · **fixture por regla**: crear temporalmente un archivo que viole cada guardrail (G1-G9) y confirmar que ESLint reporta **cada uno**, con foco en que `waitForTimeout` sigue disparando **dentro de `features/steps/**`** (R1) · borrar los fixtures · `npm run quality` | Cada regla dispara donde debe y **no** dispara donde es legítima (`expect` desde `@playwright/test`; `process.env` en `src/config/**` y en tests; `oracledb` en `src/database/clients/**`) |
| 4 | `npm run quality` (ya incluye `test:unit`) · verificación negativa: crear temporalmente `playwright.config.ts`, un `x.spec.ts` y un segundo `setWorldConstructor`, confirmar que el architecture test **falla** en los tres casos, y borrarlos | El gate falla cuando debe y vuelve a PASS al limpiar |
| 5 | `npm run quality` · `npm test` | PASS; los 2 escenarios siguen verdes (mismo comportamiento, misma semántica `exact: true`) |
| 6 | `npm run quality` · `npm test` · revisión de que `BasePage` conserva su API pública y que `BaseComponent` **no** expone `goto`/`reload`/`waitForUrlContains` (debe fallar el typecheck si se intenta) | PASS; el intento de navegar desde un Component **no compila** |
| 7 | `npm run quality` · verificación de que cada comando y cada path citado en `README.md`/`AGENTS.md` existe | PASS; 0 referencias inválidas |

### 9.2. Gate final de la fase

```
npm ci
npm run quality      # typecheck + lint + format:check + test:unit
npm test             # 2 escenarios / 6 steps
```

Más tres verificaciones negativas (crear la violación → confirmar el fallo → borrarla): `playwright.config.ts`, `foo.spec.ts`, y un step con `this.page.getByRole(...)`.

**Nota:** `npm test` escribe `reports/cucumber/*` (gitignorado) y necesita alcanzar `https://playwright.dev`. Un fallo de red **no** debe "arreglarse" ajustando assertions.

---

## 10. Qué queda explícitamente fuera de esta fase

### 10.1. Excluido por instrucción

MCP (instalación o configuración) · agentes especializados · `.claude/` · `CLAUDE.md` · automatizaciones/escenarios nuevos · `playwright.config.ts` · tests E2E `*.spec.ts` · cambiar el runner.

> Sobre `CLAUDE.md`: no está en la lista de 7 problemas de esta fase, así que queda para la siguiente. El orden es intencional y conviene: **los guardrails de §4 son el prerequisito que vuelve a `CLAUDE.md` algo verificable** en lugar de una lista de deseos. Escribir primero las reglas en código y después el documento que las explica es el orden correcto.

### 10.2. Excluido por alcance (sigue siendo necesario, en fases posteriores)

| Área | Detalle | Por qué no ahora |
|---|---|---|
| **Screenshots / traces** | Evidencia de fallo en el `After` hook vía `BrowserContext` | Es una capacidad nueva, no un saneamiento. Confirmo que **no requiere `playwright.config.ts`**: se implementa con `context.tracing.start/stop` y `page.screenshot()` dentro del lifecycle de Cucumber, adjuntando con `this.attach()` |
| **Logging estructurado** | Niveles + query/binds en la capa DB con redacción | Capacidad nueva |
| **Test Data Management** | Factories, datos únicos, namespacing, cleanup | Capacidad nueva; sigue siendo prerequisito de paralelismo |
| **Capa de API** | Client, auth, schema validation | Capacidad nueva |
| **Autenticación / `storageState`** | En esta fase solo se **corrige la documentación** que afirma que existe; no se implementa | Requiere decisiones de ambiente y secretos |
| **Patrones de referencia faltantes** | Step `When`, `Scenario Outline`, data table, uso de `testContext`, `buildInsert`/`buildUpdate`, feature `@db` | Son patrones **nuevos**, no correcciones del ejemplo actual (§6). Necesarios antes de habilitar generación automática de escenarios |
| **Tests de `BaseRepository` / `RepositoryContainer` / Pages** | Bloqueados por el type stripping nativo (§5.2); requerirían un loader (dependencia nueva) | Cobertura de bajo valor hoy; no justifica una dependencia |
| **Paralelismo y retries** | `parallel`, `retry`, `retryTagFilter` | Depende de Test Data |
| **CI ampliado** | Matriz de browsers, job `@db`, split smoke/regression, `schedule` | Capacidad nueva |
| **`tsconfig` más estricto / lint type-aware** | `noUncheckedIndexedAccess`, `no-floating-promises`, etc. | Mejora real, pero no está entre los 7 problemas y generaría ruido de diff en paralelo a los guardrails |
| **Matriz de ambientes** | `ENV=qa\|uat`, URLs y credenciales por ambiente | Capacidad nueva |
| **Reemplazar el target externo** (`playwright.dev`) | App demo local o pineada | Decisión de infraestructura |
| **Allure / reporting rico** | — | Capacidad nueva |
| **Husky / lint-staged / CODEOWNERS** | — | Los guardrails ya corren en `quality` y en CI |
| **Política de permisos de agente** | Qué archivos puede tocar cada agente (R12: nada impide que una IA edite `eslint.config.js`) | Pertenece a la fase de diseño de agentes |
