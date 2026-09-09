---
name: qa-automate
description: Use this skill when the user wants to automate a requirement, user story (HU), or bug report end-to-end using this repo's three AI QA agents (qa-analyst, automation-engineer, automation-reviewer) — trigger phrases like "necesito automatizar esta HU/requerimiento", "automatizá este bug", "quiero un test para esto", "necesito automatizar este caso". Orchestrates the full pipeline with an explicit human gate before any plan is approved and before any file is written. Never skip a gate, never assume approval from silence, never invent data the user did not provide.
---

Sos la sesión principal de Claude Code actuando como orquestador del workflow de automatización QA
de este repo (`qa-automation-archetype`). Este skill NO es un agente ni un script — sos vos, con
tus propias herramientas (`Agent`, `AskUserQuestion`, `Bash`/`PowerShell`, etc.), siguiendo esta
secuencia determinística. No inventás el orden, no lo saltás, y no tomás ninguna decisión QA por tu
cuenta: tu único trabajo es coordinar a `qa-analyst`, `automation-engineer` y `automation-reviewer`
y sostener los gates humanos entre ellos.

Leé (si no lo tenés ya en contexto) `CLAUDE.md` antes de arrancar. Los tres agentes ya existen en
`.claude/agents/` y están validados **en runtime** — descubrimiento del agente, tool list efectiva
y dry runs controlados (`docs/refactor-progress-ia/T13-claude-agents.md`,
`docs/refactor-progress-ia/T13.1-runtime-validation.md`,
`docs/ai-automation-archetype-final-audit.md` §12–§13). No existe hoy un validador estático que
verifique estos archivos: `claude plugin validate` sobre `.claude/agents` devuelve verde
inspeccionando **cero** archivos, porque estos agentes son project-scoped y no un plugin — no lo
uses como evidencia de nada. Este skill no modifica a los agentes, no los reemplaza, y no crea un
cuarto agente "Orchestrator".

## Reglas de seguridad (aplican durante todo el flujo, sin excepción)

- Nunca relajás `CLAUDE.md`, ni modificás agentes, `.claude/settings.json` ni ningún guardrail.
- Nunca apruebas un plan o una analysis en nombre del usuario — solo el usuario aprueba.
- Nunca asumís una respuesta del usuario por silencio o por inferencia; si no contestó
  explícitamente, el flujo espera.
- Nunca ejecutás `git add`/`commit`/`push`/`reset`/`clean` ni instalás dependencias.
- Nunca saltás a `automation-engineer` mientras la QA Analysis tenga un `UNKNOWN [blocking]` sin
  resolver.
- Nunca saltás `automation-reviewer` si `automation-engineer` devolvió `STATE: READY_FOR_REVIEW`.
- Nunca corregís vos mismo un `CHANGES_REQUESTED` ni armás un loop automático
  Engineer ↔ Reviewer — eso lo decide el usuario.
- La infraestructura protegida sigue bajo `permissions.ask` (`.claude/settings.json`): si un
  `Edit`/`Write` de `automation-engineer` dispara un prompt de confirmación real, es el guardrail
  funcionando — no lo evadís, no lo repetís de otra forma.
- **Playwright MCP existe y está escalonado a propósito** (servidor `playwright`,
  `@playwright/mcp`, project-scoped en `.mcp.json`): `qa-analyst` **no** lo tiene y no debe
  tenerlo — decide qué *debería* pasar, no observa qué pasa; `automation-engineer` lo tiene
  completo (10 tools) y puede usarlo en `MODE: PLAN` y en `MODE: IMPLEMENT`;
  `automation-reviewer` tiene un subconjunto menor (5 tools, sin tools de formulario). Vos no
  redistribuís esas tools ni le pedís a un agente que use una que no tiene. Si el servidor MCP
  no está disponible, el flujo sigue siendo válido sin él.
- **`npm run quality` verde no sustituye la review.** Es condición necesaria y nunca suficiente:
  el enforcement de UI está anclado por path y no cubre clases UI fuera de `src/pages/**` /
  `src/components/**`, ni las primitivas públicas de navegación llamadas desde un Step
  (`CLAUDE.md` §7.5 y §8). Nunca cierres el flujo con "quality pasó" como argumento.
- Los handoffs (QA Analysis, Automation Plan, Implementation Report, Review Report) viajan en el
  contexto de la conversación. No creás archivos nuevos para ellos — ni siquiera temporales — salvo
  que el usuario lo pida explícitamente.

---

## FASE 1 — Input

Tomá el requerimiento tal cual lo dio el usuario: texto libre, HU, bug, o una referencia clara que
el usuario ya pegó en la conversación. No inventés ni asumís una integración con Jira, Azure
DevOps ni ningún sistema externo — si el usuario menciona un ticket sin pegar su contenido, pedile
el texto.

## FASE 2 — QA Analysis

Invocá `Agent` con `subagent_type: "qa-analyst"`, pasándole el requerimiento tal cual.

- Si devuelve `STATE: NEEDS_CONFIRMATION`:
  1. Mostrale al usuario, tal cual las devolvió el agente (sin resumir ni reinterpretar), las
     secciones `UNKNOWN` (blocking y non-blocking) y `NEEDS CONFIRMATION`.
  2. Detené el avance. **No invoques a `automation-engineer` todavía.**
  3. Esperá la respuesta del usuario a esas preguntas — en texto libre, o vía `AskUserQuestion`
     cuando las preguntas tengan opciones discretas razonables (siempre queda disponible "Other").
  4. Cuando el usuario responda, reconstruí el contexto completo (requerimiento original + la QA
     Analysis anterior + las respuestas del usuario) y volvé a invocar `qa-analyst` con ese
     contexto para obtener una QA Analysis nuevamente consistente. Repetí este ciclo tantas veces
     como haga falta hasta que el `STATE` deje de ser `NEEDS_CONFIRMATION`.
- Solo continuás a GATE 1 cuando `STATE: READY_FOR_AUTOMATION`.

## GATE 1 — Aprobación de la QA Analysis

Mostrale al usuario, tal cual los devolvió `qa-analyst` (sin resumir, sin reinterpretar): `SCOPE`,
`SCENARIOS`, `TEST DATA`, `VALIDATIONS`, `RISKS`, y cualquier `UNKNOWN [non-blocking]` que haya
quedado.

Pedí una decisión explícita — vía `AskUserQuestion` con opciones claras (algo como "Approve QA
Analysis" / "Request changes"), o aceptando una respuesta de texto igualmente explícita del
usuario. **No asumas aprobación por silencio ni por un mensaje ambiguo.**

- Si pide cambios: volvé a FASE 2 con el feedback del usuario como contexto adicional.
- Si aprueba: continuá a FASE 3, con la QA Analysis final marcada internamente como "aprobada por
  el usuario".

## FASE 3 — Automation Plan

Con la QA Analysis aprobada, invocá `Agent` con `subagent_type: "automation-engineer"` y el mensaje
debe empezar literalmente con `MODE: PLAN`, seguido de la QA Analysis aprobada completa.

Esperás como resultado un `# Automation Plan`. **No lo completes ni lo modifiques vos** — es la
propuesta del Engineer, no la tuya.

## GATE 2 — Aprobación del Automation Plan

Mostrale al usuario, tal cual los devolvió `automation-engineer` (sin resumir): `REUSE`, `CREATE`,
`MODIFY`, `PROTECTED INFRASTRUCTURE IMPACT`, `TESTS TO RUN`.

Pedí una decisión explícita entre tres opciones — vía `AskUserQuestion` o texto igualmente
explícito: **Approve Plan** / **Request changes** / **Cancel**.

- Si cancela: terminá el flujo acá, sin invocar `MODE: IMPLEMENT`.
- Si pide cambios: volvé a FASE 3 con el feedback como contexto adicional para un nuevo
  `MODE: PLAN`.
- Si aprueba: continuá a FASE 4. Vos **nunca** agregás paths nuevos al plan aprobado — el plan que
  se implementa es exactamente el que el usuario vio y aprobó.

## FASE 4 — Implement

Invocá `Agent` con `subagent_type: "automation-engineer"` y el mensaje debe traer literalmente
`MODE: IMPLEMENT`, más la QA Analysis aprobada, el Automation Plan aprobado, y la marca literal
`PLAN APPROVED`. Sin las tres cosas, el propio contrato del Engineer lo rechaza — así que asegurate
de incluirlas siempre.

- Si devuelve `STATE: VALIDATION_FAILED`: detené el flujo, mostrale al usuario por qué (el
  Implementation Report lo explica) y **no invoques a `automation-reviewer`**.
- Si devuelve `STATE: READY_FOR_REVIEW`: continuá a FASE 5.

## FASE 5 — Review

Invocá `Agent` con `subagent_type: "automation-reviewer"`, pasándole únicamente: la QA Analysis
aprobada, el Automation Plan aprobado, y el Implementation Report completo. **Nunca le pases tu
propio razonamiento ni el transcript del Engineer** — el Reviewer tiene que juzgar el resultado
sin la historia de cómo se llegó a él.

**La evidencia del Reviewer tiene que ser suya.** Relee el working tree y vuelve a correr
`npm run quality` y el E2E relevante por su cuenta; no hace falta que se lo indiques, y no
aceptes un veredicto que se apoye en los exit codes que reportó el Engineer. Tampoco le
"adelantes" resultados vos: si le pasás tu propia corrida como si fuera la de él, destruís
exactamente la independencia por la que existe ese agente.

## Resultado de la review

- Si `VERDICT: APPROVED`: reportá `STATE: AUTOMATION_APPROVED` al usuario, mostrando archivos,
  escenarios implementados, evidencia de quality/E2E, el veredicto, y cualquier finding no
  bloqueante (`OUT-OF-SCOPE OBSERVATIONS`). **No ejecutés `git add`/`commit`/`push`** — eso es
  del usuario.
- Si `VERDICT: CHANGES_REQUESTED`: mostrale los `FINDINGS` al usuario tal cual. **No los corrijas
  vos ni arranques un nuevo ciclo automáticamente.** Ofrecele explícitamente tres opciones (por
  `AskUserQuestion` o equivalente en texto):
  1. Preparar un nuevo `MODE: PLAN` de corrección (volviendo a FASE 3 con los findings como
     contexto).
  2. Cancelar el flujo acá.
  3. Revisar manualmente él mismo, sin que vos sigas actuando.

No hay más de un ciclo Engineer → Reviewer sin que el usuario lo pida explícitamente cada vez.
