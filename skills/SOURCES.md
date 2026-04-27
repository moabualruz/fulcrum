# Skill sources

> **Policy: one tool, one dedicated skill.** A "skill" here is a SKILL.md focused on a single tool. Catalog skills that mention a tool in a "preferred tools" table do **not** count as that tool's skill — agents can't load 50 tools' worth of usage from a one-line entry. If no dedicated upstream skill exists, we author one in this repo.
>
> Verified against primary sources 2026-04-27. URLs fetched directly.

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ | Dedicated upstream skill from the tool author / vendor |
| ☑ | Dedicated third-party skill (verified, single-tool focus) |
| ✍️ | Authored in this repo — planned or shipped at `skills/<name>/SKILL.md` |
| 🚧 | Gap. No dedicated skill exists anywhere. Catalog/embedded mentions explicitly do not satisfy this. |

---

## Cross-agent platforms (not per-tool skills, but the distribution layer)

- **`obra/superpowers`** — <https://github.com/obra/superpowers>. Cross-agent installer (`.claude-plugin`, `.codex-plugin`, `.opencode`, `gemini-extension.json`, `.cursor-plugin`). Skills to enable: `brainstorming`, `writing-plans`, `systematic-debugging`, `code-review`, `worktrees`, `using-skills`. Skip TDD orchestrators.
- **`obra/superpowers-lab`** — sibling repo (309 stars). Source for the dedicated `tmux` skill (`using-tmux-for-interactive-commands`).
- **`anthropics/skills`** — Anthropic-official. Document work, webapp testing, mcp-builder, skill-creator. No CLI-tool skills; pick sub-skills as needed.
- **`gh skill` (GitHub-native)** — <https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/>. Package manager for skills, shipped 2026-04-16. Use `gh skill install <repo>` once sources below are pinned.

---

## Foundation tools

| Tool | Status | Source / Plan | Notes |
|---|---|---|---|
| `ripgrep` (rg) | ☑ | [netresearch/file-search-skill](https://github.com/netresearch/file-search-skill) | Bundles rg + fd; v1.4.0. Dedicated to file-search workflow. |
| `fd` | ☑ | same as rg | Same skill anchors fd. |
| `ast-grep` | ✅ | [ast-grep/agent-skill](https://github.com/ast-grep/agent-skill) | Tool-author. 644 stars. Distributed via Claude plugin marketplace. |
| `tmux` | ☑ | [obra/superpowers-lab — using-tmux-for-interactive-commands](https://github.com/obra/superpowers-lab) · [mitsuhiko/agent-stuff/tmux](https://github.com/mitsuhiko/agent-stuff/blob/main/skills/tmux/SKILL.md) | Two strong sources. superpowers-lab is sharper for interactive REPL driving. |
| `universal-ctags` | ☑ | [DevonMorris/claude-ctags](https://github.com/DevonMorris/claude-ctags) | Auto-index + usage. ~80% token reduction vs grep. MIT. |
| `gh` | ✍️ shipped | [`skills/gh/SKILL.md`](gh/SKILL.md) + [`evals/gh.json`](../evals/gh.json) | Authored 2026-04-28. 8 patterns + 8 anti-patterns. 20-entry trigger eval (13/7 split). |
| `mise` | ☑ | [ray-manaloto/claude-code-marketplace/mise-toolkit](https://github.com/ray-manaloto/claude-code-marketplace/tree/main/mise-toolkit) | Multi-SKILL toolkit. 1 star — usable but consider re-authoring for our pin. |
| `jq` | ✍️ shipped | [`skills/jq/SKILL.md`](jq/SKILL.md) + [`evals/jq.json`](../evals/jq.json) | **#1 friction.** Authored 2026-04-27. 7 patterns + 7 anti-patterns covering extract / filter / reshape / aggregate / CSV / defaults / paths. 20-entry trigger eval set (12 trigger / 8 anti-trigger). |
| `yq` | ✍️ | `skills/yq/SKILL.md` (to author) | YAML/TOML/XML round-trip; preserve comments; `eval-all` for multi-doc; differences from jq. |
| `fzf` | ✍️ shipped | [`skills/fzf/SKILL.md`](fzf/SKILL.md) + [`evals/fzf.json`](../evals/fzf.json) | Authored 2026-04-28. Non-interactive `--filter` mode; 7 patterns + 7 anti-patterns. 20-entry eval (11/9). |
| `xh` | ✍️ shipped | [`skills/xh/SKILL.md`](xh/SKILL.md) + [`evals/xh.json`](../evals/xh.json) | Authored 2026-04-28. Four operators, `--check-status`, sessions, auth, uploads. 20-entry eval (12/8). |
| `just` | ✍️ shipped | [`skills/just/SKILL.md`](just/SKILL.md) + [`evals/just.json`](../evals/just.json) | Authored 2026-04-28. Discovery-first (`--list`, `--show`); 7 patterns + 7 anti-patterns. 20-entry eval (12/8). |
| `bat` | ✍️ | `skills/bat/SKILL.md` (to author) | `--paging=never` for piping, `--language=` for stdin, `--diff`. |
| `eza` | ✍️ | `skills/eza/SKILL.md` (to author) | `--git`, `--tree`, `--git-ignore`, `-l --no-quotes`. Short — keep tight. |
| `sd` | ✍️ | `skills/sd/SKILL.md` (to author) | Pattern syntax differences from sed; capture groups; in-place vs stdout; multi-line. |
| `zoxide` | ✍️ | `skills/zoxide/SKILL.md` (to author) | `z`, `zi`, db queries, init in non-interactive shells. Short. |
| `direnv` | ✍️ | `skills/direnv/SKILL.md` (to author) | `.envrc` patterns, `direnv allow`, hooks, layout helpers, security model. |
| `difftastic` | ✍️ | `skills/difftastic/SKILL.md` (to author) | `difft`, `--display side-by-side-show-both`, integration with `git config diff.external`. |
| `git-cliff` | ✍️ | `skills/git-cliff/SKILL.md` (to author) | `cliff.toml`, conventional-commit parsing, custom commit-parsers, release workflow. |
| `gitleaks` | ✍️ | `skills/gitleaks/SKILL.md` (to author) | `protect --staged` vs `detect`, `--no-banner --redact`, baseline files, custom rules. |
| `hyperfine` | ✍️ | `skills/hyperfine/SKILL.md` (to author) | `--warmup`, `--prepare`, `--export-json`, parameter sweeps `-L`, regression detection. |
| `watchexec` | ✍️ | `skills/watchexec/SKILL.md` (to author) | `-e ext`, `-c` clear, `-r` restart, `-w path`, integration with test runners. |

---

## Code intelligence

| Tool | Status | Source / Plan | Notes |
|---|---|---|---|
| `repomix` | ✅ | [yamadashy/repomix — repomix-explorer](https://github.com/yamadashy/repomix/tree/main/.claude/skills/repomix-explorer) | `npx repomix@latest` recipes. |
| `graphify` | ✅ | [safishamsi/graphify — skill.md](https://github.com/safishamsi/graphify/blob/v5/graphify/skill.md) | Per-agent variants. Knowledge-graph extraction + BFS/DFS. |
| `semgrep` | ✅ | [semgrep/skills](https://github.com/semgrep/skills) | Three SKILL.md: `semgrep`, `code-security`, `llm-security`. |
| `lizard` | ✍️ | `skills/lizard/SKILL.md` (to author) | CCN thresholds, `-l <lang>`, `--xml`/`--csv`, function length warnings. |

---

## Web / docs

| Tool | Status | Source / Plan | Notes |
|---|---|---|---|
| `tvly` (Tavily) | ✅ | [tavily-ai/skills](https://github.com/tavily-ai/skills) | Seven SKILL.md: search, extract, crawl, map, research, cli, best-practices. |
| `playwright-cli` | ✅ | [microsoft/playwright-cli — SKILL.md](https://github.com/microsoft/playwright-cli/blob/main/skills/playwright-cli/SKILL.md) | Click/type, navigation, DevTools, cookies, multi-tab. |
| `ctx7` (Context7) | ☑ | [edxeth/superlight-context7-skill](https://github.com/edxeth/superlight-context7-skill) | Token-efficient REST skill. No upstream from upstash/context7. |

---

## Cloud services

| Tool | Status | Source / Plan | Notes |
|---|---|---|---|
| `gws` (Google Workspace) | ✅ | [googleworkspace/cli/skills](https://github.com/googleworkspace/cli/tree/main/skills) | ~100 SKILL.md (gmail, docs, calendar, slides, people, …). |
| `wrangler` (Cloudflare) | ✅ | [cloudflare/skills/wrangler](https://github.com/cloudflare/skills/blob/main/skills/wrangler/SKILL.md) | Workers, KV, R2, D1, Queues, Workflows, Pipelines. |
| `hcloud` (Hetzner) | ☑ | [danjdewhurst/hcloud-skills](https://github.com/danjdewhurst/hcloud-skills) | Servers, networks, DNS, storage + safety hooks. |
| `flarectl` (Cloudflare DNS) | ✍️ | `skills/flarectl/SKILL.md` (to author) | DNS record CRUD, zone listing, when to use over wrangler. |
| `usql` | ✍️ | `skills/usql/SKILL.md` (to author) | DSN format, `\c` connection switch, output formats, history file, transaction modes. |

---

## Language linters / formatters

| Tool | Status | Source / Plan | Notes |
|---|---|---|---|
| `knip` | ☑ | [agentskillexchange/skills — knip-unused-code-dependency-finder](https://github.com/agentskillexchange/skills/blob/main/skills/knip-unused-code-dependency-finder/SKILL.md) | Dedicated. |
| `clippy` | ☑ | [leonardomso/rust-skills](https://github.com/leonardomso/rust-skills) | 179-rule pack — extract clippy section as a dedicated skill if needed. |
| `golangci-lint` | ☑ | [samber/cc-skills-golang](https://github.com/samber/cc-skills-golang) | `.golangci.yml` source-of-truth. |
| `php-cs-fixer` | ☑ | [DaveLiddament/php-claude-skills](https://github.com/DaveLiddament/php-claude-skills) | Dedicated coverage. |
| `phpstan` | ☑ | [netresearch/php-modernization-skill](https://github.com/netresearch/php-modernization-skill) | Level 9+/10 modernization. |
| `ruff` | ✍️ | `skills/ruff/SKILL.md` (to author) | `ruff check --fix --unsafe-fixes` vs `ruff format`; `--select`/`--ignore`; `pyproject.toml` config. |
| `biome` | ✍️ | `skills/biome/SKILL.md` (to author) | `check` vs `format` vs `lint`; `--reporter=json`; migration from prettier+eslint. |
| `ktlint` | ✍️ | `skills/ktlint/SKILL.md` (to author) | `--format`, `--reporter=json`, ruleset config. |
| `google-java-format` | ✍️ | `skills/google-java-format/SKILL.md` (to author) | `--replace`, `--aosp`, integration with build tools. |
| `pmd` | ✍️ | `skills/pmd/SKILL.md` (to author) | `check --format json`, ruleset selection, baselines. |
| `spotbugs` | ✍️ | `skills/spotbugs/SKILL.md` (to author) | `-sarif`, effort levels, exclude filters. |
| `dart-format` / `dart analyze` | ✍️ | `skills/dart-toolchain/SKILL.md` (to author) | Combined skill — both ship with Dart SDK. |
| `osv-scanner` | ✍️ | `skills/osv-scanner/SKILL.md` (to author) | `--lockfile`, `--format=json`, recursive scan, ignore file. |

---

## Authoring queue (priority order)

Ordered by per-session friction (how often agents trip without the skill):

1. `jq` — ✅ shipped
2. `gh` — ✅ shipped
3. `fzf` — ✅ shipped
4. `just` — ✅ shipped
5. `xh` — ✅ shipped
6. `ruff` + `biome` — highest-velocity formatters of 2025-2026
7. `gitleaks` — referenced from hooks recipe (5.5)
8. `watchexec`, `hyperfine` — refactor-loop tools
9. `direnv`, `mise` (re-author), `git-cliff`, `difftastic` — situational but recurring
10. `bat`, `eza`, `sd`, `zoxide` — tight, < 50-line skills each
11. `lizard` — referenced from rules
12. JVM stack (ktlint / google-java-format / pmd / spotbugs) — language-conditional
13. `osv-scanner`, `usql`, `flarectl`, `dart-toolchain` — niche
14. Re-authored `mise` — only if upstream pin proves unstable

---

## Authoring template

Every in-repo skill follows the same shape:

```markdown
---
name: <tool>
description: <one-line trigger — when to invoke, what the skill teaches>
---

# <Tool>

## When
- Trigger 1: agent encounters X → use this skill
- Trigger 2: …

## Invocation
- Canonical command: `<tool> <args>`
- Read JSON: `<tool> --json | jq …`

## Patterns
- Pattern 1 with example
- Pattern 2 with example

## Anti-patterns
- Don't do X — Y happens
- Don't do Z — Y happens

## Cross-refs
- Rule: see `rules/AGENTS.md` §<n>
- Hook recipe: see `docs/hooks.md` §<n> (if applicable)
```

Skills authored in this repo are mirrored to every agent's skills path by `fulcrum skills sync` (`src/cli/skills.ts`). Gemini's extension wrapper is generated automatically.

---

## Install flow (current state)

```bash
# 1. Cross-agent platform
claude plugin install obra/superpowers

# 2. Verified upstream skills via gh skill (when supported)
gh skill install ast-grep/agent-skill
gh skill install tavily-ai/skills
gh skill install cloudflare/skills
gh skill install googleworkspace/cli@main:skills

# 3. In-repo authored (once skills/<name>/ folders exist)
#    `fulcrum skills sync` mirrors skills/* to each agent's skills path.
```
