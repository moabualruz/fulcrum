# Webhooks

Sub-area that owns the outbound HTTP subscription lifecycle: create/update/delete commands, list/get queries, AES-GCM secret-at-rest crypto, HMAC signing, and retrying delivery for org-scoped events.

## Language

**WebhookSubscriptionRecord**:
Persisted shape stored by `WebhookSubscriptionRepository` — `{id, orgId, url, events, encryptedSecret, active, createdAt, updatedAt}`.
_Avoid_: Row, model, entity.

**WebhookSubscriptionDTO**:
Outbound projection of a `WebhookSubscriptionRecord` carrying `secretRedacted: true` instead of the encrypted secret.
_Avoid_: View, response object.

**EncryptedSecret**:
A `whsec:v1:<iv>:<ciphertext>` string produced by `encryptWebhookSecret` (AES-GCM over the org's `FULCRUM_WEBHOOK_SECRET_KEY`).
_Avoid_: Cipher blob, sealed secret.

**Signature**:
The hex HMAC-SHA256 of the JSON body emitted in `X-Fulcrum-Signature-256`; the `sha256=<hex>` variant over `<timestamp>.<body>` goes in `X-Fulcrum-Signature`.
_Avoid_: HMAC, digest, MAC.

**EventsFilter**:
Per-`Webhook` allow-list of `WebhookEventType` values; `null` or empty means subscribe to all events.
_Avoid_: Topics, subscription list.

**DispatchAttempt**:
One pass of `deliverWithRetry` against a single `WebhookDelivery`, capped at `WEBHOOK_MAX_ATTEMPTS` (5) with exponential backoff up to `WEBHOOK_MAX_BACKOFF_MS` (32s).
_Avoid_: Retry, send, try.

## Relationships

- A **WebhookSubscriptionRecord** projects to exactly one **WebhookSubscriptionDTO** with the **EncryptedSecret** redacted.
- A `dispatchWebhookEvent` call fans out to every enabled `Webhook` whose **EventsFilter** matches the event, creating one **WebhookDelivery** each.
- A **WebhookDelivery** undergoes up to `WEBHOOK_MAX_ATTEMPTS` **DispatchAttempts**; the **EncryptedSecret** is decrypted once per delivery to produce the **Signature** headers.

## Example dialogue

> **Dev:** "Does `listWebhookSubscriptions` ever return the raw secret?"
> **Domain expert:** "No — it always projects through `WebhookSubscriptionDTO`, which sets `secretRedacted: true`. The **EncryptedSecret** only leaves this area through `decryptWebhookSubscriptionSecret`, and the dispatcher only uses the decrypted value to compute the **Signature** headers."
> **Dev:** "What if the **EventsFilter** is an empty array?"
> **Domain expert:** "Treated as subscribe-all, same as `null`. `webhookMatchesEvent` returns true."

## Flagged ambiguities

- **WebhookSubscriptionRecord vs `Webhook` entity** — the repository-backed record lives in this sub-area; the TypeORM `Webhook` entity lives in `notification-center`. Commands operate on both: `createWebhookSubscription` writes records, `createWebhook` writes entities. Do not merge.
- **`X-Fulcrum-Signature-256` vs `X-Fulcrum-Signature`** — the first is raw hex HMAC over the body (GitHub-style); the second is `sha256=<hex>` over `<timestamp>.<body>` (Fulcrum-native). Both ship on every signed delivery; do not collapse.
- **`plain:` secret prefix** — `resolveWebhookSecret` accepts a base64 `plain:` legacy form alongside the AES-GCM vault path. Treat as test/migration affordance, never as a supported user-facing format.
