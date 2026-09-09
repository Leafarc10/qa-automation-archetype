# T18 — Agent Playwright MCP Integration

**Estado:** ✅ COMPLETED
**Branch:** `feature/claude-ai-integration`
**Fase:** 2 — Claude Code + agentes + Playwright MCP · continuación de T17/T17.1/T17.2
(servidor `playwright` instalado y validado) y T13/T13.1 (los tres agentes existentes).

---

## 1. Objetivo

Habilitar el uso de Playwright MCP a los agentes correctos del workflow de automatización QA —
`automation-engineer` (con acceso completo) y `automation-reviewer` (con una allowlist más
chica) — dejando `qa-analyst` sin ningún acceso a MCP, tal como fija la arquitectura aprobada en
`docs/ai-agent-architecture-plan.md` §11.

Explícitamente fuera de scope de esta tarea: no se creó ninguna automatización nueva, no se
ejecutó ningún caso real de negocio, no se modificó código productivo, no se tocó `qa-automate`,
y no se ejecutó T19 (primer flujo `qa-automate` completo usando MCP).

---

## 2. Claude Code capabilities

Verificado por fetch directo a la documentación oficial vigente (`code.claude.com/docs/en/
sub-agents.md`), no citado de memoria, antes de tocar ningún archivo de agente:

| # | Pregunta | Resultado verificado |
|---|---|---|
| 1 | ¿MCP en custom subagents? | Sí, vía el campo `mcpServers:` del frontmatter. Cada entrada es una definición inline (server nuevo, scoped al subagente) o un **string** referenciando un servidor "ya configurado en la sesión" (ej. project-scoped en `.mcp.json`) |
| 2 | ¿Frontmatter soportado? | `tools:` (allowlist) y `disallowedTools:` (denylist) son mutuamente compatibles — si ambos están, `disallowedTools` se aplica primero y `tools` se resuelve contra lo que queda. Un tool en ambas listas queda removido |
| 3 | ¿`mcpServers:` en frontmatter? | Confirmado, sintaxis exacta arriba |
| 4 | ¿Tools allowlist granular por tool MCP concreta? | **Sí** — la doc dice textualmente: *"Use this full name when referencing the tool in permission rules, a skill's `allowed-tools` list, a subagent's `tools` field, or a hook matcher"*, refiriéndose al nombre completo `mcp__<server>__<tool>`. Además ambos campos (`tools`/`disallowedTools`) aceptan el patrón de servidor completo `mcp__<server>` o `mcp__<server>__*` para otorgar/quitar todas las tools de un servidor de una sola vez |
| 5 | ¿Restricción por servidor/tool? | Confirmado en el punto anterior — server-level pattern y tool-level exacto conviven en el mismo campo |
| 6 | ¿Restart/reload tras el cambio? | La documentación dice que Claude Code detecta cambios en `.claude/agents/**` en segundos, **sin restart**, salvo tres casos (primer archivo de agente en un scope nuevo, agentes agregados vía `--add-dir`, sesiones con `--disable-slash-commands`) — ninguno aplica acá (`.claude/agents/` ya existe desde T13). **Verificado empíricamente, no solo citado**: ver §10 y §11 — el primer intento con tools MCP en el allowlist sin `mcpServers:` falló ("No such tool available"), y funcionó sin ningún restart apenas se agregó `mcpServers:` al mismo archivo ya editado en la misma sesión |

**Hallazgo real, no documentado explícitamente por la fuente oficial** (ver §9 Limitations): la
documentación no aclaraba si listar solo `mcp__playwright__<tool>` en `tools:` alcanza cuando el
servidor ya está project-scoped en `.mcp.json`, sin declarar también `mcpServers:` en el
subagente. **Se probó empíricamente y la respuesta es no**: hace falta **ambos** campos.

---

## 3. MCP tool inventory

Servidor `playwright` (project-scoped, `.mcp.json`), 23 tools totales — inventariadas cargando
sus schemas reales (no adivinadas por nombre) vía `ToolSearch`:

| Categoría | Tools | Motivo |
|---|---|---|
| **READ / OBSERVE** | `browser_snapshot`, `browser_find`, `browser_console_messages`, `browser_network_request(s)`, `browser_take_screenshot`, `browser_wait_for` | No mutan el estado de la app; observan/esperan |
| **INTERACT** | `browser_navigate`, `browser_navigate_back`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_select_option`, `browser_hover`, `browser_press_key`, `browser_drag`, `browser_drop`, `browser_file_upload`, `browser_handle_dialog`, `browser_resize`, `browser_tabs` | Mutan el estado del browser/página |
| **HIGHER-RISK / UNNECESSARY** | `browser_evaluate` (ejecuta JS arbitrario — riesgo medio, ya usado en T17 solo para observación), `browser_run_code_unsafe` (su propia descripción: *"Unsafe: executes arbitrary JavaScript in the Playwright server process and is RCE-equivalent"*) | Superficie de riesgo alta para el rol de QA; `browser_run_code_unsafe` queda excluido de ambos agentes sin excepción |

**No existe `browser_check`** ni ningún equivalente con ese nombre en esta versión del servidor
(0.0.80). El equivalente real para checkbox/radio/combobox es `browser_fill_form`, cuyo schema
acepta `type: "checkbox" | "radio" | "combobox" | "slider" | "textbox"` con `value: "true"/"false"`
para checkboxes. Se documenta este hallazgo en vez de inventar un nombre que la consigna prohibía
inventar.

---

## 4. qa-analyst strategy

**Sin cambios de frontmatter.** `tools: Read, Grep, Glob` — igual que en T13, sin ningún
`mcp__playwright__*` ni `mcpServers:`. Con `tools:` como allowlist explícita (decisión ya tomada
en T13), la ausencia total de esas entradas **es** la denegación — no hace falta
`disallowedTools` adicional ni ningún mecanismo extra.

El prompt del agente ya traía, desde T13, la defensa textual real (no una nota superficial):

> "No explorás la aplicación corriendo — no tenés MCP y no lo vas a tener (MCP es para observar
> *qué pasa*; vos determinás *qué debería pasar*, y esas dos cosas no se mezclan)."

Se evaluó agregar una línea adicional del estilo "Do not use MCP/browser observation as
requirement evidence" y se descartó: no aporta una defensa real que la frase ya existente no dé
— agregarla sería fabricar texto redundante. **`qa-analyst.md` no fue modificado en esta tarea.**

---

## 5. automation-engineer MCP strategy

Frontmatter (`tools:` ampliado + `mcpServers:` nuevo):

```yaml
tools: Read, Grep, Glob, Edit, Write, Bash, mcp__playwright__browser_navigate,
  mcp__playwright__browser_navigate_back, mcp__playwright__browser_snapshot,
  mcp__playwright__browser_click, mcp__playwright__browser_type,
  mcp__playwright__browser_fill_form, mcp__playwright__browser_select_option,
  mcp__playwright__browser_wait_for, mcp__playwright__browser_evaluate,
  mcp__playwright__browser_close
mcpServers:
  - playwright
```

Cuerpo del prompt: nueva sección `## Playwright MCP` (entre "Input que siempre recibís" y
"MODE: PLAN") que:

- autoriza el uso en **ambos modos** (`PLAN` para observar la UI real antes de proponer locators;
  `IMPLEMENT` para confirmar que un locator propuesto resuelve o reproducir un flujo);
- prohíbe explícitamente decidir con MCP una regla de negocio, escenario, cobertura, dato o
  arquitectura — eso sigue viniendo solo de la QA Analysis aprobada y `CLAUDE.md`;
- reafirma semántica accesible, ownership Page/Component, y REUSE antes de CREATE;
- define la disciplina de fuente: `SOURCE: MCP_OBSERVED — <qué se observó>` junto a
  `SOURCE: REQUIREMENT` y `SOURCE: EXISTING_CODE`, con la aclaración explícita de que una
  observación MCP no vuelve un locator "definitivo" por sí sola;
- deja explícito que el agente sigue funcional sin MCP (fuente válida = QA Analysis, código
  existente, o el usuario) si el servidor no está disponible o falla.

---

## 6. automation-reviewer MCP strategy

Frontmatter:

```yaml
tools: Read, Grep, Glob, Bash, mcp__playwright__browser_navigate,
  mcp__playwright__browser_snapshot, mcp__playwright__browser_click,
  mcp__playwright__browser_evaluate, mcp__playwright__browser_close
mcpServers:
  - playwright
```

Allowlist deliberadamente **más chica** que la del Engineer — sin `browser_type`,
`browser_fill_form`, `browser_select_option`, `browser_navigate_back`, `browser_wait_for`.
Cuerpo del prompt: nueva sección `## Playwright MCP` que:

- aclara que no tiene tools de formulario y que, si un escenario real las necesitara para
  reproducirse, debe declararlo en `NOT VERIFIED` en vez de asumir que el flujo funciona —
  nunca se le otorgan tools "porque existen";
- fija el uso en "reproducir, no decidir": navegar, snapshot, click para reproducir, confirmar
  nombre accesible/URL, y `browser_evaluate` solo cuando aporte evidencia que snapshot/URL no
  dan por sí solos;
- aclara que MCP no cambia su naturaleza read-only **sobre el repo** (sigue sin `Edit`/`Write`),
  aunque sí puede mutar el estado de la app/navegador bajo prueba — eso es esperado, no una
  excepción a su contrato;
- deja explícito que la revisión sigue siendo válida sin MCP (handoffs + código +
  quality/E2E reproducidos ya cubren la mayor parte del checklist).

---

## 7. Tool permissions

Confirmado (§2, punto 4): `tools:` acepta nombres exactos de tool MCP
(`mcp__playwright__browser_click`) mezclados con tools nativas (`Read`, `Edit`, `Bash`) en la
misma lista, y también patrones de servidor completo (`mcp__playwright` /
`mcp__playwright__*`) para otorgar/negar el servidor entero — no se usó el patrón completo en
ningún agente porque ambos necesitan un subconjunto, no el servidor entero.

**Restricción granular por tool → sí es posible**, contrario a lo que un primer fetch de la
documentación sugería de forma ambigua (ver §9). Confirmado con evidencia real: el dry run 2 de
`automation-reviewer` (§12) invocó `browser_navigate`/`snapshot`/`click`/`evaluate`/`close` y
reportó explícitamente que `browser_type`, `browser_fill_form`, `browser_select_option`,
`browser_wait_for` y `browser_navigate_back` **no** estaban en su toolset — la allowlist granular
por tool se sostiene en la práctica, no solo en el papel.

---

## 8. Version strategy

Verificado (no asumido) antes de decidir: `npm view @playwright/mcp version` →
**`0.0.80`** (mismo valor en `dist-tags.latest`). Es un paquete **pre-1.0**, sin garantía semver
de estabilidad entre releases (`0.0.x` puede romper cualquier cosa en cualquier release según la
propia convención semver).

**Decisión (con aprobación explícita del usuario vía pregunta directa, antes de tocar
`.mcp.json`): pinnear a `@playwright/mcp@0.0.80`.**

Motivo, revisitando la decisión de T17 (que mantuvo `@latest`): en T17 ningún agente dependía
todavía de nombres/schemas de tools concretos — la decisión de T17 fue correcta en su momento
("es la primera integración, sin uso real por ningún agente"). Ahora, con T18, `tools:` de
`automation-engineer.md` y `automation-reviewer.md` referencia nombres exactos de tool
(`mcp__playwright__browser_fill_form`, etc.) como parte de la arquitectura versionada del
repositorio: una actualización de Microsoft que renombrara o cambiara el schema de una de esas
tools rompería el frontmatter de los agentes sin que ningún commit de este repo lo explique.
Pinnear es exactamente lo que prioriza reproducibilidad del arquetipo sobre estar siempre en la
última versión — que era la propia condición que T17 dejó explícitamente abierta para revisitar
"cuando T18 le dé uso real a algún agente".

Cambio aplicado en `.mcp.json`:

```diff
-      "args": ["@playwright/mcp@latest"],
+      "args": ["@playwright/mcp@0.0.80"],
```

`claude mcp get playwright` confirmó **`✔ Connected`** con el pin aplicado (§13) — el pin no
rompió la conexión.

---

## 9. Configuration changes

Solo tres archivos, ninguno fuera de lo que la consigna autorizaba a tocar:

| Archivo | Cambio |
|---|---|
| `.mcp.json` | 1 línea: pin de versión `@latest` → `0.0.80` (aprobado explícitamente por el usuario antes de escribir, por ser infraestructura bajo `permissions.ask`) |
| `.claude/agents/automation-engineer.md` | `tools:` ampliado con 10 tools MCP; `mcpServers: [playwright]` agregado; nueva sección `## Playwright MCP` en el cuerpo |
| `.claude/agents/automation-reviewer.md` | `tools:` ampliado con 5 tools MCP; `mcpServers: [playwright]` agregado; nueva sección `## Playwright MCP` en el cuerpo |

`.claude/agents/qa-analyst.md` — **sin cambios** (§4). `.claude/settings.json` — sin cambios (no
hizo falta ninguna regla nueva de permisos para esta tarea). `CLAUDE.md`, guardrails
(`eslint.config.js`, `src/architecture.test.ts`, `tsconfig.json`, `cucumber.js`,
`package.json`), código productivo y `qa-automate/SKILL.md` — sin cambios.

---

## 10. Analyst dry run

**Input:** *"Necesitamos automatizar un botón cuyo comportamiento esperado no está
documentado."*

**Resultado:** `STATE: NEEDS_CONFIRMATION`. 5 `UNKNOWN [blocking]` (qué botón/pantalla, qué debe
pasar al hacer click, precondición de habilitación, si requiere autenticación, ambiente/URL) + 4
`[non-blocking]`. Solo 1 de los 5 escenarios candidatos (`S-1`, presencia/habilitación del botón)
queda no-bloqueado; los otros 4 quedan explícitamente marcados como bloqueados. El propio agente
declaró textualmente: *"soy analysis-only, sin MCP y sin ejecución"* y recomendó que, si hace
falta observar la aplicación real, eso le corresponde a una corrida separada — exactamente la
separación que exige `docs/ai-agent-architecture-plan.md` §11.

**Verificación de aislamiento MCP:** el agente no invocó ninguna tool `mcp__playwright__*` (no
las tiene en su `tools:`), no abrió browser, no navegó, y no infirió comportamiento observando
nada — todo lo que reportó como `UNKNOWN` siguió `UNKNOWN`.

**`ANALYST_MCP_ISOLATION = PASS`**

---

## 11. Engineer dry run

Se ejecutaron **dos corridas**. La primera (antes de agregar `mcpServers:`) reveló el hallazgo de
§2: el agente reportó explícitamente que no tenía ninguna tool MCP disponible en su toolset pese
a que su `tools:` ya las listaba, y se negó a inventar una observación que no pudo hacer — se
limitó a construir el plan solo con `EXISTING_CODE`. Esa negativa a fabricar evidencia es en sí
misma una señal correcta del diseño (§5 del prompt: "nunca escribas un selector [...] que no
puedas fundamentar"), aunque el objetivo de la tarea (probar el uso real de MCP) no se cumplió
todavía en esa corrida.

Tras agregar `mcpServers: [playwright]` (§2, §9) y confirmar con una prueba aislada que las tools
resolvían, se repitió el dry run completo:

**Input:** QA Analysis aprobada para el flujo de control `playwright.dev → Docs` (S-1), con
instrucción de usar MCP realmente antes de proponer el plan.

**Resultado:** `STATE: PLAN_PROPOSED`. `REUSE` identifica exactamente
`features/example/example.feature`, `features/steps/example.steps.ts`,
`ExamplePage.ts`, `ExampleNavigationComponent.ts`, `Pages.ts` (todo de T15) como cobertura
completa de S-1. `CREATE: none`, `MODIFY: none`, `PROTECTED INFRASTRUCTURE IMPACT: NONE`. El
ítem de `ExampleNavigationComponent.ts` lleva explícitamente:

```
SOURCE: MCP_OBSERVED — navegué a https://playwright.dev, snapshot de accesibilidad mostró
navigation "Main" [ref=e4] conteniendo link "Docs" [ref=e11] con /url: /docs/intro
```

**Tools MCP realmente invocadas:** `browser_navigate` → `browser_snapshot` → `browser_close` (no
usó `browser_click` — razonó correctamente que el snapshot ya alcanzaba para confirmar rol,
nombre accesible y `/url` sin necesidad de interactuar).

**Verificación de no-escritura:** `git status`/`git diff --stat` idénticos antes/después de la
corrida sobre los paths de S-1 (vacío) — el agente tiene `Edit`/`Write` disponibles y no los usó.
No se invocó `MODE: IMPLEMENT`.

**`ENGINEER_MCP_DRY_RUN = PASS`** (en la segunda corrida; la primera corrida documenta el
hallazgo real de §2, no un fallo del agente).

---

## 12. Reviewer dry run

Mismo patrón: dos corridas. La primera reveló el mismo hallazgo de resolución de tools
(`mcp__playwright__browser_navigate` → `"No such tool available"`) y, correctamente, el agente
sustituyó la verificación por una reproducción real con la librería `playwright` del propio
framework (sin escribir ningún archivo), dejándolo declarado en `NOT VERIFIED` en vez de fingir
que había usado MCP. Esa misma corrida encontró además tres findings reales sobre el propio
proceso de esta tarea (ver §16) — evidencia de que el Reviewer estaba genuinamente evaluando el
working tree real, no un ejercicio de juguete.

Tras el fix de `mcpServers:`, se repitió con el mismo flujo (S-1, ya implementado desde T15),
aclarando en el input que los 3 archivos de T18 (`.claude/agents/*.md`, `.mcp.json`) son cambios
de la tarea en curso, ya autorizados, y no parte del Plan/Report de S-1 bajo revisión.

**Resultado:** `VERDICT: APPROVED`, `FINDINGS: none`. Evidencia reproducida por el propio
Reviewer, no tomada del Implementation Report:

- `npm run quality` → exit 0, 61/23.
- `BASE_URL=https://playwright.dev npm test` y `npm run test:ui` → exit 0, 3/12 ambos.
- **Control negativo real**: `BASE_URL=https://example.com npm run test:ui` → exit 1, 3
  escenarios fallados — confirma que el assert no es verdadero por construcción.
- MCP real: `browser_navigate` → `browser_snapshot` (confirma `navigation "Main"` → `link "Docs"`
  → `/url: /docs/intro`) → `browser_click` (navega a `/docs/intro`) → `browser_navigate` de vuelta
  a home → `browser_evaluate` (confirma unicidad de ambos locators y que la URL de home NO
  contiene "docs", cerrando el círculo de que el assert discrimina de verdad) → `browser_close`.
- Checklist de 12 puntos completo, con el punto 10 evaluando los 3 archivos de T18 por separado
  del scope de S-1, tal como se le pidió — concluyó que ninguno relaja un guardrail (el pin de
  MCP es un *hardening*, no un aflojamiento) y dejó la autorización real del usuario en
  `NOT VERIFIED` en lugar de darla por buena solo porque el mensaje se lo afirmaba.

**Tools MCP realmente invocadas:** `browser_navigate` (×2), `browser_snapshot`, `browser_click`,
`browser_evaluate`, `browser_close`. **No invocadas** (no otorgadas): `browser_type`,
`browser_fill_form`, `browser_select_option`, `browser_wait_for`, `browser_navigate_back` — el
propio agente lo reportó explícitamente al final de su turno.

**`REVIEWER_MCP_DRY_RUN = PASS`**

---

## 13. Security

Sin cambios respecto a T17/T17.1/T17.2:

- Target único usado en todos los dry runs: `https://playwright.dev` (público, sin login).
- Ninguna credencial, token, cookie corporativa ni `storageState` fue usada o configurada.
- MCP sigue sin ser una security boundary (documentado desde T17, sin cambios en esta tarea).
- Ningún permiso nuevo a nivel global (`.claude/settings.json` no fue tocado).
- No se habilitaron capacidades del servidor más allá de las 15 tools concretas otorgadas entre
  los dos agentes (10 al Engineer, 5 al Reviewer, con solapamiento) — `browser_run_code_unsafe`
  (RCE-equivalent por su propia descripción) queda excluido de los dos, sin excepción.

---

## 14. Framework validation

| Check | Resultado |
|---|---|
| `npm run format:check` | ✅ PASS |
| `npm run quality` (typecheck && lint && format:check && test:unit) | ✅ **PASS**, exit 0 — **61 tests / 23 suites / 61 pass / 0 fail** |
| `claude plugin validate .claude/agents --strict --json` | ✅ `"success": true` (verificado dos veces: tras agregar las tools MCP, y tras agregar `mcpServers:`) |
| `claude mcp get playwright` | ✅ `Status: ✔ Connected`, `Args: @playwright/mcp@0.0.80` |
| `git status --short` (tras los 4 dry runs) | Solo 3 archivos: `.claude/agents/automation-engineer.md`, `.claude/agents/automation-reviewer.md`, `.mcp.json`. **Sin** `.playwright-mcp/` ni `.claude/settings.local.json` — la higiene de T17.2 sostuvo la carga real de los dry runs |
| `git diff --stat` | `3 files changed, 69 insertions(+), 3 deletions(-)` |
| E2E completo | No se re-ejecutó fuera de lo que corrió el propio Reviewer en su dry run (§12: `npm test`/`test:ui` PASS 3/12 dos veces) — no hizo falta más, ningún agente alteró código productivo en esta tarea |

---

## 15. Files modified

Ver tabla completa en §9. Resumen: `.mcp.json`, `.claude/agents/automation-engineer.md`,
`.claude/agents/automation-reviewer.md`, más este documento
(`docs/refactor-progress-ia/T18-agent-mcp-integration.md`, nuevo). Cero archivos de código
productivo, cero cambios en `qa-analyst.md`, cero cambios en `qa-automate/SKILL.md`.

---

## 16. Limitations

1. **La documentación oficial no deja explícito, en un solo lugar, que `mcpServers:` sea
   obligatorio además de `tools:` para un servidor ya project-scoped.** Se verificó
   empíricamente (§2, §11, §12): sin `mcpServers:`, las tools `mcp__playwright__*` listadas en
   `tools:` no resuelven ("No such tool available"), aun con el servidor `✔ Connected` a nivel de
   sesión. Con `mcpServers: [playwright]` agregado (referenciando el servidor por nombre, sin
   redefinirlo), resolvió de inmediato, **sin restart** — la próxima integración de un MCP
   project-scoped con un subagente debería asumir este requisito de entrada, no redescubrirlo.
2. **La primera corrida de cada dry run "gastó" una invocación real** antes de que el hallazgo de
   §16.1 quedara resuelto — documentado como parte del proceso (§11, §12) en vez de ocultado,
   porque en sí mismo confirma que ambos agentes se niegan a fabricar una observación MCP que no
   pudieron hacer (comportamiento correcto, no un fallo).
3. **El Reviewer, en su primera corrida, encontró 3 findings reales sobre el propio proceso de
   esta tarea** (un Implementation Report de prueba que afirmaba `GIT: sin cambios` cuando el
   working tree sí tenía cambios de T18, y dos archivos `.claude/**` modificados sin un
   Implementation Report que declarara autorización) — no es un defecto de la arquitectura de
   agentes: es evidencia de que el checklist funciona, y de que un dry run con un Implementation
   Report artesanal necesita ser preciso sobre el estado real del working tree o el Reviewer lo
   marca, correctamente, como inconsistente.
4. **No hay forma, desde esta sesión, de confirmar que el proceso MCP que sirvió cada llamada
   arrancó realmente desde el binario `0.0.80` pinneado** — el propio Reviewer lo dejó en
   `NOT VERIFIED` en su segunda corrida: las llamadas funcionaron, lo cual prueba que el servidor
   está operativo, no qué cadena de versión lo produjo. Mismo tipo de limitación de introspección
   ya documentado en T13.1 §9 para atribución de modelo.
5. **Solo 6 de las 10 tools otorgadas al Engineer y 5 de 5 otorgadas al Reviewer se ejercitaron
   en runtime** (`browser_navigate`, `browser_navigate_back` no se ejercitó, `browser_snapshot`,
   `browser_click`, `browser_type`/`browser_fill_form`/`browser_select_option`/`browser_wait_for`
   no se ejercitaron por el Engineer — el flujo de control no las necesitó —, `browser_evaluate`,
   `browser_close`). Las tools de formulario del Engineer quedan sin verificación de runtime
   hasta que un escenario real las necesite (T19+).
6. **La atribución de autorización del usuario para tocar `.claude/**` sigue siendo contractual +
   review-enforced (Tier 2), no técnica** — sin cambios respecto de T13/T13.1. El Reviewer lo
   señaló correctamente en su propio `NOT VERIFIED` de la segunda corrida: puede verificar que el
   *contenido* no relaja nada, pero no puede verificar la *autorización* en sí, que vive fuera del
   repo (en esta conversación).

Ninguna de estas limitaciones bloquea el uso normal de los tres agentes tras esta tarea.

---

## 17. Resultado

| Criterio | Resultado |
|---|---|
| `qa-analyst` sin Playwright MCP | ✅ PASS — sin cambios de frontmatter, `ANALYST_MCP_ISOLATION = PASS` |
| `automation-engineer` con MCP real disponible | ✅ PASS — 10 tools otorgadas, `mcpServers: [playwright]`, dry run 2 con uso real (`navigate`/`snapshot`/`close`) |
| `automation-reviewer` con MCP real disponible (allowlist limitada) | ✅ PASS — 5 tools otorgadas (subset del Engineer), dry run 2 con uso real (`navigate`/`snapshot`/`click`/`evaluate`/`close`), `VERDICT: APPROVED` |
| Repo sin archivos modificados por los dry runs | ✅ confirmado — `git status --short` solo muestra los 3 archivos de configuración de esta tarea, ninguno tocado por ningún dry run |
| MCP artifacts ignorados correctamente | ✅ confirmado — `.playwright-mcp/` generado por los dry runs (snapshots reales) no aparece en `git status` |
| `npm run quality` | ✅ **PASS 61/61**, exit 0 |
| `claude mcp get playwright` | ✅ `Connected`, con la versión pinneada `0.0.80` |

**T18: COMPLETED.** Los tres agentes tienen exactamente el acceso MCP que la arquitectura
aprobada define, verificado con dry runs reales (no solo frontmatter), sin ninguna automatización
de negocio nueva, sin tocar código productivo, y con la version strategy revisitada y decidida
con aprobación explícita del usuario.

---

## 18. Aprendizaje técnico

1. **Verificar en runtime, no solo en frontmatter, sigue siendo la única prueba que cuenta.**
   `claude plugin validate --strict` dio `success: true` en ambas corridas — antes y después de
   agregar `mcpServers:` — porque el frontmatter era sintácticamente válido en los dos casos. La
   validación estática no habría detectado nunca el hallazgo real de §16.1; solo una invocación
   real del agente lo reveló.
2. **Un agente que se niega a fabricar una observación que no pudo hacer es la señal de diseño
   funcionando, no un fallo de la tarea.** Tanto `automation-engineer` como `automation-reviewer`,
   en su primera corrida (sin `mcpServers:` todavía), tenían dos caminos: fingir un
   `browser_snapshot` plausible, o declarar honestamente que la tool no estaba disponible y
   trabajar con lo que sí podían fundamentar. Los dos tomaron el segundo camino sin que se los
   pidiera explícitamente — coherente con la disciplina de fuente que sus propios prompts ya
   exigían desde antes de esta tarea.
3. **Dar contexto explícito sobre "ruido" ajeno al scope evita un falso negativo del Reviewer sin
   debilitar su independencia.** En la segunda corrida del Reviewer se le aclaró, en el propio
   mensaje de invocación, que 3 archivos del working tree pertenecían a otra tarea (T18) ya
   autorizada y no al Plan de S-1 bajo revisión. El Reviewer igual auditó esos 3 archivos por su
   cuenta (no confió ciegamente en la aclaración) y concluyó de forma independiente que no
   relajaban nada — la aclaración evitó un `CHANGES_REQUESTED` por ruido, sin evitar el escrutinio
   real.
4. **Un paquete `0.0.x` deja de ser un detalle de infraestructura en cuanto un agente depende de
   sus nombres de tool.** La razón para no pinnear en T17 (sin uso real todavía) y la razón para
   pinnear en T18 (uso real por dos agentes, con nombres de tool en su frontmatter versionado) son
   la misma pregunta — "¿algo en este repo depende de que esta forma no cambie?" — con una
   respuesta distinta según el momento. Revisitar la decisión cuando cambian las condiciones, en
   vez de mantenerla por inercia, es lo que la propia T17 dejó pedido explícitamente.

---

## 19. Próxima tarea

**T19 — Primer flujo `qa-automate` completo usando Playwright MCP durante planning/review.** No
ejecutada en esta sesión. Deberá decidir, con un requerimiento de negocio real (no un flujo de
control como `playwright.dev → Docs`), si las 10/5 tools otorgadas en T18 alcanzan o si aparece
una necesidad real de ampliar la allowlist de alguno de los dos agentes.
