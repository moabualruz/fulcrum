---
phase: 07-repos-artifacts-notifications
plan: 09
subsystem: notifications
tags: [notifications, unread-count, web, tui, cli, trpc, bun-test]
requires:
  - phase: 07-repos-artifacts-notifications
    provides: "07-07 canonical notification fanout events and in-app notification rows"
provides:
  - "Unread bell count helpers and tests tied to user_notifications readAt=null rows"
  - "Web inbox and notification settings routes backed by notification tRPC procedures"
  - "TUI notification inbox unread, mark-read, mark-all-read, mute, and rules refresh affordances"
  - "Generated notify CLI list, watch, mark-read, mark-all-read, and mute tRPC dispatch paths"
affects: [NTF-02, NTF-03, NTF-07, NTF-08, notification-surfaces]
tech-stack:
  added: []
  patterns:
    - "Notification surfaces call tRPC notify procedures instead of direct local DB/event counts"
    - "Rule delivery timing is stored in eventPattern metadata until schema columns land"
key-files:
  created:
    - src/notifications/__tests__/bell-counter.test.ts
  modified:
    - src/trpc/schemas/notifications.ts
    - src/trpc/routers/notifications.ts
    - src/web/src/routes/inbox/+page.server.ts
    - src/web/src/routes/inbox/+page.svelte
    - src/tui/screens/notifications.ts
    - src/web/src/routes/settings/notifications/channels/+page.server.ts
    - src/web/src/routes/settings/notifications/channels/+page.svelte
    - src/web/src/routes/settings/integrations/webhooks/+page.server.ts
    - src/cli/commands/pillar14-generated.ts
key-decisions:
  - "Bell count remains a direct Notification count scoped by orgId, userId, and readAt=null; events table is not used."
  - "Notification rule deliveryMode/digestWindowSeconds/delaySeconds/critical metadata is carried in eventPattern to avoid an unplanned schema migration."
  - "CLI notify mutations emit JSON for both list and write operations through the shared tRPC caller."
patterns-established:
  - "Web server routes use /api/trpc fetch wrappers for notification queries and mutations under authenticated session scope."
  - "TUI notification screen refreshes unread count and rules from caller.notify when those procedures are available."
requirements-completed: [NTF-02, NTF-03, NTF-07, NTF-08]
duration: 6min
completed: 2026-05-05
---

# Phase 07 Plan 09: Notification Surfaces Summary

**Unread notification state now flows from Notification rows through shared tRPC procedures into Web inbox/settings, TUI inbox, and generated notify CLI mutations.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-05T21:16:02Z
- **Completed:** 2026-05-05T21:22:01Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added TDD RED coverage for unread bell count semantics, mark-read behavior, and poller/router count parity.
- Exported unread-count and mark-read helpers, with `notify.unreadCount`, `notify.list`, `notify.markRead`, `notify.markAllRead`, and `notify.mute` kept org/user scoped.
- Reworked `/inbox` to load notifications through `notify.unreadCount` and `notify.list`, and mark all read through `notify.markAllRead`.
- Extended notification channel/settings pages to load rules and quiet-hours state from tRPC instead of local-only state.
- Added TUI unread refresh, mark-all-read key, mute action, and rule count refresh.
- Expanded generated `fulcrum notify` CLI dispatch for `list`, `watch`, `mark-read`, `mark-all-read`, and `mute`.

## Task Commits

1. **Task 1 RED: unread bell source-of-truth tests** - `9355afce` (test)
2. **Task 2: unread/list/mute/rules APIs and Web/TUI surfaces** - `2d36bb17` (feat)
3. **Task 3: notify CLI parity mutations** - `2029d38f` (feat)

## Files Created/Modified

- `src/notifications/__tests__/bell-counter.test.ts` - TDD source-of-truth tests for unread count, mark-read floor behavior, and poller/router parity.
- `src/trpc/schemas/notifications.ts` - Delivery mode, digest, delay, and critical rule metadata schemas.
- `src/trpc/routers/notifications.ts` - Unread helper exports, mark-read helper, rule timing metadata output, and scoped notification procedures.
- `src/web/src/routes/inbox/+page.server.ts` - Authenticated tRPC-backed inbox load and mark-all-read action.
- `src/web/src/routes/inbox/+page.svelte` - Notification row rendering updated to canonical notification fields.
- `src/tui/screens/notifications.ts` - Unread refresh, mark-all-read action, mute action, and rules summary.
- `src/web/src/routes/settings/notifications/channels/+page.server.ts` - Channels, rules, and quiet-hours loaded from tRPC.
- `src/web/src/routes/settings/notifications/channels/+page.svelte` - Rules and quiet-hours state displayed on channel settings.
- `src/web/src/routes/settings/integrations/webhooks/+page.server.ts` - Webhook settings backed by notification channel config and webhook notification rules.
- `src/cli/commands/pillar14-generated.ts` - Notify list/watch/write command routing.

## Decisions Made

- Kept schema changes out of this plan. Rule delivery timing metadata is encoded in `eventPattern`; adding columns would have been an unplanned migration and cross-plan coordination point.
- Preserved existing TUI caller compatibility by sending mute input with `sourceKind/sourceId`; CLI and tRPC mutation paths use canonical `subjectKind/subjectId`.
- Did not update `.planning/STATE.md`, `.planning/ROADMAP.md`, or `.planning/REQUIREMENTS.md` because the user explicitly requested shared orchestrator artifacts remain untouched.

## Deviations from Plan

None - plan executed within the requested owned file set.

## Issues Encountered

- Targeted `tsc` on the CLI command file traversed broader app-router imports and failed on concurrent 07-08 delivery files plus pre-existing doc router type errors. This was treated as out of scope; owned notification surface files passed targeted typecheck before the CLI-only change, and CLI behavior was verified with tests plus a parseable JSON mutation smoke.
- Concurrent 07-08 changes are present in `package.json`, `bun.lock`, `src/queue/index.ts`, `src/webhooks/dispatcher.ts`, and notification delivery files. They were not staged or modified by this plan.

## Verification

- `bun test src/notifications/__tests__/bell-counter.test.ts tests/notifications/bell-counter-poll.test.ts tests/tui/search-notifications.test.ts tests/cli/runs-notify-audit-webhooks.test.ts` - PASS, 22 tests.
- `bun -e ... runPillar14Command("notify", ...)` - PASS; `list`, `mark-read`, `mark-all-read`, and `mute` all emitted parseable JSON.
- `rg -n "unreadCount|markRead|markAllRead|mute|notifications\\.list|rules\\.list" src/trpc/routers/notifications.ts src/web/src/routes/inbox/+page.server.ts src/tui/screens/notifications.ts` - PASS.
- `rg -n "runNotify\\(|mark-all-read|mark-read|mute" src/cli/commands/pillar14-generated.ts` - PASS.
- `bun run --bun tsc --noEmit --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext --allowImportingTsExtensions --strict --types bun src/trpc/schemas/notifications.ts src/trpc/routers/notifications.ts src/web/src/routes/inbox/+page.server.ts src/tui/screens/notifications.ts src/web/src/routes/settings/notifications/channels/+page.server.ts src/web/src/routes/settings/integrations/webhooks/+page.server.ts` - PASS before CLI-only change.

## Known Stubs

- `src/web/src/routes/inbox/+page.server.ts` returns `activity: []`; My Activity is outside NTF-02/03 scope and was intentionally not rebuilt in this plan.
- `src/web/src/routes/settings/integrations/webhooks/+page.server.ts` returns `deliveries: []`; delivery history is owned by 07-08 delivery worker/channel work.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: notification-write-cli | `src/cli/commands/pillar14-generated.ts` | CLI can mutate read/mute state; mitigated by routing through authenticated tRPC notify procedures. |
| threat_flag: notification-settings-read | `src/web/src/routes/settings/notifications/channels/+page.server.ts` | Settings route reads channel/rule/quiet-hours state; gated by session and server-side tRPC fetch with cookies. |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

NTF-02, NTF-03, NTF-07, and NTF-08 surfaces are ready to consume 07-08 delivery metadata when channel workers and delivery history finish. Full NTF-09 parity still depends on notification-rules editing depth and delivery worker completion.

## Self-Check: PASSED

- Files verified present: `src/notifications/__tests__/bell-counter.test.ts`, `src/trpc/schemas/notifications.ts`, `src/trpc/routers/notifications.ts`, `src/web/src/routes/inbox/+page.server.ts`, `src/web/src/routes/inbox/+page.svelte`, `src/tui/screens/notifications.ts`, `src/web/src/routes/settings/notifications/channels/+page.server.ts`, `src/web/src/routes/settings/notifications/channels/+page.svelte`, `src/web/src/routes/settings/integrations/webhooks/+page.server.ts`, `src/cli/commands/pillar14-generated.ts`, `.planning/phases/07-repos-artifacts-notifications/07-09-SUMMARY.md`.
- Commits verified present: `9355afce`, `2d36bb17`, `2029d38f`.

---
*Phase: 07-repos-artifacts-notifications*
*Completed: 2026-05-05*
