# Skill sources

> Tool skills are **sourced**, not authored. This file lists the upstream skills that fulcrum installs.
>
> 🚧 **Verification pending.** Slugs and paths below are starting points; many need primary-source confirmation before `scripts/install.sh` can fetch them. Verify each before relying on it.

## Selection principle

Don't write a SKILL.md for a tool when the upstream community already publishes one. Re-authoring fragments the ecosystem and rots when the tool's flags change. Source upstream; pin a known-good commit; re-source on update.

## Sourced upstream — to verify and install

### Anthropic official (`anthropics/skills`)

Repo: <https://github.com/anthropics/skills>. Includes document work, webapp testing, mcp-builder, skill-creator, and more. **TODO**: list which sub-skills we want and pin a commit.

### obra/superpowers

Repo: <https://github.com/obra/superpowers>. Installs as a Claude Code plugin (`claude plugin install obra/superpowers`); also has `.codex-plugin/`, `.opencode/`, `gemini-extension.json`. Confirmed cross-agent installer.

Skills we want enabled (per `docs/skills.md` §3):
- `brainstorming` · `writing-plans` · `systematic-debugging` · `code-review` · `worktrees` · `using-skills`

Skip the heavy TDD-orchestrator skills.

### Tool-specific upstream skills (verify before installing)

| Tool | Upstream candidate | Status |
|---|---|---|
| `gh` | unverified — search the official `cli/cli` skills, GitHub-published packs | 🚧 |
| `jq` | unverified | 🚧 |
| `xh` | unverified | 🚧 |
| `just` | unverified — possibly bundled in `casey/just` | 🚧 |
| `ast-grep` | upstream skill exists in `ast-grep/ast-grep` (referenced in `docs/skills.md` §2) | 🚧 |
| `repomix` | `repomix --skill-generate <name> --skill-output <path>` generates a SKILL.md from any packed output | 🚧 |
| `graphify` | unverified — check `graphifyy` package | 🚧 |
| `semgrep` | unverified | 🚧 |
| `gitleaks` | unverified | 🚧 |
| `ctx7` | upstream skill referenced in `docs/skills.md` §2 (`context7-cli`) | 🚧 |
| `tavily` | upstream skill referenced in `docs/skills.md` §2 (`tavily-*`, 7 skills) | 🚧 |
| `playwright` | upstream skill referenced in `docs/skills.md` §2 (`playwright-cli`) | 🚧 |
| `hyperfine` | unverified | 🚧 |
| `usql` | unverified | 🚧 |
| `lizard` | unverified | 🚧 |
| `mise` / `direnv` | unverified | 🚧 |
| `difftastic` | unverified | 🚧 |
| `git-cliff` | unverified | 🚧 |
| `think` | upstream skill referenced in `docs/skills.md` §2 (`/think` trigger) | 🚧 |

## Install flow (when verified)

```bash
# 1. superpowers as the cross-agent platform
claude plugin install obra/superpowers

# 2. anthropics/skills (specific sub-skills)
# TODO once verified

# 3. Per-tool skills — fetch from upstream, copy SKILL.md to ~/.claude/skills/<name>/
# scripts/sync-upstream-skills.sh (TODO) reads SOURCES.md and pulls each
```

## Action — before next session

- [ ] Verify each `🚧` row by checking the tool's own repo / docs for an official skill or a community-blessed one.
- [ ] Decide install order (priority: `gh`, `jq`, `xh`, `just` first — most-touched daily).
- [ ] Pin commit / version per skill.
- [ ] Add `scripts/sync-upstream-skills.sh` once the source list is confirmed.
