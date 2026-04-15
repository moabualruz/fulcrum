# Skill Authoring Guide

Skills teach agent runtimes (Claude Code, Gemini, Codex) the right sequence of Fulcrum tool calls for common situations. Each skill fires when its trigger condition is met and guides the agent through the correct procedure.

---

## Directory layout

All skills live under `agent-integration/skills/`. Each skill is a **directory** containing one `SKILL.md`:

```
agent-integration/skills/
├── index.md                    ← Table of contents (always update this)
├── my-skill/
│   └── SKILL.md                ← The skill itself
└── another-skill/
    └── SKILL.md
```

---

## SKILL.md frontmatter

Every `SKILL.md` must have YAML frontmatter with these fields:

```yaml
---
name: my-skill
description: One-sentence description of when this fires
triggers:
  - trigger phrase that causes Claude to load this skill
  - another trigger phrase
---
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Slug matching the directory name (no spaces, lowercase, hyphens) |
| `description` | Yes | What the skill does — used for Claude's skill-discovery lookup |
| `triggers` | Yes | List of natural-language conditions that fire this skill |

---

## Body format

After frontmatter, the body is Markdown. A good skill body has:

1. **Heading** — matches `name` in title case
2. **Numbered procedure** — exactly what to do, in order
3. **What not to do** — a brief callout with `**Never skip this.**` or similar
4. **No ambiguity** — every step names a specific MCP tool call with exact parameters

### Example

```markdown
---
name: recall-before-writing
description: Recall relevant memories before writing new code or documents
triggers:
  - about to write code
  - before creating a new file
  - planning a new feature
---

# Recall Before Writing

Before creating any new code, doc, or decision:

1. Call `mcp__fulcrum__recall_memory` with the task's `workspace_id`, `project_id`, and a query describing what you're about to write.
2. Review the top 3–5 results for relevant prior decisions, architecture notes, and caveats.
3. If a result has `importance >= 0.8`, treat it as a hard constraint unless you have a specific reason to deviate.

**Never skip this.** Writing without checking memory often repeats work that was already done and decided.
```

---

## Naming conventions

| Pattern | Example | When to use |
|---------|---------|-------------|
| `verb-noun` | `start-task`, `write-memory` | Most skills |
| `noun-on-event` | `workspace-status-on-session-start` | Event-triggered skills |
| `noun-gate` | `merge-gate` | Blocking-condition guards |
| `noun-format` | `chief-of-staff-response-format` | Output structure skills |

Keep names short. Claude's skill discovery ranks by description relevance, not by name.

---

## Trigger phrases

Triggers are phrases the agent runtime compares against the current context. Write them from the agent's perspective:

```yaml
triggers:
  - about to write code         ✅ clear action the agent is taking
  - file editing                ✅ specific operation
  - starting a new session      ✅ lifecycle moment
  - important                   ❌ too vague
  - when something happens      ❌ not actionable
```

Use 2–5 triggers per skill. More is fine but each should be distinct.

---

## Policy vs procedure

- **Procedure skills** (most skills) — tell the agent *what to do* step by step
- **Policy skills** — tell the agent *what is forbidden* and *why*

Policy skills exist for invariants like `invoke-team-only-from-cos`. They should be short (≤ 10 lines) and blunt:

```markdown
# Invoke Team — Chief-of-Staff Only

Only `chief_of_staff` may call `invoke_team`. If you are any other role and
feel the urge to invoke a team, **stop and escalate instead** using
`mcp__fulcrum__block_agent_run`.

Calling `invoke_team` from a non-CoS role is a policy violation that is
detected and blocked by the PreToolUse hook.
```

---

## Updating the index

After adding a skill, add a row to the table in `agent-integration/skills/index.md`:

```markdown
| [my-skill](./my-skill/SKILL.md) | When this fires |
```

And add it to the lifecycle order section if it applies to the standard agent session flow.

---

## Testing a skill

There is no automated skill test runner yet. Manual verification:

1. Open a new Claude Code session in a Fulcrum workspace
2. Trigger the condition described in `triggers`
3. Confirm Claude loads and follows the skill procedure without prompting
4. If Claude skips the skill or follows an outdated procedure, check that:
   - The trigger phrases match the scenario
   - The SKILL.md frontmatter `name` matches the directory name
   - Claude Code has the skills directory indexed (check `.mcp.json` or run `fulcrum setup:claude`)

---

## Scripted pattern (gen-claude-md.ts)

Skills are also compiled into a master `CLAUDE.md` file during build:

```bash
pnpm run build:claude-md
```

This runs `packages/cli/src/scripts/gen-claude-md.ts` which collects all `SKILL.md` files and the tool catalogue from the MCP server's `TOOL_REGISTRY` and emits a single Markdown file. The generated file is committed to `agent-integration/claude/CLAUDE.md`.

When adding a skill, re-run this script and commit the updated `CLAUDE.md`.
