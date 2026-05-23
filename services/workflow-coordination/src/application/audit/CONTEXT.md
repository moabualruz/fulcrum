# Audit

Application services that record, query, and export **AuditEntries**, govern **RetentionPolicies**, and shape the on-the-wire envelope every audit emitter must hand the platform.

## Language

**Actor**:
The `{ kind, id }` pair that authored an **AuditEntry**, where `kind` is `user | agent | automation | system`.
_Avoid_: user, principal, author.

**Envelope**:
The Zod-validated outbound shape (`auditEventEnvelopeSchema`) carrying **Actor**, **Verb**, `source`, `target`, `causationId`, `correlationId`, `before`, `after`, and `occurredAt`.
_Avoid_: message, packet, record.

**Source/Target**:
The two `traceRef` endpoints on an **Envelope**: `source` is the **Subject** that initiated the mutation; `target` is the **Subject** the mutation landed on.
_Avoid_: from/to, src/dst.

**CausationId**:
The id of the upstream **AuditEntry** or command that caused this one — required on every **Envelope**.
_Avoid_: parentId, triggerId.

**CorrelationId**:
The id grouping a fan-out of **AuditEntries** that share an originating intent — auto-filled on the **Envelope** when omitted.
_Avoid_: groupId, requestId.

**LegacyAuditRow**:
A row in the older `audit_events` table (kind: `AuditEvent` entity) still queried alongside the canonical `events` table during the dual-read window.
_Avoid_: old audit, v1 row.

**ExportFormat**:
The serialization shape requested from `exportAuditEvents` — `csv` or `json` — with a `jobId` fallback when the result set exceeds 100k rows.
_Avoid_: dump, report, download.

## Relationships

- An **Envelope** carries exactly one **Actor**, one **Verb**, one `source` **Subject**, one `target` **Subject**, and exactly one **CausationId**.
- An **Envelope** belongs to zero-or-one **CorrelationId** group (auto-generated if absent).
- `queryAuditEvents` merges canonical `Event` rows with **LegacyAuditRows** into a single **AuditEntry** stream sorted by `createdAt DESC`.
- `exportAuditEvents` produces one **ExportFormat** result per call; results above 100k rows return a `jobId` instead of inline rows.
- `setRetentionPolicy` upserts exactly one **RetentionPolicy** per `(orgId, projectId|null)` pair.

## Example dialogue

> **Dev:** "Do I set `correlationId` myself when I call `createAuditEventEnvelope`?"
> **Domain expert:** "Only if you're tying this **Envelope** to a fan-out already in flight. Otherwise leave it off — `createAuditEventEnvelope` mints one. `causationId` is different: it's required, and it must point at the upstream **AuditEntry** or command id."
> **Dev:** "Why does `queryAuditEvents` hit two tables?"
> **Domain expert:** "Dual-read window. `Event` is canonical; **LegacyAuditRow** is the older `audit_events` table we haven't backfilled out yet. Both serialize to the same **AuditEntry** DTO so callers don't see the seam."

## Flagged ambiguities

- "action" vs "verb" — resolved: the persisted column on **LegacyAuditRow** and the legacy `RecordAuditEventInput` field are still named `action`, but the canonical wire term is **Verb**. New code reads/writes `verb`; the serializer maps `action → verb`.
- "source/target" (this sub-area) vs "Subject" (parent) — resolved: `source` and `target` are **Envelope** field names that each reference a **Subject**. They are not new domain concepts.
- "Event" (canonical table) vs "AuditEvent" (legacy entity) vs **AuditEntry** (domain term) — resolved: **AuditEntry** is the only domain term. `Event` and `AuditEvent` are infrastructure rows that both serialize into an **AuditEntry** DTO.
