---
Status: ready-for-agent
Phase: P4
Priority: medium
Test-file: tests/tui/notifications.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Notifications + Notification Rules Screens

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — notifications screens`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — notifications screens`

## What to test

- `src/tui/screens/notifications.ts` — `NotificationsScreen`
- `src/tui/screens/notification-rules.ts` — `NotificationRulesScreen`

## Setup

```ts
const mockNotifications = [
  { id: "n1", sourceId: "task-1", sourceKind: "task", title: "Task assigned", forYou: true, read: false },
  { id: "n2", sourceId: "run-1", sourceKind: "run", title: "Run completed", forYou: false, read: true },
];
const mockCaller = {
  notify: {
    list: async ({ tab }) => tab === "for-you"
      ? [mockNotifications[0]]
      : mockNotifications,
    markRead: async () => ({}),
    mute: async () => ({}),
    rules: {
      list: async () => [
        { id: "r1", name: "All tasks", enabled: true, channels: ["in-app"] },
      ],
      create: async (input) => ({ id: "r-new", ...input }),
      update: async (input) => ({ id: input.id, name: "updated", enabled: input.enabled ?? true, channels: [] }),
      delete: async () => ({}),
    },
    quietHours: {
      get: async () => ({ id: "qh1", tz: "UTC", startHour: 22, endHour: 7, daysOfWeek: [0, 6] }),
      upsert: async (input) => ({ id: "qh1", ...input }),
    },
  },
};
```

## NotificationsScreen steps

1. Load with tab "for-you" — only forYou notification visible
2. `Tab` key — switches to "all" tab; both notifications visible
3. `m` key — `notify.markRead` called with cursor notification id
4. `x` or mute key — `notify.mute` called with sourceKind + sourceId
5. `Enter` — `onOpenEntity` fires with entityKind + entityId
6. Bell count updates after markRead (bellCount decrements)
7. Subscription: simulate push of new notification → list refreshes
8. Render with empty list — "no notifications" placeholder, no crash

## NotificationRulesScreen steps

1. Load + render — rule name and enabled status visible
2. `Space`/`Enter` — toggle rule enabled → `rules.update` called
3. `n` key — create overlay opens; fill + confirm → `rules.create` called
4. `d` key — `rules.delete` called on selected rule
5. Quiet hours section visible; edit quiet hours form → `quietHours.upsert` called

## Assertions

- [ ] NotificationsScreen tab switch works; per-tab filtered results
- [ ] markRead, mute, onOpenEntity all fire correctly
- [ ] NotificationRulesScreen toggle/create/delete all fire correct callers
- [ ] Quiet hours upsert called with correct tz/hours
- [ ] Both screens render without crash on empty data
