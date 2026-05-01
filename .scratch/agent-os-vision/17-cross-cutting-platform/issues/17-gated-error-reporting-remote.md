---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [17-cross-cutting-platform/issues/05-error-crashlog-trpc-and-surfaces.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, C1, D5]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B6 error reporting)
Docs: https://bun.sh/docs/api/fetch
---

# GATED: error-reporting-remote — crash POST on new error_logs row, path scrubbing, HMAC

## What to build

Behind `FULCRUM_FEATURES=error-reporting-remote`. Sends crash entries from `error_logs` to user-configured endpoint (`FULCRUM_ERROR_REPORT_ENDPOINT` env var) on INSERT trigger (graphile-worker job `errors:report` triggered by `error_logs` table notification or polling). Stack traces scrubbed of absolute paths (regex replace `/Users/*/` + `/home/*/` + `C:\Users\*\` with `<homedir>/`). Same HMAC-SHA256 signing as telemetry-remote. No PII included.

Flag OFF: no POST on crash; `error_logs` rows accumulate locally only.

## Acceptance criteria

- [ ] Flag OFF: new `error_logs` row → no outbound POST.
- [ ] Flag ON: new `error_logs` row → `errors:report` graphile-worker job → POST with scrubbed stack trace; `X-Fulcrum-Signature` header valid.
- [ ] Path scrubbing: `/Users/mkh/projects/fulcrum/src/...` → `<homedir>/projects/fulcrum/src/...`; Windows paths scrubbed too.
- [ ] No email addresses, secret values, or file contents in payload.
- [ ] HMAC: verified by mocked server test.
- [ ] 4xx endpoint → dead-letter; doctor `platform.error_reporting: degraded` warning.
- [ ] `--json` flag on `fulcrum errors list` still works regardless of flag state.
- [ ] Vitest: trigger crash → check outbound POST payload; scrubbing assertions; HMAC verification.

## Blocked by

- Issue 05 (error crashlog) — `error_logs` table populated by crashlog.ts.
