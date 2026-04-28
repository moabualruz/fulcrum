# Caveman — Output compression across agents

## What

**Caveman** is a third-party output-compression skill from `JuliusBrussee/caveman`. It cuts markdown verbosity by dropping articles, hedging, and pleasantries while keeping all code, paths, commands, URLs, versions, and tool names verbatim. Real-world compression: ~75% output-token reduction and ~46% memory-file input-token reduction. Mandatory cross-agent default per HANDOVER.md §6.1.

## Install

Five agents, five install paths. Never use `~/.agents/` (shared folder pollutes every agent's context).

| Agent | Caveman install path | Install command / method |
|---|---|---|
| Claude Code | Plugin system | `claude plugin install caveman@caveman` (fulcrum install runs this) |
| Gemini CLI | Extension system | `gemini extensions install https://github.com/JuliusBrussee/caveman` (fulcrum install runs this) |
| Codex CLI | `~/.codex/skills/caveman/` + siblings | Clone once, copy 5 skills to `~/.codex/skills/` (fulcrum install does this) |
| OpenCode | `~/.config/opencode/skills/caveman/` + siblings | Clone once, copy 5 skills to `~/.config/opencode/skills/` (fulcrum install does this) |
| Pi CLI | `~/.pi/agent/skills/caveman/` + siblings | Clone once, copy 5 skills to `~/.pi/agent/skills/` (fulcrum install does this) |

Five caveman skills are installed: `caveman`, `caveman-commit`, `caveman-help`, `caveman-review`, `compress`. The `compress` skill compresses markdown files in-place (see "Compression of in-repo content" below).

## Default mode lock

`lockCavemanUltra()` in `src/cli/install.ts` writes `~/.config/caveman/config.json` with `{"defaultMode": "ultra"}` — idempotent, skips if already set to `ultra`. Resolution order:

1. Environment: `CAVEMAN_DEFAULT_MODE=<mode>` (wins)
2. Config file: `~/.config/caveman/config.json` `defaultMode` field
3. Built-in default: `"full"` (fallback if both above absent)

User can override per-session with `/caveman` skill (`/caveman mode lite/full/ultra`) or stop caveman with `stop caveman`. Resume next session (no persistent override).

## What gets compressed

Every in-repo markdown is compressed into two files: human-edit `.original.md` form and agent-read `.md` compressed form.

Target files:
- `skills/<name>/SKILL.md` (all 28 skills)
- `rules/AGENTS.md` (behavioral rules)
- Project `AGENTS.md` (project-level instructions)
- `skills/SOURCES.md` (registry and caveman requirement note)
- `docs/*.md` (8 context docs, e.g. `docs/skills.md`, `docs/agents.md`, etc.)

Compression is idempotent: if `<file>.original.md` exists, the file is already compressed; rerun the compress step to refresh the `.md` form from `.original.md`.

Re-compress with `bun run compress` (runs `scripts/compress-with-caveman.sh` on all default targets) or compress a single file with `scripts/compress-with-caveman.sh <file>`.

CI affordance: `bun run compress -- --check` exits with code 1 if any `.md` file has no corresponding `.original.md` (pending compression), helping catch new docs added without compression before commit.

## What stays verbose

Intentionally NOT compressed:
- `HANDOVER.md` — next-session pickup guide; stays verbose for clarity.
- `README.md` — public-facing documentation; stays verbose.

Both serve audiences who need to read them cold; compression would degrade their role.

## Frontmatter preserved

Caveman compress preserves YAML frontmatter (`---` delimited header) verbatim, including the `description:` field. This is intentional: the skill `description:` field is the trigger surface used when invoking `/caveman`, `/compress`, etc. Compressing it risks degrading or breaking skill auto-discovery. Leaving frontmatter untouched is a design choice.

## Doctor

`fulcrum doctor` enumerates installed tools and now includes a "Caveman (per-agent compression)" section reporting:
- Per-agent install state (detected, already installed, skipped, manual fallback, error)
- Resolved `defaultMode` (from env, config file, or fallback)

Example output lines:
```
Claude Code caveman:      ✓ installed
Codex CLI caveman:        · skipped (not detected)
Gemini CLI caveman:       ✓ installed
OpenCode caveman:         ✓ installed
Pi CLI caveman:           · skipped (not detected)
Caveman defaultMode:      ultra (from ~/.config/caveman/config.json)
```

## Adding a new skill

When you author a new `skills/<name>/SKILL.md`:

1. Write the uncompressed version.
2. Run `bun run compress` or `scripts/compress-with-caveman.sh skills/<name>/SKILL.md` to create `skills/<name>/SKILL.md.original.md` and compress the main file.
3. Commit both files.

Lint passes on either the original or compressed form (frontmatter rules apply to both). CI gate `bun run compress -- --check` will reject commits where new `.md` files lack `.original.md` siblings.

## Opt-out

**Per-session:** User can stop caveman with `/caveman stop` or `stop caveman`, or switch to a lighter mode with `/caveman mode lite/full`.

**Persistent override:** Set `CAVEMAN_DEFAULT_MODE=full` in shell environment (e.g., `~/.zshrc`, `~/.bashrc`) to keep caveman off by default. This wins over the config-file lock.

## Cross-refs

- `rules/AGENTS.md` §0b — output-style rule (caveman ultra always-on, articles dropped, code blocks / paths / commands / URLs preserved verbatim, opt-out recovery).
- `HANDOVER.md` §6.1 — caveman integration checklist (completed).
- `scripts/compress-with-caveman.sh` — wrapper script that calls caveman CLI to compress markdown files in-place.
- `src/cli/install.ts` `installCaveman()` and `lockCavemanUltra()` — per-agent caveman install logic and default-mode lock.
