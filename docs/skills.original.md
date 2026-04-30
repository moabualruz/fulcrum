# Skills

> Skills teach agents *when and how* to use CLI tools. Without a skill, agents invent broken invocations or miss the right tool entirely.

## 1. Per-agent paths

Each agent uses its own native skills directory. Do not use a shared `~/.agents/` folder — it pollutes every agent's context with skills that may not apply.

Fulcrum-authored skills install under `fulcrum/` (we own that namespace). Curated upstream skills install where the vendor's own per-agent installer would put them — top-level `<agent>/skills/<name>/`. Fulcrum does not own a namespace for skills it did not author. Custom user skills sit alongside and are not touched by sync/uninstall except explicit Fulcrum-managed paths.

| Agent | Fulcrum-authored path | Curated upstream path | Custom user skills path |
|---|---|---|---|
| Claude Code | Plugin `fulcrum@fulcrum` (`~/.claude/plugins/cache/fulcrum/fulcrum/<ver>/skills/<name>/SKILL.md`) | `~/.claude/skills/<name>/SKILL.md` or vendor plugin | `~/.claude/skills/<name>/SKILL.md` |
| Codex CLI | Global opt-in: `~/.codex/skills/fulcrum/<name>/SKILL.md`; project opt-in: `.codex/skills/fulcrum/<name>/SKILL.md` | `~/.codex/skills/<name>/SKILL.md` | `~/.codex/skills/<name>/SKILL.md` (user) · `.codex/skills/<name>/SKILL.md` (project) |
| Gemini CLI | `~/.gemini/extensions/fulcrum-skills/skills/<name>/SKILL.md` | `~/.gemini/skills/<name>/SKILL.md` | `~/.gemini/extensions/<other>/skills/<name>/SKILL.md` |
| OpenCode | `~/.config/opencode/skills/fulcrum/<name>/SKILL.md` | `~/.config/opencode/skills/<name>/SKILL.md` | `~/.config/opencode/skills/<name>/SKILL.md` |
| Pi CLI | `~/.pi/agent/skills/fulcrum/<name>/SKILL.md` | `~/.pi/agent/skills/<name>/SKILL.md` | `~/.pi/agent/skills/<name>/SKILL.md` (user) · `.pi/skills/` (project) |

`fulcrum skills sync` propagates authored `skills/<name>/SKILL.md` from the repo to agent-native surfaces. Claude Code uses the plugin path; OpenCode/Pi use `<skills-root>/fulcrum/`; Gemini uses the `fulcrum-skills` extension; Codex global scope is skipped by default and must be requested with `--codex-global` or `--codex-project <dir>`. `fulcrum skills upstream` clones curated upstream repos into `~/.fulcrum/cache/upstream-skills` and propagates selected skills to the vendor's own placement convention — top-level `<agent>/skills/<name>/`. Generated CLI agent mirrors exclude `.original.md`, `_archive`, `_template`, `.git`, `node_modules`, and worktree folders; project source folders keep `.original.md` human-edit backups. **Agents themselves still load by frontmatter `name:`** — the namespacing is path-based and recursive scans pick skills up regardless of depth.

## 2. Managed vendor skill/package catalogue

| Source | How Fulcrum manages it |
|---|---|
| `package.repomix` | Vendor-derived skills, commands, rules, MCP metadata, and explorer-agent surfaces. |
| `package.superpowers` | Native packages where available; full package mirrors where needed. |
| `package.cloudflare` | Claude plugin plus full non-Claude package mirrors and registry MCP entries. |
| `package.caveman` | Native Claude/Gemini installs plus full Codex/OpenCode/Pi package mirrors. |
| `package.graphify` | Vendor `graphify install --platform <agent>` where supported; Pi skill fallback. |
| `package.ast-grep` | Vendor `npx skills add ast-grep/agent-skill` integration. |
| `package.tavily` | Vendor `npx skills add https://github.com/tavily-ai/skills` integration. |
| `skills.upstream` | Pinned Playwright, Semgrep, Graphify, Superpowers, and Cloudflare skills with subtree SHA-256 verification. |

> `repomix` is managed as `package.repomix`, not an authored skill. Its package mirror carries vendor-derived skills, commands, rules, MCP metadata, and explorer-agent surfaces where each agent supports them.

## 3. Adoption strategy — install one, cherry-pick the rest

**Strategy: install filesystem skill folders as the cross-agent distribution layer, cherry-pick skills and patterns from the others.**

Current CLI support: `fulcrum install` defaults to the minimal profile and does not sync authored/upstream skills globally. Use `fulcrum install --profile full` for the historical full bootstrap, or run `fulcrum skills sync` / `fulcrum skills upstream` directly. Codex authored skills stay out of global user scope unless `--codex-global` is passed; use `--codex-project <dir>` for project-local Codex skills.

### Install: superpowers (obra/superpowers)

Source repo with useful skill ideas and native packages for several agents. Fulcrum installs the native package where supported and mirrors the full package surface where the agent lacks a first-party/generic installer.

**Skills to keep enabled from superpowers:**

| Skill | Why |
|---|---|
| `brainstorming` | Structured exploration mode for the "process, not destination" problem |
| `writing-plans` | Plan-doc generation |
| `systematic-debugging` | General-purpose debugging methodology |
| `code-review` | General-purpose |
| `worktrees` | Parallel agent dispatch — relevant for multi-session orchestration |
| `using-skills` | Meta-skill for skill authorship, used when writing custom skills |

Skip the heavy TDD-orchestrator skills if they don't fit the project shape.

### Cherry-pick patterns from SpecKit

Don't install. Borrow:
- The **`AGENTS.md` + per-agent directory** convention (see [agents.md](agents.md)).
- The `constitution.md` concept maps to our per-project `AGENTS.md`.

## 4. Skill name policy

**Skill name equals slash trigger.** Skill `<name>` → `/<name>`. The folder name, the `name:` field in frontmatter, and the slash command are all the same string.

**No prefix on the `name:` itself.** Use clean names like `jq`, `gh`, `ruff`. The `fulcrum/` namespace is path-based (the parent folder under each agent's skills root, see §1) — the frontmatter name stays prefix-free. This keeps the `/jq` slash command short while still giving fulcrum-managed skills an effective `fulcrum:jq` address space at the filesystem layer.

`fulcrum:` is the effective authored-skill namespace. Claude Code exposes it directly through the `fulcrum@fulcrum` plugin (`/fulcrum:jq`). Other agents get the namespace from the mirrored folder or extension path while frontmatter `name:` stays prefix-free (`jq`, not `fulcrum:jq`).

## 5. Authoring template

In-repo skills follow Anthropic's spec-compliant frontmatter + a body skeleton proven by superpowers across its 14 skills. Template at `skills/_template/SKILL.md`:

- **Frontmatter** — `name` (lowercase + digits + hyphens, ≤64 chars, no reserved words `anthropic`/`claude`, dir-name match) and `description` (quoted YAML string, target ≤300 chars, hard cap ≤1024 chars, no XML). Keep description as a trigger summary only; do not pack long trigger lists into it.
- **Body** — `## When to use` / `## Invocation` / `## Patterns` / `## Anti-patterns` / `## Cross-refs`. Keep `SKILL.md` as a table of contents plus minimal routing. Put section detail in directly linked `references/<section>.md` files.
- **References** — mirror each shipped `references/*.md` with `references/*.original.md`. The `.original.md` file is human-editable; the `.md` file is what agents load. Keep references one hop from `SKILL.md`; no deep reference chains.

Validate with `fulcrum skills lint <path>`. Lints against the strictest union of all 5 agents' frontmatter rules.

## 6. When to fork upstream skills

Pin third-party skills in `skills/upstream.lock` (TOML) when ALL of:

- author is the tool vendor / Anthropic / a foundation org (verified via `author_class`),
- repo has a release or commit within the last 180 days,
- license is permissive (MIT / Apache-2.0 / BSD / CC0).

**Fork into `skills/<name>/` the moment ANY of these triggers fires:**

- 90-day commit silence on the upstream repo,
- unresolved CVE older than 14 days,
- license drift / clarity issue,
- more than 2 of our patches diverge from upstream,
- maintainer unresponsive to a PR for more than 30 days.

Always vendor (never pin) for individual-author repos like `mitsuhiko/agent-stuff`, `obra/superpowers-lab`, `DevonMorris/claude-ctags` — track them in the lockfile and replay diffs quarterly.

## 7. Verification

Tiered:

1. **Lint everywhere (CI):** `fulcrum skills lint skills/` validates every authored skill on the strictest frontmatter union. Cheap; catches the 80% of cross-agent failures.
2. **Claude trigger-rate eval:** `scripts/eval-skill-claude.sh <skill>` calls `claude --print --output-format=json --no-session-persistence` per query. Auth via Claude Code keychain — no `ANTHROPIC_API_KEY` env var. Eval set at `evals/<skill>.json` (approximately 20 entries, approximately 12/8 trigger/anti-trigger split). Leaderboard runner at `scripts/eval-all.sh`.
3. **Codex trigger-rate eval:** `scripts/eval-skill-codex.sh <skill> --model <codex-model>` calls `codex exec --json --ephemeral` against installed `~/.codex/skills/fulcrum/<skill>` or a project-local `.codex/skills/fulcrum/<skill>` mirror. Use this when Codex skill loading or description-budget behavior changes. Keep model explicit in result notes. Long samples can stall; pass `--timeout-seconds N` or set `CODEX_EVAL_TIMEOUT_SECONDS`.
4. **Gemini trigger-rate eval:** `scripts/eval-skill-gemini.sh <skill>` calls `gemini -p "<query>" --output-format json --approval-mode plan --include-directories ~/.gemini/extensions/fulcrum-skills`. Requires skill at `~/.gemini/extensions/fulcrum-skills/skills/<name>/SKILL.md` and extension linked (`gemini extensions link`). Activation detected by word-boundary grep of stdout+stderr against `evals/<skill>.match-words`.
5. **OpenCode trigger-rate eval:** `scripts/eval-skill-opencode.sh <skill>` calls `opencode run --format json`. Requires skill at `~/.config/opencode/skills/fulcrum/<name>/SKILL.md`. Activation detected from structured skill events first, then match words.
6. **Pi trigger-rate eval:** `scripts/eval-skill-pi.sh <skill>` calls `pi --print --mode json --no-session --no-tools`. Requires skill at `~/.pi/agent/skills/fulcrum/<name>/SKILL.md`. Activation detected by word-boundary grep of JSON output against `evals/<skill>.match-words`.

All five agents have scriptable trigger-rate measurement with shared JSONL outputs and 80/20 pass criteria. Checklist template at `docs/skill-smoke-test.md`.
