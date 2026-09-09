# Project Knowledge Map

Índice de navegación del repositorio. **No repite contenido** — dice dónde está cada cosa y, sobre
todo, **cuál es su estatus**:

| Estatus | Significado |
|---|---|
| **CURRENT** | Refleja el estado vigente del proyecto. Se actualiza cuando el proyecto cambia |
| **OPERATIVE** | Gobierna cómo se trabaja hoy. Si contradice al código, gana el código |
| **HISTORICAL** | Registro fechado de una decisión ya tomada. **No** es documentación operativa |

**Estructura de `docs/`:**

```text
docs/
├── SDET-PLAYBOOK.md                         CURRENT
├── PROJECT-KNOWLEDGE-MAP.md                 CURRENT
├── GPT-DECISION-ADVISOR.md                  CURRENT
├── ai-automation-archetype-final-readiness.md CURRENT
├── history/                                 HISTORICAL
├── refactor-progress/                       HISTORICAL
└── refactor-progress-ia/                    HISTORICAL
```

Los tres archivos sueltos en la raíz de `docs/` son el estado vigente. Todo lo que vive bajo un
directorio (`history/`, `refactor-progress/`, `refactor-progress-ia/`) es un registro histórico.

---

## Start Here

| Archivo | Estatus | Para qué |
|---|---|---|
| [`README.md`](../README.md) | OPERATIVE | Uso, setup, comandos, tags, tabla de guardrails con su alcance, workflow AI-assisted |
| [`docs/SDET-PLAYBOOK.md`](./SDET-PLAYBOOK.md) | CURRENT | **La guía de estudio.** 36 secciones: qué es cada cosa, cómo está implementada acá, por qué se diseñó así, qué error evita, y cómo explicarla en una entrevista |
| [`GPT-DECISION-ADVISOR.md`](./GPT-DECISION-ADVISOR.md) | CURRENT | Contexto maestro para usar GPT como segundo par de ojos al evaluar Gate 1, Gate 2, Automation Plans, Reviewer findings y decisiones de arquitectura |
| [`CLAUDE.md`](../CLAUDE.md) | OPERATIVE | Contrato operativo: arquitectura, límites por capa, qué está machine-enforced y qué no, infraestructura protegida, Definition of Done |
| [`AGENTS.md`](../AGENTS.md) | OPERATIVE | Mapa de arquitectura para contribuidores y asistentes: qué leer antes de tocar código |

**Orden sugerido para alguien que entra al repo:** `README.md` → `SDET-PLAYBOOK.md` §1–§8 →
`CLAUDE.md` → el código.

---

## Current State

| Archivo | Estatus | Qué contiene |
|---|---|---|
| [`docs/ai-automation-archetype-final-readiness.md`](./ai-automation-archetype-final-readiness.md) | **CURRENT** | **El estado vigente.** `FINAL VERDICT: READY`, qué está machine-enforced, qué no, findings abiertos con su fundamento, y la capa de IA |

Empezá por acá si la pregunta es *"¿en qué estado está esto hoy?"*.

---

## Architecture

| Path | Qué es |
|---|---|
| `src/base/BaseUiObject.ts` | Raíz de la jerarquía UI: 17 métodos sobre `Locator` (esperas, acciones, getters, asserts). Dueño de `protected page` |
| `src/pages/base/BasePage.ts` | Rama de página completa: `goto`, `reload`, `waitForUrlContains` |
| `src/components/base/BaseComponent.ts` | Rama de región: agrega `protected root: Locator`. **Contrato vigente, sin Component concreto hoy** |
| `support/world.ts` | `CustomWorld`: estado por escenario + `init()`/`close()`. Único `setWorldConstructor` del repo |
| `support/hooks.ts` | `Before`/`After` (World) y `BeforeAll`/`AfterAll` (DB) |
| `support/AGENTS-support.md` | Detalle de World, hooks y ciclo de vida de DB |
| `src/config/index.ts` | Único dueño de `process.env`. Exporta `config` y `requireSauceDemoBaseUrl()` |
| `tsconfig.json` | `strict: true`; `include` = `src/**`, `features/**`, `support/**` |
| `cucumber.js` | Perfil de Cucumber: paths, imports, loader `ts-node/esm`, formatters |
| `package.json` | Scripts (`quality`, `test*`), `engines.node >= 24.12`, dependencias |

**Guardrails:**

| Path | Qué verifica |
|---|---|
| `eslint.config.js` | `G1`–`G8`: runner único, `waitForTimeout`, `process.env`, `oracledb`, límites del Step |
| `src/architecture.test.ts` | 11 invariantes (`A1`–`A12` menos `A8`) sobre el repositorio completo, vía AST y filesystem |

→ Explicación completa: Playbook §2, §8, §13, §14, §15.

---

## UI Automation

| Path | Qué es |
|---|---|
| `features/sauceDemo/checkout.feature` | **Canonical UI example.** 2 escenarios (`@ui @regression`, uno `@smoke`) |
| `features/steps/sauceDemo/checkout.steps.ts` | 14 steps, solo `this.pages`, cero imports de Playwright |
| `src/pages/sauceDemo/*.ts` | 6 Pages, una por pantalla real, todas `extends BasePage` |
| `src/pageContainer/Pages.ts` | Compone las 6 Pages; se instancia en `CustomWorld.init()` |
| `src/components/` | Solo `base/BaseComponent.ts` — **no hay Component concreto** |

Las 6 Pages: `SauceDemoLoginPage`, `SauceDemoInventoryPage`, `SauceDemoCartPage`,
`SauceDemoCheckoutInfoPage`, `SauceDemoCheckoutOverviewPage`, `SauceDemoCheckoutCompletePage`.

→ Explicación completa: Playbook §3, §6, §7, §18.

---

## Database

| Path | Qué es |
|---|---|
| `src/database/AGENTS-database.md` | Documento profundo de la capa: Oracle, repositories, QueryBuilder |
| `src/database/RepositoryContainer.ts` | Composición; recibe un `DatabaseClient` ya construido |
| `src/database/repositories/BaseRepository.ts` | `execute`/`select`/`insert`/`update`/`delete` — todos `protected` |
| `src/database/repositories/example/ExampleRepository.ts` | **Ejemplo del patrón DB.** `EXAMPLE_ITEMS` es un contrato de demostración, nunca creado ni poblado |
| `src/database/builders/QueryBuilder.ts` | SQL seguro: binds para valores, regex + allowlist para identificadores |
| `src/database/builders/QueryBuilder.test.ts` | 31 unit tests del modelo de seguridad |
| `src/database/clients/DatabaseClient.ts` | Contrato agnóstico del motor: `execute` y `close` |
| `src/database/clients/OracleDatabaseClient.ts` | Única implementación real; **único archivo que puede tocar `oracledb`** |
| `support/databaseLifecycle.ts` | Único dueño del client compartido; import dinámico bajo `DB_ENABLED` |

> **No confundir los dos ejemplos del repo:** SauceDemo es el ejemplo canónico de **UI**;
> `ExampleRepository` es el ejemplo del patrón de **base de datos**. Son ejemplos de cosas distintas.

→ Explicación completa: Playbook §10, §11, §12.

---

## CI

| Path | Qué es |
|---|---|
| `.github/workflows/ci.yml` | "QA Automation CI": push · PR · manual → checkout → Node 24 → `npm ci` → Chromium → `npm run quality` → `npm test` → artifact `cucumber-reports` |

Detalles que importan: `permissions: contents: read`, `timeout-minutes: 15`, `DB_ENABLED=false`,
`SAUCEDEMO_BASE_URL` explícito, artifact con `if: always()`, **cero secretos**.

Este repo implementa **CI, no CD**.

→ Explicación completa: Playbook §16, §17.

---

## AI Workflow

| Path | Qué es |
|---|---|
| `.claude/skills/qa-automate/SKILL.md` | Orquestación del pipeline completo, con los dos gates humanos |
| `.claude/agents/qa-analyst.md` | Requerimiento → escenarios → `UNKNOWN`. Sin write, sin shell, **sin MCP** |
| `.claude/agents/automation-engineer.md` | Único con write. `MODE: PLAN` (propone) / `MODE: IMPLEMENT` (escribe). **MCP: 10 tools** |
| `.claude/agents/automation-reviewer.md` | Review independiente read-only, checklist de 12 puntos. **MCP: 5 tools** |
| `.claude/settings.json` | Modelo de permisos: 20 reglas `ask` + `deny: ["Read(/.env)"]` |
| `.mcp.json` | Servidor MCP project-scoped: `@playwright/mcp@0.0.80` |
| `CLAUDE.md` §17 | Resumen operativo de esta capa dentro del contrato |
| `docs/GPT-DECISION-ADVISOR.md` | Segundo par de ojos para decisiones humanas: Gate 1, Gate 2, Automation Plans, Reviewer findings y arquitectura |

→ Explicación completa: Playbook §19–§24.

---

## Final Audits

| Archivo | Estatus | Qué es |
|---|---|---|
| [`docs/history/ai-automation-archetype-final-audit.md`](./history/ai-automation-archetype-final-audit.md) | HISTORICAL | Auditoría adversarial completa de la Fase 2. 16/16 guardrails atacados, gaps revalidados, dry runs vivos. Cerró en `CONDITIONALLY READY` |
| [`docs/refactor-progress-ia/T20-final-phase2-audit.md`](./refactor-progress-ia/T20-final-phase2-audit.md) | HISTORICAL | Registro de esa auditoría |
| [`docs/refactor-progress-ia/T20.1-contract-coherence.md`](./refactor-progress-ia/T20.1-contract-coherence.md) | HISTORICAL | La corrección de coherencia del contrato: cerró `H-01`, `M-01`, `M-02`, `M-04` |
| [`docs/ai-automation-archetype-final-readiness.md`](./ai-automation-archetype-final-readiness.md) | **CURRENT** | El estado vigente: `READY` |

> Los dos documentos de T20 **conservan a propósito** el veredicto `CONDITIONALLY READY` que
> encontraron **antes** de la corrección. Muestran el problema tal como se detectó; el readiness
> muestra el estado después. Los tres juntos son la evidencia de la auditoría.

---

## Historical Decision Records

`docs/refactor-progress/**` y `docs/refactor-progress-ia/**` son **historical engineering records /
decision evidence**. Sirven para responder *por qué* se tomó una decisión, qué problema existía
antes, cómo se validó y qué trade-off se aceptó.

**No son documentación operativa primaria.** Ante cualquier discrepancia, la jerarquía es:

```text
código  >  README.md · CLAUDE.md · AGENTS.md · Final Readiness  >  registros históricos
```

Un registro fechado describe lo que era cierto **ese día**. Varios contienen números y afirmaciones
que después cambiaron (por ejemplo `61 tests`, hoy 62) — y está bien: son fotos, no espejos.

### `docs/refactor-progress-ia/` — Fase 2 (AI foundation)

| Bloque | Tema |
|---|---|
| **T01–T10.4** | AI foundation y guardrails: limpieza documental, World, unit tests de `QueryBuilder` y `config`, reglas de ESLint, architecture tests, locators canónicos, `BaseComponent`, jerarquía UI, aislamiento de `oracledb`, descubrimiento de unit tests |
| **T11–T16.1** | Contrato de Claude, arquitectura de agentes, los tres agentes, validación en runtime, workflow `/qa-automate`, primera automatización asistida, endurecimiento del flujo y permisos de infraestructura |
| **T17–T18** | Playwright MCP: integración, validación en runtime, higiene de artefactos e integración con los agentes |
| **T19–T19.1** | Automatización real de SauceDemo con MCP, y promoción de SauceDemo como canonical UI example (retiro del ejemplo anterior) |
| **T20–T20.1** | Auditoría adversarial final y corrección de coherencia del contrato → `READY` |

### `docs/refactor-progress/` — Fase 1 (framework base)

Registros previos del refactor del framework (config central, `DatabaseClient`, `BaseRepository`,
`QueryBuilder`, ejemplos UI y DB, reporting genérico, tags y scripts, calidad de código, CI, y la
auditoría final de esa fase), más `ARCHITECTURE-REVIEW.md` y `FINAL-REFACTOR-PLAN.md`.

> Este directorio está fuera del alcance de Prettier y del walker de architecture tests, a propósito:
> reformatear cientos de líneas ya aprobadas agregaría ruido sin valor.

### `docs/history/` — otros documentos históricos sueltos

Seis documentos que no pertenecían a ningún bloque `T0x` de `refactor-progress-ia/` ni
`refactor-progress/`, y por eso viven en su propio directorio. `ai-automation-archetype-final-audit.md`
—el sexto— ya está descrito arriba, en §Final Audits; los otros cinco:

| Archivo | Estatus | Qué es |
|---|---|---|
| [`ai-agent-architecture-plan.md`](./history/ai-agent-architecture-plan.md) | HISTORICAL | Plan de la arquitectura de agentes |
| [`ai-foundation-plan.md`](./history/ai-foundation-plan.md) | HISTORICAL | Plan de la fundación AI |
| [`ai-foundation-final-audit.md`](./history/ai-foundation-final-audit.md) | HISTORICAL | Auditoría previa: findings originales `F-01`…`F-16` |
| [`ai-foundation-readiness-final.md`](./history/ai-foundation-readiness-final.md) | HISTORICAL | Enforcement medido de la fundación (§7: limitaciones) |
| [`framework-current-state.md`](./history/framework-current-state.md) | HISTORICAL | Foto del estado del framework en su fecha |

---

## Búsqueda rápida

| Si necesitás… | Andá a |
|---|---|
| Entender el proyecto desde cero | `SDET-PLAYBOOK.md` §1–§2 |
| Correr los tests | `README.md` §Running Tests · Playbook §16 |
| Agregar un test nuevo | Playbook §26 · `README.md` §Adding a new UI test |
| Saber dónde va un locator | Playbook §7 · `CLAUDE.md` §3 |
| Entender por qué existe una regla | Playbook §13, §14 · `docs/refactor-progress-ia/T05`, `T06` |
| Saber qué **no** garantiza el gate verde | **Playbook §15** · `CLAUDE.md` §7.5 y §8.1 |
| Entender la capa de IA | Playbook §19–§24 · `.claude/**` |
| Saber el estado y los gaps abiertos | `ai-automation-archetype-final-readiness.md` · Playbook §35 |
| Preparar una entrevista | Playbook §28–§33 |
| Adaptar el arquetipo a otra empresa | Playbook §27 |
