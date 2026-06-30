# Context: CLI

> Command dispatch and per-feature CLI surfaces for the `fulcrum` binary. Entry point is `apps/cli/src/main.ts`; this directory hosts every subcommand handler and its tests.

## Vocabulary

- **Subcommand** — top-level verb after `fulcrum` (e.g. `install`, `doctor`, `component`, `mcp`, `skills`, `hooks`, `init`).
- **Profile** — named install plan: `minimal`, `rules-only`, `full`. Drives default-profile component plans.
- **Surface** — agent-visible artifact a package ships: skill, rule, MCP, command, agent, hook, tool, metadata, asset (`S/R/M/C/A/H/T/P`).
- **Mirror** — full-package copy into a non-native agent's directory tree when no first-party installer exists.
- **Managed package** - lifecycle component that installs a vendor tool or package through Fulcrum while preserving the vendor's native setup contract.
- **Headroom package** - managed Headroom CLI/MCP/proxy integration for context compression and CCR retrieval. It complements RTK and CodeGraph; it does not replace CodeGraph's indexed code intelligence.
- **Parity report** — per-package, per-agent count of source vs installed surfaces, missing targets, unsupported primitives, and source-only leaks.
- **Disabled config** — native agent config that registers an MCP server in a not-enabled state. Codex/Gemini/OpenCode support; Claude/Pi report `disabledConfigUnsupported`.
- **Session command** — `fulcrum session ...` controls persisted AI Assist sessions: list, pause, resume, abort, checkpoint, restore, checkpoints, watch. User-facing copy says session, not ACP.

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
| `fulcrum session`     | `commands/session.ts`        |
| `fulcrum doctor`      | `doctor.ts`                   |
| `fulcrum compress`    | `compress.ts`                 |

Product workflow parity commands live under `fulcrum product reports …`: `uat-handoff`, `decision`, and `e2e-run` expose the same UAT/code-review final gate as the web review route and TUI **ReviewHandoffScreen**. JSON output must include project/trace linkage, generated E2E artifact metadata, and the report service result without CLI-only state.


## Invariants

- `install` and `uninstall` route through `profile.default` / `profile.minimal` via the component lifecycle engine; flags translate to planner exclusions.
- `--dry-run` calls the same planner as real execution and never writes files or runs vendor CLIs.
- `--json` output is wrapped in the canonical `fulcrum.cli.v1` envelope (`CLI-TUI-UX.md` §3) via the shared helper `src/lib/envelope.ts` / `src/lib/cli-output.ts` — twelve keys (`schema`, `trace_id`, `span_id`, `run_id`, `project_id`, `command`, `args`, `result`, `errors`, `next_actions`, `duration_ms`, `timestamp`); `errors`/`next_actions` are always arrays. Streaming commands emit JSONL — one envelope per line plus a `{schema,result:null,end:true,trace_id}` end sentinel. `--jq <expr>` filters `.result`. `--json-raw` is a one-release compatibility flag that emits the pre-envelope payload shape for scripts not yet migrated; it is documented for removal in the next release. Plain (non-`--json`) output renders the same underlying result data.
- **Trace spine** — plain (non-`--json`) output for run-bearing commands prints the `DESIGN.md` §4.10 trace header line (`trace: 4f3a1c9e…  run: 01HXYZ…  project: fulcrum`) via `src/lib/trace-line.ts`; the printed `trace_id`/`run_id` are the SAME identity the `--json` envelope carries for that invocation, so a run is followable across web / CLI / TUI. Plain-mode errors print the `COPY.md` §3 / `CLI-TUI-UX.md` §5 recovery block (message + `Fix:` action + `trace=<id>`) to stderr. Trace formatting honours the `CLI-TUI-UX.md` §2.3 colour-disable conditions (`--no-color`, `NO_COLOR`, `FULCRUM_NO_COLOR`, `TERM=dumb`, non-TTY) — no ANSI leaks into a piped or colour-disabled line.
- Commands operating on `package.*` components must use package-aware helpers; generic registry/skills code never touches package-owned MCPs/skills.
- Generated agent mirrors exclude `.original.md`, `.backup.md`, `_archive`, `_template`, `.git`, `node_modules`, and worktree dirs. Project source keeps `.original.md`.

## Cross-context coupling

- Reads `AGENTS` from `services/execution-orchestration/src/application/agent-catalog/`.
- Drives `services/platform-core/src/application/component-lifecycle/` planner/executor for install, remove, enable, disable.
- Calls platform runtime-support helpers for process execution and source cleanup.

## ADRs

Context-scoped decisions will live under `apps/cli/src/docs/adr/` when recorded. None recorded yet; create the directory lazily from `docs/adr/0000-template.md`.
