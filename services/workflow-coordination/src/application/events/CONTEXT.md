# Events

Reactive handlers that consume platform domain events and produce derived workflow artifacts (e.g. retro docs on sprint closure). Idempotency is enforced per handler via a dedupe log.

## Language

**EventHandler**:
A named consumer of a single platform event kind that performs a side effect exactly once per `(eventId, handlerName)` pair.
_Avoid_: listener, subscriber, reactor.

**HandlerName**:
The stable string identity of an **EventHandler** (e.g. `sprint-closed-retro-doc`) used as the dedupe key in `event_handler_log`.
_Avoid_: handler id, consumer id, slug.

**SprintClosedEvent**:
The inbound platform event row signalling a sprint has been closed; carries `subjectId` (sprint id) and a `metrics_snapshot` payload.
_Avoid_: sprint event, close event.

**RetroDoc**:
A `kind=postmortem` document auto-materialized from a **SprintClosedEvent**, linked back to its sprint via `retro_doc_id`.
_Avoid_: retrospective, postmortem doc, summary doc.

**MetricsSnapshot**:
The frozen sprint counters (`total_tasks`, `completed_tasks`, `completed_points`, `capacity_points`, `velocity`) embedded in a **SprintClosedEvent** payload and rendered into the **RetroDoc** body.
_Avoid_: stats, sprint metrics, summary.

**EventHandlerPersistence**:
The boundary interface this sub-area exposes for dedupe checks, retro doc insertion, and sprint linkage — kept thin so handlers stay testable without SQL.
_Avoid_: repository, dao, store.

## Relationships

- An **EventHandler** processes zero-or-one platform event row identified by `eventId`; the `(eventId, HandlerName)` pair is unique in `event_handler_log`.
- A **SprintClosedEvent** produces exactly one **RetroDoc** on first handling, and zero on every replay (idempotent skip).
- A **RetroDoc** belongs to exactly one sprint and is referenced by `sprints.retro_doc_id`.
- A **MetricsSnapshot** is embedded in exactly one **SprintClosedEvent** payload and is read-only to the handler.
- **EventHandlerPersistence** is the only seam between an **EventHandler** and the database.

## Example dialogue

> **Dev:** "If `sprint.closed` fires twice for the same sprint, do we get two **RetroDocs**?"
> **Domain expert:** "No — the **EventHandler** checks `event_handler_log` for `(eventId, HandlerName)` first. Second delivery returns `skipped: true` with no new **RetroDoc**."
> **Dev:** "What if `metrics_snapshot` is missing?"
> **Domain expert:** "The handler skips with a warning and does not mark the event handled, so a corrected replay can still produce the **RetroDoc**."

## Flagged ambiguities

- "Event" here means an inbound platform event row consumed by an **EventHandler** — not a parent-context **CycleEvent** (stage transition) and not an **AuditEntry**. Do not conflate.
- "Retro" vs "Postmortem" — resolved: **RetroDoc** is the domain term; `kind=postmortem` is the persisted document-kind enum value, kept for storage compatibility.
