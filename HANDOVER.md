# Fulcrum — Handover

> Live snapshot of branch `main`. Forward-looking only — historical waves pruned. For archaeology: `git log --oneline -50` and per-commit messages.

## 0. Destination

**Fulcrum is a local-first CLI Agent OS for supervising repositories, tasks, agent runs, context, memory, and artifacts.**

The foundation layer (cross-agent install, hooks, skills, rules, output policy, CLI orchestrator, vendor-canonical project init, MCP registry) is in place. The supervisor / task system / agent-runs / context-engine / memory / artifacts / plugins layers are placeholders; remaining work is §6.

---

## 1. Current state

`main` ships a Bun `fulcrum` CLI that:

- **Installs cross-agent setup** (`fulcrum install`) — sentinel-splices `rules/AGENTS.md` into each detected agent's primary rules file; vendors hook recipe snippets; seeds `tool-output-policy.toml`; runs caveman vendor canonical install per agent (`claude plugin install caveman@caveman` / `gemini extensions install` / `npx skills add JuliusBrussee/caveman`); manages context-mode (npm + per-agent MCP+hooks+routing); installs vendor capability packages (Repomix Claude plugins + non-Claude mirrors, Cloudflare Claude plugin, Superpowers Claude/Gemini/OpenCode/Pi packages + Codex full skill mirror; Pi falls back to skill mirror only when `pi` is unavailable); registers DeepWiki MCP across 5 agents (Pi via auto-installed `pi-mcp-adapter`); registers 16 vendor MCPs in the registry (github, repomix, semgrep, context7, tavily, playwright, cloudflare-* ×9, dart) with minimal default state enabling only context7; syncs 27 authored skills + 27 upstream-pinned skills with subpath-level SHA-256 integrity verification and `vendor_canonical_agents` package-ownership skips.

- **Bootstraps projects** (`fulcrum init <dir>`) in three vendor-canonical phases:
  1. **Vendor integrations** — `graphify install --platform <agent>` per detected agent (Claude Code/Codex/OpenCode/Gemini); `npx skills add` for caveman, ast-grep, tavily; `pi install npm:pi-mcp-adapter` + `pi-mcp-adapter init` for Pi; defers context7 OAuth to manual `npx ctx7 setup`.
  2. **Strip duplicate vendor rule blocks** — vendor CLIs (`graphify install`) write rule text outside our `BEGIN/END FULCRUM RULES` sentinel; the same content lives in `rules/AGENTS.md` and is spliced inside the sentinel; `stripVendorRuleBlocks` removes the duplicate so agents don't load the rule twice. Vendor-installed hooks/settings remain untouched.
  3. **Project indices** — `graphify update .` + `repomix --compress`. Vendor-default output paths (`graphify-out/`, `repomix-output.xml`); NO Fulcrum-imposed flags or watchers. Live pattern matchers (rg, fd, ast-grep, jq, …) need no index and are not handled here. `fulcrum init reindex` re-runs phase 3 only.

- **Manages MCPs** (`fulcrum mcp list/register/unregister/enable/disable [--all]`) via a TOML registry at `~/.fulcrum/state/global/mcp-registry.toml`. Per-agent `applyToAgents` writes the canonical MCP shape with bearer auth wired:
  - Codex TOML: emits `bearer_token_env_var = "<VAR>"` for HTTP servers with a single `auth_env_var`.
  - Gemini / OpenCode / Pi: `headers.Authorization = "Bearer ${VAR}"` (or `{env:VAR}` for OpenCode's syntax) with vendor-side env interpolation.
  - Claude Code: `claude mcp add ... --header "Authorization: Bearer <token>"` — token expanded at install time because Claude does not interpolate `${VAR}` in stored headers.
  Minimal default state enables DeepWiki + context-mode + context7 where no user state exists. `fulcrum install --no-default-mcps` registers all MCP definitions/config without changing enable state; `fulcrum install --enable-all-mcps` is a verification switch that explicitly flips every builtin on across every detected agent.

- **Validates the environment** (`fulcrum doctor [--json] [--probe]`) — agent detection, rules-spliced state, caveman per-agent install + `defaultMode` source, Pi MCP adapter check, 47 BYO tools, tool-output policy presence. MCP registry section reports `auth_status` (env-var presence), `reachable` (HEAD probe / `which`), `drift` (`default_enabled=false` but some agent has it enabled), and `wiring` (per-agent native config inspection — confirms `bearer_token_env_var` / `headers.Authorization` is present for HTTP servers with declared auth). With `--probe`: spawns stdio MCPs / POSTs HTTP MCPs and asserts a valid JSON-RPC `initialize` reply within an 8s timeout. Catches wrong commands, stale URLs, and broken auth in one check.

- **Self-tests** via `bun run ci` — install → tsc → 273 tests → 5 platform builds → skills:lint → compress:check (hard gate, 0 pending). All green at every commit.

- **Verifies a fresh setup** via `docs/smoke-test.md` — self-contained markdown that any of the 5 agents can read as a prompt and execute step-by-step (16 checks, result table, failure remediation, append-only result log under `~/.fulcrum/state/global/smoke-test/<YYYY-MM-DD>.md`).

`src/agents/registry.ts` is the single source of truth for all 5 agent definitions, including `rootDir` for detection. No GitHub Actions; local `bun run ci` + `bun run release` are the gates.

---

## 2. Architecture

```
fulcrum (Bun binary; ~60–120 MB per platform)
├── fulcrum hook <name>     — 8 subcommands invoked via stdin JSON envelopes
│     • index-check, index-rebuild       (session lifecycle)
│     • format, lint-gate, test-on-edit  (PostToolUse Write|Edit)
│     • pm-policy                        (PreToolUse Bash)
│     • audit-log                        (PostToolUse Bash)
│     • tool-output-router               (PostToolUse any) — TOML; Pi proxy-shape normalised
│
├── fulcrum init [DIR] [--dry-run]
│                            — bootstrap project AGENTS.md + .claude/CLAUDE.md;
│                              run vendor-canonical agent installers; strip
│                              duplicate vendor rule blocks; build project indices.
├── fulcrum init reindex [DIR] [--dry-run]
│                            — re-run project indices only (graphify update .,
│                              repomix --compress). Vendor-default output paths.
├── fulcrum install [--with-project DIR] [--dry-run]
│                  [--no-skills] [--no-upstream-skills]
│                  [--no-default-mcps] [--enable-all-mcps]
│                            — sentinel-splice rules, vendor snippets, seed policy,
│                              caveman canonical per-agent install, caveman ultra
│                              lock, context-mode managed integration, sync
│                              authored + upstream skills (with subpath SHA-256),
│                              register DeepWiki MCP for detected agents (Pi via
│                              auto-installed pi-mcp-adapter), register 16
│                              builtin MCPs in the registry, enable context7
│                              by default unless --no-default-mcps,
│                              install vendor capability packages.
├── fulcrum uninstall [--dry-run] [--purge] [--include-caveman]
│                            — remove Fulcrum-managed rules blocks, native hook
│                              registrations, hook snippets/markers, managed
│                              skills/fulcrum/ namespace (third-party skills
│                              we placed at vendor paths stay — vendor owns
│                              them), generated Gemini import, vendor
│                              capability packages, managed
│                              context-mode + DeepWiki + MCP registry entries,
│                              caveman per agent (vendor canonical commands).
│                              Keeps caveman unless --include-caveman.
├── fulcrum hooks list/enable/disable [--all]
│                            — detection-aware native hook config edits + marker
│                              state. --all forces writes for every agent.
├── fulcrum skills sync     — Claude Code: plugin install (fulcrum@fulcrum
│                              from moabualruz/fulcrum marketplace); others:
│                              <agent>/skills/fulcrum/<name>/. Migrates legacy
│                              ~/.claude/skills/fulcrum/* to plugin layout.
├── fulcrum skills upstream [--update-pins]
│                            — fan out curated upstream skills directly to
│                              <agent>/skills/<name>/ (the vendor's own
│                              placement). Skipped per-agent when the lock
│                              entry's `vendor_canonical_agents` includes that
│                              agent — vendor's per-agent installer already
│                              owns the placement. Verifies subpath_sha256
│                              against upstream.lock; --update-pins recomputes.
├── fulcrum skills lint     — frontmatter + body section structure
├── fulcrum skills list     — inventory + eval coverage
├── fulcrum mcp list/register/unregister/enable/disable
│                            — registry CLI; per-agent or --all-agents toggle.
├── fulcrum compress        — compress in-repo content; --check for CI (hard).
└── fulcrum doctor [--json] [--probe]
                              — bun, agent dirs (rules-spliced state), caveman
                                section, 47 tools, policy, Pi MCP adapter, MCP
                                registry section (auth_status + reachable +
                                drift + wiring; +handshake when --probe).
```

Three agents (Claude Code, Codex, Gemini) call `fulcrum hook <name>` directly from native hook config. Two (OpenCode, Pi) load TypeScript shims from `shims/{opencode,pi}/fulcrum.ts` that re-dispatch to the same binary.

**Files map (durable):**

```
src/
├── index.ts                            # CLI dispatcher
├── types.ts
├── agents/
│   ├── registry.ts                     # Agent interface + AGENTS[5]; rootDir per agent
│   └── registry.test.ts
├── utils/
│   ├── io.ts io.test.ts                # readHookEvent + deriveTool (Pi proxy normaliser)
│   └── proc.ts                         # which, exists, run, spawnDetached
├── cli/
│   ├── init.ts init.test.ts            # bootstrap + reindex subcommand
│   ├── vendor-installs.ts              # graphify/caveman/ast-grep/tavily/pi-mcp-adapter installers
│   ├── vendor-packages.ts + .test.ts   # package-owned Cloudflare/Superpowers/Repomix-adjacent surfaces
│   ├── project-index.ts                # graphify update . + repomix --compress
│   ├── vendor-rules.test.ts            # stripVendorRuleBlocks behavior
│   ├── install.ts install.test.ts      # cross-agent install + stripVendorRuleBlocks
│   ├── uninstall.ts uninstall.test.ts  # conservative removal + vendor canonical uninstall
│   ├── context-mode.ts + .test.ts      # managed context-mode across 5 agents
│   ├── compress.ts                     # fulcrum compress
│   ├── hooks.ts hooks.test.ts          # detection-aware hook enable/disable
│   ├── skills.ts                       # authored skill sync + lint
│   ├── upstream-skills.ts + .test.ts   # pinned upstream skill sync w/ subpath SHA-256
│   ├── mirror-policy.test.ts           # vendor coverage tests
│   ├── mcp.ts                          # DeepWiki + Pi adapter management
│   ├── mcp-registry.ts + .test.ts      # TOML registry + applyToAgents
│   ├── mcp-builtins.ts                 # 16 builtin MCP specs (single source)
│   ├── mcp-cmd.ts + .test.ts           # fulcrum mcp CLI verbs
│   ├── doctor.ts + .test.ts            # health report w/ MCP section
│   └── …
└── hooks/
    ├── audit-log.ts format.ts index-check.ts index-rebuild.ts
    ├── lint-gate.ts pm-policy.ts test-on-edit.ts tool-output-router.ts
    └── *.test.ts

shims/{opencode,pi}/fulcrum.ts          # in-process re-dispatch shims

scripts/
├── ci.ts                               # bun run ci (6 stages)
├── build-all.ts                        # cross-compile to 5 targets
├── release.ts                          # bun run release vX.Y.Z [--gh]
├── install.sh                          # bootstrap; forwards safe install flags
├── compress-with-caveman.sh            # compress wrapper; --check for CI
├── eval-skill-{claude,codex,gemini,opencode,pi}.sh  # 5 trigger-rate harnesses
└── eval-all.sh                         # leaderboard runner

config/tool-output-policy.toml          # default tier matrix
hooks/recipes/*.snippet.md              # per-agent registration snippets
docs/                                   # context, hooks, skills, mcp, agents,
                                        #   capabilities, caveman, tool-output-policy,
                                        #   skill-smoke-test, user-guide, developer-guide,
                                        #   contributing, smoke-test
rules/AGENTS.md + .original.md          # behavioral rules body (≤ 200 lines);
                                        # spliced into agent rules files via
                                        # BEGIN/END FULCRUM RULES sentinel.
                                        # §12 carries vendor-tool behavioral rules
                                        # (graphify, etc) — single source.
skills/
├── _template/SKILL.md                  # required shape
├── <name>/SKILL.md × N                 # authored; .original.md beside each
├── <name>/references/*.md              # progressively loaded section detail
├── SOURCES.md                          # registry + queue
├── upstream.lock                       # pinned 3rd-party skills w/
│                                       # subpath_sha256; per-entry
│                                       # vendor_canonical_agents gates
│                                       # whether sync mirrors that agent
│                                       # (vendor's own placement otherwise).
└── _archive/                           # deprecated entries (gh-authored, ctx7-fork, etc)
evals/<name>.{json,match-words}         # per-skill 18-21 trigger entries
.gitleaksignore                         # suppressions for fixture tokens
cliff.toml + CHANGELOG.md
LICENSE (MIT)  AGENTS.md  README.md
```

---

## 3. What works (verified, current run)

- `bun run ci` — green: install + tsc + **273 tests** + 5 platform builds + skills:lint + compress:check (hard, 0 pending).
- `fulcrum install` — full sweep across 5 agents; doctor verdict ok on a fully-set-up machine.
- `fulcrum install --enable-all-mcps` — flips every builtin MCP on across every detected agent immediately after registration. End-to-end live verified 2026-04-29: 16/16 MCPs `handshake:ok` via `fulcrum doctor --probe`. Default install state enables only context7 from the builtin registry where no user state exists; skip via `--no-default-mcps`.
- `fulcrum init <dir>` — three phases run end-to-end on this repo: vendor integrations across detected agents, vendor rule de-duplication, project indices (`graphify-out/` + `repomix-output.xml`).
- `fulcrum mcp list --json` — 16 builtin servers visible; `enable`/`disable [--all-agents]` propagates to native config files with auth headers correctly wired per-agent.
- `fulcrum doctor` — verdict ok on this machine; per-agent state, caveman across 5 agents, Pi MCP adapter, DeepWiki, drift detection, auth-wiring inspection.
- `fulcrum doctor --probe` — actual JSON-RPC `initialize` per server. 16/16 servers handshake:ok across all 5 agents on this machine.
- `fulcrum uninstall --dry-run` — preview shows clean removal of every Fulcrum-managed artifact across 5 agents.
- `bash scripts/install.sh [--dry-run] [--with-project DIR] [--no-skills] [--no-upstream-skills] [--no-default-mcps] [--enable-all-mcps]` — flag pass-through verified bash 3.2-safe.
- `bun run release vX.Y.Z [--gh]` — clean-tree gate → CI → CHANGELOG → tag → cross-compile → optional `gh release create`. Does NOT push.
- `scripts/eval-skill-{claude,codex,gemini,opencode,pi}.sh <skill>` — five trigger-rate harnesses; uniform flags; PATH-missing guard.
- `docs/smoke-test.md` — self-contained agent-runnable verification prompt with 16 checks + result template + remediation links + append-only result log.

---

## 4. Decisions on the record

Don't relitigate without new information.

| Decision | Why | Where |
|---|---|---|
| TypeScript via Bun | OpenCode/Pi shims must be TS; matches 3/5 peer-agent runtimes. | `package.json`, `src/` |
| Sentinel-block rules splice | Works regardless of `@import` support; idempotent; preserves user content. | `src/cli/install.ts`, BEGIN/END FULCRUM RULES |
| Hook recipes ship as binary subcommands | One source of truth; snippets reference `fulcrum hook <name>`. | `src/hooks/`, `hooks/recipes/*.snippet.md` |
| Hook enable/disable detection-aware | Avoid stub configs for un-installed agents; `--all` opts back in. | `src/cli/hooks.ts`, `Agent.rootDir` |
| Skills install via per-agent native primitive | Claude Code: plugin (`fulcrum@fulcrum`, marketplace `moabualruz/fulcrum`) — Claude's loader only sees top-level of `~/.claude/skills/`, so the nested layout used by other agents is invisible there (anthropics/claude-code#28266). Codex/OpenCode/Pi: `<agent>/skills/fulcrum/<name>/` (loaders walk nested dirs). Gemini: extension namespace. All five resolve to `fulcrum:<skill-name>`. | `src/cli/skills.ts`, `.claude-plugin/{plugin,marketplace}.json` |
| Skill `name:` stays prefix-free | `/fulcrum:jq` (Claude plugin) or `/jq` (other agents) — invocation namespace comes from install path / plugin manifest, not frontmatter. | `docs/skills.md` §4 |
| Upstream skill pins are subpath-level | Per-skill SHA-256 prevents monorepo subtree drift. | `skills/upstream.lock`, `src/cli/upstream-skills.ts` |
| Third-party skills install at vendor placement, not in a fulcrum namespace | We don't own a `fulcrum-upstream/` (or any) subfolder for skills we didn't author. Sync mirrors files into `<agent>/skills/<name>/` — same path the vendor's own per-agent installer would use. When the vendor ships its own installer, `vendor_canonical_agents` lists which agents to skip so we don't double-write. | `skills/upstream.lock` (per-skill `vendor_canonical_agents`), `src/cli/upstream-skills.ts` (`agentTargets`, `syncUpstreamSkills` gate) |
| Pi DeepWiki via Fulcrum-managed `pi-mcp-adapter` | Pi has no built-in MCP manager; adapter bridges; we install + configure. | `src/cli/mcp.ts`, `docs/mcp.md` §3.3 |
| Eval harnesses use native CLIs, not SDKs | Auth in OS keychain; matches real session loading path. | `scripts/eval-skill-*.sh` |
| No GitHub Actions | Local `bun run ci` + `bun run release` are the gates. Future workflows additive. | absence of `.github/workflows/` |
| One tool, one skill | Exception: tightly-coupled CLIs (e.g. `dart-toolchain`). | `skills/SOURCES.md`, `AGENTS.md` |
| Skill content correctness NOT implied by lint | Vendor-first sourcing; never re-author content the vendor publishes. | `docs/mcp.md` §1, `AGENTS.md` |
| Caveman ultra mandatory always-on | ~75% output-token cut; lock at `~/.config/caveman/config.json`. | `rules/AGENTS.md` §0b, `lockCavemanUltra()` |
| Caveman compression a HARD CI gate | Verbose skills waste tokens; soft gate let drift through. | `scripts/compress-with-caveman.sh`, `scripts/ci.ts` |
| Never use `~/.agents/` for skills | Shared folder pollutes every agent; `assertNotAgentsPath()` enforces. | `src/cli/install.ts`, `~/.claude/CLAUDE.md` |
| Agent registry as single source of truth | Without it, agent defs drifted across install/doctor/skills. | `src/agents/registry.ts` |
| Per-skill iteration over batch eval tuning | Batch confounds measurement between skills. | `scripts/eval-skill-*.sh` |
| Managed scope is OFFICIAL-FIRST | Manage every vendor-published agent asset; mirror verbatim into agents the vendor doesn't ship for; never re-author. MCPs with non-trivial cost default-disabled. | `docs/mcp.md` §1 |
| `fulcrum init` runs vendor commands verbatim | No `--output` overrides, no Fulcrum-managed watchers, no manual hook duplication. Vendor owns paths/filters/hooks. | `src/cli/vendor-installs.ts`, `src/cli/project-index.ts` |
| Vendor behavioral rules live in `rules/AGENTS.md` § Vendor-tool behavioral rules | Single source spliced via FULCRUM sentinel; vendor's duplicate written outside the sentinel is stripped post-install (`stripVendorRuleBlocks`). | `rules/AGENTS.md` §12, `src/cli/install.ts` |
| Project-index ≠ vendor-install | Two distinct concerns; two distinct modules. Live pattern matchers (rg, fd, ast-grep, jq, …) need no index. | `vendor-installs.ts` vs `project-index.ts` |

---

## 5. Branch + commit map

`main` is the active branch. See `git log --oneline -50` for the current chronology — durable. Tag releases via `bun run release vX.Y.Z [--gh]`.

Recent (2026-04-29 session, all on `main`, pushed): MCP bearer auth wiring across 5 agents (`bearer_token_env_var` for codex; `headers.Authorization` with per-agent interpolation for claude/gemini/opencode/pi); doctor `drift` + `wiring` + `--probe` MCP `initialize` handshake; install `--enable-all-mcps` verification flag; vendor URL/cmd drift fixes (cloudflare-logpush → `logs.mcp.cloudflare.com`, semgrep → `semgrep mcp`); OpenCode stdio shape fix (`command` array); removal of the `fulcrum-upstream/` namespace (third-party skills now land at vendor placement directly).

---

## 6. Remaining work

Foundation gaps tracked in earlier revisions are all closed. CI green; doctor verdict ok on a fully-set-up machine; smoke-test prompt at `docs/smoke-test.md` is the canonical post-install verification.

The trajectory layer below is the next-branch work — none of it is implemented. Build order is top-down because later layers consume earlier layers' state.

### 6.1 Repository supervisor — `fulcrum repo …`

**Goal.** Track which repos the user works in, working-tree posture, branch state, per-repo settings.

**Why first.** Every later layer (tasks, runs, artifacts) is keyed by repo.

**Depends on.** Foundation only.

**Data model.**
```
repos(id, slug, root_path, default_branch, remote_url, registered_at, last_seen_at)
repo_status(repo_id, current_branch, head_sha, ahead, behind, dirty, untracked, last_checked_at)
repo_settings(repo_id, key, value)
```

**CLI surface.** `register`, `list`, `show`, `refresh`, `forget`, `set`, `get`.

**Persistence.** `~/.fulcrum/state/global/repos.db` (SQLite via `bun:sqlite`).

**Hook integration.** New `repo-track` hook on `SessionStart`-equivalents → register + refresh for cwd.

**Success.** `fulcrum repo list --json` deterministic; doctor reports `repos.count` + dead-path warnings.

### 6.2 Memory — `fulcrum memory …`

**Goal.** Persistent facts, decisions, references across sessions.

**Depends on.** Foundation.

**Data model.**
```
memories(id, scope, kind, key, body, source, created_at, updated_at)
memory_links(memory_id, ref_kind, ref_id)
```
Scope: `global` | `repo:<slug>` | `task:<id>`. FTS5 over `body`.

**CLI surface.** `put`, `get`, `list`, `rm`, `link`, `search`.

**Persistence.** `~/.fulcrum/state/global/memory.db`.

**Hook integration.** Optional `memory-inject` on `SessionStart` — top-N by recency for current repo.

**Success.** Round-trip persists across shell restart; FTS hits expected term.

### 6.3 Task system — `fulcrum tasks …`

**Goal.** Durable units of work tracked across sessions.

**Depends on.** §6.1, §6.2.

**Data model.**
```
tasks(id, repo_id, parent_id, title, description, status, priority, …)
task_blocks(blocker_id, blocked_id)
task_tags(task_id, tag)
```
Status: `pending|in_progress|blocked|completed|cancelled`.

**CLI surface.** `add`, `list`, `show`, `update`, `block`, `unblock`, `tree`, `done`.

**Persistence.** `~/.fulcrum/state/<slug>/tasks.db`.

### 6.4 Agent runs — `fulcrum runs …`

**Goal.** First-class agent invocations: input, model, attached context, transcript, exit, cost.

**Depends on.** §6.1, §6.2, §6.3.

**Data model.**
```
runs(id, task_id, repo_id, agent, model, prompt, started_at, ended_at,
     status, exit_code, transcript_path, total_tokens, cost_usd, parent_run_id)
run_inputs(run_id, kind, ref_id)
run_events(run_id, ts, kind, payload_json)
```

**CLI surface.** `start`, `list`, `show`, `transcript`, `retry`, `cancel`, `cost`.

**Persistence.** `~/.fulcrum/state/<slug>/runs.db` + `runs/<id>.jsonl`.

**Hook integration.** `run-record` on `SessionEnd` writes row + transcript.

### 6.5 Context engine — `fulcrum context …`

**Goal.** Select + assemble what a run sees.

**Depends on.** §6.1–6.4.

**Data model.**
```
context_profiles(id, name, repo_id, body_yaml)
context_assemblies(id, run_id, profile_id, body_md, token_count, created_at)
```

**CLI surface.** `profile add/list/show`, `assemble`, `attach`.

**Success.** Same profile + same inputs ⇒ byte-identical assembly.

### 6.6 Artifacts — `fulcrum artifacts …`

**Goal.** Outputs of runs (diffs, plans, reports) tracked + queryable.

**Depends on.** §6.1, §6.3, §6.4.

**Data model.**
```
artifacts(id, run_id, task_id, kind, title, body_path, sha256, size, mime, created_at)
artifact_tags(artifact_id, tag)
```

**CLI surface.** `put`, `list`, `show`, `cat`, `diff`, `gc`.

**Persistence.** `~/.fulcrum/state/<slug>/artifacts.db` + body files.

### 6.7 Plugins / extensions — `fulcrum plugins …`

**Goal.** Third-party drop-ins under each agent's namespacing convention.

**Depends on.** All prior layers.

**Data model.**
```
plugins(id, name, source_repo, source_sha, manifest_json, installed_at)
plugin_enables(plugin_id, scope)
plugin_capabilities(plugin_id, capability)
```

**CLI surface.** `add`, `list`, `enable/disable`, `update`, `rm`.

### Build order + branch plan

| # | Branch | Layer | Depends |
|---|---|---|---|
| 1 | `feat/repo-supervisor` | §6.1 | foundation |
| 2 | `feat/memory` | §6.2 | foundation (parallel-safe with 1) |
| 3 | `feat/task-system` | §6.3 | 1, 2 |
| 4 | `feat/agent-runs` | §6.4 | 1, 2, 3 |
| 5 | `feat/context-engine` | §6.5 | 1–4 |
| 6 | `feat/artifacts` | §6.6 | 1, 3, 4 (parallel-safe with 5) |
| 7 | `feat/plugins` | §6.7 | 1–6 |

### Cross-layer rules

- Persistence root: `~/.fulcrum/state/<slug>/` (per-project) or `~/.fulcrum/state/global/`.
- SQLite via `bun:sqlite`. Schema versioning via `PRAGMA user_version`. Migrations in `src/<layer>/migrations/NNNN-name.sql` applied on first read.
- CLI shape: `fulcrum <layer> <verb> [args] [--json]`. List/get verbs always `--json`-capable. State-changing verbs idempotent.
- IDs: opaque ULID (`01H…` 26-char). FK columns store ULID text; no autoincrement.
- Tests: every layer ships `<layer>.test.ts` covering migration + happy-path + idempotency.
- Docs: every layer adds `docs/<layer>.md` (data model, CLI verbs, hook integration, edge cases).
- Doctor: every layer extends `DoctorReport` with row-count + latest-activity + missing-bodies + schema-version.
- Uninstall: every layer adds removal/keep policy to `src/cli/uninstall.ts` (default keep; `--purge` removes).
- No new shared dirs; honor `assertNotAgentsPath()`.

If a foundation regression surfaces, add it back here with `<concrete reproduction>` + `<root cause>` + `<owner>` and re-open the relevant area.

---

## 7. Manual setup checklist (per machine)

`fulcrum install` does the file/config side. Auth + binary toolchain remain operator's responsibility per `docs/capabilities.md` (BYO toolchain).

### A. Toolchain (one-time, before `fulcrum install`)

```
brew install ripgrep fd fzf jq yq bat sd eza zoxide xh gh just mise direnv \
  tmux difftastic universal-ctags hyperfine watchexec ast-grep gitleaks git-cliff \
  semgrep phpstan
pipx install pip-audit lizard          # or: python3 -m pip install --user
npm install -g repomix knip
cargo install cargo-deny
uv tool install graphifyy tavily-cli
go install github.com/cloudflare/cloudflare-go/cmd/flarectl@latest   # optional; symlink onto PATH
brew install usql                                                    # optional
```

`fulcrum doctor` enumerates anything missing. Items marked "fail-open" are non-blocking — install only if you actively use the tool/skill.

### B. Run `fulcrum install`

```
bash scripts/install.sh
```

Splices rules; vendors hook snippets; seeds policy; installs caveman per agent (vendor canonical commands); installs context-mode; syncs 27 authored + 27 upstream skills with subpath SHA-256; registers DeepWiki MCP across 5 agents (Pi via auto-installed `pi-mcp-adapter`); registers 16 builtin MCPs and enables context7 as minimal default; installs 3 vendor Repomix Claude plugins.

### C. MCP auth

```
mkdir -p ~/.config/fulcrum-secrets
cat > ~/.config/fulcrum-secrets/env.sh <<'EOF'
# For MCPs you plan to enable. Each var maps directly to an MCP's
# auth_env_vars; applyToAgents reads the env at install time and wires
# the right per-agent shape (codex bearer_token_env_var; others
# headers.Authorization). MUST be sourced before `fulcrum install`.
export GITHUB_TOKEN="$(gh auth token 2>/dev/null)"
export CLOUDFLARE_API_TOKEN="..."
export CLOUDFLARE_ACCOUNT_ID="..."
export TAVILY_API_KEY="..."
export CONTEXT7_API_KEY="..."     # optional — context7 free tier works keyless
# export SEMGREP_APP_TOKEN="..."  # optional, managed semgrep rules
EOF
chmod 600 ~/.config/fulcrum-secrets/env.sh
grep -q "fulcrum-secrets/env.sh" ~/.zshrc \
  || echo '[ -f ~/.config/fulcrum-secrets/env.sh ] && source ~/.config/fulcrum-secrets/env.sh' >> ~/.zshrc
source ~/.zshrc
```

Per-MCP source links + auth methods: `docs/mcp.md` §5. Re-running `fulcrum install` after editing `env.sh` re-writes per-agent MCP blocks with the new tokens.

**Note on Claude Code**: `claude mcp add --header` does not interpolate `${VAR}`. Tokens are expanded at install time and stored verbatim in `~/.claude.json`. File mode is your $HOME default; treat that file as a secret store.

### D. Adjacent CLI auth

```
gh auth login                                  # GitHub
gcloud auth login && gcloud auth application-default login   # Google Cloud + ADC
wrangler login                                 # Cloudflare Workers OAuth
```

### E. Selectively enable MCPs

Default install state: every builtin MCP is registered; context7 is enabled as minimal default only where no user state exists; other builtin MCPs stay disabled (16 active = ~150–300k tokens at session start). Use `--no-default-mcps` for registry-only/no-state-change setup, opt in selectively, or use `--enable-all-mcps` for verification.

```
fulcrum mcp enable github --all-agents
fulcrum mcp enable tavily --agent claude-code
fulcrum mcp list                   # see state
fulcrum mcp disable <name> --all-agents

# Verification mode — flips every builtin on across every detected agent.
# Doctor reports drift:default-disabled-but-enabled while in this state.
bash scripts/install.sh --enable-all-mcps
```

### F. Per-project bootstrap

```
fulcrum init <project-dir>          # vendor integrations + index build
fulcrum init reindex <project-dir>  # rebuild project indices only
```

### G. Verify

Canonical: `docs/smoke-test.md` (cross-agent prompt). Quick:

```
fulcrum doctor                              # human; verdict at the end
fulcrum doctor --probe                      # also runs MCP `initialize` per server (~10s)
fulcrum doctor --json | jq '.verdict, .mcp.servers[] | {name, handshake, wiring, drift}'
```

---

## 7a. Next-session ordering — first two steps

1. **Run the smoke test on a fresh agent session.**
   `claude -p "$(cat docs/smoke-test.md)" --output-format json` (or the equivalent for codex / gemini / opencode / pi). Result lands at `~/.fulcrum/state/global/smoke-test/<YYYY-MM-DD>.md`. Triage every `✗` row; fix the underlying setup or code; re-run until the result table is all `✓`.

2. **Author the cross-agent subagent-orchestration skill.**
   Read `docs/subagent-guidance.notes.md` first — captures the user's scattered guidance on subagent workflow from session 2026-04-28/29 (parallel-vs-serial, model-effort matching, review-protocol, research-then-plan-then-implement, vendor-first sourcing, scope discipline, scratch-HOME testing, fail-soft per tool, no overengineering).
   Then research online to enrich it. Targets:
   - Anthropic Agent SDK + Claude Code subagent docs (`code.claude.com/docs/en` — search "subagent", "Agent tool", "background tasks", "isolation modes")
   - Multi-agent orchestration patterns: map-reduce / fan-out / supervisor-worker; token-budget control; hand-off checkpoints; failure isolation
   - Cross-agent dispatch surfaces: what each of Claude Code, Codex, Gemini, OpenCode, Pi exposes for "delegate to a subagent" — confirm contract, not assume
   - Existing community skills in this space (search `obra/superpowers-lab`, `mitsuhiko/agent-stuff`, anthropic/skills)
   Output:
   - `skills/subagent-orchestration/SKILL.md` (frontmatter + 5 H2 sections per `skills/_template/SKILL.md`); name `/subagent-orchestration` (or shorter if a vendor publishes a canonical name first — vendor-first policy applies).
   - `skills/subagent-orchestration/references/*.md` for progressive detail.
   - `evals/subagent-orchestration.json` (18–21 entries; trigger / anti-trigger split).
   - `evals/subagent-orchestration.match-words` for word-bounded match keywords.
   - caveman compress; pass `bun run skills lint`; verify 4-of-5 trigger eval bar via `scripts/eval-skill-claude.sh subagent-orchestration` and the codex sibling.
   Constraint: vendor-first. If the Anthropic / Claude team or a tool vendor already publishes an "agent orchestration" skill at an official source, pin that into `skills/upstream.lock` and only author the gap parts. Do not re-implement what is published.

3. After both pass, proceed with layer §6.1 (Repository supervisor) per the build-order branch plan above.

If the smoke test surfaces an issue, fix it (commit per logical change) before moving to step 2.

---

## 8. Smoke-test recipes

```bash
# Full agent-runnable verification (16 checks, append-only result log)
claude   -p "$(cat docs/smoke-test.md)" --output-format json
codex    "$(cat docs/smoke-test.md)"
gemini   -p "$(cat docs/smoke-test.md)" --output-format json --yolo
opencode run --format json "$(cat docs/smoke-test.md)"
pi       --print "$(cat docs/smoke-test.md)" --mode json --no-session

# Quick pulses
bun run ci                              # 6-stage gate
bun run scripts/build-all.ts            # 5-target cross-compile
fulcrum install --dry-run               # preview
fulcrum uninstall --dry-run             # preview
fulcrum doctor --json | jq .verdict     # ok / warning / error
fulcrum mcp list --json                 # 16 builtin servers
scripts/eval-all.sh --engine claude --skip-pi   # leaderboard slice
```

Per-skill harnesses: `scripts/eval-skill-{claude,codex,gemini,opencode,pi}.sh <skill>`. Result log: `~/.fulcrum/state/global/smoke-test/<YYYY-MM-DD>.md` (append-only).

---

## 9. Known limitations

- **Uninstall is conservative.** Does not remove caveman without `--include-caveman`; keeps modified policy unless `--purge`.
- **Claude Code MCP removal is partially manual.** Install calls `claude mcp add`; uninstall prints `claude mcp remove -s user deepwiki` rather than invoking it.
- **OpenCode is archived** (2025-09-18). Successor: Charm's Crush. `shims/opencode/fulcrum.ts` targets last-stable OpenCode; Crush's plugin contract may differ.
- **Pi has no Fulcrum-published Pi extension** — `pi-mcp-adapter` is vendored from `nicobailon/pi-mcp-adapter` (community, not Pi vendor). We use it as MCP infrastructure but it's not a vendor-official asset.
- **graphify does not list Pi as a supported agent.** Init falls back to file-copy mirror at `~/.pi/agent/skills/graphify/`. The lock entry's `vendor_canonical_agents = ["claude-code", "codex", "gemini", "opencode"]` excludes pi.
- **`dist/` is gitignored.** Fresh clone needs Bun (`bash scripts/install.sh`) or `FULCRUM_RELEASE_TAG=...` to fetch a release artifact.
- **Skill content correctness is the author's job.** Lint validates frontmatter shape only. Vendor-first policy minimizes this risk for new skills (use vendor-published source, never re-author).
- **stripVendorRuleBlocks scope = user-global rules files only.** Project-root `CLAUDE.md` / `GEMINI.md` written by `graphify install` are .gitignored rather than stripped (vendor controls those by design).
- **Claude Code stores HTTP MCP tokens verbatim in `~/.claude.json`.** `claude mcp add --header` does not interpolate `${VAR}`. `applyToClaudeCode` expands the env var at install time and writes the literal token; the file is your primary leak surface for tokens of MCPs you've enabled for Claude Code. Other agents (codex `bearer_token_env_var`, gemini/opencode/pi `${VAR}`/`{env:VAR}`) keep tokens in env, not on disk.
- **No automatic vendor-URL drift detection.** When a vendor retires an MCP host (cloudflare-logpush did this — moved from `logpush.mcp.cloudflare.com` to `logs.mcp.cloudflare.com`), `fulcrum doctor --probe` will flag `handshake:fail` once you run it, but the drift surfaces only as user-visible breakage. No periodic upstream-diff alarm yet.

---

## 10. How to read this repo

- `README.md` — install + usage.
- `AGENTS.md` — project-level instructions and trajectory.
- `HANDOVER.md` — this file.
- `docs/user-guide.md` — end-user usage.
- `docs/developer-guide.md` — repo layout, architecture, contributing code.
- `docs/contributing.md` — workflow + conventions.
- `docs/smoke-test.md` — agent-runnable post-install verification prompt.
- `docs/subagent-guidance.notes.md` — captured user guidance on subagent workflow; source for the cross-agent subagent-orchestration skill (see §7a step 2).
- `docs/{context,hooks,skills,mcp,agents,capabilities,caveman,tool-output-policy,skill-smoke-test}.md` — per-topic foundation docs.
- `rules/AGENTS.md` — body spliced into each agent's primary rules file (≤ 200 lines, vendor-tool conventions only).
- `skills/SOURCES.md` — skill registry + authoring queue.
- `skills/upstream.lock` — pinned vendor skills with subpath SHA-256.
- `evals/README.md` — eval harness contract.
- `git log --oneline -50` — chronological history.
