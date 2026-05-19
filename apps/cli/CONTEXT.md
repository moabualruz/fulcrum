# Context: CLI

> Command dispatch and per-feature CLI surfaces for the `fulcrum` binary. Entry point is `apps/cli/src/main.ts`; this directory hosts every subcommand handler and its tests.

## Vocabulary

- **Subcommand** — top-level verb after `fulcrum` (e.g. `install`, `doctor`, `component`, `mcp`, `skills`, `hooks`, `init`).
- **Profile** — named install plan: `minimal`, `rules-only`, `full`. Drives default-profile component plans.
- **Surface** — agent-visible artifact a package ships: skill, rule, MCP, command, agent, hook, tool, metadata, asset (`S/R/M/C/A/H/T/P`).
- **Mirror** — full-package copy into a non-native agent's directory tree when no first-party installer exists.
- **Parity report** — per-package, per-agent count of source vs installed surfaces, missing targets, unsupported primitives, and source-only leaks.
- **Disabled config** — native agent config that registers an MCP server in a not-enabled state. Codex/Gemini/OpenCode support; Claude/Pi report `disabledConfigUnsupported`.

## Public surface

| Subcommand            | Handler                       |
| --------------------- | ----------------------------- |
| `fulcrum install`     | `install.ts`                  |
| `fulcrum uninstall`   | `uninstall.ts`                |
| `fulcrum init`        | `init.ts`                     |
| `fulcrum component`   | `component.ts`                |
| `fulcrum hooks`       | `hooks.ts`                    |
| `fulcrum mcp`         | `mcp-cmd.ts` + `mcp.ts`       |
| `fulcrum skills`      | `skills.ts` + `upstream-skills.ts` |
| `fulcrum doctor`      | `doctor.ts`                   |
| `fulcrum compress`    | `compress.ts`                 |

Product workflow parity commands live under `fulcrum product reports …`: `uat-handoff`, `decision`, and `e2e-run` expose the same UAT/code-review final gate as the web review route and TUI **ReviewHandoffScreen**. JSON output must include project/trace linkage, generated E2E artifact metadata, and the report service result without CLI-only state.


## Invariants

- `install` and `uninstall` route through `profile.default` / `profile.minimal` via the component lifecycle engine; flags translate to planner exclusions.
- `--dry-run` calls the same planner as real execution and never writes files or runs vendor CLIs.
- `--json` output is parseable; flag is supported on every list/get verb.
- Commands operating on `package.*` components must use package-aware helpers; generic registry/skills code never touches package-owned MCPs/skills.
- Generated agent mirrors exclude `.original.md`, `.backup.md`, `_archive`, `_template`, `.git`, `node_modules`, and worktree dirs. Project source keeps `.original.md`.

## Cross-context coupling

- Reads `AGENTS` from `services/execution-orchestration/src/application/agent-catalog/`.
- Drives `services/platform-core/src/application/component-lifecycle/` planner/executor for install, remove, enable, disable.
- Calls platform runtime-support helpers for process execution and source cleanup.

## ADRs

Context-scoped decisions will live under `apps/cli/src/docs/adr/` when recorded. None recorded yet; create the directory lazily from `docs/adr/0000-template.md`.
