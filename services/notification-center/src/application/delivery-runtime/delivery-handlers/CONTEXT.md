# Delivery Handlers

The per-channel adapters invoked by `DeliveryTask` to actually transmit one `NotificationDelivery` and report a `DeliveryHandlerResult` back to the runtime. Handlers are pure: they never read or write rows, and they redact secrets before returning errors.

## Language

**SmtpHandler** (`deliverSmtpNotification`):
The handler that resolves `SmtpConfig`, builds a `nodemailer` transporter, and sends one mail message derived from `delivery.payload`.
_Avoid_: Mailer, emailer, smtp sender.

**WebhookHandler** (`deliverWebhookNotification`):
The handler that POSTs a signed JSON envelope to `payload.webhook.url`, attaching the Fulcrum event/delivery/timestamp/signature headers and an HMAC-SHA256 body signature.
_Avoid_: HTTP poster, outbound webhook.

**PushHandler** (`deliverPushNotification`):
The handler that resolves VAPID `PushConfig` and sends a Web Push notification to `payload.subscription` via the `web-push` module.
_Avoid_: Push sender, WebPush client.

**WebhookSignature** (`signWebhookPayload`):
The `sha256=<hex>` value, computed as `HMAC(secret, "{timestamp}.{rawBody}")`, that recipients verify against the `X-Fulcrum-Signature` header.
_Avoid_: HMAC, signature header, mac.

**WebhookEnvelope**:
The serialized JSON body `{ deliveryId, eventType, payload }` where `payload.webhook.secret`/`encryptedSecret` are replaced with `[redacted]` before signing.
_Avoid_: Webhook body, request payload.

**WebhookRetryLadder** (`WEBHOOK_RETRY_DELAYS_MS`):
The fixed `[0, 1m, 1h, 6h]` schedule the webhook handler uses to compute `nextAttemptAt` for retryable failures; SMTP and Push instead use a flat 60s delay.
_Avoid_: Backoff curve, retry policy.

**IdempotencyKey**:
The string written onto every `DeliveryHandlerResult` — `payload.idempotencyKey` when present, else `${delivery.id}:${attemptCount}` — for downstream dedupe.
_Avoid_: Dedupe key, request id.

## Relationships

- A **DeliveryTask** invokes exactly one of **SmtpHandler**, **WebhookHandler**, **PushHandler** per `NotificationDelivery.channel`.
- **WebhookHandler** computes a **WebhookSignature** over the **WebhookEnvelope** and uses **WebhookRetryLadder** to set `nextAttemptAt` on retryable HTTP/network errors.
- Every handler stamps its result with an **IdempotencyKey** and returns a `DeliveryHandlerResult` — handlers never touch the database row.
- Missing-config / missing-recipient / missing-endpoint / missing-secret produce a terminal `failed` result with `nextAttemptAt: null`; transport errors produce `retrying` until `attemptCount >= maxAttempts`.

## Example dialogue

> **Dev:** "If `payload.webhook.url` is set but `secret` is missing, does the **WebhookHandler** retry?"
> **Domain expert:** "No — `missing_secret` is a configuration failure, so the handler returns `status: failed` with `nextAttemptAt: null`. Only HTTP non-2xx and network errors walk the **WebhookRetryLadder**. Same shape applies to SMTP `missing_config`/`missing_recipient` and Push `missing_config`/`missing_subscription`."

## Flagged ambiguities

- **Handler vs DeliveryTask** — handlers are pure functions returning `DeliveryHandlerResult`; the `DeliveryTask` in the parent area owns row loading, status writeback, and queue acks. Do not import repositories or queues into this folder.
- **WebhookRetryLadder vs RetryTask** — the ladder lives inside the handler and drives `nextAttemptAt` for transient transport failures; the parent runtime's `RetryTask` only re-drives `held-quiet-hours` rows. The two retry paths do not share state.
- **`payload.webhook.secret` vs `encryptedSecret`** — both keys are accepted on input; both are scrubbed to `[redacted]` in the outgoing **WebhookEnvelope**. Treat them as the same field for signing and redaction purposes.
- **`provider` string vs `channel`** — handlers stamp `provider: "smtp" | "webhook" | "push"` on the result; this mirrors but is not identical to the `NotificationDelivery.channel` value the task uses to route. Do not assume one-to-one until the enum is unified.
