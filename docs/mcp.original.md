# MCP Policy

> All MCPs disabled by default. CLI + skills is the preferred path (see [capabilities.md](capabilities.md), [skills.md](skills.md)).

## 1. Why default-off

MCPs spawn long-running processes and consume 55k–100k tokens at startup with 5+ servers active — before your first message. A CLI + skill achieves the same with zero overhead. Register MCPs disabled; enable per-session when genuinely needed.

## 2. Disable claude.ai defaults

The claude.ai integrated MCPs (Gmail, Drive, Calendar) auto-inject into every Claude Code session, consuming 55-100k tokens at startup regardless of relevance. As of 2026-04-27 there is **no supported per-surface toggle** — Anthropic tracks this in [issue #47881](https://github.com/anthropics/claude-code/issues/47881) (open). `permissions.deny: ["mcp__claude_ai_*"]` blocks tool calls but the connector definitions still load (verified in [issue #29804](https://github.com/anthropics/claude-code/issues/29804)). `ENABLE_CLAUDEAI_MCP_SERVERS=false` and `claude mcp remove` are also non-functional for these integrated connectors.

**Recommended: account-level disconnect.** Go to claude.ai → Settings → Connectors and remove Gmail / Drive / Calendar. Durable, official, kills the auto-injection at the source. Tradeoff: also removes them from Chat. The honest workaround is **two accounts** — a clean account (no integrations) for API-key Claude Code sessions, the integrated account for Chat.

**Escape hatch (advanced, may break on update):** the undocumented GrowthBook flag in `~/.claude.json`:
```json
{
  "cachedGrowthBookFeatures": {
    "tengu_claudeai_mcp_connectors": false
  }
}
```
Currently the only mechanism that drops the tokens without removing the connectors from the account ([issue #44112](https://github.com/anthropics/claude-code/issues/44112)). The flag name is undocumented and Anthropic can change it any release. Do not rely on this in shared / managed configs.

## 3. MCP catalogue — opt-in only

One MCP is always on — `deepwiki`. It has no CLI or REST alternative; it is free, requires no auth, and has no documented rate limits.

```bash
claude mcp add -s user deepwiki --transport http https://mcp.deepwiki.com/mcp
```

Tools: `ask_question`, `read_wiki_contents`, `read_wiki_structure` — public repos only.

> MCP and CLI hit the same underlying API with the same quota — switching protocol does not change rate limits (verified: Context7, Tavily primary docs 2026-04-27). No other MCPs are needed.

## Cross-agent

Per-agent MCP configuration syntax differs:
- Codex: `~/.codex/config.toml`
- Gemini: `~/.gemini/settings.json` (use `httpUrl`, hyphens not underscores)
- OpenCode: `~/.config/opencode/opencode.json` (`type: remote`)
- Pi: **no MCP support by design** — use REST via `xh`/`curl` instead

Full configs in [agents.md](agents.md).
