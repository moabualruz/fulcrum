---
Status: implemented
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [05-trpc-notify-procedures.md, 06-trpc-audit-procedures.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q26, A4, Q-cli-shape, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row, Audit log row)
Docs: []
ImplRuntime: codex
---

# CLI notify/audit commands

Implemented narrow CLI surface modules with injectable `notify.*` and `audit.*` procedure clients:

- `fulcrum notify list/read/mark-read/mute/unmute`
- `fulcrum notify rules list/get/create/update/delete`
- `fulcrum notify channels list/config/test`
- `fulcrum audit query`
- `fulcrum audit export`

Default runtime client calls `FULCRUM_TRPC_URL` (default `http://127.0.0.1:3000/trpc`) procedure paths; tests mock the tRPC-shaped clients per issue acceptance.
