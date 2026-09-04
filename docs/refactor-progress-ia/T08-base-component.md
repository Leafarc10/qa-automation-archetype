# T08 — BasePage / BaseComponent Separation

**Date:** 2026-09-04
**Status:** ✅ COMPLETED
**Branch:** `feature/ai-foundation`

---

## 1. Objetivo

Resolver únicamente P5 del AI Foundation Plan: `ExampleNavigationComponent extends BasePage` le daba a un Component capacidades exclusivas de una página completa (`goto`, `reload`, `waitForUrlContains`) — el único ejemplo del repo enseñaba el patrón incorrecto. Separar correctamente las responsabilidades mediante:

```
BaseUiObject
├── BasePage
└── BaseComponent
```

Sin duplicar wrappers (`click`/`fill`/`waitForVisible`/etc. deben vivir en un único lugar) y sin cambiar ningún comportamiento funcional existente — es un refactor de **estructura de clases**, no de lógica ni de locators (eso ya se resolvió en [[T07-canonical-locators]]).

---

## 2. Estado inicial

Antes de editar nada se leyó completo: `src/pages/base/BasePage.ts`, `src/pages/example/ExamplePage.ts`, `src/components/example/ExampleNavigationComponent.ts` y `src/pageContainer/Pages.ts`.

- `git status`/`git diff` en blanco: working tree limpio ([[T07-canonical-locators]] ya commiteado fuera de esta sesión, confirmado por `git log`).
- `BasePage.ts` (112 líneas): una única clase con 20 métodos (contados exactos, ver §3), sin ninguna separación de responsabilidades — todo vive en el mismo archivo, incluidos los 3 métodos exclusivos de página completa mezclados entre los 17 métodos genéricos de UI.
- `ExampleNavigationComponent extends BasePage`: heredaba, sin usarlos nunca, `goto`, `reload` y `waitForUrlContains` — exactamente el problema que describe P5.
- `ExamplePage.ts` y `Pages.ts`: sin ningún acoplamiento a la jerarquía de clases más allá de `extends BasePage` / `new ExamplePage(page)` — no dependían de ningún detalle interno de `BasePage` que este refactor pudiera romper.

---

## 3. Clasificación de responsabilidades de BasePage

Inventario completo de los 20 métodos de `BasePage.ts` (confirmado contra el código real, no asumido del plan):

| Método | Firma | Opera sobre | Clasificación |
|---|---|---|---|
| `goto` | `(url: string)` | `this.page` | **B — exclusivo de Page** |
| `reload` | `()` | `this.page` | **B — exclusivo de Page** |
| `waitForUrlContains` | `(text: string)` | `this.page` | **B — exclusivo de Page** |
| `waitForVisible` | `(locator: Locator)` | `Locator` | A — compartido |
| `waitForHidden` | `(locator: Locator)` | `Locator` | A — compartido |
| `waitForEnabled` | `(locator: Locator)` | `Locator` | A — compartido |
| `click` | `(locator: Locator)` | `Locator` | A — compartido |
| `fill` | `(locator: Locator, text: string)` | `Locator` | A — compartido |
| `clear` | `(locator: Locator)` | `Locator` | A — compartido |
| `check` | `(locator: Locator)` | `Locator` | A — compartido |
| `uncheck` | `(locator: Locator)` | `Locator` | A — compartido |
| `pressEnter` | `(locator: Locator)` | `Locator` | A — compartido |
| `clearAndFill` | `(locator: Locator, text: string)` | `Locator` | A — compartido |
| `getText` | `(locator: Locator)` | `Locator` | A — compartido |
| `getInputValue` | `(locator: Locator)` | `Locator` | A — compartido |
| `expectText` | `(locator: Locator, text: string)` | `Locator` | A — compartido |
| `expectContainsText` | `(locator: Locator, text: string)` | `Locator` | A — compartido |
| `expectValue` | `(locator: Locator, value: string)` | `Locator` | A — compartido |
| `expectChecked` | `(locator: Locator)` | `Locator` | A — compartido |
| `expectNotChecked` | `(locator: Locator)` | `Locator` | A — compartido |

**Resultado: 3 métodos exclusivos de Page (B), 17 métodos compartidos (A).** El criterio de clasificación real, verificado línea por línea, coincide exactamente con la referencia conceptual de la tarea: los 3 métodos B son los únicos que operan directamente sobre `this.page`; los 17 métodos A son los únicos que reciben un `Locator` como parámetro y nunca tocan `this.page` directamente (salvo a través del propio `Locator` recibido).

---

## 4. Arquitectura resultante

```
src/base/BaseUiObject.ts                 (17 métodos compartidos + protected readonly page)
        ↑
        ├── src/pages/base/BasePage.ts            (3 métodos exclusivos de Page)
        └── src/components/base/BaseComponent.ts  (protected readonly root; sin métodos propios)
                ↑
                └── src/components/example/ExampleNavigationComponent.ts
```

`src/pages/example/ExamplePage.ts` sigue extendiendo `BasePage` sin cambios.

---

## 5. BaseUiObject

`src/base/BaseUiObject.ts` (nuevo). Contiene únicamente los 17 métodos clasificados como A en §3, agrupados en las mismas cuatro secciones que ya existían en `BasePage.ts` (Esperas, Acciones, Obtener Valores, Validaciones) — se preservó el agrupamiento original, no se reordenó nada.

- `protected readonly page: Page`, asignada en el constructor con una propiedad explícita (`this.page = page`), **no** con una parameter property (`constructor(private readonly page: Page)`), tal como pedía la tarea explícitamente: las parameter properties son azúcar sintáctico de TypeScript que requiere transformación, no son "erasable syntax" — el runner nativo (`node --test` sobre `.ts`, usado desde [[T03-querybuilder-unit-tests]]) depende de que el código fuente use únicamente sintaxis que Node pueda *quitar* sin reescribir. La propiedad explícita + asignación en constructor es exactamente el patrón que `BasePage.ts` ya usaba antes de T08 (`protected page: Page; constructor(page: Page) { this.page = page; }`) — T08 solo le agregó `readonly` (una restricción de solo-compilación, sin efecto en runtime).
- Import: `import { expect } from '@playwright/test'; import type { Locator, Page } from '@playwright/test';` — `expect` es un valor real (se invoca); `Locator`/`Page` son anotaciones de tipo puras, nunca usadas como valor dentro del archivo, así que se importan con `import type`, seed que además ya era el estilo usado en `ExamplePage.ts`/`ExampleNavigationComponent.ts` antes de T08.

Ningún método fue reescrito: cada uno de los 17 se movió literalmente (mismo cuerpo, mismos nombres, mismos parámetros, mismos retornos).

---

## 6. BasePage

`src/pages/base/BasePage.ts` (refactorizado). Ahora:

```ts
export class BasePage extends BaseUiObject {
  constructor(page: Page) {
    super(page);
  }

  async goto(url: string) { ... }
  async reload() { ... }
  async waitForUrlContains(text: string) { ... }
}
```

Conserva únicamente los 3 métodos clasificados como B en §3 (`goto`, `reload`, `waitForUrlContains`), sin cambios de nombre, parámetros, retorno, semántica ni timeouts — son exactamente los mismos cuerpos que tenía antes, solo que ahora heredan `this.page` de `BaseUiObject` en lugar de declararlo localmente. La API pública/protected que `ExamplePage` ya usaba (`this.goto`, `this.waitForVisible`, `this.expectContainsText`, `this.page`) sigue funcionando exactamente igual a través de la cadena de herencia `ExamplePage → BasePage → BaseUiObject` — **`ExamplePage.ts` no requirió ningún cambio** (confirmado: no aparece en `git status`).

---

## 7. BaseComponent

`src/components/base/BaseComponent.ts` (nuevo):

```ts
export class BaseComponent extends BaseUiObject {
  protected readonly root: Locator;

  constructor(page: Page, root: Locator) {
    super(page);
    this.root = root;
  }
}
```

Aporta exactamente lo que pedía la tarea, ni más ni menos:

- identidad de Component (una clase separada de `BasePage`, con su propio nombre en la jerarquía);
- `root` scoped, como `Locator`, recibido en el constructor y delegando `page` a `BaseUiObject` vía `super(page)`;
- acceso a las 17 capacidades compartidas de `BaseUiObject` por herencia.

**Sin APIs especulativas.** No se agregó `expectVisible()`, `clickRoot()`, `findChild()` ni ningún otro método — `BaseComponent` no declara ningún método propio, solo la propiedad `root` y el constructor. Cualquier necesidad futura de un Component concreto (como `expectVisible()` en `ExampleNavigationComponent`) sigue viviendo en la clase concreta, no en la base, hasta que exista una segunda necesidad real que justifique moverlo.

---

## 8. Migración de ExampleNavigationComponent

`src/components/example/ExampleNavigationComponent.ts`:

- `extends BasePage` → `extends BaseComponent`.
- El constructor ahora pasa el locator raíz directamente a `super(page, root)`: `super(page, page.getByRole('navigation', { name: 'Main' }))`, en lugar de llamar `super(page)` y después asignar `this.nav = page.getByRole(...)` en una segunda línea.
- La propiedad privada `nav` se **eliminó** — quedaba completamente redundante con el `root` heredado de `BaseComponent`; no se mantienen dos representaciones del mismo locator raíz, tal como exigía la tarea explícitamente.
- `expectVisible()` y `linkByName()` ahora usan `this.root` en lugar de `this.nav` — sin ningún otro cambio.
- Import de `BasePage` (`'../../pages/base/BasePage.js'`) reemplazado por `BaseComponent` (`'../base/BaseComponent.js'`) — el Component **ya no importa nada de `src/pages/**`**, tal como exigía la dirección de dependencias objetivo.

**Semántica de locators preservada exactamente** (heredada intacta de [[T07-canonical-locators]]): mismo rol (`'navigation'`/`'link'`), mismo `name` (`'Main'`/el parámetro `linkName`), mismo `exact: true`, mismo scoping (el link sigue construyéndose a partir del root de navegación, nunca de `this.page` directamente).

---

## 9. Archivos creados/modificados

**Creados:**
- `src/base/BaseUiObject.ts`
- `src/components/base/BaseComponent.ts`

**Modificados:**
- `src/pages/base/BasePage.ts`
- `src/components/example/ExampleNavigationComponent.ts`

**Sin cambios** (confirmado, no aparecen en `git status`):
- `src/pages/example/ExamplePage.ts`
- `src/pageContainer/Pages.ts`
- Cualquier Step o Feature.

---

## 10. Qué NO cambió

- ✅ Cucumber sigue siendo el único runner E2E; Playwright sigue siendo librería.
- ✅ Ningún Step ni Feature fue modificado o creado.
- ✅ Ningún locator nuevo, ningún Page/Component nuevo (`ExampleNavigationComponent` es una migración, no una adición).
- ✅ Ninguna semántica de locator cambió (rol/name/exact/scope idénticos a T07).
- ✅ `ExamplePage` sigue extendiendo `BasePage`, sin cambios funcionales.
- ✅ Ningún wrapper duplicado: los 17 métodos compartidos existen en **un solo lugar** (`BaseUiObject`); ni `BasePage` ni `BaseComponent` redeclaran ninguno.
- ✅ Sin ciclos de imports: `BaseUiObject.ts` no importa nada de `pages/`ni `components/`; `BasePage.ts` y `BaseComponent.ts` importan solo desde `src/base/`; `ExampleNavigationComponent.ts` importa solo desde `src/components/base/` (nunca desde `src/pages/**`).
- ✅ Sin auth, API, test data, screenshots, traces, logging, MCP, `CLAUDE.md`, agentes, retries, paralelismo, ni documentación general (eso es [[T09]]).
- ✅ Sin nuevas dependencias.

---

## 11. Validación negativa

Fixture temporal `src/components/base/__t08_fixture_component_cannot_navigate.ts`:

```ts
class FixtureComponent extends BaseComponent {
  async tryToNavigate(page: Page): Promise<void> {
    await this.goto('https://example.test');
  }
}
```

`npm run typecheck` sobre el repo con el fixture presente:

```
src/components/base/__t08_fixture_component_cannot_navigate.ts(7,16): error TS2339: Property 'goto' does not exist on type 'FixtureComponent'.
exit code 2
```

**Fallo esperado y confirmado**: `goto` genuinamente no existe en `BaseComponent` ni en su cadena de herencia — el compilador lo rechaza, no un lint ni una convención de prosa. El fixture se borró inmediatamente después de confirmar el fallo; `npm run typecheck` se volvió a correr y pasó limpio, y `git status` no mostró ningún rastro del fixture.

---

## 12. Validaciones ejecutadas

### 12.1. `npm run typecheck` / `npm run lint` (antes del fixture negativo)
Ambos PASS, sin salida.

### 12.2. Validación negativa (§11)
Fixture creado → `tsc` falla con `TS2339` como se esperaba → fixture borrado → `tsc` vuelve a PASS.

### 12.3. `npm run format:check`
```
Checking formatting...
All matched files use Prettier code style!
```
Los archivos nuevos/modificados ya cumplían el estilo de Prettier; no fue necesario `--write`.

### 12.4. `npm run quality`
(incluye, desde [[T06-architecture-tests]]: `typecheck` + `lint` + `format:check` + `test:unit`)

```
ℹ tests 57
ℹ suites 19
ℹ pass 57
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Exit code `0`. Los 57 tests (31 `QueryBuilder` + 18 `config` + 8 `architecture`) — ninguno inspecciona `BasePage`/`BaseComponent`/`ExampleNavigationComponent` directamente, así que su resultado no se ve afectado por este refactor de clases; siguen todos verdes.

### 12.5. E2E — `npm test` con configuración explícita
```
BASE_URL=https://playwright.dev HEADLESS=true BROWSER=chromium DB_ENABLED=false npm test
```
```
2 scenarios (2 passed)
6 steps (6 passed)
```
Ambos escenarios de `features/example/example.feature` —incluyendo los dos que ejercitan `ExampleNavigationComponent` (`the main navigation should be visible`, `the main navigation should include a "Docs" link`)— pasaron sin cambios de comportamiento tras la migración a `BaseComponent`.

### 12.6. `git status` / `git diff --stat`
```
Changes not staged for commit:
	modified:   src/components/example/ExampleNavigationComponent.ts
	modified:   src/pages/base/BasePage.ts
Untracked files:
	src/base/
	src/components/base/
```
```
 .../example/ExampleNavigationComponent.ts | 13 ++-
 src/pages/base/BasePage.ts                | 98 ++--------------------
 2 files changed, 10 insertions(+), 101 deletions(-)
```
(`src/base/BaseUiObject.ts` y `src/components/base/BaseComponent.ts` son nuevos/untracked, no aparecen en `--stat`.)

### 12.7. Verificación manual del diff (checklist explícito)

1. ✅ `BaseUiObject` contiene solo las 17 capacidades compartidas (§5).
2. ✅ `BasePage` conserva exclusivamente los 3 métodos de Page + lo heredado de `BaseUiObject` (§6).
3. ✅ `BaseComponent` no expone navegación de Page — confirmado empíricamente en §11.
4. ✅ No hay wrappers duplicados — cada uno de los 17 métodos existe en un único archivo.
5. ✅ `ExampleNavigationComponent` usa `this.root` (ya no `this.nav`).
6. ✅ `ExampleNavigationComponent` ya no extiende `BasePage` — extiende `BaseComponent`.
7. ✅ `ExamplePage` sigue extendiendo `BasePage`, sin cambios (no aparece en el diff).
8. ✅ Ningún Step/Feature cambió (no aparecen en `git status`).
9. ✅ Ninguna semántica de locator cambió (mismo rol/name/exact/scope).
10. ✅ Ningún ciclo de imports — dirección de dependencias confirmada en §4/§10.

---

## 13. Problemas encontrados

**Ningún bug real.** El refactor fue puramente estructural (mover métodos entre clases, cambiar una relación de herencia); ningún comportamiento visible cambió, confirmado tanto por los 57 tests unitarios/de arquitectura como por los 2 escenarios E2E reales contra `playwright.dev`.

---

## 14. Resultado

**Status:** ✅ **COMPLETADO SIN REGRESIONES**

- ✅ `BaseUiObject` creado: 17 capacidades compartidas, una sola implementación, sin duplicación.
- ✅ `BasePage` refactorizado: conserva exclusivamente `goto`/`reload`/`waitForUrlContains`, extiende `BaseUiObject`, sin cambios de comportamiento.
- ✅ `BaseComponent` creado: identidad de Component + `root` scoped + acceso a `BaseUiObject`, sin APIs especulativas.
- ✅ `ExampleNavigationComponent` migrado a `extends BaseComponent`, usando `root` en lugar de `nav` (eliminado por redundante), sin importar nada de `src/pages/**`.
- ✅ `ExamplePage` sin cambios — sigue extendiendo `BasePage`.
- ✅ Validación negativa confirmada: `this.goto(...)` no compila desde un `BaseComponent`.
- ✅ `npm run quality`: PASS (57/57 tests, exit 0).
- ✅ E2E: 2/2 escenarios, 6/6 steps PASS.
- ✅ Sin ciclos de imports, sin wrappers duplicados, sin bugs reales.

---

## 15. Aprendizaje técnico

1. **Herencia vs. composición: `BaseComponent` usa ambas, cada una donde corresponde.** La relación `ExampleNavigationComponent extends BaseComponent extends BaseUiObject` es herencia — comparte comportamiento genérico (esperar, hacer clic, verificar) porque un Component *es* un objeto de UI. Pero la relación entre `ExamplePage` y `ExampleNavigationComponent` sigue siendo composición (`this.navigation = new ExampleNavigationComponent(page)`, ya establecida antes de T08) — una Page *tiene* un Component, no *es* un Component. Confundir estas dos relaciones fue exactamente el error original que P5 identificó: `ExampleNavigationComponent extends BasePage` trataba una relación "tiene" conceptual (una página tiene una barra de navegación) como si fuera "es" (heredando capacidades de página completa).

2. **Principio de responsabilidad única, aplicado a una jerarquía de clases, significa que cada clase cambia por una sola razón.** Antes de T08, `BasePage` cambiaría tanto si cambiaba una capacidad de navegación de página completa como si cambiaba una capacidad genérica de interacción con un elemento — dos razones de cambio distintas mezcladas en un archivo. Después de T08, `BaseUiObject` cambia solo si cambia algo sobre cómo se interactúa con un `Locator`; `BasePage` cambia solo si cambia algo sobre cómo se navega una página completa; `BaseComponent` cambia solo si cambia algo sobre la identidad de un Component scoped.

3. **Un Component no debería poder navegar porque navegar es una operación de nivel de documento, no de nivel de región.** Una barra de navegación no "va a" una URL ni "recarga" nada — es la página completa la que lo hace. Darle a un Component acceso a `goto`/`reload` no es solo semánticamente incorrecto, es una API que invita a un uso incorrecto: nada impedía, antes de T08, que un futuro Component llamara `this.goto(...)` dentro de un método de acción, rompiendo el principio de que solo una Page representa "dónde estoy" en la aplicación. Después de T08, ese uso incorrecto **no compila** — no es una convención de prosa en un README, es una restricción del sistema de tipos.

4. **`BaseUiObject` evita duplicación porque nombra explícitamente el conjunto de capacidades que Pages y Components genuinamente comparten, en lugar de dejar que cada uno las reimplemente por separado o que un Component las herede junto con capacidades que no le corresponden.** La alternativa a `BaseUiObject` no era "sin duplicación" — era, literalmente, la que exigía evitar la tarea: `BasePage` y `BaseComponent` cada uno con su propio `click()`/`fill()`/`waitForVisible()`, divergiendo con el tiempo. Con `BaseUiObject`, hay un único lugar para corregir un bug o agregar una capacidad compartida (p. ej., un futuro `expectDisabled()`), y automáticamente está disponible en ambas ramas de la jerarquía.

5. **Un `root` scoped en `BaseComponent` es lo que hace que "Component" signifique algo distinto de "un montón de métodos sueltos que reciben locators arbitrarios."** Sin `root`, un Component no tendría ninguna garantía de que sus propios locators (como el link de navegación) estén *dentro* de la región que dice representar — cualquier método podría, por accidente, construir un locator sobre `this.page` completo en lugar de sobre su propio scope. Con `root` como propiedad heredada de `BaseComponent`, cada locator hijo (`this.root.getByRole(...)`, como ya lo hacía `linkByName` desde T07) queda automáticamente acotado a la región correcta, y esa garantía es estructural, no una disciplina que cada Component tenga que recordar por su cuenta.

6. **Esta separación ayuda a escalar a muchos Components porque el segundo, tercer y décimo Component nuevo heredan la restricción correcta desde el primer día, sin que nadie tenga que acordarse de imponerla.** Antes de T08, agregar un segundo Component significaba copiar el patrón existente (`extends BasePage`) porque era el único ejemplo — y ese patrón ya traía el problema de P5 incorporado. Después de T08, el único patrón disponible para copiar (`extends BaseComponent`) es estructuralmente correcto: no hay forma de heredar `goto`/`reload` "por accidente", porque `BaseComponent` nunca los tuvo. La corrección deja de depender de que cada autor (humano o IA) recuerde una regla de prosa, y pasa a estar garantizada por lo que la clase base realmente expone.

7. **Para un agente de IA generando un Component nuevo, "extendé `BaseComponent`, pasale `page` y tu `root` Locator al `super()`, y no busques `goto` porque no existe ahí" es una instrucción verificable en el momento de escribir el código — el compilador confirma o rechaza la elección al instante**, en lugar de requerir que la IA infiera correctamente, leyendo un README, cuál subconjunto de la API heredada "no debería" usar. La validación negativa de esta tarea (§11) es exactamente esa garantía, demostrada empíricamente: no hace falta documentación adicional para saber que un Component no navega — el propio tipo lo dice.

---

## 16. Próxima tarea

`T09 — Actualizar documentación final de AI Foundation.`

**NO EJECUTADO EN ESTA SESIÓN.**
