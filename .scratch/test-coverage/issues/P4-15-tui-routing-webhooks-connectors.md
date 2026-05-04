---
Status: ready-for-agent
Phase: P4
Priority: medium
Test-file: tests/tui/routing-webhooks-connectors.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Routing Rules + Webhooks + Connectors Screens

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — routing webhooks connectors screens`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — routing webhooks connectors screens`

## What to test

- `src/tui/screens/routing-rules.ts` — `RoutingRulesScreen`
- `src/tui/screens/webhooks.ts` — `renderWebhookList` (pure function stub)
- `src/tui/screens/connectors.ts` — `renderConnectorList` (pure function stub)

## Setup

```ts
const mockRules = [
  { id: "rr1", orgId: "o1", projectId: "p1", name: "Route to claude", conditionsJson: { tag: "ai" }, actionAgent: "claude", actionSkillSet: ["code"], priority: 1, enabled: true, source: "manual" as const, createdAt: new Date(), updatedAt: new Date() },
  { id: "rr2", orgId: "o1", projectId: null, name: "Catch-all", conditionsJson: {}, actionAgent: "codex", actionSkillSet: [], priority: 99, enabled: false, source: "learned" as const, createdAt: new Date(), updatedAt: new Date() },
];
const mockWebhooks = {
  items: [
    { id: "wh1", url: "https://hook.example.com/abc", events: ["task.created", "run.done"], secret: "s3cr3t", enabled: true, createdAt: "2026-01-01" },
  ],
  total: 1,
};
const mockConnectors = {
  items: [
    { kind: "linear", enabled: true, lastSyncAt: "2026-01-01T10:00:00Z" },
    { kind: "github", enabled: false, lastSyncAt: null },
  ],
  total: 2,
};
```

## RoutingRulesScreen steps

1. Load + render — both rules visible with name, actionAgent, priority, enabled
2. `j`/`k` — cursor moves
3. `Space`/`Enter` — toggle enabled → `routingRules.update({ id, enabled: !current })` called
4. `n` key — create form overlay opens; fill fields → `routingRules.create` called
5. `d` key — delete confirm → `routingRules.delete({ id })` called on confirm
6. `t` key — test routing decision overlay; fill input → `routingRules.decide` called; result shown
7. Disabled rule visually different (dim/strikethrough) vs enabled
8. Empty list renders without crash

## renderWebhookList (pure function) steps

1. Call with mockWebhooks — output contains url, events joined, enabled status
2. Total count visible ("Webhooks (1)")
3. Hint `[s] Sync [Enter] Config [q] Back` or similar present

## renderConnectorList (pure function) steps

1. Call with mockConnectors — output contains each kind, ON/OFF, lastSyncAt
2. Disabled connector shows "OFF", no lastSyncAt shows "never"
3. Total count visible ("Connectors (2)")

## Assertions

- [ ] RoutingRulesScreen toggle/create/delete all call correct callers
- [ ] Test-decision overlay fires routingRules.decide and shows result
- [ ] renderWebhookList: url, events, enabled in output
- [ ] renderConnectorList: kind, ON/OFF, lastSyncAt in output
- [ ] All screens render without crash on empty data
