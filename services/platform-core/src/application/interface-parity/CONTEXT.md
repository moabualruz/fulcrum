# Interface Parity

Catalogs the canonical matrices that assert web, CLI, TUI, and API surfaces expose the same domains, trace ids, destructive guards, and resilience states, so any surface gap is a typed registry entry rather than tribal knowledge.

## Language

**SurfaceDomain**:
A registered product domain (e.g. `projects`, `runs`) with per-surface availability flags, parity state, router keys, command/label/route aliases, workflows, and gaps.
_Avoid_: feature area, module, section

**SurfaceParityState**:
The realized status of a `SurfaceDomain` on one surface: `interactive`, `display-only`, or `gap`.
_Avoid_: coverage level, readiness, maturity

**SurfaceParityWorkflow**:
A named end-to-end scenario for a `SurfaceDomain` listing the cli/tui/api invocations, shared `stateShape`, and the `manualScript` steps used to verify parity by hand.
_Avoid_: scenario, journey, flow

**SurfaceParityGap**:
A typed missing-parity record attached to a `SurfaceDomain` naming the offending surface, the reason, and the expected behavior.
_Avoid_: TODO, deficiency, bug

**InterfaceParityAction**:
A single user-facing action (`create`, `read`, `update`, `delete`, `workflow`) bound to one `SurfaceDomain` with a `webRoute`, `cliCommand`, `tuiAction`, `apiRoute`, `stateShape`, and `manualScript`.
_Avoid_: command, operation, verb

**TraceLinkField**:
A registered cross-surface identifier (e.g. `projectId`, `runId`, `traceId`) declaring its CLI flags, CLI output fields, TUI placements, API payload fields, and the workflows that must carry it.
_Avoid_: correlation id, link, reference

**DestructiveAction**:
A registry row describing an irreversible CLI or TUI action with `severity` (`moderate | severe`), required `safety` guards, and an `outputRequirement` that bounds what may be printed.
_Avoid_: dangerous command, risky op, mutation

**ResilienceStateCase**:
A required failure/edge-state scenario for a surface (`missing-api`, `permission-denied`, `missing-feature-flag`, `empty-list`, `unavailable-sidecar`, `failed-subscription`, `partial-data`) with the trigger and expected `stdout`/`stderr`/`exitCode`/`recovery`.
_Avoid_: error case, fallback, edge case

## Relationships

- A **SurfaceDomain** owns zero-or-many **SurfaceParityWorkflows** and zero-or-many **SurfaceParityGaps**, and exposes a **SurfaceParityState** per `web | cli | tui | api`.
- An **InterfaceParityAction** belongs to exactly one **SurfaceDomain** and must name a route on every surface plus a `stateShape` and `manualScript`.
- A **TraceLinkField** is referenced by **SurfaceParityWorkflows** through its `workflows` list; the `traceId` field is required on workflows that span surfaces.
- A **DestructiveAction** targets exactly one surface (`cli` or `tui`) and one `targetIdField`, and never appears on `api` or `web`.
- A **ResilienceStateCase** binds one `commandFamily` to one surface and one **ResilienceStateKind**; CLI cases dictate stdout/stderr/exit-code while TUI cases dictate screen behavior.

## Example dialogue

> **Dev:** "If TUI Docs only renders a list but has no create action, is that a **SurfaceParityGap** or a missing **InterfaceParityAction**?"
> **Domain expert:** "Both. The **SurfaceDomain** `docs` records `state.tui = display-only` plus a **SurfaceParityGap** explaining the deficit, and the create-document **InterfaceParityAction** still lists the expected `tuiAction` so the manual script keeps reminding us until parity lands."
> **Dev:** "And the confirm-delete overlay before TUI artifact delete — registry concern?"
> **Domain expert:** "Yes, that's a `severe` **DestructiveAction** with `safety` listing the overlay and y/N confirmation; the parity matrix asserts every severe row carries an explicit confirm guard."

## Flagged ambiguities

- "parity gap" was used to mean both a missing surface row and a missing action — resolved: a **SurfaceParityGap** is domain-scoped (one surface lacks the domain), while `listInterfaceActionParityGaps` returns per-action gaps keyed by `domain:name:surface`.
- "trace" overlapped **TraceLinkField** `traceId` with run-level `runGroupId`/`reviewId` — resolved: `traceId` is the cross-workflow correlator; `runGroupId` and `reviewId` are narrower link fields that do not replace it.
- "destructive" vs "resilience" — resolved: **DestructiveAction** governs intentional irreversible operations and their guards; **ResilienceStateCase** governs involuntary failure states and their recovery copy.
