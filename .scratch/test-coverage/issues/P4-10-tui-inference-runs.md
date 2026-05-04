---
Status: ready-for-agent
Phase: P4
Priority: medium
Test-file: tests/tui/inference-runs.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Inference Dashboard + Runs Screens

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — inference runs screens`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — inference runs screens`

## What to test

- `src/tui/screens/inference.ts` — `InferenceDashboardScreen`
- `src/tui/screens/runs.ts` — `RunsScreen`
- `src/tui/screens/artifacts.ts` — `ArtifactsScreen`

## Setup

```ts
const mockSidecar = { status: "running", pid: 1234, message: null };
const mockModels = [
  { id: "llama3", kind: "local", status: "loaded", sizeBytes: 4_000_000_000, default: true },
  { id: "mistral", kind: "local", status: "available", sizeBytes: 2_000_000_000, default: false },
];
const mockRuns = [
  { id: "run-1", agent: "claude", status: "done", taskTitle: "Fix bug", projectName: "Alpha", startedAt: new Date(), logLines: ["Step 1", "Step 2"] },
  { id: "run-2", agent: "codex", status: "running", taskTitle: null, projectName: null, startedAt: new Date(), logLines: [] },
];
const mockArtifacts = [
  { id: "art-1", filename: "output.txt", mime: "text/plain", path: "/tmp/out.txt", sizeBytes: 1024, createdAt: new Date() },
];
```

## InferenceDashboardScreen steps

1. Load + render — sidecar status (running/stopped/error) visible, models listed
2. `s` key — `inference.start` called when status is "stopped"
3. `S` key — `inference.stop` called when status is "running"
4. Model list renders with name, kind, size, default badge
5. Subscription: simulate status-change push → sidecar status updates
6. Render with status "error" + message — error message visible

## RunsScreen steps

1. Load + render — both runs visible with agent, status, taskTitle
2. `j`/`k` — cursor moves
3. `Enter` — `onOpenRun` fires with run id
4. `n` key — dispatch overlay opens; fill form → `agent_runs.create` called
5. Subscription: new run pushed → appears in list immediately
6. `logLines` for selected run visible in detail pane (if screen shows log)

## ArtifactsScreen steps

1. Load with filter — artifacts matching filter rendered
2. `j`/`k` — cursor moves
3. `Enter` — artifact preview overlay (text/image/binary) renders without crash
4. Filter by mime type — only matching artifacts shown
5. Empty list renders without crash

## Assertions

- [ ] InferenceDashboardScreen start/stop calls correct caller
- [ ] InferenceDashboardScreen subscription updates status
- [ ] RunsScreen dispatch fires agent_runs.create
- [ ] ArtifactsScreen preview renders for text, image, binary mime types
- [ ] All screens handle empty data without crash
