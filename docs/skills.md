# Skills

> Skills teach agents *when and how* to use CLI tools. No skill, agents invent broken invocations or miss right tool.

## 1. Per-agent paths

Each agent use own native skills directory. No shared `~/.agents/` folder — pollute every agent context with skills may not apply.

Fulcrum-authored skills install under `fulcrum/`. Curated upstream skills install under `fulcrum-upstream/`. Both are managed namespaces; custom user skills sit alongside (flat or own namespace) and are not touched by sync/uninstall except explicit Fulcrum-managed paths.

| Agent | Fulcrum-authored path | Curated upstream path | Custom user skills path |
|---|---|---|---|
| Claude Code | `~/.claude/skills/fulcrum/<name>/SKILL.md` | `~/.claude/skills/fulcrum-upstream/<name>/SKILL.md` | `~/.claude/skills/<name>/SKILL.md` |
| Codex CLI | `~/.codex/skills/fulcrum/<name>/SKILL.md` | `~/.codex/skills/fulcrum-upstream/<name>/SKILL.md` | `~/.codex/skills/<name>/SKILL.md` (user) · `.codex/skills/<name>/SKILL.md` (project) |
| Gemini CLI | `~/.gemini/extensions/fulcrum-skills/skills/<name>/SKILL.md` | `~/.gemini/extensions/fulcrum-upstream-skills/skills/<name>/SKILL.md` | `~/.gemini/extensions/<other>/skills/<name>/SKILL.md` |
| OpenCode | `~/.config/opencode/skills/fulcrum/<name>/SKILL.md` | `~/.config/opencode/skills/fulcrum-upstream/<name>/SKILL.md` | `~/.config/opencode/skills/<name>/SKILL.md` |
| Pi CLI | `~/.pi/agent/skills/fulcrum/<name>/SKILL.md` | `~/.pi/agent/skills/fulcrum-upstream/<name>/SKILL.md` | `~/.pi/agent/skills/<name>/SKILL.md` (user) · `.pi/skills/` (project) |

`fulcrum skills sync` propagate authored `skills/<name>/SKILL.md` from repo to every agent `<skills-root>/fulcrum/` subfolder. `fulcrum skills upstream` clones curated upstream repos into `~/.fulcrum/cache/upstream-skills` and propagates selected skills to `fulcrum-upstream/`. **Agents still load by frontmatter `name:`** — namespacing is path-based and recursive scans pick skills up regardless of depth.

### 1.1 Vendor-canonical install vs `fulcrum-upstream/` mirror

When an upstream skill ships its own per-agent installer (e.g. `graphify install --platform <agent>`), the vendor's canonical write into the agent's top-level skills directory (`~/.gemini/skills/graphify/`, `~/.config/opencode/skills/graphify/`, etc.) is the source of truth. To prevent dupe-load conflicts ("Skill conflict detected" warnings), the lockfile entry declares which agents the vendor handles:

```toml
[skills.graphify]
…
vendor_canonical_agents = ["claude-code", "codex", "gemini", "opencode"]
```

`fulcrum skills upstream` then **skips** writing `<agent>/skills/fulcrum-upstream/graphify/` for any agent in that list. For agents NOT in the list (here: pi — graphify CLI doesn't support pi), the fulcrum-upstream mirror still runs as the fallback so the skill is available across every detected agent.

`fulcrum install` follows up with two cleanup passes:
- `pruneVendorCanonicalDupes` — removes `<agent>/skills/fulcrum-upstream/<name>/` entries that earlier installs created when the sync ran unconditionally for every agent.
- `removeAgentsSharedDir` — recursively deletes `~/.agents/` if a third-party installer wrote there in violation of the per-agent rule.

## 2. Skill catalogue (general-purpose)

| Skill | Teaches |
|---|---|
| `ast-grep` | YAML rule format, meta-variables, structural patterns |
| `graphify` | When to build graph, how to query it |
| `context7-cli` | Two-step library lookup |
| `tavily-*` (7 skills) | Search, deep research, extract |
| `playwright-cli` | snapshot, screenshot, open, fill |
| `think` | Structured reasoning — `/think` trigger |
| `anthropics/skills` | Document work, webapp testing, mcp-builder, skill-creator |

> `repomix` is an authored-skill candidate, not an upstream install target yet. Treat it as `skills/repomix/` work once we have a clean foldered skill layout.

## 3. Adoption strategy — install one, cherry-pick the rest

**Strategy: install filesystem skill folders as the cross-agent distribution layer, cherry-pick skills and patterns from the others.**

Current CLI support: `fulcrum install` runs both authored sync and curated upstream sync by default. It does not call native plugin or extension installers in this branch. Use `fulcrum install --no-upstream-skills` to skip networked upstream sync, or run `fulcrum skills upstream` later.

### Install: superpowers (obra/superpowers)

Source repo with useful skill ideas, but Fulcrum does not invoke its native installers in this branch. Any adopted pieces must be mirrored into the filesystem skill namespace.

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

Colon-prefix invocation pattern (`fulcrum:jq`) reserved for future plugin/extension layer; today agents resolve skills by frontmatter `name:` only.

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

As of 2026-04-28 audit: 27 entries total (20 pre-audit + 7 new cloudflare skills). The 7 new cloudflare entries (`cloudflare-agents-sdk`, `cloudflare-platform`, `cloudflare-email-service`, `cloudflare-durable-objects`, `cloudflare-sandbox-sdk`, `cloudflare-web-perf`, `cloudflare-workers-best-practices`) do not have `subpath_sha256` yet — run `fulcrum skills upstream --update-pins` against the pinned tree SHA to compute and record them. All 20 pre-audit entries remain pinned.

## 7. Verification

Tiered:

1. **Lint everywhere (CI):** `fulcrum skills lint skills/` validate every authored skill on strictest frontmatter union. Cheap; catch 80% of cross-agent failures.
2. **Claude trigger-rate eval:** `scripts/eval-skill-claude.sh <skill>` calls `claude --print --output-format=json --no-session-persistence` per query. Auth via Claude Code keychain — no `ANTHROPIC_API_KEY` env var. Eval set at `evals/<skill>.json` (~20 entries, ~12/8 trigger/anti-trigger split). Leaderboard runner at `scripts/eval-all.sh --engine claude`.
3. **Codex trigger-rate eval:** `scripts/eval-skill-codex.sh <skill> --model <codex-model>` calls `codex exec --json --ephemeral` against installed `~/.codex/skills/fulcrum/<skill>`. Use when Codex skill loading or description-budget behavior changes. Keep model explicit in result notes. Long samples can stall; pass `--timeout-seconds N` or set `CODEX_EVAL_TIMEOUT_SECONDS`.
4. **Gemini trigger-rate eval:** `scripts/eval-skill-gemini.sh <skill>` calls `gemini -p "<query>" --output-format json --yolo`. Requires skill at `~/.gemini/extensions/fulcrum-skills/skills/<name>/SKILL.md` and extension linked (`gemini extensions link`). Activation detected by word-boundary grep of stdout+stderr against `evals/<skill>.match-words`. Run via `scripts/eval-all.sh --engine gemini`.
5. **OpenCode trigger-rate eval:** `scripts/eval-skill-opencode.sh <skill>` calls `opencode run --format json`. Requires skill at `~/.config/opencode/skills/fulcrum/<name>/SKILL.md`. Activation detected by word-boundary grep of JSON event stream against `evals/<skill>.match-words`. Run via `scripts/eval-all.sh --engine opencode`.
6. **Pi trigger-rate eval:** `scripts/eval-skill-pi.sh <skill>` calls `pi --print --mode json --no-session`. Requires skill at `~/.pi/agent/skills/fulcrum/<name>/SKILL.md`. Activation detected by word-boundary grep of JSON output against `evals/<skill>.match-words`. Run via `scripts/eval-all.sh --engine pi`.

All five agents have scriptable trigger-rate harnesses sharing the same flag interface, match-words precedence, JSONL output format, and 80/20 pass criteria. Checklist for first-install path verification at `docs/skill-smoke-test.md`.
