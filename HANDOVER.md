# Fulcrum — Handover

> Snapshot at branch `feat/agent-foundation-clean` (HEAD: `git log -1`). Forward-looking only — historical event logs have been pruned. For archaeology, see `git log` and the per-commit messages.

## 0. Destination

**Fulcrum is a local-first CLI Agent OS for supervising repositories, tasks, agent runs, context, memory, and artifacts.**

Today the foundation layer is in place. The supervisor / task system / agent runs / context engine / memory / artifacts / plugins layers are placeholders, not implementations. See `AGENTS.md` for the trajectory framing.

## 1. Current state — one paragraph

`feat/agent-foundation-clean` ships a single Bun-compiled `fulcrum` binary that orchestrates installation, hooks, skills, rules, and an output-handling policy across five agent runtimes (Claude Code, Codex CLI, Gemini CLI, OpenCode, Pi CLI). 28 in-repo skills are content-verified against upstream, lint-clean (frontmatter + body sections), and propagate via `fulcrum skills sync` to a `fulcrum/` subfolder under each agent's skills root. Eight hook recipes (`format`, `lint-gate`, `pm-policy`, `test-on-edit`, `audit-log`, `index-check`, `index-rebuild`, `tool-output-router`) are TypeScript subcommands of the same binary. Local CI (`bun run ci`) gates type-check + tests + cross-compile + skills lint; local release (`bun run release vX.Y.Z`) handles tag + changelog + build + optional `gh release create`. `fulcrum doctor` enumerates 32 tools, all of which are now installed on the current host. The format hook has been smoke-tested end-to-end against a malformed `.py` (ruff rewrote it correctly). No GitHub Actions are wired (intentional; opt-out).

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
│                            — sentinel-splice rules, vendor snippets, seed policy
├── fulcrum hooks list/enable/disable
├── fulcrum skills sync     — fan out to <agent>/skills/fulcrum/<name>/
├── fulcrum skills lint     — frontmatter + body section structure
├── fulcrum skills list     — inventory + eval coverage
└── fulcrum doctor          — bun, agent dirs, 32 tools, policy file health
```

Three agents (Claude Code, Codex, Gemini) call `fulcrum hook <name>` directly from native hook config. Two (OpenCode, Pi) load TypeScript shims from `shims/{opencode,pi}/fulcrum.ts` that re-dispatch to the same binary.

**Files map (durable):**

```
src/
├── index.ts                           # CLI dispatcher
├── types.ts
├── utils/
│   ├── io.ts                          # readHookEvent, projectSlug, stateDir, deriveTool
│   └── proc.ts                        # which, exists (handles dirs), run, spawnDetached
├── cli/
│   ├── init.ts          install.ts    # bootstrap + sentinel splice
│   ├── hooks.ts         skills.ts     # hook + skill orchestration
│   └── doctor.ts                      # 32-tool environment health
└── hooks/
    ├── audit-log.ts     format.ts     index-check.ts     index-rebuild.ts
    ├── lint-gate.ts     pm-policy.ts  test-on-edit.ts    tool-output-router.ts
    └── *.test.ts                      # 38 tests across 8 files

shims/{opencode,pi}/fulcrum.ts         # in-process re-dispatch shims

scripts/
├── ci.ts                              # bun run ci  (install→tsc→test→build:all→lint)
├── build-all.ts                       # cross-compile to 5 targets
├── release.ts                         # bun run release vX.Y.Z [--gh]
├── install.sh                         # bootstrap (clone or FULCRUM_RELEASE_TAG fetch)
├── eval-skill-claude.sh               # trigger-rate eval via `claude --print` (no API key)
└── eval-all.sh                        # leaderboard runner across all skills

config/tool-output-policy.toml         # default tier matrix for ~50 tools
hooks/recipes/*.snippet.md             # per-agent registration snippets
docs/                                  # context, hooks, skills, mcp, agents, capabilities, etc.
rules/AGENTS.md                        # ~120-line body spliced into each agent's primary rules file
skills/
├── _template/SKILL.md                 # required shape
├── <name>/SKILL.md × 28               # all content-verified against upstream
├── SOURCES.md                         # registry + queue + caveman requirement
└── upstream.lock                      # populated when sourcing remote skills
evals/<name>.json × 28                 # 18–21-entry trigger sets per skill
cliff.toml + CHANGELOG.md
LICENSE (MIT)  AGENTS.md  README.md
```

## 3. What works (verified)

- `bun run ci` — green: install + tsc + 38 tests + 5 platform builds + skills lint of 28 skills.
- `bun run scripts/build-all.ts` — produces 5 targets (`darwin-arm64` 63 MB, `darwin-x64` 68 MB, `linux-x64`/`linux-arm64` ~101 MB, `windows-x64` 118 MB).
- `bash scripts/install.sh` — splices rules, vendors snippets, seeds policy. Idempotent (sentinel block preserves user content).
- `FULCRUM_RELEASE_TAG=vX.Y.Z bash scripts/install.sh` — fetches a prebuilt binary from the GitHub Releases URL when no clone or Bun is available.
- `bun run release vX.Y.Z [--gh]` — clean-tree gate → CI → CHANGELOG via git-cliff → `chore(release):` commit → annotated tag → cross-compile → optional `gh release create` and asset upload. Does NOT push.
- `fulcrum doctor` — 32/32 tools detected on the current host (every formatter, linter, scanner, runtime the foundation can invoke; plus `python3.12` for the eval harness).
- `fulcrum install` — rules spliced into Claude Code / Codex CLI / OpenCode / Gemini (Pi dir not present); policy seeded at `~/.fulcrum/tool-output-policy.toml`.
- `fulcrum skills sync` — all 28 skills under `<agent>/skills/fulcrum/<name>/`. Gemini extension `~/.gemini/extensions/fulcrum-skills/` is the equivalent namespace.
- `fulcrum skills list` — inventory with eval entry counts per skill.
- `fulcrum init <dir>` — seeds AGENTS.md (template), `.claude/CLAUDE.md` (`@AGENTS.md` import), `.gitignore` entries.
- Real format-hook smoke: piped a malformed `.py` Edit envelope through `fulcrum hook format`; ruff rewrote it correctly.
- `bun run changelog` (git-cliff installed) — populates CHANGELOG.md from conventional-commit history.
- `scripts/eval-skill-claude.sh <skill>` — trigger-rate eval that calls `claude --print --output-format=json --no-session-persistence` per query. Auth flows through Claude Code's own keychain/OAuth — no `ANTHROPIC_API_KEY` in env. Smoke-tested on jq (Sonnet, 1 run/query): 75% trigger / 25% false-trigger; the harness works, jq's description needs tightening to clear 80/20.

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

## 5. Branch + commit map

```
HEAD                                                                                            ← see git log -1
546ad18  chore(evals): scaffold leaderboard runner + better trigger detection (not yet executed)
ff61ebf  feat(evals): rewrite trigger-rate harness to call claude CLI (no API key)
1373c37  feat(foundation): expand doctor coverage to 32 tools; align docs with fulcrum/ namespace
8241f67  feat(foundation): release script, install fetch path, lint tightening, skills list, fulcrum/ namespace, README+AGENTS framing
08101c6  fix(skills): correct content errors in 19 skills against upstream
4426eec  feat(skills): author 23 skills — queue cleared (28 total)
968f8a2  feat(foundation): P2 work — tests, 4 skills, doctor, license, ci
991669c  docs: handover audit — drift sweep, P2 portability, HANDOVER.md
…earlier history: phase 1–6 rewrite, jq skill #1, foundation hardening
```

Branch is **not pushed**. No PR.

---

## 6. Next session — start here

Two priorities, both grounded in concrete commits already on the branch (which means a fresh session can pick up by reading the commits + this section, with no need to re-derive context).

### 6.1 Caveman compression — new mandatory requirement

**Source:** <https://github.com/JuliusBrussee/caveman> (added to `skills/SOURCES.md` §Cross-agent platforms).

**What caveman is.** An output-compression skill that cuts agent verbosity ~75% and rewrites memory/instruction files into terse "fragment" form for ~46% input-token reduction. Code blocks, paths, URLs, commands, headings, and version numbers pass through untouched; prose drops articles, hedging, and pleasantries. Ships native installs for Claude Code (plugin), Gemini CLI (extension), Codex (`.codex/hooks.json`), and Cursor/Windsurf (`SKILL.md`). Modes: default `/caveman`, intensified `/caveman ultra` (telegraphic), and `wenyan-ultra` (classical-Chinese terseness).

**Requirement.** Caveman is **mandatory** on every host fulcrum sets up. Two surfaces:

1. **Always-on agent compression.** Caveman is installed into every agent fulcrum installs into, with `/caveman ultra` as the default mode. This is a managed third-party skill, the same pattern as `obra/superpowers` and `anthropics/skills`. `fulcrum install` is the natural place to call the install command for each agent.
2. **Compress all in-repo skills + rules at authoring time.** Every `skills/<name>/SKILL.md` and `rules/AGENTS.md` is rewritten into caveman-compressed form via `/caveman:compress <file>` (the resulting `<file>.original.md` backup is what humans edit; the compressed file is what agents read). New skills and rules go through the same compression pass before being committed.

**Hard rule on install paths.** Never use a shared `~/.agents/` folder for skills or rules. Each agent has its own folder; install ONLY there. If a third-party installer defaults to `~/.agents/` (e.g. `npx skills add -g`), refuse the default — either find a per-agent path flag, or clone the upstream skill repo and copy `SKILL.md` files directly into the specific agent's skills root.

**Already installed on this host (per-agent, verified):**

| Agent | Where | How it got there |
|---|---|---|
| Claude Code | plugin `caveman@caveman` from marketplace `caveman` | `claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman` |
| Gemini CLI | `~/.gemini/extensions/caveman/` | `gemini extensions install https://github.com/JuliusBrussee/caveman` |
| Codex CLI | `~/.codex/skills/{caveman,caveman-compress,caveman-commit,caveman-help,caveman-review,compress}/` | `npx skills add` initially placed them at the wrong shared `~/.agents/` path; corrected by copy + deletion of `~/.agents/`. Future installs must clone caveman upstream and copy directly into `~/.codex/skills/<name>/`. |
| OpenCode | `~/.config/opencode/skills/{caveman,caveman-compress,caveman-commit,caveman-help,caveman-review,compress}/` | same correction as Codex — moved from `~/.agents/` into the per-agent folder. Future: clone upstream + copy. |
| Pi CLI | dir not present on host | (skip) |

`~/.agents/` has been removed. Do not recreate it.

**Integration plan (concrete steps for the next session):**

1. **Verify the local installs in a fresh agent session.** `/caveman` and `/caveman:compress <file>` should be invokable in Claude Code; Gemini should pick up the extension; Codex / OpenCode should resolve `caveman` from their per-agent skills folders (`~/.codex/skills/caveman/SKILL.md`, `~/.config/opencode/skills/caveman/SKILL.md`). If any didn't take, reinstall — but for Codex / OpenCode do NOT use `npx skills add` (it defaults to `~/.agents/`); instead `git clone https://github.com/JuliusBrussee/caveman /tmp/caveman` and copy the relevant skill subfolders directly into the per-agent root.
2. **Add caveman to `fulcrum install`.** New step in `src/cli/install.ts` that, per detected agent, runs the agent-native install command:
   - Claude Code: `claude plugin marketplace add JuliusBrussee/caveman && claude plugin install caveman@caveman`
   - Gemini CLI: `gemini extensions install https://github.com/JuliusBrussee/caveman`
   - Codex CLI: clone the caveman repo and copy each `skills/<name>/` directly into `~/.codex/skills/<name>/`. Do **not** use `npx skills add` — it defaults to `~/.agents/` which is forbidden.
   - OpenCode: same approach, target `~/.config/opencode/skills/<name>/`.
   - Pi CLI: same approach, target `~/.pi/agent/skills/<name>/`.
   Fail-soft if the agent's CLI isn't on PATH; log the manual command for the user. Verify nothing got written to `~/.agents/`.
3. **Compress the 28 in-repo skills + rules.** New `bun run` script (e.g. `scripts/compress-with-caveman.sh`) that walks `skills/*/SKILL.md` and `rules/AGENTS.md`, runs `/caveman:compress` (or the underlying caveman binary) on each in `--ultra` mode, commits the compressed forms beside the originals (the `.original.md` backup pattern caveman uses). Update the lint to allow either form. After this lands, `fulcrum skills sync` deploys the compressed form to each agent — same path layout, just denser content.
4. **Lock `/caveman ultra` as the default.** During `fulcrum install`, after the plugin/extension install succeeds, write the activation marker each agent uses (Claude Code SessionStart hook, Codex `.codex/hooks.json`, Gemini extension config) so caveman ultra is always-on without per-session opt-in.
5. **Document in `rules/AGENTS.md`.** A precedence rule: "Caveman ultra is the always-on default. Drop articles, hedging, pleasantries; keep code, paths, commands, headings, versions verbatim. If the user says `normal mode`, opt out for that session."
6. **Add to `fulcrum doctor`.** Surface caveman install state per agent (plugin installed? activation hook present? mode ultra?). Failure mode: install command run but mode reverted to default → silent regression to verbose output.

This is the central next-session deliverable. The eval-leaderboard work below depends on it landing first because compressed skill descriptions will trigger differently than verbose ones — the leaderboard should measure the compressed forms agents will actually see.

### 6.2 Eval-leaderboard run + jq tightening

Already-committed scaffolding (commits `ff61ebf`, `546ad18`):

- `scripts/eval-skill-claude.sh` — calls `claude --print --output-format=json --no-session-persistence`. Auth via `claude` CLI (no API key). Match-words derived from skill `name:` + every top-level command in `## Invocation` + every command after a `|` pipe in that section.
- `scripts/eval-all.sh` — leaderboard runner. Iterates every skill, writes `<results-dir>/leaderboard.md` plus per-skill `summary.txt` + `results.jsonl`. Flags: `--model`, `--runs-per-query`, `--results-dir`, `--only`, `--skip`.

Steps:

1. Re-run `bun run ci` to confirm green checkpoint.
2. After §6.1's compression pass, propagate via `fulcrum skills sync`.
3. Run `scripts/eval-all.sh --model sonnet --runs-per-query 1` (~30–60 min wall). Inspect `eval-results/<ts>/leaderboard.md`.
4. For any skill missing the 80/20 bar, look at `<skill>/results.jsonl` — the saved Claude responses tell you whether the description failed to trigger or the heuristic missed a real trigger. If the latter, extend `--match-words` for that skill (the heuristic's overrides go on the harness command line; long-term we may want a per-skill `evals/<name>.match-words` file).
5. Iterate jq's description as the worked example. Re-run with `--runs-per-query 3` to confirm stability before declaring done.
6. Repeat for the next-worst-performing skills. Goal: every skill ≥ 80% trigger / ≤ 20% false-trigger.

### 6.3 Foundation polish (after 6.1 and 6.2)

| Item | Notes |
|---|---|
| Output-policy entries for newly-installed tools | `config/tool-output-policy.toml` was authored when fewer tools were on the host. Now that 32 tools are installed and routinely invoked, audit the matrix and add tier rules for `bat`, `eza`, `sd`, `zoxide`, `difft`, `mise`, `direnv`, `osv-scanner`, `pmd`, `spotbugs`, `lizard`, `flarectl`, `usql`, `xh`, `hyperfine`. The default tier is `leave-as-is` — that's safe but not optimal for tools known to spew (e.g. `pmd` HTML). |
| Doc index review | `docs/` has 8 docs. Verify each still matches the foundation as it stands today (post-namespace, post-doctor expansion, post-eval harness rewrite). Some doc text may still reference flat skills paths or the old eval-via-API-key flow even though §1 in `docs/skills.md` has been updated. |
| Rules audit | `rules/AGENTS.md` is the body that gets sentinel-spliced. Compress with caveman ultra (per §6.1) and re-lint for the 200-line target. Verify all referenced tools still match the installed set. |
| `repomix` for `index-rebuild` | Now installed (`bun add -g repomix`). Verify `index-rebuild` actually invokes it without error in a real session and not just under `Promise.allSettled`. |
| Hook-recipe enable smoke | `fulcrum hooks enable <name>` prints a per-agent registration snippet. Wire one into the user's Claude Code `~/.claude/settings.json` and confirm the hook fires on a real `Edit` event. |
| Trigger-rate evals on Opus | The default model in the eval scripts is whatever `claude` defaults to. Sonnet is fast; Opus is what real sessions might use. Consider a second leaderboard with `--model opus`. |

### 6.4 Outstanding small items

- Hook envelope parse failure currently logs to stderr only under `FULCRUM_DEBUG`. Optional: emit a one-liner unconditionally when the envelope is malformed; a silent no-op on unexpected input is hard to diagnose.
- `bunfig.toml` could pin `[install] frozenLockfile = true` for CI assertion, but `bun install --frozen-lockfile` already runs in `scripts/ci.ts`. Not a blocker.
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
```

## 8. Known limitations (current)

- **Trigger-rate eval is Claude-Code-only.** No equivalent harness exists for Codex / Gemini / OpenCode / Pi. Documented at `docs/skills.md` §7.
- **OpenCode is archived** (2025-09-18). Successor: Charm's Crush. `shims/opencode/fulcrum.ts` is written against last-stable OpenCode; Crush's plugin contract may differ at the outer event-handler level. Recipe wiring is identical.
- **Pi has no MCP support** by design. Tier rules keyed `mcp__*` will never fire on Pi (`docs/agents.md` §5.6).
- **`dist/` is gitignored.** Every fresh clone needs Bun to run `bash scripts/install.sh` (or set `FULCRUM_RELEASE_TAG=...` to fetch a release artifact).
- **Skill content correctness is the author's job.** Lint passes do not imply upstream-correct content. The fix commit `08101c6` corrected 19 skills against upstream README/docs after the fact; future authoring should verify inline.

## 9. How to read this repo

- `README.md` — install + usage.
- `AGENTS.md` — project-level instructions and trajectory.
- `HANDOVER.md` — this file.
- `docs/` — per-topic foundation docs.
- `rules/AGENTS.md` — body spliced into each agent's primary rules file.
- `skills/SOURCES.md` — registry, queue, **caveman requirement** (mandatory).
- `evals/README.md` — eval harness contract.
- `git log --oneline` — chronological history.
