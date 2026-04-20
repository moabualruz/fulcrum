# Fulcrum → Gemini CLI policies

Tier-2 (extension-scope) TOML rules layered above Gemini defaults and below
user/admin policies. Schema: `docs/reference/policy-engine.md`.

## Files

- **`fulcrum-sensitive.toml`** — `ask_user` prompts for high-stakes Fulcrum
  MCP calls (team invocation, memory-correction, agent-definition edits).
  `ask_user` IS honored at extension tier.
- **`fulcrum-subagent-boundaries.toml`** — `deny` rules scoped by `subagent =`
  to enforce role boundaries via the policy engine rather than prompt text.
  `deny` IS honored at extension tier.

## What's NOT here (and why)

An earlier `fulcrum-core.toml` shipped 24 `decision = "allow"` rules meant to
pre-approve routine Fulcrum MCP calls (heartbeat, recall, workspace status).
It was removed 2026-04-20.

**Rationale** (`docs/extensions/reference.md` §"Policy Engine Rules"):

> "allow decisions and `yolo` mode are ignored for security" — at the
> extension tier.

Extensions can only subtract tools (via `excludeTools`) or `deny`/`ask_user`
them via policies. Extensions cannot enable tools that Gemini's default tier
would otherwise prompt on.

If you want routine Fulcrum MCP calls pre-approved, install the allow rules
at **user tier**: place the TOML at `~/.gemini/policies/fulcrum-allow.toml`.
The Fulcrum installer (`installGemini`) offers this as an opt-in step.
