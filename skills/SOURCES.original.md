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

- **`JuliusBrussee/caveman`** — <https://github.com/JuliusBrussee/caveman>. **Mandatory managed install on every fulcrum host.** Compresses agent output (~75% verbosity reduction) and rewrites memory files (~46% input-token reduction) into terse fragments while preserving code, paths, commands, and semantic intent. Cross-agent: ships Claude Code plugin, Gemini extension, `.codex/hooks.json` SessionStart auto-activation, and Cursor/Windsurf SKILL.md. Mandatory mode: `/caveman ultra`. Used by fulcrum to (a) compress all in-repo `skills/<name>/SKILL.md` and `rules/AGENTS.md` files via `/caveman:compress` so the agent reads the maximally-compressed form; (b) ship caveman as the always-on default across every agent fulcrum installs into. See HANDOVER's "Next session" plan for the integration pipeline.
- **`obra/superpowers`** — <https://github.com/obra/superpowers>. Source for skill ideas; Fulcrum does not call its native installers in this branch. Mirror any adopted pieces into the filesystem skill namespace.
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
| `yq` | ✍️ shipped | [`skills/yq/SKILL.md`](yq/SKILL.md) + [`evals/yq.json`](../evals/yq.json) | Authored 2026-04-28. mikefarah-vs-kislyuk disambiguation, multi-doc, format conversion. 20-entry eval (12/8). |
| `fzf` | ✍️ shipped | [`skills/fzf/SKILL.md`](fzf/SKILL.md) + [`evals/fzf.json`](../evals/fzf.json) | Authored 2026-04-28. Non-interactive `--filter` mode; 7 patterns + 7 anti-patterns. 20-entry eval (11/9). |
| `xh` | ✍️ shipped | [`skills/xh/SKILL.md`](xh/SKILL.md) + [`evals/xh.json`](../evals/xh.json) | Authored 2026-04-28. Four operators, `--check-status`, sessions, auth, uploads. 20-entry eval (12/8). |
| `just` | ✍️ shipped | [`skills/just/SKILL.md`](just/SKILL.md) + [`evals/just.json`](../evals/just.json) | Authored 2026-04-28. Discovery-first (`--list`, `--show`); 7 patterns + 7 anti-patterns. 20-entry eval (12/8). |
| `bat` | ✍️ shipped | [`skills/bat/SKILL.md`](bat/SKILL.md) + [`evals/bat.json`](../evals/bat.json) | Authored 2026-04-28. Tight (~70 lines); `--paging=never` for pipes, stdin language hint, `batcat` Debian caveat. 18-entry eval (11/7). |
| `eza` | ✍️ shipped | [`skills/eza/SKILL.md`](eza/SKILL.md) + [`evals/eza.json`](../evals/eza.json) | Authored 2026-04-28. Tight (~70 lines); `--git`, `--tree`, `--git-ignore`. 20-entry eval (11/9). |
| `sd` | ✍️ shipped | [`skills/sd/SKILL.md`](sd/SKILL.md) + [`evals/sd.json`](../evals/sd.json) | Authored 2026-04-28. Tight (~68 lines); in-place by default, `$N` backrefs, `-A` across-newline, `-F` literal. 20-entry eval (12/8). |
| `zoxide` | ✍️ shipped | [`skills/zoxide/SKILL.md`](zoxide/SKILL.md) + [`evals/zoxide.json`](../evals/zoxide.json) | Authored 2026-04-28. Tight (~72 lines); shell-function vs script-safe lookup, frecency, agent shell guardrail. 20-entry eval (11/9). |
| `direnv` | ✍️ shipped | [`skills/direnv/SKILL.md`](direnv/SKILL.md) + [`evals/direnv.json`](../evals/direnv.json) | Authored 2026-04-28. `.envrc`, layout helpers, security allowlist, `direnv exec` for non-interactive shells. 19-entry eval (11/8). |
| `difftastic` | ✍️ shipped | [`skills/difftastic/SKILL.md`](difftastic/SKILL.md) + [`evals/difftastic.json`](../evals/difftastic.json) | Authored 2026-04-28. Binary is `difft`; git-external one-shot, scoped config, language override. 20-entry eval (11/9). |
| `git-cliff` | ✍️ shipped | [`skills/git-cliff/SKILL.md`](git-cliff/SKILL.md) + [`evals/git-cliff.json`](../evals/git-cliff.json) | Authored 2026-04-28. 6 patterns + 8 anti-patterns; release workflow + Tera templating. 20-entry eval (12/8). |
| `gitleaks` | ✍️ shipped | [`skills/gitleaks/SKILL.md`](gitleaks/SKILL.md) + [`evals/gitleaks.json`](../evals/gitleaks.json) | Authored 2026-04-28. detect vs protect, baselines, custom rules. 20-entry eval (13/7). |
| `hyperfine` | ✍️ shipped | [`skills/hyperfine/SKILL.md`](hyperfine/SKILL.md) + [`evals/hyperfine.json`](../evals/hyperfine.json) | Authored 2026-04-28. 7 patterns + 8 anti-patterns; warmup, sweeps, regression detection. 20-entry eval (12/8). |
| `watchexec` | ✍️ shipped | [`skills/watchexec/SKILL.md`](watchexec/SKILL.md) + [`evals/watchexec.json`](../evals/watchexec.json) | Authored 2026-04-28. Encodes the agent-vs-human distinction (don't start in agent shells). 20-entry eval (11/9). |

---

## Code intelligence

| Tool | Status | Source / Plan | Notes |
|---|---|---|---|
| `graphify` | ✅ | [safishamsi/graphify — skill.md](https://github.com/safishamsi/graphify/blob/v5/graphify/skill.md) | Per-agent variants. Knowledge-graph extraction + BFS/DFS. |
| `semgrep` | ✅ | [semgrep/skills](https://github.com/semgrep/skills) | Three SKILL.md: `semgrep`, `code-security`, `llm-security`. |
| `lizard` | ✍️ shipped | [`skills/lizard/SKILL.md`](lizard/SKILL.md) + [`evals/lizard.json`](../evals/lizard.json) | Authored 2026-04-28. 7 patterns + 7 anti-patterns; CCN, length, params, baseline diff. 20-entry eval (12/8). |

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
| `flarectl` (Cloudflare DNS) | ✍️ shipped | [`skills/flarectl/SKILL.md`](flarectl/SKILL.md) + [`evals/flarectl.json`](../evals/flarectl.json) | Authored 2026-04-28. Scoped-token auth, DNS CRUD, cache purge, flarectl-vs-wrangler boundary. 20-entry eval (12/8). |
| `usql` | ✍️ shipped | [`skills/usql/SKILL.md`](usql/SKILL.md) + [`evals/usql.json`](../evals/usql.json) | Authored 2026-04-28. 30+ drivers, DSN format, `\c` switching, history, transactions. 20-entry eval (11/9). |

---

## Language linters / formatters

| Tool | Status | Source / Plan | Notes |
|---|---|---|---|
| `knip` | ☑ | [agentskillexchange/skills — knip-unused-code-dependency-finder](https://github.com/agentskillexchange/skills/blob/main/skills/knip-unused-code-dependency-finder/SKILL.md) | Dedicated. |
| `clippy` | ☑ | [leonardomso/rust-skills](https://github.com/leonardomso/rust-skills) | 179-rule pack — extract clippy section as a dedicated skill if needed. |
| `golangci-lint` | ☑ | [samber/cc-skills-golang](https://github.com/samber/cc-skills-golang) | `.golangci.yml` source-of-truth. |
| `php-cs-fixer` | ☑ | [DaveLiddament/php-claude-skills](https://github.com/DaveLiddament/php-claude-skills) | Dedicated coverage. |
| `phpstan` | ☑ | [netresearch/php-modernization-skill](https://github.com/netresearch/php-modernization-skill) | Level 9+/10 modernization. |
| `ruff` | ✍️ shipped | [`skills/ruff/SKILL.md`](ruff/SKILL.md) + [`evals/ruff.json`](../evals/ruff.json) | Authored 2026-04-28. 7 patterns + 8 anti-patterns; covers both `check` and `format`. 20-entry eval (12/8). |
| `biome` | ✍️ shipped | [`skills/biome/SKILL.md`](biome/SKILL.md) + [`evals/biome.json`](../evals/biome.json) | Authored 2026-04-28. 8 patterns + 8 anti-patterns; flags the `format`-without-`--write` no-mutation gotcha. 21-entry eval (13/8). |
| `ktlint` | ✍️ shipped | [`skills/ktlint/SKILL.md`](ktlint/SKILL.md) + [`evals/ktlint.json`](../evals/ktlint.json) | Authored 2026-04-28. `-F` mutates, `--android`, `.editorconfig`, `@Suppress("ktlint:...")` migration. 20-entry eval (12/8). |
| `google-java-format` | ✍️ shipped | [`skills/google-java-format/SKILL.md`](google-java-format/SKILL.md) + [`evals/google-java-format.json`](../evals/google-java-format.json) | Authored 2026-04-28. No-config philosophy, JDK 17+ `--add-exports`, dry-run CI gate. 20-entry eval (12/8). |
| `pmd` | ✍️ shipped | [`skills/pmd/SKILL.md`](pmd/SKILL.md) + [`evals/pmd.json`](../evals/pmd.json) | Authored 2026-04-28. `pmd check` vs `pmd cpd`, ruleset categories, SARIF, baselines. 20-entry eval (11/9). |
| `spotbugs` | ✍️ shipped | [`skills/spotbugs/SKILL.md`](spotbugs/SKILL.md) + [`evals/spotbugs.json`](../evals/spotbugs.json) | Authored 2026-04-28. Bytecode (not source); effort tiers, plugins, SARIF. 21-entry eval (12/9). |
| `dart-format` / `dart analyze` | ✍️ shipped | [`skills/dart-toolchain/SKILL.md`](dart-toolchain/SKILL.md) + [`evals/dart-toolchain.json`](../evals/dart-toolchain.json) | Authored 2026-04-28. Combined: format + analyze + dart fix; CI gate via `--set-exit-if-changed`. 20-entry eval (12/8). |
| `osv-scanner` | ✍️ shipped | [`skills/osv-scanner/SKILL.md`](osv-scanner/SKILL.md) + [`evals/osv-scanner.json`](../evals/osv-scanner.json) | Authored 2026-04-28. Multi-ecosystem CVE scan, SBOM input, `image` subcommand, ignoreUntil. 20-entry eval (12/8). |

---

## Authoring queue (priority order)

Ordered by per-session friction (how often agents trip without the skill):

1. `jq` — ✅ shipped
2. `gh` — ✅ shipped
3. `fzf` — ✅ shipped
4. `just` — ✅ shipped
5. `xh` — ✅ shipped
6. `ruff` + `biome` — ✅ both shipped
7. `gitleaks` — ✅ shipped
8. `watchexec`, `hyperfine` — ✅ both shipped
9. `direnv`, `mise`, `git-cliff`, `difftastic` — ✅ all shipped
10. `bat`, `eza`, `sd`, `zoxide` — ✅ all shipped (tight, ~70-line skills)
11. `lizard` — ✅ shipped
12. JVM stack (ktlint / google-java-format / pmd / spotbugs) — ✅ all shipped
13. `osv-scanner`, `usql`, `flarectl`, `dart-toolchain` — ✅ all shipped
14. Re-authored `mise` — ✅ shipped

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
# 1. Cross-agent platform layer
#    Fulcrum does not call native plugin installers in this branch.
#    Curated third-party skills land as filesystem folders under `fulcrum-upstream/`.

# 2. Curated upstream skills
fulcrum skills upstream

# 3. In-repo authored (once skills/<name>/ folders exist)
#    `fulcrum skills sync` mirrors skills/* to each agent's skills path.
```
