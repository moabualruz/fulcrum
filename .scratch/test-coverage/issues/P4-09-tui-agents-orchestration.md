---
Status: ready-for-agent
Phase: P4
Priority: high
Test-file: tests/tui/agents-orchestration.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Agents + Orchestration Screens

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — agents orchestration screens`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — agents orchestration screens`

## What to test

- `src/tui/screens/agents.ts` — `AgentsScreen`
- `src/tui/screens/orchestration.ts` — `OrchestrationScreen`
- `src/tui/screens/orchestrator-pane.ts` — `OrchestratorPane`

## Setup

```ts
const mockAgents = [
  { id: "a1", label: "claude-opus", capabilities: ["code", "plan"] },
  { id: "a2", label: "codex", capabilities: ["code"] },
];
const mockRuns = [
  { id: "r1", agent: "claude-opus", claimState: "running", taskTitle: "Fix bug", projectName: "Alpha" },
  { id: "r2", agent: "codex", claimState: "idle", taskTitle: null, projectName: null },
];
const mockSymphonyRuns = [
  { id: "sr1", taskTitle: "Deploy", agent: "claude", symphonyState: "running", attemptCount: 1, startedAt: new Date(), workspacePath: "/tmp/ws", lastErrorKind: null, nextRetryAt: null },
];
```

## AgentsScreen steps

1. Load + render — both agents visible with label and capabilities
2. `j`/`k` — cursor moves
3. `Enter` → detail mode — selected agent capabilities shown in full
4. `d` key in list — dispatch overlay opens
5. Fill projectId + taskId in overlay + `Enter` — `agent_runs.create` called
6. `Esc` — overlay closes without dispatching
7. `q` — exits screen

## OrchestrationScreen steps

1. Load + render — orchestrator status (running/stopped) + runs listed
2. Subscription: simulate `orchestration-state-change` push → run state updates in list
3. `j`/`k` — cursor moves through runs
4. Subscription teardown: `destroy()` → all TuiSubscriptions removed

## OrchestratorPane steps

1. Load + render — symphony runs table with columns: taskTitle, agent, symphonyState, attemptCount, elapsed
2. State filter tabs (`a`=all, `r`=running, `f`=failed) — verify filtered view
3. `Enter` on run — detail overlay shows full run info including workspacePath
4. `R` key — retry action called
5. `c` key — cancel action called
6. 2s poll: mock timer advance → `symphony.listRuns` called again

## Assertions

- [ ] AgentsScreen renders agents, dispatch overlay fires agent_runs.create
- [ ] OrchestrationScreen subscription updates run state without full reload
- [ ] OrchestratorPane state filter tabs filter correctly
- [ ] OrchestratorPane retry/cancel call correct callers
- [ ] All screens render without crash on empty data
