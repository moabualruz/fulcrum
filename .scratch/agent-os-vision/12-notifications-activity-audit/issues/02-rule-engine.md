---
Status: ready-for-agent
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [01-schema-migration.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q26, A4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row)
Docs: []
---

# Rule engine: src/notifications/rule-engine.ts — pattern matching, $me resolution, mute short-circuit, disabled rule skip

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-02)

## What to build
`src/notifications/rule-engine.ts` — in-process per-event rule evaluator. Takes an `events` row + `org_id` → loads all `notification_rules WHERE org_id=$1 AND enabled=true`; evaluates each rule's `event_pattern` AST against the event (`subject_kind`, `verb`, `payload_path_eq` array); resolves `$current_user_id` references to actual user IDs; checks `notification_mutes` table (`muted_until IS NULL OR muted_until > now()`); skips disabled rules; returns `{ rule, userId, channels }[]` for matched rules. Complexity gate: if evaluation >5ms per event → compile patterns to parameterised SQL WHERE.

## Acceptance criteria
- [ ] Schema migration: reads `notification_rules` and `notification_mutes` from `0012_notifications`.
- [ ] tRPC procedure / module: `evaluateRules(event, db): Promise<RuleMatch[]>` exported from `src/notifications/rule-engine.ts`; called by `notify-fan-out` graphile-worker task.
- [ ] Web surface: N/A (infrastructure).
- [ ] CLI command: N/A.
- [ ] TUI screen: N/A.
- [ ] Tests: all AST fields match — `subject_kind` + `verb` + `payload_path_eq`; `$me` resolved to user_id; mute present → match suppressed; muted_until past → match proceeds; disabled rule → skipped; no matching rule → empty array; 1000 rules × 100 users <50ms (performance gate); RED→GREEN.

## Blocked by
- `01-schema-migration.md` — tables must exist.

## Notes / Tech-stack hints
- Pattern AST: `{ subject_kind?: string, verb?: string, project_id?: uuid, sprint_id?: uuid, payload_path_eq?: [{path: string, value: string}] }`.
- `payload_path_eq`: use `objectPath.get(event.payload, path)` for nested access.
- `$current_user_id` in pattern value: replace with `ctx.userId` at evaluation time; used for `assignee_id=$me` patterns.
- Failure gate: >5ms per event → convert frequent patterns to SQL WHERE clauses and batch as `SELECT * FROM notification_rules WHERE org_id=$1 AND subject_kind=$2 AND verb=$3 AND enabled=true`; use `json-rules-engine` (MIT, shared with Pillar 3) as fallback.
