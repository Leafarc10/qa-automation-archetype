# T03 — QueryBuilder Unit Tests

**Date:** 2026-09-04
**Status:** ✅ COMPLETED
**Branch:** `feature/ai-foundation`

---

## 1. Objetivo

Resolver la primera parte de P7 del AI Foundation Plan:

1. agregar un runner unitario (`node --test`) sin nuevas dependencias;
2. agregar una suite real y permanente de tests de comportamiento para `QueryBuilder` (273 líneas, crítico en seguridad, cobertura cero hasta hoy);
3. proteger explícitamente su modelo de seguridad (binds nunca interpolados, identificadores solo por allowlist) con tests;
4. **no** integrar todavía `test:unit` al comando `quality` — esa integración queda para una tarea posterior.

---

## 2. Estado inicial

- No existía ningún runner de unit tests en el repo. `package.json` solo tenía scripts de Cucumber (`test`, `test:ui`, `test:smoke`, `test:regression`, `test:db`) y de calidad estática (`typecheck`, `lint`, `format:check`, `quality`).
- `src/database/builders/QueryBuilder.ts` no tenía ningún archivo de test asociado.
- `tsconfig.json` no tenía `allowImportingTsExtensions`; `package.json` no declaraba `engines.node`.
- Node instalado: confirmar en §3.

---

## 3. Decisión técnica del runner

**Revalidado antes de escribir la suite** (no se asumió el hallazgo del plan sin comprobarlo de nuevo):

- **Versión de Node:** `v24.13.1` (`node --version`). Cumple `>=24.12`. No se encontró razón técnica para pedir una versión distinta a la que realmente corre en este entorno — Node 24 trae el type-stripping nativo sin flag para sintaxis TypeScript "erasable" (sin enums, sin namespaces, sin parameter properties).
- **Probe 1 — import con especificador `.js` que resuelve a `.ts` (patrón NodeNext habitual del repo):** falla en runtime con `ERR_MODULE_NOT_FOUND` (`Cannot find module '...QueryBuilder.js'`). Confirma el límite ya documentado en el plan (§5.2, hallazgo #3).
- **Probe 2 — mismo import pero con extensión explícita `.ts`** (`from './QueryBuilder.ts'`): **funciona** en runtime con `node --test`, sin flags adicionales. `QueryBuilder.ts` solo tiene un `import type` hacia `db.types.ts` (se borra por completo, no genera resolución en runtime), así que es exactamente el módulo "testeable hoy" que describe el plan.
- **Consecuencia para `tsc`:** `tsc --noEmit` rechazaba el import con extensión `.ts` explícita (`TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled`). Se agregó `"allowImportingTsExtensions": true` a `tsconfig.json` — válido porque el proyecto solo usa `tsc` en modo `--noEmit` (nunca emite JS desde TS), que es exactamente el requisito de esa opción. Sin este cambio, `npm run typecheck` fallaría sobre el propio archivo de test.
- **Runner elegido:** `node --test "src/**/*.test.ts"` — cero dependencias nuevas, coherente con el hallazgo ya validado en el plan (`ts-node/esm` + `node:test` falla con `ERR_REQUIRE_CYCLE_MODULE` en Node 24; no se volvió a probar por ser un descarte ya confirmado y no relevante para el patrón de import elegido).

---

## 4. Archivos modificados

- `package.json` — agregado `"test:unit": "node --test \"src/**/*.test.ts\""` y `"engines": { "node": ">=24.12" }`. **`quality` no fue modificado.**
- `tsconfig.json` — agregado `"allowImportingTsExtensions": true` (estrictamente necesario para que `npm run typecheck` acepte el import con extensión `.ts` que usa la nueva suite; sin este cambio el typecheck falla sobre el archivo de test).
- `src/database/builders/QueryBuilder.test.ts` (nuevo) — suite de tests de `QueryBuilder`.

`QueryBuilder.ts` **no fue modificado**: ningún test reveló un bug real (ver §9).

---

## 5. Tests implementados

31 tests, agrupados en 6 `describe`:

| Grupo | # tests |
|---|---|
| `QueryBuilder.buildWhere — binds` | 4 |
| `QueryBuilder — identifier allowlists` | 5 |
| `QueryBuilder — operators` | 4 |
| `QueryBuilder.buildWhere — edge cases` | 6 |
| `QueryBuilder.buildInsert / buildUpdate — writes` | 6 |
| `QueryBuilder.buildOrderBy / buildOraclePagination` | 6 |

Todos usan únicamente `node:test`, `node:assert/strict`, `QueryBuilder`, `QueryBuilderError` y los tipos de `db.types.ts` (`import type`). Sin librerías externas, sin mocks, sin red, sin variables de ambiente, sin artifacts generados. Ejecutan en ~135ms.

---

## 6. Reglas de seguridad cubiertas

- **Binds nunca interpolados:** un filtro `=` con un valor malicioso (`"1); DROP TABLE USERS; --"`) viaja intacto en `binds` y **no aparece** en el string de la cláusula SQL generada. Lo mismo se verifica para `buildInsert`/`buildUpdate`: los valores (`'Ada'`, `'ada@example.com'`) nunca aparecen en el `query` generado.
- **`IN` genera un bind por valor** (3 valores → 3 binds nombrados `campo_idx_0..2`).
- **`BETWEEN` genera exactamente dos binds** (`_start`/`_end`), nunca más ni menos.
- **Identificador con forma maliciosa rechazado incluso si está en la allowlist:** se probó pasando `"USERS; DROP TABLE USERS; --"` como único elemento del propio array de allowlist — el regex de forma (`IDENTIFIER_PATTERN`) lo rechaza antes de que la membresía en la allowlist entre en juego. Esto confirma que la validación de forma es una capa independiente de la validación de membresía, no reemplazable por ella.
- **Campo/tabla/columna fuera de la allowlist rechazados** en `buildWhere`, `buildOrderBy`, `buildInsert` y `buildUpdate` (tabla y columnas por separado).
- **Operador arbitrario rechazado incluso bypaseando TypeScript** (`'DROP' as unknown as SqlOperator`): confirma que la validación en runtime no depende únicamente del tipo estático `SqlOperator`, que un caller real (o una IA que ignore el tipo) podría eludir.
- **Operador lógico (`AND`/`OR`) validado en runtime** con el mismo patrón de bypass de tipos.
- **`buildUpdate` sin filtros rechazado** — nunca un UPDATE incondicional que afecte todas las filas.
- **`buildInsert`/`buildUpdate` sin columnas rechazados.**
- **Paginación:** límite no entero, cero o negativo rechazado; un límite válido genera exactamente la estructura Oracle esperada (`SELECT * FROM (...) WHERE ROWNUM <= N`).

---

## 7. Qué NO cambió

- ✅ `QueryBuilder.ts` — sin cambios de comportamiento ni de código.
- ✅ `quality` — sigue siendo `typecheck && lint && format:check`, **sin `test:unit`** (integración diferida a una tarea posterior, según instrucción explícita de esta tarea).
- ✅ Sin nuevas dependencias en `devDependencies`/`dependencies`.
- ✅ Sin cambios a `eslint.config.js`, `cucumber.js`, `support/**`, ni a ningún Page/Component/Repository.
- ✅ Cucumber sigue siendo el único runner E2E — no se agregó `playwright.config.ts`, ni `*.spec.ts`, ni Playwright Test como runner.
- ✅ Sin CLAUDE.md, sin MCP, sin agentes.

---

## 8. Validaciones ejecutadas

### 8.1. `node --version`
```
v24.13.1
```

### 8.2. `npm run test:unit`
```
ℹ tests 31
ℹ suites 6
ℹ pass 31
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 134.6992
```

### 8.3. `npm run typecheck`
PASS (sin salida — `tsc --noEmit` limpio).

### 8.4. `npm run lint`
PASS (sin salida — `eslint .` limpio).

### 8.5. `npm run format:check`
```
Checking formatting...
All matched files use Prettier code style!
```
(Se corrigió el formateo del archivo de test nuevo con `prettier --write` antes de este resultado final — el archivo recién creado no coincidía con el estilo de Prettier en algunas líneas largas.)

### 8.6. `npm run quality`
```
typecheck: PASS
lint: PASS
format:check: All matched files use Prettier code style!
```
Confirmado: `quality` sigue **sin** incluir `test:unit`, tal como pide esta tarea.

---

## 9. Problemas encontrados

**Ningún bug real en `QueryBuilder.ts`.** Los 31 tests pasaron contra el código existente sin modificaciones. No se detectó ninguna discrepancia entre el comportamiento documentado/esperado (binds, allowlists, validación de escrituras, paginación) y el comportamiento real.

Un matiz de diseño observado (no es un bug, se documenta por transparencia): `assertLogicalOperator` solo se invoca cuando `filters.length > 0` (por el `return` temprano de `buildWhere` con `filters: []`). Esto significa que `buildWhere([], allowedFields, 'XOR' as any)` no lanzaría error — no hay condiciones que unir, así que el operador lógico nunca se usa. Es un comportamiento coherente con la intención del código (no hay nada que validar si no hay cláusulas), no una falla de seguridad, y no se reporta como bug.

---

## 10. Resultado

**Status:** ✅ **COMPLETADO SIN REGRESIONES**

- ✅ Runner unitario (`node --test`, cero dependencias nuevas) agregado y validado contra Node 24.13.1.
- ✅ 31 tests de comportamiento cubriendo binds, allowlists, operadores, casos límite, escrituras y paginación de `QueryBuilder`.
- ✅ `QueryBuilder.ts` sin cambios — ningún bug real detectado.
- ✅ `quality` intencionalmente sin `test:unit` todavía.
- ✅ `npm run test:unit`, `npm run typecheck`, `npm run lint`, `npm run format:check` y `npm run quality`: todos PASS.

---

## 11. Aprendizaje técnico

1. **Un framework de automatización necesita tests de su propia infraestructura, no solo de las apps que testea.** `QueryBuilder` es código de producción del framework (construye SQL parametrizado para cualquier Repository futuro); si falla silenciosamente, el daño no aparece en un escenario de Cucumber que use un Page — aparece como una query mal formada o, peor, como una inyección SQL en un proyecto real que herede el archetype. La cobertura de tests aquí no es "domain testing", es proteger la plataforma que todos los proyectos van a usar.

2. **Test estático vs. test de comportamiento son complementarios, no sustitutos.** `typecheck`/`lint` verifican que el código sea internamente consistente y tipado (p. ej., que `operator` sea del tipo `SqlOperator`), pero **no** verifican qué pasa en runtime cuando alguien —una IA generando un Repository, o un desarrollador bajo presión— hace un cast (`as any`) o construye el valor dinámicamente y el chequeo de tipos deja de aplicar. Varios tests de esta suite (operador arbitrario, dirección arbitraria, operador lógico arbitrario) prueban exactamente ese escenario: la validación en runtime debe sostenerse **sin** la red de TypeScript.

3. **Binds y allowlists necesitan cobertura explícita porque son el modelo de seguridad completo de este archivo.** `QueryBuilder` no tiene ninguna otra defensa contra SQL injection: los valores siempre viajan como binds (nunca interpolados) y los identificadores (tabla/columna/campo) solo pueden venir de un allowlist explícito, nunca de datos del caller. Si alguno de esos dos mecanismos se rompiera en un cambio futuro, sería exactamente el tipo de regresión silenciosa que no se nota en un code review superficial pero sí en un test que arma un payload malicioso y verifica que nunca llegue al string SQL.

4. **No usamos Oracle real porque `QueryBuilder` no lo necesita — y usarlo sería probar la herramienta equivocada.** `QueryBuilder` es puro: recibe datos, arma un string SQL y un objeto de binds, y no ejecuta nada contra una base de datos (eso es responsabilidad de `OracleDatabaseClient`/`BaseRepository`, fuera del alcance de T03). Probarlo contra Oracle real agregaría una dependencia de red/infraestructura a una suite que hoy corre en ~135ms, sin ganar ninguna cobertura adicional sobre la lógica que realmente importa: la construcción del SQL y la validación de identificadores/binds.

5. **Una red de tests importa especialmente cuando una IA puede modificar código.** Un agente que recibe la instrucción "agregá soporte para ordenar por un campo dinámico" podría, sin esta suite, escribir un `buildOrderBy` que interpole el campo directamente o que relaje la validación de la allowlist "para que funcione". Con la suite existente, ese cambio rompe tests concretos y con nombres explícitos (`rejects an ORDER BY field that is not in the allowlist`) antes de llegar a producción — convierte una prohibición de prosa (README/AGENTS) en un hecho verificable automáticamente.

---

## 12. Próxima tarea

`T04 — Agregar tests unitarios de configuración.`

**NO EJECUTADO EN ESTA SESIÓN.**
