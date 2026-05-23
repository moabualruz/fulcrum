# mobile-capture: mislabeled-route content migration

> Migrated by `prd-cross-mislabeled-route-content-migration` (Design Fidelity
> Recovery). The `mobile-capture` route name is freed for its OD surface; the
> current content is preserved here so the route-rebuild PRD re-homes it
> without feature loss.

## What this route currently rendered (mislabeled)

NOT the OD mobile Capture editor. It is a Core-Web-Vitals / performance-
instrumentation page: `VitalMetric` (LCP/INP/CLS), telemetry send state, a
long-task counter, and an embedded `TaskQuickCreateTray`-style task-create
panel (`createContext` Board/Backlog/Table/Planning, `taskSprint`/`taskModule`/
`taskCycle`, recurrence preview).

## Preserved artifact

- `+page.svelte.preserved`: the full route content, verbatim.

## Disposition

- **Disposition:** re-home (no feature loss).
- **Re-home destination:** Core-Web-Vitals perf metrics → Operate telemetry
  (or the existing `/cross-cutting-perf` perf route); the embedded task-create
  tray → Build (it is a `TaskQuickCreateTray` duplicate). Per
  `design-alignment/capture.md` §mobile-capture, the real mobile Capture editor
  is a responsive *state* of `/<ws>/projects/<projId>/capture/<docId>`, not a
  standalone route.
- **Owning rebuild PRD:** `prd-web-capture-stage-shell`: its `od_examples`
  explicitly lists `mobile-capture.html`; `capture.md` records owner
  `prd-web-operate-stage-doctor` / Build PRDs for the perf + task-tray content.
- **Live route now:** `+page.server.ts` 308-redirects `/mobile-capture` →
  `/cross-cutting-perf` (the existing perf route named by `capture.md` line 201
  as the re-home home for the Core-Web-Vitals content) so the old path never
  returns 404 until the OD mobile Capture editor ships.
