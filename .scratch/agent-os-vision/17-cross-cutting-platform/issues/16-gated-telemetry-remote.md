---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/06-telemetry-collector-trpc-and-surfaces.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, C1, D5]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B5 telemetry)
Docs: https://bun.sh/docs/api/fetch
---

# GATED: telemetry-remote — HMAC batch POST, retry queue, telemetry_outbox

## What to build

Behind `FULCRUM_FEATURES=telemetry-remote`. Batches `telemetry_events` rows and POSTs to user-configured endpoint (`FULCRUM_TELEMETRY_ENDPOINT` env var). Batch signed with HMAC-SHA256 (`node:crypto`, key from `FULCRUM_TELEMETRY_SECRET`). `telemetry_outbox(id, batch_json, created_at, attempts, last_attempt_at, status)` table: rows queued before POST; drained after successful POST. Retry: graphile-worker job `telemetry:flush`; exponential backoff on 5xx; 4xx (bad endpoint) → dead-letter + doctor warning. Batch size: up to 100 events or 30s since last flush (whichever first).

Flag OFF: `telemetry_outbox` table empty; no network calls; no outbound traffic.

## Acceptance criteria

- [ ] Flag OFF: no outbound POST; `telemetry_outbox` table stays empty.
- [ ] Flag ON: telemetry events accumulated → `telemetry_outbox` rows written → graphile-worker job `telemetry:flush` fires → POST to `FULCRUM_TELEMETRY_ENDPOINT` with `X-Fulcrum-Signature` HMAC header; outbox rows deleted on 200.
- [ ] HMAC: server verifies `X-Fulcrum-Signature: sha256=<hex>` (tested with mocked server).
- [ ] 429 response → backoff; 5xx → retry 3× exponential; 4xx → dead-letter + doctor `platform.remote_telemetry: degraded` warning.
- [ ] Batch size: ≤100 events per POST; flushes after 30s even if <100 events.
- [ ] No PII in payload (verified by comparing batch JSON shape with `telemetry_events.payload` content policy).
- [ ] Vitest: mocked HTTP server receives correctly signed batch; outbox drained after success; retry on 503.

## Blocked by

- Issue 06 (telemetry collector) — `telemetry_events` must be populated.
