# T17 — Playwright MCP Integration

**Estado:** ✅ COMPLETED — configuración completa y runtime validation ejecutada y
verificada en **T17.1** (`docs/refactor-progress-ia/T17.1-mcp-runtime-validation.md`),
tras reinicio de sesión y aprobación interactiva del usuario. Se preserva íntegramente
la historia original de este documento (§7-10 fueron reemplazados con evidencia real;
el resto de las secciones documenta la configuración inicial, sin cambios).

## 1. Objetivo

Instalar y registrar Playwright MCP (Microsoft) en este repo, con scope `project`, sin
darle acceso todavía a ningún agente especializado (`qa-analyst`, `automation-engineer`,
`automation-reviewer` — eso es T18) y sin crear ninguna automatización nueva ni tocar
código productivo. Validar en runtime, desde la sesión principal únicamente, un flujo de
browser controlado (`playwright.dev` → heading → nav → "Docs" → click → URL contiene
"docs") y comparar lo observado contra lo que ya usa `features/example/**`.

## 2. Versiones

| Componente | Versión |
|---|---|
| Claude Code instalado | `2.1.263` (`claude --version`) |
| Node.js requerido por Playwright MCP | `>=18` (repo ya exige `>=24.12` en `package.json`, lo excede) |
| `@playwright/mcp` | `@latest` (ver §6 — decisión documentada, no pinneada) |
| `@playwright/test` / `playwright` del framework | `1.58.0` (sin cambios, `package.json` no tocado) |

## 3. Documentación oficial verificada

Verificado por fetch directo (no citado de memoria, no aceptado de segunda mano):

- `https://code.claude.com/docs/en/mcp.md` — sintaxis de `claude mcp add`, scopes,
  persistencia, aprobación de servidores project-scoped.
- `https://raw.githubusercontent.com/microsoft/playwright-mcp/main/README.md` — comando
  de instalación para Claude Code, opciones de configuración y sus defaults, notas de
  seguridad y persistencia de sesión.

Hallazgos clave citados textualmente:

> "Project-scoped servers enable team collaboration by storing configurations in a
> `.mcp.json` file at your project's root directory. When you add a project-scoped
> server, Claude Code automatically creates or updates this file... Check `.mcp.json`
> into version control so everyone on your team gets the same MCP tools."

> "For security reasons, Claude Code prompts for approval in interactive sessions
> before using project-scoped servers from `.mcp.json` files... Run `claude`
> interactively to review and approve it."

> Playwright MCP, sección "Claude Code": `claude mcp add playwright npx
> @playwright/mcp@latest`

> "Playwright MCP is **not** a security boundary." — persistent profile por defecto
> (no `--isolated`), `storageState` persiste entre sesiones si se usa `--isolated` +
> `--storage-state` (no configurado en esta tarea).

## 4. Scope seleccionado

**`project`** — confirmado empíricamente (no solo por documentación) que persiste en
`.mcp.json` en la raíz del repo: el comando `claude mcp add --scope project ...`
efectivamente creó ese archivo en este working tree.

Razón (según consigna, confirmada): Playwright MCP es una capacidad del arquetipo, no
una preferencia personal de esta PC — `local`/`user` viven en `~/.claude.json`, fuera
del control de versiones del repo, y no serían compartidos con el equipo.

Precedencia verificada (documentación oficial): si el mismo nombre existiera también en
`local` o `user`, esos scopes ganan sobre `project` sin merge de campos — no aplica hoy
porque no existe ningún servidor `playwright` en otro scope.

## 5. Configuración

Comando ejecutado (sintaxis verificada contra la documentación oficial antes de
correrlo, no copiada a ciegas del ejemplo simplificado del README de Playwright MCP,
que omite `--scope` y `--transport`):

```bash
claude mcp add --scope project --transport stdio playwright -- npx @playwright/mcp@latest
```

Archivo generado, `.mcp.json` (raíz del repo), reformateado con Prettier tras la
generación automática (ver §13 — hallazgo real, mismo patrón que T13.1 con
`settings.json`):

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest"],
      "env": {}
    }
  }
}
```

Confirmado vía `claude mcp list` / `claude mcp get playwright`:

```
playwright:
  Scope: Project config (shared via .mcp.json)
  Status: ⏸ Pending approval (run `claude` to approve)
  Type: stdio
  Command: npx
  Args: @playwright/mcp@latest
  Environment:
```

## 6. Version strategy

**`@latest`, sin pinnear.** Evaluado explícitamente:

| | `@latest` | Versión pinneada explícita |
|---|---|---|
| Pro | Es literalmente el comando que documenta el propio README oficial de Playwright MCP para Claude Code; onboarding de un QA nuevo funciona copiando la única línea documentada | Reproducibilidad exacta entre máquinas/CI |
| Contra | Una actualización de Microsoft puede cambiar comportamiento/capacidades sin aviso entre sesiones | Mantenimiento manual de un número de versión en un archivo que Claude Code regenera automáticamente (`claude mcp add`/`edit` no ofrecen un flag propio de pin de versión de paquete npm — el `@x.y.z` iría dentro del string de `args`, editable a mano) |

Decisión: mantener `@latest`, según lo que la propia consigna autorizaba ("si la
documentación oficial recomienda `@latest` y no existe razón suficiente para pinnear,
puede mantenerse"). No se encontró una razón de reproducibilidad que hoy supere el costo
de mantenimiento manual, dado que T17 es la primera integración (sin uso real todavía
por ningún agente) y no hay CI que dependa de este MCP. Revisitar esta decisión queda
abierto para cuando T18 le dé uso real a algún agente.

## 7. Runtime connection

**RESUELTO en T17.1.** Tras el reinicio de sesión y la aprobación interactiva del
usuario, `claude mcp get playwright` reporta:

```
playwright:
  Scope: Project config (shared via .mcp.json)
  Status: ✔ Connected
  Type: stdio
  Command: npx
  Args: @playwright/mcp@latest
```

Confirmado además, no solo por el status textual, **cargando y ejecutando** las tools
reales (`ToolSearch` sobre los nombres `mcp__playwright__*` devolvió sus JSONSchema
completos, y se invocaron con éxito `browser_navigate`, `browser_snapshot`,
`browser_click`, `browser_evaluate`, `browser_close` contra un sitio real — ver
§8-9 y el detalle completo en **T17.1**).

Evidencia adicional del lado de la aprobación: el archivo `.claude/settings.local.json`
(no versionado — ignorado por el gitignore global del usuario,
`enabledMcpjsonServers: ["playwright"]`) quedó creado como resultado directo de esa
aprobación interactiva.

## 8. Browser test

**EJECUTADO en T17.1**, exclusivamente vía Playwright MCP (no vía Cucumber), contra
`https://playwright.dev`:

1. `browser_navigate` → carga real confirmada (Page URL/Title dinámicos).
2. `browser_snapshot` → accessibility tree capturado.
3. Heading principal identificado (`level=1`, contiene "Playwright").
4. Navegación principal identificada (`navigation "Main"`).
5. Link "Docs" identificado dentro de esa navegación (`/docs/intro`).
6. `browser_click` sobre ese link → navegación real.
7. URL final observada: `https://playwright.dev/docs/intro`.
8. Contiene `docs` → **PASS**.

Detalle completo, evidencia cruda y capacidades usadas: **T17.1**, §4 y §6.

## 9. Accessibility snapshot

**EJECUTADO en T17.1.** Resumen (snapshot completo no reproducido acá, ver T17.1 §5):

- `heading [level=1]`: "Playwright enables reliable web automation for testing,
  scripting, and AI agents." (contiene "Playwright").
- `navigation "Main"`: presente, agrupa logo, Docs, MCP, CLI, API, botón de versión.
- `link "Docs"`: dentro de esa navegación, `/url: /docs/intro`.
- `link "Get started"`: presente y visible en el hero.

## 10. Comparison with framework

**EJECUTADO en T17.1** contra `ExamplePage.ts` / `ExampleNavigationComponent.ts` y el
escenario de T15 (`features/example/example.feature`). Resultado: **MATCH** en las
cuatro dimensiones evaluadas (heading, navigation, Docs link, destino con "docs").
Detalle completo con justificación por cada dimensión: **T17.1**, §7.

## 11. Security boundaries

Documentado por fuente oficial (§3), sin ejecución real que lo ejercite todavía:

- No se usaron credenciales, tokens, cookies reales, cuentas corporativas ni datos
  sensibles — el único target previsto es `https://playwright.dev`, público.
- **No se configuró `--isolated` ni `--storage-state`** — el comando de instalación
  usado (§5) es exactamente el oficial, sin flags adicionales. Por diseño de Playwright
  MCP, el modo por defecto es **perfil persistente** (no aislado): la doc dice
  explícitamente *"Playwright MCP is not a security boundary"* y que sin `--isolated`
  el navegador usa un directorio de perfil persistente en disco entre sesiones. Esto es
  el comportamiento **por defecto de la herramienta**, aceptado explícitamente por la
  consigna ("no habilitar persistencia... salvo que MCP lo haga por defecto y sea
  necesario explicar su comportamiento") — se documenta acá, no se intentó evitar con
  flags no pedidos.
- Como el target de toda prueba prevista es un sitio público sin login
  (`playwright.dev`), el riesgo práctico de ese perfil persistente es bajo, pero queda
  registrado como comportamiento real, no ocultado.

## 12. Relationship with Playwright framework

Confirmado por diseño y por evidencia de `package.json` (§13): Playwright MCP es un
proceso externo (`npx @playwright/mcp@latest`, transporte `stdio`) que Claude Code
invoca como herramienta — **no reemplaza** `@playwright/test` (usado en el repo solo
para `expect`/tipos, nunca como runner), `playwright` como librería, Cucumber, el
`BrowserContext` que maneja `support/world.ts`/`CustomWorld`, ni `npm test`. Descarga y
gestiona su **propio** browser (Chromium por defecto), independiente de la instalación
`playwright@1.58.0` que ya usa el framework — no la reutiliza ni depende de ella.

`package.json` **no fue modificado**: no se agregó `@playwright/mcp` como
`dependency`/`devDependency` (§13, confirmado por `git diff --stat`). El framework de
testing sigue funcionando exactamente igual con o sin MCP disponible.

## 13. Framework validation

| Check | Resultado |
|---|---|
| `node -e "JSON.parse(...)"` sobre `.claude/settings.json` y `.mcp.json` | ✅ ambos JSON válidos |
| `npm run format:check` (antes de corregir) | ❌ FAIL — `.mcp.json` autogenerado por `claude mcp add` no respeta el estilo Prettier del repo (mismo patrón que T13.1 con `settings.json`) |
| `npx prettier --write .mcp.json` + re-check | ✅ corregido, sin cambio semántico |
| `npm run quality` (final) | ✅ **PASS** — `tsc --noEmit` OK, `eslint` OK, `format:check` OK, `test:unit` **61/61 tests, 23/23 suites** |
| `BASE_URL=https://playwright.dev npm test` | ✅ **PASS** — **3 scenarios (3 passed), 12 steps (12 passed)** — mismo resultado que al cierre de T15/T16, sin ninguna alteración por la presencia de MCP (que ni siquiera está conectado en esta sesión) |
| `git diff --stat -- package.json package-lock.json` | vacío — sin cambios |

## 14. Files created/modified

| Archivo | Estado | Motivo |
|---|---|---|
| `.mcp.json` | **NUEVO** | Generado por `claude mcp add --scope project`; reformateado con Prettier |
| `.claude/settings.json` | **MODIFICADO** | 1 regla nueva en `permissions.ask`: `Edit(/.mcp.json)` — `.mcp.json` es infraestructura protegida desde ahora, según lo confirmado en §3/§4: define qué herramientas externas tiene disponibles Claude |
| `docs/refactor-progress-ia/T17-playwright-mcp.md` | **NUEVO** | Este registro |

Cero cambios en `package.json`, `package-lock.json`, código productivo, o cualquier
agente (`qa-analyst.md`, `automation-engineer.md`, `automation-reviewer.md` intactos,
confirmado por no aparecer en `git status`).

## 15. Limitations

Historia original de esta sección (T17, antes de la validación runtime), preservada:
en ese momento el servidor quedó en `Pending approval` y la validación runtime no
pudo ejecutarse desde código — requería una sesión interactiva nueva del usuario.
Esa limitación quedó **resuelta en T17.1** (§7 arriba). Limitaciones vigentes hoy,
tras la ejecución real:

1. **Sin prueba empírica de la sintaxis exacta combinando `--scope project` +
   `--transport stdio` + `--`** contra un ejemplo oficial idéntico — la documentación
   de Claude Code no publica ese ejemplo combinado exacto (solo por separado); se
   combinó por inferencia de las reglas documentadas, y se validó empíricamente que
   funcionó (creó `.mcp.json` correctamente) — así que quedó confirmado por resultado,
   no solo por inferencia.
2. **Version strategy (`@latest`) no revisitada con evidencia de uso real por un
   agente** — T17.1 valida el MCP desde la sesión principal, no desde
   `automation-engineer`/`automation-reviewer`; T18 podría cambiar el cálculo de
   costo/beneficio de pinnear versión.
3. **Perfil persistente por defecto** (§11) — confirmado que el navegador de MCP
   corrió sin `--isolated`, pero no se ejecutaron dos sesiones separadas para probar
   en la práctica que el perfil efectivamente persiste datos entre ellas; sigue siendo
   riesgo bajo dado que el único target usado fue `https://playwright.dev` (público).
4. **Detección de headless por user-agent no es concluyente** — Chrome moderno en modo
   `headless=new` deliberadamente omite el string `HeadlessChrome` del user-agent para
   parecerse al modo headed; ver T17.1 §8 para el detalle de qué quedó DOCUMENTED vs
   OBSERVED.
5. ~~**Artefacto de sesión detectado y descartado**: `browser_snapshot`/
   `browser_navigate` de esta versión de Playwright MCP guardan automáticamente un
   archivo `.playwright-mcp/page-*.yml` en cada captura (aun sin pasar el parámetro
   opcional `filename`). Es un directorio no trackeado y sin entrada en `.gitignore`/
   `.prettierignore`; se eliminó manualmente después de cada prueba en esta sesión
   para no dejar fixtures temporales en el repo.~~ — **resuelto en T17.2**:
   `.playwright-mcp/` se agregó al `.gitignore` del repo, ya no requiere borrado
   manual ni depende de configuración personal de la máquina. Ver
   `T17.2-mcp-artifacts-hygiene.md`.
6. ~~**Hallazgo lateral fuera de scope, no corregido**: `.claude/settings.local.json`
   (creado por la aprobación interactiva del MCP, ignorado por el gitignore global del
   usuario, no trackeado por git) hace fallar `npm run format:check` porque no está
   cubierto por `.prettierignore`.~~ — **resuelto en T17.2**: se agregó
   `.claude/settings.local.json` al `.gitignore` del repo (no se tocó su contenido, no
   se lo borró — sigue existiendo, ahora simplemente ignorado también a nivel repo, no
   solo por el gitignore global personal del usuario). Prettier 3.x respeta
   `.gitignore` automáticamente, así que no hizo falta tocar `.prettierignore`. Ver
   `T17.2-mcp-artifacts-hygiene.md`.

## 16. Resultado

| Criterio | Resultado |
|---|---|
| Playwright MCP → registrado correctamente | ✅ PASS (`.mcp.json`, `claude mcp get playwright` lo confirma) |
| Scope → project | ✅ PASS |
| Runtime connection (T17.1) | ✅ PASS — `Status: ✔ Connected`, tools cargadas e invocadas realmente |
| Browser interaction (T17.1) | ✅ PASS — navigate + click reales contra `playwright.dev` |
| Accessibility snapshot (T17.1) | ✅ PASS — heading, navigation, link Docs identificados |
| Docs navigation (T17.1) | ✅ PASS — URL final `https://playwright.dev/docs/intro` contiene `docs` |
| Comparación MCP vs framework (T17.1) | ✅ MATCH en las 4 dimensiones evaluadas |
| Framework sigue funcionando sin depender del MCP | ✅ PASS |
| `npm run quality` (encadenado, punta a punta) | ✅ PASS (61/61, 23/23 suites) — resuelto en **T17.2** (`.claude/settings.local.json` y `.playwright-mcp/` agregados a `.gitignore`; en T17.1 el encadenado tropezaba en `format:check` por esos mismos paths, ver §15.5/§15.6) |
| E2E (`BASE_URL=https://playwright.dev npm test`) | ✅ PASS (3/3, 12/12) |

**T17: COMPLETED.** La configuración, el enforcement de infraestructura protegida, la
validación runtime (T17.1) y la higiene de artefactos locales (T17.2) están cerrados
con evidencia real. Próximo paso: **T18** (no ejecutada en esta sesión).

## 17. Aprendizaje técnico

- El comando simplificado que publica el propio README de Playwright MCP
  (`claude mcp add playwright npx @playwright/mcp@latest`) omite tanto `--scope`
  (default `local`) como el separador `--` — copiarlo literalmente habría dejado el
  servidor en scope `local` (`~/.claude.json`, no versionado), contradiciendo el
  objetivo explícito de esta tarea. Verificar contra la documentación general de
  `claude mcp add` antes de ejecutar el comando (en vez de confiar en el ejemplo más
  simple de un README de terceros) fue lo que evitó ese resultado incorrecto.
- Un servidor MCP project-scoped no queda operativo en la misma sesión donde se lo
  registra — el flujo de aprobación de confianza está atado al arranque de una sesión
  interactiva, no a la creación del archivo. Esto es una limitación de diseño real (no
  un error de esta tarea) y hay que anticiparla en cualquier instalación futura de MCP
  a nivel de proyecto: instalar y validar en runtime casi nunca son el mismo paso.
- El archivo autogenerado por `claude mcp add` no respeta el estilo Prettier del repo
  — tercera vez que esto ocurre en esta serie de tareas (T13.1 con `settings.json`,
  ahora con `.mcp.json`), lo que sugiere que cualquier archivo de configuración que
  Claude Code genere automáticamente en este repo debería revisarse por
  `format:check` como paso reflejo, no como sorpresa.

## 18. Próxima tarea

**T17.1 completada** — aprobación del servidor `playwright` MCP y runtime validation
(§7-10) ejecutadas con evidencia real. Registro completo en
`docs/refactor-progress-ia/T17.1-mcp-runtime-validation.md`.

**T18** — Integrar Playwright MCP con `automation-engineer` y `automation-reviewer`.
**No ejecutada en esta sesión** (explícitamente fuera de scope de T17.1).
