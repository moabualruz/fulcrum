# Fulcrum

> Local-first CLI Agent OS foundation for keeping Claude Code, Codex CLI, Gemini CLI, OpenCode, and Pi CLI aligned across rules, hooks, skills, MCPs, package surfaces, and diagnostics.

Fulcrum is currently the **foundation layer** of the larger Agent OS: it manages the configuration and capability surface that agents load before they work. Repository supervision, task tracking, agent-run history, memory, and artifact tracking are still planned layers; do not build against them yet. See [HANDOVER.md](HANDOVER.md) for the live state snapshot and [AGENTS.md](AGENTS.md) for project rules.

## What Ships Today

| Area | Current behavior | Primary docs |
|---|---|---|
| Install profiles | `minimal` by default, `rules-only`, `full`, and `verify-all` through the component lifecycle engine | [user guide](docs/user-guide.md), [developer guide](docs/developer-guide.md) |
| Component lifecycle | `fulcrum component list/info/plan/status/install/remove/enable/disable` for rules, policy, hooks, MCPs, skills, and managed packages | [user guide](docs/user-guide.md#component-lifecycle) |
| Cross-agent rules | Sentinel-splices `rules/AGENTS.md` into each detected agent while preserving user text outside Fulcrum markers | [context](docs/context.md), [agents](docs/agents.md) |
| Hooks | Eight TypeScript hook recipes behind one `fulcrum hook <name>` binary entrypoint | [hooks](docs/hooks.md), [tool output policy](docs/tool-output-policy.md) |
| Skills | 29 authored skills, 19 upstream-pinned skills, trigger eval harnesses, and agent-native namespace layouts | [skills](docs/skills.md), [skill smoke test](docs/skill-smoke-test.md) |
| Managed packages | Official-first install plus package payload mirrors, loadable skill adapters, and native MCP config for Caveman, Repomix, Cloudflare, and Superpowers | [MCP policy](docs/mcp.md), [HANDOVER](HANDOVER.md) |
| MCP registry | 17 builtin MCP definitions plus package-provided MCPs; config is installed everywhere supported, enablement is policy-controlled | [MCP policy](docs/mcp.md) |
| Doctor | Agent, component, package parity, MCP, skill-budget, policy, toolchain, and worktree health reporting | [user guide](docs/user-guide.md#doctor) |

## Supported Agents

| Agent | Rules | Skills | Hooks | MCP |
|---|---|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | `fulcrum@fulcrum` plugin | `~/.claude/settings.json` | `claude mcp` / settings |
| Codex CLI | `~/.codex/AGENTS.md` | global opt-in or project `.codex/skills/fulcrum/` | `~/.codex/hooks.json` | `~/.codex/config.toml` |
| Gemini CLI | `~/AGENTS.md` imported by `~/.gemini/GEMINI.md` | `fulcrum-skills` extension | `~/.gemini/settings.json` | `settings.json` `mcpServers` |
| OpenCode | `~/.config/opencode/AGENTS.md` | `~/.config/opencode/skills/fulcrum/` | TypeScript plugin | `opencode.json` |
| Pi CLI | `~/.pi/agent/AGENTS.md` | `~/.pi/agent/skills/fulcrum/` | TypeScript extension | `pi-mcp-adapter` |

## Install

From a clone:

```bash
curl -fsSL https://bun.sh/install | bash
git clone https://github.com/moabualruz/fulcrum ~/code/fulcrum
cd ~/code/fulcrum
bash scripts/install.sh
```

From a published release:

```bash
FULCRUM_RELEASE_TAG=v0.1.0 bash <(curl -fsSL https://raw.githubusercontent.com/moabualruz/fulcrum/main/scripts/install.sh)
```

Useful install variants:

```bash
bash scripts/install.sh --profile rules-only
bash scripts/install.sh --profile full
bash scripts/install.sh --with-project ~/code/myproject
bash scripts/install.sh --dry-run --profile full
```

The default `minimal` profile splices rules, seeds the tool-output policy, registers every builtin MCP, writes disabled config where agents support it, and enables only the recommended default, DeepWiki, where no user state exists. The `full` profile adds hooks, authored skills, non-package-owned upstream skills, Caveman, Repomix, Cloudflare, and Superpowers package setup. Package installs own their bundled skills/MCPs, but MCPs stay disabled by default when a CLI or skill covers the same job; use `fulcrum mcp enable/disable` for explicit opt-in.

## First Run

```bash
fulcrum doctor
fulcrum init ~/code/myproject
fulcrum component list
fulcrum component status package.repomix --json
```

`fulcrum init` creates project `AGENTS.md`, `.claude/CLAUDE.md` import glue, `.gitignore` entries, and vendor-canonical project integrations where supported: graphify, ast-grep, tavily, and Pi MCP adapter setup. Reindex an existing project with:

```bash
fulcrum init reindex ~/code/myproject
```

## Daily Commands

```bash
fulcrum doctor --json
fulcrum install --dry-run
fulcrum install --profile full --dry-run
fulcrum uninstall --dry-run

fulcrum component info package.cloudflare
fulcrum component install package.superpowers --all-agents
fulcrum component remove package.caveman --all-agents --dry-run

fulcrum hooks list
fulcrum hooks enable format
fulcrum hooks disable format

fulcrum skills sync
fulcrum skills sync --codex-project <repo>
fulcrum skills upstream
fulcrum skills list --installed

fulcrum mcp list
fulcrum mcp enable github --all-agents
fulcrum mcp disable github --all-agents
```

## Package Surface Policy

Fulcrum uses an official-first rule:

1. Use the vendor/native installer when an agent has one.
2. Mirror the vendor-published package content into nearest native surfaces when an agent does not.
3. Adapt loadable surfaces into native agent config, not only package cache: `skills/*/SKILL.md` become agent skill paths and package `.mcp.json` entries become native MCP config.
4. Record unsupported primitives explicitly in `component status` and `doctor`; do not silently omit them.

Managed package parity covers:

- skills
- rules/context files
- MCP manifests plus native MCP config
- commands/prompts
- agents/subagents
- hooks
- tools/scripts
- manifests and metadata
- assets/templates/themes/docs
- unknown runtime files

Generated CLI agent mirrors exclude source-only backups such as `.original.md` and `.backup.md`; project source keeps them.

## Skills

Fulcrum-authored skills keep prefix-free frontmatter names like `jq`, `ruff`, and `subagent-orchestration`. The install mechanism provides the namespace:

```text
Claude Code: /fulcrum:<name> through fulcrum@fulcrum
Codex CLI:   ~/.codex/skills/fulcrum/<name>/ or project .codex/skills/fulcrum/<name>/
Gemini CLI:  ~/.gemini/extensions/fulcrum-skills/skills/<name>/
OpenCode:    ~/.config/opencode/skills/fulcrum/<name>/
Pi CLI:      ~/.pi/agent/skills/fulcrum/<name>/
```

Authored skill list:

```text
bat biome dart-toolchain difftastic direnv eza flarectl fzf gh git-cliff
gitleaks google-java-format hyperfine jq just ktlint lizard mise osv-scanner
pmd ruff sd spotbugs subagent-orchestration usql watchexec xh yq zoxide
```

## Documentation Map

Start here:

- [User guide](docs/user-guide.md) — install profiles, component lifecycle, daily commands, troubleshooting.
- [Developer guide](docs/developer-guide.md) — repo layout, architecture, tests, release process.
- [Handover](HANDOVER.md) — live state, decisions, recent work, outstanding layers.
- [Contributing](docs/contributing.md) — commit format, compression contract, review expectations.

Core reference:

- [Agents](docs/agents.md) — per-agent paths, hook/MCP/skill differences, known quirks.
- [Context](docs/context.md) — global/project rules and sentinel splice behavior.
- [Hooks](docs/hooks.md) — hook event model and recipe catalog.
- [Tool output policy](docs/tool-output-policy.md) — per-tool output routing tiers.
- [Capabilities](docs/capabilities.md) — bring-your-own workstation toolchain.
- [Skills](docs/skills.md) — paths, upstream lockfile, authoring, evals.
- [MCP policy](docs/mcp.md) — official-first MCP/package policy, auth, builtin catalogue.
- [Caveman](docs/caveman.md) — output compression setup and source-doc compression.
- [Setup smoke test](docs/smoke-test.md) — end-to-end install verification.
- [Skill smoke test](docs/skill-smoke-test.md) — manual cross-agent skill verification.

Source registries:

- [skills/SOURCES.md](skills/SOURCES.md) — authored skill registry.
- [skills/upstream.lock](skills/upstream.lock) — pinned upstream skill sources.
- [rules/AGENTS.md](rules/AGENTS.md) — global Fulcrum behavior block.
- [src/agents/registry.ts](src/agents/registry.ts) — canonical supported-agent list.

## Development

```bash
bun install
bun run ci
bun run src/index.ts doctor
bun run src/index.ts component list
bun run build:all
```

`bun run ci` runs install smoke, typecheck, full Bun tests, five platform builds, skills lint, and compression check.

Release flow:

```bash
bun run changelog
bun run release vX.Y.Z
bun run release vX.Y.Z --gh
```

No GitHub Actions are the source of truth today. Local `bun run ci` and `bun run release` are the gates.

## Planned Layers

Still placeholders:

- repository supervisor
- task system
- agent runs
- context engine
- memory
- artifacts
- generic `fulcrum plugins ...` UX

Managed package lifecycle exists now for known packages. A generic plugin marketplace/translator does not.
