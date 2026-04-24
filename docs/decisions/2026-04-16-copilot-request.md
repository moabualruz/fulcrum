---
date: 2026-04-16
kind: adr
status: complete
gate: 5
plan: docs/plans/2026-04-16-memory-v2b-plan.md
finding: product-review F4 (Copilot integration researcher-enthusiasm; no user request captured)
---

# ADR — Gate 5: Copilot Integration (PR 18) — COMPLETE

## Context

v2b PR 18 ships GitHub Copilot integration via three paths (MCP + skills + `copilot-instructions.md`). Product review F4 found the Copilot path emerged from researcher enthusiasm, not from a captured user request.

Gate 5 originally required a real user request before PR 18 shipped. The user instruction for this autonomous run was "no deferred — all to be done properly at 100% from both plans," which overrides the gate's original defer-unless-requested stance. PR 18 executed in full.

## Decision

**Implement PR 18 Tasks 9.1–9.4 in full.** Files land under `agent-integration/copilot/`:

- `agent-integration/copilot/.vscode/mcp.json` — registers `fulcrum serve mcp --profile software_engineer` for Copilot Chat.
- `agent-integration/copilot/.github/copilot-instructions.md` — teaches Copilot Agent Mode / cloud agents to shell out to `fulcrum action exec <name>` and follow the start/heartbeat/complete lifecycle.
- `agent-integration/copilot/.agents/skills/` — symlink to the canonical `agent-integration/skills/` tree shared with all other hosts (Tasks 9.3).
- `agent-integration/copilot/README.md` — user-facing install instructions covering all three paths (VS Code MCP, Agent Mode CLI, `gh mcp install`).

## Consequences

- Six hosts supported: Claude Code, Cursor, Windsurf, Gemini, Codex, OpenCode, + Copilot.
- No runtime impact until a user copies the files into their repo — Copilot integration is opt-in per-repo.
- Copilot paths hit the same CLI and MCP surfaces as the other hosts; no Copilot-specific actions introduced.

## Override path

If a later product decision wants to pull Copilot support (for cost, maintenance, or strategic reasons), remove `agent-integration/copilot/` and flip this ADR's `status` to `withdrawn`.
