# Context Layer

> Always-on rules and conventions loaded into every session.

## 1. Global: `~/.claude/CLAUDE.md`

Loaded into every session. User-level preferences, style rules, anti-patterns.

**Include:** non-obvious commands (`uv run pytest`, not `npm test`), style rules that differ from defaults, explicit anti-patterns, git conventions, environment quirks.

**Exclude:** standard conventions Claude already knows, API docs (link instead), anything self-evident.

**Keep under 200 lines.** Bloated files cause Claude to silently ignore rules. Use `IMPORTANT:` or `YOU MUST` for rules that keep getting missed.

Bootstrap: `/init` in any project → prune aggressively.

## 2. Per-project: `AGENTS.md`

Versioned with the code. Read by every agent. Contains only what's true for this branch.

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

Each agent has its own primary context file. See [agents.md](agents.md) for per-agent paths and the `GEMINI.md → @AGENTS.md` import trick that unifies the source of truth.

## Rule layering

Every behavioral rule lives in `rules/AGENTS.md` (the compressed form; `rules/AGENTS.original.md` is the verbose source). `fulcrum install` splices this file verbatim into every detected agent's primary rules file inside the `<!-- BEGIN FULCRUM RULES --> … <!-- END FULCRUM RULES -->` sentinel block.

**Rule ownership:**
- Behavioral rule text → `rules/AGENTS.md` (single source of truth)
- Hook registrations → vendor settings files (managed by vendor CLI)
- Sentinel splice → `apps/cli/src/install.ts` (`spliceSentinel`)
- Vendor block strip → `apps/cli/src/install.ts` (`stripVendorRuleBlocks`), called from `apps/cli/src/init-vendor.ts`

**Adding a new vendor rule:** append to `rules/AGENTS.original.md` §12, run compress, add the heading string to `VENDOR_RULE_HEADINGS` in `install.ts`.
