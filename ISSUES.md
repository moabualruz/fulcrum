# Issues: Skill Context Budget And Publish Hygiene

Investigation date: 2026-04-30

Local cleanup already done:

- Removed generated backup folder `/Users/mkh/.codex/skills.disabled`.
- Rebuilt generated Fulcrum skill mirrors from `/Users/mkh/workspace/fulcrum/skills` using `rsync --delete`.
- Active generated agent mirrors now contain 29 skills each for Codex, OpenCode, Pi, Gemini, Claude cache, and Claude marketplace install path.
- Codex-visible `SKILL.md` count is 72 again after reseeding `~/.codex/skills/fulcrum`; ISS-001 remains the root-cause fix for that context pressure.
- CLI agent folders under `$HOME` exclude `*.original.md`, `_template`, and `_archive`. Repo project folders keep `.original.md` source backups.
- No repo worktrees deleted. `.claude/worktrees/festive-margulis-b150d7` has an unpushed/divergent branch, so removal is unsafe without explicit review.

Codex settings research:

- OpenAI Codex skills docs say the model-visible initial skill list is capped at roughly 2% of the model context window, or 8,000 characters when the context window is unknown. The full `SKILL.md` is still read when a skill is selected. Source: <https://developers.openai.com/codex/skills>.
- OpenAI Codex config reference documents `model_context_window` and `skills.config`; it does not document a direct `skills_context_budget` or equivalent knob. Source: <https://developers.openai.com/codex/config-reference>.
- OpenAI Codex source currently defines `DEFAULT_SKILL_METADATA_CHAR_BUDGET = 8_000` and `SKILL_METADATA_CONTEXT_WINDOW_PERCENT = 2`, deriving the budget from the context window when known. Source: <https://github.com/openai/codex/blob/main/codex-rs/core-skills/src/render.rs>.
- Local empirical check with `codex debug prompt-input`: default, `model_context_window=1000000`, and `model_context_window=10000000` rendered the same 24,017-character skills block; `model_context_window=100000` reduced it to 10,339 characters. Treat `model_context_window` as an indirect model-context override, not a reliable fix for global skill bloat.

## ISS-001: Fulcrum authored skills are installed globally into Codex by default

Evidence:

- Before cleanup, Codex saw 72 skill metadata files from `~/.codex/skills` plus `~/.codex/plugins/cache`.
- `~/.codex/skills/fulcrum` contributed 29 skills and 6,789 description characters.
- Current repo has no `.codex/skills` project-local skill folder. Warning came from global user skill discovery, not project-local skills.
- `src/cli/skills.ts` mirrors every authored skill to `~/.codex/skills/fulcrum/<name>/`.
- `src/cli/install.ts` runs authored skill sync during `fulcrum install` unless `--no-skills` is passed.

Root cause:

- Global user install is the default behavior for Codex.
- There is no budget guard, scope flag, or project-local install mode for Codex authored skills.
- Codex loads global skill descriptions in every session, so Fulcrum increases skill metadata pressure in unrelated repos.

Failing test to write first:

- In `src/cli/skills.test.ts`, create temp `HOME` with `.codex/` present.
- Run `syncSkills({ dryRun: true })`.
- Assert default output does not target `<home>/.codex/skills/fulcrum`.
- Assert an explicit opt-in path, for example `syncSkills({ dryRun: true, codexScope: "global" })`, does target `<home>/.codex/skills/fulcrum`.

Expected fix:

- Make Codex authored skill sync opt-in for global user scope.
- Add a project-local mode that targets `.codex/skills/fulcrum` when a consumer repo explicitly asks for project skills.
- Keep `fulcrum install --no-skills` behavior, but do not require users to know this flag to avoid global metadata bloat.

## ISS-002: `syncSkills` caches `HOME` at module load

Evidence:

- `src/cli/skills.ts` defines `_skillsHome` and `TARGETS` at module scope.
- `syncSkills()` later reads runtime `HOME` for Claude Code, but Codex/OpenCode/Pi targets are already bound to the earlier `HOME`.
- Gemini also uses `_skillsHome` inside `syncSkills()`.
- Existing tests import `syncSkills` before changing `process.env.HOME`, so dry-run coverage can miss wrong target paths.

Root cause:

- Environment-dependent paths are computed once at import time instead of inside the command execution path.

Failing test to write first:

- In `src/cli/skills.test.ts`, import `syncSkills`, then set `process.env.HOME` to a temp directory with `.codex/`, `.config/opencode/`, `.pi/agent/`, and `.gemini/`.
- Run `syncSkills({ dryRun: true })`.
- Assert all logged target paths use the temp `HOME`, never the real user home.

Expected fix:

- Replace module-scope `TARGETS` and `_skillsHome` with a function that computes targets from current runtime `HOME`.
- Keep path computation centralized so tests can assert all agents use the same home value.

## ISS-003: Claude plugin/package publish surface can contain stale or non-package files

Evidence:

- Local Claude marketplace cache previously contained Fulcrum repo state under `~/.claude/plugins/marketplaces/fulcrum/`, including `.claude/worktrees/...`; the generated cache was pruned during cleanup.
- `plugins/fulcrum/skills/subagent-orchestration/` contains six tracked `.original.md` files, which should remain in the project source tree but must not be copied into CLI agent folders.
- `src/cli/skills.ts` `refreshClaudePluginPackage()` copies current skills into Claude cache paths but does not prune stale files already present.
- Existing `src/cli/skills.test.ts` only checks skill directory names, not package file cleanliness or content equality.

Root cause:

- Publish/package boundary is not enforced by tests.
- Plugin package can drift from authored `skills/`.
- Local marketplace/cache refresh is additive, so old files can remain after source layout changes.

Failing test to write first:

- Add package integrity tests that walk `plugins/fulcrum`.
- Assert no `.original.md`, `_archive`, `_template`, `.claude`, `.git`, `node_modules`, or worktree paths exist inside generated CLI agent folders and final publish artifact.
- Assert each packaged non-original file under generated CLI agent folders exactly matches `skills/<name>`.
- Add a refresh test with a stale file pre-created in cache; assert refresh removes it.

Expected fix:

- Build plugin package from `skills/` via a pruning sync, not manual copies.
- Exclude human-source backups from generated agent folders and published plugin payloads, while keeping them in project source.
- Prune stale cache/package files before copying fresh files.

## ISS-004: Project-local `.claude/worktrees` hides dirty and stale worktrees

Evidence:

- `.claude/worktrees/component-ledger` is a registered worktree at detached `HEAD` and has untracked `src/components/`.
- `.claude/worktrees/festive-margulis-b150d7` is branch `festive-margulis-b150d7`, `ahead 784, behind 105`.
- Worktree sizes: `component-ledger` 33M, `festive-margulis-b150d7` 50M.
- `.gitignore` ignores `.claude/`, so this state is easy to miss.

Root cause:

- Worktrees were placed inside this repo's ignored `.claude/` directory.
- Current tooling/docs recommend external worktrees in some places, but no guard catches project-local ignored worktrees before publish/sync.

Failing test to write first:

- Add a doctor test that creates `.claude/worktrees/<name>` inside a temp repo.
- Assert `doctor --json` reports a warning for project-local ignored worktree roots.
- Add a human doctor output assertion that names `.claude/worktrees`.

Expected fix:

- Teach `doctor` to warn about project-local agent worktree roots.
- Prefer `~/.config/superpowers/worktrees/<project>/...` or another external root for generated worktrees.
- Add cleanup guidance that refuses removal when a worktree is dirty, untracked, or branch-divergent.

## ISS-005: `fulcrum install` does too much global mutation by default

Evidence:

- `fulcrum install` currently splices rules, installs caveman, syncs authored skills, syncs upstream skills, installs vendor capability packages, and registers MCPs unless flags opt out.
- `~/.codex/config.toml` now has many Fulcrum MCP blocks.
- After moving Fulcrum authored skills away, Codex still sees 43 skill metadata files from system, superpowers, caveman, Cloudflare, Semgrep, Repomix, Playwright, and plugin cache sources.

Root cause:

- Install defaults are optimized for full bootstrap, not minimal development or low-context agent sessions.
- There is no first-class "minimal" profile that avoids global skills and optional vendor packages.

Failing test to write first:

- Add `install --dry-run --profile minimal` or equivalent test.
- Assert minimal mode does not call authored skill sync, upstream skill sync, vendor capability package install, or optional MCP registration.
- Assert full mode keeps current behavior behind an explicit profile or flag.

Expected fix:

- Add install profiles such as `minimal`, `rules-only`, and `full`.
- Make global skill/package installs explicit in docs and CLI output.
- Keep backwards compatibility through a transition warning if needed.

## ISS-006: `doctor` does not show actual agent skill budget pressure

Evidence:

- `doctor --json` reports `skillsCount: 29`, which is the repo-authored skill count.
- It does not report Codex-visible active skill count, total description characters, largest descriptions, duplicate names, or source roots.
- The user-facing context warning was not explainable from `doctor` alone.

Root cause:

- Doctor validates Fulcrum source state, but not runtime skill-discovery pressure per agent.

Failing test to write first:

- In `src/cli/doctor.test.ts`, create temp Codex skill roots with several `SKILL.md` files and known description lengths.
- Run doctor JSON against temp `HOME`.
- Assert output includes Codex active skill count, total description characters, source root breakdown, and top longest descriptions.

Expected fix:

- Add a `skillBudget` section to `doctor --json`.
- Add human doctor output that warns when active skill metadata exceeds a configured threshold.
- Use the same scanner in `fulcrum skills list --installed` so users can inspect what the agent will load.
