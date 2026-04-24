---
title: "Windsurf extension surface — research snapshot 2026-04-19"
type: reference
date: 2026-04-19
sources:
  - docs.windsurf.com/windsurf/cascade/memories (verified 2026-04-19)
  - agent-integration/windsurf/ (current Fulcrum install surface)
---

# Windsurf — extension surface reference

## 1. Rules

Location:
- **Workspace:** `.windsurf/rules/*.md` (per-file rules)
- **Global:** `~/.codeium/windsurf/memories/global_rules.md` (single file, NOT a dir)
- **Enterprise / system-level:**
  - macOS: `/Library/Application Support/Windsurf/rules/`
  - Linux: `/etc/windsurf/rules/`
  - Windows: `C:\ProgramData\Windsurf\rules\`
  - Read-only for end users; managed by IT.

No `.windsurfrules` file in current convention (replaced by `.windsurf/rules/`).

**Character limits (HARD):**
- Global rule: **6,000 characters max**.
- Workspace rule: **12,000 characters max per file**.

Frontmatter schema (workspace rules only):
```yaml
---
trigger: always_on | model_decision | glob | manual
globs: "src/**/*.ts"               # when trigger = glob
description: ...                   # shown in system prompt when trigger = model_decision
---
```

Global rules + root `AGENTS.md` have no frontmatter; always-on.

## 2. Trigger types

- **always_on** — full content in system prompt every message.
- **model_decision** — description shown in system prompt; full content loaded on-demand when model decides.
- **glob** — applied when files match the pattern.
- **manual** — activated via `@rule-name` mention in chat.

## 3. Rule surfacing + discovery

Discovered from `.windsurf/rules` in CWD + subdirectories + ancestors up to git root. Multi-folder workspaces get auto-deduplicated rules. Access via Customizations UI (top-right slider) or Windsurf Settings.

## 4. Memories vs Rules

**Memories:** auto-generated context stored locally; workspace-scoped; don't consume credits; not shared with team.
**Rules:** user-defined, version-controlled, shareable, explicit activation control.

Recommendation from docs: "prefer Rules for durable knowledge" — Fulcrum-first bias is a Rule.

## 5. Skills

**Supported** — "Multi-step procedures bundled with supporting files" per docs. Skill framework appears analogous to Agent Skills spec. Directory convention not fetched this session.

## 6. Workflows

`/workflow-name` slash-triggered multi-step prompt templates. User-authorable. Not retrieved in detail this session.

## 7. AGENTS.md

Supported — "Location-scoped rules with zero config." Follows AGENTS.md cross-tool spec (same as Copilot + Cursor).

## 8. Hooks

**Not documented.** No lifecycle hook mechanism mentioned.

## 9. Sub-agents

**Not documented.**

## 10. MCP integration

**Not mentioned in the fetched memories/rules page.** Windsurf has MCP support elsewhere in its docs (own research follow-up needed for schema + config path).

## 11. Unique surfaces

- **Character limits are the hardest of any agent** (6k global, 12k per workspace rule file).
- **Enterprise system-level rules** per-OS deployment path — genuinely unique.
- **Memories system** — automatic context capture, separate from Rules.

## Implications for Fulcrum parity plan

- **Hard 12k/file + 6k/global limits** constrain the rule content budget. The Fulcrum-first bias + role guidance MUST fit within budget. Parity plan needs a "rule compaction pass" for Windsurf.
- **Workspace rules use frontmatter with `trigger:`** — different from Cursor's `alwaysApply`. Parity plan ships separate rule-file content per agent OR uses a template engine to emit each agent's format.
- **Skills supported** — but format not fetched; parity PR owes a `docs/skills.md` read before wiring.
- **Global rule is a single file** (`~/.codeium/windsurf/memories/global_rules.md`) — not a dir. Install.ts must be aware: overwrite-in-place vs append-with-markers.
- **`installWindsurf()` does not exist in install.ts** (unlike `installCursor`, `installOpencode`, `installCodex`). Parity PR must add it.
- Cursor/Copilot/Windsurf are all rules-only agents and share 90% of the behavioral content. Plan should author ONE canonical "Fulcrum-first rule" source and fan-out-transform it to each agent's format + length budget.
