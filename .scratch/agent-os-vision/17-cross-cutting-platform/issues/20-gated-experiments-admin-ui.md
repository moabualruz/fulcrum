---
Status: implemented
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/07-feature-flag-rollout-trpc.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, B10, C1, D5]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B10 A/B testing)
Docs: https://kit.svelte.dev/docs
---

# GATED: experiments — full A/B experiment admin UI, variant list, assignment counts, conversion metrics

## What to build

Behind `FULCRUM_FEATURES=experiments`. `/settings/experiments` Web route (Pillar 16 issue 26): experiment CRUD (name, description, variants array, rollout %, start/end dates); variant list with assignment count badges; conversion metrics chart (LayerChart bar — variant vs. conversion event count, where conversion event is user-defined via `TelemetryEvent.kind`). `flags.experiments.create(name, variants, rolloutPercent)` tRPC; `flags.experiments.assignments(experimentId)` → counts per variant; `flags.experiments.metrics(experimentId, conversionKind)` → variant × count. TUI: Settings → Feature Flags → `E` shows experiment list sub-pane. CLI: `fulcrum flags experiments list/create/metrics [--json]`.

Deterministic assignment (`rollout.ts` already implemented in issue 07); this issue adds the admin UI and metrics queries.

## Acceptance criteria

- [ ] Flag OFF: `/settings/experiments` → 404; `flags.experiments.*` procedures return FEATURE_DISABLED.
- [ ] Flag ON: create experiment (name="button-color", variants=["blue","red"], rolloutPercent=100) → `ExperimentAssignment` entities written on first `isEnabled` call per user.
- [ ] Variant counts: `flags.experiments.assignments('button-color')` → `{blue: N, red: M}` where N+M = total users who saw the flag.
- [ ] Conversion metrics: `flags.experiments.metrics('button-color', 'task.created')` → `{blue: {assigned: N, conversions: K}, red: {assigned: M, conversions: L}}`.
- [ ] Web UI: chart renders variant bars; create experiment dialog validates variant names unique; rollout % slider.
- [ ] TUI: experiment list shows name + assignment counts; `Enter` → metrics pane.
- [ ] CLI: `fulcrum flags experiments create --name "btn-color" --variants blue,red --rollout-percent 50 --json`.
- [ ] Vitest: assignment distribution test (100 users → ~50 each at 50% rollout).

## Blocked by

- Issue 07 (feature-flag rollout tRPC) — `rollout.ts` + `ExperimentAssignment` write path.
