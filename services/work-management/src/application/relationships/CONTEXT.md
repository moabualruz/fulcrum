# Relationships

Application sub-area that exposes Task-to-Task **TaskRelationship** commands and computes **RelationshipSummary** projections over a **TraceSpine** for callers that need bucketed counts/IDs without embedding a full graph.

## Language

**RelationshipType**:
The kind tag on a TaskRelationship (`blocks`, `blocked_by`, `duplicates`, `relates_to`, etc.) passed to `createRelationship`.
_Avoid_: Link type, edge kind.

**Blocker**:
The result of `listTaskBlockers` — TaskRelationships where the queried Task sits on the `blocked_by` side.
_Avoid_: Dependency (parent term), upstream task.

**BlockedItem**:
A Task surfaced by `listBlockedItems` because at least one open `blocks` relationship targets it within a Project.
_Avoid_: Downstream task, waiter.

**DuplicateMark**:
The effect of `markTaskAsDuplicate` — creates a `duplicates` TaskRelationship and optionally auto-closes the source and transfers watchers to the target.
_Avoid_: Merge, dedupe.

**RelationshipBucket**:
One of the twelve fixed projection slots (`projects | repos | workItems | docs | contextBundles | routingDecisions | runs | liveSessions | artifacts | memory | automations | audit`) into which `summarizeRelationships` files **TraceRef**s.
_Avoid_: Category, group, edge type.

**RelationshipSummary**:
The Zod-validated `{ entity, trace, counts, ids, included, expanded? }` shape returned by `summarizeRelationships`; `counts` and `ids` are always populated, `expanded` only for buckets named in `include`.
_Avoid_: Relationship graph, adjacency, node set.

**Include**:
The caller-supplied `RelationshipBucket[]` that opts specific buckets into `expanded` (full TraceRef payloads) instead of just `counts`/`ids`.
_Avoid_: Expand, hydrate flag, projection.

**RelationshipsAppContext**:
The `{ orgId, userId }` envelope every command in `commands.ts` requires for org-scoping and audit attribution.
_Avoid_: Session, request context.

## Relationships

- A **TaskRelationship** is created, listed, and deleted only through commands in `commands.ts`; every command takes a **RelationshipsAppContext** for org scoping.
- A **Blocker** query and a **BlockedItem** query are inverse projections of the same `blocks`/`blocked_by` TaskRelationships.
- A **DuplicateMark** produces exactly one `duplicates` TaskRelationship plus optional side effects (close source, move watchers).
- A **RelationshipSummary** belongs to exactly one **TraceRef** (`entity`) anchored on one **TraceSpine** (`trace`); non-`workspace` entities require `trace.project`.
- Each **TraceRef** in `refs` maps to at most one **RelationshipBucket** (workspace refs are dropped); `include` decides which buckets also appear in `expanded`.

## Example dialogue

> **Dev:** "Why does `summarizeRelationships` return `counts` and `ids` but only sometimes `expanded`?"
> **Domain expert:** "Default projection is counts + IDs so the caller stays cheap. `expanded` is opt-in per **RelationshipBucket** via `include` — that's how we keep a Task summary from accidentally embedding the whole trace graph."
> **Dev:** "And `markTaskAsDuplicate` — does it just write the **TaskRelationship**?"
> **Domain expert:** "It writes the `duplicates` relationship and, when the flags are set, closes the source Task and transfers watchers. The relationship row is the audit trail; the close/transfer are side effects of the DuplicateMark."

## Flagged ambiguities

- **Dependency vs TaskRelationship vs Blocker** — resolved here: parent CONTEXT defines **Dependency** as the Task-to-Task concept; this sub-area always says **TaskRelationship** for the row and **Blocker**/**BlockedItem** for directional query results. Do not say "dependency record" in this folder.
- **Include vs expanded** — resolved: **Include** is the input list of buckets; **expanded** is the output field populated for those buckets. Never use "include" to mean the output.
- **RelationshipBucket vs RelationshipType** — resolved: **RelationshipBucket** is a TraceRef projection slot used by `summary.ts`. **RelationshipType** is the edge tag on a TaskRelationship used by `commands.ts`. Same English word "relationship", two different layers — never collapse.
