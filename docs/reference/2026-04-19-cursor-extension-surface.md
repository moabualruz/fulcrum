---
title: "Cursor extension surface — research snapshot 2026-04-21"
type: reference
date: 2026-04-21
sources:
  - cursor.com/docs/context/rules (verified via framework-docs-researcher 2026-04-21)
  - cursor.com/docs/context/skills (verified 2026-04-21)
  - cursor.com/docs/agent/hooks (verified 2026-04-21)
  - cursor.com/docs/reference/plugins (verified 2026-04-21)
  - cursor.com/docs/mcp (verified 2026-04-21)
  - agent-integration/cursor/ (current Fulcrum install surface)
---

# Cursor — extension surface reference

Cursor is a desktop IDE (VS Code fork). No CLI binary. Extension surfaces are
file-based, discovered from the project's `.cursor/` directory.

## 1. Rules (primary surface, stable)

Location: `.cursor/rules/*.mdc` (project) or `~/.cursor/rules/` (user global)

Frontmatter schema:
```yaml
---
description: What the rule is for   # retrieval signal for Apply Intelligently
globs: "src/**/*.ts"                  # optional — file scope
alwaysApply: true|false               # force-apply regardless of conditions
---
```

Rule types:
- **Always Apply** — `alwaysApply: true`. Injected at context start every session.
- **Apply Intelligently** — model matches `description` to active task. Default when `alwaysApply` absent.
- **Apply to Specific Files** — scoped by `globs`.
- **Apply Manually** — user `@rule-name` mention.

Guidance: keep rules under 500 lines. `.cursorrules` (legacy single-file) is deprecated.

## 2. Agent Skills (Cursor 2.4+, additive alongside rules)

Location: `.cursor/skills/<name>/SKILL.md` (project), `~/.cursor/skills/` (user),
`~/.agents/skills/` (cross-tool compat), `.agents/skills/` (project-level cross-tool)

Frontmatter: `name` + `description` required (same format as Claude Code skills).

Cursor 2.4 ships `/migrate-to-skills` utility that converts "Apply Intelligently" rules
and slash commands into skills. Static `alwaysApply: true` rules are NOT migrated.
Rules are NOT deprecated — skills are additive.

Cursor explicitly supports `.claude/agents/` as a compatibility path.

## 3. Hooks (Cursor 2.4+)

File: `.cursor/hooks.json` (project-level, JSON config) or `~/.cursor/hooks.json` (user)

Format:
```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [{ "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "..." }] }],
    "postToolUse": [...],
    "sessionStart": [...],
    "sessionEnd": [...],
    "afterFileEdit": [...],
    "subagentStart": [...],
    "subagentStop": [...]
  }
}
```

16 documented hook events: `sessionStart`, `sessionEnd`, `preToolUse`, `postToolUse`,
`beforeShellExecution`, `afterShellExecution`, `beforeMCPExecution`, `afterMCPExecution`,
`afterFileEdit`, `beforeSubmitPrompt`, `preCompact`, `stop`, `beforeTabFileRead`,
`afterTabFileEdit`, `subagentStart`, `subagentStop`.

## 4. Slash Commands

Location: `.cursor/commands/*.md` (project)

Format: Markdown file with optional YAML frontmatter (`name`, `description`).
Accessible via the `/commands` slash command prefix in the IDE.
Supported extensions: `.md`, `.mdc`, `.markdown`, `.txt`.

## 5. MCP integration

File: `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (user global)

```json
{
  "mcpServers": {
    "server-name": {
      "command": "cmd",
      "args": ["..."]
    }
  }
}
```

Supports stdio and HTTP/SSE transports, variable interpolation (`${workspaceFolder}`).

## 6. AGENTS.md

Supported as a simpler Markdown-only alternative to `.cursor/rules`.
Nested `AGENTS.md` files: more specific (deeper in tree) takes precedence.

## 7. User-global rules

`~/.cursor/rules/` — filesystem path for user-global rules (confirmed).
Previously documented as "app settings only" — that was wrong.

## Implications for Fulcrum parity plan

**PR 11 delivers all 6 surfaces:**
- `.cursor/mcp.json` — already existed, verified schema ✓
- `.cursor/rules/fulcrum-core.mdc` (alwaysApply: true) — **PR 11**
- `.cursor/rules/fulcrum-skill-*.mdc` × 33 (description-match) — **PR 11**
- `.cursor/skills/fulcrum-*/SKILL.md` × 33 (Cursor 2.4+ format) — **PR 11**
- `.cursor/hooks.json` (16 events) — **PR 11**
- `.cursor/commands/*.md` × 6 — **PR 11**
- `installCursor()` expanded — **PR 11**
