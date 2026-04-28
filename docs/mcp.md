# MCP Policy

> Fulcrum manages two MCP integrations by default: DeepWiki for repository documentation and context-mode for context routing/session continuity. Everything else stays opt-in. CLI + skills remain preferred when they provide the same result with less startup overhead.

## 1. Why default-off

MCPs spawn long-running processes, eat 55k–100k tokens at startup with 5+ servers active — before first message. CLI + skill same result, zero overhead. Register arbitrary third-party MCPs disabled; enable per-session when needed. Managed exceptions must justify their always-on cost: DeepWiki has no CLI equivalent, and context-mode provides routing/session-continuity hooks rather than only another tool surface.

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

## 3. Managed MCP catalogue

### 3.1 DeepWiki

`deepwiki` has no CLI or REST alternative; free, no auth, no documented rate limits. `fulcrum install` registers it for detected Codex, Gemini, OpenCode, and Claude Code when the native `claude` command is available. Pi can use DeepWiki through `pi-mcp-adapter`, but Fulcrum does not manage that adapter yet.

```bash
claude mcp add -s user deepwiki --transport http https://mcp.deepwiki.com/mcp
```

Tools: `ask_question`, `read_wiki_contents`, `read_wiki_structure` — public repos only.

Claude Code removal remains manual: `claude mcp remove -s user deepwiki`.

> MCP and CLI hit same underlying API with same quota — switching protocol does not change rate limits (verified: Context7, Tavily primary docs 2026-04-27). Do not add another managed MCP unless it has a DeepWiki/context-mode class reason.

### 3.2 context-mode

`context-mode` is managed because it combines MCP tools with hook-based routing enforcement and session continuity. Fulcrum follows upstream install instructions from [mksglu/context-mode](https://github.com/mksglu/context-mode), verified 2026-04-28:

- Claude Code: `claude plugin marketplace add mksglu/context-mode` and `claude plugin install context-mode@context-mode`.
- Codex CLI: global `context-mode` binary, `~/.codex/config.toml` MCP entry, `~/.codex/hooks.json` hook entries, and routing rules in `~/.codex/AGENTS.md`.
- Gemini CLI: global `context-mode` binary, `~/.gemini/settings.json` MCP + hook entries, and routing rules through the Fulcrum `~/AGENTS.md` import path.
- OpenCode: global `context-mode` binary, `~/.config/opencode/opencode.json` MCP + plugin entries, and routing rules in `~/.config/opencode/AGENTS.md`.
- Pi CLI: global `context-mode` binary, `pi install npm:context-mode`, `~/.pi/agent/settings.json` package entry, `~/.pi/agent/mcp.json` MCP entry, and routing rules in `~/.pi/agent/AGENTS.md`.

`fulcrum uninstall` removes Fulcrum-managed context-mode registrations and routing blocks. It keeps the global npm package because upstream documents no uninstall command and that binary may be shared; remove manually with `npm uninstall -g context-mode` when desired.

### 3.3 Pi DeepWiki via adapter

Pi does not ship a built-in MCP manager. Use [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter), verified 2026-04-28:

```bash
pi install npm:pi-mcp-adapter
```

Restart Pi after install. The adapter reads `.mcp.json`, `~/.config/mcp/mcp.json`, `~/.pi/agent/mcp.json`, and `.pi/mcp.json`, and supports stdio plus HTTP MCP servers.

Recommended user-level config:

```json
{
  "mcpServers": {
    "deepwiki": {
      "url": "https://mcp.deepwiki.com/mcp"
    }
  }
}
```

Default adapter behavior exposes a proxy-style `mcp(...)` tool. `tool-output-router` policies keyed to direct names like `mcp__deepwiki__ask_question` should only be treated as Pi-compatible after direct-tool exposure is configured and verified.

Remaining Fulcrum work for DeepWiki-on-Pi: install/configure adapter, add doctor checks, and verify output-routing shape. Tracked in [HANDOVER.md](../HANDOVER.md) §6.

## Cross-agent

Per-agent MCP config syntax differs:
- Codex: `~/.codex/config.toml`
- Gemini: `~/.gemini/settings.json` (use `httpUrl`, hyphens not underscores)
- OpenCode: `~/.config/opencode/opencode.json` (`type: remote`)
- Pi: `pi install npm:pi-mcp-adapter`, then configure `~/.pi/agent/mcp.json` or project `.pi/mcp.json`

Full configs in [agents.md](agents.md).
