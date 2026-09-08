# T19 — Full AI + MCP Automation

**Estado:** ✅ COMPLETED — `STATE: AUTOMATION_APPROVED`
**Branch:** `feature/claude-ai-integration`
**Fase:** 2 — primer flujo completo `qa-automate` (qa-analyst → Gate 1 → automation-engineer
PLAN/IMPLEMENT → Gate 2 → quality/E2E → automation-reviewer) sobre una HU real, con Playwright MCP
usado según la arquitectura fijada en T17/T17.1/T17.2/T18. No es un dry run.

---

## 1. Requirement

**Título:** Checkout completo de un producto
**Aplicación:** https://www.saucedemo.com/

**Historia:** Como cliente de una tienda online, quiero agregar un producto al carrito y completar
el checkout, para confirmar que puedo realizar una compra correctamente.

**Acceptance Criteria:** AC-01 Login · AC-02 Add product (badge=1) · AC-03 Cart · AC-04 Checkout ·
AC-05 Buyer information (First Name=QA, Last Name=Automation, Postal Code=1000) · AC-06 Checkout
overview (producto + resumen de precio sin montos hardcodeados + acción de finalizar) · AC-07
Finish ("Thank you for your order!") · AC-08 negativo, Postal Code vacío ("Error: Postal Code is
required").

**Test data conocida:** `standard_user` / `secret_sauce` / "Sauce Labs Backpack" — datos exclusivos
del sitio público de demo, no corporativos ni secretos reales.

**Scope:** solo UI. Sin DB, API, storageState, cookies manuales, datos corporativos. Cada escenario
independiente, sin asumir estado de otro.

---

## 2. QA Analysis

`qa-analyst` (sin MCP) analizó la HU en dos pasadas:

**Pasada 1 — `STATE: NEEDS_CONFIRMATION`.** Detectó un `UNKNOWN [blocking]`: `BASE_URL` es único y
global (`src/config/index.ts`), hoy apunta a `https://playwright.dev`, es consumido por
`features/example/example.feature` y está fijado en `.github/workflows/ci.yml` (infraestructura
protegida). Apuntar `BASE_URL` a SauceDemo rompería el feature de ejemplo o dejaría el nuevo sin URL
válida. También listó 6 `UNKNOWN [non-blocking]` (señal observable de "acceso a X", qué constituye
"resumen de precio", alcance del set de escenarios, etc.).

**Decisión del usuario:** delegar el diseño del manejo de `BASE_URL` a `automation-engineer` en
`MODE: PLAN` (sin tocar `ci.yml` sin autorización aparte), y reducir el scope al set mínimo
S-1 (end-to-end) + S-7 (negativo), descartando los sub-caminos redundantes S-2..S-6.

**Pasada 2 — `STATE: READY_FOR_AUTOMATION`.** Con esas dos decisiones incorporadas, la analysis
quedó consistente: scope, 2 escenarios, test data, validaciones y riesgos documentados, con los
`UNKNOWN [non-blocking]` restantes marcados para resolverse con evidencia `MCP_OBSERVED` durante
el PLAN, sin bloquear el avance.

---

## 3. Gate 1

El usuario aprobó explícitamente la QA Analysis final (`STATE: READY_FOR_AUTOMATION`, scope
S-1+S-7) vía decisión explícita ("Approve QA Analysis"). Ninguna aprobación fue asumida por
silencio.

---

## 4. Automation Plan

`automation-engineer` en `MODE: PLAN` inspeccionó la arquitectura reutilizable (`BasePage`,
`BaseUiObject`, patrón de `Pages.ts`, patrón `ExamplePage.linkByName`) y usó Playwright MCP para
observar SauceDemo real antes de diseñar. Primera propuesta: resolver `BASE_URL` hardcodeando la
URL como literal dentro de `SauceDemoLoginPage`, con `PROTECTED INFRASTRUCTURE IMPACT: NONE`.

**Feedback del usuario en el primer Gate 2:** preferir una variable de configuración nueva
(`SAUCEDEMO_BASE_URL`) en vez del literal, pensando en un futuro ambiente distinto para SauceDemo.
El engineer re-propuso el plan con ese mecanismo, declarando explícitamente el impacto en
infraestructura protegida (`src/config/index.ts` + su test), sin reabrir la exploración MCP (la
evidencia ya recolectada se reutilizó).

---

## 5. MCP observations

Evidencia recolectada por `automation-engineer` con Playwright MCP contra `https://www.saucedemo.com/`
real, marcada `SOURCE: MCP_OBSERVED`:

- Login: `textbox "Username"`, `textbox "Password"`, `button "Login"` — roles accesibles.
- Inventario: cada producto en `[data-test="inventory-item"]` con `link` de nombre accesible y
  `button "Add to cart"` repetido por producto (requiere scoping por card).
- Carrito: badge/link (`[data-test="shopping-cart-badge"]`/`[data-test="shopping-cart-link"]`) **sin**
  rol/nombre accesible propio — confirmado con `browser_evaluate` sobre el DOM real, justifica el uso
  de `data-test` en vez de `getByRole`.
- Checkout info: `textbox "First Name"/"Last Name"/"Zip/Postal Code"` (nombre accesible vía
  `placeholder`), `button "Continue"`. Los títulos de pantalla (`Checkout: Your Information`,
  `Checkout: Overview`) son `<span>` **no** accesibles como heading — descartados como validación.
- Overview: resumen de precio (`[data-test="total-label"]`) también sin rol accesible propio.
- Confirmación: texto real coincide **exacto** con el AC-07 ("Thank you for your order!") y con el
  AC-08 ("Error: Postal Code is required") — **sin discrepancia que reportar** entre la HU y el
  comportamiento real de la app.
- Hallazgo de entorno (no de framework): durante la exploración MCP, algunos `click()` colgaron de
  forma intermitente contra el sitio; mitigado con click nativo del DOM para continuar observando.
  Documentado como hallazgo a vigilar, no como defecto.

MCP no modificó ningún Acceptance Criteria: los textos exactos de error/confirmación se validaron
tal cual venían del requerimiento.

---

## 6. Gate 2

Dos rondas:

1. **Plan inicial** (URL hardcodeada) → el usuario pidió cambios (variable de config en vez de
   literal).
2. **Plan revisado** (con `SAUCEDEMO_BASE_URL` en `src/config/index.ts`, impacto en infraestructura
   protegida declarado explícitamente con motivo + cambio concreto + archivos afectados) →
   **Approve Plan**.

Ninguna aprobación fue asumida; ambas fueron decisiones explícitas del usuario.

---

## 7. Implementation

`automation-engineer` en `MODE: IMPLEMENT`, con `PLAN APPROVED`, implementó exactamente los paths
aprobados. `STATE: READY_FOR_REVIEW`.

**Ciclo de corrección (post-review):** tras el primer `automation-reviewer` (`CHANGES_REQUESTED`,
ver §13), el usuario aprobó un fix acotado — nuevo `MODE: PLAN` → nuevo Gate 2 → nuevo
`MODE: IMPLEMENT` — limitado a R-1 (obligatorio) + R-2 + R-3 (opcionales incluidos por decisión del
usuario). R-4 quedó explícitamente fuera, documentado como mejora pendiente.

---

## 8. Files created/modified

**Created:**
- `features/sauceDemo/checkout.feature`
- `features/steps/sauceDemo/checkout.steps.ts`
- `src/pages/sauceDemo/SauceDemoLoginPage.ts`
- `src/pages/sauceDemo/SauceDemoInventoryPage.ts`
- `src/pages/sauceDemo/SauceDemoCartPage.ts`
- `src/pages/sauceDemo/SauceDemoCheckoutInfoPage.ts`
- `src/pages/sauceDemo/SauceDemoCheckoutOverviewPage.ts`
- `src/pages/sauceDemo/SauceDemoCheckoutCompletePage.ts`

**Modified:**
- `src/pageContainer/Pages.ts` (6 imports + 6 propiedades, patrón `example`)
- `.env.example` (agrega `SAUCEDEMO_BASE_URL=https://www.saucedemo.com`)
- `README.md` (fila nueva en la tabla de Environment Configuration)
- `src/config/index.ts` — **infraestructura protegida, autorizada explícitamente en Gate 2:**
  agrega `sauceDemoBaseUrl` a `AppConfig` con default público, y `requireSauceDemoBaseUrl()`
  (luego simplificada a accessor puro en el fix, ver §14 R-2)
- `src/config/index.test.ts` — **infraestructura protegida, autorizada:** 4 casos nuevos para
  `SAUCEDEMO_BASE_URL`/`requireSauceDemoBaseUrl()`

`git diff --stat` final (archivos trackeados): `.env.example | 3+`, `README.md | 1+`,
`src/config/index.test.ts | 25+`, `src/config/index.ts | 6+` (tras el fix; 10+ antes),
`src/pageContainer/Pages.ts | 18+` — 5 files changed. `.github/workflows/ci.yml` **sin cambios**.

---

## 9. Test data strategy

Todos los valores de test data (`standard_user`/`secret_sauce`, "Sauce Labs Backpack", datos de
comprador, textos esperados) viven como **strings literales en los steps del `.feature`**
(`SOURCE: REQUIREMENT`), siguiendo el mismo patrón que `example.feature` — sin fixture, sin archivo
de datos nuevo, sin `.env` adicional para estos valores (son datos públicos de un sitio de demo, no
secretos). La única pieza que sí pasó por configuración es la **URL base** de la aplicación
(`SAUCEDEMO_BASE_URL`), separada de los datos de negocio porque puede variar por ambiente; con
default público embebido para no requerir configuración adicional en CI ni en desarrollo local.

---

## 10. Quality

`npm run quality` → **PASS** en cada ciclo (implementación inicial y tras el fix): `tsc --noEmit`
limpio, `eslint` limpio, `prettier --check` limpio, `node --test` → **65/65 tests, 24/24 suites, 0
failures** (incluye los 4 tests nuevos de `SAUCEDEMO_BASE_URL`). Reproducido de forma independiente
por `automation-reviewer` en ambas rondas, no solo tomado del Implementation Report.

---

## 11. E2E

- `npx cucumber-js --tags "@smoke and not @db" --name "checkout"` → 1 escenario (S-1) PASS.
- `npx cucumber-js --tags "@regression and not @db" --name "checkout"` → 2 escenarios (S-1+S-7)
  PASS, 20/20 steps.
- `npm run test:ui` (`@ui and not @db`, repo completo) → 5 escenarios, 2 passed (los de SauceDemo),
  3 failed — los 3 fallos son de `features/example/example.feature` por falta de `BASE_URL`/`.env`
  local (feature preexistente, no tocado por esta tarea, condición de entorno ajena al diff).
- **Mutation check** (ejecutado por el reviewer): corriendo con `SAUCEDEMO_BASE_URL=https://example.com`,
  el escenario S-1 falla genuinamente en el primer step — confirma que el suite depende realmente de
  la aplicación real y que la variable de config está conectada de punta a punta, no es un mock.

---

## 12. Reviewer MCP validation

`automation-reviewer` usó Playwright MCP contra `https://www.saucedemo.com/` real en ambas rondas:
confirmó en vivo la estructura exacta de login/inventario/carrito/checkout/overview/confirmación
(conteo de nodos por selector, roles accesibles, textos exactos), y en la ronda de re-review
disparó el error de campo requerido para confirmar que `[data-test="error"]` es un `h3` único y
estable — evidencia que sostuvo directamente el finding R-1. Limitación reconocida y documentada
por el propio reviewer: su toolset no incluye `browser_type`/`browser_fill_form`, por lo que no
pudo enviar el formulario de comprador vía MCP; esa cobertura la cubrió con su propia corrida
E2E real (Cucumber + Playwright librería) contra el sitio.

---

## 13. Review Report

**Ronda 1 — `VERDICT: CHANGES_REQUESTED`.**
- R-1 [minor, required]: locators de error (AC-08)/confirmación (AC-07) anclados a
  `getByRole('heading', {level})` genérico en vez de a los hooks `data-test` estables confirmados
  en vivo — riesgo de falso negativo (strict-mode violation) si aparece otro heading del mismo
  nivel.
- R-2 [minor, optional]: rama de error inalcanzable en `requireSauceDemoBaseUrl()` (siempre hay
  default, el `throw` nunca dispara).
- R-3 [minor, optional]: assert tautológico (`toBeTruthy()`) en el resumen de precio, no discrimina.
- R-4 [minor, optional]: posible race condition en el check "sigue en el formulario"
  (`toHaveURL` inmediatamente post-click).

Checklist de 12 puntos: 11 PASS, 1 PASS-con-reservas. Evidencia de quality/E2E reproducida
independientemente, coincidente con lo reportado por el engineer.

**Ronda 2 (tras fix de R-1+R-2+R-3, R-4 excluido por decisión del usuario) — `VERDICT: APPROVED`.**
Confirmó punto por punto: R-1 resuelto (cero `getByRole('heading', ...)` en `src/pages/sauceDemo/**`),
R-2 resuelto (accessor puro, sin contrato falso, 4 tests existentes siguen verdes sin depender de la
rama eliminada), R-3 resuelto (`expectContainsText(..., 'Total')`, discrimina realmente, sin montos),
R-4 intacto y documentado (confirmado que no cambió). Scope no ampliado (verificado por mtime +
contenido: solo los 4 archivos del fix cambiaron). Checklist de 12 puntos: 12 PASS.

---

## 14. Findings

**Resueltos en este ciclo:**
- R-1 [required] — locators data-test estables en vez de heading genérico. **FIXED.**
- R-2 [optional] — código muerto en `requireSauceDemoBaseUrl()`. **FIXED** (accessor puro).
- R-3 [optional] — assert tautológico de price summary. **FIXED** (`expectContainsText('Total')`).

**Pendiente, documentado, no implementado (decisión explícita del usuario):**
- R-4 — posible race condition en `expectOnCheckoutInformationForm()` (`SauceDemoCheckoutInfoPage.ts`):
  `toHaveURL` inmediatamente post-click podría, en teoría, pasar en el instante antes de una
  navegación real. Mitigante: `toHaveURL` de Playwright es auto-retrying. Riesgo bajo, no bloqueante.

**Out-of-scope observations (informativas, no accionadas):**
- Asimetría de developer experience: `example.feature` no tiene default de `BASE_URL` (requiere
  `.env` local) mientras el feature nuevo de SauceDemo sí lo tiene — preexistente + aprobado por
  diseño, no un defecto de este cambio.
- Dependencia de disponibilidad de `saucedemo.com` en CI (misma naturaleza que la dependencia ya
  existente de `playwright.dev`).
- `[data-test="error"]` es compartido conceptualmente entre login y checkout-step-one; hoy no
  colisiona porque cada locator vive en su Page correspondiente — a vigilar si se agrega un
  escenario de login fallido en el futuro.
- `requireSauceDemoBaseUrl()` quedó como passthrough puro; el prefijo `require*` sugiere una
  validación que ya no aplica — cosmético, no bloqueante.

---

## 15. Final State

```
STATE: AUTOMATION_APPROVED
```

Criterio de éxito cumplido en su totalidad: QA Analysis → PASS, Gate 1 → PASS (aprobación humana
explícita), Engineer PLAN → MCP utilizado realmente (con una ronda de feedback humano incorporada),
Gate 2 → PASS (dos rondas, ambas con decisión explícita), IMPLEMENT → PASS, `npm run quality` →
PASS, E2E → PASS, Reviewer → MCP utilizado realmente, VERDICT final → APPROVED tras un ciclo de
corrección legítimo (no forzado). Ningún `git add`/`commit`/`push` ejecutado en todo el flujo.

---

## 16. Developer Experience

- El pipeline completo (`qa-analyst` → Gate 1 → `automation-engineer` PLAN → Gate 2 → IMPLEMENT →
  `automation-reviewer` → ciclo de corrección → re-review) corrió de punta a punta sin necesidad de
  tocar infraestructura fuera de lo explícitamente autorizado por el usuario.
- Los gates humanos funcionaron como diseñados: dos decisiones de scope real (manejo de `BASE_URL`,
  reducción S-1+S-7) y una decisión real de calidad (qué findings corregir) cambiaron el resultado
  final, no fueron trámites.
- El ciclo `CHANGES_REQUESTED → fix acotado → APPROVED` demostró que el checklist del reviewer
  detecta problemas reales (locators frágiles, asserts tautológicos, código muerto) que
  `npm run quality` no puede ver por sí solo.
- Fricción real observada: la corrida completa (2 pasadas de `qa-analyst`, 3 pasadas de
  `automation-engineer` PLAN, 2 IMPLEMENT, 2 `automation-reviewer`) tomó varios minutos por la
  exploración MCP real y las ejecuciones de `npm run quality`/E2E repetidas — esperable para una
  prueba funcional real, no un dry run.

---

## 17. Lessons learned

- Un `BASE_URL` único y global es una limitación estructural real en cuanto el repo necesita
  automatizar una segunda aplicación; resolverlo bien (variable dedicada con default público, sin
  tocar CI) es preferible a un literal hardcodeado, pero requiere pasar por el proceso de
  autorización de infraestructura protegida — el framework lo sostuvo sin relajar ningún guardrail.
  Ver [T11 — Claude Contract](T11-claude-contract.md) para las reglas de protección de infraestructura.
  Ver [T18 — Agent MCP Integration](T18-agent-mcp-integration.md) para el rationale del scoping de tools MCP por agente que este
  flujo terminó de validar en un caso de uso real.
- La evidencia `MCP_OBSERVED` fue decisiva para dos cosas concretas: justificar el uso de `data-test`
  sobre `getByRole` cuando el sitio real no expone rol/nombre accesible, y confirmar que los textos
  literales de error/confirmación de la HU coinciden exacto con la app real (sin necesidad de
  "reportar diferencia").
- Un reviewer verdaderamente independiente (sin ver el razonamiento del engineer) encontró fallas
  reales de calidad de assertion (tautológicas, acopladas a "el único heading de la página") que un
  review superficial del diff no necesariamente hubiera visto — validando el diseño de "no pasarle
  el transcript del engineer" de `docs/refactor-progress-ia/T12-agent-architecture.md`.
- Reutilizar evidencia MCP ya recolectada entre ciclos (en vez de re-inspeccionar en cada PLAN/review
  subsiguiente) evitó trabajo redundante sin perder rigor, porque la evidencia queda citada con su
  SOURCE en el handoff.

---

## 18. Próxima tarea

**T20 — Auditoría final de Fase 2.** No ejecutada en esta tarea, por instrucción explícita del
usuario.
