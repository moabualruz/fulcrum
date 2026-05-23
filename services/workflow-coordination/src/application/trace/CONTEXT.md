# Trace

Schemas and linkage rules that validate the **TraceSpine** carried by every cycle event, audit row, and artifact in workflow-coordination.

## Language

**TraceRef**:
A typed pointer `{ kind, id, label? }` to one entity participating in a **TraceSpine** slot.
_Avoid_: link, pointer, reference object.

**TraceEntityKind**:
The closed enum naming what a **TraceRef** points at (`workspace`, `project`, `parent_project`, `subproject`, `repo`, `work_item`, `doc`, `context_bundle`, `routing_decision`, `run`, `live_session`, `artifact`, `memory`, `automation`, `audit`).
_Avoid_: entity type, ref type, target kind.

**LinkageRule**:
A `superRefine` invariant that rejects a **TraceSpine** missing a required upstream **TraceRef** (e.g. `run` requires `workItem` + `contextBundle`; `artifact` requires `run` or `doc`).
_Avoid_: validation, guard, constraint.

## Relationships

- A **TraceSpine** is composed of optional, slot-named **TraceRefs**, one per **TraceEntityKind** slot.
- A **TraceRef**'s `kind` is exactly one **TraceEntityKind**.
- A **LinkageRule** rejects a **TraceSpine** whose downstream **TraceRef** lacks the upstream **TraceRef** the rule names.

## Example dialogue

> **Dev:** "Can I attach a `run` **TraceRef** with only a `project` set?"
> **Domain expert:** "No — the `run` **LinkageRule** also requires `workItem` and `contextBundle` **TraceRefs**, otherwise the **TraceSpine** parse fails."

## Flagged ambiguities

- "Ref" vs "Link" vs "Pointer" — resolved: **TraceRef** is the only term; "link" is informal narration, not a type name.
- "Kind" vs "Type" — resolved: **TraceEntityKind** on a **TraceRef**; "type" is reserved for TypeScript types.
