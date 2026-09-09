# T14 — QA Automation Workflow Skill

**Date:** 2026-09-07
**Status:** ✅ COMPLETED
**Branch:** `feature/claude-ai-integration`
**Fase:** 2 — Claude Code + agentes + Playwright MCP · cuarta tarea (después de T11, T11.1, T12, T13, T13.1)
**Precondición:** los tres agentes (`qa-analyst`, `automation-engineer`, `automation-reviewer`)
están implementados y validados en runtime (`docs/refactor-progress-ia/T13-claude-agents.md`,
`docs/refactor-progress-ia/T13.1-runtime-validation.md`).

---

## 1. Objetivo

Crear una única entrada simple para el usuario ("necesito automatizar esta HU/requerimiento") que
coordine el pipeline completo — `qa-analyst` → gate → `automation-engineer MODE: PLAN` → gate →
`automation-engineer MODE: IMPLEMENT` → `automation-reviewer` — sin que el usuario necesite conocer
ni invocar manualmente los tres agentes.

T14 **no** instala Playwright MCP, **no** modifica los tres agentes salvo contradicción objetiva
demostrada (no hubo ninguna), **no** modifica código productivo, **no** implementa un caso real, y
**no** avanza a T15.

---

## 2. Claude Code skill capabilities

Verificado, no asumido. Versión instalada confirmada de nuevo: `claude --version` → `2.1.263`
(nativo, win32-x64) — sin cambios desde T13/T13.1.

**Primer chequeo (agente `claude-code-guide`, sub-invocación):** devolvió una conclusión
excesivamente estricta — "Skills are NOT the right mechanism" — basada en confundir dos cosas
distintas: "el contenido markdown de un skill no puede ejecutar código por sí mismo" (cierto, un
`.md` nunca ejecuta nada) con "es imposible construir este workflow con un skill" (falso).

**Segundo chequeo (WebFetch directo de `code.claude.com/docs/en/skills`, con cita textual):**
corrigió y precisó lo anterior:

| # | Pregunta | Resultado verificado |
|---|---|---|
| 1 | Ubicación project-level | `.claude/skills/<skill-name>/SKILL.md` — confirmado |
| 2 | Frontmatter | `name` (opcional, default = nombre de carpeta), `description` (recomendado, es lo que Claude usa para auto-invocar), y opcionales: `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `context`, `agent`, `background`, `model`, `effort`, `argument-hint`, `arguments`, `paths`, `shell`, `hooks`, `metadata`, etc. Usamos solo `name` + `description` — el resto no aporta nada al diseño de T12/T13 |
| 3 | Invocación real | Ambas: slash command explícito (`/qa-automate`) **y** invocación por lenguaje natural cuando la `description` matchea la intención del usuario (`disable-model-invocation: true` restringiría a solo slash — no lo usamos, para cumplir la UX pedida: "el usuario no debe necesitar conocer los agentes") |
| 4 | ¿Puede el `.md` del skill invocar subagents directamente? | **No como código** — el `.md` es texto, no ejecuta nada por sí mismo. La forma real de orquestar subagents es: (a) `context: fork`, que convierte el contenido del skill en la tarea de un subagente aislado, o (b) **default (sin `context: fork`)**: el contenido del skill se carga "en el turno" de quien invocó el skill — la sesión principal — que sí tiene acceso a `Agent`, `AskUserQuestion` y el resto de sus herramientas, y es quien decide invocar cada subagente siguiendo las instrucciones del skill. **Elegimos deliberadamente (b)**, sin `context: fork`, porque T12 ya decidió "sin Orchestrator agent — la sesión principal coordina", y `context: fork` reintroduciría exactamente eso con otro nombre (y además correría en background por defecto, incompatible con múltiples gates conversacionales en tiempo real) |
| 5 | Pausar y preguntar al usuario a mitad de flujo | La documentación no dice explícitamente "un skill puede pausar" — pero eso es la pregunta equivocada bajo el modelo (b): al no haber `context: fork`, no hay "un skill" ejecutándose como proceso separado que deba "pausar"; es la sesión principal, con su propio loop de conversación normal, la que sigue las instrucciones del skill a lo largo de tantos turnos como haga falta, terminando un turno con una pregunta y retomando en el turno siguiente — exactamente como cualquier tarea multi-turno de esta sesión. **Confirmado empíricamente, no solo por lectura de doc:** ver Dry Run 2 (§10), donde `AskUserQuestion` se usó en un gate real y devolvió una respuesta real del usuario dentro del mismo flujo |
| 6 | ¿`AskUserQuestion` disponible? | Sí — es una herramienta más de la sesión principal, no algo específico de skills; su disponibilidad no depende de estar "dentro" de un skill. Confirmado empíricamente (§10) |
| 7 | ¿Requiere restart el primer `.claude/skills/`? | La documentación dice que sí ("restart Claude Code so it can begin watching the new directory" si el directorio no existía al arrancar la sesión) — **y lo confirmamos empíricamente en la primera mitad**: el primer intento de `Skill({skill: "qa-automate"})` en esta misma sesión devolvió `Unknown skill: qa-automate`. **Pero un segundo intento, más tarde, en la misma sesión, sin que el usuario reiniciara Claude Code, sí funcionó** — el skill cargó su contenido correctamente. No inventamos una explicación de esa discrepancia (posible: rescan periódico en background, alguna ventana de gracia); la reportamos como observada, no la asumimos resuelta por diseño |

**Conclusión final (corregida respecto del primer chequeo):** un skill **sí** es el mecanismo
correcto para este workflow, exactamente en el modo (b) de la pregunta 4 — un "kickoff prompt"
determinístico que la sesión principal carga y sigue con sus propias herramientas, no un proceso
aislado que orquesta por su cuenta. Esto es consistente con la arquitectura decidida en T12 ("sin
Orchestrator agent") y no requiere fabricar ningún pseudo-framework.

---

## 3. Estructura creada

```text
.claude/
└── skills/
    └── qa-automate/
        └── SKILL.md
```

Frontmatter mínimo, sin `context: fork`, sin `disable-model-invocation`, sin `allowed-tools`
adicionales — la sesión principal ya tiene todo lo que necesita.

```yaml
---
name: qa-automate
description: Use this skill when the user wants to automate a requirement, user story (HU), or
  bug report end-to-end using this repo's three AI QA agents (qa-analyst, automation-engineer,
  automation-reviewer) — trigger phrases like "necesito automatizar esta HU/requerimiento",
  "automatizá este bug", "quiero un test para esto", "necesito automatizar este caso". Orchestrates
  the full pipeline with an explicit human gate before any plan is approved and before any file is
  written. Never skip a gate, never assume approval from silence, never invent data the user did
  not provide.
---
```

---

## 4. Workflow

El cuerpo de `SKILL.md` (ver el archivo completo) instruye a la sesión principal a seguir esta
secuencia, sin saltos ni atajos:

```text
FASE 1 (Input)
  → FASE 2 (qa-analyst)
      NEEDS_CONFIRMATION → mostrar preguntas, detener, esperar, reconstruir contexto, reintentar
      READY_FOR_AUTOMATION → continuar
  → GATE 1 (usuario aprueba la QA Analysis)
  → FASE 3 (automation-engineer MODE: PLAN)
  → GATE 2 (usuario aprueba el Automation Plan)
  → FASE 4 (automation-engineer MODE: IMPLEMENT, con QA Analysis + Plan + "PLAN APPROVED")
      VALIDATION_FAILED → detener, NO invocar Reviewer
      READY_FOR_REVIEW → continuar
  → FASE 5 (automation-reviewer, solo con los 3 handoffs + working tree, nunca el razonamiento del
            Engineer)
      APPROVED → STATE: AUTOMATION_APPROVED, reportar evidencia, el usuario commitea
      CHANGES_REQUESTED → mostrar findings, ofrecer 3 opciones, sin loop automático
```

El skill nunca decide nada QA por sí mismo: cada decisión de negocio, de archivos o de veredicto
sigue siendo de `qa-analyst`/`automation-engineer`/`automation-reviewer`/usuario, tal como exige la
arquitectura de T12 (§6 "Agent Boundaries").

---

## 5. Gates humanos

Dos gates explícitos, ninguno asumible por silencio:

- **GATE 1** (tras `READY_FOR_AUTOMATION`): muestra `SCOPE`, `SCENARIOS`, `TEST DATA`,
  `VALIDATIONS`, `RISKS`, `UNKNOWN [non-blocking]` tal cual los devolvió `qa-analyst`. Pide
  **Approve QA Analysis** / **Request changes**.
- **GATE 2** (tras `PLAN_PROPOSED`): muestra `REUSE`, `CREATE`, `MODIFY`,
  `PROTECTED INFRASTRUCTURE IMPACT`, `TESTS TO RUN` tal cual los devolvió `automation-engineer`.
  Pide **Approve Plan** / **Request changes** / **Cancel**.

Mecanismo real: `AskUserQuestion` (validado en vivo en Dry Run 2, §10) o una respuesta de texto
igualmente explícita del usuario. `qa-automate` nunca avanza de estado con una respuesta ambigua.

---

## 6. Agent handoffs

Los tres documentos (QA Analysis, Automation Plan, Implementation Report) viajan en el contexto de
la conversación, tal como ya decidía T12 §8 — el skill no crea archivos nuevos para ellos. Al
invocar `automation-reviewer`, el skill pasa únicamente los tres documentos + el working tree —
nunca el razonamiento ni el transcript de `automation-engineer` (independencia del Reviewer,
T12 §5.3).

---

## 7. States

`qa-automate` no inventa un state machine propio: reexpone los `STATE:` que ya emiten los tres
agentes (`NEEDS_CONFIRMATION`, `READY_FOR_AUTOMATION`, `PLAN_PROPOSED`, `VALIDATION_FAILED`,
`READY_FOR_REVIEW`) y agrega solo dos etiquetas de coordinación explícitas en su propio texto:
`PLAN_APPROVAL_REQUIRED` (al mostrar GATE 2) y `AUTOMATION_APPROVED` (al reportar un
`VERDICT: APPROVED` del Reviewer). Ningún estado nuevo reemplaza ni reinterpreta los estados reales
de los agentes.

---

## 8. Error handling

- **`NEEDS_CONFIRMATION` en loop:** validado empíricamente en Dry Run 2 (§10) — `qa-analyst`
  devolvió `NEEDS_CONFIRMATION` una vez, el flujo reconstruyó el contexto con las respuestas del
  usuario, y una segunda invocación devolvió `READY_FOR_AUTOMATION`.
- **`VALIDATION_FAILED` (FASE 4):** especificado en el skill (detener, no invocar Reviewer) pero
  **no ejercitado empíricamente** en T14 — los dry runs se detienen antes de `MODE: IMPLEMENT` por
  alcance explícito de la tarea. Queda para T15.
- **`CHANGES_REQUESTED` (resultado de review):** especificado (mostrar findings, ofrecer 3
  opciones, sin loop automático) pero **no ejercitado empíricamente** en T14 por la misma razón.

---

## 9. Security boundaries

Reiteradas textualmente en `SKILL.md` (sección "Reglas de seguridad"), heredadas de `CLAUDE.md` y
de T12 §7: nunca relaja `CLAUDE.md`/guardrails/agentes/settings; nunca aprueba nada en nombre del
usuario; nunca asume aprobación por silencio; nunca ejecuta git mutante ni instala dependencias;
nunca salta al Engineer con `UNKNOWN [blocking]` sin resolver; nunca salta al Reviewer si
`READY_FOR_REVIEW`; nunca arma un loop automático Engineer↔Reviewer. La infraestructura protegida
sigue bajo `permissions.ask` (`.claude/settings.json`, T13.1) — el skill no auto-aprueba esos
prompts, y si uno aparece, es el guardrail funcionando.

---

## 10. Dry runs

### Dry Run 1 — "Automatizar cambio de estado de un dispositivo desde UI"

Invocado `qa-analyst` directamente (siguiendo FASE 2 del skill). Resultado: `STATE:
NEEDS_CONFIRMATION`, 8 `UNKNOWN [blocking]` + 6 `[non-blocking]`, `NEEDS CONFIRMATION` con 4
preguntas concretas. Por diseño del skill: se muestran las preguntas y **se detiene el flujo**.
`automation-engineer` **no fue invocado**. `git status --porcelain` idéntico antes/después.

### Dry Run 2 — requerimiento ficticio completo (navegación pública sobre el ejemplo existente)

1. Primer intento de `qa-analyst` con un requerimiento "aparentemente completo" (navegar a la
   home, click en "Docs", verificar navegación) → devolvió `NEEDS_CONFIRMATION` de nuevo — detectó
   correctamente dos huecos reales que yo había dejado sin resolver (heading de la página destino;
   si se valida la URL). Esto es evidencia de que el agente no se deja pasar un requerimiento
   incompleto solo porque "suena completo".
2. Se reconstruyó el contexto (requerimiento original + QA Analysis anterior + respuestas
   concretas del usuario a las 4 preguntas) y se reinvocó `qa-analyst` → `STATE:
   READY_FOR_AUTOMATION`, con solo `UNKNOWN [non-blocking]` restantes.
3. **GATE 1 real:** se mostró el contenido completo de la QA Analysis y se invocó
   `AskUserQuestion` — respuesta real obtenida: **"Approve QA Analysis"**. Mecanismo confirmado
   funcional en vivo, no asumido.
4. **Verificación cruzada del propio skill:** en este punto se invocó también `Skill({skill:
   "qa-automate"})` para chequear reconocimiento en runtime (§11) — cargó correctamente y no alteró
   el flujo en curso.
5. `automation-engineer MODE: PLAN` con la QA Analysis aprobada → `STATE: PLAN_PROPOSED`, con
   `REUSE`/`CREATE`/`MODIFY` concretos (reutiliza steps y helpers existentes, crea un Feature +
   steps nuevos, agrega un método de click a `ExamplePage`/`ExampleNavigationComponent`) y
   `PROTECTED INFRASTRUCTURE IMPACT: NONE`.
6. **Workflow → `PLAN_APPROVAL_REQUIRED`. Detenido acá, sin invocar `MODE: IMPLEMENT`**, tal como
   exige el alcance de T14.

`git status --porcelain` y `git diff --stat` idénticos antes/después de todo el Dry Run 2 (vacíos
salvo `.claude/skills/`, que ya existía desde antes de este dry run).

---

## 11. Runtime validation

- **Primer intento** de `Skill({skill: "qa-automate"})`, inmediatamente después de crear el
  archivo: `Unknown skill: qa-automate`. Confirma la predicción de la documentación (§2 pregunta 7)
  — el directorio `.claude/skills/` no existía al arrancar esta sesión.
- **Segundo intento**, más tarde en la misma sesión (sin que el usuario reiniciara Claude Code):
  el skill cargó correctamente su contenido completo (`SKILL.md`) en el turno. Ver la discrepancia
  documentada honestamente en §2 y §14 — no se inventa una causa, se reporta el hecho.
- **Invocación explícita confirmada** (vía `Skill` tool con el nombre exacto). La invocación por
  lenguaje natural (el usuario simplemente diciendo "necesito automatizar...") **no fue probada
  literalmente como tal** en esta sesión — lo que sí se confirmó es que la `description` del
  frontmatter es la que Claude usa para decidir un auto-match, según la documentación oficial (§2
  pregunta 3); queda como limitación no verificada en runtime (§14).

---

## 12. Framework validation

| Check | Resultado |
|---|---|
| `npm run quality` | ✅ **exit 0 — 61 tests / 23 suites / 61 pass / 0 fail** |
| `git status` | `?? .claude/skills/` únicamente |
| `git diff` | vacío |
| `git diff --stat` | vacío |

---

## 13. Archivos creados/modificados

| Archivo | Estado |
|---|---|
| `.claude/skills/qa-automate/SKILL.md` | **NUEVO** |
| `docs/refactor-progress-ia/T14-automation-workflow.md` | **NUEVO** — este registro |

**Cero** cambios en `.claude/agents/**`, `.claude/settings.json`, `CLAUDE.md`, código productivo,
guardrails o dependencias. No se instaló MCP. No se creó ningún Orchestrator agent. No se ejecutó
`MODE: IMPLEMENT` ni `automation-reviewer` sobre un caso real.

---

## 14. Limitaciones

1. **Discrepancia de restart no explicada.** La documentación exige reinicio para el primer
   `.claude/skills/`; el primer intento lo confirmó (`Unknown skill`), pero un segundo intento en
   la misma sesión, sin reinicio real, funcionó. No se determinó la causa exacta (posible rescan
   periódico); se documenta como observado, no como comportamiento garantizado.
2. **GATE 2 no se re-probó con un `AskUserQuestion` real independiente** — el Dry Run 2 se detuvo
   en `PLAN_APPROVAL_REQUIRED` por alcance explícito de la tarea ("DETENER antes de MODE:
   IMPLEMENT"), asumiendo que el mecanismo es idéntico al de GATE 1 (mismo tool, mismo patrón), ya
   validado en vivo.
3. **`MODE: IMPLEMENT`, `FASE 5` (Reviewer), `VALIDATION_FAILED` y `CHANGES_REQUESTED` no se
   ejercitaron empíricamente** — son parte del contrato del skill y de los agentes subyacentes
   (ya validados por separado en T13.1), pero su combinación end-to-end real queda para T15.
4. **La "reconstrucción de contexto" de FASE 2 es manual**, no una plantilla automática: depende
   de que la sesión principal componga correctamente requerimiento + análisis anterior +
   respuestas del usuario cada vez. Es coherente con "sin Orchestrator agent" (T12), no un defecto
   nuevo de este skill.
5. **La invocación por lenguaje natural (sin slash command) no se probó literalmente** — se
   confirmó el mecanismo de invocación explícita (`Skill` tool) y la documentación oficial sobre
   cómo `description` habilita el auto-match, pero no se disparó una invocación real solo por
   frase natural en esta sesión.
6. **`.claude/skills/qa-automate/SKILL.md` sigue sin trackear/commitear** — igual que el caso de
   `.claude/settings.json` en T13.1: vive en este working tree local hasta que el usuario decida
   commitearlo.

Ninguna de estas limitaciones bloquea el uso normal del skill.

---

## 15. Resultado

✅ **T14 COMPLETED.**

- Mecanismo de Skill verificado contra documentación oficial vigente (no inventado), con
  corrección explícita de un primer chequeo demasiado estricto.
- Estructura creada: `.claude/skills/qa-automate/SKILL.md`, frontmatter mínimo, sin `context:
  fork` (decisión deliberada, consistente con "sin Orchestrator agent" de T12).
- Los dos dry runs se ejecutaron realmente: Dry Run 1 se detuvo correctamente en
  `NEEDS_CONFIRMATION` sin invocar al Engineer; Dry Run 2 recorrió el loop de confirmación, GATE 1
  con `AskUserQuestion` real, `MODE: PLAN`, y se detuvo en `PLAN_APPROVAL_REQUIRED` sin invocar
  `MODE: IMPLEMENT`.
- Ningún archivo productivo fue modificado en ningún momento (`git diff --stat` vacío en ambos
  dry runs).
- `npm run quality` → PASS, 61/61, exit 0.
- Ningún agente, `settings.json` ni `CLAUDE.md` fueron modificados — no hubo contradicción
  objetiva que lo ameritara.

---

## 16. Próxima tarea

**T15 — Ejecutar el primer caso completo de automatización asistida por IA**, extremo a extremo
(incluyendo `MODE: IMPLEMENT`, `automation-reviewer` sobre código real, y los flujos de
`VALIDATION_FAILED`/`CHANGES_REQUESTED` aún no ejercitados). No ejecutada en T14.
