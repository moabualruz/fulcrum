# Fulcrum — AGENTS.md

> Project-level instructions for any agent (or human) working in this repo.

## What Fulcrum is becoming

**Fulcrum is a local-first CLI Agent OS for supervising repositories, tasks, agent runs, context, memory, and artifacts.**

That destination. Current `main` = foundation work: cross-agent install layer, hook plumbing, skills, rules, output policy, component lifecycle, package mirrors, MCP registry, CLI orchestrator everything else sit on top of. Mile zero of long road; every commit advance foundation, not jump ahead.

## Where we are right now (foundation)

Current `main` foundation includes:

- One Bun-compiled `fulcrum` binary, eight hook subcommands (`format`, `lint-gate`, `pm-policy`, `test-on-edit`, `audit-log`, `index-check`, `index-rebuild`, `tool-output-router`).
- Orchestrator (`fulcrum init / install / hooks / skills / doctor / compress`) wires hooks into five agent runtimes (Claude Code, Codex CLI, Gemini CLI, OpenCode, Pi CLI).
- Sentinel-block rules splicer for cross-agent rules distribution.
- Per-tool output-handling policy (`config/tool-output-policy.toml`) drives `tool-output-router` hook.
- 29 in-repo skills caveman-compressed (`.original.md` beside each), 20-entry trigger evals each, content-verified against upstream sources.
- `src/agents/registry.ts` — canonical `Agent` interface + `AGENTS[5]` array; single source of truth consumed by install, doctor, skills. No more inline agent configs scattered across files.
- `fulcrum install --profile minimal|rules-only|full --dry-run` support; `fulcrum doctor --json` for machine-readable health output.
- `bun run compress` (`src/cli/compress.ts`) — idempotent caveman compression of in-repo content; `--check` for CI.
- Local CI runner (`bun run ci`) — 6 stages: install / typecheck / test / build:all / skills:lint / compress:check (hard gate). Local release runner (`bun run release vX.Y.Z`). `fulcrum doctor` shows caveman `defaultMode`, per-agent install state, MCP health, skill metadata budget, and ignored project worktree warnings. Skills lint enforces rules ≤ 200 lines. CHANGELOG via `git-cliff`.

## Where we are going (placeholders, not implementations)

Layers foundation prep for. **Not built yet** — do not assume exist or write code depending on them. Listed so anyone reading repo see trajectory.

- **Repository supervisor** — multi-repo awareness, work-tree state, branch posture.
- **Task system** — durable units of work (issues/tasks) tracked across agent sessions.
- **Agent runs** — first-class agent invocations with inputs, outputs, transcripts, retries.
- **Context engine** — selecting + assembling what each run sees, beyond existing rules splice.
- **Memory** — persistent facts, decisions, references across sessions.
- **Artifacts** — outputs of runs (diffs, plans, reports) tracked, addressable, queryable.
- **Plugins / extensions** — generic `fulcrum plugins …` UX for third-party drop-ins. Package-specific lifecycle mirroring already exists for Caveman, Repomix, Cloudflare, and Superpowers.

## Skill namespacing — the `fulcrum:` prefix

`fulcrum skills sync` distributes authored skills using each agent's native namespacing primitive:

```
Claude Code: plugin (fulcrum@fulcrum)
             ~/.claude/plugins/cache/fulcrum/fulcrum/<ver>/skills/<name>/SKILL.md
             invocation: /fulcrum:<name>
Codex CLI:   ~/.codex/skills/fulcrum/<name>/SKILL.md            (global opt-in)
             .codex/skills/fulcrum/<name>/SKILL.md              (project opt-in)
OpenCode:    ~/.config/opencode/skills/fulcrum/<name>/SKILL.md  (nested supported)
Pi CLI:      ~/.pi/agent/skills/fulcrum/<name>/SKILL.md         (nested supported)
Gemini CLI:  ~/.gemini/extensions/fulcrum-skills/skills/<name>/SKILL.md
             (extension itself is the namespace)
```

**Why Claude Code differs:** Claude Code's skill loader scans the **top level** of `~/.claude/skills/` only. The `<dir>/fulcrum/<name>/` layout other agents use is invisible to it (open issues anthropics/claude-code#28266, #18192, #39138). Plugin namespace is the supported path — `.claude-plugin/marketplace.json` at repo root declares the `fulcrum` marketplace, `.claude-plugin/plugin.json` declares the plugin. `fulcrum skills sync` runs `claude plugin marketplace add moabualruz/fulcrum && claude plugin install fulcrum@fulcrum`. Skills surface as `/fulcrum:<name>` (e.g. `/fulcrum:jq`).

Other agents (Codex, OpenCode, Pi) walk nested skill dirs natively; Gemini uses an extension scope. Codex global authored skills are skipped by default to avoid user-wide metadata pressure; use `fulcrum skills sync --codex-global` or `--codex-project <dir>` explicitly. All five end up with the same effective `fulcrum:<skill-name>` address space, but the install mechanism differs by agent. Agents still invoke skills by frontmatter `name:` (no colons in identifiers — namespacing path-based or plugin-mediated).

**Migration:** Old Claude Code installs that wrote to `~/.claude/skills/fulcrum/<name>/` are removed automatically by `fulcrum skills sync` after the plugin install succeeds. Re-running `fulcrum install` is idempotent; if the plugin is already registered in `~/.claude/plugins/installed_plugins.json`, the install step is skipped.

## Cross-agent rules distribution

`fulcrum install` reads `rules/AGENTS.md`, sentinel-splices body into each detected agent's primary rules file. User content outside `<!-- BEGIN/END FULCRUM RULES -->` markers preserved verbatim. Idempotent — re-running `fulcrum install` replaces only spliced block.

| Agent | Primary rules file | Method |
|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | sentinel splice |
| Codex CLI | `~/.codex/AGENTS.md` | sentinel splice |
| OpenCode | `~/.config/opencode/AGENTS.md` (also reads `~/.claude/CLAUDE.md`) | sentinel splice |
| Pi CLI | `~/.pi/agent/AGENTS.md` | sentinel splice |
| Gemini CLI | `~/.gemini/GEMINI.md` | body placed at `~/AGENTS.md`; `GEMINI.md` becomes single line `@AGENTS.md` (Gemini inlines `@` imports) |

Project-level enforcement: drop `rules/AGENTS.md` at `<consumer-repo>/AGENTS.md` (or `<consumer-repo>/GEMINI.md` for Gemini-only repos).

Companion artifacts travel with rules:

- Hook recipes — `hooks/recipes/*.snippet.md`, vendored to `~/.fulcrum/hooks/snippets/` by install. Per-agent registration in `docs/hooks.md`.
- Skill registry — `skills/SOURCES.md`. `fulcrum skills sync` mirrors `skills/<name>/` to each agent's native namespace, excluding `.original.md` and source-only folders from generated CLI agent mirrors while keeping them in project source.

## Conventions that apply to current work

- **Skills are one tool, one skill.** Don't fold multiple unrelated tools into one SKILL.md. Exception: two CLIs tightly coupled + ship together (e.g. `dart format` + `dart analyze` → `dart-toolchain`).
- **Skill content correctness not implied by lint.** `fulcrum skills lint` verify frontmatter shape + five required H2 sections. Does **not** verify flags, default values, subcommands accurate against upstream. Authors must verify against tool's `--help` or upstream README before submitting. Previous batch found 46% content-error rate among parallel-authored skills — assume same risk on new ones.
- **No GitHub Actions workflows by default.** Local `bun run ci` + local `bun run release` = gates. If workflow added later, must be additive, not source of truth.
- **No new docs files unless asked.** Update existing docs in place; don't generate planning, decision, or analysis markdown alongside code changes.
- **One commit per logical change.** Bisect granularity matter — separate fixes from features.

## How to read this repo

- `README.md` — install + usage.
- `HANDOVER.md` — current-state snapshot, outstanding work, recent decisions.
- `docs/` — per-topic foundation docs (context, hooks, skills, mcp, agents, capabilities, tool-output policy).
- `docs/caveman.md` — reference: what gets compressed, install, defaultMode, CI gate, doctor, opt-out.
- `rules/AGENTS.md` — body sentinel-spliced into each agent's primary rules file. Different audience from this file: that = "how agent should behave inside any project", this = "what fulcrum is + where going".
- `src/agents/registry.ts` — start here to understand how five agents defined; consumed by install, doctor, skills.
- `skills/SOURCES.md` — skill registry + authoring queue.
