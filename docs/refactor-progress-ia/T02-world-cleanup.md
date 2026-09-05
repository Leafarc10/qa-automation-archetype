# T02 — World Cleanup

**Date:** 2026-09-04
**Status:** ✅ COMPLETED
**Branch:** `feature/ai-foundation`

---

## 1. Objetivo

Resolver P2 y P3 del AI Foundation Plan:

- **P2:** corregir `support/AGENTS-support.md` para que documente el comportamiento real de `CustomWorld.init()` (sin `storageState`, sin login programático, sin reuso de sesión), dejando explícito que una capa de autenticación es una capacidad futura a diseñar, no algo que exista hoy ni deba improvisarse.
- **P3:** eliminar el tipo `InitOptions` y el parámetro `options` de `init()` en `support/world.ts`, dado que no tienen callers y `config.headless` ya es la fuente real del valor.

---

## 2. Estado inicial

- `support/world.ts:10-12` declaraba `type InitOptions = { headless?: boolean }`.
- `support/world.ts:26-27` — `async init(options: InitOptions = {})` desestructuraba `headless = config.headless` del parámetro, con `config.headless` como único fallback real.
- `support/hooks.ts:14` invocaba `await this.init()` **sin argumentos**.
- `support/AGENTS-support.md:27` documentaba `init(options?: { storageStatePath?: string; headless?: boolean })` con soporte de `storageState` — capacidad inexistente en el código.

---

## 3. Problemas encontrados

- **P2 confirmado:** `storageStatePath` no aparece en ningún lugar del código (`support/world.ts`, `support/hooks.ts`). La documentación afirmaba una capacidad de autenticación que nunca existió en el estado actual del repo.
- **P3 re-confirmado:** `InitOptions.headless` no tenía callers. Búsqueda dirigida (`git grep -n "InitOptions|\.init\("`) mostró un único invocador (`hooks.ts:14`) y siempre sin argumentos. `config.headless` ya resolvía el valor por defecto dentro del propio `init()`, haciendo el parámetro completamente redundante.

---

## 4. Decisión tomada

- Eliminar `InitOptions` y el parámetro `options` de `init()`; usar `config.headless` directamente en el `launch()`. Ningún otro punto del lifecycle del browser (`newContext()`, `newPage()`, construcción de `Pages`) se modificó.
- Reescribir la firma documentada de `init()` en `AGENTS-support.md` para reflejar exactamente el código (sin argumentos, sin `storageState`), y agregar una línea explícita de scope aclarando que no existe capa de autenticación y que debe diseñarse como capacidad aparte si algún proyecto la necesita.
- No se tocó `README.md` ni `AGENTS.md`: la única mención de `storageState` en `README.md:441` ("Never commit... Generated `storageState` files") es una prohibición de seguridad, no una afirmación de que la capacidad exista — no es contradictoria y quedó igual.

---

## 5. Archivos modificados

- `support/world.ts`
- `support/AGENTS-support.md`

---

## 6. Cambios realizados

### `support/world.ts`

```diff
-type InitOptions = {
-  headless?: boolean;
-};
-
 // Free-form per-scenario state; Steps type it according to their own needs.
 export type TestContext = Record<string, unknown>;
 ...
-  async init(options: InitOptions = {}): Promise<void> {
-    const { headless = config.headless } = options;
+  async init(): Promise<void> {
     const browserType = {
       chromium,
       firefox,
       webkit,
     }[config.browser];

-    this.browser = await browserType.launch({ headless });
+    this.browser = await browserType.launch({ headless: config.headless });
```

### `support/AGENTS-support.md`

```diff
-- **`init(options?: { storageStatePath?: string; headless?: boolean })`:** launches the configured browser (`config.browser`; defaults from `HEADLESS`), creates a `BrowserContext` (with `storageState` if `storageStatePath` is passed) and a `Page`, and builds `this.pages = new Pages(this.page)`.
+- **`init()`:** takes no arguments and no options. Launches the configured browser (`config.browser`, `config.headless`), creates a fresh `BrowserContext` (no `storageState`) and a `Page`, and builds `this.pages = new Pages(this.page)`.
 - **`close()`:** closes `page`/`context`/`browser` if they exist.
 - **Does not know:** Oracle, `oracledb`, database credentials, or any specific Page/Repository — it only knows the `Pages`/`RepositoryContainer` container types.
+- **No authentication layer exists.** There is no `storageState`, no programmatic login, and no session reuse — `init()` always creates a brand-new, empty `BrowserContext`. Any project that needs authentication must design that capability explicitly (e.g. as its own module with a clear lifecycle) before use — never improvise it inline inside a Step or a hook.
```

---

## 7. Qué NO cambió

- ✅ **Lifecycle del browser:** sigue siendo `Before → this.init() → browser → context → page → new Pages(page)`, sin pasos agregados ni quitados.
- ✅ **`config.headless` / `config.browser`:** sin cambios en `src/config/index.ts`.
- ✅ **`support/hooks.ts`:** no requirió cambios — ya invocaba `this.init()` sin argumentos.
- ✅ **README.md / AGENTS.md:** sin cambios — no contenían ninguna afirmación directamente contradictoria sobre `storageState` o `InitOptions` (la única mención en `README.md:441` es una prohibición de seguridad, no una afirmación de existencia).
- ✅ **Sin tests unitarios, sin cambios a ESLint, sin guardrails, sin locators, sin `BaseComponent`/`BaseUiObject`, sin autenticación implementada, sin `CLAUDE.md`, sin MCP, sin agentes.**
- ✅ Cucumber sigue siendo el único runner E2E.

---

## 8. Validaciones ejecutadas

### 8.1. `npm run quality`

```
typecheck: PASS ✅
lint:      PASS ✅
format:check: All matched files use Prettier code style! ✅
```

### 8.2. E2E (con env vars inline para evitar el problema conocido de `BASE_URL` sin `.env` local)

```bash
BASE_URL=https://playwright.dev HEADLESS=true BROWSER=chromium DB_ENABLED=false \
  npx cucumber-js --config cucumber.js --tags "not @db"
```

```
2 scenarios (2 passed) ✅
6 steps (6 passed) ✅
0m01.375s
```

### 8.3. Búsqueda de referencias

```bash
git grep -n "InitOptions" -- .
```
0 matches en código operativo (`support/world.ts`, `support/hooks.ts`, `support/AGENTS-support.md`). Las únicas ocurrencias restantes son en documentación histórica/análisis (`docs/ai-foundation-plan.md`, `docs/framework-current-state.md`, `docs/refactor-progress-ia/T01-documentation-cleanup.md`), que describen el problema ya resuelto — no son referencias operativas.

```bash
git grep -n "storageStatePath" -- .
```
0 matches en código o documentación operativa. Únicas ocurrencias: `docs/ai-foundation-plan.md` y `docs/framework-current-state.md` (documentos de análisis, describiendo el problema histórico).

```bash
git grep -n "storageState" -- .
```
- `README.md:441` — prohibición de seguridad ("never commit generated `storageState` files"), no una afirmación de que exista la capacidad. Se mantiene sin cambios, consistente con el plan.
- `support/AGENTS-support.md:27,30` — documentación de la capacidad **inexistente**, explícitamente marcada como tal.
- Resto de ocurrencias: documentos de análisis/histórico (`docs/ai-foundation-plan.md`, `docs/framework-current-state.md`, `docs/refactor-progress-ia/T01-documentation-cleanup.md`).

**Conclusión:** 0 referencias operativas a `InitOptions` o `storageStatePath`. `storageState` solo aparece como (a) prohibición de seguridad en README, o (b) documentación explícita de que la capacidad NO existe.

### 8.4. `git diff`

Revisado manualmente (ver §6) — únicamente los dos cambios descritos, sin efectos secundarios.

### 8.5. Lifecycle sin cambios adicionales

Confirmado en `support/hooks.ts` (no modificado): `Before` sigue llamando `await this.init()` sin argumentos; `init()` sigue construyendo `browser → context → page → this.pages = new Pages(this.page)` en el mismo orden.

---

## 9. Resultado

**Status:** ✅ **COMPLETADO SIN REGRESIONES**

- ✅ P2 resuelto: `AGENTS-support.md` documenta exactamente el comportamiento real de `init()`, con una nota explícita de que no existe capa de autenticación.
- ✅ P3 resuelto: `InitOptions` y el parámetro `options` eliminados; `init()` usa `config.headless` directamente.
- ✅ Quality gate: PASS.
- ✅ E2E: 2 escenarios / 6 steps PASS.
- ✅ 0 referencias operativas muertas a `InitOptions` / `storageStatePath`.
- ✅ Lifecycle del browser sin cambios adicionales.

---

## 10. Aprendizaje técnico

1. **Una API muerta es peligrosa en un framework de referencia.** Un parámetro opcional sin caller (`InitOptions.headless`) no es inofensivo solo porque no rompe nada: es una superficie que alguien —humano o IA— puede leer como "la forma soportada de hacer X" y empezar a usar, aun cuando el valor real siempre viene de otro lado (`config.headless`). Eliminarla en cuanto se confirma que no tiene consumidores evita que se vuelva una convención accidental.

2. **Documentación y código deben coincidir siempre, no eventualmente.** `AGENTS-support.md` documentaba `storageStatePath` como si existiera, cuando el código nunca lo tuvo en este estado del repo. Una discrepancia doc↔código no es un detalle cosmético: es la fuente que un agente o desarrollador nuevo consulta primero, antes de leer el código fuente completo.

3. **Una IA interpreta una opción no usada como una capacidad válida.** Frente a una firma como `init(options?: { storageStatePath?: string })`, un agente generador de código razonablemente asume que la capacidad fue implementada y probada, y la usa para resolver un pedido de autenticación — construyendo lógica sobre una base que no existe. Documentar explícitamente la ausencia ("no existe capa de autenticación, no la improvises") es más seguro que simplemente omitir la mención, porque previene la inferencia optimista.

---

## 11. Próxima tarea

`T03 — Agregar runner unitario y tests de seguridad de QueryBuilder.`

**NO EJECUTADO EN ESTA SESIÓN.**
