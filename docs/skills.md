# Skills

> Skills teach agents *when and how* to use CLI tools. No skill, agents invent broken invocations or miss right tool.

## 1. Per-agent paths

Each agent use own native skills directory. No shared `~/.agents/` folder — pollute every agent context with skills may not apply.

Fulcrum-managed skills install under `fulcrum/` subfolder so address space match `fulcrum:<skill-name>` prefix convention used by plugin/extension systems. Custom user skills sit alongside (flat or own namespace) — `fulcrum skills sync` no touch them.

| Agent | Fulcrum-managed skills path | Custom user skills path |
|---|---|---|
| Claude Code | `~/.claude/skills/fulcrum/<name>/SKILL.md` | `~/.claude/skills/<name>/SKILL.md` |
| Codex CLI | `~/.codex/skills/fulcrum/<name>/SKILL.md` | `~/.codex/skills/<name>/SKILL.md` (user) · `.codex/skills/<name>/SKILL.md` (project) |
| Gemini CLI | `~/.gemini/extensions/fulcrum-skills/skills/<name>/SKILL.md` (extension is the namespace) | `~/.gemini/extensions/<other>/skills/<name>/SKILL.md` |
| OpenCode | `~/.config/opencode/skills/fulcrum/<name>/SKILL.md` | `~/.config/opencode/skills/<name>/SKILL.md` |
| Pi CLI | `~/.pi/agent/skills/fulcrum/<name>/SKILL.md` | `~/.pi/agent/skills/<name>/SKILL.md` (user) · `.pi/skills/` (project) |

`fulcrum skills sync` propagate `skills/<name>/SKILL.md` from repo to every agent `<skills-root>/fulcrum/` subfolder. `fulcrum/` segment = convention; **agents still load by frontmatter `name:`** — namespacing path-based, recursive scans pick skill regardless of depth. Prefix exist for forward-compat: when fulcrum plugin/extension layer ship, install shape already match how third-party content namespaced in agent ecosystems.

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

> `repomix` skill: `repomix --skill-generate <name> --skill-output <agent-skills-path>/<name>` generate SKILL.md from any packed output.

## 3. Adoption strategy — install one, cherry-pick the rest

**Strategy: install one as cross-agent distribution platform, cherry-pick skills and patterns from rest.**

### Install: superpowers (obra/superpowers)

Only candidate with real, working cross-agent installers (`.claude-plugin/`, `.codex-plugin/`, `.opencode/`, `gemini-extension.json`, `.cursor-plugin/`).

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

## 7. Verification

Tiered:

1. **Lint everywhere (CI):** `fulcrum skills lint skills/` validate every authored skill on strictest frontmatter union. Cheap; catch 80% of cross-agent failures.
2. **Claude trigger-rate eval:** `scripts/eval-skill-claude.sh <skill>` calls `claude --print --output-format=json --no-session-persistence` per query. Auth via Claude Code keychain — no `ANTHROPIC_API_KEY` env var. Eval set at `evals/<skill>.json` (~20 entries, ~12/8 trigger/anti-trigger split). Leaderboard runner at `scripts/eval-all.sh`.
3. **Codex trigger-rate eval:** `scripts/eval-skill-codex.sh <skill> --model <codex-model>` calls `codex exec --json --ephemeral` against installed `~/.codex/skills/fulcrum/<skill>`. Use when Codex skill loading or description-budget behavior changes. Keep model explicit in result notes.
4. **Manual smoke on other 3:** Gemini run `gemini extensions link <ext>` + `--debug`; OpenCode copy trigger phrase into fresh session; Pi invoke `/skill:<name>` directly. Checklist template at `docs/skill-smoke-test.md`.

Claude and Codex have scriptable trigger-rate measurement. Gemini/OpenCode/Pi remain smoke-tested until stable JSON event streams exist.
