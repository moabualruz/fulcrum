# Context: Hooks

> Subcommands invoked by agent runtimes via hook envelopes. Each hook reads JSON on stdin, applies a narrow policy, and exits with a status the host CLI consumes.

## Vocabulary

- **Hook envelope** — JSON payload passed on stdin by the agent runtime. Shape varies by hook event: `SessionStart`, `PreToolUse`, `PostToolUse`, `SessionEnd`.
- **Hook subcommand** — `fulcrum hook <name>`. Each `<name>.ts` exports a single async entry point invoked from `src/index.ts`.
- **Recipe** — companion shell snippet under `hooks/recipes/<name>.snippet.md` vendored into agent settings by `fulcrum install`.
- **Marker** — sentinel comment that lets the hook detect whether it has already been registered.

## Hooks

| Name                  | Event                  | Purpose                                                     |
| --------------------- | ---------------------- | ----------------------------------------------------------- |
| `format`              | `PostToolUse Write|Edit` | Format edited files via project formatter.                |
| `lint-gate`           | `PostToolUse Write|Edit` | Run lints; block on errors.                               |
| `pm-policy`           | `PreToolUse Bash`      | Enforce package-manager policy (no npm in pnpm repos, …). |
| `test-on-edit`        | `PostToolUse Write|Edit` | Trigger affected tests on save.                           |
| `audit-log`           | `PostToolUse Bash`     | Append shell command audit trail.                           |
| `index-check`         | `SessionStart`         | Verify project indices are fresh.                           |
| `index-rebuild`       | `SessionStart`         | Rebuild project indices when stale.                         |
| `tool-output-router`  | `PostToolUse any`      | Route tool output per `~/.fulcrum/tool-output-policy.toml`. |

## Invariants

- Hooks read stdin, write a single JSON envelope to stdout, and exit fast (target < 200ms for path-only checks).
- Hooks must be idempotent: agents may invoke the same hook multiple times per session.
- Hooks must fail open by default. A crashing hook never wedges the agent.
- Per-hook `<name>.test.ts` covers parse, decision, and serialization paths.
- New hooks register in the catalog as `hooks.<name>` and ship a recipe under `hooks/recipes/`.

## Cross-context coupling

- Reads `AGENTS` for per-agent shape conventions where envelopes differ.
- Tool-output-router reads `config/tool-output-policy.toml`.
- No reverse coupling: hooks never call `src/cli/`, `src/components/`, or the lifecycle engine.

## ADRs

Context-scoped decisions live under `src/hooks/docs/adr/`. None recorded yet.
