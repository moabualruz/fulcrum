# Skills

> Skills teach agents *when and how* to use CLI tools. Without a skill, agents invent broken invocations or miss the right tool entirely.

## 1. Per-agent paths

Each agent uses its own native skills directory. Do not use a shared `~/.agents/` folder — it pollutes every agent's context with skills that may not apply.

Fulcrum-authored skills install under `fulcrum/` (we own that namespace). Curated upstream skills install where the vendor's own per-agent installer would put them — top-level `<agent>/skills/<name>/`. Fulcrum does not own a namespace for skills it did not author. Custom user skills sit alongside and are not touched by sync/uninstall except explicit Fulcrum-managed paths.

| Agent | Fulcrum-authored path | Curated upstream path | Custom user skills path |
|---|---|---|---|
| Claude Code | `~/.claude/skills/fulcrum/<name>/SKILL.md` | `~/.claude/skills/<name>/SKILL.md` | `~/.claude/skills/<name>/SKILL.md` |
| Codex CLI | `~/.codex/skills/fulcrum/<name>/SKILL.md` | `~/.codex/skills/<name>/SKILL.md` | `~/.codex/skills/<name>/SKILL.md` (user) · `.codex/skills/<name>/SKILL.md` (project) |
| Gemini CLI | `~/.gemini/extensions/fulcrum-skills/skills/<name>/SKILL.md` | `~/.gemini/skills/<name>/SKILL.md` | `~/.gemini/extensions/<other>/skills/<name>/SKILL.md` |
| OpenCode | `~/.config/opencode/skills/fulcrum/<name>/SKILL.md` | `~/.config/opencode/skills/<name>/SKILL.md` | `~/.config/opencode/skills/<name>/SKILL.md` |
| Pi CLI | `~/.pi/agent/skills/fulcrum/<name>/SKILL.md` | `~/.pi/agent/skills/<name>/SKILL.md` | `~/.pi/agent/skills/<name>/SKILL.md` (user) · `.pi/skills/` (project) |

`fulcrum skills sync` propagates authored `skills/<name>/SKILL.md` from the repo to every agent's `<skills-root>/fulcrum/` subfolder. `fulcrum skills upstream` clones curated upstream repos into `~/.fulcrum/cache/upstream-skills` and propagates selected skills to the vendor's own placement convention — top-level `<agent>/skills/<name>/`. **Agents themselves still load by frontmatter `name:`** — the namespacing is path-based and recursive scans pick skills up regardless of depth.

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

The colon-prefix invocation pattern (`fulcrum:jq`) is reserved for the future plugin / extension layer; today's agents resolve skills by frontmatter `name:` only.

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
3. **Codex trigger-rate eval:** `scripts/eval-skill-codex.sh <skill> --model <codex-model>` calls `codex exec --json --ephemeral` against installed `~/.codex/skills/fulcrum/<skill>`. Use this when Codex skill loading or description-budget behavior changes. Keep model explicit in result notes. Long samples can stall; pass `--timeout-seconds N` or set `CODEX_EVAL_TIMEOUT_SECONDS`.
4. **Manual smoke on the other 3:** for Gemini run `gemini extensions link <ext>` + `--debug`; for OpenCode copy the trigger phrase into a fresh session; for Pi invoke `/skill:<name>` directly. Checklist template at `docs/skill-smoke-test.md`.

Claude and Codex have scriptable trigger-rate measurement. Gemini/OpenCode/Pi remain smoke-tested until they expose stable JSON event streams.
