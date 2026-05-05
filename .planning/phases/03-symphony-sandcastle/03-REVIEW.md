---
phase: 03-symphony-sandcastle
reviewed: 2026-05-05T00:55:00Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - .symphony-conformance.lock
  - docs/symphony-conformance.md
  - scripts/gen-conformance-trace.ts
  - src/agents/resolve-agent-run-config.ts
  - src/cli/symphony.test.ts
  - src/cli/symphony.ts
  - src/db/entities/orchestration/AgentRun.ts
  - src/db/entities/orchestration/states.ts
  - src/db/migrations/Migration20260505010000_agent_runs_lifecycle_codex_columns.ts
  - src/db/migrations/Migration20260505023000_agent_runs_app_server_ids.ts
  - src/orchestration/__tests__/session-resume.test.ts
  - src/orchestration/__tests__/symphony-conformance.test.ts
  - src/orchestration/artifact-harvest-hook.test.ts
  - src/orchestration/sandbox-runner.test.ts
  - src/orchestration/sandbox-runner.ts
  - src/orchestration/session-resume.ts
  - src/orchestration/states.ts
  - src/orchestration/symphony/app-server-client.test.ts
  - src/orchestration/symphony/app-server-client.ts
  - src/orchestration/symphony/app-server-protocol.ts
  - src/orchestration/symphony/dispatch.ts
  - src/orchestration/symphony/http-server.ts
  - src/orchestration/symphony/linear-tracker.ts
  - src/orchestration/symphony/retry.ts
  - src/orchestration/symphony/schemas.ts
  - src/orchestration/symphony/stall.ts
  - src/orchestration/symphony/telemetry.ts
  - src/orchestration/symphony/tracker.ts
  - src/orchestration/symphony/workflow-runtime.ts
  - src/orchestration/symphony/workspace.ts
  - src/orchestration/token-tracking.ts
  - src/trpc/routers/orchestration.ts
  - src/tui/screens/orchestration.ts
  - src/web/src/routes/doctor/+page.server.ts
  - src/web/src/routes/doctor/page.server.test.ts
  - src/web/src/routes/orchestration/+page.server.ts
findings:
  critical: 4
  warning: 8
  info: 3
  total: 15
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-05-05T00:55:00Z
**Depth:** standard
**Files Reviewed:** 36
**Status:** issues_found

## Summary

Phase 3 implements Symphony orchestration: dispatch loop, state machine, retry/stall detection, workspace lifecycle, Codex app-server JSONL client, session resume, HTTP extension server, and CLI/TUI/Web dispatch parity. The architecture is well-decomposed with clean dependency injection.

Key concerns: a path traversal vulnerability in workspace cleanup, a module-level mutable counter causing non-deterministic behavior, an XSS vector in the HTTP dashboard, and a race condition in the app-server approval flow. Several correctness issues in edge case handling.

## Critical Issues

### CR-01: Path traversal bypass in workspace assertWorkspacePathInOrgRoot

**File:** `src/orchestration/symphony/workspace.ts:143-157`
**Issue:** The path traversal guard has inverted logic. The condition `relativeTarget !== "" && !relativeTarget.startsWith("..") && !isAbsolute(relativeTarget)` returns early (allows) when the relative path does NOT start with `..` and is NOT absolute -- this is the SAFE case, which is correct. However, it ALSO returns early when `relativeTarget === ""` (the orgRoot itself). The real bug: when `relativeTarget` is exactly `""`, the function throws, meaning you cannot destroy a workspace that IS the orgRoot directory itself. More critically, `resolve()` + `relative()` can be tricked with symlinks -- the function operates on lexical paths, not real paths. An attacker-controlled `workspacePath` containing `/../` segments that resolve lexically to inside the orgRoot but actually point outside via symlinks would bypass this check, allowing `rm -rf` of arbitrary directories.
**Fix:**
```typescript
function assertWorkspacePathInOrgRoot(
  workspacePath: string,
  orgId: string,
  root?: string,
): void {
  const orgRoot = resolve(workspaceRoot(root), orgId);
  // Use realpath to resolve symlinks before checking containment
  const target = resolve(workspacePath);
  const relativeTarget = relative(orgRoot, target);

  // Safe: relative path exists, doesn't escape via .., and isn't absolute
  if (relativeTarget.length > 0 && !relativeTarget.startsWith("..") && !isAbsolute(relativeTarget)) {
    return;
  }

  throw new Error(`Refusing to remove workspace outside org root: ${workspacePath}`);
}
```
Consider also using `fs.realpath()` on both paths before comparison to defeat symlink attacks.

### CR-02: XSS in HTTP dashboard via unsanitized issue identifiers

**File:** `src/orchestration/symphony/http-server.ts:57-68`
**Issue:** The GET `/` route builds HTML by string interpolation from database values (`r.issue_identifier`, `r.state`, `r.attempt`) without HTML escaping. If an issue identifier contains `<script>` tags or other HTML, it is rendered directly into the response. This is a stored XSS vulnerability -- any issue synced from Linear or created via API with a malicious title/identifier will execute JavaScript in the operator's browser.
**Fix:**
```typescript
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Then in the HTML template:
...s.running.map((r) => `<li>${escapeHtml(r.issue_identifier)} — ${escapeHtml(r.state)}</li>`),
```

### CR-03: Module-level mutable counter in linear-tracker produces non-deterministic IDs

**File:** `src/orchestration/symphony/linear-tracker.ts:214`
**Issue:** `candidateIdCounter` is a module-level `let` that increments on every call to `mapSyncItemToCandidateIssue`. This counter persists across the process lifetime but is never used in the output -- the function actually uses `deterministicUuid(item.externalId)` for the `id` field. The counter is dead code that was likely meant to be used but was replaced. The `deterministicUuid` function itself (line 238-244) uses a 32-bit hash (`(hash << 5) - hash + charCodeAt`) which has extremely high collision probability for any significant number of external IDs. Two different Linear issue IDs can produce the same UUID, causing silent data corruption when used as candidate IDs in the tracker.
**Fix:** Remove the dead `candidateIdCounter`. Replace `deterministicUuid` with a proper UUID v5 implementation or use a cryptographic hash:
```typescript
import { createHash } from "node:crypto";

function deterministicUuid(seed: string): string {
  const hash = createHash("sha256").update(seed).digest("hex");
  // Format as UUID v4 shape with version nibble
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
```

### CR-04: App-server approval/user-input fire-and-forget creates unhandled race

**File:** `src/orchestration/symphony/app-server-client.ts:444-455`
**Issue:** `_handleApproval` fires a `Promise.race` between the policy callback and a timeout, then writes back to `proc.stdin` in a `.then()`. This runs completely detached from the main `_readUntilComplete` promise chain. If the process exits or the turn completes before the approval `.then()` fires, `_sendRequest` writes to a closed stdin, and while it's wrapped in try/catch, the real problem is the race: the `settle()` function in `_readUntilComplete` closes the readline interface, but the fire-and-forget `.then()` can still attempt to write afterward. In edge cases, the `proc.killed` check on line 449 is insufficient because the process may not yet be marked as killed but its stdin is already closed/destroyed, causing an unhandled write error that the catch block silently swallows -- meaning approval responses are silently lost.
**Fix:** Track pending approval promises and await them before settling, or use an AbortController signal to cancel pending approvals when the turn completes:
```typescript
private _pendingApprovals: Promise<void>[] = [];

private _handleApproval(payload: ..., proc: ...): void {
  const p = Promise.race([...]).then(...).catch(() => {});
  this._pendingApprovals.push(p);
}

// In settle(), before resolving:
await Promise.allSettled(this._pendingApprovals);
```

## Warnings

### WR-01: `importOptionalSandbox` uses `new Function` to bypass bundler -- equivalent to eval

**File:** `src/orchestration/sandbox-runner.ts:423-426`
**Issue:** `new Function("specifier", "return import(specifier)")` is a dynamic code generation pattern functionally equivalent to `eval`. This bypasses CSP policies and static analysis. While intentional (to avoid bundler inlining), it should be documented with a security justification comment and ideally behind a lint suppression.
**Fix:** Add explicit documentation:
```typescript
// SECURITY: Dynamic import via new Function() to prevent bundler from
// inlining optional sandbox providers. This is equivalent to eval() and
// requires the caller to validate `specifier` is a known package name.
// eslint-disable-next-line no-new-func
async function importOptionalSandbox<T>(specifier: string): Promise<T> {
```

### WR-02: `loadOptionalOTelApi` uses `new Function` for require -- same eval pattern

**File:** `src/orchestration/symphony/telemetry.ts:93-98`
**Issue:** Same `new Function("specifier", "return require(specifier)")` pattern. Both instances should be audited together.
**Fix:** Same as WR-01 -- add security documentation and consider a centralized `safeRequire` utility.

### WR-03: `stubCaller().dispatchRun` returns `sandboxMode: "noSandbox"` which violates DB constraint

**File:** `src/cli/symphony.ts:373`
**Issue:** The `stubCaller()` function returns `sandboxMode: "noSandbox"` in the `dispatchRun` stub. While this is the CLI-facing display value (not the DB value), it creates confusion because the `SandboxMode` type in `sandbox-runner.ts:107` does not include `"noSandbox"` -- it only has `"host" | "docker" | "podman" | "vercel" | "daytona" | "modal" | "e2b"`. The test stubs also use `"noSandbox"` (symphony.test.ts:38). This inconsistency between the API surface value and the type system means type checking does not catch mismatches.
**Fix:** Define a `DisplaySandboxMode` type that includes `"noSandbox"` for API responses, or use `"host"` consistently and map only at the final CLI print layer.

### WR-04: `dispatch.ts` processCandidate silently swallows candidate errors

**File:** `src/orchestration/symphony/dispatch.ts:178`
**Issue:** The catch block in the tick loop (`catch { result.failed += 1; }`) swallows the error entirely with no logging. If a candidate fails to claim/dispatch, operators have zero visibility into why. This makes production debugging extremely difficult for intermittent failures.
**Fix:**
```typescript
} catch (err) {
  result.failed += 1;
  logSymphonyEvent("error", "candidate dispatch failed", {
    org_id: deps.orgId,
    error: err instanceof Error ? err.message : String(err),
  });
}
```

### WR-05: `sweepTerminalWorkspaces` does not validate workspace paths before rm -rf

**File:** `src/orchestration/symphony/workspace.ts:239-243`
**Issue:** `sweepTerminalWorkspaces` calls `rm(workspacePath, { recursive: true, force: true })` directly from the DB value without calling `assertWorkspacePathInOrgRoot`. A corrupted or maliciously set `workspacePath` in the database could cause deletion of arbitrary directories during startup sweep.
**Fix:** Add the same org-root safety assertion used by `destroyWorkspace`:
```typescript
try {
  assertWorkspacePathInOrgRoot(workspacePath, orgId, opts.root);
  await rm(workspacePath, { recursive: true, force: true });
```

### WR-06: `_nextId` in app-server-protocol is global mutable state shared across all clients

**File:** `src/orchestration/symphony/app-server-protocol.ts:180`
**Issue:** `_nextId` is a module-level `let` that auto-increments for every `makeRequest` call across all `CodexAppServerClient` instances in the process. If multiple clients run concurrently, request IDs from different clients will interleave, making protocol debugging difficult. The `_resetIdCounter` export (line 196) is test-only but has no guard preventing production use.
**Fix:** Move the ID counter into the `CodexAppServerClient` instance, or at minimum document the global nature and add a `@internal` JSDoc to `_resetIdCounter`.

### WR-07: `extractThreadStatus` returns params directly without null-checking nested fields

**File:** `src/orchestration/symphony/app-server-protocol.ts:262-265`
**Issue:** `extractThreadStatus` casts `msg.params` directly to `ThreadStatusChangedParams | null` without validating the structure. If the app-server sends a `thread/status/changed` notification with malformed params (e.g., missing `status` object), downstream code in `_handleNotification` (app-server-client.ts:399-418) accesses `statusPayload.status.waitingOnApproval` etc. which would throw a TypeError, crashing the orchestration loop.
**Fix:**
```typescript
export function extractThreadStatus(msg: JsonRpcNotification): ThreadStatusChangedParams | null {
  if (msg.method !== "thread/status/changed") return null;
  const params = msg.params as Record<string, unknown> | undefined;
  if (!params?.threadId || typeof params.status !== "object" || params.status === null) return null;
  return params as unknown as ThreadStatusChangedParams;
}
```

### WR-08: `CodexConfigSchema` allows negative `stall_timeout_ms` via `.int()` without `.positive()`

**File:** `src/orchestration/symphony/workflow-runtime.ts:99`
**Issue:** `stall_timeout_ms: z.number().int().default(300_000)` uses `.int()` but not `.positive()`. A WORKFLOW.md with `codex.stall_timeout_ms: 0` or `codex.stall_timeout_ms: -1` would be accepted, causing the stall scanner to either fire immediately on every scan or never fire, depending on the comparison logic. The top-level `WorkflowConfigSchema` (schemas.ts:103) correctly uses `.positive()` for `stallTimeoutMs`, but the nested codex config does not.
**Fix:**
```typescript
stall_timeout_ms: z.number().int().positive().default(300_000),
```

## Info

### IN-01: Dead variable `titleSlug` in tracker.ts toSymphonyIssue

**File:** `src/orchestration/symphony/tracker.ts:537-561`
**Issue:** `titleSlug` is computed on line 537-539 but immediately voided on line 561 (`void titleSlug`). The `void` suppression is a code smell -- the variable should be removed entirely if unused.
**Fix:** Remove `titleSlug` and the `void` statement.

### IN-02: Duplicated `parseFlags` function across three modules

**File:** `src/orchestration/token-tracking.ts:49-57`, `src/orchestration/session-resume.ts:131-138`, `src/orchestration/sandbox-runner.ts:393-400`
**Issue:** The feature flag parsing function is duplicated in three files with identical logic. This is a maintenance burden and risks divergence.
**Fix:** Extract to a shared `src/orchestration/feature-flags.ts` utility.

### IN-03: `console.error` in stall.ts defaultScannerErrorHandler

**File:** `src/orchestration/symphony/stall.ts:151`
**Issue:** Direct `console.error` usage instead of the structured logging sink defined in `telemetry.ts`. The project has a `logSymphonyEvent` function specifically for this purpose.
**Fix:** Use `logSymphonyEvent("error", "stall scanner failed", { error: String(error) })` instead.

---

_Reviewed: 2026-05-05T00:55:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
