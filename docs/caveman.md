# Caveman — Output compression across agents

## What

**Caveman** — third-party output-compression skill from `JuliusBrussee/caveman`. Cuts markdown by dropping articles, hedging, pleasantries; keeps code, paths, commands, URLs, versions, tool names verbatim. Real-world: ~75% output-token reduction, ~46% memory-file input-token cut. Mandatory cross-agent default per HANDOVER.md §6.1.

## Install

Five agents, five paths. Never `~/.agents/` (shared folder pollutes every agent context).

| Agent | Install path | Command / method |
|---|---|---|
| Claude Code | Plugin system | `claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman` (fulcrum install runs this) |
| Gemini CLI | Extension system | `gemini extensions install https://github.com/JuliusBrussee/caveman --consent --skip-settings` (fulcrum install runs this) |
| Codex CLI | `~/.codex/skills/caveman/` + siblings + Codex plugin cache/hooks/config | Clone official repo; copy `skills/*`; mirror `plugins/caveman` to `~/.codex/plugins/cache/caveman/caveman/<version>/`; merge `.codex/hooks.json`; enable `caveman@caveman` |
| OpenCode | `~/.config/opencode/skills/caveman/` + siblings | Clone official repo; copy `skills/*` |
| Pi CLI | `~/.pi/agent/skills/caveman/` + siblings | Clone official repo; copy `skills/*` |

Five caveman skills: `caveman`, `caveman-commit`, `caveman-help`, `caveman-review`, `compress`. `compress` skill compresses markdown in-place (see "Compression of in-repo content").

## Uninstall

`fulcrum uninstall --include-caveman` calls native vendor uninstall commands for plugin/extension agents, then removes Fulcrum-owned filesystem mirrors.

| Agent | Uninstall command |
|---|---|
| Claude Code | `claude plugin uninstall caveman@caveman` (best-effort; log + continue on error) |
| Gemini CLI | `gemini extensions uninstall caveman` (best-effort) |
| Codex CLI | Remove `~/.codex/skills/caveman/` + sibling skills and `~/.codex/plugins/cache/caveman/` |
| OpenCode | Remove `~/.config/opencode/skills/caveman/` + sibling skills |
| Pi CLI | Remove `~/.pi/agent/skills/caveman/` + sibling skills |

Always removes `~/.config/caveman/config.json` (the defaultMode lock).

## Default mode lock

`lockCavemanUltra()` in `apps/cli/src/install.ts` writes `~/.config/caveman/config.json` with `{"defaultMode": "ultra"}` — idempotent, skips if already set. Resolution order:

1. Environment: `CAVEMAN_DEFAULT_MODE=<mode>` (wins)
2. Config file: `~/.config/caveman/config.json` `defaultMode` field
3. Built-in: `"full"` (fallback)

Override per-session: `/caveman stop` or `/caveman mode lite/full/ultra`. Resume next session (no persistent override).

## What gets compressed

Every in-repo markdown → two files: `.original.md` (human-edit) and `.md` (agent-read, compressed).

Targets:
- `skills/<name>/SKILL.md` (all 29 skills)
- `skills/<name>/references/*.md` (progressive section detail)
- `rules/AGENTS.md` (behavioral rules)
- Project `AGENTS.md`
- `skills/SOURCES.md` (registry)
- `docs/*.md` (8 context docs)

Idempotent: if `<file>.original.md` exists, already compressed.

Re-compress: `bun run compress` (all defaults) or `scripts/compress-with-caveman.sh <file>` (single file).

CI gate: `bun run compress -- --check` exits 1 if any `.md` lacks `.original.md` (pending compression).

## What stays verbose

NOT compressed:
- `HANDOVER.md` — next-session pickup; verbose.
- `README.md` — public-facing; verbose.

Both serve cold-read audiences; compression degrades role.

## Frontmatter preserved

YAML frontmatter (incl. `description:`) preserved verbatim. Intentional: skill `description:` is trigger surface; compressing risks breaking auto-discovery. Frontmatter untouched by design.

## Doctor

`fulcrum doctor` includes "Caveman (per-agent compression)" section:
- Per-agent state (detected, installed, skipped, manual fallback, error)
- Resolved `defaultMode` (env, config file, or fallback)

Example:
```
Caveman defaultMode: ultra  [file (/Users/<you>/.config/caveman/config.json)]
  Claude Code    ✓  installed
  Codex CLI      ·  not installed
  Gemini CLI     ✓  installed
  OpenCode       ✓  installed
  Pi CLI         ·  not installed
```

## Adding a new skill

New `skills/<name>/SKILL.md`:

1. Write uncompressed version.
2. Keep verbose section detail in `references/<section>.original.md` and shipped copy in `references/<section>.md`.
3. Run `bun run compress` or `scripts/compress-with-caveman.sh skills/<name>/SKILL.md skills/<name>/references/*.md`.
4. Commit shipped `.md` files and their `.original.md` siblings.

Lint passes either form. CI `bun run compress -- --check` fails (hard gate) if any `.md` lacks `.original.md` sibling — adding uncompressed files blocks CI pass.

## Opt-out

Per-session: `/caveman stop` or `/caveman mode lite/full`.

Persistent: `CAVEMAN_DEFAULT_MODE=full` in shell env (wins over config-file lock).

## Cross-refs

- `rules/AGENTS.md` §0b — output-style rule (caveman ultra always-on).
- `HANDOVER.md` §6.1 — integration checklist (complete).
- `scripts/compress-with-caveman.sh` — wrapper; calls caveman CLI.
- `apps/cli/src/install.ts` — `installCaveman()` + `lockCavemanUltra()` logic.
