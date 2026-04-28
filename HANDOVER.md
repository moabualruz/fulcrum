# Fulcrum — Handover

> Snapshot at branch `feat/agent-foundation-clean` (HEAD: `f92d6c7` + uncommitted §6.1 + post-§6.1 polish). Forward-looking only — historical event logs have been pruned. For archaeology, see `git log` and the per-commit messages.

## 0. Destination

**Fulcrum is a local-first CLI Agent OS for supervising repositories, tasks, agent runs, context, memory, and artifacts.**

Today the foundation layer is in place. The supervisor / task system / agent runs / context engine / memory / artifacts / plugins layers are placeholders, not implementations. See `AGENTS.md` for the trajectory framing.

---

## What landed this session (§6.1 — Caveman compression)

All five §6.1 steps are **COMPLETE**. Key files changed:

- **`src/cli/install.ts`** — new steps 4 + 5: per-agent caveman install (Claude Code plugin, Gemini extension, clone-once + copy for Codex/OpenCode/Pi), `lockCavemanUltra()` writes `~/.config/caveman/config.json`, `assertNotAgentsPath()` hard guard throws if any path resolves under `~/.agents/`.
- **`src/cli/install.test.ts`** — 9 new tests (47 total passing). Added alongside the existing install tests.
- **`src/cli/doctor.ts`** — new "Caveman (per-agent compression)" section between "Agents detected" and "Tools" (~46 LOC added; 229 lines total).
- **`rules/AGENTS.md`** — §0b rule added (caveman ultra always-on, verbatim preservation, opt-out, auto-clarity). Split: install table + project-specific paths moved to project `AGENTS.md`; `rules/AGENTS.md` is now 90 lines of pure behavioral rules.
- **`AGENTS.md`** — new "## Cross-agent rules distribution" section (install table + project-specific paths from the split above).
- **28 `skills/<name>/SKILL.md`** + `rules/AGENTS.md` + `AGENTS.md` + `skills/SOURCES.md` + 8 `docs/*.md` — all compressed via the caveman python CLI (calls `claude --print`, no API key). `.original.md` siblings saved beside each as the pre-compression human-edit form. Frontmatter (`description:` field) preserved verbatim — lint passes 28/28. Skipped intentionally: HANDOVER.md (next-session pickup), README.md (public-facing).
- **Doc drift fixes:** `docs/agents.md` 3 stale flat skill paths → namespaced `~/<agent>/skills/fulcrum/<name>/`; `docs/skills.md` line 102 stale `run_loop.py`/Anthropic-SDK reference → current `claude --print` harness; `docs/skill-smoke-test.md` "(when available)" qualifier removed.
- **`scripts/eval-all.sh` bug fixes:** line 71 `$RUNS_` unbound-var → `${RUNS}_`; lines 96–97 gawk-only `awk match()` → portable grep+sed parse; new `--regenerate-only` flag rewrites `leaderboard.md` from existing `summary.txt` files without rerunning evals.

**CI state at end of §6.1:** `bun run ci` green — install / typecheck / test (47 pass) / build:all (5 platforms) / skills:lint (28/28).

**HEAD pending: §6.1 caveman integration; not yet committed.**

---

## What also landed (post-§6.1 scope)

All items below are approved retroactively. Branch still uncommitted.

1. **Hook envelope parse failure logging** — `src/utils/io.ts` `readHookEvent()` now emits `fulcrum hook <name>: envelope parse failed (<reason>): <first-80-chars>` to stderr unconditionally on JSON-parse failure; `FULCRUM_DEBUG` retains verbose logs in addition; `FULCRUM_HOOK_NAME` env var threads the hook name into the log. Tests: `src/utils/io.test.ts` (9 cases) + extensions to `src/hooks/format.test.ts` and `src/hooks/test-on-edit.test.ts`.

2. **Per-skill match-words override** — `scripts/eval-skill-claude.sh` reads `evals/<skill>.match-words` if present (one word/phrase per line, `#` comments + blanks ignored). Precedence: `--match-words` CLI flag > `evals/<skill>.match-words` file > auto-derived defaults. Header comment block updated. No `.match-words` files authored yet — affordance only.

3. **Gemini doctor false-positive fix** — `src/cli/doctor.ts` `agentDirs` now points Gemini's `rulesFile` at `~/AGENTS.md` (where the sentinel actually lives via `@AGENTS.md` import) instead of `~/.gemini/GEMINI.md` (the single-line shim). Doctor now correctly reports `Gemini CLI ✓ rules spliced`.

4. **`lockCavemanUltra` exported + tested** — 5 new tests at `src/cli/install.test.ts` covering fresh install, idempotency, overwrite-non-ultra, malformed JSON recovery, XDG_CONFIG_HOME variant. Function is now `export async function`.

5. **Doctor surfaces caveman defaultMode** — `src/cli/doctor.ts` "Caveman" section adds a final line: `defaultMode: <mode> (env|file|default|malformed)`. Resolution order: env `CAVEMAN_DEFAULT_MODE` > `${XDG_CONFIG_HOME:-$HOME/.config}/caveman/config.json` > "full" default. Warns if not "ultra".

6. **`fulcrum install --dry-run`** — `src/cli/install.ts` respects `--dry-run`. Six wrapper helpers (`wf`, `mk`, `cp`, `ap`, `runProcDry`, `cloneOrUpdateDry`) gate every write/spawn; reads still execute. Output format identical except writes log as `[dry-run] would write/mkdir/copy/append/run: <thing>`. `assertNotAgentsPath` still throws under dry-run. Tests: 4 new cases in `describe("dry-run mode")` in `src/cli/install.test.ts`.

7. **`scripts/compress-with-caveman.sh` + `bun run compress`** — idempotent compress wrapper. Default targets: `skills/*/SKILL.md`, `rules/AGENTS.md`, `AGENTS.md`, `skills/SOURCES.md`, `docs/*.md`. Excludes `_template`, `HANDOVER.md`, `README.md`. `--check` mode exits 1 if pending. `package.json` `scripts.compress` added; `bun run compress` invokes the TS subcommand (see item 13).

8. **`compress:check` CI soft gate** — `scripts/ci.ts` adds a new stage after `skills:lint` running `bash scripts/compress-with-caveman.sh --check`. Soft fail — does NOT abort CI. Summary shows `✓ / ⚠ (N pending) / · (skipped)`.

9. **Rules size lint guardrail** — `src/cli/skills.ts` `cmdLint` now checks `rules/AGENTS.md` line count when target is the `skills/` directory. Fails if > 200 lines, passes with note `(NN lines, under 200-line target)`. Currently 91 lines ✓.

10. **`docs/caveman.md` + `.original.md`** — 97 lines each. Sections: What / Install / Default mode / What gets compressed / What stays verbose / Frontmatter / Doctor / Adding a new skill / Opt-out / Cross-refs.

11. **Agent registry refactor** — `src/agents/registry.ts` (77 lines) is now the single source for the 5 agents. Exports `Agent` interface + `AGENTS` array with `id`, `label`, `baseDir`, `rulesFile`, `skillsDir`, `cavemanInstallDir`, optional `settingsPath`. `src/cli/install.ts`, `src/cli/doctor.ts`, `src/cli/skills.ts` all consume it. Tests: `src/agents/registry.test.ts` (36 tests).

12. **`fulcrum doctor --json`** — `src/cli/doctor.ts` emits a `DoctorReport` object with `bun, platform, agents, caveman, tools, policy, skillsCount, warnings, errors, verdict` when `--json` flag is passed. Human format unchanged when flag absent. Exit codes preserved (1 if errors > 0).

13. **`fulcrum compress` TS subcommand** — `src/cli/compress.ts` (267 lines). Wired into `src/index.ts` dispatcher. Wraps caveman python CLI. `bun run compress` now invokes this TS version. Bash wrapper (`scripts/compress-with-caveman.sh`) kept for portability.

**CI state after post-§6.1 work:** `bun run ci` green — install / typecheck / test (103 pass, 11 test files, 183 expect calls) / build:all / skills:lint / compress:check (soft, 0 pending). tsc clean.

---

## 1. Current state — one paragraph

`feat/agent-foundation-clean` ships a single Bun-compiled `fulcrum` binary that orchestrates installation, hooks, skills, rules, and an output-handling policy across five agent runtimes (Claude Code, Codex CLI, Gemini CLI, OpenCode, Pi CLI). 28 in-repo skills are content-verified against upstream, lint-clean (frontmatter + body sections), and caveman-compressed (`.original.md` beside each). Skills propagate via `fulcrum skills sync` to a `fulcrum/` subfolder under each agent's skills root. Eight hook recipes (`format`, `lint-gate`, `pm-policy`, `test-on-edit`, `audit-log`, `index-check`, `index-rebuild`, `tool-output-router`) are TypeScript subcommands of the same binary. Local CI (`bun run ci`) runs 6 stages: install / typecheck / test (103 pass across 11 files) / build:all / skills:lint / compress:check (soft). `fulcrum install` runs 5 steps including caveman cross-agent install, locking caveman ultra via `~/.config/caveman/config.json`, and respects `--dry-run`. `fulcrum doctor` enumerates 32 tools, a "Caveman" section with `defaultMode` display, and supports `--json` output. `src/agents/registry.ts` is the single source of truth for all 5 agent definitions consumed by install, doctor, and skills. `bun run compress` invokes `src/cli/compress.ts` to caveman-compress in-repo content idempotently. The format hook has been smoke-tested end-to-end against a malformed `.py`. No GitHub Actions are wired (intentional; opt-out). §6.2 (eval leaderboard) is the active next priority.

## 2. Architecture

```
fulcrum (Bun binary; ~60–120 MB per platform)
├── fulcrum hook <name>     — 8 subcommands invoked via stdin JSON envelopes
│     • index-check, index-rebuild       (session lifecycle)
│     • format, lint-gate, test-on-edit  (PostToolUse Write|Edit)
│     • pm-policy                        (PreToolUse Bash)
│     • audit-log                        (PostToolUse Bash)
│     • tool-output-router               (PostToolUse any) — TOML-driven
│
├── fulcrum init [DIR]      — bootstrap project AGENTS.md + .claude/CLAUDE.md
├── fulcrum install [--with-project DIR]
│                            — sentinel-splice rules, vendor snippets, seed policy,
│                              caveman per-agent install, caveman ultra lock
├── fulcrum hooks list/enable/disable
├── fulcrum skills sync     — fan out to <agent>/skills/fulcrum/<name>/
├── fulcrum skills lint     — frontmatter + body section structure
├── fulcrum skills list     — inventory + eval coverage
├── fulcrum compress        — compress in-repo content via caveman CLI; --check for CI
└── fulcrum doctor          — bun, agent dirs, caveman section (with defaultMode), 32 tools, policy; --json flag
```

Three agents (Claude Code, Codex, Gemini) call `fulcrum hook <name>` directly from native hook config. Two (OpenCode, Pi) load TypeScript shims from `shims/{opencode,pi}/fulcrum.ts` that re-dispatch to the same binary.

**Files map (durable):**

```
src/
├── index.ts                           # CLI dispatcher
├── types.ts
├── agents/
│   ├── registry.ts                    # single source of truth: Agent interface + AGENTS[5]
│   └── registry.test.ts               # 36 tests
├── utils/
│   ├── io.ts                          # readHookEvent (parse-fail logging), projectSlug, stateDir, deriveTool
│   ├── io.test.ts                     # 9 tests for parse-fail paths
│   └── proc.ts                        # which, exists (handles dirs), run, spawnDetached
├── cli/
│   ├── init.ts          install.ts    # bootstrap + sentinel splice + caveman install + --dry-run
│   ├── install.test.ts                # 103 tests total (across all test files)
│   ├── compress.ts                    # fulcrum compress subcommand (267 lines)
│   ├── hooks.ts         skills.ts     # hook + skill orchestration; rules size lint
│   └── doctor.ts                      # caveman defaultMode + 32-tool health + --json flag
└── hooks/
    ├── audit-log.ts     format.ts     index-check.ts     index-rebuild.ts
    ├── lint-gate.ts     pm-policy.ts  test-on-edit.ts    tool-output-router.ts
    └── *.test.ts                      # tests across 8 hook files (extended for parse-fail)

shims/{opencode,pi}/fulcrum.ts         # in-process re-dispatch shims

scripts/
├── ci.ts                              # bun run ci  (install→tsc→test→build:all→skills:lint→compress:check)
├── build-all.ts                       # cross-compile to 5 targets
├── release.ts                         # bun run release vX.Y.Z [--gh]
├── install.sh                         # bootstrap (clone or FULCRUM_RELEASE_TAG fetch)
├── compress-with-caveman.sh           # idempotent bash compress wrapper; --check for CI
├── eval-skill-claude.sh               # trigger-rate eval; reads evals/<skill>.match-words if present
└── eval-all.sh                        # leaderboard runner; --regenerate-only flag added

config/tool-output-policy.toml         # default tier matrix for ~50 tools
hooks/recipes/*.snippet.md             # per-agent registration snippets
docs/                                  # context, hooks, skills, mcp, agents, capabilities, caveman, etc.
  └── caveman.md + caveman.original.md # caveman reference (What/Install/Mode/CI/Doctor/Opt-out)
rules/AGENTS.md                        # ~91-line pure behavioral rules; lint enforces ≤ 200 lines
skills/
├── _template/SKILL.md                 # required shape
├── <name>/SKILL.md × 28              # caveman-compressed; .original.md beside each
├── <name>/SKILL.md.original.md × 28  # pre-compression human-edit form
├── SOURCES.md                         # registry + queue + caveman requirement
└── upstream.lock                      # populated when sourcing remote skills
evals/<name>.json × 28                 # 18–21-entry trigger sets per skill
evals/<name>.match-words               # (optional) per-skill match-words overrides
cliff.toml + CHANGELOG.md
LICENSE (MIT)  AGENTS.md  README.md
```

## 3. What works (verified)

- `bun run ci` — green: install + tsc + 103 tests (11 files, 183 expect calls) + 5 platform builds + skills:lint of 28 skills + compress:check (soft gate, 0 pending).
- `bun run scripts/build-all.ts` — produces 5 targets (`darwin-arm64` 63 MB, `darwin-x64` 68 MB, `linux-x64`/`linux-arm64` ~101 MB, `windows-x64` 118 MB).
- `bash scripts/install.sh` — splices rules, vendors snippets, seeds policy. Idempotent (sentinel block preserves user content).
- `FULCRUM_RELEASE_TAG=vX.Y.Z bash scripts/install.sh` — fetches a prebuilt binary from the GitHub Releases URL when no clone or Bun is available.
- `bun run release vX.Y.Z [--gh]` — clean-tree gate → CI → CHANGELOG via git-cliff → `chore(release):` commit → annotated tag → cross-compile → optional `gh release create` and asset upload. Does NOT push.
- `fulcrum doctor` — 32/32 tools detected on the current host; "Caveman (per-agent compression)" section surfaces install state per agent.
- `fulcrum install` — 5 steps: rules spliced into Claude Code / Codex CLI / OpenCode / Gemini (Pi dir not present); policy seeded at `~/.fulcrum/tool-output-policy.toml`; caveman installed per agent (Claude Code plugin, Gemini extension, clone-once+copy for Codex/OpenCode); `~/.config/caveman/config.json` written with `{"defaultMode": "ultra"}`.
- `assertNotAgentsPath()` — hard guard in install.ts throws if any install path resolves under `~/.agents/`. `~/.agents/` has been removed from this host.
- `lockCavemanUltra()` — idempotent; caveman resolver order: env `CAVEMAN_DEFAULT_MODE` > `~/.config/caveman/config.json` > "full".
- `fulcrum skills sync` — all 28 (compressed) skills under `<agent>/skills/fulcrum/<name>/`.
- `fulcrum skills list` — inventory with eval entry counts per skill.
- `fulcrum init <dir>` — seeds AGENTS.md (template), `.claude/CLAUDE.md` (`@AGENTS.md` import), `.gitignore` entries.
- Real format-hook smoke: piped a malformed `.py` Edit envelope through `fulcrum hook format`; ruff rewrote it correctly.
- `bun run changelog` (git-cliff installed) — populates CHANGELOG.md from conventional-commit history.
- `scripts/eval-skill-claude.sh <skill>` — trigger-rate eval that calls `claude --print --output-format=json --no-session-persistence` per query. Auth via Claude Code's own keychain/OAuth — no `ANTHROPIC_API_KEY` in env. Smoke-tested on jq (Sonnet, 1 run/query): 72% trigger / 14% false-trigger; the harness works, jq's description needs tightening to clear 80/20.
- `scripts/eval-all.sh --regenerate-only` — re-parses existing `summary.txt` files and rewrites `leaderboard.md` without rerunning evals.
- `bun run compress -- --check` — `src/cli/compress.ts` exits 1 if any tracked file has pending compression; 0 if all clean. Used by compress:check CI stage.
- `fulcrum doctor --json` — emits `DoctorReport` JSON object; parseable with `jq`; exit code 1 if errors > 0.
- `fulcrum install --dry-run` — all write/spawn paths replaced with log lines; reads still execute; `assertNotAgentsPath` still throws.
- `src/agents/registry.ts` — canonical `AGENTS` array consumed by install, doctor, and skills; no more inline agent configs scattered across files.

## 4. Decisions on the record

Don't relitigate without new information.

| Decision | Why | Where |
|---|---|---|
| TypeScript via Bun, not Rust/Go | OpenCode/Pi shims must be TS. Picking TS unifies the codebase and matches 3 of 5 peer-agent runtimes. | `package.json`, `src/` |
| Sentinel-block rules splice | Works on every agent regardless of `@import` support; idempotent; preserves user content. | `src/cli/install.ts`, BEGIN/END FULCRUM RULES markers |
| Hook recipes ship as binary subcommands | One source of truth; snippets reference `fulcrum hook <name>`. | `src/hooks/`, `hooks/recipes/*.snippet.md` |
| Skills install under `<agent-skills-root>/fulcrum/<name>/` | Path-based namespace today; matches the prefix convention plugin / extension systems use. Sets up the `fulcrum:<skill-name>` address space for the future plugin layer. Gemini's extension wrapper serves the same role. | `src/cli/skills.ts` (NAMESPACE constant) |
| Skill `name:` stays prefix-free | Slash command stays short (`/jq`, not `/fulcrum:jq`); the namespace is the parent dir, the agent loads by frontmatter. | `docs/skills.md` §4 |
| Eval harness uses `claude` CLI, not the Anthropic SDK | Auth lives in the OS keychain via `claude login`. No API-key env-var leak surface. Execution path matches how a real session loads a skill. | `scripts/eval-skill-claude.sh` |
| No GitHub Actions (release pipeline included) | Local `bun run ci` and `bun run release` are the gates. User opt-out is durable; future workflows must be additive, not the source of truth. | absence of `.github/workflows/` |
| One tool, one skill | Exception: tightly-coupled CLIs that ship together (`dart format` + `dart analyze` → `dart-toolchain`). | `skills/SOURCES.md`, AGENTS.md |
| Skill content correctness is NOT implied by lint | Lint verifies frontmatter shape + body section structure. Content (flags, defaults, env vars) must be verified against `--help` / upstream README at authoring time. The 46% bug rate on parallel-authored skills is the cautionary data point. | `AGENTS.md`, fix commit `08101c6` |
| Removed memory/PM/task layer | This branch is `feat/agent-foundation-clean`. Memory/vault/ADRs/Plane/PM concerns belong on a separate branch. | branch separation |
| Caveman ultra mandatory always-on | ~75% output-token reduction + no per-session opt-in fragility. `rules/AGENTS.md` §0b is the contract; `~/.config/caveman/config.json` is the runtime lock. | `rules/AGENTS.md` §0b, `src/cli/install.ts` `lockCavemanUltra()`, `~/.config/caveman/config.json` |
| Never use `~/.agents/` for skills | Shared folder pollutes every agent's context with skills that may not apply. `assertNotAgentsPath()` enforces this at runtime. | `src/cli/install.ts`, `~/.claude/CLAUDE.md` global rule |
| Agent registry as single source of truth | Without a registry, agent definitions drifted independently in install, doctor, and skills — a three-way sync hazard. One `AGENTS` array in `src/agents/registry.ts` eliminates the drift. | `src/agents/registry.ts`, consumers: `install.ts`, `doctor.ts`, `skills.ts` |
| Caveman compression of in-repo content is part of CI | Verbose content deployed to agent skills directories wastes tokens every session. A soft-fail CI gate (`compress:check`) prevents accidental uncompressed commits without blocking the build on first-run setup. | `scripts/compress-with-caveman.sh`, `scripts/ci.ts`, `src/cli/compress.ts` |

## 5. Branch + commit map

```
HEAD (uncommitted)      §6.1 caveman integration + post-§6.1 polish — not yet committed
f92d6c7  docs(handover): correct caveman install paths; forbid ~/.agents/ shared folder
57543dd  docs(handover): record caveman installs on this host (Claude/Gemini/Codex/OpenCode)
4b2c4be  docs: rewrite HANDOVER for next-session pickup; add caveman requirement
546ad18  chore(evals): scaffold leaderboard runner + better trigger detection (not yet executed)
ff61ebf  feat(evals): rewrite trigger-rate harness to call claude CLI (no API key)
1373c37  feat(foundation): expand doctor coverage to 32 tools; align docs with fulcrum/ namespace
8241f67  feat(foundation): release script, install fetch path, lint tightening, skills list, fulcrum/ namespace, README+AGENTS framing
08101c6  fix(skills): correct content errors in 19 skills against upstream
4426eec  feat(skills): author 23 skills — queue cleared (28 total)
968f8a2  feat(foundation): P2 work — tests, 4 skills, doctor, license, ci
…earlier history: phase 1–6 rewrite, jq skill #1, foundation hardening
```

Branch is **not pushed**. No PR.

---

## 6. Next session — start here

### ~~6.1 Caveman compression~~ — DONE

Landed this session. See "What landed this session" section above and the relevant files: `src/cli/install.ts`, `src/cli/install.test.ts`, `src/cli/doctor.ts`, `rules/AGENTS.md`, `AGENTS.md`. Commit pending (see §5).

### 6.2 Eval-leaderboard run + jq tightening  ← ACTIVE PRIORITY

Scaffolding was in commits `ff61ebf`, `546ad18`. The eval-all.sh script has since been fixed (unbound-var bug, gawk-only awk replaced with portable grep+sed, `--regenerate-only` flag added). A Sonnet leaderboard run was kicked off at session end (`/tmp/eval-leaderboard.log`); ~3/28 skills done at the time of writing. Initial jq result: 72% trigger / 14% false-trigger (below the 80% trigger bar — description needs tightening).

Steps:

1. Commit the §6.1 work first (`feat(install): caveman cross-agent install + ultra lock` or similar). `bun run ci` is green.
2. Propagate compressed skills via `fulcrum skills sync` (skills are already compressed in-repo).
3. Check `/tmp/eval-leaderboard.log` — if the background run is still going, let it finish; if it errored, restart with `scripts/eval-all.sh --model sonnet --runs-per-query 1`.
4. Inspect `eval-results/<ts>/leaderboard.md`. For any skill below 80/20, open `<skill>/results.jsonl` — the saved Claude responses show whether the description failed to trigger or the heuristic missed a real trigger.
5. Iterate jq's description as the worked example. Re-run with `--runs-per-query 3` to confirm stability.
6. Repeat for next-worst-performing skills. Goal: every skill ≥ 80% trigger / ≤ 20% false-trigger.
7. If you want to re-score an existing run after editing descriptions without re-running evals: `scripts/eval-all.sh --regenerate-only --results-dir eval-results/<ts>`.

### 6.3 Foundation polish (after 6.1 and 6.2)

| Item | Status | Notes |
|---|---|---|
| ~~Output-policy entries audit~~ | DONE | `config/tool-output-policy.toml` audited — every tool already has an entry. No gaps found. |
| ~~Doc drift: agents.md flat paths~~ | DONE | 3 stale flat skill paths corrected to namespaced form. |
| ~~Doc drift: skills.md eval flow~~ | DONE | Line 102 stale `run_loop.py`/Anthropic-SDK reference rewritten. |
| ~~Doc drift: skill-smoke-test.md qualifier~~ | DONE | "(when available)" removed. |
| ~~`repomix` for `index-rebuild`~~ | DONE | Smoke-tested in real session: hook exits 0, repomix writes ~4.3 MB `$TMPDIR/fulcrum.xml`, SHA file persists. ctags + graphify also fire under `Promise.allSettled`. v1.14.0. |
| ~~Hook-recipe enable smoke~~ | DONE | `format` recipe merged into `~/.claude/settings.json` via jq; synthetic `Edit` envelope (malformed `.py`) piped through the snippet's command — ruff reformatted (77B → 81B). Settings.json restored from backup; diff empty. |
| Trigger-rate evals on Opus | OPEN | The default model in eval scripts is whatever `claude` defaults to. Sonnet is fast; Opus is what real sessions might use. Consider a second leaderboard with `--model opus`. |

### 6.4 Outstanding small items

- ~~Hook envelope parse failure logging~~ — DONE this session. See "What also landed" item 1.
- ~~`bunfig.toml` `[install] frozenLockfile = true`~~ — DONE. Pinned. Local `bun install` now matches CI behavior; lockfile drift detected immediately.
- README Rosetta hint is generic; if specific Intel-Mac users hit issues, expand.

## 7. Smoke-test recipes

Run from repo root with `PATH="/opt/homebrew/bin:$HOME/.bun/bin:$HOME/go/bin:$HOME/.local/bin:$PATH"` (or a similarly broad PATH).

```bash
# 1. Type-check, tests, build, lint — single gate
bun run ci

# 2. Cross-compile sanity
bun run scripts/build-all.ts

# 3. End-to-end install into a scratch HOME (non-destructive)
SCRATCH=$(mktemp -d)
HOME=$SCRATCH PATH="$SCRATCH/.local/bin:$HOME/.bun/bin:$PATH" mkdir -p \
  $SCRATCH/.local/bin $SCRATCH/.claude $SCRATCH/.codex \
  $SCRATCH/.config/opencode $SCRATCH/.pi/agent $SCRATCH/.gemini
echo "PRE-EXISTING USER CONTENT" > $SCRATCH/.claude/CLAUDE.md
HOME=$SCRATCH PATH="$SCRATCH/.local/bin:$HOME/.bun/bin:$PATH" \
  bash scripts/install.sh
HOME=$SCRATCH fulcrum doctor
head -3 $SCRATCH/.claude/CLAUDE.md   # confirm user content preserved
rm -rf $SCRATCH

# 4. Real format-hook against a malformed .py
TMP=$(mktemp -d); cat > $TMP/bad.py <<'EOF'
import os,sys
def f( x,y ):
    return x+y
EOF
printf '%s' "{\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$TMP/bad.py\"}}" \
  | bun run src/index.ts hook format
cat $TMP/bad.py   # should be ruff-formatted
rm -rf $TMP

# 5. Trigger-rate eval (single skill, single run; ~2-3 min)
bun run src/index.ts skills sync   # ensure skill is at ~/.claude/skills/fulcrum/jq
scripts/eval-skill-claude.sh jq --model sonnet --runs-per-query 1

# 6. Leaderboard (all 28 skills; ~30–60 min)
scripts/eval-all.sh --model sonnet --runs-per-query 1

# 7. Re-score existing leaderboard run without re-running evals
scripts/eval-all.sh --regenerate-only --results-dir eval-results/<ts>

# 8. Doctor JSON output
fulcrum doctor --json | jq .verdict
# expect: "ok" (no errors) or "degraded" (errors > 0)
```

## 8. Known limitations (current)

- **Trigger-rate eval is Claude-Code-only.** No equivalent harness exists for Codex / Gemini / OpenCode / Pi. Documented at `docs/skills.md` §7.
- **OpenCode is archived** (2025-09-18). Successor: Charm's Crush. `shims/opencode/fulcrum.ts` is written against last-stable OpenCode; Crush's plugin contract may differ at the outer event-handler level. Recipe wiring is identical.
- **Pi has no MCP support** by design. Tier rules keyed `mcp__*` will never fire on Pi (`docs/agents.md` §5.6).
- **`dist/` is gitignored.** Every fresh clone needs Bun to run `bash scripts/install.sh` (or set `FULCRUM_RELEASE_TAG=...` to fetch a release artifact).
- **Skill content correctness is the author's job.** Lint passes do not imply upstream-correct content. The fix commit `08101c6` corrected 19 skills against upstream README/docs after the fact; future authoring should verify inline.
- **Caveman ultra is mandatory but not enforced for new skills.** Any new `SKILL.md` added without a compression pass will deploy verbose content. The session that adds a skill should run `/caveman:compress skills/<name>/SKILL.md` before committing.

## 9. How to read this repo

- `README.md` — install + usage.
- `AGENTS.md` — project-level instructions and trajectory.
- `HANDOVER.md` — this file.
- `docs/` — per-topic foundation docs.
- `rules/AGENTS.md` — body spliced into each agent's primary rules file (90 lines, pure behavioral).
- `skills/SOURCES.md` — registry, queue, **caveman requirement** (mandatory).
- `evals/README.md` — eval harness contract.
- `git log --oneline` — chronological history.
