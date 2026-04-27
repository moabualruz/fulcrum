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
