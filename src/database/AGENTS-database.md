# Database Module – AGENTS

## 1. Alcance del módulo

El módulo `src/database` provee la frontera DB genérica del framework:

- `DatabaseClient` – contrato mínimo (`execute`, `close`) sin dependencia de ningún driver.
- `OracleDatabaseClient` – única implementación real (Oracle), inyectable.
- `BaseRepository` – helpers genéricos (`select`, `insert`, `update`, `delete`, `executeProcedure`) sobre un `DatabaseClient` inyectado por constructor.
- `RepositoryContainer` – punto de composición inyectable: recibe un `DatabaseClient` ya construido y compone los repositorios concretos que cada proyecto necesite.
- `QueryBuilder` y `db.types` – utilidades y tipos compartidos para construir queries parametrizadas.

Existe un primer repositorio concreto, neutral: `ExampleRepository` (ver sección 5.1), compuesto por `RepositoryContainer` como `this.example`.

Los tests deben acceder a la BBDD **solo** a través de repositorios que extiendan `BaseRepository`; no se realizan queries sueltas desde los steps.

---

## 2. Mapa de archivos principales

- `clients/DatabaseClient.ts`
  - Contrato (`interface`/`type` únicamente, sin runtime) que todo motor debe implementar.
- `clients/OracleDatabaseClient.ts`
  - Implementación Oracle: configuración inmutable por constructor, pool lazy, `execute`/`close`.
- `repositories/BaseRepository.ts`
  - Clase base abstracta; recibe `DatabaseClient` por constructor y expone helpers protegidos.
- `RepositoryContainer.ts`
  - Recibe un `DatabaseClient` por constructor; compone `example: ExampleRepository`.
- `repositories/example/ExampleRepository.ts`
  - Primer repositorio concreto y neutral: `findById`/`findByStatus` de solo lectura sobre un contrato de ejemplo (`EXAMPLE_ITEMS`), no una tabla real creada por este framework.
- `builders/QueryBuilder.ts`
  - Construcción de `WHERE`, `ORDER BY`, paginación e `INSERT`/`UPDATE` dinámicos con binds.
- `types/db.types.ts`
  - Tipos compartidos: `QueryResult<T>`, `BindParams`, `WhereClause`, `SqlOperator`, `FilterCondition`.

---

## 3. DatabaseClient / OracleDatabaseClient

- `DatabaseClient` no importa ningún driver; es eliminado por completo al compilar (solo tipos).
- `OracleDatabaseClient` recibe `{ user, password, connectString, oracleClientLibDir?, poolMin?, poolMax?, poolIncrement? }` por constructor. No existe selección de país ni estado global mutable.
- Lifecycle de pools: integrado a Cucumber. El único owner del `DatabaseClient` es `support/databaseLifecycle.ts` (`BeforeAll` lo crea vía import dinámico solo si `DB_ENABLED=true`, `AfterAll` lo cierra una única vez).
- `outFormat` ya no es estado global del driver: se pasa como opción por llamada dentro de `execute()` (`OUT_FORMAT_OBJECT`), no como `oracledb.outFormat = ...` a nivel de módulo.
- Thin/Thick: Thin es el default (sin `oracleClientLibDir`); Thick solo si se configura `oracleClientLibDir`. El proceso queda "bloqueado" al primer modo usado — un segundo client que pida el modo contrario falla con un error explícito en vez de cambiar de modo silenciosamente.

---

## 4. BaseRepository

- Constructor: `constructor(protected readonly client: DatabaseClient)`.
- No conoce Oracle, `oracledb`, países ni connection strings — solo `DatabaseClient` y tipos propios (`BindParams`, `QueryResult<T>`, `ExecuteOptions`).
- Helpers protegidos (no públicos): `select` (`autoCommit: false`), `insert`, `update`, `delete`, `executeProcedure` — todos delegan en `execute`, que a su vez delega en `this.client.execute(...)`.
- Ser `protected` evita que un step llame SQL directamente a través de un repositorio; solo los métodos de dominio que un repositorio concreto exponga son invocables desde steps.

---

## 5. RepositoryContainer

- Constructor: `constructor(private readonly client: DatabaseClient)`.
- No crea `OracleDatabaseClient`, no lee `process.env`, no selecciona país: recibe el client ya construido.
- `client` es privado: ningún consumidor externo (Step, `CustomWorld`, etc.) puede llamar `this.repositories.client.execute(...)`. El único uso es interno a la clase, para componer repositorios concretos.
- Compone `example: ExampleRepository` en su propio constructor (`this.example = new ExampleRepository(client)`); un Step accede vía `this.repositories.example.findById(...)`, nunca vía `this.repositories.client`.

### 5.1. ExampleRepository

- Archivo: `repositories/example/ExampleRepository.ts`. Extiende `BaseRepository`, recibe `DatabaseClient` por constructor (`super(client)`).
- Dominio neutral de demostración: `EXAMPLE_ITEMS` con columnas `ID`, `NAME`, `STATUS` — un **contrato de ejemplo**, no una tabla creada, poblada ni verificada contra ninguna base real por este repositorio.
- Métodos públicos, de solo lectura: `findById(id: number)`, `findByStatus(status: string)`. No expone `execute`/`select`/`insert`/`update` genéricos ni un `find(table, filters)` de propósito general.
- Primer consumidor real de las allowlists de identificadores: `EXAMPLE_FIELDS = ['ID','NAME','STATUS'] as const`, pasada a `QueryBuilder.buildWhere(...)`. El nombre de tabla (`EXAMPLE_TABLE`) es una constante de código, nunca un parámetro externo.
- No importa `OracleDatabaseClient` ni `oracledb`; podría recibir cualquier implementación futura de `DatabaseClient` sin cambios.
- No existe todavía un Feature/Step `@db` que lo ejecute contra Cucumber: este repositorio fue validado con un `FakeDatabaseClient`, y se decidió explícitamente NO crear un Feature `@db` (evitar una prueba roja en el template sin schema/datos reales). `npm run test:db` existe y hoy ejecuta 0 escenarios; un proyecto real agregará sus Features `@db` cuando tenga una DB propia.

---

## 6. QueryBuilder y tipos compartidos

- Es infraestructura para `Repository`/`BaseRepository`, nunca para Step Definitions (`Step → RepositoryContainer → Repository → BaseRepository/QueryBuilder → DatabaseClient`).
- **Valores:** siempre viajan como binds (`buildWhere`, `buildInsert`, `buildUpdate` nunca interpolan un valor directamente en el SQL).
- **Identificadores (tabla, columna, campo de `ORDER BY`):** NO se aceptan libres. Cada método que los usa exige un `IdentifierList` (allowlist) provisto explícitamente por el repositorio llamante — `QueryBuilder` no mantiene ningún registro/schema propio. Un identificador se rechaza (`QueryBuilderError`) si no tiene forma de identificador SQL simple (`/^[A-Za-z_][A-Za-z0-9_]*$/`) o si no está en la allowlist recibida. Nunca se sanitiza automáticamente: siempre `reject`, nunca `sanitize and continue`.
- **Operadores:** `SqlOperator` sigue siendo una unión cerrada; además se valida en runtime contra esa misma lista (no solo por tipos), para que un caller que ignore TypeScript no pueda inyectar un operador arbitrario.
- **`buildWhere`:** `IN` exige al menos un valor (rechaza `IN []`); `BETWEEN` exige exactamente dos valores; `IS NULL`/`IS NOT NULL` no generan bind. `logicalOperator` (`AND`/`OR`) también se valida en runtime. Filtros vacíos (`[]`) devuelven `{ clause: '', binds: {} }`.
- **`buildOrderBy`:** valida `field` contra la allowlist y `direction` contra `'ASC' | 'DESC'` exclusivamente.
- **`buildInsert`/`buildUpdate`:** `table` y cada columna se validan contra sus respectivas allowlists; un `data` vacío es error. `buildUpdate` además **rechaza filtros vacíos por defecto** (nunca genera un `UPDATE` sin `WHERE`); un "update global" real requeriría una API explícita separada, no implementada.
- **`buildOraclePagination`** (antes `buildPagination`): sigue siendo Oracle-specific (`ROWNUM`), renombrado para que no se lea como paginación genérica multi-engine. No hay paginación genérica ni Postgres `LIMIT/OFFSET`.
- **Cobertura de tests:** `builders/QueryBuilder.test.ts` es una suite unitaria permanente (`node --test`, corrida vía `npm run test:unit`, integrada a `npm run quality`) que protege específicamente el modelo de seguridad descrito arriba — binds nunca interpolados, allowlists de identificadores, validación en runtime de operadores/paginación. Cualquier cambio a `QueryBuilder.ts` que rompa una de estas garantías falla el quality gate, no solo una revisión manual.

---

## 7. Guía para extender la capa database

1. **Agregar un nuevo repositorio de dominio:**
   - Crear `src/database/repositories/<area>/<NuevaEntidad>Repository.ts` (convención vigente, la misma que usa `repositories/example/ExampleRepository.ts`).
   - Extender `BaseRepository` y llamar `super(client)` desde el propio `RepositoryContainer` al instanciarlo.
   - Usar `QueryBuilder` para construir WHEREs, INSERTs y UPDATEs con binds.
   - Exponer métodos de alto nivel de dominio, nunca SQL crudo hacia steps.
   - Agregar la propiedad correspondiente en `RepositoryContainer`.

2. **Cambiar configuración de conexión:**
   - Configuración vía `src/config/index.ts` (`config.db`); no leer `process.env` directamente desde `BaseRepository`/`RepositoryContainer`.

3. **Nuevo motor DB:**
   - Implementar `DatabaseClient` (ej. `PostgresDatabaseClient`) y pasarlo al `RepositoryContainer` — no requiere modificar `BaseRepository`.

4. **Nuevos tipos SQL u operadores:**
   - Agregar a `SqlOperator` y soportarlo explícitamente en `QueryBuilder.buildWhere` (incluyendo la lista `ALLOWED_OPERATORS` interna de runtime).
   - Cualquier tabla/columna/campo de `ORDER BY` nuevo debe declararse en la allowlist (`IdentifierList`) que el repositorio pasa a `QueryBuilder`, nunca aceptarse como string libre.
