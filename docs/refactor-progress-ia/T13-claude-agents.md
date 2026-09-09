# T13 — Claude Specialized Agents

**Date:** 2026-09-07
**Status:** ✅ COMPLETED — ESTADO ACTUAL, verificado tras T13.1
(`docs/refactor-progress-ia/T13.1-runtime-validation.md`): restart = RESOLVED; los tres agentes
(`qa-analyst`, `automation-engineer`, `automation-reviewer`) resuelven en runtime y responden;
los tres dry runs = COMPLETED; la infraestructura protegida de código usa `permissions.ask` en
`.claude/settings.json` (no `deny`); `Read(/.env)` permanece en `permissions.deny`; `CLAUDE.md` y
`.claude/**` siguen `CONTRACTUAL / REVIEW-ENFORCED` (sin regla nativa, sin cambios); `npm run
quality` → 61/61 PASS. Cualquier mención de `deny` sobre infraestructura de código, de
`RESTART REQUIRED`, o de "dry runs no ejecutados" en el resto de este documento es
**HISTORICAL STATE — BEFORE T13.1** y está marcada como tal donde corresponde.
**Branch:** `feature/claude-ai-integration`
**Baseline commit:** `a1855eb` (chore: normalize cross-platform line endings)
**Fase:** 2 — Claude Code + agentes + Playwright MCP · tercera tarea (después de T11, T11.1, T12)
**Arquitectura implementada:** la aprobada en `docs/ai-agent-architecture-plan.md` y
`docs/refactor-progress-ia/T12-agent-architecture.md` — 3 agentes, sin Orchestrator, sin
Automation Planner, sin MCP.

---

## 1. Objetivo

Implementar, como archivos versionados junto al repo, los tres agentes especializados aprobados
en T12 (`qa-analyst`, `automation-engineer`, `automation-reviewer`), **adaptando el diseño
conceptual de T12 a las capacidades reales de la versión instalada de Claude Code** — sin
inventar sintaxis, sin fabricar enforcement que la herramienta no soporta.

Regla explícita de la tarea: verificar versión, documentación y capacidades **antes** de escribir
un solo archivo de agente. Todo lo que sigue en este registro fue verificado, no asumido.

T13 **no** crea Orchestrator ni Automation Planner, **no** instala Playwright MCP, **no** crea
skills/workflows, y **no** implementa código real sobre el framework (eso es T15 en adelante, por
diseño explícito del propio T13: "la primera implementación real pertenece a T15").

---

## 2. Claude Code version

```
$ claude --version
2.1.263 (Claude Code)

$ claude doctor
Running: native (2.1.263)
Commit: 37ae3f38d765
Platform: win32-x64
Path: C:\Users\CFOTech\.local\bin\claude.exe
Config install method: native
No installation issues found.
```

Instalación **nativa** (binario único, sin `node_modules` acompañante ni docs empaquetadas) — la
verificación de capacidades se hizo contra `claude --help`, los subcomandos reales (`claude plugin
validate`, `claude doctor`), y la documentación oficial vigente (`code.claude.com/docs/en/…`,
fetched en esta tarea, no recordada de memoria).

---

## 3. Capacidades verificadas

Verificación empírica y documental, no supuesta. Cada fila es una de las preguntas obligatorias
de la tarea.

| # | Pregunta | Resultado verificado |
|---|---|---|
| 1 | Ubicación oficial de project-level subagents | `.claude/agents/` — confirmado por la documentación oficial (`code.claude.com/docs/en/sub-agents`) y por `claude plugin validate` reconociendo el directorio |
| 2 | Formato | Markdown con frontmatter YAML. Confirmado |
| 3 | Frontmatter soportado | `name` y `description` obligatorios; opcionales incluyen `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation`, `color`, `initialPrompt`, `experimental`. Usamos solo `name`, `description`, `tools`, `model` — el resto no aporta nada al diseño de T12 y agregarlo sería fabricar complejidad no pedida |
| 4 | Nombres reales de tools | Confirmado contra el propio listado de herramientas de esta sesión: `Read`, `Grep`, `Glob`, `Edit`, `Write`, `Bash`, `PowerShell`, `Agent`, más las `mcp__*` (no usadas) |
| 5 | Model aliases | `sonnet`, `opus`, `haiku`, `fable` (familia, última versión) · `inherit` · ID completo. Documentado en `sub-agents` |
| 6 | Permission modes | `default`/`manual`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions` — no se usó ninguno explícito en el frontmatter (se deja el default de la sesión que invoca) |
| 7 | `disallowedTools` | Soportado; **no se usó** — se prefirió `tools` como allowlist explícita (más simple: lo que no está listado, no existe para el agente, sin necesidad de una segunda lista negativa) |
| 8 | Hooks por subagente | Soportado (`hooks:` en frontmatter) — **no se usó**: la tarea pidió explícitamente no fabricar un sistema de hooks para imitar una capacidad que ya existe de forma nativa (ver §10) |
| 9 | MCP por subagente | Soportado (`mcpServers:`) — **no se usó**, MCP sigue ausente en T13 por diseño |
| 10 | Detección de agentes nuevos | Los archivos dentro de un `.claude/agents/` **ya existente** se detectan en segundos, sin reinicio. La **primera vez** que se crea el directorio en un scope, la sesión que ya estaba corriendo cuando se creó **no** lo detecta — necesita reinicio. Este repo no tenía `.claude/agents/` antes de esta tarea → aplica el caso de reinicio (ver §11) |
| 11 | Validación estática | `claude plugin validate <path>` (con `--strict` y `--json`) — mecanismo real, no inventado. Ejecutado en esta tarea (§13) |
| 12 | Gestión/listado | `/agents` desde v2.1.198 ya no abre un wizard, solo recuerda editar los archivos directamente; `/tasks` lista subagentes corriendo; invocación por lenguaje natural o `@"nombre (agent)"` |

**Fuente:** `claude --help` (ejecutado), `claude doctor` (ejecutado), `claude plugin validate
--help` (ejecutado), y `code.claude.com/docs/en/sub-agents` +
`code.claude.com/docs/en/permissions` (documentación oficial vigente, consultada en esta tarea vía
fetch — no citada de memoria).

---

## 4. Estructura creada

```text
.claude/
├── settings.json          — permisos de path a nivel proyecto (Tier 1, ver §10)
└── agents/
    ├── qa-analyst.md
    ├── automation-engineer.md
    └── automation-reviewer.md
```

Todo versionado junto al proyecto (`.claude/` sin excluir en `.gitignore` — se verificó que
`.gitignore` no lo ignora), tal como pedía la tarea.

---

## 5. qa-analyst

```yaml
---
name: qa-analyst
description: Use this agent to analyze a requirement, user story, or bug report BEFORE any test
  automation is written. […] It never writes code, Gherkin, or locators, and has no write or
  shell access. Invoke it first, before automation-engineer […]
tools: Read, Grep, Glob
model: opus
---
```

- **Permisos reales:** sin `Edit`, sin `Write`, sin `Bash`/`PowerShell`, sin `Agent` (no puede
  spawnear otros agentes), sin MCP. Al ser `tools:` una allowlist explícita (confirmado en §3.3),
  omitir esas herramientas **es** la denegación — no hace falta `disallowedTools` adicional.
- **Prompt:** obliga a leer `CLAUDE.md` al arrancar; fija el output en el formato exacto pedido
  por la tarea (`STATE/SCOPE/EXPECTED BEHAVIOR/SCENARIOS/PRECONDITIONS/TEST DATA/VALIDATIONS/
  RISKS/UNKNOWN/NEEDS CONFIRMATION`); prohíbe explícitamente inventar regla de negocio, usuario,
  ambiente, dato, URL, selector, resultado esperado o credencial; exige clasificar todo `UNKNOWN`
  como `[blocking]`/`[non-blocking]`; prohíbe MCP explícitamente y explica por qué (observar
  *qué pasa* no es lo mismo que decidir *qué debería pasar*).
- **Modelo:** `opus` (alto razonamiento) — alias de familia portable, no un ID de versión
  pineado. Corresponde 1:1 a la estrategia conceptual de T12 ("alto razonamiento": ahí vive el
  riesgo de fabricación).

---

## 6. automation-engineer

```yaml
---
name: automation-engineer
description: The only agent in this workflow with write access. […] Always invoke MODE: PLAN
  first and get explicit user approval before ever invoking MODE: IMPLEMENT.
tools: Read, Grep, Glob, Edit, Write, Bash
model: sonnet
---
```

- **Permisos reales:** único de los tres con `Edit`/`Write`; `Bash` habilitado para
  `npm run quality`, los scripts E2E y `git status`/`diff`/`diff --stat` (nunca `git add`/
  `commit`/`push`/`reset`/`clean`, prohibido en el prompt, no en la lista de tools — ver §10 sobre
  por qué esto es contractual). Sin `Agent` (no spawnea otros agentes). Sin MCP.
- **Dos modos, una sola identidad de agente** (`MODE: PLAN` / `MODE: IMPLEMENT`), tal como pidió
  la tarea explícitamente y no dos archivos separados — ver §9 y §15 sobre la decisión de diseño y
  su costo real.
- **MODE: PLAN:** busca reuse antes de crear, devuelve `Reuse/Create/Modify/Protected
  infrastructure impact/Not implemented/Tests to run`, y el prompt le ordena terminar el turno sin
  tocar ningún archivo.
- **MODE: IMPLEMENT:** solo se activa si el mensaje trae literalmente `MODE: IMPLEMENT` **y**
  `PLAN APPROVED`; si falta cualquiera de las dos, el prompt le exige devolver
  `STATE: VALIDATION_FAILED` sin escribir nada. Restringe la superficie de escritura a la lista
  exacta de `CLAUDE.md` §15; enumera la infraestructura protegida completa (incluyendo `CLAUDE.md`
  y `.claude/**`, que **no** están en la lista original de `CLAUDE.md` §9 pero sí en el diseño de
  T12 — ver §10); exige `SOURCES` para todo literal; corre `npm run quality` + E2E + git read-only
  y reporta todo tal cual, incluidos los fallos.
- **Modelo:** `sonnet` (medio/capaz) — alias portable. Coincide con la estrategia T12
  ("nivel medio, con escalamiento"). La escalada a `opus` para casos de mayor riesgo (primer
  patrón sin ejemplo, impacto en infraestructura protegida, segundo ciclo de
  `CHANGES_REQUESTED`) **no se configura en el archivo del agente** — no existe un campo de
  "modelo condicional" en el frontmatter — sino que se implementa con el parámetro `model` de la
  herramienta `Agent` de la sesión principal en la invocación puntual que lo amerite. Esto es un
  mecanismo real y confirmado (no inventado): la propia herramienta `Agent` de esta sesión acepta
  `model` como override por invocación.

---

## 7. automation-reviewer

```yaml
---
name: automation-reviewer
description: Independent, read-only reviewer of automation-engineer's work. […] It never edits
  code. Invoke it after automation-engineer's MODE: IMPLEMENT run, never before, and never pass
  it the Engineer's own transcript or reasoning […]
tools: Read, Grep, Glob, Bash
model: opus
---
```

- **Permisos reales:** sin `Edit`/`Write` (no puede tocar código, ni un typo); `Bash` habilitado
  únicamente para volver a correr `npm run quality`, el E2E relevante y git read-only — el prompt
  es explícito en que **no debe confiar en el `EVIDENCE` del Implementation Report** y debe
  reproducir todo él mismo. Sin `Agent`. Sin MCP.
- **Checklist de 12 puntos**, textual, con los cinco gaps conocidos del framework incrustados como
  ítems obligatorios (no como nota aparte): F-06 en el punto 3 (steps thin / `playwright-core`),
  F-15 en el punto 4 (locator page-wide desde el parámetro local `page`), F-16 en el punto 8
  (`node:module` default/namespace import), F-03 y F-10 en el punto 12 (`.js` de framework, `.ts`
  fuera de las tres raíces typecheckeadas).
- **Independencia real, no solo declarada:** el prompt indica explícitamente que no debe asumir
  nada sobre el razonamiento del Engineer — solo los tres documentos de handoff y el código.
- **Modelo:** `opus` (alto razonamiento) — coincide con T12 ("la lectura adversarial es la
  habilidad que encontró F-15 y F-16 en este repo").

---

## 8. Model strategy aplicada

| Rol | T12 (conceptual) | T13 (real, confirmado) |
|---|---|---|
| `qa-analyst` | alto razonamiento | `model: opus` |
| `automation-engineer` | medio/capaz, con escalamiento | `model: sonnet`, escalable por invocación vía `Agent({ model: "opus", ... })` desde la sesión principal |
| `automation-reviewer` | alto razonamiento | `model: opus` |

Se usaron **aliases de familia** (`opus`, `sonnet`), no IDs de versión (`claude-opus-5`,
`claude-sonnet-5`), siguiendo la instrucción explícita de preferir el alias portable sobre fijar
versión salvo razón real — y no existe ninguna razón real acá para pinear una versión concreta.

---

## 9. Tool / permission strategy

Decisión de diseño explícita, no dejada implícita: se usó **`tools:` como allowlist** en los tres
agentes, y **no** se usó `disallowedTools`. Motivo: con `tools:` explícito, cualquier herramienta
no listada simplemente no existe para el agente — es una sola lista que hay que leer para saber
todo lo que un agente puede hacer, en vez de dos listas (`tools` + `disallowedTools`) que hay que
cruzar mentalmente. Coincide con la instrucción de la tarea de no fabricar mecanismos adicionales
cuando uno simple ya alcanza.

**`automation-engineer` con dos modos en un solo archivo, en vez de dos agentes.** Se evaluó la
alternativa técnica de partirlo en dos archivos (uno genuinamente sin `Edit`/`Write` para PLAN, y
otro con escritura para IMPLEMENT), lo que habría dado enforcement de herramienta real para la fase
de planificación en lugar de contractual. **Se descartó explícitamente**, porque la tarea prohíbe
crear un cuarto agente ("NO crear Automation Planner") y, desde la perspectiva de Claude Code, un
segundo `name:` es un segundo agente aunque comparta el mismo conocimiento — sería reintroducir
exactamente el Planner que T12 rechazó, con otro nombre. La consecuencia honesta de esa decisión
está documentada en §10 y §15: el límite `MODE: PLAN` → "no escribas nada" es **contractual**
(instrucción fuerte en el prompt + gate humano de la sesión principal antes de mandar
`MODE: IMPLEMENT`), no un límite de herramientas.

Ningún agente tiene `Agent` en su lista de `tools` → ninguno puede spawnear subagentes, incluida
la profundidad de anidamiento que Claude Code permite por defecto (hasta 3 niveles) — queda en 0
para los tres, por diseño, sin necesitar tocar `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`.

Ningún agente declara `mcpServers:` → MCP sigue completamente ausente, tal como exige T13 §10.

---

## 10. Path protection — dos niveles, cada uno documentado como lo que realmente es

Esta es la sección crítica de la tarea (§2 del prompt de T13: "verificar antes de asumir que esto
puede implementarse técnicamente"). Se investigó — no se asumió — y la respuesta real es
**parcialmente sí**, con un matiz importante que cambió el diseño de T12.

### 10.1. Lo que Claude Code soporta nativamente

> **HISTORICAL STATE — BEFORE T13.1.** Esta subsección documenta las propiedades técnicas de las
> reglas `deny` investigadas en T13. **La acción realmente aplicada en Tier 1 hoy es `ask`, no
> `deny`** (ver el estado actual en 10.3) — el cambio ocurrió en T13.1, por el motivo documentado
> en `docs/refactor-progress-ia/T13.1-runtime-validation.md` §3–§4: una regla `deny` no puede
> levantarse ni siquiera después de que el usuario aprueba tocar infraestructura protegida vía el
> protocolo de `CLAUDE.md` §9. Las mismas propiedades técnicas descritas abajo para `deny`
> (cobertura de `Edit`/`Write`/`NotebookEdit`/`MultiEdit`, resolución de `/path` relativo al
> proyecto) se reverificaron para `ask` en T13.1 §3 contra la misma documentación oficial, y
> aplican igual.

`code.claude.com/docs/en/permissions` confirma que `Edit(<path-glob>)` como regla de **deny** en
`permissions.deny` de un `settings.json` **es real, soportado y no es un hook**:

- Cubre `Edit`, `Write`, `NotebookEdit` y el `MultiEdit` legado sobre el mismo path (una sola
  regla `Edit(...)` alcanza para las cuatro formas de escritura — confirmado en la documentación:
  *"Edit rules apply to all built-in tools that edit files"*).
- Además cubre comandos de Bash reconocidos como edición de archivo (`sed`, redirecciones `>`/
  `>>`) sobre el mismo path.
- Requiere Claude Code **v2.1.208+** (chequeo de path en edits) y **v2.1.210+** (equivalencia
  `Edit`↔`Write` en el chequeo). La instalación de este proyecto es **v2.1.263** — sobra margen.
- Un `Read(<path>)` en deny bloquea además `Edit`/`Write` sobre el mismo path, incluyendo *crear*
  un archivo nuevo ahí (requiere v2.1.208+ en edits, v2.1.228+ en writes — también cubierto).

**Esto NO es un hook y no se fabricó nada**: es la funcionalidad de permisos del propio producto,
usada tal cual está documentada (igual de real para la acción `ask` que reemplazó a `deny` en
Tier 1 desde T13.1 — ver 10.3 para el estado actual).

### 10.2. El matiz que cambió el diseño: las reglas son globales, no por subagente

La pregunta 1 del prompt de T13 era literalmente *"¿Claude Code soporta permisos de escritura por
path directamente en subagents?"* — la respuesta verificada es: **no como campo del frontmatter
del subagente**; las reglas de permiso viven en `settings.json` (proyecto/usuario/local) y se
aplican **a cualquier llamada a `Edit`/`Write`, sin importar si la origina la sesión principal o
un subagente**. No existe una forma nativa de decir "esta regla de path solo aplica al subagente
`automation-engineer`".

En la práctica esto no debilita el diseño — lo simplifica: como `qa-analyst` y
`automation-reviewer` ya no tienen `Edit`/`Write` en su `tools:` (bloqueo a nivel de agente, §9),
el único agente al que la protección de paths de `settings.json` puede aplicarle de verdad es
`automation-engineer`. Una regla global termina siendo, en los hechos, una regla del único agente
con capacidad de escritura.

**Pero tiene una consecuencia real que obligó a dividir la lista en dos niveles** (ver 10.3): una
regla de `deny` global bloquearía también a la **sesión principal humana-asistida** — es decir, a
mí mismo, ahora, escribiendo los archivos de este propio T13, y a cualquier tarea futura de
mantenimiento de `CLAUDE.md` o de los propios agentes. Denegar `CLAUDE.md` y `.claude/**` a nivel
de `settings.json` habría bloqueado el propio T13 (y todo T11/T12 anterior) y cualquier
mantenimiento futuro legítimo del contrato de IA, hecho con supervisión humana desde la sesión
principal — algo que `CLAUDE.md` §9 nunca prohíbe (prohíbe que un agente lo haga *sin* el
protocolo de 4 pasos, no que la sesión principal lo edite con el usuario mirando).

### 10.3. Tier 1 — enforcement nativo real (`.claude/settings.json`)

Paths donde ni la sesión principal ni ningún agente deberían necesitar `Edit`/`Write` durante
trabajo normal de automatización QA — exactamente la lista de infraestructura de código de
`CLAUDE.md` §9 (sin `CLAUDE.md` ni `.claude/**`, ver 10.4).

**ESTADO ACTUAL (post-T13.1).** La acción de esta lista es `ask`, no `deny` — motivo del cambio y
verificación contra documentación oficial en
`docs/refactor-progress-ia/T13.1-runtime-validation.md` §3–§4. `Read(/.env)` es la única regla que
permanece en `deny` (los secretos no tienen un caso normal de aprobación para ningún agente). Esto
coincide con el contenido real de `.claude/settings.json` al momento de esta sincronización:

```json
{
  "permissions": {
    "ask": [
      "Edit(/src/base/**)",
      "Edit(/src/pages/base/BasePage.ts)",
      "Edit(/src/components/base/BaseComponent.ts)",
      "Edit(/support/world.ts)",
      "Edit(/support/hooks.ts)",
      "Edit(/support/databaseLifecycle.ts)",
      "Edit(/src/database/clients/**)",
      "Edit(/src/database/builders/**)",
      "Edit(/src/database/repositories/BaseRepository.ts)",
      "Edit(/src/database/RepositoryContainer.ts)",
      "Edit(/eslint.config.js)",
      "Edit(/src/architecture.test.ts)",
      "Edit(/tsconfig.json)",
      "Edit(/cucumber.js)",
      "Edit(/package.json)",
      "Edit(/package-lock.json)",
      "Edit(/.github/workflows/**)"
    ],
    "deny": ["Read(/.env)"]
  }
}
```

> **HISTORICAL STATE — BEFORE T13.1.** El bloque siguiente es el `.claude/settings.json`
> original de T13: toda la lista, incluido `Read(/.env)`, bajo una sola acción `deny`. Reemplazado
> por el bloque de arriba en T13.1 porque una regla `deny` no puede levantarse ni siquiera después
> de que el usuario aprueba tocar infraestructura protegida vía el protocolo de `CLAUDE.md` §9 —
> `ask` sí, porque fuerza una confirmación real en el momento del `Edit`, que el usuario aprueba o
> deniega en ese instante.

```json
{
  "permissions": {
    "deny": [
      "Edit(/src/base/**)",
      "Edit(/src/pages/base/BasePage.ts)",
      "Edit(/src/components/base/BaseComponent.ts)",
      "Edit(/support/world.ts)",
      "Edit(/support/hooks.ts)",
      "Edit(/support/databaseLifecycle.ts)",
      "Edit(/src/database/clients/**)",
      "Edit(/src/database/builders/**)",
      "Edit(/src/database/repositories/BaseRepository.ts)",
      "Edit(/src/database/RepositoryContainer.ts)",
      "Edit(/eslint.config.js)",
      "Edit(/src/architecture.test.ts)",
      "Edit(/tsconfig.json)",
      "Edit(/cucumber.js)",
      "Edit(/package.json)",
      "Edit(/package-lock.json)",
      "Edit(/.github/workflows/**)",
      "Read(/.env)"
    ]
  }
}
```

Notas de diseño de esta lista (siguen aplicando a la lista `ask` actual — solo cambió la acción y
la extracción de `Read(/.env)` a su propia clave; los paths y su razonamiento no cambiaron):

- Se usó el patrón `/path` (una sola barra inicial) en cada regla — ancla explícitamente en el
  *primary working directory* del proyecto (confirmado en la documentación: `/path` resuelve a
  `<primary working directory>/path` cuando la regla vive en `.claude/settings.json`), evitando la
  ambigüedad de profundidad que tienen los patrones de un solo segmento en reglas `deny` (que
  matchean a cualquier profundidad).
- Se listaron **archivos exactos** donde `CLAUDE.md` §9 nombra archivos exactos
  (`support/world.ts`, `support/hooks.ts`, `support/databaseLifecycle.ts`,
  `src/pages/base/BasePage.ts`, `src/components/base/BaseComponent.ts`) y **directorios** donde
  `CLAUDE.md` §9 nombra un directorio (`src/base/**`, `.github/workflows/**`,
  `src/database/clients/**`, `src/database/builders/**`) — para no sobre-bloquear archivos que
  `CLAUDE.md` nunca marcó como protegidos (ej.: `support/AGENTS-support.md` sigue editable, porque
  `CLAUDE.md` protege el código de `support/`, no su documentación).
- `Read(/.env)` — no `Read(/.env.*)` — para no bloquear `.env.example`, que es explícitamente
  legible por cualquier agente según el diseño de T12.
- Verificado con `claude doctor` (lee los settings del directorio actual sin trust prompt): **"No
  installation issues found"** — ninguna regla usa la forma equivocada de tool (`Write(...)` en
  vez de `Edit(...)`, que generaría un warning documentado) ni tiene sintaxis inválida. *(Esta
  corrida de `claude doctor` fue sobre la versión `deny` histórica de T13.)*

**Nota post-T13.1:** la lista `ask` actual (arriba) es sintácticamente idéntica a la `deny`
histórica salvo la acción y la extracción de `Read(/.env)` a su propia clave — mismos paths,
mismo patrón `/path`, mismo razonamiento de las notas de arriba. Su validez como JSON y su
compatibilidad con el resto del gate quedaron confirmadas en T13.1 (`npm run quality` → PASS tras
corregir un problema de formato Prettier introducido al editar el archivo) y se reconfirman en
esta sincronización documental (ver el resultado de `npm run quality` al pie de este documento).

### 10.4. Tier 2 — contractual / review-enforced (`CLAUDE.md`, `.claude/**`)

**`PATH WRITE RESTRICTION = CONTRACTUAL / REVIEW-ENFORCED`** para estos dos, por la razón de
10.2: un `deny` global los bloquearía también para la sesión principal, y eso rompería el propio
flujo de mantenimiento de los agentes y del contrato de IA que **debe** poder seguir editándose
con supervisión humana (como en T11, T12 y este mismo T13).

Defensa real, sin fabricar enforcement que no existe:

1. **`CLAUDE.md`** en sí mismo, línea a línea, en el prompt de `automation-engineer`
   ("nunca edites `CLAUDE.md` ni nada bajo `.claude/**`").
2. **Guardrails existentes** (`eslint.config.js`, `src/architecture.test.ts`) siguen protegidos a
   nivel **nativo** (Tier 1) — el agente no puede relajarlos aunque quisiera, con o sin
   disciplina de prompt.
3. **`automation-reviewer`**, ítem 10 de su checklist, marca **cualquier** cambio a `CLAUDE.md` o
   `.claude/**` como `CHANGES_REQUESTED` automático salvo autorización explícita registrada.

Esto es exactamente lo que pedía la tarea ante la ausencia de una solución nativa perfecta: no
fabricar un hook para simular una capacidad que el path-scoping global no puede dar sin romper
el propio flujo de trabajo, documentar la limitación, y apoyarse en contrato + reviewer.

### 10.5. Por qué no se usó un hook `PreToolUse`

Se evaluó — la pregunta 3 del prompt lo pedía explícitamente. Un hook `PreToolUse` scoped por
subagente habría podido, en teoría, inspeccionar `tool_input.file_path` en cada llamada a
`Edit`/`Write` y rechazar los paths de Tier 1 **solo** cuando el llamador es
`automation-engineer` — la única ventaja real sobre el `settings.json` global sería precisamente
esa granularidad por agente. Se descartó porque:

- **`settings.json` ya resuelve el caso real** (10.2): al día de hoy solo un agente tiene
  `Edit`/`Write`, así que la granularidad extra de un hook no protege nada que la combinación
  `tools:` + `settings.json` no proteja ya.
- Un hook agrega una superficie nueva (un script, su portabilidad Windows/Linux, su propio modo de
  falla) para replicar algo que el producto ya da nativamente para el caso que importa.
- La tarea es explícita: *"NO crear un sistema complejo de hooks solo para imitar una capacidad
  que no existe"* — acá la capacidad **si** existe (Tier 1), y donde no alcanza (Tier 2), la
  brecha es demasiado angosta (dos paths, ambos con defensa contractual + reviewer + guardrails ya
  nativos) para justificar la complejidad de un hook.

Si en el futuro hubiera **dos o más** agentes con `Edit`/`Write` y necesidades de path distintas
entre sí, esta decisión debería revisitarse — hoy no aplica.

---

## 11. Runtime validation

**ESTADO ACTUAL: RESUELTO en la continuación T13.1**
(`docs/refactor-progress-ia/T13.1-runtime-validation.md` §2): después del reinicio del usuario, los
tres agentes aparecen en el listado de agentes disponibles sin necesidad de heurística, y los tres
dry runs pendientes de §12 se ejecutaron realmente. El resto de esta sección queda como registro
histórico de por qué el reinicio era necesario.

> **HISTORICAL STATE — BEFORE T13.1.** Lo que sigue describe el estado de la sesión de T13, antes
> del reinicio, cuando el restart todavía estaba pendiente.

El repo no tenía `.claude/agents/` antes de esta tarea (verificado al inicio: `ls -a .claude`
→ "No such file or directory"). La documentación es explícita: crear el **primer** archivo de
agente en un scope nuevo requiere reinicio para que una sesión que ya estaba corriendo lo detecte;
solo agregar/editar archivos en un `.claude/agents/` **ya existente** se detecta sin reinicio.

Prueba directa en esta misma sesión, después de crear los tres archivos:

```
Agent({ subagent_type: "qa-analyst", ... })
→ Error: Agent type 'qa-analyst' not found.
  Available agents: claude, claude-code-guide, Explore, general-purpose, Plan, statusline-setup
```

Confirma exactamente lo que predice la documentación: los tres agentes nuevos no aparecen en la
lista porque el watcher de esta sesión arrancó antes de que existiera `.claude/agents/`.

**Validación estática, que sí corre en un proceso nuevo y por lo tanto sí ve los archivos:**

```
$ claude plugin validate .claude/agents
Validating components in: …/.claude/agents
✔ Validation passed
EXIT=0

$ claude plugin validate .claude/agents --strict --json
{ "success": true, "strict": true, … }
EXIT=0
```

Confirma que el frontmatter de los tres archivos parsea correctamente y no dispara ningún warning
en modo estricto (nombres de tool inválidos, campos no reconocidos, etc.). Los tres `name:` son
únicos (`automation-engineer`, `automation-reviewer`, `qa-analyst` — verificado con grep).

`claude doctor` (lee `settings.json` del directorio actual sin trust prompt) → **"No installation
issues found"**, confirmando que `.claude/settings.json` tampoco dispara warnings.

**Lo que quedaba pendiente, explícitamente, para después del reinicio** *(HISTORICAL STATE —
BEFORE T13.1; los tres puntos siguientes están RESUELTOS, ver T13.1 §2, §5–§8)*:

- ✅ Confirmar que los tres `name:` aparecen en la lista de agentes disponibles. — Resuelto (T13.1 §2).
- ✅ Confirmar que `tools:`/`model:` se resuelven sin error al primer uso real. — Resuelto (T13.1 §8–§9).
- ✅ Ejecutar los tres dry runs de §12 con el agente real (hoy no se pudieron correr). — Resuelto (T13.1 §5–§7).

---

## 12. Dry runs

**ESTADO ACTUAL: COMPLETED.** Los tres dry runs se ejecutaron en la continuación T13.1 — ver
`docs/refactor-progress-ia/T13.1-runtime-validation.md` §5–§7 para los tres resultados completos.
El resto de esta sección queda como registro histórico del intento bloqueado por el reinicio.

> **HISTORICAL STATE — BEFORE T13.1.** No ejecutados en esta sesión (T13) — bloqueados por el
> RESTART REQUIRED de §11, no por elección.

Se intentó el primero (`qa-analyst` sobre un requerimiento ficticio de búsqueda de productos) y
falló exactamente como predice la documentación (`Agent type 'qa-analyst' not found`), lo cual es
en sí mismo la confirmación empírica de §11 — no un intento fallido sin valor.

Pendientes para la continuación de T13 después del reinicio *(HISTORICAL STATE — BEFORE T13.1;
los tres quedaron ejecutados y RESUELTOS en T13.1, ver referencias)*:

1. **`qa-analyst`** sobre un requerimiento ficticio/incompleto → debe devolver una QA Analysis,
   detectar `UNKNOWN`, no escribir nada. — ✅ Ejecutado, T13.1 §5.
2. **`automation-engineer` `MODE: PLAN`** con una QA Analysis ficticia ya aprobada → debe devolver
   un Automation Plan, no modificar archivos. — ✅ Ejecutado, T13.1 §6.
3. **`automation-reviewer`** sobre un diff vacío o controlado → debe devolver un Review Report, no
   modificar archivos. — ✅ Ejecutado, T13.1 §7.

`MODE: IMPLEMENT` sobre código real **no se ejecutó en T13 ni en T13.1** — sigue correspondiendo a
T15 según el propio alcance de esta tarea.

---

## 13. Validaciones del framework

| Check | Resultado |
|---|---|
| `claude plugin validate .claude/agents` | ✅ `Validation passed`, exit 0 |
| `claude plugin validate .claude/agents --strict --json` | ✅ `"success": true`, exit 0 |
| Nombres únicos (`grep name: .claude/agents/*.md`) | ✅ `automation-engineer`, `automation-reviewer`, `qa-analyst` — sin duplicados |
| `.claude/settings.json` es JSON válido | ✅ |
| `claude doctor` | ✅ "No installation issues found" |
| Ningún agente tiene herramientas de más | ✅ `qa-analyst`: 3 tools (`Read, Grep, Glob`); `automation-engineer`: 6 (`Read, Grep, Glob, Edit, Write, Bash`); `automation-reviewer`: 4 (`Read, Grep, Glob, Bash`) — ninguno tiene `Agent`, `PowerShell`, ni `mcp__*` |
| `npm run quality` (repo completo, después de agregar `.claude/`) | ✅ **exit 0 — 61 tests / 23 suites / 61 pass / 0 fail** |
| `git status` | `?? .claude/` únicamente |
| `git diff` (archivos existentes) | **vacío** — T13 no modificó ningún archivo del framework |
| `git diff --stat` | vacío (sin archivos trackeados modificados) |

---

## 14. Archivos creados/modificados

| Archivo | Estado |
|---|---|
| `.claude/agents/qa-analyst.md` | **NUEVO** |
| `.claude/agents/automation-engineer.md` | **NUEVO** |
| `.claude/agents/automation-reviewer.md` | **NUEVO** |
| `.claude/settings.json` | **NUEVO** (T13) — *HISTORICAL STATE — BEFORE T13.1:* deny rules de Tier 1. **ESTADO ACTUAL:** acción `ask` para infraestructura de código, `Read(/.env)` en `deny` — ver §10.3 y T13.1 |
| `docs/refactor-progress-ia/T13-claude-agents.md` | **NUEVO** — este registro |

**Cero** cambios en código productivo, `CLAUDE.md`, guardrails, `package.json`, CI o
dependencias. No se instaló MCP, no se creó ningún skill/workflow, no se creó Orchestrator ni
Automation Planner.

---

## 15. Limitaciones

Documentadas explícitamente, no escondidas — tal como exige `CLAUDE.md` §8 para el propio
framework, y por la misma razón acá:

1. **Restart pendiente.** *(HISTORICAL STATE — BEFORE T13.1 — RESUELTO.)* La validación en
   runtime de los tres agentes (que la sesión los liste, que se invoquen sin error de resolución
   de tools/model) no se pudo completar en la sesión de T13. Confirmado, no fingido (§11). Resuelto
   en T13.1: los tres agentes se listan y se invocan correctamente — ver T13.1 §2, §5–§7.
2. **La protección de paths de `settings.json` es global, no por subagente.** Funciona en la
   práctica porque solo `automation-engineer` tiene `Edit`/`Write`, pero técnicamente cualquier
   llamador (incluida la sesión principal) queda sujeto a las mismas reglas de Tier 1. Es una
   limitación aceptada y no un bug: es lo que hace posible mantener `CLAUDE.md`/`.claude/**`
   editables por la sesión principal (Tier 2, contractual) sin abrir la puerta a que
   `automation-engineer` los toque sin querer, dado que ese agente jamás debería necesitar tocarlos
   durante trabajo normal.
3. **`MODE: PLAN` / `MODE: IMPLEMENT` es un límite contractual, no de herramientas.**
   `automation-engineer` tiene `Edit`/`Write` disponibles en ambos modos — nada a nivel de
   producto le impide técnicamente escribir durante `MODE: PLAN`; la única barrera es la
   instrucción del prompt más el gate humano de la sesión principal, que no manda
   `MODE: IMPLEMENT` + `PLAN APPROVED` hasta que el usuario aprobó. Se evaluó partirlo en dos
   agentes para volver esto un límite técnico real, y se descartó explícitamente por reintroducir
   el Automation Planner que la tarea prohíbe crear (§9).
4. **`bypassPermissions` como escape hatch documentado, no mitigado.** La propia documentación
   advierte que ese modo de permisos salta hasta las reglas de paths protegidos nativos — no se
   usa en el flujo normal de esta arquitectura y no hay ninguna razón para activarlo en trabajo de
   automatización QA, pero es una vía teórica de escape que existe en el producto, no en este
   diseño.
5. **Las reglas de permisos (`ask` o `deny`) sobre `Edit`/`Read` no cubren subprocesos
   arbitrarios.** Un script Python o Node que un agente pidiera correr por `Bash` y que abra
   archivos por su cuenta no pasa por el chequeo de permisos de Claude Code (documentado
   explícitamente por Anthropic). No es relevante hoy porque ningún agente tiene motivo para
   invocar un script así, pero es una limitación real del mecanismo, no de este diseño puntual, y
   aplica igual después de que Tier 1 cambió de `deny` a `ask` en T13.1.
6. **`claude plugin validate --json` devuelve `"contents": []`** para un directorio de agentes
   (a diferencia de un manifiesto de plugin) — la validación en sí (`success: true`, sin
   excepciones) es confiable, pero el JSON no enumera los tres archivos individualmente; se usó
   además el modo texto plano (`✔ Validation passed`) como confirmación complementaria.

Ninguna de estas limitaciones bloquea el uso de los tres agentes una vez reiniciada la sesión —
son las mismas fronteras honestas que T12 ya anticipaba en su §7.4 ("NEEDS CONFIRMATION").

---

## 16. Resultado

✅ **T13 COMPLETADA.** La continuación pendiente después del reinicio del usuario (los tres dry
runs de §12) se ejecutó y cerró en T13.1 (`docs/refactor-progress-ia/T13.1-runtime-validation.md`):
los tres agentes resolvieron en runtime, los tres dry runs corrieron sin escritura fuera de lo
esperado, y la estrategia de permisos se realineó de `deny` a `ask` para infraestructura protegida.

> **HISTORICAL STATE — BEFORE T13.1.** Texto original de esta sección, preservado como registro
> histórico de lo que se sabía al cierre de T13 (antes del reinicio). Donde este texto menciona
> `deny` para infraestructura de código o "RESTART REQUIRED", léase junto con el ESTADO ACTUAL
> declarado al inicio de este documento y en §10.3/§11/§12: hoy es `ask` (salvo `Read(/.env)`, que
> sigue `deny`) y el restart ya está resuelto.

- **3 archivos de agente creados** en `.claude/agents/`, con frontmatter validado por
  `claude plugin validate` (exit 0, modo estricto incluido).
- **Modelos:** `opus` para `qa-analyst` y `automation-reviewer`, `sonnet` para
  `automation-engineer` con escalamiento por invocación vía el parámetro `model` de la
  herramienta `Agent` de la sesión principal — todo con aliases portables, ningún ID de versión
  fijado sin motivo.
- **Permisos:** `tools:` como allowlist explícita en los tres; ningún agente puede spawnear
  subagentes ni usar MCP.
- **Path protection real en dos niveles**, documentados como lo que son: Tier 1 nativo
  (`.claude/settings.json`, deny rules de `Edit`/`Read` por path, confirmado contra la
  documentación oficial y validado con `claude doctor`) para la infraestructura de código; Tier 2
  contractual + review-enforced (`CLAUDE.md`, `.claude/**`) donde un deny global habría bloqueado
  el propio mantenimiento del contrato de IA por la sesión principal.
- **`npm run quality` → 61/61, exit 0.** `git diff` vacío sobre archivos existentes — T13 no tocó
  ningún archivo del framework.
- **RESTART REQUIRED confirmado empíricamente** (no supuesto): un intento real de invocar
  `qa-analyst` en esta sesión devolvió `Agent type 'qa-analyst' not found`, exactamente como
  predice la documentación para la creación del primer `.claude/agents/` de un scope.
- **6 limitaciones documentadas explícitamente**, ninguna escondida.

---

## 17. Aprendizaje técnico

1. **"Verificar antes de asumir" cambió el diseño, no solo lo confirmó.** T12 daba por
   conceptualmente posible una write allowlist "por subagente" a nivel de path. La documentación
   real muestra que el mecanismo nativo (`settings.json` deny rules) es de **alcance de sesión**,
   no de agente — un dato que obligó a repensar qué paths podían ir en Tier 1 (nativo, global,
   seguro de bloquear siempre) versus Tier 2 (contractual, porque un bloqueo global rompería el
   propio trabajo legítimo de la sesión principal sobre `CLAUDE.md`/`.claude/**`). Sin la
   verificación, el diseño habría fabricado una falsa sensación de aislamiento por agente.

2. **La pregunta correcta no es "¿existe una forma de lograr X?" sino "¿a qué costo, y ese costo
   rompe algo que necesito?".** Un hook `PreToolUse` scoped por agente sí habría dado
   granularidad por subagente — existía como opción real, no descartada por imposibilidad técnica
   sino porque, dado que hoy solo un agente escribe, esa granularidad extra no protegía nada que
   la combinación más simple (`tools:` + `settings.json`) no protegiera ya. Complejidad que no
   compra nada es la que hay que rechazar, no la complejidad en abstracto.

3. **Un límite "por archivo, no por agente" en un producto compartido por una sola sesión humana
   más sus subagentes tiene una asimetría estructural**: cualquier regla suficientemente estricta
   para contener al agente que menos confianza merece (el que escribe código, con menos criterio
   arquitectónico que un humano) termina conteniendo también a quien más confianza merece (el
   humano trabajando desde la sesión principal). Resolver eso exige clasificar los paths
   protegidos por *quién realísticamente los necesita tocar alguna vez*, no solo por *qué tan
   protegidos deberían estar en abstracto* — de ahí la partición en dos tiers, que no estaba en el
   diseño original de T12.

4. **Un error de resolución de agente es evidencia, no un obstáculo.** El intento fallido de
   invocar `qa-analyst` en esta misma sesión no fue tiempo perdido: es la confirmación empírica
   exacta de lo que la documentación predecía sobre el reinicio, y vale más como evidencia que
   simplemente citar la documentación sin haberlo probado.

5. **Dos modos en un agente versus dos agentes es una decisión de producto, no solo de
   ingeniería.** Técnicamente, separar `automation-engineer` en dos archivos (uno sin
   `Edit`/`Write` para planificar, otro con escritura para implementar) habría dado un límite
   real de herramientas en vez de uno contractual — estrictamente "mejor" en aislamiento. Pero la
   tarea fijó la restricción de conteo de agentes (3, no 4) como una decisión ya tomada en T12 por
   motivos de arquitectura (evitar la exploración duplicada y el Planner rechazado); replicar esa
   separación con otro nombre habría violado esa decisión aunque técnicamente fuera más seguro.
   Cuando dos objetivos de diseño compiten (aislamiento técnico vs. conteo mínimo de agentes), hay
   que declarar cuál gana y por qué, no elegir en silencio.

---

## 18. Próxima tarea

La continuación pendiente (dry runs post-reinicio) se ejecutó en T13.1
(`docs/refactor-progress-ia/T13.1-runtime-validation.md`). Con eso cerrado, la próxima tarea real
es:

**T14 — Crear workflow/skill de orquestación:** HU → `qa-analyst` → gate de usuario →
`automation-engineer MODE: PLAN` → gate de usuario → `automation-engineer MODE: IMPLEMENT` →
`automation-reviewer`. No ejecutada en T13 ni en T13.1.
