# Context Layer

> Always-on rules and conventions loaded into every session.

## 1. Global: `~/.claude/CLAUDE.md`

Loaded every session. User prefs, style rules, anti-patterns.

**Include:** non-obvious commands (`uv run pytest`, not `npm test`), style rules differ from defaults, explicit anti-patterns, git conventions, env quirks.

**Exclude:** standard conventions Claude know, API docs (link instead), self-evident stuff.

**Keep under 200 lines.** Bloat = Claude silent ignore rules. Use `IMPORTANT:` or `YOU MUST` for rules keep getting missed.

Bootstrap: `/init` in any project → prune hard.

## 2. Per-project: `AGENTS.md`

Versioned with code. Every agent read. Only what true for this branch.

```markdown
# AGENTS.md

## Project
<one-line description>

## Stack
- Language / runtime:
- Framework:
- Package manager:
- Test runner:

## Commands
- Install:      <cmd>
- Dev server:   <cmd>
- Test:         <cmd>
- Lint/format:  <cmd>
- Build:        <cmd>

## Conventions
- Branch naming:
- Commit style:
- Code style:

## Do / Don't
- DO …
- DON'T …
```

## Cross-agent

Each agent own primary context file. See [agents.md](agents.md) for per-agent paths and `GEMINI.md → @AGENTS.md` import trick that unify source of truth.