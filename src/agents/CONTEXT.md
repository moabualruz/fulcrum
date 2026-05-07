# Context: Agents

> Canonical registry of supported CLI agents. Every install, doctor, skills sync, and component adapter reads from here.

## Vocabulary

- **Agent** — one of the five supported CLI runtimes: Claude Code, Codex CLI, Gemini CLI, OpenCode, Pi CLI.
- **AgentId** — string union of `claude-code | codex | gemini | opencode | pi`. Stable identifier across the codebase.
- **rootDir** — per-agent home directory probe (e.g. `~/.claude`, `~/.codex`). Used for detection and target paths.
- **rulesFile** — primary rules file the agent loads on session start. Sentinel-spliced by `fulcrum install`.

## Public surface

- `AGENTS: readonly Agent[]` — the five-entry registry. Order is stable.
- `Agent` interface — `id`, `name`, `rootDir`, `rulesFile`, `skillsDir`, `mcpConfig`, etc. See `src/agents/registry.ts` for the live shape.
- `getAgent(id)` — lookup by `AgentId`.

## Invariants

- The registry is the single source of truth. No file under `src/` should re-declare per-agent paths inline.
- Adding a new agent requires updating `AGENTS`, the registry tests, and every consumer that does an `AGENTS.map(...)` or branches on `AgentId`.
- Agent ids never contain colons (`:`); skill namespacing is path-based or plugin-mediated.

## Consumers

- `src/cli/install.ts` / `uninstall.ts` — sentinel splice + per-agent setup.
- `src/cli/skills.ts` / `upstream-skills.ts` / `vendor-packages.ts` — per-agent mirrors.
- `src/cli/mcp-registry.ts` — per-agent MCP config writers.
- `src/cli/doctor.ts` — per-agent detection + state report.
- `src/components/adapters/*` — per-agent action execution.

## ADRs

Context-scoped decisions will live under `src/agents/docs/adr/` when recorded. None recorded yet; create the directory lazily from `docs/adr/0000-template.md`.
