# Delivery Runtime

The background workers, schedulers, and rule-matching engine that turn matched Events into per-channel Delivery jobs, enforce quiet-hours holds, retry held work, refresh bell counters, and prune expired audit data.

## Language

**RuleEngine** (`NotificationRuleEngine`):
The evaluator that scans an org's enabled `NotificationRules` against one `Event` and returns zero-or-many `RuleMatches`.
_Avoid_: Matcher, dispatcher, filter.

**RuleMatch**:
The tuple `{ rule, userId, channels[] }` produced when an `Event` passes a `NotificationRule`'s predicate and mute checks; the unit consumed by the fan-out step.
_Avoid_: Hit, result, dispatch record.

**FanoutTask** (`notify-fan-out`):
The queue task that loads one `Event`, runs the `RuleEngine`, creates the in-app `Notification`, and enqueues one `DeliveryTask` per non-`in-app` channel.
_Avoid_: Distributor, dispatcher job.

**DeliveryTask** (`notification-delivery`):
The queue task that loads one `NotificationDelivery` by id, invokes the channel-specific handler (`smtp`, `webhook`, `push`), and writes the handler's `DeliveryHandlerResult` back to the row.
_Avoid_: Send job, transmit task.

**DeliveryHandlerResult**:
The handler return shape carrying `status`, `attemptCount`, `nextAttemptAt`, `responseStatus`, `errorCode`, `idempotencyKey`; normalized into the `NotificationDelivery` row patch.
_Avoid_: Send outcome, response.

**QuietHoursEvaluation**:
The decision returned by `evaluateQuietHours({ quietHours, now })`: `{ quiet, status, nextAttemptAt, reason }`; drives the choice between enqueueing a `DeliveryTask` now or persisting `held-quiet-hours` with a `nextAttemptAt`.
_Avoid_: Quiet check, suppression decision.

**RetryTask** (`notification-delivery-retry`):
The cron-driven task (60s) that finds `NotificationDeliveries` whose `nextAttemptAt` is due, flips them to `queued`, and re-enqueues a `DeliveryTask` per row.
_Avoid_: Requeue, sweep.

**AuditPruneTask** (`audit.prune-events`):
The daily cron task that reads each org's `EventRetentionPolicy.retainDays`, prunes expired `Notifications`/`NotificationDeliveries`/`Events`, and emits an `audit.pruned` `Event` summarizing the deletion.
_Avoid_: Cleanup, GC, sweeper.

**BellCounterPoll**:
The client-side controller that drives the unread badge: realtime subscription when enabled, 60s `setInterval` fallback otherwise; exposes `start`, `stop`, `refresh`, `openDropdown`, `clearForInboxVisit`.
_Avoid_: Badge poller, counter watcher.

**NotificationBroadcaster**:
The server-side hook called by `FanoutTask` after an in-app insert; when realtime is enabled, fetches the recipient's current unread count and pushes it via the `AwarenessServer`.
_Avoid_: Pusher, notifier.

## Relationships

- A **FanoutTask** invokes the **RuleEngine** to produce **RuleMatches**, then enqueues one **DeliveryTask** per non-`in-app` channel of each match.
- A **FanoutTask** consults **QuietHoursEvaluation** per non-`in-app` channel; quiet matches persist `held-quiet-hours` instead of enqueueing.
- The **RetryTask** rescues `held-quiet-hours` rows whose `nextAttemptAt` is due and feeds them back into the **DeliveryTask** queue.
- A **DeliveryTask** dispatches to exactly one channel handler and writes one **DeliveryHandlerResult** back to its `NotificationDelivery`.
- A **FanoutTask** that creates an in-app **Notification** calls the **NotificationBroadcaster**; **BellCounterPoll** consumes the resulting realtime payload or falls back to its own 60s tick.
- The **AuditPruneTask** runs independently of the per-event pipeline and emits an `audit.pruned` **Event** that itself can flow back through **FanoutTask**.

## Example dialogue

> **Dev:** "If a **RuleMatch** has channels `["in-app", "email"]` and the recipient is inside **QuietHours**, what does the **FanoutTask** do?"
> **Domain expert:** "The in-app **Delivery** is created `pending` and the **Notification** row is inserted — quiet hours don't gate in-app. The email **Delivery** is created with status `held-quiet-hours` and a `nextAttemptAt` from **QuietHoursEvaluation**; no **DeliveryTask** is enqueued for it. The **RetryTask** picks it up after the window closes."

## Flagged ambiguities

- **RuleEngine vs FanoutTask** — the engine only evaluates and returns `RuleMatches`; the fan-out task owns side effects (creating `Notifications`, persisting `NotificationDeliveries`, enqueueing channel jobs). Do not push fan-out concerns into the engine.
- **DeliveryTask vs channel handler** — the task is the queue-bound wrapper that loads, dispatches, and writes back; the handler (`deliverSmtpNotification`, `deliverWebhookNotification`, `deliverPushNotification`) is the pure channel adapter under `delivery-handlers/`. Handlers return a `DeliveryHandlerResult`; only the task touches the row.
- **RetryTask vs handler-level retry** — the runtime's `notification-delivery-retry` cron only requeues `held-quiet-hours` rows via `findDueHeld`. Per-attempt backoff for transient handler failures lives inside the handler's `nextAttemptAt` and is re-driven by the same queue, not by this cron.
- **NotificationBroadcaster vs BellCounterPoll** — broadcaster is server-side push after insert; poll is client-side pull. Both target the same unread count but on opposite sides of the wire — do not collapse them into one "bell" abstraction.
- **`held-quiet-hours` literal vs `DeliveryStatus` enum** — the held status is currently a string literal alongside `DeliveryStatus.Pending`; treat it as a first-class status value even though it is not in the enum yet.
