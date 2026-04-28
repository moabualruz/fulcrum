# Fulcrum — Handover

> Snapshot at branch `feat/agent-foundation-clean` after `50aa978`. Forward-looking only — historical event logs pruned. For archaeology: `git log` and per-commit messages.

## 0. Destination

**Fulcrum is a local-first CLI Agent OS for supervising repositories, tasks, agent runs, context, memory, and artifacts.**

Today the foundation layer is partly in place. Supervisor / task / agent-runs / context-engine / memory / artifacts / plugins layers are placeholders, not implementations. Remaining ship work is listed in §6. See `AGENTS.md` for the trajectory framing.

---

## 1. Current state — one paragraph

`feat/agent-foundation-clean` currently provides a Bun `fulcrum` CLI with project init, hook subcommands, hook config registration, hook snippet vending, rules splicing, non-destructive uninstall, in-repo skill sync during install, pinned curated upstream skill sync, DeepWiki MCP registration, caveman install, caveman compression, doctor, and local CI. 28 in-repo skills are lint-clean, caveman-compressed (`.original.md` beside each), and pass the latest Claude/Codex eval bar. Eight hook recipes (`format`, `lint-gate`, `pm-policy`, `test-on-edit`, `audit-log`, `index-check`, `index-rebuild`, `tool-output-router`) are TypeScript subcommands of the same binary. `src/agents/registry.ts` is the single source of truth for all 5 agent definitions consumed by install, doctor, and skills. No GitHub Actions are wired (intentional; opt-out). The branch is not in PR/release mode; remaining work means the requirements gaps in §6.

---

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
├── fulcrum install [--with-project DIR] [--no-skills] [--no-upstream-skills]
│                            — sentinel-splice rules, vendor snippets, seed policy,
│                              caveman per-agent install, caveman ultra lock,
│                              context-mode managed integration,
│                              sync authored + curated upstream skills unless opted out,
│                              register DeepWiki MCP for supported detected agents
├── fulcrum uninstall [--dry-run] [--purge] [--include-caveman]
│                            — remove Fulcrum-managed rules blocks, hook configs/state,
│                              authored/upstream skill namespaces, generated
│                              Gemini import, unmodified policy; caveman only with flag
├── fulcrum hooks list/enable/disable
│                            — edit native hook configs for supported agents + marker state
├── fulcrum skills sync     — fan out to <agent>/skills/fulcrum/<name>/
├── fulcrum skills upstream — fan out curated upstream skills to <agent>/skills/fulcrum-upstream/<name>/
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
│   ├── uninstall.ts                   # conservative removal of managed artifacts
│   ├── context-mode.ts                # managed context-mode install/uninstall across 5 agents
│   ├── install.test.ts  uninstall.test.ts
│   ├── compress.ts                    # fulcrum compress subcommand (267 lines)
│   ├── hooks.ts         skills.ts     # native hook config + skill orchestration
│   ├── upstream-skills.ts             # pinned curated third-party skill installer
│   ├── mcp.ts                         # DeepWiki MCP registration/removal
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
├── eval-skill-claude.sh               # single-skill trigger-rate eval; reads evals/<skill>.match-words
├── eval-skill-codex.sh                # same shape for Codex CLI
├── eval-skill-gemini.sh               # same shape for Gemini CLI
├── eval-skill-opencode.sh             # same shape for OpenCode
├── eval-skill-pi.sh                   # same shape for Pi CLI
└── eval-all.sh                        # leaderboard runner; --engine claude|codex|gemini|opencode|pi; --skip-<agent>

config/tool-output-policy.toml         # default tier matrix for ~50 tools
hooks/recipes/*.snippet.md             # per-agent registration snippets
docs/                                  # context, hooks, skills, mcp, agents, capabilities, caveman, etc.
  └── caveman.md + caveman.original.md # caveman reference (What/Install/Mode/CI/Doctor/Opt-out)
rules/AGENTS.md                        # ~91-line pure behavioral rules; lint enforces ≤ 200 lines
skills/
├── _template/SKILL.md                 # required shape
├── <name>/SKILL.md × 28              # compact trigger/routing file; .original.md beside each
├── <name>/SKILL.original.md × 28     # human-edit form
├── <name>/references/*.md            # direct, progressively loaded section detail
├── <name>/references/*.original.md   # human-edit reference source
├── SOURCES.md                         # registry + queue + caveman requirement
└── upstream.lock                      # pinned curated third-party skill manifest
evals/<name>.json × 28                 # 18–21-entry trigger sets per skill (inline-data queries)
evals/<name>.match-words × 28          # per-skill match-words overrides (word-bounded grep -qw tokens)
.gitleaksignore                        # one line — fake token in evals/gitleaks.json suppressed
cliff.toml + CHANGELOG.md
LICENSE (MIT)  AGENTS.md  README.md
```

---

## 3. What works (verified)

- `bun run ci` — green in the latest local run: install + tsc + 144 tests + 5 platform builds + skills:lint (28/28) + compress:check (hard, 0 pending).
- `bun run scripts/build-all.ts` — 5 targets (`darwin-arm64` 63 MB, `darwin-x64` 68 MB, `linux-x64`/`linux-arm64` ~101 MB, `windows-x64` 118 MB).
- `bash scripts/install.sh` — splices rules, vendors snippets, seeds policy. Idempotent. `FULCRUM_RELEASE_TAG=vX.Y.Z` fetches a prebuilt binary from GitHub Releases.
- `bun run release vX.Y.Z [--gh]` — clean-tree gate → CI → CHANGELOG → tag → cross-compile → optional `gh release create`. Does NOT push.
- `fulcrum install` — 9 steps: rules spliced into Claude Code / Codex CLI / OpenCode / Gemini; policy seeded; caveman per-agent; `~/.config/caveman/config.json` written `{"defaultMode":"ultra"}`; context-mode installed/configured per detected agent; authored in-repo skills synced unless `--no-skills`; curated upstream skills synced unless `--no-upstream-skills`; DeepWiki MCP registered for supported detected agents. Respects `--dry-run`.
- `fulcrum uninstall` — removes Fulcrum-managed rules blocks, native hook registrations, hook snippets/markers, managed `skills/fulcrum/` and `skills/fulcrum-upstream/` namespaces, Gemini managed skill extensions, generated Gemini import, managed context-mode registrations, and unmodified seeded policy. Keeps edited policy by default and keeps caveman unless `--include-caveman`; keeps the global `context-mode` npm package because upstream has no uninstall contract.
- `fulcrum skills upstream` — reads `skills/upstream.lock`, checks out pinned upstream SHAs into `~/.fulcrum/cache/upstream-skills`, and installs 20 selected skills under `fulcrum-upstream/` (Gemini: `fulcrum-upstream-skills` extension).
- `fulcrum hooks enable/disable` — detection-aware by default (writes only for agents whose `rootDir` exists). `--all` flag opts back into cross-machine/dotfiles writes. Records/removes intent markers; prints registration snippets for review.
- `fulcrum doctor [--json]` — 32/32 tools detected; "Caveman" section with `defaultMode` display; `Pi MCP adapter` check; `DoctorReport` JSON on `--json` includes `piMcpAdapter.{adapterPresent,deepwikiPresent}`.
- `assertNotAgentsPath()` / `lockCavemanUltra()` — hard guards in install.ts; both tested.
- `fulcrum skills sync` — all 28 compressed skills under `<agent>/skills/fulcrum/<name>/`.
- `fulcrum init <dir>` — seeds AGENTS.md, `.claude/CLAUDE.md` (`@AGENTS.md` import), `.gitignore`.
- Format-hook smoke: piped a malformed `.py` Edit envelope → ruff rewrote it correctly.
- `scripts/eval-skill-{claude,codex,gemini,opencode,pi}.sh <skill>` — five trigger-rate harnesses share `--model`, `--runs-per-query`, `--results-dir`, `--match-words`. Claude auth via keychain (no `ANTHROPIC_API_KEY`). `scripts/eval-all.sh --engine <agent>` and `--skip-<agent>` flags route across them.
- `bun run compress -- --check` / `scripts/eval-all.sh --regenerate-only` — both verified.
- `src/agents/registry.ts` — canonical `AGENTS` array; no inline agent configs scattered across files.

---

## 4. Decisions on the record

Don't relitigate without new information.

| Decision | Why | Where |
|---|---|---|
| TypeScript via Bun, not Rust/Go | OpenCode/Pi shims must be TS. Unifies the codebase and matches 3 of 5 peer-agent runtimes. | `package.json`, `src/` |
| Sentinel-block rules splice | Works on every agent regardless of `@import` support; idempotent; preserves user content. | `src/cli/install.ts`, BEGIN/END FULCRUM RULES markers |
| Hook recipes ship as binary subcommands | One source of truth; snippets reference `fulcrum hook <name>`. | `src/hooks/`, `hooks/recipes/*.snippet.md` |
| Skills install under `<agent-skills-root>/fulcrum/<name>/` | Path-based namespace; sets up the `fulcrum:<skill-name>` address space for the future plugin layer. | `src/cli/skills.ts` (NAMESPACE constant) |
| Skill `name:` stays prefix-free | Slash command stays short (`/jq`, not `/fulcrum:jq`); namespace is the parent dir. | `docs/skills.md` §4 |
| Eval harness uses `claude` CLI, not the Anthropic SDK | Auth lives in the OS keychain. Execution path matches how a real session loads a skill. | `scripts/eval-skill-claude.sh` |
| No GitHub Actions | Local `bun run ci` and `bun run release` are the gates. Future workflows must be additive. | absence of `.github/workflows/` |
| One tool, one skill | Exception: tightly-coupled CLIs (`dart format` + `dart analyze` → `dart-toolchain`). | `skills/SOURCES.md`, AGENTS.md |
| Skill content correctness is NOT implied by lint | Lint verifies frontmatter shape + body structure. Content must be verified against upstream at authoring time. | `AGENTS.md`, fix commit `08101c6` |
| Caveman ultra mandatory always-on | ~75% output-token reduction; `rules/AGENTS.md` §0b is the contract; `~/.config/caveman/config.json` is the runtime lock. | `rules/AGENTS.md` §0b, `lockCavemanUltra()` |
| Never use `~/.agents/` for skills | Shared folder pollutes every agent's context; `assertNotAgentsPath()` enforces this at runtime. | `src/cli/install.ts`, `~/.claude/CLAUDE.md` |
| Agent registry as single source of truth | Without a registry, agent defs drifted independently in install, doctor, and skills. | `src/agents/registry.ts` |
| Caveman compression of in-repo content is part of CI | Verbose skills waste tokens every session; hard-fail gate blocks accidental uncompressed commits. | `scripts/compress-with-caveman.sh`, `scripts/ci.ts` |
| Per-skill iteration over batch leaderboard tuning | Batch runs confound measurement between skills; one skill at a time is the safe unit. | `scripts/eval-skill-{claude,codex}.sh` |

---

## 5. Branch + commit map

```
50aa978  feat(foundation): close branch ship blockers
0ca8b88  feat(install): close managed setup gaps
b2ef962  docs: mark foundation polish complete
313357e  docs: mark skill eval pass complete
78fd68a  test(skills): tune Codex eval prompts
d22789d  feat(skills): slim skill loading
7e4e863  feat(eval): per-skill iteration pass — 20/28 skills meet 80/20 bar
ce3ca36  docs(handover): correct skill queue, add re-verify list + ship-the-branch section
cd35aa8  docs(handover): clean stale, document per-skill iteration procedure
70bbe72  feat(eval): per-skill match-words files + data-rich queries for all 28 skills
ef5d9e0  feat(eval): per-skill match-words files + data-rich queries for all 28 skills
... older foundation commits below ...
```

Branch should stay on `feat/agent-foundation-clean` for now. User does not want a PR or release from this branch right now; keep work local unless explicitly asked to push.

---

## 6. Remaining work — requirements gaps

These are the not-done or not-fully-covered items that still matter for the documented foundation target. They are not PR/release steps.

1. ~~**Pi MCP adapter integration for DeepWiki is documented but not implemented.**~~ **COMPLETE.** `installDeepwikiMcp` now calls `installPiDeepwikiAdapter` when `~/.pi/agent` is detected: runs `pi install npm:pi-mcp-adapter` and writes deepwiki into `~/.pi/agent/mcp.json`. `uninstallDeepwikiMcp` calls `uninstallPiDeepwikiAdapter`. Doctor reports `piMcpAdapter.{adapterPresent,deepwikiPresent}` in `--json`. `deriveTool` in `src/utils/io.ts` normalises Pi proxy-shape `mcp(server,tool)` calls to `mcp__<server>__<tool>` so routing policies match without duplication. Tests in `src/cli/doctor.test.ts` and `src/hooks/tool-output-router.test.ts`.
2. **`scripts/install.sh` does not pass through CLI install flags.** README documents `fulcrum install --no-skills` and `--no-upstream-skills`, but the bootstrap script only accepts `--with-project` and `--help`. Either add pass-through support for safe install flags or keep smoke recipes calling the installed `fulcrum` binary directly. Details: [README.md](README.md), [scripts/install.sh](scripts/install.sh), §7 below.
3. ~~**Hook enable/disable writes all five supported agent configs.**~~ **DONE.** `fulcrum hooks enable/disable` is now detection-aware by default — only writes configs for agents whose `rootDir` exists on disk. Pass `--all` for cross-machine/dotfiles setup. `removeAllHookRegistrations` (uninstall) applies same detection. `rootDir` field added to `Agent` interface and all 5 registry entries. Details: [docs/hooks.md](docs/hooks.md), `src/agents/registry.ts`, `src/cli/hooks.ts`.
4. ~~**Cross-agent skill smoke remains incomplete.**~~ **COMPLETE.** Trigger-rate harnesses now exist for all five agents: `scripts/eval-skill-{claude,codex,gemini,opencode,pi}.sh`. Each shares the same flag interface (`--model`, `--runs-per-query`, `--results-dir`, `--match-words`), JSONL output, match-words precedence, and 80/20 pass criteria. `scripts/eval-all.sh` accepts `--engine claude|codex|gemini|opencode|pi` and `--skip-<agent>` flags. Details: [docs/skill-smoke-test.md](docs/skill-smoke-test.md), [docs/skills.md](docs/skills.md) §7, `evals/README.md`.
5. ~~**New skill compression is a documented requirement, not a hard guard.**~~ **DONE.** Adding a new uncompressed `SKILL.md` now fails CI hard. `bun run compress -- --check` in scripts/ci.ts is no longer soft-fail; any `.md` file lacking a `.original.md` sibling will exit 1 and block the build. Details: [docs/caveman.md](docs/caveman.md), [skills/SOURCES.md](skills/SOURCES.md), `scripts/compress-with-caveman.sh`, `scripts/ci.ts`.
6. ~~**Curated upstream skill pins are repo-level, not subpath-level.**~~ **COMPLETE.** `skills/upstream.lock` now carries `subpath_sha256` (SHA-256 of canonicalized skill subtree) and `subpath_size` for all 20 locked skills. `fulcrum skills upstream` verifies each skill's subtree hash before copying it; exits non-zero on mismatch. `--update-pins` flag computes and writes new hashes. Default is verify-only. `computeSubpathSha256` exported from `src/cli/upstream-skills.ts` (deterministic across darwin/linux). Details: [docs/skills.md](docs/skills.md) §6, [skills/upstream.lock](skills/upstream.lock), `src/cli/upstream-skills.ts`.
7. **Future Agent OS layers are placeholders.** Repository supervisor, durable task system, agent runs, context engine, memory, artifacts, and plugins/extensions are named for alignment but not implemented. Details: [README.md](README.md), [AGENTS.md](AGENTS.md).

Before claiming the branch is done, run §7 verification again and update this section so any remaining gaps are explicit.

---

## 7. Smoke-test recipes

Run from repo root with `PATH="/opt/homebrew/bin:$HOME/.bun/bin:$HOME/go/bin:$HOME/.local/bin:$PATH"` (or a similarly broad PATH).

```bash
# 1. Type-check, tests, build, lint — single gate
bun run ci

# 2. Cross-compile sanity
bun run scripts/build-all.ts

# 3. End-to-end install into a scratch HOME (non-destructive; includes DeepWiki MCP)
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

# 4. Install flag smoke with authored skills disabled
# NOTE: call fulcrum directly; scripts/install.sh flag pass-through is pending §6.
SCRATCH=$(mktemp -d)
HOME=$SCRATCH PATH="$SCRATCH/.local/bin:$HOME/.bun/bin:$PATH" \
  bash scripts/install.sh
HOME=$SCRATCH PATH="$SCRATCH/.local/bin:$SCRATCH/.fulcrum/bin:$HOME/.bun/bin:$PATH" \
  fulcrum install --dry-run --no-skills
rm -rf $SCRATCH

# 5. Install flag smoke with upstream skills disabled
SCRATCH=$(mktemp -d)
HOME=$SCRATCH PATH="$SCRATCH/.local/bin:$HOME/.bun/bin:$PATH" \
  bash scripts/install.sh
HOME=$SCRATCH PATH="$SCRATCH/.local/bin:$SCRATCH/.fulcrum/bin:$HOME/.bun/bin:$PATH" \
  fulcrum install --dry-run --no-upstream-skills
rm -rf $SCRATCH

# 6. Curated upstream skills sync in a scratch HOME
SCRATCH=$(mktemp -d)
HOME=$SCRATCH PATH="$SCRATCH/.local/bin:$HOME/.bun/bin:$PATH" \
  bash scripts/install.sh
HOME=$SCRATCH PATH="$SCRATCH/.local/bin:$SCRATCH/.fulcrum/bin:$HOME/.bun/bin:$PATH" \
  fulcrum skills upstream
rm -rf $SCRATCH

# 7. Uninstall smoke
fulcrum uninstall --dry-run

# 8. Skill trigger-rate harnesses
scripts/eval-skill-claude.sh jq --model sonnet --runs-per-query 1 \
  --results-dir /tmp/jq-iter
scripts/eval-skill-codex.sh jq --model <codex-model>

# 9. Doctor JSON output
fulcrum doctor --json | jq .verdict
# expect: "ok", "warning", or "error"
```

---

## 8. Known limitations (current)

- **Trigger-rate eval harnesses exist for all five agents.** `scripts/eval-skill-{claude,codex,gemini,opencode,pi}.sh` — uniform flag interface, match-words detection, JSONL output, 80/20 pass criteria. `eval-all.sh` supports `--engine` and `--skip-<agent>` flags for all five.
- **Uninstall is conservative.** It does not remove caveman by default and keeps modified policy files unless `--purge`.
- **Third-party upstream sync uses subpath-level pins.** `skills/upstream.lock` pins both repo-level `tree_sha` and per-skill `subpath_sha256`. Subpath integrity is verified before each install; `--update-pins` refreshes hashes after a deliberate bump.
- **Managed MCP scope is intentionally narrow.** Fulcrum manages DeepWiki and context-mode. Other MCPs remain opt-in.
- **Claude Code MCP removal is manual.** Install can call `claude mcp add`, but uninstall prints `claude mcp remove -s user deepwiki` instead of invoking it.
- **OpenCode is archived** (2025-09-18). Successor: Charm's Crush. `shims/opencode/fulcrum.ts` is written against last-stable OpenCode; Crush's plugin contract may differ.
- **Pi DeepWiki MCP requires `pi-mcp-adapter`.** Fulcrum documents the adapter path but does not yet install/configure it or verify its tool-output shape (`docs/agents.md` §5.6, `docs/mcp.md` §3.1). This does not block managed context-mode on Pi, which uses `pi install npm:context-mode`.
- **`dist/` is gitignored.** Every fresh clone needs Bun to run `bash scripts/install.sh` (or set `FULCRUM_RELEASE_TAG=...` to fetch a release artifact).
- **Skill content correctness is the author's job.** Lint passes do not imply upstream-correct content. Fix commit `08101c6` corrected 19 skills after the fact; future authoring should verify inline.
- **Caveman ultra is mandatory but not enforced for new skills.** Any new `SKILL.md` added without a compression pass will deploy verbose content. Run `/caveman:compress skills/<name>/SKILL.md` before committing.

---

## 9. How to read this repo

- `README.md` — install + usage.
- `AGENTS.md` — project-level instructions and trajectory.
- `HANDOVER.md` — this file.
- `docs/` — per-topic foundation docs.
- `rules/AGENTS.md` — body spliced into each agent's primary rules file (90 lines, pure behavioral).
- `skills/SOURCES.md` — registry, queue, **caveman requirement** (mandatory).
- `evals/README.md` — eval harness contract.
- `git log --oneline` — chronological history.
