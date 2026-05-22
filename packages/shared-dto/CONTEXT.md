# Shared DTO Context

## Language

- Shared DTO: a cross-surface value contract imported by two or more runnable surfaces.
- Workflow stage: the canonical Capture, Plan, Build, Review, Ship, Operate stage vocabulary.
- Workflow mode: the canonical Manual, Play, Discuss, Assist mode vocabulary.
- Run status: the cross-surface agent-run lifecycle vocabulary: queued, running, succeeded, failed, cancelled.
- Trace identity: the trace, span, run, and project ids that let CLI, TUI, and web correlate one invocation.

## Relationships

- `packages/shared-dto/src/index.ts` is the package barrel for surface-owned contract imports.
- Apps under `apps/web`, `apps/cli`, and `apps/tui` import shared vocabulary from `@fulcrum/shared-dto`.
- Service-internal domain entities and repository types stay inside their owning `services/**` domain.
- UI rendering primitives stay in `@fulcrum/ui-kit`; this package owns the shared values those primitives can consume.

## Example Dialogue

- "Need a web and TUI prop type for a workflow stage." "Import `WorkflowStage` from `@fulcrum/shared-dto`."
- "Need a service-only aggregate state." "Keep it in the owning service domain; do not promote it here."
- "Need a CLI trace id normalizer also used by another surface." "Put the value helper here and import it."

## Flagged Ambiguities

- `StatusBadge` is UI status vocabulary and may differ from `RunStatus`. Use `RunStatus` for agent-run lifecycle contracts.
