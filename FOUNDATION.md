# Fulcrum — AI-Assisted Development Environment

> Reference implementation: Claude Code. Cross-agent translations in [docs/agents.md](docs/agents.md).

---

## Principles

- **CLI and skills over MCP.** MCPs spawn long-running processes and consume 55k–100k tokens at startup with 5+ servers active — before your first message. A CLI + skill achieves the same with zero overhead.
- **MCPs off by default.** Register MCPs disabled; enable per-session when genuinely needed.
- **Behavioral rules, not knowledge.** CLAUDE.md changes what the agent *does*, not what it *knows*. `"Use ruff, never flake8"` works. `"Write clean code"` does nothing.
- **Agent-friendly tools output JSON.** `--json` / `--format json` is the selection criterion for every CLI in this stack.

---

## Architecture

| Layer | Job | Mechanism |
|---|---|---|
| **Context** | Always-on rules and conventions | `~/.claude/CLAUDE.md` + `AGENTS.md` |
| **Automation** | Deterministic enforcement (cannot be ignored) | Hooks in `~/.claude/settings.json` |
| **Capability** | What the agent can do | CLI tools + `SKILL.md` files |
| **MCPs** | Opt-in only | Registered disabled, enable when needed |

---

## Documents

Each topic is its own foundation document. Read them in dependency order:

| Doc | Topic | Status |
|---|---|---|
| [docs/context.md](docs/context.md) | Context layer — `CLAUDE.md`, `AGENTS.md` conventions | ✅ |
| [docs/hooks.md](docs/hooks.md) | Automation layer — index-maintenance hooks | ✅ |
| [docs/capabilities.md](docs/capabilities.md) | Capability layer — CLI tool catalogue | ✅ |
| [docs/skills.md](docs/skills.md) | Skills — per-agent paths, catalogue, adoption strategy | ✅ |
| [docs/mcp.md](docs/mcp.md) | MCP policy — opt-in only | ✅ |
| [docs/agents.md](docs/agents.md) | Cross-agent translation — Codex, Gemini, OpenCode, Pi | ✅ |

---

## Reading order for a fresh install

1. **[capabilities.md](docs/capabilities.md)** — install the foundation CLI tools.
2. **[context.md](docs/context.md)** — write your global `CLAUDE.md` and per-project `AGENTS.md`.
3. **[hooks.md](docs/hooks.md)** — wire up index maintenance hooks.
4. **[skills.md](docs/skills.md)** — install superpowers as the cross-agent base.
5. **[mcp.md](docs/mcp.md)** — register `deepwiki` as the only always-on MCP.
6. **[agents.md](docs/agents.md)** — replicate the setup on Codex, Gemini, OpenCode, Pi as needed.

---

## Status

This is the design document. Bootstrap commands are specified per topic; nothing is installed automatically. Run the bootstrap from each doc when ready.
