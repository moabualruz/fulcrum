# Health Checks

The `fulcrum doctor` orchestrator: discovers per-subsystem check modules, runs them in parallel with timeout and retry, and emits a versioned report for CLI, TUI, and web consumers.

## Language

**DoctorCheckDef**:
A module-exported definition (`name`, `subsystem`, async `run`) the orchestrator discovers from `checks/*.ts`.
_Avoid_: probe, test, validator

**DoctorCheckResult**:
The outcome of one run (`status`, `severity`, `message`, `recovery`, `durationMs`) attached to its `name` and `subsystem`.
_Avoid_: assertion, finding, diagnostic

**Subsystem**:
The named grouping a check belongs to (`api`, `cli`, `database`, `inference`, `routing`, `tui`, `web`); also the `--subsystem` filter key.
_Avoid_: module, area, component, domain

**CheckStatus**:
The tri-state outcome `ok | warn | fail` distinct from `CheckSeverity` (`info | warning | critical`).
_Avoid_: result, pass/fail, level

**DoctorReport**:
The top-level versioned envelope (`version`, `timestamp`, `checks`, `summary`) validated by `DoctorReportSchema`.
_Avoid_: health report, status dump, doctor output

**RunnerOpts**:
Per-invocation knobs for the runner (`timeoutMs`, `maxRetries`, `subsystem`).
_Avoid_: config, options, flags

**Recovery**:
Human-readable repair guidance attached to a non-`ok` `DoctorCheckResult`; defaults when the check omits one.
_Avoid_: fix, hint, remediation note

## Relationships

- A **DoctorReport** contains many **DoctorCheckResults** grouped by **Subsystem**.
- One **DoctorCheckDef** produces exactly one **DoctorCheckResult** per run; retries replace `fail` results with later non-`fail` outcomes.
- A **CheckStatus** of `fail` maps to **CheckSeverity** `critical` by default; `warn` maps to `warning`; `ok` maps to `info`.
- `RunnerOpts.subsystem` filters **DoctorCheckDefs** before execution; unmatched defs do not appear in the **DoctorReport**.
- A **DoctorReport.summary.fail > 0** drives the orchestrator's non-zero exit code.

## Example dialogue

> **Dev:** "If a **DoctorCheckDef** throws, do we get a **DoctorCheckResult** with `status: warn`?"
> **Domain expert:** "No — a throw or timeout becomes `status: fail` with `severity: critical` and the default **Recovery** string. `warn` is only what a check explicitly returns."
> **Dev:** "And running just the database **Subsystem**?"
> **Domain expert:** "Pass `--subsystem database`; the runner filters **DoctorCheckDefs** by that field before the parallel batch."

## Flagged ambiguities

- "status" vs "severity" — resolved: **CheckStatus** (`ok|warn|fail`) is the outcome; **CheckSeverity** (`info|warning|critical`) is the display weight derived from status unless the check overrides it.
- "check" overlapped **DoctorCheckDef** (definition) and **DoctorCheckResult** (outcome) — resolved: def is the input, result is the output; never collapse.
- "subsystem" vs platform-core's bounded services — resolved: a **Subsystem** here is a check-module grouping label, not a deployment unit.
