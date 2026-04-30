# 06 — Runs view with filters + detail

Status: ready-for-agent
Risk tier: medium
Severity: high
Dependencies: 02
File ownership:
- `src/web/src/routes/runs/**`
- `src/web/src/lib/server/runs.ts`
- `src/web/src/lib/components/runs/**`

Acceptance criteria:
- `/runs` shows a sortable shadcn `Table` (agent, model, status, started, duration, cost). Filters: agent, status, project, time range (last 24h / 7d / 30d / all).
- Status badges: `succeeded` neutral, `running` blue with pulse, `failed`/`cancelled` red, `queued` muted.
- `/runs/[id]` detail: summary card + tabbed content (transcript, payload, events). Reads transcript file from `transcript_path` if it exists; otherwise empty state.
- Cancel + retry buttons (cancel → status=`cancelled` + event; retry → enqueue new job via `enqueueJob` + event). Both gated behind `AlertDialog`.
- Auto-refresh `/runs` every 5s while any row is `running` (uses `setInterval` cleared on unmount).
- Toasts.
