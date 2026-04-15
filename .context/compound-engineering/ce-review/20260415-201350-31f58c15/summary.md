# ce:review Run 20260415-201350-31f58c15

**Mode:** autofix  
**Plan:** docs/plans/2026-04-15-001-feat-fulcrum-install-to-value-plan.md  
**Base:** c415413  
**Verdict:** Ready with fixes (6 safe_auto applied; residual gated/manual items below)

## Applied Fixes (safe_auto)

1. `scripts/gen-claude-md.ts:41` — Guard reversed marker order in `spliceSection` (`endIdx < startIdx` → append path)
2. `scripts/gen-claude-md.ts:55` — Guard reversed marker order in `spliceToolCount` (same guard)
3. `packages/cli/src/index.ts:597` — `probeMonitor`: `resp.status < 500` → `resp.ok` (2xx only; avoids 4xx false-positive)
4. `packages/cli/src/index.ts:1061` — NaN guard for `FULCRUM_MONITOR_PORT`: `parseInt(...) || 4721`
5. `packages/cli/src/index.ts:26` — Stale "13 control tools" in usage text replaced with accurate description
6. `agent-integration/install.ts:1044` — `writeSeedData`: guard both `workspaceId && projectId` before write_memory
7. `agent-integration/install.ts:153` — `recoveryHintFor("Regenerate CLAUDE.md")`: corrected to `pnpm gen:claude-md`

Commit: `55d23a8`

## Residual Actionable (gated_auto / manual)

| Severity | File | Issue | Class |
|----------|------|-------|-------|
| P1 | `packages/cli/src/index.ts:1066` | No monitor cleanup on exit — `monitorServer.stop()` not called in SIGTERM/SIGINT handler | gated_auto |
| P1 | `packages/cli/src/index.ts:1008+1207` | Duplicate `get_current_context` handlers diverge: stdio uses `currentProjectIds()`, HTTP uses `config.workspace_id`. Data integrity risk. | gated_auto |
| P1 | `packages/cli/src/tests/serve-mcp-monitor.test.ts` | `probeMonitor()` real fetch logic is entirely untested (cache TTL, connection-refused, 4xx path) | manual |
| P1 | `packages/cli/src/tests/serve-mcp-monitor.test.ts` | `_monitorStarted` double-start guard untested | manual |
| P2 | `agent-integration/claude/CLAUDE.md` (lifecycle section) | Lifecycle step 1 instructs agents to call `get_workspace_status` before they have a workspace_id — will fail. Fix: list `get_current_context` as step 1. | manual |
| P2 | `agent-integration/claude/CLAUDE.md` | Monitor described as optional separate process — stale after auto-start change | manual |
| P2 | `packages/fulcrum-mcp/src/tests/index.test.ts:20` | Bin entry assertion `toContain('index.ts')` will break on compiled publish (`index.js`) | gated_auto |
| P2 | `packages/cli/src/index.ts:589` | `probeMonitor` no in-flight dedup: N concurrent calls each launch independent fetch before cache populates | advisory |
| P3 | `agent-integration/install.ts:1024` | `ctxChild.error`/`writeChild.error` not checked in `writeSeedData` — timeouts fail silently | advisory |

## Advisory

- `probeMonitor` cache is module-level; stale `monitor_running: false` can persist across hot-module test reloads
- `suggested_next_call` is hardcoded to `mcp__fulcrum__list_tasks` for all sessions — not dynamic; should be documented in tool description  
- `_monitorStarted` never resets; future tests calling `runServeMcp()` directly will see polluted state
- CHANGELOG entry GAP-MCP-5 says output fields are optional but `readiness` is now `required` in outputSchema — contradiction

## Requirements Coverage (plan_source: explicit)

| Req | Status |
|-----|--------|
| R3 — npx fulcrum-mcp < 10s | ✓ Unit 7 complete |
| R4 — pnpm install without kuzu | ✓ kuzu in optionalDependencies |
| R6 — CLAUDE.md tool count via CI | ✓ check-claude-md.yml + gen script |
| R7 — serve mcp auto-starts monitor | ✓ Unit 6 |
| R8 — get_current_context readiness object | ✓ Unit 5 |
| R9 — doctor gate + seed data | ✓ Unit 4 |
| R1/R2 — hook_events passive trace | ✓ Units 1+2 (prior commits) |
| R5 — source field on memories | ✓ Unit 2 (prior commits) |

All requirements met.
