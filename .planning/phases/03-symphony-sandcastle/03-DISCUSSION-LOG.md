# Phase 3: Symphony + Sandcastle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 3-Symphony + Sandcastle
**Areas discussed:** Tracker Authority + Issue Model, WORKFLOW.md Runtime Behavior, Dispatch + Sandbox Posture, Conformance Proof Shape, Artifact + Session Lifecycle

---

## Tracker Authority + Issue Model

| Option | Description | Selected |
|--------|-------------|----------|
| Strict spec | Adapter always returns all 12 fields; missing local data becomes explicit null/default only where spec allows. | yes |
| Compatibility shim | Adapter tolerates partial local rows and backfills fields at API boundary for faster delivery. | |
| Planner decides | Planner picks strictness based on current entity/schema fit. | |

**User's choice:** Strict spec.
**Notes:** `blocked_by` must be full `{id, identifier, state}` refs. `agent_runs.orchestration_state` is the state authority. External trackers are ingest-only in Phase 3, with dispatch-capable external adapter parity documented for future versions.

---

## WORKFLOW.md Runtime Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Spec-complete control | Support prompt body, typed config, env/path expansion, hooks, Codex command/policy fields, server config, reload. | yes |
| Core control only | Support prompt + retry/stall/workspace settings first; defer server/policy extras. | |
| Planner decides | Planner scopes to green conformance with least code. | |

**User's choice:** Spec-complete control.
**Notes:** Invalid reload keeps last good config and emits visible error. Unknown prompt variables/filters fail closed. Approval/sandbox posture must document exact defaults and `noSandbox` trust boundary.

---

## Dispatch + Sandbox Posture

| Option | Description | Selected |
|--------|-------------|----------|
| Codex primary | `codex app-server` is the default conformance path; other agents have adapter coverage. | partial |
| All CLI agents configurable | Claude Code, Codex, OpenCode, Gemini, and Pi can all be primaries; Codex is default. | yes |
| Full e2e all providers | Every provider and agent launches in automated tests. | |

**User's choice:** All five CLI agents can be primaries; Codex is default.
**Notes:** Default sandbox mode is `noSandbox`, but Docker, Podman, Vercel, Daytona, Modal, and E2B should be fully supported when configured. Agent config resolves through `WORKFLOW.md` overrides merged with persisted `AgentProfile` defaults. Non-default agents need contract parity/adapter-swap tests.

---

## Conformance Proof Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Spec conformance gate | Generated trace plus focused §17.1-17.7 tests are hard gate; e2e dispatch proof covers default path and contract parity. | yes |
| Surface parity gate | Web/CLI/TUI dispatch flows all must be e2e green now. | yes |
| Planner decides | Planner picks strongest feasible evidence without expanding scope. | |

**User's choice:** Spec conformance gate plus surface parity gate.
**Notes:** Tests must be RED-first slices. `docs/symphony-conformance.md` stays generated from `scripts/gen-conformance-trace.ts`. CI should use fakes for deterministic conformance and run real-binary smoke tests when binaries are available.

---

## Artifact + Session Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Full run record | Transcript JSONL, workspace diff, harvested artifacts, token usage, sandbox mode, iteration count, exit reason. | yes |
| Minimal run record | Run row + transcript path + exit status; artifacts verified later. | |
| Planner decides | Planner persists what current entities support. | |

**User's choice:** Full run record.
**Notes:** Artifact harvest uses configured glob from `WORKFLOW.md` or profile config. Retry/continuation passes prior transcript/session info when supported and fails clearly or no-ops by declared capability when unsupported. Token accounting consumes cumulative `thread/tokenUsage/updated` by `thread_id`.

---

## the agent's Discretion

- Planner chooses exact internal services/repositories and test-file breakdown while preserving existing architecture decisions.
- Planner chooses exact provider flag names and real-binary smoke-test placement.

## Deferred Ideas

- Dispatch-capable external tracker parity for Linear/GitHub Issues/etc. in future version.
