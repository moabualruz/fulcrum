# Tool-Output Policy

> Tool value = output. Default: **leave-as-is** — never blanket-truncate. Per-tool overrides only, justified by output shape.
>
> Implemented by `fulcrum hook tool-output-router` (source: `services/platform-core/src/application/agent-hooks/tool-output-router.ts`), driven by `~/.fulcrum/tool-output-policy.toml` (seed config in `config/tool-output-policy.toml`).

## Tiers

| Tier | What agent sees | When use |
|---|---|---|
| `raw` | stdout unchanged | Output small, structured, load-bearing. `fd`, `eza`, `gh --json` (small), `jq`, `hcloud`. |
| `status-only` | `exit=<code> <first stderr line or "ok">` | Tools where exit code = signal. Formatters, `mise install`, `direnv`, `sd`. |
| `summary+head` | `exit + bytes + lines + first 20 lines` | Output long but head usually answers. Search hits (`rg`, `ast-grep`), build logs, compiler errors (`clippy`, `dart analyze`). |
| `summary+file` | `exit + bytes + path + head` | Output = structured findings list — agent rarely needs every row, sometimes drill in. `semgrep`, `ruff`, `biome`, `phpstan`, `tvly`, MCP wiki contents. |
| `leave-as-is` | no-op (default) | Interactive TTY tools (`fzf`, `tmux`, `bat`, `watchexec`); unknown tools. |

Files from `summary+file` + `file-only` land at `~/.fulcrum/state/<project>/<tool>-<timestamp>.out`.

## Archetype defaults

| Archetype | Default tier | Examples |
|---|---|---|
| Tiny status | `raw` | `fd`, `eza`, `zoxide` |
| Small structured | `raw_then_head` (flip to summary+head over 16KB) | `rg`, `ast-grep`, `lizard` |
| Medium structured | `raw_then_file` (flip over 32-64KB) | `gh`, `jq`, `yq`, `xh`, `gitleaks`, `ruff`, `biome`, `golangci-lint` |
| Findings list | `summary+file` | `semgrep`, `phpstan`, `tvly`, `pmd`, `spotbugs` |
| Fire-and-forget | `status-only` | `mise install`, `direnv allow`, `sd`, formatters |
| Interactive | `leave-as-is` | `fzf`, `tmux`, `bat`, `watchexec` |

## Per-tool table

Full per-tool assignments in `config/tool-output-policy.toml`. Edit `~/.fulcrum/tool-output-policy.toml` to override locally — `install.sh` seeds user copy from repo on first run; later runs leave user edits intact.

## Router behavior

Stdin = agent's PostToolUse JSON envelope. Router:

1. Extract `tool_name`. For `Bash`, derive leaf tool from `tool_input.command`'s first non-flag token.
2. Look up `[tools.<name>]` → fall back to referenced `[profiles.<name>]` → fall back to `[default]`.
3. If policy has both `tier_under`/`tier_over` and `threshold_bytes`, pick tier by `len(stdout)`.
4. Apply tier (raw / status-only / summary+head / summary+file / file-only / leave-as-is).
5. Stderr **always** passed raw — error context never truncated.

## Anti-patterns

- **Blanket MCP truncation.** Each MCP server own contract; route per `mcp__<server>__<tool>` name, not wildcard.
- **Truncate before save.** Always write full output to file first if tier requires; emit head from in-memory copy. Truncating file kills audit trail.
- **Pipelines route by leading tool.** `rg foo | jq` treated as `rg` call. Want `jq` semantics → run `jq` directly.

## Cross-refs

- Hook recipe: `fulcrum hook tool-output-router` (`services/platform-core/src/application/agent-hooks/tool-output-router.ts`)
- Per-agent registration: see `docs/hooks.md` §6 for matrix.
