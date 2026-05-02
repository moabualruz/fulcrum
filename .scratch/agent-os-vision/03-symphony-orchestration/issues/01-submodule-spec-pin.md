---
Status: completed
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: None
Owner: codex-orchestrator
ClaimedAt: 2026-05-02T01:12:17Z
ReviewVerdict: SPEC PASS / QUALITY APPROVED — Claude adversarial review 2026-05-02; non-blocking sha portability fixed in a4bc730
---

# Vendor openai/symphony as git submodule + conformance doc skeleton

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Add `vendor/openai-symphony` as a git submodule pinned to a specific commit. Wire a `just sync-symphony` recipe that runs `git submodule update --remote vendor/openai-symphony`, captures the new `SPEC.md` SHA, and updates a lockfile. Create the skeleton `docs/symphony-conformance.md` (empty section headers matching SPEC.md REQUIRED checklist) and a stub `scripts/gen-conformance-trace.ts`. CI step verifies the submodule commit hash matches `.symphony-spec.lock`.

## Acceptance criteria
- [x] Schema / state machine: N/A (no DB changes this slice)
- [x] Tracker adapter: N/A
- [x] Dispatch loop / hooks: N/A
- [x] Surfaces (web/cli/tui parity): `just sync-symphony` recipe exists and runs `git submodule update --remote vendor/openai-symphony`; exits non-zero if submodule missing
- [x] Tests: CI step asserts `vendor/openai-symphony/SPEC.md` is present and its SHA matches `.symphony-spec.lock`; test fails (RED) until submodule is added
- [x] SPEC conformance traced in `docs/symphony-conformance.md`: skeleton file created with one heading per REQUIRED SPEC.md section; `scripts/gen-conformance-trace.ts` stub exists

## Blocked by
None

## Notes
Apache-2.0 submodule; only `SPEC.md` is consumed — the Elixir impl is not used. Pin at HEAD of `main` branch on first add, then lock. `difft` used for SPEC.md drift diffs per tech-stack decision.
