# Health Checks: Checks

Per-**Subsystem** check modules auto-discovered by the orchestrator; each module owns its config, its individual check functions, and a module-level result envelope.

## Language

**CheckModule**:
A per-subsystem file under `checks/` exporting either a `checks: DoctorCheckDef[]` array (discovery shape) or a `run<Subsystem>DoctorChecks(cfg)` entry plus a `buildDefault<Subsystem>DoctorConfig()` builder.
_Avoid_: provider, plugin, adapter

**DoctorSubsystemReport**:
The module-level envelope returned by `run<Subsystem>DoctorChecks` (`subsystem`, `checks`, `summary`) distinct from the top-level **DoctorReport**.
_Avoid_: sub-report, partial report, group result

**CheckEntry**:
One row inside a **DoctorSubsystemReport.checks** array (`name`, `status`, `severity?`, `message`, `recovery?`, `durationMs?`).
_Avoid_: line, item, record

**SkipStatus**:
The `skip` value of **CheckStatus** used only in `checks/` when a **FeatureFlag** is OFF or an **Injectable** is absent — never emitted by the orchestrator runner.
_Avoid_: noop, n/a, disabled

**FeatureFlag**:
The `FULCRUM_FEATURES` env entry (`public-api`, `outbound-webhooks`, `desktop-app`, `pwa-offline`, `router-llm`) gating whether a check runs or returns **SkipStatus**.
_Avoid_: toggle, switch, env var

**Injectable**:
A `check<Thing>` function on a `<Subsystem>DoctorConfig` that lets tests substitute the real probe (DB query, HTTP HEAD, telemetry read).
_Avoid_: stub, mock, dep

**PerfBudget**:
A numeric threshold in `web.ts`'s `PERF_BUDGETS` (`ssr_ttfb_p95_ms`, `nav_p95_ms`, `kanban_cold_load_ms`, `cmdK_open_ms`, `autosave_roundtrip_ms`, `lighthouse_min_score`) compared against an **Injectable** measurement.
_Avoid_: threshold, SLO, target

**BoundedCheck**:
A check wrapped by `runBounded(name, timeoutMs, fn)` in `api.ts` that converts a per-check timeout into a `fail` **CheckEntry** with a default **Recovery**.
_Avoid_: timed check, guarded check

## Relationships

- A **CheckModule** produces exactly one **DoctorSubsystemReport** per `run<Subsystem>DoctorChecks` call, or contributes one-or-more **DoctorCheckDefs** to orchestrator discovery via its `checks` export.
- A **DoctorSubsystemReport** contains many **CheckEntry**s; its `summary` counts them by **CheckStatus** including **SkipStatus**.
- A **FeatureFlag** that is OFF short-circuits its gated checks to **SkipStatus** before any **Injectable** runs.
- An absent **Injectable** yields **SkipStatus** in `web.ts` checks and `fail` in `api.ts` checks (the latter treats missing wiring as a critical gap).
- A **PerfBudget** is read only inside `web.ts`; exceeding it turns a `pass` into `fail` with the budget echoed in the **Recovery**.
- A **BoundedCheck** timeout in `api.ts` produces a `fail` **CheckEntry** carrying `DEFAULT_TIMEOUT_RECOVERY`, never propagating the rejection to the runner.

## Example dialogue

> **Dev:** "If `FULCRUM_FEATURES` does not include `desktop-app`, does `tauri_build` still hit disk?"
> **Domain expert:** "No — the **FeatureFlag** gate short-circuits to **SkipStatus** before the **Injectable** `checkTauriBinary` runs."
> **Dev:** "And in `api.ts` when `checkTrpcRouter` is undefined?"
> **Domain expert:** "That **Injectable** absence becomes `status: fail` with `severity: critical`, not **SkipStatus** — missing wiring is treated as a critical gap there."
> **Dev:** "What about a **PerfBudget** breach in `kanban_load`?"
> **Domain expert:** "The **CheckEntry** flips to `fail` and the **Recovery** echoes the budget value from `PERF_BUDGETS.kanban_cold_load_ms`."

## Flagged ambiguities

- "checks" overlapped **CheckModule** (the file), **CheckEntry** (one row), and the `checks` array property of **DoctorSubsystemReport** — resolved: the file is a **CheckModule**, its export and the report property are both `checks` arrays of either **DoctorCheckDef** (discovery) or **CheckEntry** (report).
- **SkipStatus** vs the runner's tri-state **CheckStatus** — resolved: `skip` exists only inside `checks/` module envelopes; the orchestrator's top-level **CheckStatus** is `ok|warn|fail` and never `skip`.
- "config" overlapped **RunnerOpts** (orchestrator) and `<Subsystem>DoctorConfig` (module) — resolved: **RunnerOpts** drives the runner, the per-module config carries **Injectable**s and **FeatureFlag** state for one **CheckModule**.
