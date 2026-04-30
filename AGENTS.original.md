# Fulcrum — AGENTS.md

> Project-level instructions for any agent (or human) working in this repo.

## What Fulcrum is becoming

**Fulcrum is a local-first CLI Agent OS for supervising repositories, tasks, agent runs, context, memory, and artifacts.**

That is the destination. The current branch is foundation work: the cross-agent install layer, hook plumbing, skills, rules, output policy, and CLI orchestrator that everything else will sit on top of. We are at mile zero of a long road; every commit should advance the foundation, not jump ahead of it.

## Where we are right now (foundation)

What's shipped on `feat/agent-foundation-clean`:

- One Bun-compiled `fulcrum` binary with eight hook subcommands (`format`, `lint-gate`, `pm-policy`, `test-on-edit`, `audit-log`, `index-check`, `index-rebuild`, `tool-output-router`).
- An orchestrator (`fulcrum init / install / hooks / skills / doctor / compress`) that wires those hooks into five agent runtimes (Claude Code, Codex CLI, Gemini CLI, OpenCode, Pi CLI).
- A sentinel-block rules splicer for cross-agent rules distribution.
- A per-tool output-handling policy (`config/tool-output-policy.toml`) driving the `tool-output-router` hook.
- 29 in-repo skills caveman-compressed (`.original.md` beside each), 20-entry trigger evals each, content-verified against upstream sources.
- `src/agents/registry.ts` — canonical `Agent` interface and `AGENTS[5]` array consumed by install, doctor, and skills. Single source of truth for all five agent definitions.
- `fulcrum install --profile minimal|rules-only|full --dry-run` support; `fulcrum doctor --json` for machine-readable health output.
- `bun run compress` (`src/cli/compress.ts`) — idempotent caveman compression of in-repo content; `--check` mode for CI.
- Local CI runner (`bun run ci`) — 6 stages: install / typecheck / test / build:all / skills:lint / compress:check (hard gate). Local release runner (`bun run release vX.Y.Z`). `fulcrum doctor` shows caveman `defaultMode`, per-agent install state, MCP health, skill metadata budget, and ignored project worktree warnings. Skills lint enforces rules ≤ 200 lines. CHANGELOG via `git-cliff`.

## Where we are going (placeholders, not implementations)

These are the layers that the foundation is preparing for. **They are not built yet** — do not assume any of them exist or write code that depends on them. They are listed here so anyone reading the repo can see the trajectory.

- **Repository supervisor** — multi-repo awareness, work-tree state, branch posture.
- **Task system** — durable units of work (issues/tasks) tracked across agent sessions.
- **Agent runs** — first-class agent invocations with inputs, outputs, transcripts, retries.
- **Context engine** — selecting and assembling what each run sees, beyond the existing rules splice.
- **Memory** — persistent facts, decisions, and references across sessions.
- **Artifacts** — outputs of runs (diffs, plans, reports) tracked, addressable, and queryable.
- **Plugins / extensions** — third-party drop-ins that integrate with the same surface, addressed under each agent's native namespacing convention.

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

Claude Code's loader scans the top level of `~/.claude/skills/` only, so the nested `fulcrum/<name>/` layout used by other agents is invisible there. Plugin namespace is the supported path. Codex global authored skills are skipped by default to avoid user-wide metadata pressure; use `fulcrum skills sync --codex-global` or `--codex-project <dir>` explicitly. All five end up with the same effective `fulcrum:<skill-name>` address space, but the install mechanism differs by agent. Agents still invoke skills by frontmatter `name:` (no colons in identifiers — namespacing is path-based or plugin-mediated).

## Cross-agent rules distribution

`fulcrum install` reads `rules/AGENTS.md` and sentinel-splices its body into each detected agent's primary rules file. User content outside the `<!-- BEGIN/END FULCRUM RULES -->` markers is preserved verbatim. The operation is idempotent — re-running `fulcrum install` replaces only the spliced block.

| Agent | Primary rules file | Method |
|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | sentinel splice |
| Codex CLI | `~/.codex/AGENTS.md` | sentinel splice |
| OpenCode | `~/.config/opencode/AGENTS.md` (also reads `~/.claude/CLAUDE.md`) | sentinel splice |
| Pi CLI | `~/.pi/agent/AGENTS.md` | sentinel splice |
| Gemini CLI | `~/.gemini/GEMINI.md` | body placed at `~/AGENTS.md`; `GEMINI.md` becomes a single line `@AGENTS.md` (Gemini inlines `@` imports) |

Project-level enforcement: drop `rules/AGENTS.md` at `<consumer-repo>/AGENTS.md` (or `<consumer-repo>/GEMINI.md` for Gemini-only repos).

Companion artifacts that travel with rules:

- Hook recipes — `hooks/recipes/*.snippet.md`, vendored to `~/.fulcrum/hooks/snippets/` by install. Per-agent registration documented in `docs/hooks.md`.
- Skill registry — `skills/SOURCES.md`. `fulcrum skills sync` mirrors `skills/<name>/` to each agent's native namespace, excluding `.original.md` and source-only folders from generated CLI agent mirrors while keeping them in project source.

## Conventions that apply to current work

- **Skills are one tool, one skill.** Don't fold multiple unrelated tools into one SKILL.md. The exception is when two CLIs are tightly coupled and ship together (e.g. `dart format` + `dart analyze` → `dart-toolchain`).
- **Skill content correctness is not implied by lint.** `fulcrum skills lint` verifies frontmatter shape and the five required H2 sections. It does **not** verify that flags, default values, or subcommands are accurate against upstream. Authors must verify against the tool's `--help` or upstream README before submitting. The previous batch found a 46% content-error rate among parallel-authored skills — assume the same risk on new ones.
- **No GitHub Actions workflows by default.** Local `bun run ci` and local `bun run release` are the gates. If a workflow is added later, it must be additive, not the source of truth.
- **No new docs files unless asked.** Update existing docs in place; don't generate planning, decision, or analysis markdown alongside code changes.
- **One commit per logical change.** Bisect granularity matters — separate fixes from features.

## How to read this repo

- `README.md` — install + usage.
- `HANDOVER.md` — current-state snapshot, outstanding work, recent decisions.
- `docs/` — per-topic foundation docs (context, hooks, skills, mcp, agents, capabilities, tool-output policy).
- `docs/caveman.md` — reference for caveman integration: what gets compressed, install, defaultMode, CI, doctor, opt-out.
- `rules/AGENTS.md` — the body that gets sentinel-spliced into each agent's primary rules file. Different audience from this file: that's "how the agent should behave inside any project", this is "what fulcrum is and where it's going".
- `src/agents/registry.ts` — start here to understand how the five agents are defined and referenced by install, doctor, and skills commands.
- `skills/SOURCES.md` — the skill registry and authoring queue.
