# T07 — Canonical Locator Pattern

**Date:** 2026-09-04
**Status:** ✅ COMPLETED
**Branch:** `feature/ai-foundation`

---

## 1. Objetivo

Resolver únicamente P4 del AI Foundation Plan — la inconsistencia del ejemplo canónico de locators, ya identificada en `docs/framework-current-state.md`: `ExamplePage` declaraba un locator (`heading`) en el constructor pero construía otro (`link`) inline dentro del método de assertion; `ExampleNavigationComponent` repetía exactamente el mismo patrón inconsistente (`nav` en el constructor, `link` inline en `expectLinkVisible`). Un desarrollador o un agente de IA que copiara "el ejemplo" tenía dos convenciones distintas a elegir, en un archivo de 33 líneas.

T07 es exclusivamente un refactor estructural: separar "cómo encuentro el elemento" de "qué hago/verifico con el elemento", sin tocar `BasePage`/`BaseComponent` (eso es [T08-base-component](T08-base-component.md)), sin agregar Pages/Components/Steps/Features nuevos, y sin cambiar ningún rol, nombre, `exact`, nivel, scope o comportamiento visible ya existente.

---

## 2. Estado inicial

Antes de editar nada se leyó completo: `src/pages/example/ExamplePage.ts`, `src/components/example/ExampleNavigationComponent.ts` y `src/pages/base/BasePage.ts`, y se buscaron explícitamente (`grep`) todos los usos de `getByRole`/`getByText`/`getByLabel`/`getByTestId`/`getByPlaceholder`/`getByAltText`/`getByTitle`/`locator(` en `src/**` y `features/**`.

- `git status`/`git diff` en blanco: working tree limpio (T06 ya commiteado fuera de esta sesión, confirmado por `git log`).
- **Inventario completo de locators del repo UI: exactamente 4, en solo dos archivos.** No existe ningún otro Page ni Component en el repo (`src/pages/base/BasePage.ts` no construye ningún `getByRole` propio — opera genéricamente sobre `Locator` recibido como parámetro), y `features/**` no contiene ningún locator (los Steps ya solo llaman a `this.pages.example.*`, sin locators — confirmado también por el guardrail G5 de [T05-eslint-guardrails](T05-eslint-guardrails.md)).
- `BasePage.ts`: sin cambios necesarios — es genérico, no declara locators propios, y no es parte del alcance de T07 (su separación de `BaseComponent` es T08).

---

## 3. Convención definida

| Tipo | Regla |
|---|---|
| **Locator estático** (no depende de un parámetro runtime) | `private readonly <nombre>: Locator;` declarado como propiedad, construido una única vez en el constructor. |
| **Locator parametrizado** (depende de un valor recibido en runtime) | Un método privado/factory descriptivo (`private <nombre>By<Criterio>(param): Locator`) que lo construye y lo retorna; nunca inline dentro de un método de acción/assertion. |
| **Método de acción/assertion** | Consume esos locators (la propiedad estática o el factory); nunca construye `getByRole`/`getByText`/etc. inline. |

---

## 4. Archivos modificados

- `src/pages/example/ExamplePage.ts`
- `src/components/example/ExampleNavigationComponent.ts`

Ningún otro archivo fue tocado — ni `BasePage.ts`, ni ningún Step, ni ninguna Feature, ni `Pages.ts`.

---

## 5. Locators estáticos

| Archivo | Locator | Ya seguía la convención | Cambio aplicado |
|---|---|---|---|
| `ExamplePage.ts` | `heading` — `page.getByRole('heading', { level: 1 })` | ✅ Sí | **Ninguno** — ya era `private readonly heading: Locator`, construido en el constructor. |
| `ExampleNavigationComponent.ts` | `nav` — `page.getByRole('navigation', { name: 'Main' })` | ✅ Sí | **Ninguno** — ya era `private readonly nav: Locator`, construido en el constructor. |

Ambos locators estáticos ya eran correctos antes de T07 y se dejaron exactamente como estaban, tal como exigía la tarea ("NO cambies un locator estático ya correcto sin necesidad").

---

## 6. Locators parametrizados

| Archivo | Locator | Antes | Después |
|---|---|---|---|
| `ExamplePage.ts` | link por nombre (depende de `linkName`) | Construido **inline** dentro de `expectLinkVisible(linkName)`: `this.page.getByRole('link', { name: linkName, exact: true })` | Extraído a `private linkByName(linkName: string): Locator { return this.page.getByRole('link', { name: linkName, exact: true }); }`; `expectLinkVisible` ahora llama `this.linkByName(linkName)`. |
| `ExampleNavigationComponent.ts` | link por nombre, scoped al `nav` (depende de `linkName`) | Construido **inline** dentro de `expectLinkVisible(linkName)`: `this.nav.getByRole('link', { name: linkName, exact: true })` | Extraído a `private linkByName(linkName: string): Locator { return this.nav.getByRole('link', { name: linkName, exact: true }); }`; `expectLinkVisible` ahora llama `this.linkByName(linkName)`. Se mantuvo el scoping dentro de `this.nav` (no se cambió a `this.page`). |

---

## 7. Cambios realizados

### `src/pages/example/ExamplePage.ts`

```diff
   async expectLinkVisible(linkName: string): Promise<void> {
-    await this.waitForVisible(this.page.getByRole('link', { name: linkName, exact: true }));
+    await this.waitForVisible(this.linkByName(linkName));
+  }
+
+  private linkByName(linkName: string): Locator {
+    return this.page.getByRole('link', { name: linkName, exact: true });
   }
 }
```

### `src/components/example/ExampleNavigationComponent.ts`

```diff
   async expectLinkVisible(linkName: string): Promise<void> {
-    await this.waitForVisible(this.nav.getByRole('link', { name: linkName, exact: true }));
+    await this.waitForVisible(this.linkByName(linkName));
+  }
+
+  private linkByName(linkName: string): Locator {
+    return this.nav.getByRole('link', { name: linkName, exact: true });
   }
 }
```

Ambos diffs son puramente aditivos en estructura (una llamada de método en vez de una construcción inline, más un método privado nuevo) — ningún argumento de `getByRole` cambió: mismo rol (`'link'`), mismo `name` (el parámetro `linkName`, sin transformar), mismo `exact: true`, mismo scope (`this.page` en `ExamplePage`, `this.nav` en `ExampleNavigationComponent`).

---

## 8. Qué NO cambió

- ✅ **Ningún locator estático fue tocado** — `heading` y `nav` permanecen exactamente como estaban antes de T07.
- ✅ **Ninguna semántica de locator cambió** — mismo rol, mismo `name`/`level`, mismo `exact`, mismo scope, en ambos locators parametrizados.
- ✅ `ExampleNavigationComponent` **sigue extendiendo `BasePage`** — no se tocó `extends BaseComponent` ni ninguna jerarquía de clases; eso es exclusivamente [T08-base-component](T08-base-component.md).
- ✅ `BasePage.ts` — sin cambios.
- ✅ Ningún Step (`features/steps/example.steps.ts`) ni ninguna Feature (`features/example/example.feature`) fue modificado.
- ✅ Ningún Page/Component/Step/Feature **nuevo** fue creado.
- ✅ Sin cambios de arquitectura, sin `BaseUiObject`.
- ✅ Sin nuevas dependencias.

---

## 9. Validaciones ejecutadas

### 9.1. `npm run quality`
(incluye, desde [T06-architecture-tests](T06-architecture-tests.md): `typecheck` + `lint` + `format:check` + `test:unit`)

```
ℹ tests 57
ℹ suites 19
ℹ pass 57
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Exit code confirmado en `0`. `typecheck`/`lint`/`format:check` sin salida (limpios). Ningún test unitario ni de arquitectura se vio afectado por este refactor (esperable: ninguno de los 57 tests inspecciona `ExamplePage`/`ExampleNavigationComponent`).

### 9.2. E2E — `npm test` con configuración explícita

```
BASE_URL=https://playwright.dev HEADLESS=true BROWSER=chromium DB_ENABLED=false npm test
```

```
2 scenarios (2 passed)
6 steps (6 passed)
0m01.677s (executing steps: 0m01.655s)
```

Ambos escenarios de `features/example/example.feature` — incluyendo los dos que ejercitan exactamente los locators parametrizados refactorizados (`the "Get started" link should be visible` y `the main navigation should include a "Docs" link`) — pasaron sin cambios de comportamiento.

### 9.3. `git status`
```
Changes not staged for commit:
	modified:   src/components/example/ExampleNavigationComponent.ts
	modified:   src/pages/example/ExamplePage.ts
```

### 9.4. `git diff --stat`
```
src/components/example/ExampleNavigationComponent.ts | 6 +++++-
src/pages/example/ExamplePage.ts                     | 6 +++++-
2 files changed, 10 insertions(+), 2 deletions(-)
```

### 9.5. Verificación manual del diff (checklist explícito)

1. ✅ Ningún locator estático que ya estaba correcto fue modificado (`heading`, `nav` intactos).
2. ✅ Ningún locator cambió de semántica (mismo rol/name/exact/scope en ambos parametrizados).
3. ✅ Ambos locators parametrizados ahora tienen un factory privado (`linkByName`).
4. ✅ Ningún método de acción/assertion construye ya un locator parametrizado inline — `expectLinkVisible` en ambos archivos ahora consume `this.linkByName(linkName)`.
5. ✅ `ExampleNavigationComponent` sigue extendiendo `BasePage` (línea de clase sin cambios).
6. ✅ Ningún Step ni Feature fue modificado (`git status` solo lista los dos archivos de Page/Component).

---

## 10. Problemas encontrados

**Ningún bug real.** Los dos locators parametrizados ya se comportaban correctamente (validado por los 2 escenarios E2E, sin cambios); el problema que resolvía P4 era puramente de **consistencia estructural** (dos convenciones distintas en el mismo archivo/patrón), no de comportamiento. No fue necesario documentar ni reportar ningún hallazgo adicional.

---

## 11. Resultado

**Status:** ✅ **COMPLETADO SIN REGRESIONES**

- ✅ Convención única y consistente: locator estático → propiedad `private readonly` inicializada en el constructor; locator parametrizado → factory privado que retorna `Locator`; método de acción/assertion → consume, nunca construye.
- ✅ Los 2 locators estáticos existentes (`heading`, `nav`) — sin cambios, ya eran correctos.
- ✅ Los 2 locators parametrizados existentes — extraídos a factories privados (`linkByName`), misma semántica exacta.
- ✅ `npm run quality`: PASS (typecheck + lint + format:check + 57/57 test:unit).
- ✅ E2E: 2/2 escenarios, 6/6 steps PASS con `BASE_URL=https://playwright.dev HEADLESS=true BROWSER=chromium DB_ENABLED=false`.
- ✅ `ExampleNavigationComponent` sigue extendiendo `BasePage` — sin adelantar nada de T08.
- ✅ Ningún Step/Feature/Page/Component nuevo; ningún bug real encontrado.

---

## 12. Aprendizaje técnico

1. **Locator estático vs. parametrizado es una distinción sobre cuándo se conoce el selector, no sobre su complejidad.** Un locator estático (`heading`, `nav`) tiene toda la información que necesita en el momento en que se crea la instancia del Page/Component — por eso puede (y debe) construirse una sola vez, en el constructor, y vivir como propiedad. Un locator parametrizado (`linkByName`) no puede existir hasta que alguien le pase un valor en runtime (`linkName`) — por eso no puede ser una propiedad fija; necesita ser el resultado de una función.

2. **Los locators pertenecen al Page/Component, nunca al Step, porque el Step no debería saber cómo se encuentra un elemento — solo qué escenario de negocio está ejercitando.** Esto ya estaba protegido en el código (ningún Step tiene locators, reforzado por el guardrail G5 de T05); T07 extiende el mismo principio *dentro* del propio Page/Component: ni siquiera el método de assertion (`expectLinkVisible`) debería mezclar "cómo lo encuentro" con "qué verifico" — son dos responsabilidades que cambian por razones distintas (un cambio de estrategia de selector no debería tocar la lógica de la assertion, y viceversa).

3. **Construir un locator inline dentro de una assertion/acción oculta la estrategia de localización en medio de la lógica de negocio, y la duplica si dos métodos necesitan el mismo elemento.** Antes de T07, si un segundo método de `ExamplePage` hubiera necesitado el mismo link por nombre, la única opción habría sido copiar el `getByRole(...)` inline de nuevo — divergencia silenciosa garantizada tarde o temprano. Con el factory, un segundo método simplemente reutiliza `this.linkByName(...)`.

4. **Un factory privado parametrizado no es sobreingeniería — es la única forma correcta de representar "un locator que depende de un dato que no existe hasta runtime".** Sobreingeniería sería crear una abstracción para un caso que no lo necesita (p. ej., envolver el locator estático `heading` en un factory que no toma parámetros, sin ninguna necesidad real). Aquí el parámetro es real e ineliminable (`linkName` viene del Step, que a su vez lo recibe de la Feature) — el factory no agrega una capa conceptual nueva, nombra una que ya existía implícitamente cada vez que se llamaba `getByRole('link', { name: linkName, ... })`.

5. **Esta convención ayuda a un humano o a una IA generando código nuevo porque reduce la decisión de diseño a una pregunta binaria y verificable por inspección: "¿esto depende de un parámetro runtime?"** Si sí, es un factory; si no, es una propiedad. Antes de T07, el propio ejemplo canónico del repo respondía esa pregunta de dos formas distintas en 33 líneas, así que copiarlo no enseñaba una regla — enseñaba dos, sin indicar cuál aplicaba cuándo. Con una única convención consistente en el ejemplo, "copiá el patrón del Example" vuelve a ser una instrucción inequívoca, precisamente el tipo de señal que un agente de IA generando un nuevo Page/Component necesita para no introducir una tercera variante.

---

## 13. Próxima tarea

`T08 — Separar BasePage y BaseComponent mediante BaseUiObject.`

**NO EJECUTADO EN ESTA SESIÓN.**
