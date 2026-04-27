# Skill sources

> Tool skills are **sourced**, not authored. This file lists upstream skills that fulcrum installs. Verified against primary sources 2026-04-27.

## Selection principle

Don't write a SKILL.md for a tool when the upstream community already publishes one. Re-authoring fragments the ecosystem and rots when flags change. Source upstream; pin a known-good commit; re-source on update.

**Status legend:** ✅ official (tool author or vendor) · ☑ third-party (high-quality, verified) · 🚧 gap (no skill found) · ◐ shallow (mentioned only inside a catalog/multi-tool skill, not deep usage docs).

---

## Cross-agent platforms

### `obra/superpowers`

<https://github.com/obra/superpowers> — Claude Code plugin (`claude plugin install obra/superpowers`); ships `.codex-plugin/`, `.opencode/`, `gemini-extension.json`, `.cursor-plugin/`. The cross-agent distribution platform.

Skills to enable: `brainstorming`, `writing-plans`, `systematic-debugging`, `code-review`, `worktrees`, `using-skills`. Skip the heavy TDD-orchestrator skills.

### `obra/superpowers-lab`

<https://github.com/obra/superpowers-lab> — sibling repo, 309 stars. Contains `using-tmux-for-interactive-commands` (driving REPLs) — the canonical tmux skill.

### `anthropics/skills`

<https://github.com/anthropics/skills> — Anthropic-official. Document work, webapp testing, mcp-builder, skill-creator. No CLI-tool skills. Pick sub-skills as needed.

### GitHub `gh skill` package manager

GitHub shipped a `gh skill` extension on 2026-04-16 ([changelog](https://github.blog/changelog/2026-04-16-manage-agent-skills-with-github-cli/)) for managing agent skills. It is the package manager, not a usage skill — there is no upstream `gh` SKILL.md from `cli/cli`.

---

## Foundation tools

| Tool | Status | Source | Notes |
|---|---|---|---|
| `ripgrep` (rg) | ☑ | [netresearch/file-search-skill](https://github.com/netresearch/file-search-skill) | Bundles rg + fd + ast-grep + rga + tokei. v1.4.0. |
| `fd` | ☑ | same as rg | Same skill anchors fd. |
| `fzf` | 🚧 | — | Embedded only inside vibe-stack skills. Highest-friction gap. |
| `jq` | ◐ | [netresearch/cli-tools-skill](https://github.com/netresearch/cli-tools-skill) | Catalog mention only — no deep jq syntax skill exists. **#1 friction gap.** |
| `yq` | ◐ | same as jq | Catalog mention only. |
| `bat` | ◐ | same as jq | Catalog mention only. |
| `sd` | 🚧 | — | No SKILL.md found. |
| `eza` | 🚧 | — | Config-only mentions. |
| `zoxide` | 🚧 | — | Config-only mentions. |
| `xh` | 🚧 | — | No SKILL.md found. |
| `gh` | ☑ | [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff/tree/main/skills/github) | 2.1k stars. Best third-party — no canonical upstream from `cli/cli`. |
| `just` | 🚧 | — | No SKILL.md surfaced. Agents fall back to raw shell instead of project recipes. |
| `mise` | ☑ | [ray-manaloto/claude-code-marketplace](https://github.com/ray-manaloto/claude-code-marketplace/tree/main/mise-toolkit) | Multi-SKILL toolkit incl. `mise-vs-alternatives`. Low-reputation (1 star) but content exists. |
| `direnv` | 🚧 | — | Comparison-only inside mise-toolkit. |
| `tmux` | ☑ | [obra/superpowers-lab — using-tmux-for-interactive-commands](https://github.com/obra/superpowers-lab) · [mitsuhiko/agent-stuff — tmux](https://github.com/mitsuhiko/agent-stuff/blob/main/skills/tmux/SKILL.md) | Two strong sources; superpowers-lab is sharper for interactive REPL driving. |
| `difftastic` | 🚧 | — | No dedicated skill. |
| `universal-ctags` | ☑ | [DevonMorris/claude-ctags](https://github.com/DevonMorris/claude-ctags) | Auto-index + usage skill. Claims ~80% token reduction vs grep. MIT. |
| `hyperfine` | ◐ | [netresearch/cli-tools-skill](https://github.com/netresearch/cli-tools-skill) | Single-line entry. |
| `watchexec` | 🚧 | — | No SKILL.md. |
| `ast-grep` | ✅ | [ast-grep/agent-skill](https://github.com/ast-grep/agent-skill) | Tool-author skill. 644 stars. Distributed via Claude plugin marketplace. |
| `gitleaks` | 🚧 | — | Catalog mention only — no usage skill. |
| `git-cliff` | 🚧 | — | No SKILL.md. |

---

## Code intelligence

| Tool | Status | Source | Notes |
|---|---|---|---|
| `repomix` | ✅ | [yamadashy/repomix — repomix-explorer](https://github.com/yamadashy/repomix/tree/main/.claude/skills/repomix-explorer) | Ships `npx repomix@latest` recipes. |
| `graphify` | ✅ | [safishamsi/graphify — skill.md](https://github.com/safishamsi/graphify/blob/v5/graphify/skill.md) | Per-agent variants (`skill-codex.md`, `skill-opencode.md`, …). Knowledge-graph extraction + BFS/DFS queries. |
| `semgrep` | ✅ | [semgrep/skills](https://github.com/semgrep/skills) | Three SKILL.md: `semgrep`, `code-security`, `llm-security`. Install via `npx skills add semgrep/skills`. |
| `lizard` | 🚧 | — | Only referenced inside larger code-review skills. |

---

## Web / docs

| Tool | Status | Source | Notes |
|---|---|---|---|
| `tvly` (Tavily) | ✅ | [tavily-ai/skills](https://github.com/tavily-ai/skills) | Seven SKILL.md: search, extract, crawl, map, research, cli, best-practices. |
| `ctx7` (Context7) | ☑ | [edxeth/superlight-context7-skill](https://github.com/edxeth/superlight-context7-skill) · [majiayu000/claude-skill-registry — context7](https://github.com/majiayu000/claude-skill-registry) | "Token-efficient" REST-based skill. No upstream from upstash/context7. |
| `playwright-cli` | ✅ | [microsoft/playwright-cli — SKILL.md](https://github.com/microsoft/playwright-cli/blob/main/skills/playwright-cli/SKILL.md) | Click/type, navigation, console/network DevTools, cookies, multi-tab refs, tracing. Strong alt: [lackeyjb/playwright-skill](https://github.com/lackeyjb/playwright-skill). |

---

## Cloud services

| Tool | Status | Source | Notes |
|---|---|---|---|
| `gws` (Google Workspace CLI) | ✅ | [googleworkspace/cli — skills/](https://github.com/googleworkspace/cli/tree/main/skills) | ~100 SKILL.md (gmail, docs, calendar, slides, people, …). |
| `wrangler` (Cloudflare) | ✅ | [cloudflare/skills — wrangler](https://github.com/cloudflare/skills/blob/main/skills/wrangler/SKILL.md) | Workers, KV, R2, D1, Vectorize, Hyperdrive, Workers AI, Queues, Workflows, Pipelines, Secrets. Sibling skills: agents-sdk, durable-objects, sandbox-sdk, web-perf. |
| `hcloud` (Hetzner) | ☑ | [danjdewhurst/hcloud-skills](https://github.com/danjdewhurst/hcloud-skills) · [The-Focus-AI/marina-skill](https://github.com/The-Focus-AI/marina-skill) | hcloud-skills is the deeper option (servers, networks, DNS, storage + safety hooks). |
| `flarectl` (Cloudflare DNS) | 🚧 | — | Absent from `cloudflare/skills`. DNS work currently funnels through wrangler. |
| `usql` | 🚧 | — | Universal SQL CLI completely unrepresented. |

---

## Language linters / formatters

| Tool | Status | Source | Notes |
|---|---|---|---|
| `ruff` | 🚧 | — | Mentioned inside generic Python skills only. **High-friction gap.** |
| `biome` | 🚧 | — | Editor/format-on-save mentions only. **High-friction gap.** |
| `knip` | ☑ | [agentskillexchange/skills — knip-unused-code-dependency-finder](https://github.com/agentskillexchange/skills/blob/main/skills/knip-unused-code-dependency-finder/SKILL.md) | Dedicated skill. |
| `clippy` (Rust) | ☑ | [leonardomso/rust-skills](https://github.com/leonardomso/rust-skills) · [huiali/rust-skills](https://github.com/huiali/rust-skills) | 179-rule Rust pack bundles clippy + CI. |
| `golangci-lint` | ☑ | [samber/cc-skills-golang](https://github.com/samber/cc-skills-golang) | Treats `.golangci.yml` as source of truth. |
| `php-cs-fixer` | ☑ | [zircote/php-lsp](https://github.com/zircote/php-lsp) · [DaveLiddament/php-claude-skills](https://github.com/DaveLiddament/php-claude-skills) | LSP + cs-fixer + phpstan combo. |
| `phpstan` | ☑ | [netresearch/php-modernization-skill](https://github.com/netresearch/php-modernization-skill) · [MakFly/superpowers-symfony](https://github.com/MakFly/superpowers-symfony) | Modernization to level 9+/10. |
| `ktlint` | 🚧 | — | Build-plugin READMEs only. |
| `google-java-format` | 🚧 | — | No SKILL.md. |
| `pmd` | 🚧 | — | Build-plugin only. |
| `spotbugs` | 🚧 | — | Build-plugin only. |
| `dart-format` / `dart analyze` | 🚧 | — | Embedded in Flutter project CLAUDE.md only. |
| `osv-scanner` | 🚧 | — | De-facto polyglot vuln scanner with zero dedicated skills. |

---

## Highest-friction gaps (priority order)

1. **`jq` deep skill** — invoked dozens of times per session; current sources teach "prefer jq" not jq syntax.
2. **`gh` canonical skill** — massive surface area (PR review, `--jq`, GraphQL via `gh api`, paging) with only third-party coverage.
3. **JVM static-analysis stack** (ktlint, google-java-format, pmd, spotbugs) — largest enterprise ecosystem with zero skills.
4. **`fzf`** — fundamental to interactive selection from agent shells; embedded-only coverage isn't enough (non-TTY mode, `--filter`).
5. **`ruff` + `biome`** — highest-velocity formatters of 2025-2026 with no first-party SKILL.md. `ruff check --fix --unsafe-fixes` vs `ruff format` confusion is recurring.
6. **`osv-scanner`** — polyglot CI vuln scanner; agents misread JSON output without a skill.
7. **`usql`, `flarectl`, `watchexec`, `hyperfine`, `just`** — useful, lower-frequency.

---

## Install flow (when verified rows are pinned)

```bash
# 1. superpowers as the cross-agent platform
claude plugin install obra/superpowers

# 2. Tool skills via gh skill or upstream clones
gh skill install ast-grep/agent-skill
gh skill install tavily-ai/skills
gh skill install cloudflare/skills
gh skill install googleworkspace/cli@main:skills

# 3. Per-tool skills not yet on gh skill — clone + copy SKILL.md to ~/.claude/skills/<name>/
#    scripts/sync-upstream-skills.sh (TODO) reads this manifest and pulls each at a pinned commit
```

## Action — before next session

- [ ] Pin each ☑ / ✅ source to a known-good commit SHA in this manifest.
- [ ] Decide install order (priority by frequency: `gh`, `jq`, `xh`, `just`, `tmux`, `ast-grep` first).
- [ ] Add `scripts/sync-upstream-skills.sh` once pins are in.
- [ ] For 🚧 gaps that hit daily (`jq`, `fzf`, `ruff`, `biome`), write minimal in-house skills until upstream catches up.
