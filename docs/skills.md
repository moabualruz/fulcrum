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

## 3. Memory + task-management skills

Custom skills live in [memory.md](memory.md) (`adr`, `wrap`, `promote`, `in-flight`, `postmortem`) and [tasks.md](tasks.md) (`plan-to-plane`). Skill name **equals** slash command — e.g. skill `adr` is invoked as `/adr`. All ship as `~/.claude/skills/<name>/SKILL.md` and are mirrored to other agents per the cross-agent install in [memory.md](memory.md).

## 4. Adoption strategy — install one, cherry-pick the rest

None of the existing skill frameworks (superpowers, mattpocock/skills, SpecKit, GSD) covers our memory/handover gaps end-to-end. They target *forward* work (planning, executing); memory work is *backward* (extracting, persisting, replaying).

**Strategy: install one as the cross-agent distribution platform, cherry-pick skills and patterns from the others, build the remaining gaps custom.**

### Install: superpowers (obra/superpowers)

The only candidate with real, working cross-agent installers (`.claude-plugin/`, `.codex-plugin/`, `.opencode/`, `gemini-extension.json`, `.cursor-plugin/`).

**Skills to keep enabled from superpowers:**

| Skill | Why |
|---|---|
| `brainstorming` | Structured exploration mode for the "process, not destination" problem |
| `writing-plans` | Plan-doc generation that maps cleanly to Plane Pages |
| `systematic-debugging` | General-purpose; orthogonal to memory |
| `code-review` | General-purpose |
| `worktrees` | Parallel agent dispatch — relevant for multi-session orchestration |
| `using-skills` | Meta-skill for skill authorship, used when writing custom skills |

Skip the heavy TDD-orchestrator skills if they don't fit the project shape.

### Cherry-pick from mattpocock/skills

Don't install the repo. Copy these skills as **references** for our custom skills:

| Skill | Use as reference for |
|---|---|
| `to-prd` | The conversation-extraction pattern — base shape for our Vibe ADR skill |
| `to-issues` | Direct Plane integration — see [tasks.md](tasks.md) `plan-to-plane` |
| `obsidian-vault` | Vault read/write conventions |
| `triage-issue` | Plane issue triage workflow |

### Cherry-pick patterns from SpecKit

Don't install. Borrow:
- The **`AGENTS.md` + per-agent directory** convention (see [agents.md](agents.md)).
- The **4-phase artifact lifecycle** (`spec → plan → tasks → implement`) as the structure for project-scoped Plane Pages.
- The `constitution.md` concept maps to our per-project `AGENTS.md`.

### Cherry-pick patterns from GSD

Don't install. Borrow:
- The **on-disk markdown handoff** between phase orchestrators — direct model for our Stop → SessionStart handoff via the vault.
- The **`/gsd-forensics`** pattern — model for our post-mortem lesson-extraction skill.
- The **context-rot mitigation principle**: persist state, let a fresh agent resume.

## 5. Skill name policy

**Skill name equals slash trigger.** Skill `adr` → `/adr`, skill `wrap` → `/wrap`, etc. The folder name, the `name:` field in frontmatter, and the slash command are all the same string.

**No prefix.** Use clean names (`adr`, not `fulcrum-adr`). Verified no current overlap with superpowers' 14 skills. Rename after the fact only if a future collision appears — premature namespacing harms ergonomics.
