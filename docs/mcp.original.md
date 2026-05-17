# MCP Policy

> Fulcrum manages a registered builtin MCP catalogue and any MCPs shipped by managed vendor packages. Default state enables only the minimal useful builtin set: DeepWiki and context7. Package installs enable the MCPs shipped by that package. Everything else stays opt-in. CLI + skills remain preferred when they provide the same result with less startup overhead.

## 1. Default state

MCPs spawn long-running processes and consume 55k–100k tokens at startup with 5+ servers active — before your first message. A CLI + skill achieves the same with zero overhead. Register arbitrary third-party MCPs disabled; enable per-session when genuinely needed. Minimal default is DeepWiki + context7: DeepWiki has no CLI equivalent, and context7 is broadly useful library documentation with no official skill fallback. Use `fulcrum install --no-default-mcps` to register all MCP definitions/config without changing enable state; use `--enable-all-mcps` only for verification. Agents with native disabled state get config written disabled: Codex via `enabled = false`; Gemini via `~/.gemini/mcp-server-enablement.json`; OpenCode via `"enabled": false`. Claude Code and Pi lack safe disabled config, so disabled registry MCPs show in `fulcrum mcp list`, not native MCP lists.


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

## 3. Managed MCP catalogue

### 3.1 DeepWiki

`deepwiki` has no CLI or REST alternative; it is free, requires no auth, and has no documented rate limits. It is a registry builtin and part of Fulcrum's minimal default set. `fulcrum install` registers it for detected Codex, Gemini, OpenCode, Pi, and Claude Code when the native `claude` command is available. Pi registration goes through `pi-mcp-adapter`, which Fulcrum installs and configures automatically when `~/.pi/agent` is detected.

```bash
claude mcp add -s user deepwiki --transport http https://mcp.deepwiki.com/mcp
```

Tools: `ask_question`, `read_wiki_contents`, `read_wiki_structure` — public repos only.

Claude Code removal remains manual: `claude mcp remove -s user deepwiki`.

> MCP and CLI hit the same underlying API with the same quota — switching protocol does not change rate limits (verified: Context7, Tavily primary docs 2026-04-27). Do not add another managed MCP unless it has a DeepWiki-class reason.

### 3.2 Pi DeepWiki via adapter

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
      "url": "https://mcp.deepwiki.com/mcp",
      "directTools": true
    }
  }
}
```

Default adapter behavior exposes a proxy-style `mcp(...)` tool. Fulcrum writes `directTools: true` for most Pi-managed MCPs so Pi registers each server's tools directly after restart or `/mcp reconnect`. Exception: Dart MCP exposes some zero-argument tools with schemas Pi v0.70.6 rejects as direct tools, so Fulcrum uses an allowlist of schema-valid Dart tools and leaves the rest reachable through proxy calls. `tool-output-router` policies keyed to direct names like `mcp__deepwiki__ask_question` are still Pi-compatible because the router normalises proxy-shape calls to the same canonical names.

`fulcrum install` runs `pi install npm:pi-mcp-adapter` (when `pi` is on PATH) and writes or upgrades entries in `~/.pi/agent/mcp.json`, preserving other server fields while enforcing the Fulcrum direct-tool policy. `fulcrum doctor --json` reports `piMcpAdapter.adapterPresent` and `piMcpAdapter.deepwikiPresent`.

## Cross-agent

Per-agent MCP configuration syntax differs:
- Codex: `~/.codex/config.toml`
- Gemini: `~/.gemini/settings.json` (use `httpUrl`, hyphens not underscores)
- OpenCode: `~/.config/opencode/opencode.json` (`type: remote`)
- Pi: `pi install npm:pi-mcp-adapter`, then configure `~/.pi/agent/mcp.json` or project `.pi/mcp.json`

Full configs in [agents.md](agents.md).
