# Notification Center

Notification fan-out, multi-channel delivery, user preferences, push subscriptions, and outbound webhooks. Owns the user-facing notification inbox and the machine-facing webhook outbox; consumes domain events from other services and decides who hears about what, on which channel, when.

## Language

### Core flow

**Event**:
A domain fact emitted by another service (e.g. `task.assigned`) that may produce notifications; owned by `platform-core`, consumed here as fan-out input.
_Avoid_: Message, signal, trigger.

**NotificationRule**:
A user-scoped predicate matching events by `subjectKind` + `eventPattern` and selecting one or more channels; the unit users edit in preferences.
_Avoid_: Subscription, filter, alert config.

**Notification**:
A persisted in-app inbox record for one recipient, produced when a rule matches an event; carries `title`, `body`, `entityKind`, `entityId`, and `readAt`.
_Avoid_: Alert, message, item.

**Delivery** (`NotificationDelivery`):
A per-channel send attempt belonging to one rule match, with `status` (`pending|sent|failed|retrying|suppressed`), `attemptCount`, `retryAfter`, and `lastError`. One Notification can have many Deliveries (one per channel).
_Avoid_: Dispatch, transmission, send, attempt.

**Channel**:
A delivery transport: `in-app`, `email`, `slack`, `discord`, `webhook`, `push`. String discriminator on `Delivery`; chosen by `NotificationRule.channels`.
_Avoid_: Provider, sink, destination, medium.

### Recipient & preferences

**Recipient**:
The `userId` that receives a Notification or Delivery; always paired with `orgId`. No standalone entity — recipient identity lives in `identity-access`.
_Avoid_: Target, subscriber, addressee.

**PushSubscription**:
A Web Push endpoint registered by a user's browser/device, holding `endpoint`, `p256dh`, `auth`, `userAgent`; consumed by the `push` channel handler.
_Avoid_: PushDevice, push token, device registration.

**NotificationMute**:
A user-scoped suppression of notifications for a specific `(subjectKind, subjectId)` pair, optionally bounded by `mutedUntil`.
_Avoid_: Snooze, ignore, block.

**QuietHours** (`NotificationQuietHours`):
A user's per-day window (`tz`, `startHour`, `endHour`, `daysOfWeek`) during which non-critical Deliveries are held with status `held-quiet-hours` instead of sent.
_Avoid_: Do not disturb, snooze schedule, silence window.

**DeliveryMode**:
How a matched rule schedules Deliveries: `immediate`, `digest` (rolled up over `digestWindowSeconds`), or `delayed` (held for `delaySeconds`).
_Avoid_: Cadence, timing, send strategy.

### Outbound webhooks

**Webhook**:
An org-owned outbound HTTP endpoint (`url` + `encryptedSecret` + `eventsFilter`) that receives event payloads; distinct from the `webhook` Channel on a NotificationRule.
_Avoid_: Endpoint, integration, callback. Note: not the same as a `WebhookRuleConfig`.

**WebhookDelivery**:
A delivery attempt against one Webhook, with HTTP `responseCode`, `attempt`, and `nextRetryAt`. Parallel to `NotificationDelivery` but for org-wide webhook fan-out, not per-user notifications.
_Avoid_: Webhook event, webhook send.

## Relationships

- An **Event** is evaluated against many **NotificationRules** (rule engine, per-org).
- A **NotificationRule** belongs to exactly one **Recipient** (user) and selects one or more **Channels**.
- A matched **NotificationRule** produces zero-or-one **Notification** (in-app row) and one **Delivery** per selected **Channel**.
- A **Notification** has zero-or-many **Deliveries** (one per non-`in-app` channel).
- A **Recipient** has zero-or-many **PushSubscriptions**, zero-or-many **NotificationMutes**, and zero-or-one **QuietHours**.
- A **NotificationMute** matching the Event's `(subjectKind, subjectId)` suppresses all rule matches for that Recipient.
- **QuietHours** holds non-critical **Deliveries** with status `held-quiet-hours`; critical rules bypass.
- A **Webhook** is org-scoped (no Recipient) and produces many **WebhookDeliveries**; this is independent of the per-user `webhook` Channel path.

## Example dialogue

> **Dev:** "When an `Event` matches a user's `NotificationRule` with channels `["in-app", "email"]`, do we create one **Delivery** or two?"
> **Domain expert:** "Two — one **Delivery** per **Channel**. The in-app one is bookkeeping for the **Notification** row (which is the inbox item); the email one is the actual SMTP send. The **Notification** is the user-visible artifact, the **Delivery** is the per-channel attempt log."
> **Dev:** "And if the user is in **QuietHours**?"
> **Domain expert:** "Non-critical **Deliveries** get held with status `held-quiet-hours`; critical rules bypass. The **Notification** row is still created either way — quiet hours suppress *sending*, not *recording*."

## Flagged ambiguities

- **Notification vs Delivery vs Event** — three layers, often conflated. **Event** = upstream fact (one). **Notification** = inbox row per recipient (zero-or-one per rule match, the user-facing artifact). **Delivery** = per-channel send attempt (one per channel selected). Use the precise term; "send a notification" is ambiguous — say "create a Notification" or "dispatch a Delivery".
- **Webhook (entity) vs `webhook` (Channel)** — `Webhook` entity is an org-scoped outbound endpoint with its own `WebhookDelivery` log. The `webhook` value in `NotificationRule.channels` triggers a per-user `NotificationDelivery` on that channel via `WebhookRuleConfig`. These are two different fan-out paths sharing a name; disambiguate as "**Webhook** entity" vs "`webhook` **Channel**".
- **NotificationRule vs Subscription** — code and DTOs use `NotificationRule`; product copy sometimes says "subscription". Canonical term is **NotificationRule**. No `Subscription` entity exists; `PushSubscription` is a device registration, not a notification subscription.
- **PushSubscription vs PushDevice** — entity is `PushSubscription` (Web Push spec terminology). Avoid `PushDevice` — it implies native mobile push (APNs/FCM), which is not the current implementation.
- **NotificationPreference** — not a real entity. User preferences are decomposed into `NotificationRule` (what to notify on), `NotificationMute` (what to suppress), and `NotificationQuietHours` (when to hold). If a single preferences aggregate is needed later, name it explicitly; do not retrofit "preference" onto existing entities.
- **DigestRule** — not a separate entity. Digest behavior lives on `NotificationRule.deliveryMode = "digest"` + `digestWindowSeconds`. Same rule, different delivery mode.
- **Recipient** — domain term, no entity. Always realized as `(orgId, userId)`; user identity is owned by `identity-access`, not duplicated here.
