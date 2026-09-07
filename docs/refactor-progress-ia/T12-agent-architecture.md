# T12 — AI Agent Architecture

**Date:** 2026-09-07
**Status:** ✅ COMPLETED (tarea de diseño — no se creó ningún agente)
**Branch:** `feature/claude-ai-integration`
**Baseline commit:** `a1855eb` (chore: normalize cross-platform line endings)
**Fase:** 2 — Claude Code + agentes + Playwright MCP · segunda tarea (después de T11 / T11.1)
**Entregable principal:** `docs/ai-agent-architecture-plan.md`

---

## 1. Objetivo

Diseñar la arquitectura **mínima** de agentes especializados de Claude Code necesaria para
automatización QA asistida por IA sobre este framework, y dejarla registrada como decisión
trazable antes de implementar nada.

T12 es **exclusivamente de diseño**. No crea agentes, no crea `.claude/`, no instala MCP, no crea
skills ni workflows, no modifica código productivo y no avanza a T13.

El objetivo no es tener muchos agentes: es conseguir que este flujo sea confiable y repetible para
un QA que no programa a tiempo completo.

```text
requerimiento / HU → entender qué probar → detectar información faltante → diseñar escenarios y
validaciones → revisar qué ya existe → implementar solo lo necesario → quality + E2E →
review independiente
```

**Fuentes usadas** (leídas en esta tarea, no asumidas): `CLAUDE.md`, `README.md`, `AGENTS.md`,
`support/AGENTS-support.md`, `src/database/AGENTS-database.md`,
`docs/ai-foundation-readiness-final.md`, `docs/ai-foundation-final-audit.md`,
`docs/refactor-progress-ia/T11-claude-contract.md`,
`docs/refactor-progress-ia/T11.1-line-endings.md`, más la estructura real del repo
(`package.json`, `cucumber.js`, `.prettierignore`, `.gitattributes`, `features/**`,
`src/pages/**`, `src/components/**`, `src/pageContainer/Pages.ts`).

---

## 2. Alternativas evaluadas

| | A — 2 agentes | B — 3 agentes | C — 4 agentes |
|---|---|---|---|
| Composición | Analysis/Planning + Implementation/Review | QA Analyst + Automation Engineer + Automation Reviewer | + Automation Planner |
| Claridad de responsabilidades | media (dos trabajos por agente) | **alta** (un verbo por agente) | alta, pero el split Planner/Engineer es artificial |
| Duplicación | review duplica el razonamiento del implementador, dentro de la misma cabeza | **ninguna** | **real**: Planner y Engineer leen el mismo código |
| Handoffs | 1 | **2** | 3 |
| Pérdida de contexto | alta *dentro* del agente que implementa y se autorevisa | baja | **la peor**: el plan viaja como prosa y se pierde el detalle fino |
| Tokens | menor nominal; un defecto no detectado cuesta un ciclo completo | **moderado** | **el mayor**: el repo se explora dos veces por cambio |
| Facilidad para el QA | igual en las tres (la sesión principal coordina) | igual | igual + una aprobación extra sin decisión nueva |
| Control de errores | **débil**: nadie independiente emite veredicto | **fuerte**: contexto fresco, gate re-ejecutado | fuerte, pero no más que B |
| Escalabilidad | pobre | **buena** | buena, con costo permanente por corrida |

**A se descartó** por `implementation-review`: el modo de falla más caro de este repo es *código
que pasa el gate estando arquitectónicamente mal o fabricado* (`CLAUDE.md` §8 documenta cinco
caminos verdes residuales: F-03, F-06, F-10, F-15, F-16). Detectarlos exige leer el diff **sin** la
historia que lo produjo; un agente que se revisa a sí mismo ya decidió que su salida está bien.
Además A pone al mismo actor la obligación de decir "UNKNOWN, no implemento" y la de producir
código — presión que se resuelve inventando la regla faltante.

**C se descartó** porque el valor de C no está en el agente, está en el **gate**: que el usuario
apruebe el set de archivos antes de que exista código. B conserva el gate y elimina el agente
(detalle en §5).

**Elegida: B — 3 agentes.**

---

## 3. Arquitectura seleccionada

```text
SESIÓN PRINCIPAL DE CLAUDE CODE  =  orquestador
  (único actor que habla con el usuario · sostiene el estado del workflow · pasa los handoffs)
        │
        ├─ 1) qa-analyst           → QA Analysis        → [GATE 1: usuario responde UNKNOWNs]
        ├─ 2) automation-engineer  → Automation Plan    → [GATE 2: usuario aprueba archivos]
        ├─ 3) automation-engineer  → implementación + npm run quality + E2E
        ├─ 4) automation-reviewer  → APPROVED | CHANGES_REQUESTED
        └─ 5) el usuario commitea  (ningún agente commitea nunca)
```

**No hay agente Orchestrator.** La razón es técnica, no estética: los dos gates del workflow son
interacciones con el usuario, y un subagente no tiene canal con el usuario. Un Orchestrator tendría
que rebotar cada pregunta y cada aprobación a través de la sesión principal — es decir, la sesión
principal es el orquestador de todas formas, con un hop extra que solo puede perder información y
gastar tokens. Además necesitaría spawnear subagentes (delegación anidada), algo frágil y que este
diseño prohíbe explícitamente.

La preferencia inicial del usuario (no crear Orchestrator) resultó correcta, y por un motivo más
fuerte que la preferencia. La coordinación determinista, si se quiere, se implementa como
**skill / slash command** en T14 — mismo efecto, sin contexto extra ni llamada de modelo extra.

---

## 4. Agentes seleccionados

### 4.1. `qa-analyst` — read-only, sin shell

Responde: *"¿qué necesitamos saber antes de automatizar esto, y qué exactamente hay que
automatizar?"*

- **Input:** el requerimiento / HU / bug tal cual lo dio el usuario; opcionalmente el repo en modo
  lectura para ver qué cobertura ya existe.
- **Output:** una **QA Analysis** de ≤ 1 página (§6.1). Nada más.
- **Produce:** comportamiento esperado reformulado, escenarios con id estable (`S-1`, `S-2`, …)
  marcados positivo/negativo y con tag propuesto (`@ui`, `@db`, `@smoke`, `@regression`),
  precondiciones, datos, validaciones UI/DB/otras, riesgos, y `UNKNOWN` /
  `NEEDS CONFIRMATION` etiquetados **blocking** o **non-blocking**.
- **No hace:** código, Gherkin, locators, SQL; no decide qué Page/Component/Repository crear; no
  decide reglas de negocio, resultados esperados, credenciales, ambientes ni datos; no explora la
  app (sin MCP).
- **Se detiene:** ante un `UNKNOWN` blocking que deja el comportamiento central indefinido; si el
  requerimiento necesita una capacidad ausente del framework; si en realidad son varios
  requerimientos (un scope por corrida); si se le pide implementar o ejecutar algo.

### 4.2. `automation-engineer` — el único que escribe

Convierte un análisis **aprobado** en el cambio mínimo correcto, y lo demuestra. Tres fases con
parada obligatoria entre 1 y 2:

1. **PLAN** — busca qué ya existe y devuelve `Reuse` / `Create` / `Modify` con paths exactos y una
   línea de justificación cada uno, más `Protected infrastructure impact` (esperado: `NONE`) y los
   escenarios que **no** va a implementar por un `UNKNOWN` blocking. **No toca ningún archivo.**
2. **IMPLEMENT** — solo los paths aprobados, siguiendo los ejemplos canónicos del repo. Steps thin;
   locators como `private readonly` o factory privado; un Page nuevo se registra en `Pages.ts`.
3. **VALIDATE** — `npm run quality`, el E2E relevante por tag, `git diff` / `git diff --stat`, y
   reporta — incluyendo los fallos, textuales.

- **No hace:** decidir lo que el análisis dejó `UNKNOWN` y blocking; escribir un selector, URL,
  credencial o dato que no pueda **fundamentar**; tocar infraestructura protegida; relajar un
  guardrail; arreglar hallazgos ajenos al scope (los reporta, `CLAUDE.md` §14); `git add/commit/
  push/reset/clean`; instalar dependencias; declarar done con `quality` en rojo.
- **Se detiene:** análisis con `UNKNOWN` blocking sobre todo el scope; plan no aprobado; el trabajo
  requiere infraestructura protegida (protocolo de 4 pasos de `CLAUDE.md` §9); un guardrail rechaza
  el cambio y la única salida aparente sería editar `eslint.config.js` o `src/architecture.test.ts`
  (parada dura, no un juicio propio); `format:check` rojo en archivos que no tocó → aislar la etapa
  y verificar si el rojo se reproduce en árbol limpio en el commit base antes de "arreglar" código
  (lección de T11.1).

### 4.3. `automation-reviewer` — read-only + shell de verificación

Emite `APPROVED` o `CHANGES_REQUESTED` desde un contexto que **nunca vio el razonamiento del
Engineer**. Recibe el análisis aprobado, el plan aprobado, el reporte de implementación y el
working tree — no el transcript del Engineer. **Re-ejecuta el gate él mismo**: un veredicto basado
en los exit codes que reportó el Engineer no es independiente.

Checklist de 12 ítems, cada uno con veredicto explícito (`n/a` vale, el silencio no): cobertura del
requerimiento · scope (todo archivo del diff debe estar en el plan aprobado) · steps thin (incluido
`playwright-core`, que G5 **no** cubre — F-06) · arquitectura UI (incluido el locator page-wide
desde el parámetro local `page`, que A11 **no** cubre — F-15) · locators · **literales sin fuente**
· assertions que puedan fallar de verdad · DB (binds, allowlists, `oracledb` aislado incluso vía
`node:module` default/namespace — F-16, tag `@db`) · duplicación · guardrails e infraestructura
protegida (cualquier cambio ahí = `CHANGES_REQUESTED` automático) · evidencia reproducida · sobras
(`.js`, `.ts` fuera de las tres raíces, `*.spec.*`, `playwright.config.*`, `TODO`s).

No edita nada, no "arregla de paso", no aprueba con findings abiertos, y debe declarar qué **no**
pudo verificar (por ejemplo escenarios `@db` con `DB_ENABLED=false`).

---

## 5. Agentes descartados

| Descartado | Motivo |
|---|---|
| **`orchestrator`** | Los gates son interacciones con el usuario y un subagente no tiene canal con el usuario; la sesión principal ya es el orquestador. Un hop extra que solo pierde información. La coordinación determinista es una **skill** (T14), no un agente |
| **`automation-planner`** | El plan es una lista de archivos, y para producirla correcta hay que leer el mismo código que hay que leer para escribirla: C explora el repo dos veces y transmite el resultado como prosa, perdiendo justo el detalle que evita duplicar (qué expone ya `ExamplePage`, qué exige el constructor de `BaseComponent`, qué compone `Pages.ts`). Lo valioso era el **gate**, y B lo conserva como fase 1 del Engineer con parada obligatoria. Promoverlo a agente después es un cambio chico y reversible si la evidencia real lo pide |
| `gherkin-writer` | El `.feature` necesita el mismo contexto que los steps; separarlo parte un solo pensamiento en dos contextos |
| `page-object-generator` | Hay exactamente un ejemplo canónico de Page y uno de Component; seguirlos no es una especialización. Generar sin el contexto del escenario es como aparecen Pages duplicados |
| `locator-specialist` | Los locators son un problema de **fuente** (observar, no adivinar), no de razonamiento: la respuesta es MCP para el Engineer, no otro agente |
| `database/repository-specialist` | `src/database/AGENTS-database.md` ya codifica las reglas, la capa DB es `protected` por diseño y hoy el repo tiene 0 escenarios `@db`. Revisitar solo si el trabajo DB real se vuelve grande y recurrente |
| `test-data-generator` | Test data management es una **capacidad ausente documentada**; un agente que genere datos estaría inventando exactamente lo que `CLAUDE.md` §11 prohíbe |
| `doc-updater` | La documentación es parte del Definition of Done de quien hizo el cambio; delegarla garantiza docs escritas por alguien que no vio el cambio |
| `guardrail-maintainer` | Los guardrails son decisión de un **mantenedor humano** (`CLAUDE.md` §9). Un agente cuyo propósito sea editarlos es el agente más peligroso que este repo podría tener |
| `flaky-test-triager` | Depende de retries, traces e historial — ninguno existe todavía. No tendría qué leer |
| `ci-agent` | `.github/workflows/**` es infraestructura protegida y CI corre los mismos dos gates que se corren localmente |

Tampoco se duplica lo que Claude Code ya trae: los agentes built-in `Explore` (búsqueda read-only
en abanico) y `Plan`, y la skill genérica `/code-review`. `automation-reviewer` **no** es un
duplicado de `/code-review`: el reviewer genérico no conoce `CLAUDE.md`, ni las invariantes
A1–A12, ni los cinco caminos verdes residuales, ni la exigencia de que el diff coincida con un plan
aprobado. Ese contrato específico del framework es toda la razón de su existencia.

---

## 6. Handoffs

Tres documentos, **≤ 1 página cada uno**, markdown plano, pasados en la conversación (no se
commitean por defecto: `CLAUDE.md` §12 prohíbe dejar artefactos sueltos). Los campos son
obligatorios: una sección vacía debe decir `none`, porque "falta la sección" y "está vacía" no son
la misma afirmación.

### 6.1. QA Analysis (`qa-analyst` → usuario → `automation-engineer`)

`STATE` · `SCOPE` (qué sí y qué no) · `EXPECTED BEHAVIOR` · `SCENARIOS` (`S-n`,
positivo/negativo, tags, intención) · `PRECONDITIONS` · `TEST DATA` (con **origen** de cada valor)
· `VALIDATIONS` (UI / DB / otras) · `RISKS` · `UNKNOWN` (blocking / non-blocking) ·
`NEEDS CONFIRMATION` (la pregunta concreta).

### 6.2. Automation Plan (`automation-engineer` → usuario)

`STATE` · `SCOPE` (ids cubiertos y diferidos) · `REUSE` · `CREATE` · `MODIFY` ·
`PROTECTED INFRASTRUCTURE IMPACT` · `TESTS TO RUN`.

### 6.3. Implementation Report (`automation-engineer` → usuario → `automation-reviewer`)

`STATE` · `IMPLEMENTED` / `NOT IMPLEMENTED` (con el UNKNOWN que lo bloqueó) · `FILES` ·
**`SOURCES`** (de dónde salió cada selector / URL / dato) · `EVIDENCE` (comandos + exit codes +
conteos) · `GIT` (`git diff --stat`) · `OUT-OF-SCOPE FINDINGS`.

### 6.4. Review Report (`automation-reviewer` → usuario)

`VERDICT` · `FINDINGS` (`R-n`, severidad, `file:line`, regla violada, cambio requerido) ·
`EVIDENCE` (lo que corrió el reviewer mismo) · `CHECKLIST` (12 ítems) · `NOT VERIFIED` ·
`OUT-OF-SCOPE OBSERVATIONS`.

**Criterio de diseño:** cada campo (a) es una decisión que el actor siguiente no puede tomar solo,
(b) es lo que impide fabricar (`TEST DATA` con origen, `SOURCES`), o (c) es la evidencia de la que
depende un veredicto. Todo lo demás ya está en `CLAUDE.md` y no se retransmite por corrida.

### 6.5. Estados del workflow

Siete estados, tres de ellos gates humanos:

```text
ANALYSIS → NEEDS_CONFIRMATION → READY_FOR_AUTOMATION → PLAN_PROPOSED → IMPLEMENTING
        → READY_FOR_REVIEW → { CHANGES_REQUESTED → IMPLEMENTING | APPROVED }
```

- El **único loop** es `READY_FOR_REVIEW → IMPLEMENTING`, acotado en **2 ciclos**; un tercer
  `CHANGES_REQUESTED` escala al usuario (fallar review repetidamente es señal sobre el plan o el
  análisis, no algo para seguir martillando).
- **El Analyst nunca se re-invoca automáticamente**: un gap nuevo vuelve a `NEEDS_CONFIRMATION`, es
  decir al *usuario*. Eso hace estructuralmente imposible el ping-pong Analyst ↔ Engineer.
- Ningún agente avanza un estado cuya condición de salida es una decisión del usuario.

---

## 7. Permisos

Regla de diseño: **la capacidad sigue a la responsabilidad**. Un agente que no debe escribir no
recibe herramienta de escritura — el límite lo pone la lista de tools, no la buena voluntad.

| Capacidad | `qa-analyst` | `automation-engineer` | `automation-reviewer` |
|---|---|---|---|
| Read / Grep / Glob | ✅ | ✅ | ✅ |
| Edit / Write | ❌ | ✅ (scoped) | ❌ |
| Shell | ❌ **ninguno** | ✅ (allowlist) | ✅ (subset read-only) |
| Playwright MCP | ❌ | luego ✅ | luego ✅ limitado |
| Spawnear agentes | ❌ | ❌ | ❌ |

**Write allowlist del Engineer** = exactamente la superficie QA de `CLAUDE.md` §15:
`features/**/*.feature`, `features/steps/**/*.steps.ts`, `src/pages/**` (salvo `pages/base/**`),
`src/components/**` (salvo `components/base/**`), `src/pageContainer/Pages.ts`,
`src/database/repositories/**` (salvo `BaseRepository.ts`), `*.test.ts` dentro de las tres raíces de
discovery (A12), `docs/**`.

**Denegado a todos los agentes:** `src/base/**`, las base classes de Pages/Components,
`support/**`, `src/database/clients/**`, `src/database/builders/**`, `BaseRepository.ts`,
`RepositoryContainer.ts`, `eslint.config.js`, `src/architecture.test.ts`, `tsconfig.json`,
`cucumber.js`, `package.json`, `package-lock.json`, `.github/workflows/**`, `CLAUDE.md`,
`.claude/**` (ningún agente reescribe su propio contrato) y `.env` / `.env.*` (nunca leído, nunca
escrito; `.env.example` sí).

`RepositoryContainer.ts` queda denegado a propósito aunque un Repository nuevo necesite una línea
ahí: esa línea es exactamente el momento en que un humano debe mirar. El plan lo marca, el usuario
lo autoriza.

**Shell:** `npm run quality` y sus etapas, los scripts E2E por tag, y git read-only
(`status`/`diff`/`diff --stat`/`log`). **Denegado sin excepción para todos:** `git add`,
`git commit`, `git push`, `git reset`, `git clean`, `git checkout/restore/stash/rebase/merge`,
`npm install/ci/update` (las dependencias son infraestructura protegida) y borrados masivos.

El Analyst no recibe shell **alguno**: no lo necesita (Grep/Glob cubren la búsqueda) y eliminarlo
elimina toda la superficie de riesgo git/`rm`/`npm` para ese rol. El Reviewer **sí** recibe shell,
porque un reviewer que no puede re-ejecutar el gate tiene que confiar en los números del Engineer,
y eso no es un review.

---

## 8. Estrategia de modelos

Niveles conceptuales; la sintaxis de configuración se lee de la documentación de Claude Code en
T13, no se inventa acá.

| Rol | Nivel | Motivo | Perfil de tokens |
|---|---|---|---|
| Sesión principal | **alto razonamiento** | sostiene los gates y el diálogo con el usuario | chico por turno |
| `qa-analyst` | **alto razonamiento** | acá vive el riesgo de fabricación: interpretar el requerimiento y tener la disciplina de decir `UNKNOWN` en vez de rellenar el hueco. Un modelo barato es complaciente, y complaciente es justo lo contrario de lo que se necesita | chico |
| `automation-engineer` | **medio, con escalamiento** | el trabajo es seguir un patrón con un ejemplo canónico por caso, algo que el nivel medio hace bien; y es el rol más caro en tokens (búsqueda + escritura + corridas del gate) | grande |
| `automation-reviewer` | **alto razonamiento** | la lectura adversarial es exactamente la habilidad que encontró F-15 y F-16 en este repo; un reviewer complaciente es peor que ninguno, porque fabrica confianza | moderado |

**Escalar el Engineer al nivel alto cuando:** el cambio introduce un patrón sin ejemplo en el repo
(primer escenario `@db` real, primer Repository de una entidad nueva, UI + DB en un mismo flujo); el
plan reporta `PROTECTED INFRASTRUCTURE IMPACT`; el Reviewer ya devolvió `CHANGES_REQUESTED` una
vez; el análisis trae `UNKNOWN`s non-blocking que hay que navegar sin inventar nada.

**Ningún rol usa el nivel más barato.** Los tres interpretan un requerimiento, escriben código
dentro de un contrato con una docena de invariantes verificadas por máquina, o emiten un veredicto;
el ahorro es chico y el costo de un miss es un test que miente. El ahorro real viene de la
**estructura**: sin Orchestrator, sin Planner, handoffs de una página, el Reviewer leyendo un diff
en vez de un repo, y un scope por corrida.

---

## 9. Relación futura con MCP

MCP **no se instala en T12 ni en T13**, y la arquitectura no lo requiere: los tres agentes deben
funcionar completos con MCP ausente.

| Agente | ¿MCP después? | Alcance |
|---|---|---|
| `qa-analyst` | **No** | — |
| `automation-engineer` | **Sí — consumidor principal** | navegar, inspeccionar roles / names / test ids, confirmar que un locator resuelve y es único, observar la UI real en vez de adivinar un selector |
| `automation-reviewer` | **Sí, limitado** | reproducir un escenario, confirmar que un locator del diff resuelve, verificar que una assertion pueda fallar. Solo lectura; sigue sin editar |

**Por qué el Analyst no recibe MCP:** su trabajo es *qué debería pasar*; un browser solo muestra
*qué pasa*. Dejarlo explorar la app convierte comportamiento observado en comportamiento esperado —
un bug de la aplicación se volvería el requerimiento, y los `UNKNOWN` se "resolverían" mirando en
lugar de preguntando. Es exactamente la sustitución que `CLAUDE.md` §11 existe para evitar. Si hace
falta la **estructura** de la UI para cerrar un análisis, el camino correcto es que el Engineer la
observe en fase 1 y la reporte como observación, o que el usuario la provea.

**Reglas duras para MCP** (a repetir en las definiciones de agente): es herramienta de observación
y ejecución, nunca decide reglas de negocio, cobertura ni arquitectura · una observación se etiqueta
como observación, con su URL/estado · un locator descubierto por MCP igual vive en un Page o
Component, nunca en un Step · MCP nunca resuelve un `UNKNOWN` de comportamiento esperado, solo de
estructura · todo agente sigue funcionando con MCP ausente o caído · MCP navega solo la aplicación
bajo prueba y nunca autentica con credenciales que el usuario no dio para ese fin.

---

## 10. Riesgos

14 failure modes con mitigación (detalle completo en `docs/ai-agent-architecture-plan.md` §12):

| # | Riesgo | Mitigación |
|---|---|---|
| FM-1 | Análisis incompleto que pasa por completo | `UNKNOWN` / `NEEDS CONFIRMATION` son campos obligatorios que deben decir `none` explícitamente; blocking vs non-blocking obligatorio; el Engineer rechaza lo bloqueado y lo lista |
| FM-2 | Un agente **inventa** selector, URL, credencial, regla o dato | El que interpreta no puede escribir código; el que escribe debe declarar `SOURCES` de cada literal; el Reviewer trata un literal sin fuente como finding **aunque el test pase** |
| FM-3 | El Engineer cambia la arquitectura | Write allowlist = superficie QA; base classes, `support/**` y la infra DB denegadas; A9/A10/A11 rompen el gate; checklist 4 del Reviewer |
| FM-4 | El Engineer relaja un guardrail para poner el gate en verde | `eslint.config.js`, `src/architecture.test.ts`, `tsconfig.json`, `package.json` denegados; parada dura, no juicio propio; cualquier diff ahí = `CHANGES_REQUESTED` automático |
| FM-5 | Reviewer complaciente | Contexto fresco sin transcript del Engineer; re-ejecuta el gate; checklist ítem por ítem + sección `NOT VERIFIED`; `APPROVED` con finding abierto es inválido por contrato |
| FM-6 | Pérdida de información entre handoffs | Set de campos mínimo y fijo; ids de escenario estables de punta a punta; el Reviewer mapea requerimiento → escenario → archivo |
| FM-7 | Loop infinito Analyst ↔ Engineer | El Analyst no se re-invoca automáticamente; los gaps nuevos van al usuario. El único loop es Engineer ↔ Reviewer, acotado en 2 ciclos |
| FM-8 | Consumo excesivo de tokens | Sin Orchestrator, sin Planner, Engineer en nivel medio, handoffs de una página, Reviewer sobre el diff, un scope por corrida |
| FM-9 | MCP usado como generador de reglas de negocio | El Analyst no tiene MCP; las observaciones se etiquetan; MCP solo resuelve unknowns estructurales |
| FM-10 | Un gate rojo leído como defecto de código (caso CRLF de T11.1) | Aislar la etapa y reproducir en árbol limpio en el commit base antes de "arreglar" código |
| FM-11 | Un agente escribe historia de git | Todos los comandos git mutantes denegados; solo el usuario commitea; `APPROVED` es estado terminal |
| FM-12 | Scope creep disfrazado de ayuda | `CLAUDE.md` §14 en el contrato del Engineer; `OUT-OF-SCOPE FINDINGS` es un campo de reporte, no una lista de tareas; el Reviewer falla cualquier archivo fuera del plan |
| FM-13 | Gate verde confundido con corrección | Los cinco caminos verdes residuales (F-03, F-06, F-10, F-15, F-16) son ítems explícitos del checklist, no consejos generales |
| FM-14 | Secretos arrastrados al contexto de un agente | `.env` denegado a todos; solo `.env.example`; la config se consume vía `config` / `requireBaseUrl()` |

---

## 11. Validaciones

**A) Respeto a `CLAUDE.md` — verificado sección por sección.**

| `CLAUDE.md` | Cómo lo respeta el diseño |
|---|---|
| §4 Steps | El Reviewer verifica steps thin explícitamente (checklist 3), incluido `playwright-core` (F-06) |
| §5 Config | `.env` denegado a todos los agentes; nadie lee `process.env` fuera de `src/config/**` |
| §6 Database | `RepositoryContainer.ts` y `BaseRepository.ts` denegados; binds/allowlists en checklist 8 |
| §7 machine-enforced | La arquitectura no reemplaza los guardrails: los hereda. El Reviewer re-ejecuta el gate |
| §8 review-enforced | Los cinco caminos verdes residuales son ítems obligatorios del checklist (FM-13) |
| §9 infra protegida | Denegada a nivel permisos **y** re-chequeada por el Reviewer; protocolo de 4 pasos intacto |
| §10 workflow | Los 14 pasos quedan repartidos: 1–6 Analyst, 7–10 Engineer fase 1 + GATE 2, 11–14 fases 2–3 + Reviewer |
| §11 info faltante | `UNKNOWN` / `NEEDS CONFIRMATION` es un campo obligatorio del handoff, no una nota al pie |
| §12 DoD | El Reviewer no aprueba sin evidencia reproducida por él mismo |
| §13 Git | Todos los comandos mutantes denegados a los tres agentes |
| §14 scope | `OUT-OF-SCOPE FINDINGS` es campo de reporte; el Reviewer falla archivos fuera del plan |
| §15 experiencia QA | La write allowlist del Engineer **es** la lista de §15, literalmente |

**B) Ningún guardrail contradicho ni relajado.** El diseño no propone tocar `eslint.config.js`,
`src/architecture.test.ts`, `tsconfig.json`, `cucumber.js`, `package.json` ni CI. Los agentes se
apoyan en G1–G8 y A1–A12; el Reviewer cubre justamente lo que esas reglas **no** cubren.

**C) Ningún agente depende de capacidades inexistentes del framework.** No se asume auth /
`storageState`, API layer, test data management, screenshots/traces, logging estructurado, matriz de
ambientes, paralelismo ni retries — todas ausencias deliberadas del roadmap. El Analyst tiene la
obligación explícita de **nombrar** la capacidad ausente en lugar de fingir que se puede testear.

**D) MCP es opcional.** T13 crea los tres agentes sin MCP; §9 de este registro y §11 del plan
exigen que todo agente funcione con MCP ausente o caído.

**E) Supuestos sobre capacidades de Claude Code — listados, no asumidos en silencio.**
`docs/ai-agent-architecture-plan.md` §7.4 enumera los seis supuestos (definición de subagentes con
frontmatter, tool list restringible, contexto propio con reporte final, modelo por agente, reglas
de permisos allow/deny, MCP por agente) y marca cada uno como **verificar en T13 contra la versión
instalada**. Hay un `NEEDS CONFIRMATION` explícito, no bloqueante: si la denegación de escritura por
path no existe en la versión instalada, la lista de §7.2 degrada a contractual y el checklist 10 del
Reviewer pasa a ser la defensa principal — se documenta, no se asume.

**F) Contradicciones objetivas con `CLAUDE.md`: ninguna encontrada.** Se revisaron identidad del
framework, jerarquía UI, límites de Steps, propiedad de `process.env`, flujo de database,
infraestructura protegida, git y scope discipline contra el código real. `CLAUDE.md` no fue
modificado.

**G) `npm run quality` → exit 0** (ejecutado en esta tarea, después de T11.1):

| Etapa | Resultado |
|---|---|
| `typecheck` | ✅ exit 0 |
| `lint` | ✅ exit 0 |
| `format:check` | ✅ exit 0 (el rojo CRLF de T11 quedó cerrado por T11.1) |
| `test:unit` | ✅ **61 tests / 23 suites / 61 pass / 0 fail** |

**H) `git status`** → solo dos untracked: `docs/ai-agent-architecture-plan.md` y
`docs/refactor-progress-ia/T12-agent-architecture.md`. Ningún archivo modificado.

**I) `git diff` / `git diff --stat`** → **vacío**: T12 no modificó ningún archivo existente. Los dos
entregables son nuevos, son `.md`, están fuera de `tsconfig.include`, no son `*.test.ts` ni
`*.feature`, y `*.md` está en `.prettierignore` — por lo tanto no participan de ninguna etapa del
gate y no pueden romperlo.

**J) Sin efectos colaterales.** No se creó `.claude/`, no se instaló MCP, no se creó ningún agente,
skill ni workflow, no se tocó código productivo y no se ejecutó `git add` / `commit` / `push`.

---

## 12. Resultado

✅ **T12 COMPLETADA.**

- **3 agentes seleccionados:** `qa-analyst` (read-only), `automation-engineer` (el único que
  escribe, con superficie = `CLAUDE.md` §15) y `automation-reviewer` (read-only con shell de
  verificación).
- **Orquesta la sesión principal de Claude Code.** Sin agente Orchestrator, por una razón técnica:
  los gates son interacciones con el usuario y un subagente no tiene canal con el usuario.
- **11 candidatos descartados**, cada uno con motivo: Orchestrator, Planner, Gherkin writer, Page
  Object generator, locator specialist, DB specialist, test data generator, doc updater, guardrail
  maintainer, flaky triager, CI agent.
- **2 handoffs, 4 formatos de ≤ 1 página, 7 estados, 1 solo loop acotado en 2 ciclos, 3 gates
  humanos.**
- **Permisos por rol** derivados de `CLAUDE.md` §9 y §15, con `.env` denegado a todos y todo comando
  git mutante denegado a todos.
- **Estrategia de modelos:** alto / medio-con-escalamiento / alto. Ningún rol en el nivel más
  barato, y el ahorro puesto en la estructura.
- **MCP:** Engineer (principal) y Reviewer (limitado) después; Analyst nunca. Opcional en todos los
  casos.
- **14 failure modes** con mitigación, cada una anclada a una sección concreta del plan o de
  `CLAUDE.md`.
- Entregables: `docs/ai-agent-architecture-plan.md` (nuevo) y este registro (nuevo). **Cero** cambios
  en archivos existentes.

---

## 13. Aprendizaje técnico

1. **La cantidad de agentes se decide por permisos y por independencia, no por prolijidad
   conceptual.** Los tres agentes elegidos difieren en *qué pueden hacer* (nada / escribir /
   verificar) y en *qué modo de falla tienen* (inventar / romper arquitectura / ser complaciente).
   El Planner no difería en ninguna de las dos cosas respecto del Engineer — y ese es el test que
   conviene aplicarle a cualquier agente futuro: si no tiene permisos distintos ni un modo de falla
   propio, es una **fase**, no un agente.

2. **Un gate humano no necesita un agente para existir.** El aporte real de la alternativa de 4
   agentes era detenerse antes de escribir. Eso se implementa como una parada dentro del Engineer y
   sale gratis; convertirlo en agente costaba explorar el repo dos veces y transmitir el resultado
   como prosa. Separar *gate* de *agente* es lo que permitió bajar de 4 a 3 sin perder control.

3. **La independencia del reviewer es una propiedad del contexto, no del prompt.** No alcanza con
   pedirle "sé crítico": hay que darle el diff, el análisis y el plan **sin** el razonamiento del
   implementador, y obligarlo a re-ejecutar el gate. Este repo tiene la prueba: la auditoría que se
   negó a tomar los registros T10.x como ciertos encontró F-15 y F-16, que los agentes correctivos
   no habían reportado.

4. **Los gaps conocidos del framework son el mejor checklist de review que existe.** F-03, F-06,
   F-10, F-15 y F-16 describen exactamente los cinco caminos por los que código incorrecto pasa en
   verde. Convertirlos en ítems obligatorios del Reviewer es más útil que cualquier consejo genérico
   de calidad, porque son las únicas rutas donde el gate ya se sabe ciego.

5. **La superficie de escritura del agente debería ser la superficie del rol humano equivalente.**
   Hacer que la write allowlist del Engineer sea literalmente la lista de `CLAUDE.md` §15 (lo que un
   QA toca normalmente) no fue una coincidencia: si un agente necesita más permisos que el humano
   cuyo trabajo hace, el problema es la tarea o la arquitectura, no los permisos.

6. **Diseñar contra la versión instalada, no contra la documentación recordada.** Los seis supuestos
   de capacidad quedaron listados como *verificar en T13* en lugar de escritos como hechos. Un
   diseño que inventa la sintaxis de configuración produce agentes que no cargan; uno que declara
   sus supuestos produce una tarea de verificación de cinco minutos.

---

## 14. Próxima tarea

**T13 — Implementar los agentes especializados aprobados en T12.**

Orden de implementación (seguridad primero, definido en `docs/ai-agent-architecture-plan.md` §15):

1. verificar los supuestos de capacidad (§7.4 del plan) contra la versión instalada de Claude Code;
2. `qa-analyst` (read-only, riesgo cero);
3. `automation-reviewer` (read-only, disponible antes de que exista código escrito por un agente);
4. reglas de permisos (deny lists) — **antes** del único agente con escritura;
5. `automation-engineer`;
6. dry run sobre un requerimiento real, con MCP ausente;
7. registro `docs/refactor-progress-ia/T13-*.md`.

No ejecutada en T12.
