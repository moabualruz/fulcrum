# Fulcrum — AI-Assisted Development Environment

> Multi-agent foundation. Reference shapes are taken from Claude Code's docs (richest primary sources); the same setup is wired into Codex CLI, Gemini CLI, OpenCode, and Pi CLI. Per-agent translations in [docs/agents.md](docs/agents.md).

---

## Principles

- **CLI and skills over MCP.** MCPs spawn long-running processes and consume 55k–100k tokens at startup with 5+ servers active — before your first message. A CLI + skill achieves the same with zero overhead.
- **MCPs off by default.** Register MCPs disabled; enable per-session when genuinely needed.
- **Behavioral rules, not knowledge.** Rules change what the agent *does*, not what it *knows*. `"Use ruff, never flake8"` works. `"Write clean code"` does nothing. One body in `rules/AGENTS.md`, installed into each agent's primary rules file.
- **Agent-friendly tools output JSON.** `--json` / `--format json` is the selection criterion for every CLI in this stack.

---

## Architecture

| Layer | Job | Mechanism |
|---|---|---|
| **Context** | Always-on rules and conventions | `rules/AGENTS.md` body spliced via sentinel markers into each agent's primary rules file |
| **Automation** | Deterministic enforcement (cannot be ignored) | `fulcrum hook <name>` subcommands of one cross-platform binary; registered per-agent (settings.json / hooks.json / TS plugin / TS extension) |
| **Capability** | What the agent can do | CLI tools + `SKILL.md` files installed per-agent via `fulcrum skills sync` |
| **MCPs** | Opt-in only | Registered disabled, enable when needed (Pi: not supported by design) |

---

## Documents

Each topic is its own foundation document. Read them in dependency order:

| Doc | Topic | Status |
|---|---|---|
| [docs/context.md](docs/context.md) | Context layer — `CLAUDE.md`, `AGENTS.md` conventions | ✅ |
| [docs/hooks.md](docs/hooks.md) | Automation layer — full event surface + 8 shipped recipes (index, format, lint-gate, pm-policy, test-on-edit, audit-log, tool-output-router) | ✅ |
| [docs/tool-output-policy.md](docs/tool-output-policy.md) | Per-tool output strategies (raw / status / summary / file) — drives `tool-output-router` | ✅ |
| [docs/capabilities.md](docs/capabilities.md) | Capability layer — CLI tool catalogue | ✅ |
| [docs/skills.md](docs/skills.md) | Skills — paths, authoring template, fork policy, verification tiers | ✅ |
| [docs/skill-smoke-test.md](docs/skill-smoke-test.md) | Manual cross-agent verification checklist | ✅ |
| [docs/mcp.md](docs/mcp.md) | MCP policy — opt-in only; account-disconnect for claude.ai integrated MCPs | ✅ |
| [docs/agents.md](docs/agents.md) | Cross-agent translation — Codex, Gemini, OpenCode, Pi | ✅ |

---

## Install

Requires [Bun](https://bun.sh) on the host (one-liner: `curl -fsSL https://bun.sh/install | bash`). Then from a clone:

```bash
git clone <repo> ~/code/fulcrum
cd ~/code/fulcrum
bash scripts/install.sh                       # builds the binary, installs it, splices rules
# or include project-level bootstrap:
bash scripts/install.sh --with-project ~/code/myproject
```

After install, `fulcrum` lives at `~/.fulcrum/bin/fulcrum` (and is symlinked to `~/.local/bin/fulcrum` if that's on PATH). Common commands:

```bash
fulcrum init <dir>            # bootstrap a project's AGENTS.md + .claude/CLAUDE.md
fulcrum hooks list            # show available hook recipes
fulcrum hooks enable format   # mark enabled + print per-agent registration snippet
fulcrum skills sync           # mirror skills/<name>/ to all 5 agents
fulcrum skills lint <path>    # validate a SKILL.md against the strictest agent rules
fulcrum hook <name>           # run a hook recipe (called by agent runtimes via stdin)
```

The orchestrator and all 8 hook recipes are TypeScript subcommands of one Bun-compiled binary (60–120MB depending on platform; cross-compiled via `bun build --compile`). No bash, jq, yq, or Python required at runtime.

---

## Reading order for a fresh install

1. **[capabilities.md](docs/capabilities.md)** — install the foundation CLI tools.
2. **[context.md](docs/context.md)** — write your global rules and per-project `AGENTS.md`.
3. **[hooks.md](docs/hooks.md)** — wire up the recipes you want; `fulcrum hooks enable` prints each per-agent snippet.
4. **[skills.md](docs/skills.md)** — install superpowers as the cross-agent base; author skills via the template.
5. **[mcp.md](docs/mcp.md)** — register `deepwiki` as the only always-on MCP.
6. **[agents.md](docs/agents.md)** — replicate the setup on Codex, Gemini, OpenCode, Pi as needed.
