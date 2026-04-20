# @fulcrum-agent-os/opencode-plugin

[opencode](https://opencode.ai) plugin for the [Fulcrum Agent OS](https://github.com/moabualruz/fulcrum) — injects the canonical Fulcrum-first system rider into every LLM turn, verifies its integrity, and emits telemetry when the primary injection path silently fails.

## Install

```json
// opencode.jsonc
{
  "plugin": ["@fulcrum-agent-os/opencode-plugin"]
}
```

Bun auto-installs the package at opencode startup; no separate `npm install` step.

Manual / dogfood install (clone the Fulcrum repo instead):

```json
// opencode.jsonc
{
  "plugin": ["./plugins/fulcrum.ts"]
}
```

## What it does

- **System rider** — reads `.opencode/rules/fulcrum-rule-*.md` (or the canonical `agent-integration/rules/` in dogfood mode), concatenates them sorted by filename, and prepends the result inside a `<fulcrum-system-rider>` fence on every LLM call via `experimental.chat.system.transform`.
- **Integrity chain** — computes SHA-256 of the rider and verifies against a sibling `.ridersum` file if present. Mismatch logs a warning but never blocks the agent (AD-3 fail-open).
- **Fallback telemetry** — if `experimental.chat.system.transform` fires zero times in a session, the `session.idle` handler emits an `opencode_rider_never_injected` graph event so the measurement harness can detect silent primary-path failures.
- **Tool policy bridge** — per-tool `tool.execute.before` + `tool.execute.after` hooks shell to `fulcrum hook auto` for secret scanning, CoS team-invoke guards, and post-tool memory writes.
- **Workspace snapshot** — appends live `get_workspace_status` output (active / blocked run counts) after the rider.
- **Shell env** — exposes `FULCRUM_WORKSPACE_ID` / `FULCRUM_PROJECT_ID` so subprocesses can find the workspace without reading config.

## Configuration

| Env var | Default | Effect |
|---|---|---|
| `FULCRUM_NO_RECALL_NUDGE` | unset | Set to `1` to suppress the Fulcrum-first stderr nudge while keeping telemetry opt-out events logged. |
| `FULCRUM_BIAS_VARIANT` | `auto` | `auto` (default): try passive injection, fall back to nudge. `A`: nudge-only. `B`: alias for `auto`. |
| `OPENCODE_SESSION_ID` | (injected by opencode) | Session identifier passed to every Fulcrum hook invocation. |

## License

MIT — see [LICENSE](./LICENSE).
