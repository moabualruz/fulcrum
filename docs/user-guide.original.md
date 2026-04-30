# Fulcrum User Guide

> See also: [developer-guide.md](developer-guide.md) | [contributing.md](contributing.md) | [HANDOVER.md](../HANDOVER.md) for current state

---

## What Fulcrum is

Fulcrum is a local-first CLI Agent OS that installs a shared foundation across every AI coding agent you use — Claude Code, Codex CLI, Gemini CLI, OpenCode, and Pi CLI. It wires the same behavioral rules, hook recipes, skills (slash commands), and MCP servers into all five agents from a single install command, so you get consistent tooling behavior regardless of which agent you open. Fulcrum does **not** run agents, manage cloud jobs, or touch your code — it manages the configuration layer that sits between you and those agents.

**What Fulcrum does:**
- Splices a shared rules block into each agent's primary config file (idempotent, preserves your content).
- Installs hook recipes (`format`, `lint-gate`, `pm-policy`, `test-on-edit`, `audit-log`, `tool-output-router`, and two index hooks) as binary subcommands of a single `fulcrum` binary.
- Syncs Fulcrum-authored skills into the `fulcrum/` namespace when explicitly requested; Codex global authored skills are opt-in.
- Registers managed MCPs (DeepWiki + context7 minimal-default; other builtin extras opt-in).
- Installs caveman output-compression cross-agent with `defaultMode: ultra`.
- Reports environment health via `fulcrum doctor`.

**What Fulcrum does NOT do:**
- Run or invoke agents on your behalf.
- Manage cloud deployments, CI pipelines, or hosted infrastructure.
- Store secrets — auth credentials are your responsibility (see [§ Auth setup](#auth-setup)).
- Replace per-project `AGENTS.md` — it bootstraps one but you maintain it.
- Implement the future Agent OS layers (task system, memory, artifact tracking) — those are placeholders; see [HANDOVER.md §6](../HANDOVER.md).

---

## Install

### Prerequisites

Install Bun (required to build from clone, or to build the binary from source):

```bash
curl -fsSL https://bun.sh/install | bash
```

Install the workstation toolchain. See [docs/capabilities.md](capabilities.md) §1 for the full list. Quick start:

```bash
brew install \
  ripgrep fd fzf jq yq bat sd eza zoxide \
  xh gh just mise direnv \
  tmux difftastic \
  universal-ctags hyperfine watchexec \
  ast-grep gitleaks git-cliff
```

### Run install

**From a clone (builds locally):**

```bash
git clone https://github.com/moabualruz/fulcrum ~/code/fulcrum
cd ~/code/fulcrum
bash scripts/install.sh
```

**From a published release (no Bun needed):**

```bash
FULCRUM_RELEASE_TAG=v0.1.0 bash <(curl -fsSL https://raw.githubusercontent.com/moabualruz/fulcrum/main/scripts/install.sh)
```

**Flags:**

| Flag | Effect |
|---|---|
| `--profile minimal` | Default. Install rules, policy, and minimal MCP defaults only. Avoids global skills and vendor packages. |
| `--profile rules-only` | Only splice the global Fulcrum rules block. |
| `--profile full` | Historical full bootstrap: skills, upstream skills, Caveman, vendor packages, and MCP registry. |
| `--with-project <dir>` | Also bootstrap a project (`fulcrum init <dir>`) |
| `--dry-run` | Preview only; no writes |
| `--no-skills` | Skip authored + upstream skill sync |
| `--no-upstream-skills` | Skip only the networked upstream skill sync |
| `--no-default-mcps` | Register MCP definitions/config but skip Fulcrum's minimal default enable step; existing MCP state is left untouched. |
| `--enable-all-mcps` | After registration, enable every builtin MCP on every detected agent. Use to verify each MCP starts and authenticates; revert later via `fulcrum mcp disable --all-agents <name>`. |

### Post-install: env vars

After install, set up auth for any managed MCPs you plan to use. The recommended layout:

```bash
mkdir -p ~/.config/fulcrum-secrets
cat > ~/.config/fulcrum-secrets/env.sh <<'EOF'
# Required for MCPs you plan to enable
export TAVILY_API_KEY="..."
export CLOUDFLARE_API_TOKEN="..."
export CLOUDFLARE_ACCOUNT_ID="..."
# Optional
# export CONTEXT7_API_KEY="..."
# export SEMGREP_APP_TOKEN="..."
EOF
chmod 600 ~/.config/fulcrum-secrets/env.sh
grep -q "fulcrum-secrets/env.sh" ~/.zshrc \
  || echo '[ -f ~/.config/fulcrum-secrets/env.sh ] && source ~/.config/fulcrum-secrets/env.sh' >> ~/.zshrc
source ~/.zshrc
```

Full per-MCP auth requirements are in [docs/mcp.md §5](mcp.md). The full machine setup checklist is in [HANDOVER.md §7](../HANDOVER.md).

### Bootstrap a project

```bash
fulcrum init ~/code/myproject
```

Creates `AGENTS.md`, `.claude/CLAUDE.md` (`@AGENTS.md` import), and `.gitignore` in the target directory. Edit `AGENTS.md` to describe the project stack, commands, and conventions — every agent reads this file.

### Verify

```bash
fulcrum doctor          # human-readable health check
fulcrum doctor --json   # machine-readable; pipe to jq
```

All five agents should appear detected, rules spliced, caveman installed, and Pi adapter present.

---

## Daily usage

### Hooks

Enable the hook recipes you want. `fulcrum hooks enable` writes native hook configs only for agents whose directories exist on your machine (detection-aware):

```bash
fulcrum hooks list                  # see what's available
fulcrum hooks enable format         # auto-format on every file write/edit
fulcrum hooks enable lint-gate      # block agent next turn if lint fails
fulcrum hooks enable pm-policy      # refuse wrong package manager (npm in a pnpm repo, etc.)
fulcrum hooks enable audit-log      # forensic trail of agent shell commands
fulcrum hooks enable tool-output-router  # per-tool output strategy
```

Use `--all` to write configs for all five agents regardless of which are installed locally (useful when managing dotfiles for multiple machines):

```bash
fulcrum hooks enable format --all
```

Disable:

```bash
fulcrum hooks disable format
```

After enabling hooks, restart any open agent sessions for the new config to take effect.

The `test-on-edit` recipe is opt-in per project. Drop a `.fulcrum/test-on-edit.toml` in your repo:

```toml
"*.py"      = "pytest -x {file}"
"src/*.ts"  = "vitest run {file}"
"*.go"      = "go test ./$(dirname {file})/..."
```

See [docs/hooks.md §5](hooks.md) for the full recipe catalogue.

### Skills (slash commands)

Skills are installed by `fulcrum install --profile full` or by running the skill sync commands directly. In any agent session, invoke them with a slash command matching the skill name:

```
/jq                     # JSON processing
/ruff                   # Python lint + format
/biome                  # JS/TS lint + format
/gitleaks               # secret scan
/hyperfine              # statistical benchmarking
/difftastic             # syntax-aware diff
/just                   # project task runner
/xh                     # HTTP API calls
```

Full authored list: `fulcrum skills list` (shows name + eval coverage). Runtime pressure: `fulcrum skills list --installed` shows active per-agent skill count, description budget, duplicate names, and source roots.

To sync authored skills after a Fulcrum update:

```bash
fulcrum skills sync         # sync authored skills; skips Codex global by default
fulcrum skills sync --codex-project <dir>  # project-local Codex authored skills
fulcrum skills sync --codex-global         # explicit global Codex authored skills
fulcrum skills upstream     # sync curated upstream skills (network; verifies SHA-256)
```

See [docs/skills.md](skills.md) for paths, authoring, and verification details.

#### The `fulcrum:` namespace

Fulcrum skills install through each agent's native namespace. Claude Code uses plugin commands like `/fulcrum:jq`; OpenCode/Pi/Gemini use native mirrored folders/extensions; Codex authored global skills are opt-in, with project-local `.codex/skills/fulcrum/<name>/` available when you want a repo-scoped mirror. Frontmatter `name:` stays prefix-free.

### MCPs

Fulcrum registers 17 builtin registry MCPs. Default install enables only `deepwiki` and `context7` when no user state exists; the rest stay opt-in to avoid startup token cost (~55–300k tokens with 5+ active MCPs). Use `--no-default-mcps` to register everything without changing enabled state.

```bash
fulcrum mcp list                            # see all registered MCPs + state
fulcrum mcp enable github --all-agents      # enable for all detected agents
fulcrum mcp enable tavily --agent claude-code
fulcrum mcp disable github --all-agents
```

Set the required env vars before enabling an MCP that needs auth (see [docs/mcp.md §5](mcp.md)).

Available builtin MCPs: `deepwiki`, `github`, `repomix`, `semgrep`, `context7`, `tavily`, `playwright`, `dart`, `cloudflare-docs`, `cloudflare-workers-bindings`, `cloudflare-workers-builds`, `cloudflare-observability`, `cloudflare-radar`, `cloudflare-logpush`, `cloudflare-browser`, `cloudflare-containers`, `cloudflare-ai-gateway`.

### Doctor

`fulcrum doctor` is your health-check command. Run it whenever something feels off:

```bash
fulcrum doctor          # human summary
fulcrum doctor --json   # JSON; pipe with jq
```

It reports:
- Which agents are detected and whether rules are spliced.
- Caveman install state per agent and `defaultMode` source.
- 47 CLI tools — present or missing.
- Pi MCP adapter state.
- Registered MCP servers, enabled-on-which-agents, and auth status.
- Policy file presence and mtime.

---

## Per-agent quick reference

| Agent | Rules file | Skills path | Hook config | MCP config |
|---|---|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | `~/.claude/plugins/cache/fulcrum/fulcrum/<ver>/skills/<name>/` | `~/.claude/settings.json` hooks block | `claude mcp add` / `~/.claude/settings.json` |
| Codex CLI | `~/.codex/AGENTS.md` | Global opt-in `~/.codex/skills/fulcrum/<name>/`; project `.codex/skills/fulcrum/<name>/` | `~/.codex/hooks.json` | `~/.codex/config.toml` |
| Gemini CLI | `~/AGENTS.md` (via `~/.gemini/GEMINI.md` → `@AGENTS.md`) | `~/.gemini/extensions/fulcrum-skills/skills/<name>/` | `~/.gemini/settings.json` | `~/.gemini/settings.json` `mcpServers` |
| OpenCode | `~/.config/opencode/AGENTS.md` | `~/.config/opencode/skills/fulcrum/<name>/` | TypeScript plugin | `~/.config/opencode/opencode.json` |
| Pi CLI | `~/.pi/agent/AGENTS.md` | `~/.pi/agent/skills/fulcrum/<name>/` | TypeScript extension | `~/.pi/agent/mcp.json` via `pi-mcp-adapter` |

For per-agent hook registration syntax, MCP config examples, and known quirks, see [docs/agents.md](agents.md).

---

## Caveman

Caveman is a third-party output-compression skill from `JuliusBrussee/caveman`. Fulcrum installs it on every agent and locks `defaultMode: ultra`.

**What it does:** Cuts agent output token usage ~75% by dropping articles, hedging, and pleasantries while preserving code, paths, commands, URLs, versions, and technical terms verbatim.

**`defaultMode: ultra`** means every agent session starts in ultra-compressed output mode automatically. The lock is written to `~/.config/caveman/config.json` by `fulcrum install`.

**Opt out per-session:** Run `/caveman stop` or `/caveman mode lite` inside any agent session. This lasts for the session only; the next session reverts to ultra.

**Opt out persistently:** Set `CAVEMAN_DEFAULT_MODE=full` (or `lite`) in your shell environment (wins over the config-file lock).

**Skills available:** `caveman`, `caveman-commit`, `caveman-help`, `caveman-review`, `compress`.

See [docs/caveman.md](caveman.md) for install paths, uninstall, and the in-repo compression gate.

---

## Troubleshooting

### `fulcrum doctor` warnings

**"rules NOT spliced"** — Run `fulcrum install` again. The sentinel-splice is idempotent and safe to re-run. If the agent's root dir does not exist, `install` will skip it silently; create the dir first.

**"MCP X has missing-env"** — The env var for that MCP is not set. Set it in `~/.config/fulcrum-secrets/env.sh` and `source ~/.zshrc`. See [docs/mcp.md §5](mcp.md) for which var each MCP needs.

**"caveman: not installed"** on an agent — Run `fulcrum install` again. If the agent is not detected (its root dir doesn't exist), the install is skipped; create the dir or use `--all` to force.

**"tool X: missing"** — `fulcrum doctor` reports missing CLI tools from `docs/capabilities.md`. Install the missing tool with `brew install <tool>` (or the appropriate method from [docs/capabilities.md](capabilities.md)).

### Hook not firing

1. Confirm the hook is enabled: `fulcrum hooks list` — look for an enabled marker.
2. Restart the agent session — hooks are read from config at session start.
3. If the hook was registered with `--all` on a machine where the agent wasn't installed, the config file may have been written to a non-existent path. Run `fulcrum hooks enable <name>` (without `--all`) to write only for detected agents.
4. For Claude Code specifically, check `~/.claude/settings.json` `hooks` block to confirm the recipe is present.

### "pi-mcp-adapter not installed"

Run `pi install npm:pi-mcp-adapter` and restart Pi. Then run `fulcrum install` again to write the DeepWiki entry into `~/.pi/agent/mcp.json`.

### Upstream skill sync fails with integrity error

```
✗ <skill> subpath integrity FAILED — expected … got …
```

The upstream skill content changed since the lockfile was written. Either update the pin deliberately (`fulcrum skills upstream --update-pins`) or report it as a potential supply-chain issue.

### claude.ai MCPs eating tokens

The Gmail / Drive / Calendar connectors from claude.ai inject into every Claude Code session. To stop this: Settings → Connectors on claude.ai → remove Gmail/Drive/Calendar. See [docs/mcp.md §2](mcp.md) for the full workaround options.

---

## FAQ

**Q: Does Fulcrum work if I only use one agent?**
A: Yes. Install detects which agents are present and only writes configs for those. You can add more agents later and re-run `fulcrum install`.

**Q: Will Fulcrum overwrite my existing CLAUDE.md / AGENTS.md?**
A: No. It splices a marked block (`<!-- BEGIN/END FULCRUM RULES -->`) into your file. Content outside those markers is preserved verbatim. Re-running `fulcrum install` replaces only the spliced block.

**Q: How do I update Fulcrum skills after a new release?**
A: Pull the repo and run `bash scripts/install.sh` again, or run `fulcrum skills sync` to re-sync authored skills without a full reinstall.

**Q: Can I author my own skills?**
A: Yes. Drop a `SKILL.md` at `~/.claude/skills/<name>/SKILL.md` (or the equivalent path for other agents). Fulcrum owns only its authored `fulcrum/` namespace; curated upstream skills use vendor placement. See [docs/skills.md §5](skills.md) for the authoring template.

**Q: What is the `fulcrum:` prefix I see in skill paths?**
A: It is the effective namespace for Fulcrum-authored skills. Claude Code exposes it directly as `/fulcrum:<name>` through the plugin; other agents get the namespace from the mirrored folder/extension path while keeping prefix-free `name:` frontmatter.

**Q: Why are most MCPs disabled by default?**
A: Each active MCP spawns a long-running process and loads tool definitions. With 5+ MCPs active you can burn 55–300k tokens at session start before your first message. Enable only what you plan to use. See [docs/mcp.md §1a](mcp.md).

**Q: How do I completely remove Fulcrum?**
A: Run `fulcrum uninstall`. Use `--purge` to also remove state files, and `--include-caveman` to remove caveman. Preview first with `--dry-run`.

**Q: Does Fulcrum require an internet connection?**
A: Only for `fulcrum skills upstream` (clones from GitHub), `fulcrum install --profile full` with upstream skill sync enabled, and any HTTP MCPs you have enabled. Rules splice, hook registration, authored skill sync, and `fulcrum doctor` are fully offline.

**Q: My `fulcrum doctor` shows "verdict: warning" — is that a problem?**
A: Warnings mean non-fatal issues (e.g. a tool is missing, or a MCP env var is unset). Errors mean something in the managed install is broken. Read the warning message and address the specific item — the doctor output says exactly what is wrong and (often) how to fix it.

**Q: Why does Gemini CLI use `~/AGENTS.md` instead of `~/.gemini/GEMINI.md`?**
A: Gemini CLI does not read `AGENTS.md` natively. Fulcrum writes the shared rules block to `~/AGENTS.md` and makes `~/.gemini/GEMINI.md` a one-line `@AGENTS.md` import shim that Gemini inlines at load time. This keeps a single source of truth for rules across all five agents.

**Q: The `test-on-edit` hook does nothing — why?**
A: It is opt-in per project. Drop a `.fulcrum/test-on-edit.toml` in your repo root mapping file globs to test commands. Without the config file, the hook is a no-op. See [docs/hooks.md §5.4](hooks.md).

**Q: Where is the state from `fulcrum audit-log`?**
A: `~/.fulcrum/state/<project-slug>/shell-commands.log`. `tail` it to see recent agent shell commands.

**Q: How is caveman ultra different from caveman full?**
A: Ultra drops more filler and compresses more aggressively (~75% output token reduction). Full retains slightly more sentence structure. Ultra is the Fulcrum default because savings are significant with no loss of technical precision. Lite is closer to normal prose with only minimal compression.

**Q: Can I use Fulcrum without Bun?**
A: Only when installing from a published release (`FULCRUM_RELEASE_TAG=...`). Building from clone requires Bun. The installed binary itself has no runtime Bun dependency.

---

## Pointers

- **Current state / outstanding work:** [HANDOVER.md](../HANDOVER.md)
- **Contributing code to Fulcrum:** [developer-guide.md](developer-guide.md) and [contributing.md](contributing.md)
- **Per-agent translation:** [docs/agents.md](agents.md)
- **Capability toolchain:** [docs/capabilities.md](capabilities.md)
- **Hook recipes:** [docs/hooks.md](hooks.md)
- **MCP policy and catalogue:** [docs/mcp.md](mcp.md)
- **Skills authoring and paths:** [docs/skills.md](skills.md)
- **Caveman compression:** [docs/caveman.md](caveman.md)
