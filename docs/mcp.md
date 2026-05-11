# MCP Policy

> Fulcrum manages every OFFICIAL VENDOR-PUBLISHED agent asset (Claude plugin, MCP server, Gemini extension, OpenCode plugin, Pi package/extension, vendor SKILL.md) for tools listed in `docs/capabilities.md`. We never re-author content the vendor already publishes. When a vendor only ships for some agents, we mirror the vendor's exact content into the others and adapt loadable surfaces into native config without rewriting behavior. Random community forks are NOT used unless no official asset exists and the gap is critical.

## 1. Scope (official-first)

Manage officially: an asset counts as "official" only if published by the tool vendor's own org (e.g. `github/`, `cloudflare/`, `googleworkspace/`, `tavily-ai/`, `semgrep/`, `ast-grep/`, `anthropic/`, `JuliusBrussee/caveman`) — or by a long-maintained primary maintainer of the tool. Random one-star community forks do NOT qualify.

Per-agent install method follows the vendor's docs verbatim:
- Claude Code: `claude plugin install …` / `claude mcp add …`
- Gemini CLI: `gemini extensions install …` / settings.json `mcpServers`
- OpenCode: `opencode.json` `plugin` array / `mcp` block
- Pi CLI: `pi install npm:<pkg>` / `~/.pi/agent/mcp.json` (via `pi-mcp-adapter` for stdio/HTTP MCPs)
- Codex CLI: `~/.codex/config.toml` MCP block / `~/.codex/hooks.json` / canonical `npx skills add <repo> -a codex` for skill packs that publish that path


Mirror policy: when an asset is published only for some agents (e.g. Claude plugin only, no Gemini extension), copy the vendor's exact package surfaces into the other agents' nearest native paths: skills, rules/context, MCP manifests plus native config, commands/prompts, agents/subagents, hooks, tools/scripts, package manifests, assets/templates/themes/docs, and unknown runtime assets. Do NOT rewrite, summarise, or "improve" upstream content — that introduces drift and authoring debt. Source backups (`.original.md`, `.backup.md`) and dev-only folders stay out of generated agent mirrors.

`fulcrum uninstall` must remove every artifact each official install command created — registry entry, package, MCP block, file copy. Anything that the vendor's docs say to call (`claude plugin uninstall …`, `gemini extensions uninstall …`, `npx skills remove …`) is called from `uninstall`.

## 1a. Cost rationale (default state)


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

`deepwiki` has no CLI or REST alternative; free, no auth, no documented rate limits. It is a registry builtin and part of Fulcrum's minimal default set. `fulcrum install` registers it for detected Codex, Gemini, OpenCode, Pi, and Claude Code when the native `claude` command is available. Pi registration goes through `pi-mcp-adapter`, which `fulcrum install` installs and configures automatically when `~/.pi/agent` is detected (see §3.3).

```bash
claude mcp add -s user deepwiki --transport http https://mcp.deepwiki.com/mcp
```

Tools: `ask_question`, `read_wiki_contents`, `read_wiki_structure` — public repos only.

Claude Code removal remains manual: `claude mcp remove -s user deepwiki`.

> MCP and CLI hit same underlying API with same quota — switching protocol does not change rate limits (verified: Context7, Tavily primary docs 2026-04-27). Do not add another managed MCP unless it has a DeepWiki-class reason.

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

Default adapter behavior exposes a proxy-style `mcp(...)` tool. Fulcrum writes `directTools: true` for most Pi-managed MCPs so Pi registers each server's tools directly after restart or `/mcp reconnect`. Exception: Dart MCP exposes some zero-argument tools with schemas Pi v0.70.6 rejects as direct tools, so Fulcrum uses an allowlist of schema-valid Dart tools and leaves the rest reachable through proxy calls. `fulcrum hook tool-output-router` still normalises Pi's proxy-shape calls — `tool_name="mcp"` with `tool_input.server` and `tool_input.tool` fields — to canonical `mcp__<server>__<tool>` form before policy lookup, so existing `mcp__deepwiki__*` rules apply to both direct and Pi proxy calls without duplication.

`fulcrum install` runs `pi install npm:pi-mcp-adapter` (when `pi` is on PATH) and writes or upgrades entries in `~/.pi/agent/mcp.json`, preserving other server fields while enforcing the Fulcrum direct-tool policy. `fulcrum doctor --json` reports `piMcpAdapter.adapterPresent` and `piMcpAdapter.deepwikiPresent`.

### 3.4 github (W2.1)

Official GitHub MCP server via `github/github-mcp-server`. **Default-disabled** — requires auth.

- Transport: HTTP `https://api.githubcopilot.com/mcp/`
- Auth: `GITHUB_TOKEN` env var (GitHub PAT with repo scope) or `gh auth login` OAuth
- Vendor: `github`

To enable: `fulcrum mcp enable github`

Auth note: pass token via `Authorization: Bearer $GITHUB_TOKEN` header — the remote server validates on each request. `fulcrum doctor` reports `auth:ok` when `GITHUB_TOKEN` is set.

Supersedes: `skills/gh/SKILL.md` (moved to `skills/_archive/gh-authored/`; skill is still functional as fallback when MCP is disabled).



- Auth: none required
- Vendor: `yamadashy`
- OpenCode gets vendor-derived skills plus explorer agent mirror; registry owns the MCP surface and writes it enabled by default.
- Codex gets vendor-derived skills, a Codex plugin-cache package mirror with MCP metadata, commands, explorer agent, rules, and enabled plugin config, plus registry-owned enabled MCP config.



Plugin install (Claude Code, idempotent):
```bash
```

Uninstall removes all 3 plugins and the registry entry. Registry removal only cleans registry-owned non-Claude MCP config; plugin uninstall owns Claude cleanup.

### 3.6 W3 managed MCPs (Wave 3)

W3 entries are opt-in by default. Enable them individually with `fulcrum mcp enable <name>`.

#### 3.6.1 semgrep (W3.3)

In-binary stdio MCP from `semgrep/semgrep`. **Default-disabled.** No auth required.

- Transport: stdio `semgrep mcp`
- Auth: none (`SEMGREP_APP_TOKEN` may be needed for managed rules — set separately)
- Vendor: `semgrep`
- Skills: `upstream.lock` pins `semgrep`, `semgrep-code-security`, `semgrep-llm-security` — both skill and MCP managed

To enable: `fulcrum mcp enable semgrep`

Prerequisite: `pip install semgrep` or `brew install semgrep`. Doctor reports `which semgrep`.

#### 3.6.2 context7 (W3.4)

Official upstash/context7 remote MCP. **Default-disabled.** API key optional (free tier works without it; key raises rate limits per [context7.com/dashboard](https://context7.com/dashboard)).

- Transport: HTTP `https://mcp.context7.com/mcp`
- Auth: `CONTEXT7_API_KEY` (optional — free tier works without it)
- Vendor: `upstash`

To enable: `fulcrum mcp enable context7 --all-agents`. To disable later: `fulcrum mcp disable context7 --all-agents`.

Supersedes: community fork `edxeth/superlight-context7-skill` (moved to `skills/_archive/upstream-removed.lock`). No official SKILL.md from upstash; MCP is the only official surface.

#### 3.6.3 tavily (W3.5)

Tavily remote MCP at `https://mcp.tavily.com/mcp/`. **Default-disabled.** Auth required.

- Transport: HTTP `https://mcp.tavily.com/mcp/`
- Auth: `TAVILY_API_KEY` (required — get at [tavily.com](https://tavily.com))
- Vendor: `tavily-ai`
- Skills: `upstream.lock` pins 7 vendor-published `tavily-*` skills — both managed

To enable: `fulcrum mcp enable tavily` (set `TAVILY_API_KEY` first)

#### 3.6.4 playwright (W3.6)

Microsoft Playwright MCP via npx. **Default-disabled.** No auth.

- Transport: stdio `npx -y @playwright/mcp@latest`
- Auth: none
- Vendor: `microsoft`
- Skills: `upstream.lock` pins vendor-published `playwright-cli` skill — both managed

To enable: `fulcrum mcp enable playwright`

Requires Node.js + npx on PATH. Playwright browsers downloaded on first run.

#### 3.6.5 Cloudflare hosted MCP suite (W3.7)

Nine hosted remote MCP endpoints from `cloudflare/mcp-server-cloudflare`. All **default-disabled**.

| Registry name | URL | Auth |
|---|---|---|
| `cloudflare-docs` | `https://docs.mcp.cloudflare.com/mcp` | none (public) |
| `cloudflare-workers-bindings` | `https://bindings.mcp.cloudflare.com/mcp` | `CLOUDFLARE_API_TOKEN` |
| `cloudflare-workers-builds` | `https://builds.mcp.cloudflare.com/mcp` | `CLOUDFLARE_API_TOKEN` |
| `cloudflare-observability` | `https://observability.mcp.cloudflare.com/mcp` | `CLOUDFLARE_API_TOKEN` |
| `cloudflare-radar` | `https://radar.mcp.cloudflare.com/mcp` | `CLOUDFLARE_API_TOKEN` |
| `cloudflare-logpush` | `https://logs.mcp.cloudflare.com/mcp` | `CLOUDFLARE_API_TOKEN` |
| `cloudflare-browser` | `https://browser.mcp.cloudflare.com/mcp` | `CLOUDFLARE_API_TOKEN` |
| `cloudflare-containers` | `https://containers.mcp.cloudflare.com/mcp` | `CLOUDFLARE_API_TOKEN` |
| `cloudflare-ai-gateway` | `https://ai-gateway.mcp.cloudflare.com/mcp` | `CLOUDFLARE_API_TOKEN` |

To enable: `fulcrum mcp enable cloudflare-docs` (no auth) or `fulcrum mcp enable cloudflare-workers-bindings` (needs `CLOUDFLARE_API_TOKEN`).

Cloudflare package ownership:
- Claude Code: `claude plugin marketplace add cloudflare/skills` and `claude plugin install cloudflare@cloudflare`. The plugin owns bundled skills plus these MCP endpoints: docs, bindings, builds, observability. Fulcrum hides those four registry surfaces for `claude-code`.
- Non-Claude: Fulcrum installs a full Cloudflare package mirror, not a skills-only copy. The mirror includes vendor skills, commands, rules/context, MCP manifests, docs/assets, and package metadata where the target agent has an equivalent surface. Fulcrum also adapts package skills into native loadable skill paths and adapts package `.mcp.json` entries into native MCP config disabled by default.
- The Cloudflare package `.mcp.json` currently ships exact manifest names `cloudflare-api`, `cloudflare-docs`, `cloudflare-bindings`, `cloudflare-builds`, and `cloudflare-observability`. Package install registers those for non-Claude fallback agents and writes disabled native config where supported; uninstall removes package-only entries and restores builtin specs for overlapping names.
- Extra endpoints not bundled by the Claude plugin (`cloudflare-radar`, `cloudflare-logpush`, `cloudflare-browser`, `cloudflare-containers`, `cloudflare-ai-gateway`) remain registry-visible for Claude too.

Kept: `upstream.lock` cloudflare/skills pins — 8 skills total (all vendor-published at tree `7c449de`): `cloudflare-agents-sdk`, `cloudflare-platform`, `cloudflare-email-service`, `cloudflare-durable-objects`, `cloudflare-sandbox-sdk`, `cloudflare-web-perf`, `cloudflare-workers-best-practices`, `wrangler`. They remain available for explicit standalone `fulcrum skills upstream` use, but component/full-profile install treats Cloudflare as package-owned: package install mirrors `skills/*` into loadable fallback skill paths and removes older top-level Cloudflare upstream copies to avoid duplicate skill activation.

#### 3.6.6 dart (W3.8)

Dart Tooling MCP server from `dart-lang/ai/pkgs/dart_mcp_server`. **Default-disabled.** Requires Dart SDK ≥ 3.9.0-163.0.dev.

- Transport: stdio `dart mcp-server`
- Auth: none
- Vendor: `dart-lang`
- Prerequisite: Dart SDK installed and `dart` on PATH. The `dart mcp-server` sub-command is built into the SDK (no separate `dart pub global activate` needed in recent SDK versions).

To enable: `fulcrum mcp enable dart`

Doctor reports a hint when `dart` is not on PATH.

## 4. fulcrum mcp registry CLI

The MCP registry lives at `~/.fulcrum/state/global/mcp-registry.toml`. Schema version 1.

```bash
# List all registered servers
fulcrum mcp list [--json]

# Register a new server (added but not enabled)
fulcrum mcp register myserver --http https://example.com/mcp --vendor example --description "..."
fulcrum mcp register myserver --stdio "npx -y mypkg --mcp" --vendor example

# Remove from registry + all agents
fulcrum mcp unregister myserver

# Enable (push to agent native config)
fulcrum mcp enable myserver [--agent claude-code] [--agent codex] [--all-agents]

# Disable (remove from agent native config)
fulcrum mcp disable myserver [--all-agents]
```

Agent IDs: `claude-code`, `codex`, `gemini`, `opencode`, `pi`.


Servers can hide an agent when that agent surface is unsupported or owned by another Fulcrum-managed primitive. `fulcrum mcp list --json` reports that state as `"hidden"`; enable/disable skip hidden agents instead of writing registry state for them.

`fulcrum doctor` reports each registered server: enabled-on-which-agents, env-var auth status, and HEAD-probe reachability for HTTP servers.

## 5. Auth requirements per managed MCP

Every managed MCP is registered by `fulcrum install`. Auth is your responsibility — Fulcrum does not store secrets. Recommended layout:

```
~/.config/fulcrum-secrets/
└── env.sh        # chmod 600; sourced from your shell rc (~/.zshrc, etc)
```

Add a single source line to your shell rc:

```bash
# ~/.zshrc (or ~/.bashrc)
[ -f ~/.config/fulcrum-secrets/env.sh ] && source ~/.config/fulcrum-secrets/env.sh
```

`fulcrum doctor --json | jq '.mcp.servers[] | {name, auth_status}'` reports which managed MCPs have their env vars set.

| MCP | Env var(s) | How to obtain |
|---|---|---|
| `deepwiki` | none | minimal default |
| `github` | `GITHUB_TOKEN` (or `gh auth login` — many tools read either) | [github.com/settings/tokens](https://github.com/settings/tokens) — fine-grained PAT with `repo`, `read:org`, `gist` |
| `semgrep` | none for local scans; `SEMGREP_APP_TOKEN` only for Semgrep AppSec Platform | [semgrep.dev/orgs/-/settings/tokens](https://semgrep.dev/orgs/-/settings/tokens) (only if using cloud features) |
| `context7` | `CONTEXT7_API_KEY` (optional — free tier works without; key raises rate limit) | [context7.com](https://context7.com) → run `npx ctx7@latest login` and copy generated key |
| `tavily` | `TAVILY_API_KEY` (required) | [app.tavily.com](https://app.tavily.com) → API Keys |
| `playwright` | none | stdio MCP via `npx`; first run downloads chromium (~170 MB) |
| `dart` | none | requires Dart SDK ≥ 3.9.0-163.0.dev with `dart mcp-server` subcommand |
| `cloudflare-docs` | none (public) | opt-in unless package-owned for that agent |
| `cloudflare-workers-bindings` | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens). Account id from the dashboard sidebar or `curl -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/accounts \| jq '.result[].id'` |
| `cloudflare-workers-builds` | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | same |
| `cloudflare-observability` | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | same |
| `cloudflare-radar` | `CLOUDFLARE_API_TOKEN` | same |
| `cloudflare-logpush` | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | same |
| `cloudflare-browser` | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | same |
| `cloudflare-containers` | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | same |
| `cloudflare-ai-gateway` | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | same |

The Cloudflare suite reuses one `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` for every endpoint — set them once.

### Adjacent CLI auth (not MCP, but used by skills)

| Tool | Auth path | Note |
|---|---|---|
| `gh` (GitHub CLI) | `gh auth login` (web flow); macOS keychain or `~/.config/gh/hosts.yml` on Linux | covers `gh` skill + git operations; `GITHUB_TOKEN` env var works as alternative |
| `gcloud` (Google Cloud SDK) | `gcloud auth login` + `gcloud auth application-default login` | the second populates `~/.config/gcloud/...adc.json` for Application Default Credentials |
| `wrangler` (Cloudflare Workers CLI) | `wrangler login` | OAuth flow; stores token in `~/.wrangler/config/default.toml` (Linux) or platform equivalent. Wrangler CLI is independent of the Cloudflare MCP API token. |
| Google Workspace OAuth client | place client_secret JSON at a path of your choice; export `GWS_CLIENT_SECRETS` to point at it | for any tool using Google Workspace OAuth flows |
| Anthropic / Claude | macOS Keychain (Claude Code itself) or `ANTHROPIC_API_KEY` for SDK callers | Fulcrum does not read this; `scripts/eval-skill-claude.sh` uses the keychain via `claude` CLI |

### Setting it all up the first time

```bash
# 1. Create the secrets file
mkdir -p ~/.config/fulcrum-secrets
cat > ~/.config/fulcrum-secrets/env.sh <<'EOF'
# Required
export TAVILY_API_KEY="..."
export CLOUDFLARE_API_TOKEN="..."
export CLOUDFLARE_ACCOUNT_ID="..."

# Optional (uncomment what you use)
# export CONTEXT7_API_KEY="..."
# export SEMGREP_APP_TOKEN="..."
# export GWS_CLIENT_SECRETS="$HOME/path/to/client_secret.json"
# export GOOGLE_APPLICATION_CREDENTIALS="$HOME/path/to/adc.json"
EOF
chmod 600 ~/.config/fulcrum-secrets/env.sh

# 2. Source from your shell rc (idempotent)
grep -q "fulcrum-secrets/env.sh" ~/.zshrc \
  || echo '[ -f ~/.config/fulcrum-secrets/env.sh ] && source ~/.config/fulcrum-secrets/env.sh' >> ~/.zshrc
source ~/.zshrc

# 3. Run interactive logins for adjacent CLI tools as needed
gh auth login                                 # GitHub
gcloud auth login                             # Google Cloud (interactive)
gcloud auth application-default login         # ADC for libraries
wrangler login                                # Cloudflare Workers CLI

# 4. Verify
fulcrum doctor --json | jq '.mcp.servers[] | {name, auth_status}'
```

`auth_status: "ok"` means the env var is set; `missing-env` means a required env var is absent; `n/a` means no auth needed.

## Cross-agent

Per-agent MCP config syntax differs by transport:
- Codex: `~/.codex/config.toml` (`url = "..."` for HTTP, `command = "..."` for stdio)
- Gemini: `~/.gemini/settings.json` (`httpUrl` for HTTP — hyphens not underscores; `command` for stdio)
- OpenCode: `~/.config/opencode/opencode.json` (`type: "remote"` for HTTP, `type: "local"` for stdio)
- Pi: `pi install npm:pi-mcp-adapter`, then configure `~/.pi/agent/mcp.json` or project `.pi/mcp.json`

Fulcrum-managed example: DeepWiki uses the HTTP shape on every agent.

Full configs in [agents.md](agents.md).
