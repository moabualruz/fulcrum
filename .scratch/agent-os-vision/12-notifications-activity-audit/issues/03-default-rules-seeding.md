---
Status: completed
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [01-schema-migration.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q26]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row)
Docs: []
---

# Default notification rules seeding: 4 defaults on user create, idempotent

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-03)

## What to build
On user creation (Better-Auth `users.create` hook), seed 4 default `notification_rules` rows: `assignment-to-me` (`task/assigned/assignee_id=$me`), `mention-of-me` (`*/mentioned/mentioned_user_id=$me`), `sprint-changes-affecting-my-tasks` (`sprint/changed/sprint_has_my_tasks=$me`), `run-completed-on-my-task` (`agent_run/completed/task_id IN my_tasks`). All default to `channels: ['in-app']`, `enabled: true`. Seed is idempotent: `INSERT … ON CONFLICT DO NOTHING` keyed on `(user_id, name)`.

## Acceptance criteria
- [ ] Schema migration: writes to `notification_rules` with UNIQUE `(user_id, name)` — add this UNIQUE if not in migration.
- [ ] tRPC procedure / module: `seedDefaultRules(userId, orgId, db)` in `src/notifications/defaults.ts`; called from Better-Auth user-create hook.
- [ ] Web surface: new user's `/settings/notifications` shows 4 default rules pre-populated.
- [ ] CLI command: `fulcrum notify rules list --json` for new user returns 4 rules.
- [ ] TUI screen: Settings → Notifications tab shows 4 default rules on first open.
- [ ] Tests: seed → 4 rules present; seed again → still 4 rules (idempotent); each default rule fires for its trigger event; correct pattern AST for each; RED→GREEN.

## Blocked by
- `01-schema-migration.md` — `notification_rules` table.
- Pillar 1 (Foundation) — Better-Auth user-create hook to wire `seedDefaultRules`.

## Notes / Tech-stack hints
- `$me` in default patterns: stored literally as `$current_user_id` string; resolved at evaluation time in rule-engine.
- `sprint-changes-affecting-my-tasks`: complex pattern — use `payload_path_eq: [{path: "sprint_id", value: "$sprint_of_my_tasks"}]`; rule-engine resolves via subquery if needed.
- Unique key for idempotency: `UNIQUE (user_id, name)` — add to migration if missing from T12-01.
