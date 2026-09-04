# T04 — Config Unit Tests

**Date:** 2026-09-04
**Status:** ✅ COMPLETED
**Branch:** `feature/ai-foundation`

---

## 1. Objetivo

Agregar una suite de tests unitarios permanente para `src/config/index.ts`, usando `node --test` sin dependencias nuevas, que proteja:

- los valores por defecto de la configuración;
- la validación de `HEADLESS`;
- la validación de `BROWSER`;
- la validación de `DEFAULT_TIMEOUT_MS`;
- `DB_ENABLED` y la exigencia de credenciales asociadas;
- `BASE_URL` y `requireBaseUrl()`;
- el aislamiento de la suite respecto del `.env` local, de variables preexistentes de terminal, del CI y del orden de ejecución;
- la restauración segura de `process.env` entre casos;
- las validaciones fail-fast del módulo (errores lanzados en tiempo de import).

Esta tarea continúa el trabajo de [T03-querybuilder-unit-tests](T03-querybuilder-unit-tests.md) (mismo runner, mismo patrón de import `.ts` explícito) y estaba explícitamente prevista como la "próxima tarea" al cierre de T03.

---

## 2. Estado inicial (al retomar tras la interrupción)

Esta ejecución **no partió de cero**: una sesión anterior de Claude Code fue interrumpida por un problema externo de acceso al servicio. Antes de tocar nada se verificó el estado real del repositorio en lugar de asumir lo que decía el reporte de la interrupción:

- `git status` → único cambio pendiente: `src/config/index.test.ts` (untracked). Sin cambios en ningún archivo trackeado (`git diff` vacío).
- `src/config/index.test.ts` ya existía con 213 líneas, tal como se reportó. Se leyó completo antes de decidir cualquier acción.
- Verificación línea por línea contra el objetivo de T04: el archivo ya implementaba **todos** los grupos de tests requeridos (defaults, HEADLESS, BROWSER, DEFAULT_TIMEOUT_MS, DB_ENABLED, BASE_URL/`requireBaseUrl()`) y una estrategia de aislamiento de environment completa (ver §4).
- No se encontró ningún cambio pendiente en `src/config/index.ts`, `package.json` ni `tsconfig.json` — no eran necesarios porque `test:unit` (`node --test "src/**/*.test.ts"`) y `allowImportingTsExtensions` ya habían sido agregados en T03 y cubren cualquier archivo `*.test.ts` nuevo sin registro adicional.
- No existía todavía `docs/refactor-progress-ia/T04-config-unit-tests.md`.
- No había evidencia de que se hubiera corrido `test:unit`, `typecheck`, `lint`, `format:check` ni `quality` contra este archivo en la sesión interrumpida.

**Conclusión:** la sesión anterior alcanzó a escribir la suite completa de tests pero fue interrumpida antes de validarla y antes de crear el registro. Esta sesión continuó exactamente desde ese punto: validación + registro, sin recrear ni sobrescribir `src/config/index.test.ts`.

---

## 3. Riesgo que protege esta suite

`src/config/index.ts` es el único punto de entrada de configuración de todo el framework: cualquier Page, Repository o step de Cucumber que use `config` o `requireBaseUrl()` depende de que esta validación fail-fast sea correcta. Antes de esta suite, un cambio futuro (manual o hecho por una IA) podía:

- relajar silenciosamente una validación (p. ej. aceptar `HEADLESS=1` sin querer, o dejar de exigir credenciales cuando `DB_ENABLED=true`);
- filtrar valores de credenciales (`DB_PASSWORD`, etc.) en un mensaje de error;
- romper el fallback a los valores por defecto sin que ningún test lo notara, porque el módulo se ejecuta una sola vez al importarse y no tenía cobertura de comportamiento, solo se verificaba indirectamente al correr Cucumber contra una app real.

Esta suite convierte esas garantías en hechos verificables automáticamente, igual que T03 lo hizo para `QueryBuilder`.

---

## 4. Estrategia de aislamiento de environment

Revisada y validada (no se modificó, ya era correcta):

1. **Variables de entorno:** antes de cada caso se guarda el valor original de cada una de las 9 claves que el módulo lee (`CONFIG_ENV_KEYS`) y se borra explícitamente (`delete process.env[key]`), de modo que ninguna variable preexistente de la terminal del desarrollador o del entorno de CI pueda filtrarse a un caso que espera esa variable ausente. Luego se aplican únicamente las variables que el caso concreto declara.
2. **Aislamiento de `.env`:** el import se hace después de mover `process.cwd()` a un directorio temporal vacío (`fs.mkdtempSync`), así `dotenv.config()` (que resuelve `.env` relativo al cwd) nunca encuentra el `.env` real del repositorio, incluso si existiera con valores reales. Se confirmó además que el repo no tiene `.env` (solo `.env.example`), y que los mensajes `injecting env (0) from .env` que imprime dotenv en cada test son ruido propio de la librería (los imprime siempre, haya o no archivo — ver `node_modules/dotenv/lib/main.js:302-317`), no evidencia de una fuga.
3. **Restauración segura:** un bloque `try/finally` garantiza que, tanto si el import tiene éxito como si lanza (fail-fast), se restaure el cwd original, se borre el directorio temporal y se devuelva cada variable de entorno a su valor original (o se borre si no existía). Esto evita contaminación entre casos y respecto de cualquier test que corra después en el mismo proceso.
4. **Independencia del orden de ejecución:** cada caso llama a `loadConfig(env)`, que hace un import con un query string incremental (`?case=N`) para forzar a Node a re-evaluar el módulo en lugar de reusar la instancia cacheada de un caso anterior. Esto es necesario porque `src/config/index.ts` ejecuta su validación una sola vez, a nivel de módulo, en el momento del import.

No fue necesario modificar `src/config/index.ts` para lograr este aislamiento.

---

## 5. Archivos creados/modificados en esta sesión

- **Ninguno.** `src/config/index.test.ts` ya existía completo de la sesión interrumpida y no requirió cambios. Esta sesión solo ejecutó validaciones y creó este registro (`docs/refactor-progress-ia/T04-config-unit-tests.md`).
- `package.json` y `tsconfig.json` no necesitaron cambios: la infraestructura (`test:unit`, `allowImportingTsExtensions`) ya fue agregada en T03 y cubre cualquier `*.test.ts` nuevo automáticamente vía el glob `src/**/*.test.ts`.

---

## 6. Tests implementados

18 tests nuevos, agrupados en 6 `describe`, dentro de `src/config/index.test.ts`:

| Grupo | # tests |
|---|---|
| `config — defaults` | 1 |
| `config — HEADLESS` | 3 |
| `config — BROWSER` | 2 |
| `config — DEFAULT_TIMEOUT_MS` | 5 |
| `config — DB_ENABLED` | 4 |
| `config — BASE_URL / requireBaseUrl()` | 3 |

Todos usan únicamente `node:test`, `node:assert/strict`, `node:fs`, `node:os`, `node:path` y `node:url`. Sin librerías externas, sin red, sin dependencia de un `.env` real.

---

## 7. Comportamientos cubiertos

- **Defaults:** sin ninguna variable relevante seteada, `config.headless === true`, `config.browser === 'chromium'`, `config.defaultTimeoutMs === 120_000`, `config.db.enabled === false`, `config.baseUrl === undefined`.
- **HEADLESS:** acepta `"true"` y `"false"` exactamente; rechaza cualquier otro valor (p. ej. `"yes"`) con el mensaje exacto de `index.ts`.
- **BROWSER:** acepta dinámicamente cada nombre declarado en `browserNames` (no hardcodeado — si el módulo agrega un browser nuevo, el test lo cubre automáticamente); rechaza un nombre desconocido con el mensaje exacto, incluyendo la lista de válidos.
- **DEFAULT_TIMEOUT_MS:** rechaza cero, negativo, decimal y no-numérico; acepta un entero positivo válido.
- **DB_ENABLED:** `false` nunca exige credenciales; `true` sin ninguna credencial reporta las tres faltantes por nombre; `true` con credenciales parciales reporta *solo* la faltante y **nunca** incluye en el mensaje de error los valores de las credenciales sí provistas (verificado explícitamente contra fuga de secretos); `true` con las tres credenciales completas las expone correctamente en `config.db`.
- **BASE_URL / `requireBaseUrl()`:** lanza con mensaje claro cuando `BASE_URL` está ausente; devuelve exactamente el valor configurado cuando está presente; trata un `BASE_URL` compuesto solo de espacios como ausente (coherente con `optionalEnv` haciendo `.trim()` sobre el valor).

---

## 8. Qué NO cambió

- ✅ `src/config/index.ts` — sin cambios de comportamiento ni de código. Ningún test reveló un bug real (ver §10).
- ✅ `package.json` / `tsconfig.json` — sin cambios; la infraestructura de T03 ya cubre este archivo.
- ✅ `quality` — sigue siendo `typecheck && lint && format:check`, **sin `test:unit`**, sin cambios respecto de T03.
- ✅ Sin nuevas dependencias en `devDependencies`/`dependencies`.
- ✅ Sin cambios a `eslint.config.js`, `cucumber.js`, `support/**`, ni a ningún Page/Component/Repository.
- ✅ Sin CLAUDE.md, sin MCP, sin agentes.

---

## 9. Validaciones ejecutadas

### 9.1. `node --version`
```
v24.13.1
```

### 9.2. `npm run test:unit`
```
ℹ tests 49
ℹ suites 12
ℹ pass 49
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 197.4376
```
(49 = 31 tests preexistentes de `QueryBuilder` de T03 + 18 tests nuevos de `config`. Los 18 tests nuevos pasaron en su totalidad.)

### 9.3. `npm run typecheck`
PASS (sin salida — `tsc --noEmit` limpio).

### 9.4. `npm run lint`
PASS (sin salida — `eslint .` limpio).

### 9.5. `npm run format:check`
```
Checking formatting...
All matched files use Prettier code style!
```
No fue necesario correr Prettier manualmente: el archivo ya cumplía el estilo.

### 9.6. `npm run quality`
```
typecheck: PASS
lint: PASS
format:check: All matched files use Prettier code style!
```
Confirmado: `quality` sigue **sin** incluir `test:unit`.

### 9.7. `git status`
```
On branch feature/ai-foundation
Your branch is up to date with 'origin/feature/ai-foundation'.

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        src/config/index.test.ts

nothing added to commit but untracked files present (use "git add" to track)
```

### 9.8. `git diff`
Vacío (sin cambios en archivos trackeados).

### 9.9. `git diff --stat`
Vacío (sin cambios en archivos trackeados; `src/config/index.test.ts` es untracked, no aparece en `diff --stat`).

---

## 10. Problemas encontrados

**Ningún bug real en `src/config/index.ts`.** Los 18 tests nuevos pasaron contra el código existente sin modificaciones. El comportamiento observado coincide en todos los casos con el comportamiento documentado/esperado: defaults, validación fail-fast de `HEADLESS`/`BROWSER`/`DEFAULT_TIMEOUT_MS`, exigencia condicional de credenciales de DB sin fuga de valores en mensajes de error, y manejo de `BASE_URL` (incluyendo el caso de un valor compuesto solo de espacios).

Un matiz observado (no es un bug, se documenta por transparencia): los mensajes `[dotenv@17.3.1] injecting env (0) from .env` que aparecen en la salida de `test:unit` son ruido propio de la librería `dotenv`, que loguea esa línea siempre que `quiet` no esté activado — independientemente de si el archivo `.env` existe o no y de cuántas claves inyectó (ver `node_modules/dotenv/lib/main.js:302-317`). No indica ninguna fuga del `.env` real del repositorio hacia los tests: se confirmó que el repo no tiene `.env` (solo `.env.example`) y que cada test corre con `cwd` apuntando a un directorio temporal vacío.

---

## 11. Resultado

**Status:** ✅ **COMPLETADO SIN REGRESIONES**

- ✅ Suite de 18 tests de comportamiento para `src/config/index.ts`, cubriendo defaults, `HEADLESS`, `BROWSER`, `DEFAULT_TIMEOUT_MS`, `DB_ENABLED` (incluyendo no-fuga de credenciales) y `BASE_URL`/`requireBaseUrl()`.
- ✅ Aislamiento completo respecto del `.env` real, de variables preexistentes de terminal, del CI y del orden de ejecución — verificado y validado, no solo asumido.
- ✅ `src/config/index.ts` sin cambios — ningún bug real detectado.
- ✅ `quality` intencionalmente sin `test:unit` todavía (sin cambios respecto de T03).
- ✅ `npm run test:unit` (49/49), `npm run typecheck`, `npm run lint`, `npm run format:check` y `npm run quality`: todos PASS.
- ✅ Sesión interrumpida retomada de forma idempotente: no se recreó ni sobrescribió trabajo previamente correcto.

---

## 12. Aprendizaje técnico

1. **Retomar una tarea interrumpida requiere verificar el estado real antes de actuar, no confiar en el reporte de la interrupción.** El reporte indicaba incertidumbre sobre si los tests estaban completos, si se habían corrido las validaciones y si existía el registro. Cada una de esas incertidumbres se resolvió leyendo el archivo completo y ejecutando los comandos reales, no asumiendo el peor caso (que hubiera obligado a recrear trabajo ya correcto) ni el mejor caso (que hubiera dejado sin validar una suite nunca ejecutada).

2. **Un mensaje de librería ruidoso no es automáticamente un problema de aislamiento.** Las líneas `injecting env (0) from .env` podrían leerse a primera vista como evidencia de que dotenv está tocando el `.env` real del repo en cada test. Verificar la fuente de `dotenv` confirmó que ese log es incondicional (aparece con o sin archivo, con 0 o más claves) y que el conteo real (`0`) es la prueba concreta de que no se inyectó nada — la estrategia de aislamiento (cwd en directorio temporal) funciona como está diseñada.

3. **La infraestructura de test compartida (T03) amortiza el costo de tareas siguientes.** Agregar cobertura a un segundo módulo (`config`) no requirió tocar `package.json` ni `tsconfig.json`: el glob `src/**/*.test.ts` y `allowImportingTsExtensions` ya eran genéricos. Esto confirma que la decisión de T03 de generalizar el runner (en vez de registrar archivos de test uno por uno) fue correcta.

4. **La cobertura de "no fuga de secretos en mensajes de error" es tan importante como la cobertura de "el valor correcto se acepta".** El test de `DB_ENABLED=true` con credenciales parciales no solo verifica qué falta — verifica explícitamente que los valores de las credenciales sí provistas nunca aparecen en el mensaje de error. Es el mismo principio de seguridad por diseño que T03 aplicó a los binds de `QueryBuilder`, ahora aplicado a la superficie de configuración.

---

## 13. Próxima tarea

`T05 — Implementar guardrails arquitectónicos con ESLint.`

**NO EJECUTADO EN ESTA SESIÓN.**
