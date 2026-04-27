# MCP Policy

> All MCPs disabled by default. CLI + skills is the preferred path (see [capabilities.md](capabilities.md), [skills.md](skills.md)).

## 1. Why default-off

MCPs spawn long-running processes and consume 55k–100k tokens at startup with 5+ servers active — before your first message. A CLI + skill achieves the same with zero overhead. Register MCPs disabled; enable per-session when genuinely needed.

## 2. Disable claude.ai defaults

The claude.ai integrated MCPs (Gmail, Drive, Calendar) auto-inject into every Claude Code session consuming tokens regardless of relevance. 🚧 Disable mechanism pending confirmation.

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
