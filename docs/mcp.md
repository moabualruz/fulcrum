# MCP Policy

> All MCPs disabled by default. CLI + skills preferred path (see [capabilities.md](capabilities.md), [skills.md](skills.md)).

## 1. Why default-off

MCPs spawn long-running processes, eat 55k–100k tokens at startup with 5+ servers active — before first message. CLI + skill same result, zero overhead. Register MCPs disabled; enable per-session when needed.

## 2. Disable claude.ai defaults

claude.ai integrated MCPs (Gmail, Drive, Calendar) auto-inject every Claude Code session, eat 55-100k tokens at startup regardless of relevance. As of 2026-04-27 **no supported per-surface toggle** — Anthropic tracks in [issue #47881](https://github.com/anthropics/claude-code/issues/47881) (open). `permissions.deny: ["mcp__claude_ai_*"]` blocks tool calls but connector definitions still load (verified in [issue #29804](https://github.com/anthropics/claude-code/issues/29804)). `ENABLE_CLAUDEAI_MCP_SERVERS=false` and `claude mcp remove` also non-functional for these integrated connectors.

**Recommended: account-level disconnect.** Go to claude.ai → Settings → Connectors, remove Gmail / Drive / Calendar. Durable, official, kills auto-injection at source. Tradeoff: also removes from Chat. Honest workaround = **two accounts** — clean account (no integrations) for API-key Claude Code sessions, integrated account for Chat.

**Escape hatch (advanced, may break on update):** undocumented GrowthBook flag in `~/.claude.json`:
```json
{
  "cachedGrowthBookFeatures": {
    "tengu_claudeai_mcp_connectors": false
  }
}
```
Currently only mechanism that drops tokens without removing connectors from account ([issue #44112](https://github.com/anthropics/claude-code/issues/44112)). Flag name undocumented, Anthropic can change any release. Do not rely on this in shared / managed configs.

## 3. MCP catalogue — opt-in only

One MCP always on — `deepwiki`. No CLI or REST alternative; free, no auth, no documented rate limits.

```bash
claude mcp add -s user deepwiki --transport http https://mcp.deepwiki.com/mcp
```

Tools: `ask_question`, `read_wiki_contents`, `read_wiki_structure` — public repos only.

> MCP and CLI hit same underlying API with same quota — switching protocol does not change rate limits (verified: Context7, Tavily primary docs 2026-04-27). No other MCPs needed.

## Cross-agent

Per-agent MCP config syntax differs:
- Codex: `~/.codex/config.toml`
- Gemini: `~/.gemini/settings.json` (use `httpUrl`, hyphens not underscores)
- OpenCode: `~/.config/opencode/opencode.json` (`type: remote`)
- Pi: **no MCP support by design** — use REST via `xh`/`curl` instead

Full configs in [agents.md](agents.md).