# T06 — Architecture Tests & Quality Gate

**Date:** 2026-09-04
**Status:** ✅ COMPLETED
**Branch:** `feature/ai-foundation`

---

## 1. Objetivo

Resolver la parte restante de P6/P7 del AI Foundation Plan:

1. agregar tests de arquitectura para invariantes que [[T05-eslint-guardrails]] no puede expresar de forma suficientemente robusta (inspección de filesystem, análisis de un programa TypeScript completo en vez de un único archivo);
2. integrar `npm run test:unit` dentro de `npm run quality`, para que exista **un único comando** (`npm run quality`) que sea el gate principal para desarrolladores, CI y agentes de IA;
3. mantener Cucumber como único runner E2E, sin agregar `playwright.config.ts`, `*.spec.ts`, ni escenarios funcionales nuevos;
4. no agregar dependencias — usar únicamente `node:test`, `node:assert/strict`, `node:fs`, `node:path`, `node:url` y el compilador de TypeScript, ya presente como devDependency desde antes de esta tarea.

---

## 2. Estado inicial

Antes de editar nada se leyeron completos: `package.json`, `eslint.config.js`, `support/world.ts`, `cucumber.js`, `src/config/index.ts`, `src/database/clients/OracleDatabaseClient.ts`, `features/example/example.feature` (único `.feature` del repo), `tsconfig.json`, `src/database/builders/QueryBuilder.test.ts`, `src/config/index.test.ts`, `.github/workflows/ci.yml` y `README.md`, para confirmar el estado real en vez de asumirlo:

- `git status`/`git diff` en blanco: working tree limpio, sin trabajo pendiente de una sesión anterior.
- `quality` era `typecheck && lint && format:check` — **sin** `test:unit`, tal como quedó documentado en [[T03-querybuilder-unit-tests]] (deliberadamente diferido) y [[T04-config-unit-tests]].
- `eslint.config.js` ya tenía los 8 guardrails de [[T05-eslint-guardrails]] (G1-G8), confirmados funcionando (`npm run lint` limpio).
- `support/world.ts` (45 líneas): `CustomWorld extends World` con exactamente las propiedades `browser`, `context`, `page`, `pages`, `repositories?`, `testContext` — coincide exactamente con la allowlist que pide esta tarea, y `setWorldConstructor(CustomWorld)` se llama una única vez, al final del archivo.
- `OracleDatabaseClient.ts` confirmado (otra vez) usando `createRequire(import.meta.url)` + `require('oracledb')`, no `import` — el patrón real que ESLint no puede ver, exactamente el que esta tarea pide cubrir.
- `features/example/example.feature`: único `.feature` del repo, con tags (`@ui @regression` a nivel de Feature, `@smoke` en el primer Scenario) — ya cumple A7 sin cambios.
- `package.json`: `test:unit` ya existía (`node --test "src/**/*.test.ts"`), 49 tests pasando (31 `QueryBuilder` + 18 `config`, de T03/T04). Ningún script contenía `playwright test`.
- `.github/workflows/ci.yml`: ya corre `npm run quality` y, como paso separado, `npm test` (Cucumber). No existía ningún paso `test:unit` separado que pudiera quedar duplicado al integrar `test:unit` a `quality`.
- `README.md` (`:378`, `:380`): afirmaba explícitamente "`npm run quality` is a purely static gate — it never runs the test suite" — la frase exacta que esta tarea debía corregir, ya identificada como P7/R8 en `docs/ai-foundation-plan.md`.
- Búsqueda de `*.spec.ts` y `playwright.config.*` en el repo real (fuera de `node_modules`): ninguno. Los únicos matches de esos patrones están dentro de `node_modules` (dependencias de terceros: `ts-dedent`, `@cucumber/query`, `@cucumber/html-formatter`), confirmando que el architecture test debe ignorar `node_modules` explícitamente.

---

## 3. Invariantes arquitectónicos protegidos

| # | Invariante | Mecanismo |
|---|---|---|
| A1 | No debe existir `playwright.config.*` en ningún lugar del repo (fuera de directorios ignorados) | Filesystem walk + regex sobre el nombre de archivo |
| A2 | No deben existir archivos `*.spec.ts`; `*.test.ts` sigue permitido | Filesystem walk + comparación de sufijo |
| A3 | Ningún script de `package.json` puede invocar `playwright test` | Lectura de `package.json` + regex con límite de palabra |
| A4 | `setWorldConstructor(...)` se registra exactamente una vez, desde `support/world.ts` | TypeScript AST (`ts.createSourceFile` + recorrido de `CallExpression`) sobre todos los `.ts` del repo |
| A5 | `CustomWorld` no declara ninguna propiedad fuera de la allowlist de infraestructura | TypeScript AST — localiza la `ClassDeclaration` `CustomWorld` y sus `PropertyDeclaration` |
| A6 | `oracledb` solo se referencia (import o `require`) desde `src/database/clients/OracleDatabaseClient.ts` | TypeScript AST sobre todos los `.ts` del repo, cubriendo tanto `import` como el patrón real `createRequire(...)` + `require('oracledb')` |
| A7 | Cada `features/**/*.feature` tiene al menos un tag Gherkin | Filesystem walk + regex de línea sobre el contenido del archivo |
| A8 | `process.env` tiene un único dueño | **Sin test nuevo** — ya cubierto por ESLint (T05, G3); ver §10 |

---

## 4. Diseño técnico del architecture test

Un único archivo, `src/architecture.test.ts`, usando solo `node:test`/`node:assert/strict`/`node:fs`/`node:path`/`node:url` y `typescript` (ya instalado). Sin Jest, Vitest, `tsx` ni parsers adicionales.

### 4.1. `walkRepoFiles()` — el mecanismo compartido de A1/A2/A6

Una función recursiva basada en `fs.readdirSync(dir, { withFileTypes: true })` recorre el repo completo desde la raíz, devolviendo cada archivo como una ruta relativa en formato POSIX (`/`, no `\`), consistente entre plataformas. Ignora explícitamente:

- `node_modules`, `.git`, `reports`, `test-results`, `playwright-report`, `blob-report`, `coverage`, `.cache`, `.vscode`, `.idea` (artefactos generados, VCS, estado de editor);
- cualquier directorio cuyo nombre empiece con `.tmp-` (mismo patrón que ya usa `eslint.config.js`);
- `docs/refactor-progress` (documentación histórica de un refactor anterior — ver [[T01-documentation-cleanup]] — ya excluida igual de ESLint y de git).

A1 y A2 filtran esta lista por nombre de archivo (regex de `playwright.config.*` y sufijo `.spec.ts`, respectivamente). A6 la filtra por sufijo `.ts` y le aplica el análisis AST de la §4.3.

### 4.2. A3 — `package.json`

Lectura directa con `fs.readFileSync` + `JSON.parse`, sin AST (no es TypeScript). El patrón `/\bplaywright\s+test(\s|$)/i` exige un límite de palabra **después** de "test" (espacio o fin de string), no solo antes — así no dispararía falsamente contra un futuro script que combinara "playwright" con una palabra que empiece con "test" pero no sea la palabra "test" en sí (p. ej. `test-results`). Cubre `playwright test`, `npx playwright test`, `npx --yes playwright test`, etc., sin depender de que un script se llame de una forma específica.

### 4.3. A4/A5/A6 — TypeScript Compiler API

`ts.createSourceFile(fileName, text, ts.ScriptTarget.ES2022, true)` construye el AST real de cada archivo (el mismo mecanismo, en espíritu, que usa `tsc` internamente), y `ts.forEachChild` lo recorre:

- **A4** busca cualquier `CallExpression` cuyo `expression` sea un `Identifier` con texto `'setWorldConstructor'`, en **todos** los `.ts` del repo (no solo `support/world.ts`) — así detecta tanto ausencia como duplicación, y detecta una duplicación sin importar en qué archivo aparezca.
- **A5** localiza la `ClassDeclaration` cuyo nombre es exactamente `CustomWorld`, y de sus `members` extrae solo los `PropertyDeclaration` (deliberadamente **no** los `MethodDeclaration` — `init()`/`close()` no son estado), comparando los nombres contra la allowlist.
- **A6** busca dos formas AST distintas de referenciar `oracledb`: una `ImportDeclaration` cuyo `moduleSpecifier` sea el string literal `'oracledb'` (lo que ESLint ya cubre), **y** un `CallExpression` `require('oracledb')` — el patrón real que usa `OracleDatabaseClient.ts` vía `createRequire`, que ningún `no-restricted-imports` puede ver porque nunca se expresa como `import`.

Ninguna de las tres usa regex sobre el texto del archivo. Se prefirió AST explícitamente porque:

- Un regex sobre `setWorldConstructor\(` no distinguiría una llamada real de un comentario, un string, o el nombre de una variable que casualmente contenga ese texto.
- Un regex sobre las propiedades de `CustomWorld` sería sensible al formato exacto del archivo (saltos de línea, comentarios entre propiedades, un método que declare una variable local con un nombre parecido) — el riesgo que el propio `docs/ai-foundation-plan.md` documenta como R9, y que esta implementación evita por completo al operar sobre la estructura real del AST en vez del texto.
- `require('oracledb')` como texto plano podría aparecer dentro de un comentario o un string sin ser una invocación real; el AST solo encuentra la invocación real.

No se modificó `support/world.ts` ni ningún otro archivo productivo para "facilitar" estos tests — los tres operan sobre el código tal como ya existía.

### 4.4. A7 — Gherkin

No requiere TypeScript AST (`.feature` no es TypeScript). Un regex de línea, `/^\s*@[A-Za-z0-9_-]+/m`, verifica que el archivo contenga al menos una línea que empiece (tras espacio opcional) con un tag Gherkin — sin validar taxonomía ni ubicación exacta (Feature vs. Scenario), tal como pide la tarea ("no validar todavía una taxonomía completa").

---

## 5. Uso de TypeScript AST

Ver §4.3. Resumen de la decisión: **AST siempre que la tarea lo permitiera** (A4, A5, A6) porque `typescript` ya es una dependencia instalada (no se agregó nada nuevo) y porque el propio enunciado de la tarea pedía explícitamente evitar un architecture test "basado únicamente en regex sobre el formato de `support/world.ts`". Regex se reservó para los dos casos donde no hay TypeScript de por medio: nombres de archivo en el filesystem (A1/A2) y contenido Gherkin de un `.feature` (A7); y para A3, sobre JSON plano, donde tampoco aplica un AST de TypeScript.

---

## 6. Archivos creados/modificados

- **`src/architecture.test.ts`** (nuevo) — los 8 `describe` con las verificaciones de A1-A7 (A8 documentado, sin test — ver §3 y §10). 8 `it(...)` en total (A6 tiene dos: la ausencia de referencias fuera del archivo autorizado, y una comprobación de que el archivo autorizado **sí** sigue referenciando `oracledb`, para que la excepción nunca quede obsoleta sin que nada lo note).
- **`package.json`** — `quality` pasó de `"npm run typecheck && npm run lint && npm run format:check"` a `"npm run typecheck && npm run lint && npm run format:check && npm run test:unit"`. `test:unit` se mantiene como script independiente, sin cambios. No se agregó ningún script `verify` adicional.
- **`.github/workflows/ci.yml`** — se corrigió únicamente el `name:` del paso de calidad, de `Quality (typecheck + lint + format:check)` a `Quality (typecheck + lint + format:check + test:unit)`, para que el comentario deje de ser falso. No se agregó ningún paso nuevo (ver §9).
- **`README.md`** — dos correcciones puntuales (`:378`, `:380`): la fila de la tabla de `npm run quality` ahora lista `test:unit`, y el párrafo que decía "`npm run quality` is a purely static gate — it never runs the test suite" se corrigió para reflejar que `quality` ahora corre `test:unit`, aclarando explícitamente que **sigue sin** correr la suite E2E de Cucumber (`npm test` sigue siendo un comando separado). Sin reescritura general del resto del documento.

Ningún archivo productivo (`support/world.ts`, `src/config/index.ts`, `src/database/clients/OracleDatabaseClient.ts`, `features/example/example.feature`, etc.) fue modificado.

---

## 7. Fixtures negativos utilizados

Todos temporales, creados en rutas reales (nunca ejecutados por Cucumber ni con efecto externo alguno — ninguno se agregó a `cucumber.js`/`features/steps/`, y ninguno hizo una llamada de red), verificados corriendo `node --test` acotado al `describe` relevante con `--test-name-pattern`, y **borrados inmediatamente** después de confirmar el fallo:

| # | Fixture | Invariante | Resultado |
|---|---|---|---|
| 1 | `playwright.config.ts` (raíz del repo) | A1 | ❌ FAIL — `actual: ['playwright.config.ts']` |
| 2 | `foo.spec.ts` (raíz del repo) | A2 | ❌ FAIL — `actual: ['foo.spec.ts']` |
| 3 | `src/__t06_fixture_second_world.ts` con un segundo `setWorldConstructor(SecondWorld)` | A4 | ❌ FAIL — `actual: ['src/__t06_fixture_second_world.ts', 'support/world.ts']` (ambos detectados, orden alfabético de `walkRepoFiles`) |
| 4 | `support/__t06_fixture_world_with_business_state.ts`, una clase `CustomWorld` equivalente con una propiedad extra `currentOrderId` | A5 | ❌ FAIL — `actual: ['currentOrderId']`, con el mensaje exacto pedido: *"No agregues estado de negocio a CustomWorld. Usá testContext..."* |
| 5 | `src/__t06_fixture_oracledb_reference.ts` usando **el mismo patrón real** que `OracleDatabaseClient.ts` (`createRequire` + `require('oracledb')`), no un `import` | A6 | ❌ FAIL — `actual: ['src/__t06_fixture_oracledb_reference.ts']` — confirma que la detección cubre el `require` dinámico, no solo `import` |
| 6 | `features/example/__t06_fixture_untagged.feature`, sin ningún tag | A7 | ❌ FAIL — `actual: ['features/example/__t06_fixture_untagged.feature']` |

**Fixture 4, detalle del procedimiento** (para no modificar `support/world.ts` de forma permanente, tal como exigía la tarea): se creó el archivo fixture con una clase `CustomWorld` equivalente, se **editó temporalmente** la constante `CUSTOM_WORLD_FILE` en `src/architecture.test.ts` para apuntar al fixture, se corrió el test y se confirmó el fallo, y luego se revirtió la constante a `'support/world.ts'` y se borró el archivo fixture. Se re-corrió el test tras revertir y confirmó PASS contra el `support/world.ts` real — sin ningún rastro del cambio temporal en el diff final (`git diff` de `src/architecture.test.ts` no muestra ninguna edición relacionada con este paso).

**Verificación adicional no exigida por la lista de fixtures, hecha por rigor:** se agregó temporalmente un script `__t06_fixture_bad: "npx playwright test"` a `package.json` (vía un script Node que generó un backup y lo restauró), se confirmó que A3 lo detecta (`actual: ['__t06_fixture_bad']`), y se restauró `package.json` a su único cambio real de esta tarea (`git diff package.json` tras la restauración muestra exclusivamente la línea de `quality`).

Tras borrar/revertir los seis fixtures obligatorios (y la verificación adicional de A3), `git status --short` no mostró ningún rastro de ninguno de ellos — solo los tres archivos modificados y el nuevo `architecture.test.ts` (ver §11).

---

## 8. Integración con quality

Antes:
```json
"quality": "npm run typecheck && npm run lint && npm run format:check"
```

Después:
```json
"quality": "npm run typecheck && npm run lint && npm run format:check && npm run test:unit"
```

`test:unit` se mantiene como script independiente (`"test:unit": "node --test \"src/**/*.test.ts\""`), sin cambios — sigue pudiendo correrse solo. No se agregó ningún script `verify` adicional: `npm run quality` es ahora, literalmente, el único comando que un desarrollador, CI, o un agente de IA necesita correr para obtener la señal de calidad completa (estática + unitaria + arquitectónica), sin correr nunca la suite E2E de Cucumber.

---

## 9. Impacto en CI

`.github/workflows/ci.yml` ya ejecutaba `npm run quality` como un paso independiente de `npm test` (Cucumber). Como `quality` ahora incluye `test:unit` internamente, **no se agregó ningún paso nuevo** — agregar un paso `test:unit` separado habría ejecutado la misma suite dos veces en cada corrida de CI, exactamente la duplicación que la tarea pedía evitar. El único cambio fue corregir el `name:` de ese paso (de "typecheck + lint + format:check" a "typecheck + lint + format:check + test:unit") para que el nombre visible en los logs de GitHub Actions deje de describir un comando desactualizado. El pipeline sigue siendo: `Checkout → Setup Node → npm ci → Install Chromium → npm run quality (ahora con test:unit) → npm test (Cucumber) → Upload reports`.

---

## 10. Qué NO cambió

- ✅ Cucumber sigue siendo el único runner E2E — no se creó `playwright.config.ts`, ningún `*.spec.ts`, ni se agregó Playwright Test como runner.
- ✅ No se agregó ningún escenario funcional nuevo; `features/example/example.feature` no cambió.
- ✅ No se creó `BaseComponent`/`BaseUiObject`, ni cambios de locators, screenshots, logging, test data, API, auth, MCP, `CLAUDE.md`, agentes, paralelismo o retries.
- ✅ `support/world.ts`, `src/config/index.ts`, `src/database/clients/OracleDatabaseClient.ts` — sin cambios. Ningún invariante reveló una violación real preexistente.
- ✅ `eslint.config.js` — sin cambios; T06 no dependía de tocar los guardrails de T05.
- ✅ **A8 no recibió un test de arquitectura nuevo, deliberadamente.** `no-restricted-properties` (T05, G3) ya cubre `process.env.X` y `process.env['X']` en todo el repo excepto `src/config/**` y `*.test.ts`. Su único hueco conocido — `const { env } = process` seguido de `env.X` — ya fue evaluado y descartado explícitamente en `docs/ai-foundation-plan.md` ("no vale complejidad extra"); no existe ningún uso de ese patrón en el repo hoy. Duplicar esa protección en un architecture test habría sido copiar un guardrail que ESLint ya resuelve, en vez de complementarlo — exactamente lo que la tarea pedía evitar.
- ✅ Sin nuevas dependencias — `typescript` ya estaba instalado como devDependency antes de T06.
- ✅ `npm test` (Cucumber) no se ejecutó en ningún momento de esta tarea; los reportes existentes en `reports/cucumber/` son de una corrida anterior a esta sesión (confirmado por su timestamp de archivo).

---

## 11. Validaciones ejecutadas

### 11.1. `node --version`
```
v24.13.1
```

### 11.2. `npm run test:unit`
```
ℹ tests 57
ℹ suites 19
ℹ pass 57
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
57 = 49 preexistentes ([[T03-querybuilder-unit-tests]] + [[T04-config-unit-tests]]) + 8 nuevos de `architecture.test.ts` (A1, A2, A3, A4, A5, A6×2, A7).

### 11.3. `npm run typecheck`
PASS — sin salida.

### 11.4. `npm run lint`
PASS — sin salida.

### 11.5. `npm run format:check`
Primera corrida: `src/architecture.test.ts` con problemas de estilo. Corregido con `npx prettier --write src/architecture.test.ts` (único archivo formateado, dentro del alcance de T06). Segunda corrida:
```
Checking formatting...
All matched files use Prettier code style!
```

### 11.6. `npm run quality`
```
ℹ tests 57
ℹ suites 19
ℹ pass 57
ℹ fail 0
```
PASS de punta a punta — `typecheck`, `lint`, `format:check` y ahora también `test:unit`, en un solo comando.

### 11.7. `git status`
```
On branch feature/ai-foundation
Your branch is up to date with 'origin/feature/ai-foundation'.
Changes not staged for commit:
	modified:   .github/workflows/ci.yml
	modified:   README.md
	modified:   package.json
Untracked files:
	src/architecture.test.ts
```

### 11.8. `git diff --stat`
```
.github/workflows/ci.yml | 2 +-
README.md                | 4 ++--
package.json             | 2 +-
3 files changed, 4 insertions(+), 4 deletions(-)
```
(`src/architecture.test.ts` es untracked — nuevo — y no aparece en `--stat`.)

---

## 12. Problemas encontrados

**Ninguna violación real preexistente.** Los 8 invariantes pasaron contra el código productivo real sin necesitar ningún cambio: `support/world.ts` ya declaraba exactamente las propiedades de la allowlist, `setWorldConstructor` ya se registraba una única vez, `OracleDatabaseClient.ts` seguía siendo el único lugar que referencia `oracledb`, `example.feature` ya tenía tags, y ningún script de `package.json` invocaba `playwright test`.

Sin matices de diseño adicionales que documentar (a diferencia de T03/T04/T05, no se encontró ningún comportamiento sutil digno de nota en el código existente — los ocho invariantes ya eran ciertos, simplemente no estaban protegidos por ninguna herramienta).

---

## 13. Resultado

**Status:** ✅ **COMPLETADO SIN REGRESIONES**

- ✅ `src/architecture.test.ts` creado: 8 invariantes (A1-A7, más el caso extra de "la excepción de A6 no está obsoleta"), usando únicamente `node:test` + TypeScript Compiler API, sin dependencias nuevas.
- ✅ `npm run quality` ahora incluye `test:unit`; `test:unit` sigue siendo un script independiente; no se creó ningún comando `verify` adicional.
- ✅ CI no duplica la ejecución de `test:unit` — solo se corrigió el nombre de un paso que ya ejecutaba `quality`.
- ✅ `README.md` corregido en los dos puntos que quedaron directamente falsos por esta tarea, sin reescritura general.
- ✅ 6 fixtures negativos obligatorios (+ 1 verificación adicional de A3) creados, confirmados y **borrados/revertidos por completo** — incluyendo el caso de A5, validado sin tocar `support/world.ts` de forma permanente.
- ✅ Código productivo real: **sin cambios**, sin violaciones preexistentes.
- ✅ `npm run test:unit` (57/57), `npm run typecheck`, `npm run lint`, `npm run format:check` y `npm run quality`: todos PASS.
- ✅ Ninguna ejecución E2E (`npm test`/Cucumber) ocurrió durante esta tarea.

---

## 14. Aprendizaje técnico

1. **Lint vs. architecture test: alcance de una sola sintaxis vs. alcance de todo un repositorio.** ESLint razona sobre un archivo a la vez, con reglas expresadas como patrones sintácticos (AST de un archivo, o un `MemberExpression`/`CallExpression` local). No puede preguntar "¿existe algún archivo con este nombre en cualquier parte del repo?" ni "¿cuántas veces, en total, aparece esta llamada en todos los archivos?" — ambas preguntas cruzan archivos, y son exactamente las que responden A1/A2/A4/A6.

2. **Algunas reglas necesitan inspección de filesystem porque la violación es la existencia de un archivo, no su contenido.** G7/G8 de T05 ya hacían fallar el *contenido* de un `*.spec.ts`/`playwright.config.*` si ESLint llegaba a analizarlo — pero un archivo puede vivir en una carpeta que los `ignores` de ESLint nunca visitan, o el override puede desactivarse sin que nadie lo note. A1/A2 son la capa que no depende de que ESLint decida mirar ese archivo: preguntan directamente al filesystem, con su propia lista de exclusión, independiente de la de ESLint.

3. **AST es más robusto que regex para analizar TypeScript porque un regex no entiende sintaxis, solo texto.** Un regex sobre `setWorldConstructor\(` no puede distinguir una llamada real de un comentario o un string; un regex sobre las propiedades de una clase depende del formato exacto (saltos de línea, comentarios intercalados, un nombre de variable local parecido dentro de un método). El AST real, en cambio, sabe qué es una `ClassDeclaration`, qué es un `PropertyDeclaration` frente a un `MethodDeclaration`, y qué es un `CallExpression` real frente a texto que se le parece. El costo de usar el AST aquí fue cero dependencias nuevas — `typescript` ya estaba instalado — y el beneficio es que el test sobrevive a reformateos de `support/world.ts` que un regex no sobreviviría.

4. **Un framework de automatización necesita proteger su propia arquitectura, no solo generar buenos tests para las aplicaciones que prueba.** `CustomWorld` acumulando estado de negocio, o un segundo `setWorldConstructor` compitiendo con el primero, no son bugs que un Cucumber scenario normalmente detecte — son erosiones estructurales silenciosas que solo se notan mucho después, cuando ya son costosas de deshacer. A4/A5 convierten dos decisiones de diseño explícitas (documentadas en `README.md`: "Step Definitions should never... construct a Page or Repository manually") en hechos verificables en cada corrida de `npm run quality`, no solo en la memoria de quien las diseñó.

5. **Un único quality gate (`npm run quality`) es útil para humanos, CI y agentes de IA por la misma razón: reduce la superficie de decisión.** Antes de T06, "¿corrí todo lo que hace falta?" tenía una respuesta de varios pasos (`typecheck`, `lint`, `format:check`, y *además*, por separado, acordarse de `test:unit`). Después de T06, la respuesta es un solo comando. Para un agente de IA generando código, esto importa doblemente: un solo comando es más fácil de invocar correctamente sin omitir un paso, y es más difícil de "optimizar" corriendo solo una parte del gate para ahorrar tiempo, precisamente el tipo de atajo que un agente bajo presión de tiempo podría tomar si el gate real fueran cuatro comandos independientes.

6. **Defense in depth: cada capa cubre el punto ciego de la anterior, ninguna reemplaza a las demás.** `oracledb` es el ejemplo más claro de esta tarea: ESLint (T05, G4) bloquea `import ... from 'oracledb'` en cualquier archivo nuevo — pero el archivo que legítimamente usa `oracledb` hoy no usa `import`, usa `createRequire` + `require('oracledb')`, un patrón que ningún `no-restricted-imports` puede ver porque nunca aparece como una declaración de import. A6 cierra exactamente ese hueco, verificado empíricamente con un fixture que reproduce el patrón real. Ninguna de las dos capas por sí sola habría sido suficiente: ESLint es más rápido (feedback en el editor, sin correr nada) pero ciego a `require` dinámico; el architecture test ve `require` dinámico pero corre como parte de `test:unit`, no en el editor mientras se escribe. Juntas cubren lo que ninguna cubre sola — la misma lógica, a escala de todo el proyecto, detrás de cada guardrail agregado en T05 y T06.

---

## 15. Próxima tarea

`T07 — Normalizar el patrón canónico de locators.`

**NO EJECUTADO EN ESTA SESIÓN.**
