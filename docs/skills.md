# Skills

> Skills teach agents *when and how* to use CLI tools. No skill, agents invent broken invocations or miss right tool.

## 1. Per-agent paths

Each agent use own native skills directory. No shared `~/.agents/` folder — pollute every agent context with skills may not apply.

Fulcrum-authored skills install under `fulcrum/` (we own that namespace). Curated upstream skills install where the vendor's own per-agent installer would put them — top-level `<agent>/skills/<name>/`. Fulcrum does not own a namespace for skills it did not author. Custom user skills sit alongside and are not touched by sync/uninstall except explicit Fulcrum-managed paths.

| Agent | Fulcrum-authored path | Curated upstream path | Custom user skills path |
|---|---|---|---|
| Claude Code | Plugin `fulcrum@fulcrum` (`~/.claude/plugins/cache/fulcrum/fulcrum/<ver>/skills/<name>/SKILL.md`) | `~/.claude/skills/<name>/SKILL.md` or vendor plugin | `~/.claude/skills/<name>/SKILL.md` |
| Codex CLI | Global opt-in: `~/.codex/skills/fulcrum/<name>/SKILL.md`; project opt-in: `.codex/skills/fulcrum/<name>/SKILL.md` | `~/.codex/skills/<name>/SKILL.md` | `~/.codex/skills/<name>/SKILL.md` (user) · `.codex/skills/<name>/SKILL.md` (project) |
| Gemini CLI | `~/.gemini/extensions/fulcrum-skills/skills/<name>/SKILL.md` | `~/.gemini/skills/<name>/SKILL.md` | `~/.gemini/extensions/<other>/skills/<name>/SKILL.md` |
| OpenCode | `~/.config/opencode/skills/fulcrum/<name>/SKILL.md` | `~/.config/opencode/skills/<name>/SKILL.md` | `~/.config/opencode/skills/<name>/SKILL.md` |
| Pi CLI | `~/.pi/agent/skills/fulcrum/<name>/SKILL.md` | `~/.pi/agent/skills/<name>/SKILL.md` | `~/.pi/agent/skills/<name>/SKILL.md` (user) · `.pi/skills/` (project) |

`fulcrum skills sync` propagates authored `skills/<name>/SKILL.md` from repo to agent-native surfaces. Claude Code uses the plugin path; OpenCode/Pi use `<skills-root>/fulcrum/`; Gemini uses the `fulcrum-skills` extension; Codex global scope is skipped by default and must be requested with `--codex-global` or `--codex-project <dir>`. `fulcrum skills upstream` clones curated upstream repos into `~/.fulcrum/cache/upstream-skills` and propagates selected skills to the vendor's own placement convention — top-level `<agent>/skills/<name>/`. Generated CLI agent mirrors exclude `.original.md`, `_archive`, `_template`, `.git`, `node_modules`, and worktree folders; project source folders keep `.original.md` human-edit backups. **Agents load by frontmatter `name:`** — namespacing is path-based and recursive scans pick skills up regardless of depth.

### 1.1 Vendor-canonical install vs file-copy mirror

When an upstream skill ships its own per-agent installer (e.g. `graphify install --platform <agent>`), the vendor's write into the agent's top-level skills directory is the source of truth. To prevent dupe-load conflicts ("Skill conflict detected" warnings), the lockfile entry declares which agents the vendor handles:

```toml
[skills.graphify]
…
vendor_canonical_agents = ["claude-code", "codex", "gemini", "opencode"]
```

`fulcrum skills upstream` then **skips** that skill on any agent in the list — vendor's own `graphify install --platform <agent>` already ran during `fulcrum init` and placed the skill at `<agent>/skills/graphify/`. For agents NOT in the list (here: pi — graphify CLI doesn't support pi), the file-copy mirror still runs into the same top-level location (`~/.pi/agent/skills/graphify/`) so the skill is available everywhere.

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
| `brainstorming` | Structured exploration mode for "process, not destination" problem |
| `writing-plans` | Plan-doc generation |
| `systematic-debugging` | General-purpose debugging methodology |
| `code-review` | General-purpose |
| `worktrees` | Parallel agent dispatch — relevant for multi-session orchestration |
| `using-skills` | Meta-skill for skill authorship, used when writing custom skills |

Skip heavy TDD-orchestrator skills if no fit project shape.

### Cherry-pick patterns from SpecKit

No install. Borrow:
- **`AGENTS.md` + per-agent directory** convention (see [agents.md](agents.md)).
- `constitution.md` concept map to per-project `AGENTS.md`.

## 4. Skill name policy

**Skill name equal slash trigger.** Skill `<name>` → `/<name>`. Folder name, `name:` field in frontmatter, slash command — all same string.

**No prefix on `name:` itself.** Use clean names like `jq`, `gh`, `ruff`. `fulcrum/` namespace path-based (parent folder under each agent skills root, see §1) — frontmatter name stay prefix-free. Keep `/jq` slash command short while giving fulcrum-managed skills effective `fulcrum:jq` address space at filesystem layer.

`fulcrum:` is the effective authored-skill namespace. Claude Code exposes it directly through the `fulcrum@fulcrum` plugin (`/fulcrum:jq`). Other agents get the namespace from the mirrored folder or extension path while frontmatter `name:` stays prefix-free (`jq`, not `fulcrum:jq`).

## 5. Authoring template

In-repo skills follow Anthropic spec-compliant frontmatter + body skeleton proven by superpowers across its 14 skills. Template at `skills/_template/SKILL.md`:

- **Frontmatter** — `name` (lowercase + digits + hyphens, ≤64 chars, no reserved words `anthropic`/`claude`, dir-name match) and `description` (quoted YAML string, target ≤300 chars, hard cap ≤1024 chars, no XML). Keep description as trigger summary only; don't pack long trigger lists into it.
- **Body** — `## When to use` / `## Invocation` / `## Patterns` / `## Anti-patterns` / `## Cross-refs`. Keep `SKILL.md` as TOC + minimal routing. Put section detail in directly linked `references/<section>.md`.
- **References** — mirror each shipped `references/*.md` with `references/*.original.md`. `.original.md` = human-editable; `.md` = agent-loaded. Keep references one hop from `SKILL.md`; no deep chains.

Validate with `fulcrum skills lint <path>`. Lint against strictest union of all 5 agents frontmatter rules.

## 6. When to fork upstream skills

Pin third-party skills in `skills/upstream.lock` (TOML) when ALL of:

- author = tool vendor / Anthropic / foundation org (verified via `author_class`),
- repo has release or commit within last 180 days,
- license permissive (MIT / Apache-2.0 / BSD / CC0).

**Fork into `skills/<name>/` moment ANY trigger fire:**

- 90-day commit silence on upstream repo,
- unresolved CVE older than 14 days,
- license drift / clarity issue,
- more than 2 of our patches diverge from upstream,
- maintainer unresponsive to PR more than 30 days.

Always vendor (never pin) for individual-author repos like `mitsuhiko/agent-stuff`, `obra/superpowers-lab`, `DevonMorris/claude-ctags` — track in lockfile, replay diffs quarterly.

### Subpath integrity pinning

Each `[skills.<name>]` block may carry two optional fields:

```toml
subpath_sha256 = "<64-char hex>"  # SHA-256 of canonicalized skill subtree
subpath_size   = <int>            # total byte-size (sanity check only)
```

**Hash algorithm** (deterministic across darwin/linux): walk all regular files under the skill subpath in lexicographic order; for each file feed `NUL`-terminated relative-path + big-endian uint64 byte-length + raw bytes into SHA-256. Single-file skills (`.md`) use only the basename as the relative path.

**Behavior:**
- If `subpath_sha256` present: `fulcrum skills upstream` recomputes hash after git checkout and refuses to install on mismatch (`✗ <skill> subpath integrity FAILED — expected … got …`), exits non-zero.
- If absent: warns (`· <skill> subpath_sha256 not pinned — run with --update-pins to record`) but continues.
- `--update-pins`: computes missing hashes, writes back to `skills/upstream.lock`. Default is verify-only.

**Updating pins** after a deliberate upstream bump (new `tree_sha`):

```bash
# Update tree_sha in upstream.lock manually, then:
fulcrum skills upstream --update-pins
```

As of 2026-04-30 audit: 19 active upstream entries. Archived ast-grep, tavily, and context7 entries live under `skills/_archive/` because their vendor package/MCP paths now own those surfaces. Active entries include six Superpowers skills, Playwright, three Semgrep skills, Graphify, and eight Cloudflare skills; all carry `subpath_sha256`.

## 7. Verification

Tiered:

1. **Lint everywhere (CI):** `fulcrum skills lint skills/` validate every authored skill on strictest frontmatter union. Cheap; catch 80% of cross-agent failures.
2. **Claude trigger-rate eval:** `scripts/eval-skill-claude.sh <skill>` calls `claude --print --output-format=json --no-session-persistence` per query. Auth via Claude Code keychain — no `ANTHROPIC_API_KEY` env var. Eval set at `evals/<skill>.json` (~20 entries, ~12/8 trigger/anti-trigger split). Leaderboard runner at `scripts/eval-all.sh --engine claude`.
3. **Codex trigger-rate eval:** `scripts/eval-skill-codex.sh <skill> --model <codex-model>` calls `codex exec --json --ephemeral` against installed `~/.codex/skills/fulcrum/<skill>` or a project-local `.codex/skills/fulcrum/<skill>` mirror. Use when Codex skill loading or description-budget behavior changes. Keep model explicit in result notes. Long samples can stall; pass `--timeout-seconds N` or set `CODEX_EVAL_TIMEOUT_SECONDS`.
4. **Gemini trigger-rate eval:** `scripts/eval-skill-gemini.sh <skill>` calls `gemini -p "<query>" --output-format json --approval-mode plan --include-directories ~/.gemini/extensions/fulcrum-skills`. Requires skill at `~/.gemini/extensions/fulcrum-skills/skills/<name>/SKILL.md` and extension linked (`gemini extensions link`). Activation detected by word-boundary grep of stdout+stderr against `evals/<skill>.match-words`. Run via `scripts/eval-all.sh --engine gemini`.
5. **OpenCode trigger-rate eval:** `scripts/eval-skill-opencode.sh <skill>` calls `opencode run --format json`. Requires skill at `~/.config/opencode/skills/fulcrum/<name>/SKILL.md`. Activation detected by word-boundary grep of JSON event stream against `evals/<skill>.match-words`. Run via `scripts/eval-all.sh --engine opencode`.
6. **Pi trigger-rate eval:** `scripts/eval-skill-pi.sh <skill>` calls `pi --print --mode json --no-session --no-tools`. Requires skill at `~/.pi/agent/skills/fulcrum/<name>/SKILL.md`. Activation detected by word-boundary grep of JSON output against `evals/<skill>.match-words`. Run via `scripts/eval-all.sh --engine pi`.

All five agents have scriptable trigger-rate harnesses sharing the same flag interface, match-words precedence, JSONL output format, and 80/20 pass criteria. Checklist for first-install path verification at `docs/skill-smoke-test.md`.
