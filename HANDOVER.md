# Fulcrum — Handover

> Live snapshot of branch `feat/agent-foundation-clean`. Forward-looking only — historical event logs pruned. For archaeology: `git log` and per-commit messages.

## 0. Destination

**Fulcrum is a local-first CLI Agent OS for supervising repositories, tasks, agent runs, context, memory, and artifacts.**

The foundation layer (cross-agent install, hooks, skills, rules, output policy, CLI orchestrator) is in place. The supervisor / task system / agent-runs / context-engine / memory / artifacts / plugins layers are placeholders, not implementations. Remaining work is in §6. See `AGENTS.md` for the trajectory framing.

---

## 1. Current state — one paragraph

`feat/agent-foundation-clean` ships a Bun `fulcrum` CLI with project init, hook subcommands, hook config registration (detection-aware by default; `--all` opts back into cross-machine writes), hook snippet vending, rules splicing, non-destructive uninstall, in-repo skill sync, pinned curated upstream skill sync with subpath-level SHA-256 integrity verification, DeepWiki MCP registration across five agents (Pi via Fulcrum-managed `pi-mcp-adapter`), caveman install + ultra lock, caveman compression with hard CI gate, doctor (per-agent state + caveman config + Pi adapter check + 47 tools + policy), and local CI. 28 in-repo skills are lint-clean, caveman-compressed (`.original.md` beside each), and pass the trigger-rate eval bar on all five agents (Claude Code, Codex CLI, Gemini CLI, OpenCode, Pi CLI). Eight hook recipes (`format`, `lint-gate`, `pm-policy`, `test-on-edit`, `audit-log`, `index-check`, `index-rebuild`, `tool-output-router`) are TypeScript subcommands of the same binary. `src/agents/registry.ts` is the single source of truth for all 5 agent definitions, including `rootDir` for detection. No GitHub Actions are wired (intentional; opt-out). The branch is not in PR/release mode; remaining work is item 7 in §6 (future Agent OS layers).

---

## 2. Architecture

```
fulcrum (Bun binary; ~60–120 MB per platform)
├── fulcrum hook <name>     — 8 subcommands invoked via stdin JSON envelopes
│     • index-check, index-rebuild       (session lifecycle)
│     • format, lint-gate, test-on-edit  (PostToolUse Write|Edit)
│     • pm-policy                        (PreToolUse Bash)
│     • audit-log                        (PostToolUse Bash)
│     • tool-output-router               (PostToolUse any) — TOML-driven; Pi proxy-shape normalised
│
├── fulcrum init [DIR]      — bootstrap project AGENTS.md + .claude/CLAUDE.md
├── fulcrum install [--with-project DIR] [--dry-run]
│                  [--no-skills] [--no-upstream-skills]
│                            — sentinel-splice rules, vendor snippets, seed policy,
│                              caveman per-agent install, caveman ultra lock,
│                              context-mode managed integration,
│                              sync authored + curated upstream skills (with subpath SHA-256
│                              integrity check) unless opted out,
│                              register DeepWiki MCP for supported detected agents
│                              (Pi via auto-installed pi-mcp-adapter)
├── fulcrum uninstall [--dry-run] [--purge] [--include-caveman]
│                            — remove Fulcrum-managed rules blocks, hook configs/state,
│                              authored/upstream skill namespaces, generated
│                              Gemini import, unmodified policy; caveman only with flag
├── fulcrum hooks list/enable/disable [--all]
│                            — detection-aware native hook config edits + marker state
│                              (--all forces writes for every agent regardless of detection)
├── fulcrum skills sync     — fan out to <agent>/skills/fulcrum/<name>/
├── fulcrum skills upstream [--update-pins]
│                            — fan out curated upstream skills to <agent>/skills/fulcrum-upstream/<name>/;
│                              verifies per-skill subpath_sha256 against upstream.lock;
│                              --update-pins recomputes and writes new hashes
├── fulcrum skills lint     — frontmatter + body section structure
├── fulcrum skills list     — inventory + eval coverage
├── fulcrum compress        — compress in-repo content via caveman CLI; --check for CI (hard)
└── fulcrum doctor          — bun, agent dirs (rules-spliced state), caveman section
                                (defaultMode + per-agent install), 47 tools, policy,
                                Pi MCP adapter check; --json flag
```

Three agents (Claude Code, Codex, Gemini) call `fulcrum hook <name>` directly from native hook config. Two (OpenCode, Pi) load TypeScript shims from `shims/{opencode,pi}/fulcrum.ts` that re-dispatch to the same binary.

**Files map (durable):**

```
src/
├── index.ts                           # CLI dispatcher
├── types.ts
├── agents/
│   ├── registry.ts                    # single source of truth: Agent interface + AGENTS[5]
│   │                                    (includes rootDir for detection-aware hooks)
│   └── registry.test.ts
├── utils/
│   ├── io.ts                          # readHookEvent + deriveTool (Pi proxy-shape normaliser)
│   ├── io.test.ts
│   └── proc.ts                        # which, exists (handles dirs), run, spawnDetached
├── cli/
│   ├── init.ts          install.ts    # bootstrap + sentinel splice + caveman install + --dry-run
│   ├── uninstall.ts                   # conservative removal of managed artifacts
│   ├── context-mode.ts                # managed context-mode install/uninstall across 5 agents
│   ├── install.test.ts  uninstall.test.ts  context-mode.test.ts
│   ├── compress.ts                    # fulcrum compress subcommand
│   ├── hooks.ts         hooks.test.ts # detection-aware native hook config + skill orchestration
│   ├── skills.ts                      # authored skill sync + lint
│   ├── upstream-skills.ts             # pinned curated third-party skill installer w/ subpath SHA-256
│   ├── upstream-skills.test.ts
│   ├── mcp.ts                         # DeepWiki MCP registration + Pi adapter management
│   ├── doctor.ts                      # 47-tool + caveman + piMcpAdapter health; --json flag
│   └── doctor.test.ts
└── hooks/
    ├── audit-log.ts     format.ts     index-check.ts     index-rebuild.ts
    ├── lint-gate.ts     pm-policy.ts  test-on-edit.ts    tool-output-router.ts
    └── *.test.ts                      # tests across 8 hook files

shims/{opencode,pi}/fulcrum.ts         # in-process re-dispatch shims

scripts/
├── ci.ts                              # bun run ci  (install→tsc→test→build:all→skills:lint→compress:check[hard])
├── build-all.ts                       # cross-compile to 5 targets
├── release.ts                         # bun run release vX.Y.Z [--gh]
├── install.sh                         # bootstrap; forwards --with-project/--dry-run/--no-skills/--no-upstream-skills
├── compress-with-caveman.sh           # idempotent bash compress wrapper; --check for CI
├── eval-skill-{claude,codex,gemini,opencode,pi}.sh
│                                      # five trigger-rate harnesses; uniform flags
└── eval-all.sh                        # leaderboard runner; --engine <agent>; --skip-<agent>

config/tool-output-policy.toml         # default tier matrix for ~50 tools
hooks/recipes/*.snippet.md             # per-agent registration snippets
docs/                                  # context, hooks, skills, mcp, agents, capabilities, caveman, etc.
rules/AGENTS.md                        # 90-line pure behavioral rules; lint enforces ≤ 200 lines
skills/
├── _template/SKILL.md                 # required shape
├── <name>/SKILL.md × 28              # compact trigger/routing file; .original.md beside each
├── <name>/SKILL.original.md × 28     # human-edit form
├── <name>/references/*.md            # direct, progressively loaded section detail
├── <name>/references/*.original.md   # human-edit reference source
├── SOURCES.md                         # registry + queue + caveman requirement
└── upstream.lock                      # pinned curated third-party skill manifest
                                          (per-skill subpath_sha256 + subpath_size)
evals/<name>.json × 28                 # 18–21-entry trigger sets per skill
evals/<name>.match-words × 28          # per-skill match-words overrides
.gitleaksignore                        # one line — fake token in evals/gitleaks.json suppressed
cliff.toml + CHANGELOG.md
LICENSE (MIT)  AGENTS.md  README.md
```

---

## 3. What works (verified)

- `bun run ci` — green: install + tsc + 150 tests + 5 platform builds + skills:lint (28/28) + compress:check (hard, 0 pending).
- `bun run scripts/build-all.ts` — 5 targets (`darwin-arm64` ~63 MB, `darwin-x64` ~68 MB, `linux-x64`/`linux-arm64` ~101 MB, `windows-x64` ~118 MB).
- `bash scripts/install.sh [--dry-run] [--with-project DIR] [--no-skills] [--no-upstream-skills]` — splices rules, vendors snippets, seeds policy, forwards safe install flags. Idempotent. `FULCRUM_RELEASE_TAG=vX.Y.Z` fetches a prebuilt binary from GitHub Releases.
- `bun run release vX.Y.Z [--gh]` — clean-tree gate → CI → CHANGELOG → tag → cross-compile → optional `gh release create`. Does NOT push.
- `fulcrum install` — 9 steps: rules spliced into Claude Code / Codex CLI / OpenCode / Gemini / Pi; policy seeded; caveman per-agent; `~/.config/caveman/config.json` written `{"defaultMode":"ultra"}`; context-mode installed/configured per detected agent; authored in-repo skills synced unless `--no-skills`; curated upstream skills synced with subpath SHA-256 verification unless `--no-upstream-skills`; DeepWiki MCP registered for every detected agent (Pi via auto-installed `pi-mcp-adapter`). Respects `--dry-run`.
- `fulcrum uninstall` — removes Fulcrum-managed rules blocks, native hook registrations, hook snippets/markers, managed `skills/fulcrum/` and `skills/fulcrum-upstream/` namespaces, Gemini managed skill extensions, generated Gemini import, managed context-mode + DeepWiki registrations (Pi adapter mcp.json + settings.json package entry), and unmodified seeded policy. Keeps edited policy by default and keeps caveman unless `--include-caveman`; keeps the global `context-mode` and `pi-mcp-adapter` packages because upstream has no uninstall contract.
- `fulcrum skills upstream [--update-pins]` — reads `skills/upstream.lock`, checks out pinned upstream SHAs into `~/.fulcrum/cache/upstream-skills`, computes per-skill `subpath_sha256` and verifies against the lock, and installs 20 selected skills under `fulcrum-upstream/` (Gemini: `fulcrum-upstream-skills` extension). Mismatch exits non-zero. `--update-pins` recomputes and writes new hashes.
- `fulcrum hooks enable/disable [--all]` — detection-aware default (writes only for agents whose `rootDir` exists). `--all` opts back into all-agent writes. Records/removes intent markers; prints registration snippets for review.
- `fulcrum doctor [--json]` — agents detected + rules-spliced state; caveman section reports `defaultMode` + source (env / file / default / malformed) and per-agent install state; 47 tools tracked (incl. tmux, ast-grep, semgrep, knip, pip-audit, cargo-deny, phpstan, flarectl, etc.); policy presence + size + mtime; Pi MCP adapter check (`adapterPresent`, `deepwikiPresent`); `DoctorReport` JSON shape on `--json`.
- `assertNotAgentsPath()` / `lockCavemanUltra()` — hard guards in install.ts; both tested.
- `fulcrum skills sync` — all 28 compressed skills under `<agent>/skills/fulcrum/<name>/`.
- `fulcrum init <dir>` — seeds AGENTS.md, `.claude/CLAUDE.md` (`@AGENTS.md` import), `.gitignore`.
- `scripts/eval-skill-{claude,codex,gemini,opencode,pi}.sh <skill>` — five trigger-rate harnesses share `--model`, `--runs-per-query`, `--results-dir`, `--match-words`. Claude auth via keychain (no `ANTHROPIC_API_KEY`). `scripts/eval-all.sh --engine <agent>` and `--skip-<agent>` flags route across them.
- `bun run compress -- --check` — hard CI gate; non-zero on uncompressed `.md` (any file lacking `.original.md` sibling).
- `src/agents/registry.ts` — canonical `AGENTS` array with `rootDir` per agent; no inline agent configs scattered across files.

---

## 4. Decisions on the record

Don't relitigate without new information.

| Decision | Why | Where |
|---|---|---|
| TypeScript via Bun, not Rust/Go | OpenCode/Pi shims must be TS. Unifies the codebase and matches 3 of 5 peer-agent runtimes. | `package.json`, `src/` |
| Sentinel-block rules splice | Works on every agent regardless of `@import` support; idempotent; preserves user content. | `src/cli/install.ts`, BEGIN/END FULCRUM RULES markers |
| Hook recipes ship as binary subcommands | One source of truth; snippets reference `fulcrum hook <name>`. | `src/hooks/`, `hooks/recipes/*.snippet.md` |
| Hook enable/disable detection-aware | Avoid creating stub config files for agents the user does not have installed. `--all` opts back in for cross-machine setup. | `src/cli/hooks.ts`, `Agent.rootDir` |
| Skills install under `<agent-skills-root>/fulcrum/<name>/` | Path-based namespace; sets up the `fulcrum:<skill-name>` address space for the future plugin layer. | `src/cli/skills.ts` (NAMESPACE constant) |
| Skill `name:` stays prefix-free | Slash command stays short (`/jq`, not `/fulcrum:jq`); namespace is the parent dir. | `docs/skills.md` §4 |
| Upstream skill pins are subpath-level | Repo-level SHA does not authenticate a specific skill subtree on a monorepo upstream; per-skill SHA-256 closes that gap. | `skills/upstream.lock`, `src/cli/upstream-skills.ts` |
| Pi DeepWiki via Fulcrum-managed `pi-mcp-adapter` | Pi has no built-in MCP manager; the adapter bridges; Fulcrum installs and configures so the user does not assemble pieces by hand. | `src/cli/mcp.ts`, `docs/mcp.md` §3.3 |
| Eval harness uses native CLIs (`claude`, `codex`, `gemini`, `opencode`, `pi`), not the Anthropic SDK | Auth lives in the OS keychain. Execution path matches how a real session loads a skill. | `scripts/eval-skill-*.sh` |
| No GitHub Actions | Local `bun run ci` and `bun run release` are the gates. Future workflows must be additive. | absence of `.github/workflows/` |
| One tool, one skill | Exception: tightly-coupled CLIs (`dart format` + `dart analyze` → `dart-toolchain`). | `skills/SOURCES.md`, AGENTS.md |
| Skill content correctness is NOT implied by lint | Lint verifies frontmatter shape + body structure. Content must be verified against upstream at authoring time. | `AGENTS.md`, fix commit `08101c6` |
| Caveman ultra mandatory always-on | ~75% output-token reduction; `rules/AGENTS.md` §0b is the contract; `~/.config/caveman/config.json` is the runtime lock. | `rules/AGENTS.md` §0b, `lockCavemanUltra()` |
| Never use `~/.agents/` for skills | Shared folder pollutes every agent's context; `assertNotAgentsPath()` enforces this at runtime. | `src/cli/install.ts`, `~/.claude/CLAUDE.md` |
| Agent registry as single source of truth | Without a registry, agent defs drifted independently in install, doctor, and skills. | `src/agents/registry.ts` |
| Caveman compression is a HARD CI gate | Verbose skills waste tokens every session; soft gate let drift through. | `scripts/compress-with-caveman.sh`, `scripts/ci.ts` |
| Per-skill iteration over batch leaderboard tuning | Batch runs confound measurement between skills; one skill at a time is the safe unit. | `scripts/eval-skill-*.sh` |

---

## 5. Branch + commit map

Current HEAD on `feat/agent-foundation-clean`: see `git log --oneline -20` (chronological, durable). The most recent foundation-closure commits are:

```
fix(doctor): populate caveman section from config + per-agent install
feat(install): forward install flags through scripts/install.sh
docs(handover): mark items 1, 3-6 complete
feat(skills): subpath-level integrity for curated upstream pins
ci: harden compress:check gate
feat(eval): trigger-rate harnesses for Gemini, OpenCode, Pi
feat(hooks): detection-aware enable/disable
feat(mcp): manage Pi DeepWiki via pi-mcp-adapter
```

The branch should stay on `feat/agent-foundation-clean`. User does not want a PR or release from this branch right now; keep work local unless explicitly asked to push.

---

## 6. Remaining work

The foundation gaps that were tracked here (Pi MCP adapter, install.sh flag pass-through, detection-aware hooks, cross-agent eval harnesses, hard compress gate, subpath-level upstream pins) are all closed. CI is green, doctor reports `verdict: "ok"` on the developer's full setup. `git log` is the source of truth for what landed when.

The one outstanding scope item is the trajectory layer:

1. **Future Agent OS layers are placeholders.** Repository supervisor, durable task system, agent runs, context engine, memory, artifacts, and plugins/extensions are named for alignment but not implemented. They sit on top of the foundation and are out of scope for this branch. Details: [README.md](README.md) "What's not shipped yet", [AGENTS.md](AGENTS.md) "Where we are going". Designing each layer (data model, schema, CLI surface, persistence) is the next branch's work, not this one.

If a regression surfaces in the foundation layer, add it here with `<concrete reproduction>` + `<root cause>` + `<owner>` and re-open the branch. Otherwise §6 is empty for shipping purposes.

---

## 7. Smoke-test recipes

Run from repo root with `PATH="/opt/homebrew/bin:$HOME/.bun/bin:$HOME/go/bin:$HOME/.local/bin:$PATH"` (or a similarly broad PATH).

```bash
# 1. Type-check, tests, build, lint — single gate
bun run ci

# 2. Cross-compile sanity
bun run scripts/build-all.ts

# 3. End-to-end install into a scratch HOME (non-destructive; includes DeepWiki MCP + Pi adapter)
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
SCRATCH=$(mktemp -d)
HOME=$SCRATCH PATH="$SCRATCH/.local/bin:$HOME/.bun/bin:$PATH" \
  bash scripts/install.sh --dry-run --no-skills
rm -rf $SCRATCH

# 5. Install flag smoke with upstream skills disabled
SCRATCH=$(mktemp -d)
HOME=$SCRATCH PATH="$SCRATCH/.local/bin:$HOME/.bun/bin:$PATH" \
  bash scripts/install.sh --dry-run --no-upstream-skills
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

# 8. Skill trigger-rate harnesses (any/all five agents)
scripts/eval-skill-claude.sh   jq --model sonnet --runs-per-query 1 --results-dir /tmp/jq-claude
scripts/eval-skill-codex.sh    jq --model <codex-model>
scripts/eval-skill-gemini.sh   jq --runs-per-query 1
scripts/eval-skill-opencode.sh jq --runs-per-query 1
scripts/eval-skill-pi.sh       jq --runs-per-query 1
scripts/eval-all.sh --engine claude --skip-pi   # leaderboard slice example

# 9. Doctor JSON output
fulcrum doctor --json | jq .verdict
# expect: "ok", "warning", or "error"
fulcrum doctor --json | jq '.caveman, .piMcpAdapter'
```

---

## 8. Known limitations (current)

- **Uninstall is conservative.** It does not remove caveman by default and keeps modified policy files unless `--purge`.
- **Managed MCP scope is intentionally narrow.** Fulcrum manages DeepWiki and context-mode. Other MCPs remain opt-in.
- **Claude Code MCP removal is manual.** Install can call `claude mcp add`, but uninstall prints `claude mcp remove -s user deepwiki` instead of invoking it.
- **OpenCode is archived** (2025-09-18). Successor: Charm's Crush. `shims/opencode/fulcrum.ts` is written against last-stable OpenCode; Crush's plugin contract may differ.
- **`dist/` is gitignored.** Every fresh clone needs Bun to run `bash scripts/install.sh` (or set `FULCRUM_RELEASE_TAG=...` to fetch a release artifact).
- **Skill content correctness is the author's job.** Lint passes do not imply upstream-correct content. Fix commit `08101c6` corrected 19 skills after the fact; future authoring should verify inline.

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
