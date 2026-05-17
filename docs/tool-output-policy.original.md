# Tool-Output Policy

> The value of any tool is its output. Default behavior: **leave-as-is** — never blanket-truncate. Per-tool overrides only, justified by the output's typical shape.
>
> Implemented by `fulcrum hook tool-output-router` (source: `src/hooks/tool-output-router.ts`), driven by `~/.fulcrum/tool-output-policy.toml` (seed config in `config/tool-output-policy.toml`).

## Tiers

| Tier | What the agent sees | When to use |
|---|---|---|
| `raw` | stdout unchanged | Output is small, structured, load-bearing. `fd`, `eza`, `gh --json` (small), `jq`, `hcloud`. |
| `status-only` | `exit=<code> <first stderr line or "ok">` | Tools where exit code is the signal. Formatters, `mise install`, `direnv`, `sd`. |
| `summary+head` | `exit + bytes + lines + first 20 lines` | Output is long but the head usually answers. Search hits (`rg`, `ast-grep`), build logs, compiler errors (`clippy`, `dart analyze`). |
| `summary+file` | `exit + bytes + path + head` | Output is structured findings list — agent rarely needs every row but sometimes wants to drill in. `semgrep`, `ruff`, `biome`, `phpstan`, `tvly`, MCP wiki contents. |
| `leave-as-is` | no-op (default) | Interactive TTY tools (`fzf`, `tmux`, `bat`, `watchexec`); unknown tools. |

Files written by `summary+file` and `file-only` land at `~/.fulcrum/state/<project>/<tool>-<timestamp>.out`.

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

Full per-tool assignments live in `config/tool-output-policy.toml`. Edit `~/.fulcrum/tool-output-policy.toml` to override locally — `install.sh` seeds the user copy from the repo on first run; subsequent runs leave user edits intact.

## Router behavior

Input on stdin is the agent's PostToolUse JSON envelope. The router:

1. Extracts `tool_name`. For `Bash`, derives the leaf tool from `tool_input.command`'s first non-flag token.
2. Looks up `[tools.<name>]` → falls back to a referenced `[profiles.<name>]` → falls back to `[default]`.
3. If the policy has both `tier_under`/`tier_over` and a `threshold_bytes`, picks the tier based on `len(stdout)`.
4. Applies the tier (raw / status-only / summary+head / summary+file / file-only / leave-as-is).
5. Stderr is **always** passed through raw — error context is never truncated.

## Anti-patterns

- **Blanket MCP truncation.** Each MCP server defines its own contract; route per `mcp__<server>__<tool>` name, not via wildcard.
- **Truncating before saving.** Always write the full output to file first if the tier requires it; emit head from the in-memory copy. Truncating the file kills the audit trail.
- **Pipelines route by the leading tool.** `rg foo | jq` is treated as an `rg` call. If the agent wants `jq` semantics, run `jq` directly.

## Cross-refs

- Hook recipe: `fulcrum hook tool-output-router` (`src/hooks/tool-output-router.ts`)
- Per-agent registration: see `docs/hooks.md` §6 for the matrix.
