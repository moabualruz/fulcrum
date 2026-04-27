# Fulcrum — Handover

> Snapshot at branch `feat/agent-foundation-clean` (HEAD: see `git log -1`). Everything you need to pick up the work.

## 0. Session 2026-04-28 — progress update

This session worked the P2 backlog and shipped most of it. Net change since `991669c`:

**Added**
- `scripts/ci.ts` + `bun run ci` — local CI gate (install → tsc → test → build:all → skills lint). User opted out of GitHub Actions.
- 7 new hook test files in `src/hooks/*.test.ts` — `pm-policy`, `format`, `test-on-edit`, `audit-log`, `index-rebuild`, `index-check`, `lint-gate`. Test count went from **8 → 38**, all green.
- 27 new skills shipped (jq was already done; total now **28 of ~25** — queue cleared). Each follows the jq template: ≥7 patterns + ≥7 anti-patterns + a ~20-entry trigger eval with ≥30% negatives. Authoring done in 4 parallel batches:
  - Batch 1 (4): `gh`, `fzf` (non-interactive), `just`, `xh`
  - Batch 2 (6): `ruff`, `biome`, `gitleaks`, `watchexec`, `hyperfine`, `git-cliff`
  - Batch 3 (8): `direnv`, `mise`, `difftastic`, `bat`, `eza`, `sd`, `zoxide`, `lizard`
  - Batch 4 (9): `yq`, `ktlint`, `google-java-format`, `pmd`, `spotbugs`, `dart-toolchain`, `osv-scanner`, `flarectl`, `usql`
- `fulcrum doctor` subcommand (`src/cli/doctor.ts`) — bun version, agent dirs detection (rules-spliced check), 22 tool checks with hook-by-hook fail-open notes, policy file health, skill count.
- `LICENSE` (MIT).
- `cliff.toml` + `CHANGELOG.md` stub + `bun run changelog` script. git-cliff itself is not installed; cliff.toml is wired so a single `brew install git-cliff && bun run changelog` populates the file.

**Fixed**
- `src/utils/proc.ts:exists()` — was using `Bun.file().exists()` which silently returns `false` for directories, breaking `index-check`'s `graphify-out` probe. Now uses `node:fs/promises::stat`.
- `src/hooks/format.ts` — added `*.php → php-cs-fixer fix` row.
- `src/hooks/index-rebuild.ts` — `Promise.allSettled` rejections now surface to stderr under `FULCRUM_DEBUG` (was silent).

**Verified (no change needed)**
- `repomix --skill-generate` — confirmed real flag (introduced ~v1.10, experimental). `docs/skills.md:31` stands.
- OpenCode shim `${name}` interpolation at `shims/opencode/fulcrum.ts:33` — Bun's `$` template tag escapes interpolations as discrete args (no shell parsing); plus `ENABLED.has(name)` guard one line above further constrains the input. Safe.

**Skipped per user instruction**
- `.github/workflows/*` — user opted out of GitHub Actions. Local `bun run ci` covers the same checks.

**Manual follow-ups for the user**
- `fulcrum skills sync` was NOT run in this session (would mutate `~/.claude`, `~/.codex`, etc.). Run it locally to propagate the 4 new skills (`gh`, `fzf`, `just`, `xh`) to all 5 agents.
- `brew install git-cliff` (or `cargo install git-cliff`), then `bun run changelog` to populate CHANGELOG.md from commit history.

**Test scope note:** Hook tests spawn `bun src/index.ts hook ...` directly — they exercise the TypeScript source, not the cross-compiled binaries. Same property as the original router test.

**Added in this batch**
- `scripts/release.ts` + `bun run release vX.Y.Z [--gh]` — local release runner. Verifies clean tree + unique tag → runs `bun run ci` → updates CHANGELOG via git-cliff (skipped if not installed) → creates `chore(release): vX.Y.Z` commit → annotated tag → cross-compile → optionally `gh release create` and upload dist/*. Does NOT push (you push the commit and tag explicitly).
- `scripts/install.sh` now supports `FULCRUM_RELEASE_TAG=vX.Y.Z bash …/install.sh` to fetch a prebuilt binary via curl when no clone or Bun is available. The "Future: a 'release' branch fetches from GitHub Releases" TODO is wired.
- `README.md` rewritten — both install paths (clone-and-build + release fetch), Apple Silicon vs Intel note (no Rosetta needed; binaries are native per-arch), `fulcrum doctor`, `bun run ci`, `bun run release`, list of 28 shipped skills.

**Skill content audit + fixes (this batch's biggest find)**

Lint passes for shape; it does NOT verify content correctness. A 5-round audit pass against upstream READMEs/docs found content bugs in 13 of 28 skills (46% bug rate). Fixed in-place:

| Skill | Critical fix |
|---|---|
| `flarectl` | Env var names `CLOUDFLARE_API_*` → `CF_API_*`; removed nonexistent `user invite` subcommand. |
| `usql` | `-o FORMAT` was wrong — `-o` is OUTPUT FILE; format flags are `-J`/`-C`/`-H`/`-x`/`-G`/`-A`/`-t`. Removed unsubstantiated `$DATABASE_URL` auto-honor claim. |
| `osv-scanner` | v1 syntax → v2: `osv-scanner scan source -r .` and `osv-scanner scan image <ref>`. |
| `mise` | `mise sh` does NOT spawn a subshell — it's an alias for `mise shell` which prints export statements. Use `eval "$(mise shell ...)"` or `mise exec`. |
| `biome` | Vue/Svelte/Astro ARE supported (since v2.3.0); Markdown is parse/format-only — biome cannot lint Markdown. Updated description and skip-list. |
| `watchexec` | Debounce default is 50ms not 100ms. |
| `spotbugs` | `-output FILE` deprecated since 4.5.0 — use single-token `-xml=FILE` / `-sarif=FILE` / `-html=FILE` instead. |
| `gitleaks` | `detect`/`protect` deprecated since v8.19.0 — use `gitleaks git` / `gitleaks git --staged`. `-l` was for log-level not log-opts; use `--log-opts=`. `--source` replaced with positional path. |
| `ktlint` | `--android` flag was REMOVED in ktlint 1.0 (Sept 2023) — must configure via `.editorconfig` (`ktlint_code_style = android_studio`). |
| `dart-toolchain` | `dart analyze --format=json` doesn't exist — use `--format=machine` (pipe-delimited). `flutter format` was removed in Flutter 3.x — use `dart format`. `formatter: exclude:` is not a real config key. |
| `difftastic` | `--language` doesn't exist — flag is `--override GLOB:LANGUAGE`. |
| `lizard` | `-i N` is NOT top-N — it's an `--ignore_warnings` budget. For top-N, use `--csv | sort | head`. `-l ?` is not a query syntax. |
| `fzf` | `--literal` disables Latin-script diacritic-folding (so `café` ≠ `cafe`), NOT shell-metacharacter handling. `--no-tty` makes fzf find TTY via stderr; in `--filter` mode it's irrelevant. |
| `just` | `set dotenv-load` defaults to `false` — `.env` is NOT loaded automatically. |
| `jq` | `//` is null-or-FALSE fallback (not "null-or-empty"). `@tsv` does escape control chars (`\n\r\t\\`), unlike skill's claim. |
| `yq` | `-V` is `--version` not vars; `--argjson` and `--doc N` don't exist in mikefarah/yq — use envvar export + `strenv()`/`env()` and `select(documentIndex == N)`. |
| `google-java-format` | Flag is `--skip-removing-unused-import` (singular, not plural). JDK floor is 21 (was 11 on older 1.x lines). |
| `eza` | `--sort=version` is not a valid key; `-h` means `--header` (NOT human-readable size — eza is human by default with `-l`). |
| `zoxide` | `zoxide import --from auto` is invalid — must be `--from autojump` or `--from z`. |

Approach: 5 parallel audit-agent batches drilled into ~3-4 skills each via WebFetch on upstream README/docs. One consolidated fix-agent applied ~50 line-level edits.

**Lint also tightened** — `fulcrum skills lint` now validates that the body has all 5 required H2 sections (`When to use`, `Invocation`, `Patterns`, `Anti-patterns`, `Cross-refs`) in order, not just the frontmatter. Catches missing/reordered sections in future skills.

**New CLI subcommand:** `fulcrum skills list` — enumerates authored skills with eval-entry counts and description previews. Useful for inventory + finding skills that lack evals.

**git-cliff installed** (`brew install git-cliff`); `CHANGELOG.md` populated via `bun run changelog` for the first time.

**Still outstanding (P3 / low priority)**
- Trigger-rate evals for the 27 newly-shipped skills (Claude-Code-only via `scripts/eval-skill-claude.sh`; needs Python 3.10+ and `ANTHROPIC_API_KEY`). Lint passes for all; trigger rates not yet measured.
- Manual cross-agent smoke for the 27 new skills per `docs/skill-smoke-test.md` (only Claude Code can be auto-eval'd).
- Cutting v0.1.0: `bun run release v0.1.0 --gh` (when ready). Needs git-cliff installed for the changelog step (else it skips with a note).

Original audit follows below — kept as the historical record.

---

## 1. Current state — one-paragraph summary

Fulcrum is a multi-agent (Claude Code, Codex CLI, Gemini CLI, OpenCode, Pi CLI) developer-tooling foundation. It ships as a single Bun-compiled TypeScript binary (`fulcrum`) with eight hook-recipe subcommands, a CLI orchestrator (`init`, `install`, `hooks`, `skills`), a per-tool output-handling policy, a sentinel-block rules splicer, and a per-agent skill sync layer. The repo is on a clean branch (`feat/agent-foundation-clean`) cut from `feat/agent-memory-foundation`; **memory / PM / task-management content has been intentionally stripped**. The binary builds end-to-end (`bun build --compile`), all 8 router tests pass, the install path was smoke-tested in a scratch HOME, and `fulcrum skills sync` propagates skills to all 5 agent layouts including Gemini's extension manifest. **One skill is authored** (`jq`); 25+ are queued.

Nothing is broken. Open work falls into: documentation polish, test coverage for 7 of 8 hooks, CI + release pipeline, and the long tail of skill authoring.

## 2. Architecture

```
fulcrum (Bun binary, ~60–120MB by platform)
├── fulcrum hook <name>     — 8 subcommands invoked by agent runtimes via stdin JSON
│     • index-check, index-rebuild       (session lifecycle)
│     • format, lint-gate, test-on-edit  (PostToolUse Write|Edit)
│     • pm-policy                        (PreToolUse Bash)
│     • audit-log                        (PostToolUse Bash)
│     • tool-output-router               (PostToolUse any) — TOML-driven
│
├── fulcrum init [DIR]      — bootstrap project's AGENTS.md + .claude/CLAUDE.md
├── fulcrum install [--with-project DIR]
│                            — sentinel-splice rules, vendor snippets, seed policy
├── fulcrum hooks list/enable/disable
└── fulcrum skills sync/lint
```

**Cross-agent registration model.** Three agents (Claude Code, Codex, Gemini) call `fulcrum hook <name>` directly from their hook config files. Two agents (OpenCode, Pi) cannot register external executables — they load TS plugins/extensions in-process. For those, drop in `shims/opencode/fulcrum.ts` or `shims/pi/fulcrum.ts`; each is ~60 lines that calls `fulcrum hook <name>` per event.

**Files map:**

```
src/
├── index.ts                    # CLI dispatcher
├── types.ts                    # agent envelope + policy types
├── utils/
│   ├── io.ts                   # readHookEvent, projectSlug, stateDir, deriveTool
│   └── proc.ts                 # which, exists, run, spawnDetached
├── cli/
│   ├── init.ts                 # fulcrum init
│   ├── install.ts              # fulcrum install (sentinel splice + vendor + seed)
│   ├── hooks.ts                # fulcrum hooks list/enable/disable
│   └── skills.ts               # fulcrum skills sync/lint
└── hooks/
    ├── audit-log.ts
    ├── format.ts
    ├── index-check.ts
    ├── index-rebuild.ts
    ├── lint-gate.ts
    ├── pm-policy.ts
    ├── test-on-edit.ts
    ├── tool-output-router.ts
    └── tool-output-router.test.ts   # 8 tests, only file with coverage so far

shims/
├── README.md
├── opencode/fulcrum.ts        # OpenCode plugin (covers Crush as a starting point)
└── pi/fulcrum.ts              # Pi extension

scripts/
├── install.sh                 # thin bootstrap (detect platform → resolve binary → fulcrum install)
├── build-all.ts               # cross-compile to 5 targets
└── eval-skill-claude.sh       # wraps Anthropic's skill-creator/run_loop.py (Python 3.10+ required)

config/tool-output-policy.toml # default tier matrix for ~50 tools
hooks/recipes/*.snippet.md      # 8 per-agent registration snippets
docs/                          # context, hooks, skills, mcp, agents, capabilities,
                               #   tool-output-policy, skill-smoke-test
rules/AGENTS.md                # ~120 lines, spliced into each agent's primary rules file
skills/
├── _template/SKILL.md         # spec frontmatter + superpowers body skeleton
├── jq/SKILL.md                # ✅ shipped (#1 of 25+)
├── SOURCES.md                 # priority queue + per-tool authoring notes
└── upstream.lock              # empty schema; populates when sourcing remote skills
evals/
├── README.md                  # JSON array format + authoring guidelines
└── jq.json                    # 20 entries (12 trigger / 8 anti-trigger)
```

## 3. What works (verified end-to-end)

- `bun install` — clean install, lockfile committed.
- `bun run --bun tsc --noEmit` — type-check clean.
- `bun test` — 8 pass / 0 fail (router only).
- `bun build --compile --minify --target=bun-darwin-arm64 src/index.ts --outfile=dist/fulcrum-darwin-arm64` — 60MB binary, ~75ms compile.
- `bun run scripts/build-all.ts` — cross-compiles to all 5 targets (darwin-arm64 63MB, darwin-x64 68MB, linux-x64 102MB, linux-arm64 101MB, windows-x64 118MB).
- `bash scripts/install.sh` from a clone — detects platform, builds locally, splices rules, vendors snippets, seeds policy. Idempotent on re-run (sentinel-block replace mode preserves user content above/below the block).
- `fulcrum init <dir>` — seeds AGENTS.md (template), `.claude/CLAUDE.md` (`@AGENTS.md` import), `.gitignore` entries.
- `fulcrum hooks list` / `enable <name>` — recipe pool + per-agent registration snippet.
- `fulcrum skills lint skills/jq/SKILL.md` — passes for jq.
- `fulcrum skills sync` — fans out to all 5 agent paths including Gemini extension manifest.
- `fulcrum hook tool-output-router` — round-trip tested against the real `config/tool-output-policy.toml`.
- `fulcrum hook pm-policy` — denies `npm` / `yarn` correctly across pnpm / bun / yarn lockfile detection.

## 4. What's outstanding — sorted by priority

### P0 — blockers

None.

### P1 — alignment debt (already fixed in this commit, listed for traceability)

Doc-drift after Phase 5 (bash recipes retired) was patched in this handover commit. Specifically swept: `docs/agents.md` (7 occurrences of `~/.fulcrum/hooks/recipes/*.sh`), `docs/hooks.md` (3 lingering "bash" references), `docs/skills.md` (`scripts/lint-skill.sh` references), `docs/skill-smoke-test.md`, `docs/tool-output-policy.md`, `skills/SOURCES.md`, `config/tool-output-policy.toml` header. `skills/SOURCES.md` jq row flipped from `(to author)` to `✍️ shipped`.

Audit findings beyond drift, kept as P1 for next session:

| Item | Where | Notes |
|---|---|---|
| `repomix --skill-generate` flag | `docs/skills.md:29` | Flag not verified in any repomix release. Either confirm or strike from the catalogue. |
| OpenCode shim shell-injection surface | `shims/opencode/fulcrum.ts:33` | Template-tag `${name}` interpolation — verify OpenCode's `$` escapes safely. Hooks are first-party so risk is low, but worth confirming. |

### P2 — production-readiness (status as of 2026-04-28; see §0 for details)

| Gap | Status |
|---|---|
| 7 of 8 hooks lack tests | ✅ done — 38 tests, all green |
| No CI | ✅ done as `scripts/ci.ts` (`bun run ci`); GitHub Actions opted out |
| No release pipeline | ⏸ deferred (no auto-actions per user) |
| `format` table missing PHP/Kotlin | ✅ done — `php-cs-fixer` added; kotlin row was already ktlint |
| `index-rebuild` swallows individual task failures | ✅ done — surfaces via stderr under `FULCRUM_DEBUG` |
| Hook envelope parse failure is silent | ⏸ low priority; still `FULCRUM_DEBUG`-gated |
| No `fulcrum doctor` command | ✅ done — `src/cli/doctor.ts` |
| No LICENSE | ✅ done — MIT |
| No CHANGELOG | ✅ wired — `cliff.toml` + `bun run changelog`; user must `brew install git-cliff` to populate |

### Already applied in this commit (P2 small fixes)

- **Windows portability:** `src/hooks/index-rebuild.ts` and `src/hooks/test-on-edit.ts` now use `os.tmpdir()` (Node) instead of hardcoded `/tmp/`. Windows binary is now functional.
- **`pm-policy` yarn-on-bun gap:** added `tok("yarn") deny` to the bun branch.
- **`audit-log` import hoist:** moved `appendFile` import to module top-level (was dynamic-imported per call).
- **Dead `void` suppressors:** removed in `cli/hooks.ts`, `cli/install.ts`, `cli/skills.ts`. Unused imports cleaned up.

### P3 — nice-to-have

- README install instructions for older Macs (Rosetta).
- `bunfig.toml`: `[install.lockfile] save = true` if you want CI to assert the lockfile.
- Wrap eval runs in a just-recipe / make target with `--results-dir <dir>` for repeatable HTML reports.
- Document `bun run build:all` regenerates `dist/` from scratch.

## 5. Skill authoring queue

`skills/SOURCES.md` has the canonical priority list. Authored: `jq` (1). Pending in priority order:

1. `gh` — GitHub CLI (canonical)
2. `fzf` — non-interactive `--filter` mode
3. `just` — recipes encountered in most modern repos
4. `xh` — `--check-status`, sessions, JSON
5. `ruff` + `biome` — high-velocity 2025-2026 formatters
6. `gitleaks` — referenced from rules (security)
7. `watchexec`, `hyperfine` — refactor-loop tools
8. `direnv`, `mise` (re-author from upstream), `git-cliff`, `difftastic`
9. `bat`, `eza`, `sd`, `zoxide` — tight, <50-line skills
10. `lizard`
11. JVM stack — `ktlint`, `google-java-format`, `pmd`, `spotbugs`
12. `osv-scanner`, `usql`, `flarectl`, `dart-toolchain`

Authoring loop per skill:
1. `cp skills/_template/SKILL.md skills/<name>/SKILL.md` and fill in.
2. Author `evals/<name>.json` (≥10 entries; ≥30% `should_trigger:false`; no tool name in prompts).
3. `fulcrum skills lint skills/<name>/SKILL.md` — frontmatter check.
4. `scripts/eval-skill-claude.sh <name>` — trigger-rate measurement (Claude Code only; needs Python 3.10+ + skill-creator plugin).
5. `fulcrum skills sync` — fan out to all 5 agents.
6. Manual smoke per `docs/skill-smoke-test.md` on at least 2 agents.
7. Commit.

## 6. Decisions on the record

This is what's been decided and why. **Don't relitigate without new information.**

| Decision | Why | Where it lives |
|---|---|---|
| TypeScript via Bun, not Rust/Go | OpenCode/Pi shim is mandatory in TS regardless. Picking TS unifies the codebase and matches 3 of 5 peer-agent runtimes (Gemini, OpenCode, Pi are all TS). Rust would mean two languages. | `package.json`, all of `src/` |
| Sentinel-block rules splice | Works on every agent regardless of `@import` support; idempotent; preserves user content. | `src/cli/install.ts:7-8`, `BEGIN/END FULCRUM RULES` markers |
| Hook recipes ship as binary subcommands, not bash scripts | Phase 5 retired bash; binary is single source of truth. Snippets reference `fulcrum hook <name>`. | `src/hooks/`, `hooks/recipes/*.snippet.md` |
| Skill-fork policy | Pin upstream when author is tool-vendor / Anthropic / LF org + tagged ≤180d + permissive license. Fork on 90d silence, CVE >14d, license drift, >2 patches diverge, PR >30d unanswered. | `skills/SOURCES.md` §6, `skills/upstream.lock` |
| MCP claude.ai disable | Account-disconnect at Settings → Connectors. Escape hatch: `cachedGrowthBookFeatures.tengu_claudeai_mcp_connectors=false` in `~/.claude.json` (undocumented; may break). | `docs/mcp.md` |
| Project bootstrap split | `fulcrum init <dir>` is the dedicated subcommand. `install.sh --with-project DIR` calls it. | `src/cli/init.ts`, `scripts/install.sh` |
| Skill verification tiered | skill-creator's `run_loop.py` for Claude Code (3× sampled trigger rate, 60/40 split). Lint everywhere on all 5 agents. Manual smoke for Codex/Gemini/OpenCode/Pi. | `scripts/eval-skill-claude.sh`, `docs/skill-smoke-test.md` |
| Authoring template | Spec-compliant frontmatter (`name` ≤64 lower+digits+hyphens, `description` ≤1024 third-person trigger sentence). Body: When to use / Invocation / Patterns / Anti-patterns / Cross-refs (superpowers shape). | `skills/_template/SKILL.md` |
| Default tool-output tier | `leave-as-is`. Never blanket-truncate. Per-tool overrides only. | `config/tool-output-policy.toml`, `docs/tool-output-policy.md` |
| Vetoed hook recipes | Block-destructive-bash (5.4), secret-scan (5.5), protected-paths (5.6), MCP truncation (5.8), long-session-notify (5.10) were intentionally removed. | `docs/hooks.md` (no longer references them) |
| Removed memory/PM/task layer | This branch is `feat/agent-foundation-clean` — memory, vault, ADRs, Plane, PM concerns belong on `feat/agent-memory-foundation`. | Branch separation |

## 7. Smoke-test recipes (to verify after future changes)

Always run from repo root with `PATH="$HOME/.bun/bin:$PATH"` if Bun isn't already on PATH.

```bash
# 1. Type + tests
bun run --bun tsc --noEmit
bun test

# 2. Build all platform binaries
bun run scripts/build-all.ts

# 3. Install end-to-end into a scratch HOME (non-destructive)
SCRATCH=$(mktemp -d)
HOME=$SCRATCH PATH="$SCRATCH/.local/bin:$HOME/.bun/bin:$PATH" mkdir -p \
  $SCRATCH/.local/bin $SCRATCH/.claude $SCRATCH/.codex \
  $SCRATCH/.config/opencode $SCRATCH/.pi/agent $SCRATCH/.gemini
echo "PRE-EXISTING USER CONTENT" > $SCRATCH/.claude/CLAUDE.md
HOME=$SCRATCH PATH="$SCRATCH/.local/bin:$HOME/.bun/bin:$PATH" \
  bash scripts/install.sh
HOME=$SCRATCH PATH="$SCRATCH/.local/bin:$PATH" fulcrum hooks list
HOME=$SCRATCH PATH="$SCRATCH/.local/bin:$PATH" fulcrum hooks enable format
head -3 $SCRATCH/.claude/CLAUDE.md   # confirm user content preserved
rm -rf $SCRATCH

# 4. Quick hook spot-checks (binary vs golden output)
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"fd -e ts"},"tool_response":{"stdout":"hello","exit_code":0}}' \
  | FULCRUM_POLICY=$PWD/config/tool-output-policy.toml bun run src/index.ts hook router
# expected: "hello" (raw tier for fd)

SCRATCH=$(mktemp -d) && touch $SCRATCH/pnpm-lock.yaml
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"npm install"}}' \
  | CLAUDE_PROJECT_DIR=$SCRATCH bun run src/index.ts hook pm-policy
# expected: stderr "pm-policy: this repo uses pnpm — replace 'npm' with 'pnpm'"; exit 2
rm -rf $SCRATCH
```

## 8. Known limitations

- **Trigger-rate eval is Claude-Code-only.** No equivalent harness exists for Codex / Gemini / OpenCode / Pi. The 4 other agents rely on `docs/skill-smoke-test.md` manual checklist. Documented honestly at `docs/skills.md` §7.
- **OpenCode is archived** (2025-09-18). Successor: Charm's Crush. `shims/opencode/fulcrum.ts` is written against last-stable OpenCode; Crush's plugin contract may differ. Recipe wiring is identical against either; only the outer event-handler shape changes.
- **Pi has no MCP support.** Tier rules in `tool-output-policy.toml` keyed `mcp__*` will never fire on Pi. Documented in `docs/agents.md` §5.6.
- **Eval harness needs Python 3.10+** (`scripts/eval-skill-claude.sh`). macOS ships 3.9. `brew install python@3.12` or `mise use -g python@3.12`.
- **`dist/` is regenerated, gitignored.** No prebuilt binaries are committed; `bun run scripts/build-all.ts` rebuilds. Until release pipeline ships, every fresh clone needs Bun to run `install.sh`.

## 9. Recommended next-action sequence

In order. Each item is a single committable unit.

1. **Add CI** (~30 min). `.github/workflows/ci.yml` — bun setup, install, tsc, test, lint skills, build-all sanity. Catches type/test regressions.
2. **Author tests for the 7 untested hooks** (~2 hr total). Mirror `tool-output-router.test.ts`. Prioritize `pm-policy`, `format`, `test-on-edit` first.
3. **Author skill #2 (`gh`)** (~1.5 hr) — full loop: SKILL.md → evals/gh.json → lint → eval (if Python 3.10+ available) → sync → smoke.
4. **Release pipeline** (~1 hr). `.github/workflows/release.yml` on tag push. Update `install.sh` to fetch from releases when no clone is present.
5. **`fulcrum doctor`** (~30 min). Surfaces missing deps, hook markers, policy file health, agent dirs detected.
6. **Author skills #3-#5 (`fzf`, `just`, `xh`)** (~4 hr). Highest-friction queue items.
7. **Crush shim** — gated on Crush plugin docs being stable. Copy OpenCode shim, rename event names per Crush docs.
8. **Long tail of skill authoring** — work the queue at `skills/SOURCES.md`. Goal: 10 authored before turning attention to JVM/niche tools.

## 10. Branch + commit map

`feat/agent-foundation-clean` is **15 commits** ahead of `feat/agent-memory-foundation`. The plus-one commit for this handover writes the doc-drift sweep, P2 portability fixes, and this file.

```
HEAD                                                                      ← this commit
ad3ab30  feat(rewrite): Phase 6 — TS shims for OpenCode and Pi
15f6983  feat(rewrite): Phase 5 — retire bash recipes, snippets point at binary
bbea414  feat(rewrite): Phase 4 — thin install.sh + cross-compile + retire bash
5a3d658  feat(rewrite): Phase 3 — orchestrator subcommands in TypeScript
3b12ff2  feat(rewrite): Phase 2 — port 7 hook recipes to TypeScript
3b8bc4e  feat(rewrite): Phase 1 — Bun/TypeScript scaffold + tool-output-router port
6a7884c  feat(skills): author jq skill #1; fix bash 3.2 + py3.10 requirements
75870cc  chore(foundation): hardening pass before skill authoring
ccb68a5  feat(foundation): authoring policy, fork triggers, MCP disconnect, verification
e70e40e  feat(hooks): ship recipes + tool-output-router driven by per-tool policy
8a7b1a5  feat(foundation): sentinel-block install, fulcrum CLI, sync-skills, skill lint, template
e8da3d5  docs(foundation): one-tool-one-skill policy + author queue + missing rules
d4d4579  refactor(foundation): wire rules + hooks for all five agents
ecb8982  docs(foundation): deepen rules, hooks, and skill sources from primary research
2c7057d  feat(foundation-clean): strip memory/PM/task layers from foundation
```

Branch is **not pushed**. No PR opened. When you're ready: `git push -u origin feat/agent-foundation-clean` and open a PR against `main`.

## 11. Where to start

If you have **15 minutes**: read `README.md`, this file, then run the smoke-test in §7.4.

If you have **2 hours**: P2 #1 (CI) and P2 #2 (a couple of hook tests). Cheap wins, big confidence boost.

If you have **a half-day**: author skill #2 (`gh`). The loop forces you to exercise lint + sync + smoke-test on a real second skill, will surface anything still rough.

If you have **a week**: cycle through skills #2-#5 + ship CI + release pipeline. By the end the foundation is genuinely production-grade.
