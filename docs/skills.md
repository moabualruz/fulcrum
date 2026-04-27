# Skills

> Skills teach agents *when and how* to use CLI tools. Without a skill, agents invent broken invocations or miss the right tool entirely.

## 1. Per-agent paths

Each agent uses its own native skills directory. Do not use a shared `~/.agents/` folder — it pollutes every agent's context with skills that may not apply.

| Agent | Skills path |
|---|---|
| Claude Code | `~/.claude/skills/<name>/SKILL.md` |
| Codex CLI | `~/.codex/skills/<name>/SKILL.md` (user) · `.codex/skills/<name>/SKILL.md` (project) — Codex-namespaced; never `~/.agents/` (shared path collides with other agents) |
| Gemini CLI | `~/.gemini/extensions/<ext>/skills/<name>/SKILL.md` |
| OpenCode | `~/.config/opencode/skills/<name>/SKILL.md` |
| Pi CLI | `~/.pi/agent/skills/<name>/SKILL.md` (user) · `.pi/skills/` (project) |

Install a skill to the agents that need it. If a skill is relevant to all agents, install it in each agent's own directory separately.

## 2. Skill catalogue (general-purpose)

| Skill | Teaches |
|---|---|
| `ast-grep` | YAML rule format, meta-variables, structural patterns |
| `graphify` | When to build graph, how to query it |
| `context7-cli` | Two-step library lookup |
| `tavily-*` (7 skills) | Search, deep research, extract |
| `playwright-cli` | snapshot, screenshot, open, fill |
| `think` | Structured reasoning — `/think` trigger |
| `anthropics/skills` | Document work, webapp testing, mcp-builder, skill-creator |

> `repomix` skill: `repomix --skill-generate <name> --skill-output <agent-skills-path>/<name>` generates a SKILL.md from any packed output.

## 3. Adoption strategy — install one, cherry-pick the rest

**Strategy: install one as the cross-agent distribution platform, cherry-pick skills and patterns from the others.**

### Install: superpowers (obra/superpowers)

The only candidate with real, working cross-agent installers (`.claude-plugin/`, `.codex-plugin/`, `.opencode/`, `gemini-extension.json`, `.cursor-plugin/`).

**Skills to keep enabled from superpowers:**

| Skill | Why |
|---|---|
| `brainstorming` | Structured exploration mode for the "process, not destination" problem |
| `writing-plans` | Plan-doc generation |
| `systematic-debugging` | General-purpose debugging methodology |
| `code-review` | General-purpose |
| `worktrees` | Parallel agent dispatch — relevant for multi-session orchestration |
| `using-skills` | Meta-skill for skill authorship, used when writing custom skills |

Skip the heavy TDD-orchestrator skills if they don't fit the project shape.

### Cherry-pick patterns from SpecKit

Don't install. Borrow:
- The **`AGENTS.md` + per-agent directory** convention (see [agents.md](agents.md)).
- The `constitution.md` concept maps to our per-project `AGENTS.md`.

## 4. Skill name policy

**Skill name equals slash trigger.** Skill `<name>` → `/<name>`. The folder name, the `name:` field in frontmatter, and the slash command are all the same string.

**No prefix.** Use clean names. Rename after the fact only if a future collision appears — premature namespacing harms ergonomics.

## 5. Authoring template

In-repo skills follow Anthropic's spec-compliant frontmatter + a body skeleton proven by superpowers across its 14 skills. Template at `skills/_template/SKILL.md`:

- **Frontmatter** — `name` (lowercase + digits + hyphens, ≤64 chars, no reserved words `anthropic`/`claude`, dir-name match) and `description` (≤1024 chars, no XML, third-person trigger sentence).
- **Body** — `## When to use` / `## Invocation` / `## Patterns` / `## Anti-patterns` / `## Cross-refs`.

Validate with `fulcrum skills lint <path>` (alias for `scripts/lint-skill.sh`). Lints against the strictest union of all 5 agents' frontmatter rules.

## 6. When to fork upstream skills

Pin third-party skills in `skills/upstream.lock` (TOML) when ALL of:

- author is the tool vendor / Anthropic / a foundation org (verified via `author_class`),
- repo has a release or commit within the last 180 days,
- license is permissive (MIT / Apache-2.0 / BSD / CC0).

**Fork into `skills/<name>/` the moment ANY of these triggers fires:**

- 90-day commit silence on the upstream repo,
- unresolved CVE older than 14 days,
- license drift / clarity issue,
- more than 2 of our patches diverge from upstream,
- maintainer unresponsive to a PR for more than 30 days.

Always vendor (never pin) for individual-author repos like `mitsuhiko/agent-stuff`, `obra/superpowers-lab`, `DevonMorris/claude-ctags` — track them in the lockfile and replay diffs quarterly.

## 7. Verification

Tiered:

1. **Lint everywhere (CI):** `scripts/lint-skill.sh skills/` validates every authored skill on the strictest frontmatter union. Cheap; catches the 80% of cross-agent failures.
2. **Trigger eval on Claude Code:** wrap Anthropic's `skill-creator/scripts/run_loop.py` in `scripts/eval-skill-claude.sh` (TODO) — runs each skill's trigger phrase 3× through `claude -p`, scores activation rate, splits 60/40 train/test. Claude-Code-only because no equivalent harness exists for the other agents.
3. **Manual smoke on the other 4:** for Gemini run `gemini extensions link <ext>` + `--debug`; for OpenCode and Codex copy the trigger phrase into a fresh session; for Pi invoke `/skill:<name>` directly. Checklist template at `docs/skill-smoke-test.md`.

We're honest about the asymmetry: trigger-rate measurement only exists for Claude Code today.
