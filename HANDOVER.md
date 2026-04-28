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
│   ├── mcp-registry.ts                # MCP registry TOML store + applyToAgents/removeFromAgents
│   ├── mcp-cmd.ts                     # fulcrum mcp list/register/unregister/enable/disable
│   ├── mcp-registry.test.ts           # registry round-trip + enable/disable + apply/remove
│   ├── mcp-cmd.test.ts                # CLI verb round-trip
│   ├── doctor.ts                      # 47-tool + caveman + piMcpAdapter + mcp section health; --json flag
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
- `fulcrum skills upstream [--update-pins]` — reads `skills/upstream.lock`, checks out pinned upstream SHAs into `~/.fulcrum/cache/upstream-skills`, computes per-skill `subpath_sha256` and verifies against the lock, and installs 28 curated skills under `fulcrum-upstream/` (Gemini: `fulcrum-upstream-skills` extension). Mismatch exits non-zero. `--update-pins` recomputes and writes new hashes.
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

The branch is being fast-forward-merged into `main` without a PR; no release yet. Once on `main`, layer work below proceeds on a new branch per layer.

---

## 6. Remaining work

### 6.0 Official-first migration (DONE — for archive)

Policy reversal landed 2026-04-28: managed scope is **official-first** across every vendor-published agent asset. Captured in §4 and `docs/mcp.md` §1:

> Manage every official vendor-published asset for tools in `docs/capabilities.md`: Claude plugin, MCP server, Gemini extension, OpenCode plugin, Pi package, vendor SKILL.md. Mirror vendor content verbatim into agents the vendor does not ship for. Never re-author content the vendor already publishes. MCPs with non-trivial startup cost are registered-but-disabled by default; per-session toggle via `fulcrum mcp enable/disable`.

**All three waves shipped.** Summary:

| Wave | Items | Outcome |
|---|---|---|
| W1 | Caveman canonical install/uninstall (`claude plugin uninstall`, `gemini extensions uninstall`, `npx skills add/remove`); Wrangler vendor skill pinned; ast-grep Claude plugin install path | `src/cli/install.ts`, `src/cli/uninstall.ts`, `src/cli/upstream-skills.ts`, `skills/upstream.lock` |
| W2 | MCP registry infra (`mcp-registry.ts`, `mcp-cmd.ts`, doctor `mcp` section); github MCP; repomix MCP + 3 Claude plugins; authored `gh` skill archived to `skills/_archive/gh-authored/` | `src/cli/mcp-registry.ts`, `src/cli/mcp-cmd.ts`, `src/cli/mcp-builtins.ts`, `src/cli/doctor.ts` |
| W3 | semgrep / context7 / tavily / playwright / dart MCPs; Cloudflare 9-endpoint suite | `src/cli/mcp-builtins.ts` (16 builtin servers total) |

**Built-in managed MCPs (16):** `github`, `repomix`, `semgrep`, `context7`, `tavily`, `playwright`, `dart`, `cloudflare-docs`, `cloudflare-workers-bindings`, `cloudflare-workers-builds`, `cloudflare-observability`, `cloudflare-radar`, `cloudflare-logpush`, `cloudflare-browser`, `cloudflare-containers`, `cloudflare-ai-gateway`. All default-disabled. Plus always-on `deepwiki` + `context-mode`.

**Tools with NO official vendor agent assets (authored skills retained):**
- §1 Foundation: ripgrep, fd, fzf, jq, yq, bat, sd, eza, zoxide, xh, just, mise, direnv, tmux, difftastic, hyperfine, watchexec, universal-ctags, gitleaks, git-cliff
- §2 Code intel: ast-grep (vendor skill pinned + Claude plugin path), lizard
- §4 Services: gws, hcloud (no vendor MCP; community sources rejected), usql
- §5 Language tools: every tool — vendors publish nothing for agents. Authored skills cover editor surface; CI tooling stays BYO per `docs/capabilities.md`.

**Mirror policy.** When a vendor publishes only for some agents (e.g. repomix's 3 Claude plugins, cloudflare's `skills/` subtree, ast-grep's `.claude-plugin/` content), the vendor's exact bytes must be copied into the other agents' skill paths without rewriting. Source-truth lives in `~/.fulcrum/cache/<vendor>/`; mirror copies are byte-identical.

**Mirror translation audit completed 2026-04-28.** Full vendor surface inventory done for every managed vendor; §6.0b below is now closed.

---

### 6.0c fulcrum init — vendor-canonical integrations (DONE 2026-04-28)

`fulcrum init <dir>` now runs vendor-canonical commands after writing AGENTS.md / .claude/CLAUDE.md / .gitignore. Implemented in `src/cli/init-vendor.ts` (`runVendorIntegrations`).

**Per-tool commands run (exact vendor docs, no Fulcrum path overrides):**

| Tool | Command | Notes |
|---|---|---|
| graphify | `graphify claude install` (Claude Code) | cwd=dir; NEVER --output |
| graphify | `graphify install --platform codex` | when Codex detected |
| graphify | `graphify install --platform opencode` | when OpenCode detected |
| graphify | `graphify install --platform gemini` | when Gemini detected |
| graphify + Pi | (skipped) | vendor CLI does not list Pi; log note only |
| caveman | `npx skills add JuliusBrussee/caveman` | no -a flag; skills.sh auto-detects agent |
| ast-grep | `npx skills add ast-grep/agent-skill` | no -a flag; auto-detects agent |
| tavily | `npx skills add https://github.com/tavily-ai/skills` | covers all 7 tavily skills |
| repomix | (no-op in init) | Claude Code plugins handled by `fulcrum install` W2; MCP via registry |
| context7 | (deferred note printed only) | OAuth is interactive; never spawned |
| pi-mcp-adapter | `pi install npm:pi-mcp-adapter` + `pi-mcp-adapter init` | only when Pi detected and `pi` on PATH |

**DO NOT** list (hard constraints):
- Never pass `--output` or any path override to graphify or repomix.
- Never spawn interactive auth flows (context7 setup).
- Never write hook registrations or skill file copies in `init-vendor.ts` — those belong to `fulcrum install`.
- No watchers, no PID lockfiles, no `.fulcrum/` scratch dirs, no `--no-indices`/`--no-watchers` flags.

**Additional subcommand:**

`fulcrum init reindex [DIR]` — runs `repomix --compress` in DIR with NO `--output` flag (vendor default output = `repomix-output.xml`). Skips if `repomix` not on PATH.

**Lockfile delta (2026-04-28):**
- Removed from `skills/upstream.lock`: `[skills.ast-grep]` + `[skills.ast-grep.claude_plugin]`, `[skills.tavily-*]` ×7.
- Archived to `skills/_archive/upstream-removed.lock` with `archive_reason`.
- Removed from `src/cli/install.ts`: `installCavemanByCopy`, `copyDirRecursive`, `cloneOrUpdateDry`, `ensureClone` clone-and-copy fallback for Codex/OpenCode/Pi.
- Removed from `src/cli/upstream-skills.ts`: `ClaudePluginDescriptor` was moved to after `UpstreamSkillLockEntry`; `claude_plugin` field retained for uninstall/audit purposes.

---

### 6.0b Mirror translation gap (CLOSED 2026-04-28)

Full audit of all vendors in `upstream.lock` + `mcp-builtins.ts`. Findings:

- **repomix** — `repomix-commands` and `repomix-explorer` contain Claude-native slash-command format files (`commands/*.md`, `agents/*.md`). These are NOT SKILL.md files and have no equivalent format for other agents. Mirror policy: "copy vendor's exact SKILL.md verbatim." No SKILL.md exists in these plugins. Correct treatment: MCP for all 5 (already done), Claude plugins for Claude only (already done). **No delta needed.**
- **cloudflare/skills** — vendor publishes 8 skill subdirectories; only `wrangler` was pinned. **Fixed:** 7 new lockfile entries added (`cloudflare-agents-sdk`, `cloudflare-platform`, `cloudflare-email-service`, `cloudflare-durable-objects`, `cloudflare-sandbox-sdk`, `cloudflare-web-perf`, `cloudflare-workers-best-practices`). Run `fulcrum skills upstream --update-pins` to compute SHA-256 hashes. Total: 27 pinned skills (20 pre-audit + 7 new). Lockfile: `skills/upstream.lock`.
- **ast-grep/agent-skill** — one skill (`ast-grep/skills/ast-grep`), one Claude plugin. No slash-command or additional skill content in the repo. **No delta needed.**
- **tavily-ai/skills** — 7 skills, all pinned. **No delta needed.**
- **semgrep/skills** — 3 skills, all pinned. **No delta needed.**
- **microsoft/playwright-cli** — `skills/playwright-cli/` pinned. `.claude/skills/dev/` is internal repo-dev tooling (release scripts), not a user-facing skill pack. **No delta needed.**
- **JuliusBrussee/caveman** — Claude plugin, Gemini extension, Codex/OpenCode/Pi via `npx skills add` + clone fallback. All paths implemented. **No delta needed.**

Mirror test coverage: `src/cli/mirror-policy.test.ts` (5 describe blocks). Cloudflare coverage test verifies all 8 vendor skills are pinned.

---

### 6.0a Manual setup checklist (per machine)

`fulcrum install` does the file/config side. Auth and binary-toolchain setup remains the operator's responsibility per `docs/capabilities.md` (BYO toolchain). The list below covers everything a fresh machine needs to bring `fulcrum doctor --json` to `verdict: "ok"` with all 16 managed MCPs reachable.

#### A. One-time, before `fulcrum install`

- [ ] Install [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`) — required to build/run from clone.
- [ ] Install the workstation toolchain per `docs/capabilities.md` §1 (rg, fd, fzf, jq, yq, bat, sd, eza, zoxide, xh, gh, just, mise, direnv, tmux, difftastic, hyperfine, watchexec, universal-ctags, gitleaks, git-cliff). `brew install` line is in the doc.
- [ ] Install `flarectl` (`go install github.com/cloudflare/cloudflare-go/cmd/flarectl@latest`) if you want the authored Cloudflare DNS skill.
- [ ] Install `usql` (`brew install usql`) if you want the authored DB skill.
- [ ] (Optional) `pip install semgrep lizard pip-audit` for §2 + §5 security tools.
- [ ] (Optional) `cargo install cargo-deny` for Rust supply-chain checks.

#### B. Run `fulcrum install`

```
bash scripts/install.sh
```

This step is fully automated — splices rules, vendors hook snippets, seeds policy, installs caveman per agent (canonical vendor commands), installs context-mode, syncs 27 authored skills + 27 upstream skills (20 pre-audit + 7 new cloudflare), registers DeepWiki MCP across 5 agents (Pi via auto-installed `pi-mcp-adapter`), and registers all 16 builtin MCPs in the registry as default-disabled.

#### C. Auth — required for managed MCPs you plan to enable

Recommended layout (mirrors what `fulcrum doctor` checks):

```bash
mkdir -p ~/.config/fulcrum-secrets
cat > ~/.config/fulcrum-secrets/env.sh <<'EOF'
# Required for the MCPs you actually use
export TAVILY_API_KEY="..."             # tavily
export CLOUDFLARE_API_TOKEN="..."       # all cloudflare-* MCPs
export CLOUDFLARE_ACCOUNT_ID="..."      # all cloudflare-* MCPs except cloudflare-docs / cloudflare-radar
# Optional
# export CONTEXT7_API_KEY="..."         # context7 (free tier works without)
# export SEMGREP_APP_TOKEN="..."        # only for Semgrep AppSec cloud features
# export GWS_CLIENT_SECRETS="..."       # Google Workspace OAuth client_secret JSON path
# export GOOGLE_APPLICATION_CREDENTIALS="..." # gcloud ADC path
EOF
chmod 600 ~/.config/fulcrum-secrets/env.sh
grep -q "fulcrum-secrets/env.sh" ~/.zshrc \
  || echo '[ -f ~/.config/fulcrum-secrets/env.sh ] && source ~/.config/fulcrum-secrets/env.sh' >> ~/.zshrc
source ~/.zshrc
```

Per-token sources are in `docs/mcp.md` §5 (one row per managed MCP).

#### D. Adjacent CLI auth (for skills, not MCPs)

- [ ] `gh auth login` — covers the `gh` skill + git operations (alternative: `GITHUB_TOKEN` env).
- [ ] `gcloud auth login` and `gcloud auth application-default login` — for Google Cloud SDK + ADC.
- [ ] `wrangler login` — Cloudflare Workers CLI OAuth (independent of the Cloudflare MCP API token).
- [ ] Anthropic / Claude — Claude Code uses macOS Keychain or platform secret store; no env var needed for the Claude CLI itself.

#### E. Enable the MCPs you actually want active

Default state after install: every builtin MCP is registered but disabled. Per `docs/mcp.md` §1a, leaving 16 MCPs enabled costs ~150–300k tokens at session start. Enable selectively:

```bash
# Enable per agent (or omit --agent for current default)
fulcrum mcp enable github --all-agents
fulcrum mcp enable tavily --agent claude-code
fulcrum mcp list                 # see state
fulcrum mcp disable <name> --all-agents  # turn off again
```

#### F. Verify

Canonical post-install verification: **`docs/smoke-test.md`**. Feed it directly to any of the 5 agents:

```bash
# Claude Code
claude -p "$(cat docs/smoke-test.md)" --output-format json

# Codex CLI
codex "$(cat docs/smoke-test.md)"

# Gemini CLI
gemini -p "$(cat docs/smoke-test.md)" --output-format json --yolo

# OpenCode
opencode run --format json "$(cat docs/smoke-test.md)"

# Pi CLI
pi --print "$(cat docs/smoke-test.md)" --mode json --no-session
```

Or run quick checks manually:

```
fulcrum doctor                              # human; verdict line at the end
fulcrum doctor --json | jq '.verdict, .mcp.servers[] | {name, auth_status}'
```

All five agents should be detected, rules spliced, caveman installed, Pi adapter present, and `auth_status` should be `ok` for every MCP whose env var you set (or `n/a` for MCPs that don't need auth). Results are saved to `~/.fulcrum/state/global/smoke-test/<YYYY-MM-DD>.md`.

---

### 6.1+ Agent OS layers (post-foundation, post-migration)

Below is the trajectory layer — the seven Agent OS layers named in `README.md` and `AGENTS.md`. Each entry has scope, dependencies on prior layers, data model sketch, CLI surface, persistence target, and success signals. None are implemented yet. Build order goes top-down because later layers consume earlier layers' state.

### Conventions for all layers below

- **Persistence root:** `~/.fulcrum/state/<project-slug>/` for per-project state (already used by `audit-log`); `~/.fulcrum/state/global/` for cross-project facts. Project slug = `projectSlug()` from `src/utils/io.ts`.
- **Storage format:** SQLite (one file per layer or one shared file with per-layer tables; pick once when implementing layer 1). Bun's `bun:sqlite` is built-in — no external dep. Schema versioning via `PRAGMA user_version`. Migrations in `src/<layer>/migrations/NNNN-name.sql` applied on first read.
- **CLI surface convention:** `fulcrum <layer> <verb> [args] [--json]`. Every list/get verb supports `--json` for machine consumption. State-changing verbs are idempotent.
- **Cross-layer references:** every layer entity has an opaque ULID id (`01H…` 26-char). Foreign keys are ULIDs as text columns. No autoincrement integers.
- **Test convention:** every layer has a `<layer>.test.ts` with at least migration smoke + happy-path round-trip + idempotency.
- **Docs:** every shipped layer adds a `docs/<layer>.md` (data model, CLI verbs, hook integration, edge cases).

### 6.1 Repository supervisor — `fulcrum repo …`

**Goal.** Track which repos the user works in, their working-tree posture, branch state, and per-repo settings; provide one place to ask "what's the state of repo X" without re-running shell commands in every session.

**Why first.** Every later layer (tasks, runs, artifacts) is keyed by repo. Without a supervisor there is no canonical repo identity to attach work to.

**Depends on.** Foundation only.

**Data model.**
```
repos(id, slug, root_path, default_branch, remote_url, registered_at, last_seen_at)
repo_status(repo_id, current_branch, head_sha, ahead, behind, dirty, untracked, last_checked_at)
repo_settings(repo_id, key, value)   # k/v overrides per repo
```
- `slug` is the existing `projectSlug()` value; primary lookup key.
- `repo_status` is updated by `fulcrum repo refresh` and by hooks (see below).

**CLI surface.**
- `fulcrum repo register [DIR]` — record a repo at DIR (defaults to PWD); idempotent.
- `fulcrum repo list [--json]` — every registered repo with last-seen state.
- `fulcrum repo show <slug-or-path> [--json]` — detail.
- `fulcrum repo refresh <slug-or-path>` — re-stat git posture.
- `fulcrum repo forget <slug>` — remove from supervisor (does not touch the working tree).
- `fulcrum repo set <slug> <key> <value>` / `fulcrum repo get <slug> <key>` — per-repo settings.

**Persistence.** `~/.fulcrum/state/global/repos.db` (shared SQLite for cross-project queries).

**Hook integration.** Add a new `repo-track` hook that runs on `SessionStart` (and equivalents) and calls `fulcrum repo register` + `repo refresh` for the cwd. Wire into `src/cli/hooks.ts` recipe table.

**Success.** `fulcrum repo list --json` returns deterministic JSON for ≥2 distinct registered repos; `fulcrum doctor` reports `repos.count` + warns if any registered repo path no longer exists.

### 6.2 Memory — `fulcrum memory …`

**Goal.** Persistent facts, decisions, and references across sessions. The agent answer to "what did we decide about X last week" without re-deriving from chat history.

**Why second.** Independent of repos but tasks/runs/context-engine all read from memory, so it must exist before they reference it.

**Depends on.** Foundation.

**Data model.**
```
memories(id, scope, kind, key, body, source, created_at, updated_at)
memory_links(memory_id, ref_kind, ref_id)   # link memories to repo, task, run, artifact
```
- `scope`: `global` | `repo:<slug>` | `task:<id>` (FK enforced by app, not DB, since tasks are layer 6.3).
- `kind`: free-form tag (`decision`, `fact`, `reference`, `convention`, …).
- `key`: dotted path (`auth.token-storage`, `release.cadence`).
- `body`: markdown; ≤8 KB recommended.
- `source`: `cli` | `hook` | `agent`.

**CLI surface.**
- `fulcrum memory put <scope> <key> [--kind=…] [--from-file PATH | --body STRING]`
- `fulcrum memory get <scope> <key> [--json]`
- `fulcrum memory list [--scope=…] [--kind=…] [--json]`
- `fulcrum memory rm <id-or-key>`
- `fulcrum memory link <id> <ref-kind>:<ref-id>`
- `fulcrum memory search <query> [--scope=…]` — FTS5 over `body`.

**Persistence.** `~/.fulcrum/state/global/memory.db`. FTS5 virtual table on `body`.

**Hook integration.** Optional `memory-inject` hook (`SessionStart`) that loads memories whose scope matches current repo and emits them as context (mirror of how `context-mode` works). Cap at top-N by recency to bound stdout.

**Success.** `fulcrum memory put global onboarding.contact "alice@example.com"` survives shell restart; FTS hits expected term.

### 6.3 Task system — `fulcrum tasks …`

**Goal.** Durable units of work tracked across agent sessions. Distinct from in-process `TaskCreate` (per-session): these are the shareable, resumable items.

**Why third.** Tasks live in a repo; tasks accumulate runs (6.4) and produce artifacts (6.6); their state is a frequent target of memory references.

**Depends on.** §6.1 (repo identity), §6.2 (memory links).

**Data model.**
```
tasks(id, repo_id, parent_id, title, description, status, priority,
      created_at, updated_at, due_at, owner)
task_blocks(blocker_id, blocked_id)   # graph edges (blocker -> blocked)
task_tags(task_id, tag)
```
- `status`: `pending` | `in_progress` | `blocked` | `completed` | `cancelled`.
- Trees via `parent_id` (subtasks); arbitrary blocking via `task_blocks`.

**CLI surface.**
- `fulcrum tasks add <title> [--repo=…] [--parent=…] [--description-file PATH] [--priority=…] [--due=…] [--tag …]`
- `fulcrum tasks list [--repo=…] [--status=…] [--tag=…] [--owner=…] [--json]`
- `fulcrum tasks show <id> [--json]`
- `fulcrum tasks update <id> [--status=…] [--priority=…] [--description-file PATH] [--add-tag …] [--rm-tag …]`
- `fulcrum tasks block <blocked-id> --by <blocker-id>` / `fulcrum tasks unblock …`
- `fulcrum tasks tree <id>` — print subtree.
- `fulcrum tasks done <id>` — convenience for `update --status completed`.

**Persistence.** `~/.fulcrum/state/<slug>/tasks.db` (per-repo). Global query path (`fulcrum tasks list --all-repos`) walks all repo dbs.

**Hook integration.** None mandatory. Optional `task-context` hook injects `pending` + `in_progress` task summary on `SessionStart`.

**Success.** Add a task, restart shell, list tasks → same id; status transitions invariant under repeated calls.

### 6.4 Agent runs — `fulcrum runs …`

**Goal.** First-class invocations of an agent: input prompt, agent type, model, context attached, output, exit status, cost, transcript path. The audit + replay layer.

**Why fourth.** Tasks reference runs; artifacts reference runs; context-engine selects past runs to surface.

**Depends on.** §6.1, §6.2, §6.3.

**Data model.**
```
runs(id, task_id, repo_id, agent, model, prompt, started_at, ended_at,
     status, exit_code, transcript_path, total_tokens, cost_usd, parent_run_id)
run_inputs(run_id, kind, ref_id)   # which memories, artifacts, files were attached
run_events(run_id, ts, kind, payload_json)   # tool_use, content_block, error
```
- `agent`: `claude-code` | `codex` | `gemini` | `opencode` | `pi`.
- `parent_run_id`: retries / sub-agent spawns.
- Transcripts on disk: `~/.fulcrum/state/<slug>/runs/<id>.jsonl`.

**CLI surface.**
- `fulcrum runs start --agent=<…> --model=<…> --prompt-file PATH [--task=<id>] [--attach memory:<id> --attach artifact:<id>] [--detach]`
- `fulcrum runs list [--repo=…] [--task=…] [--agent=…] [--status=…] [--json]`
- `fulcrum runs show <id> [--json]` — metadata.
- `fulcrum runs transcript <id>` — pipes the JSONL.
- `fulcrum runs retry <id> [--model=<…>]` — start a new run with the same inputs; sets `parent_run_id`.
- `fulcrum runs cancel <id>`.
- `fulcrum runs cost [--repo=…] [--since=…]` — aggregate cost.

**Persistence.** `~/.fulcrum/state/<slug>/runs.db`; transcripts in `runs/<id>.jsonl`.

**Hook integration.** `run-record` hook on `SessionEnd` writes a row + transcript using the agent's session id.

**Success.** `fulcrum runs list --repo=fulcrum --json | jq length` increases by 1 after each session; transcript replay reproduces the session.

### 6.5 Context engine — `fulcrum context …`

**Goal.** Select and assemble what a run sees: which memories, which prior-run snippets, which files. Replaces ad-hoc "paste the right things into the prompt" rituals.

**Why fifth.** Needs runs (6.4) and memories (6.2) to draw from.

**Depends on.** §6.1, §6.2, §6.3, §6.4.

**Data model.**
```
context_profiles(id, name, repo_id, body_yaml)
context_assemblies(id, run_id, profile_id, body_md, token_count, created_at)
```
- `body_yaml` describes selectors: `memories: scope=repo:foo, kind=decision, top=5; runs: task=<id>, top=3, fields=prompt+summary; files: glob=src/**/*.ts, max=20`.
- `context_assemblies` is a materialised view per run for replay/audit.

**CLI surface.**
- `fulcrum context profile add <name> --from-file PATH [--repo=…]`
- `fulcrum context profile list [--repo=…] [--json]`
- `fulcrum context profile show <name>`
- `fulcrum context assemble --profile=<name> [--task=<id>] [--out PATH]` — emits the assembled markdown to stdout or PATH.
- `fulcrum context attach --run=<id> --profile=<name>` — record the assembly used for a run.

**Persistence.** `~/.fulcrum/state/<slug>/context.db` + assembled bodies in `context/<id>.md`.

**Hook integration.** None forced. `UserPromptSubmit`-style hook can call `fulcrum context assemble --profile=default` and inject the result, mirroring `context-mode`.

**Success.** Same profile + same inputs ⇒ byte-identical assembly (deterministic ordering); token count within ±1 of actual `claude tokens` count.

### 6.6 Artifacts — `fulcrum artifacts …`

**Goal.** Outputs of runs (diffs, plans, reports, generated code) tracked as first-class objects, addressable by id, queryable by tag/run/task.

**Why sixth.** Needs runs + tasks. Could ship before context engine, but engine often references artifacts, so engine first is cleaner.

**Depends on.** §6.1, §6.3, §6.4.

**Data model.**
```
artifacts(id, run_id, task_id, kind, title, body_path, sha256, size, mime, created_at)
artifact_tags(artifact_id, tag)
```
- `kind`: `diff` | `plan` | `report` | `code` | `note` | …
- `body_path`: `~/.fulcrum/state/<slug>/artifacts/<id>.<ext>` (content-addressed by sha256 in filename if reused).

**CLI surface.**
- `fulcrum artifacts put --kind=<…> --title=<…> --from-file PATH [--run=<id>] [--task=<id>] [--tag …]`
- `fulcrum artifacts list [--run=…] [--task=…] [--kind=…] [--tag=…] [--json]`
- `fulcrum artifacts show <id> [--json]`
- `fulcrum artifacts cat <id>` — pipe contents.
- `fulcrum artifacts diff <id-a> <id-b>` — `difft` between two artifacts.
- `fulcrum artifacts gc` — drop unreferenced rows + body files.

**Persistence.** `~/.fulcrum/state/<slug>/artifacts.db` + body files.

**Hook integration.** `Stop`/`SessionEnd` hook can ingest a final agent diff as an artifact tagged `auto`.

**Success.** Round-trip: write → list by tag → cat → matches input bytes; sha256 stable.

### 6.7 Plugins / extensions — `fulcrum plugins …`

**Goal.** Third-party drop-ins under each agent's namespacing convention. Already prepared at the filesystem layer (`fulcrum/<name>/`, `fulcrum-upstream/<name>/`); this layer adds the manifest + lifecycle.

**Why last.** Sits on top of all prior layers; needs supervisor to know which repos a plugin is enabled for, runs/artifacts/memory APIs to be stable so plugins can target them.

**Depends on.** All prior layers.

**Data model.**
```
plugins(id, name, source_repo, source_sha, manifest_json, installed_at)
plugin_enables(plugin_id, scope)   # scope: global | repo:<slug>
plugin_capabilities(plugin_id, capability)   # hook | skill | command | mcp
```
- Manifest schema published in `docs/plugins.md`; pinned per-source-sha (subpath-SHA pattern from §6 item 6 above).

**CLI surface.**
- `fulcrum plugins add <git-url-or-path> [--ref=<sha>]`
- `fulcrum plugins list [--repo=…] [--json]`
- `fulcrum plugins enable <name> [--repo=…]` / `fulcrum plugins disable …`
- `fulcrum plugins update <name>` — refresh from upstream + verify subpath SHAs.
- `fulcrum plugins rm <name>`

**Persistence.** `~/.fulcrum/state/global/plugins.db`; sources cached at `~/.fulcrum/cache/plugins/<name>/`.

**Hook integration.** Plugins themselves can declare hooks/skills/commands/mcp; `fulcrum install` should iterate enabled plugins and apply.

**Success.** Install a fixture plugin, enable it for one repo, observe its hook fires only in that repo; remove the plugin and observe full cleanup (mirrors uninstall semantics for the foundation).

---

### Build order + branch plan

Recommended branch sequence; each branch lands solo via fast-forward merge to `main`.

| # | Branch name | Layer | Depends on |
|---|---|---|---|
| 1 | `feat/repo-supervisor` | §6.1 | foundation |
| 2 | `feat/memory` | §6.2 | foundation |
| 3 | `feat/task-system` | §6.3 | 1, 2 |
| 4 | `feat/agent-runs` | §6.4 | 1, 2, 3 |
| 5 | `feat/context-engine` | §6.5 | 1–4 |
| 6 | `feat/artifacts` | §6.6 | 1, 3, 4 |
| 7 | `feat/plugins` | §6.7 | 1–6 |

§6.2 (memory) can be developed in parallel with §6.1 (repo supervisor); both have no inter-dependency. After both land, §6.3 starts. §6.5 and §6.6 can be parallelised after §6.4 lands.

### Cross-layer rules

- **Every layer has a `fulcrum doctor` integration.** Each adds a section: row count, latest activity, missing bodies, schema version. Update `DoctorReport` interface accordingly.
- **Every layer has an `uninstall` story.** Add removal/keep policy to `src/cli/uninstall.ts`. Default = keep state on uninstall; `--purge` removes.
- **Every layer respects the "never use `~/.agents/`" guard.** Do not invent new shared dirs.
- **Every layer adds a `--json` flag to every read verb** so it composes with skills like `jq`.
- **Every layer ships docs in the same shape:** `docs/<layer>.md` with §1 Data model, §2 CLI verbs, §3 Hook integration, §4 Edge cases, §5 Tests.

If a foundation regression surfaces, add it back to this section with `<concrete reproduction>` + `<root cause>` + `<owner>` and re-open the relevant area.

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
- **Managed scope is OFFICIAL-FIRST.** Fulcrum manages every vendor-published agent asset (Claude plugin, MCP server, Gemini extension, OpenCode plugin, Pi package, vendor SKILL.md) for tools in `docs/capabilities.md`. We mirror vendor SKILL.md into agents the vendor does not ship for, verbatim, never re-authored. MCPs with non-trivial startup cost are registered as available but disabled by default; user toggles per session via `fulcrum mcp enable/disable`. (Policy reversal from earlier "narrow" stance — see `docs/mcp.md` §1, dated 2026-04-28.)
- **Claude Code MCP removal is manual.** Install can call `claude mcp add`, but uninstall prints `claude mcp remove -s user deepwiki` instead of invoking it.
- **OpenCode is archived** (2025-09-18). Successor: Charm's Crush. `shims/opencode/fulcrum.ts` is written against last-stable OpenCode; Crush's plugin contract may differ.
- **`dist/` is gitignored.** Every fresh clone needs Bun to run `bash scripts/install.sh` (or set `FULCRUM_RELEASE_TAG=...` to fetch a release artifact).
- **Skill content correctness is the author's job.** Lint passes do not imply upstream-correct content. Fix commit `08101c6` corrected 19 skills after the fact; future authoring should verify inline.

---

## 9. How to read this repo

- `README.md` — install + usage.
- `AGENTS.md` — project-level instructions and trajectory.
- `HANDOVER.md` — this file.
- `docs/user-guide.md` — end-user guide: install, daily usage, hooks, skills, MCPs, FAQ, troubleshooting.
- `docs/developer-guide.md` — developer guide: repo layout, architecture, adding hooks/MCPs/skills, testing, release.
- `docs/contributing.md` — contributing workflow: commit format, branch policy, CI requirement, compression contract, code style.
- `docs/` — per-topic foundation docs (context, hooks, skills, mcp, agents, capabilities, caveman, tool-output policy, skill-smoke-test).
- `rules/AGENTS.md` — body spliced into each agent's primary rules file (90 lines, pure behavioral).
- `skills/SOURCES.md` — registry, queue, **caveman requirement** (mandatory).
- `evals/README.md` — eval harness contract.
- `git log --oneline` — chronological history.
