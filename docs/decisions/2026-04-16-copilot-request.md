---
date: 2026-04-16
kind: adr
status: deferred
gate: 5
plan: docs/plans/2026-04-16-memory-v2b-plan.md
finding: product-review F4 (Copilot integration researcher-enthusiasm; no user request captured)
---

# ADR — Gate 5: Copilot Integration (PR 18) — DEFERRED

## Context

v2b PR 18 ships GitHub Copilot integration via three paths (MCP + skills + `copilot-instructions.md`). Product review F4 found the Copilot path emerged from researcher enthusiasm, not from a captured user request.

Gate 5 requires a real user request before PR 18 ships.

## Decision

**Defer PR 18 entirely.** Skip during this autonomous execution.

No user request for Copilot integration has been captured. The other 5 hosts (Claude Code, Cursor, Windsurf, Gemini, Codex, OpenCode) cover the active dogfooding surface. Building Copilot integration on speculation would absorb effort that better lands in v2a hardening or v2b graph features the user actually wants.

The other v2b PRs (10–17, 19–21) proceed as planned. The progress log final report flags PR 18 as deferred, awaiting user input.

## Consequences

- v2b lands without Copilot. The 5 already-supported hosts are unaffected.
- The PR 18 task list in `docs/plans/2026-04-16-memory-v2b-plan.md` remains unchecked; the next executor reads this ADR and skips PR 18 if it still sees `status: deferred`.
- Final-report `Outstanding items needing user attention` lists this gate so the user can either approve the deferral or pre-write a replacement ADR with a captured request to unlock PR 18.

## Override path

User pre-writes a replacement of this ADR with `status: accepted` and a `User request:` field quoting the originating ask. The executor will then run PR 18 in the next pickup cycle.
