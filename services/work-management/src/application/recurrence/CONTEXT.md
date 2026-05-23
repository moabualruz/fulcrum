# Recurrence

Application-layer commands and service code that own `TaskRecurrenceRule` lifecycle: creating rules from a source Task, snapshotting its shape, and emitting clone Tasks on schedule or completion. Sharpens the parent service's `RecurrenceRule` entry with the trigger, snapshot, and bookkeeping vocabulary used inside this area.

## Language

**TriggerType**:
The discriminator on a RecurrenceRule selecting between `schedule` (time-driven, fires from `processDue()`) and `on_complete` (event-driven, fires from `onTaskComplete()`).
_Avoid_: Kind, mode, recurrence type, event type.

**SourceTask**:
The original Task whose id is stored as `sourceTaskId` on the rule and whose fields are snapshotted into `templateData` at rule-creation time; later edits to this Task do not retroactively update the snapshot.
_Avoid_: Parent task, origin, master task, prototype.

**TemplateData**:
The frozen jsonb snapshot (`title`, `description`, `status`, `priority`, `points`) captured from the SourceTask when the rule is created and used as the payload for every cloned Task.
_Avoid_: Payload, template, blueprint, taskTemplate (TaskTemplate is a separate entity owned by the templates area).

**Occurrence**:
A single cloned Task emitted by a rule firing; the rule's `occurrencesCreated` counter tracks how many have been produced and is the read path for the `maxOccurrences` bound.
_Avoid_: Run, instance, generated task, clone.

**ScheduleCadence**:
The mutually exclusive pair `cronExpression` (delegated to graphile-worker's native cron) or `intervalDays` (server-computed `nextRunAt` increment) that drives a `schedule`-triggered rule.
_Avoid_: Frequency, period, schedule expression, interval.

**RuleBounds**:
The three stop conditions (`endDate`, `maxOccurrences`, `enabled=false`) that cause a rule to be deactivated by setting `enabled = false` and `nextRunAt = null` during `processDue()`.
_Avoid_: Limit, expiry, termination, cutoff.

**ProcessDue**:
The graphile-worker-invoked sweep that finds every enabled rule with `nextRunAt <= now`, emits one Occurrence per rule via `WorkItemService.create`, advances `nextRunAt`, and applies RuleBounds.
_Avoid_: Tick, cron handler, scheduler, dispatcher.

## Relationships

- A **RecurrenceRule** has exactly one **SourceTask** (by `sourceTaskId`) and exactly one **TemplateData** snapshot.
- A **RecurrenceRule** has exactly one **TriggerType**; a `schedule` rule additionally has exactly one **ScheduleCadence** (`cronExpression` XOR `intervalDays`).
- A **RecurrenceRule** produces zero or more **Occurrences** over its lifetime, capped by **RuleBounds**.
- **ProcessDue** reads many enabled **RecurrenceRules** per invocation and writes one new Task (an **Occurrence**) per rule it processes.
- The `on_complete` **TriggerType** is fired by `onTaskComplete(orgId, taskId)` when the **SourceTask** transitions to a completed status; it sets `nextRunAt` so the next **ProcessDue** sweep emits the Occurrence.

## Example dialogue

> **Dev:** "If I rename the **SourceTask** after creating a `schedule` rule, will the next **Occurrence** use the new title?"
> **Domain expert:** "No — **TemplateData** is snapshotted at `create()` time. The clone uses the frozen `title`. If you want the new title to flow through, delete the rule and recreate it against the updated SourceTask."
> **Dev:** "And when a rule hits `maxOccurrences`, does `processDue` delete it?"
> **Domain expert:** "No — **RuleBounds** flips `enabled = false` and clears `nextRunAt`. The row stays for audit and `list()`. Deletion is an explicit `deleteRecurrenceRule` call."
> **Dev:** "Can a rule have both `cronExpression` and `intervalDays`?"
> **Domain expert:** "**ScheduleCadence** is XOR. `create()` requires one of them for `schedule` triggers; setting both is an authoring error the service does not currently reject but the worker would only honor `intervalDays`."

## Flagged ambiguities

- **TemplateData vs Template** — resolved: **TemplateData** is the inline jsonb snapshot on a RecurrenceRule. **Template** (the parent `TaskTemplate` entity) is a separate, user-curated artifact owned by the templates area. They are not interchangeable; never refer to TemplateData as "the template" in this area.
- **Occurrence vs Run** — resolved: an **Occurrence** is the produced clone Task. A "run" of `processDue()` may produce many Occurrences across many rules; do not use "run" as a synonym for Occurrence.
