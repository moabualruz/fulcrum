# fulcrum-agent-fanout

Parse the canonical Fulcrum skill and rule sources under `agent-integration/skills/` and `agent-integration/rules/` and emit per-agent artifacts for Claude Code, Codex CLI, Gemini CLI, opencode, PI, Copilot, Cursor, and Windsurf.

Per-skill and per-rule identity is preserved across every emit target: skills are never concatenated without markers, and never silently dropped.

Part of the agent-parity plan at `docs/plans/2026-04-19-004-agent-parity-plan.md` (PR 1).
