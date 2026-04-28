# Fulcrum — Handover

> Snapshot at branch `feat/agent-foundation-clean` (HEAD `0ca8b88`, local branch 1 commit ahead of `origin/feat/agent-foundation-clean`). Forward-looking only — historical event logs pruned. For archaeology: `git log` and per-commit messages.

## 0. Destination

**Fulcrum is a local-first CLI Agent OS for supervising repositories, tasks, agent runs, context, memory, and artifacts.**

Today the foundation layer is partly in place. Supervisor / task / agent-runs / context-engine / memory / artifacts / plugins layers are placeholders, not implementations. Remaining merge blockers are listed in §6. See `AGENTS.md` for the trajectory framing.

---

## 1. Current state — one paragraph

`feat/agent-foundation-clean` currently provides a Bun `fulcrum` CLI with project init, hook subcommands, hook snippet vending, rules splicing, non-destructive uninstall, in-repo skill sync during install, curated upstream skill sync, DeepWiki MCP registration, caveman install, caveman compression, doctor, and local CI. 28 in-repo skills are lint-clean, caveman-compressed (`.original.md` beside each), and pass the latest Claude/Codex eval bar. Eight hook recipes (`format`, `lint-gate`, `pm-policy`, `test-on-edit`, `audit-log`, `index-check`, `index-rebuild`, `tool-output-router`) are TypeScript subcommands of the same binary. `src/agents/registry.ts` is the single source of truth for all 5 agent definitions consumed by install, doctor, and skills. No GitHub Actions are wired (intentional; opt-out). This branch is **not merge-ready**: hook registration is still snippet/manual, upstream skill SHAs are not pinned, and docs still need a final drift pass. PR #1 was opened from a temporary main-based branch and closed; continue local work on this branch.

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
│                              sync authored + curated upstream skills unless opted out,
│                              register DeepWiki MCP for supported detected agents
├── fulcrum uninstall [--dry-run] [--purge] [--include-caveman]
│                            — remove Fulcrum-managed rules blocks, hook state,
│                              authored/upstream skill namespaces, generated
│                              Gemini import, unmodified policy; caveman only with flag
├── fulcrum hooks list/enable/disable
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
│   ├── install.test.ts  uninstall.test.ts
│   ├── compress.ts                    # fulcrum compress subcommand (267 lines)
│   ├── hooks.ts         skills.ts     # hook + skill orchestration; rules size lint
│   ├── upstream-skills.ts             # curated third-party skill installer
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
└── eval-all.sh                        # leaderboard runner; --regenerate-only flag

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
└── upstream.lock                      # populated when sourcing remote skills
evals/<name>.json × 28                 # 18–21-entry trigger sets per skill (inline-data queries)
evals/<name>.match-words × 28          # per-skill match-words overrides (word-bounded grep -qw tokens)
.gitleaksignore                        # one line — fake token in evals/gitleaks.json suppressed
cliff.toml + CHANGELOG.md
LICENSE (MIT)  AGENTS.md  README.md
```

---

## 3. What works (verified)

- `bun run ci` — green in the latest local run: install + tsc + 108 tests (12 files, 196 expect calls) + 5 platform builds + skills:lint (28/28) + compress:check (soft, 0 pending).
- `bun run scripts/build-all.ts` — 5 targets (`darwin-arm64` 63 MB, `darwin-x64` 68 MB, `linux-x64`/`linux-arm64` ~101 MB, `windows-x64` 118 MB).
- `bash scripts/install.sh` — splices rules, vendors snippets, seeds policy. Idempotent. `FULCRUM_RELEASE_TAG=vX.Y.Z` fetches a prebuilt binary from GitHub Releases.
- `bun run release vX.Y.Z [--gh]` — clean-tree gate → CI → CHANGELOG → tag → cross-compile → optional `gh release create`. Does NOT push.
- `fulcrum install` — 8 steps: rules spliced into Claude Code / Codex CLI / OpenCode / Gemini; policy seeded; caveman per-agent; `~/.config/caveman/config.json` written `{"defaultMode":"ultra"}`; authored in-repo skills synced unless `--no-skills`; curated upstream skills synced unless `--no-upstream-skills`; DeepWiki MCP registered for supported detected agents. Respects `--dry-run`.
- `fulcrum uninstall` — removes Fulcrum-managed rules blocks, hook snippets/markers, managed `skills/fulcrum/` and `skills/fulcrum-upstream/` namespaces, Gemini managed skill extensions, generated Gemini import, and unmodified seeded policy. Keeps edited policy by default and keeps caveman unless `--include-caveman`.
- `fulcrum skills upstream` — clones/updates curated upstream repos into `~/.fulcrum/cache/upstream-skills` and installs 20 selected skills under `fulcrum-upstream/` (Gemini: `fulcrum-upstream-skills` extension).
- `fulcrum hooks enable/disable` — records/removes an intent marker and prints registration snippets. It does not edit agent configs yet.
- `fulcrum doctor [--json]` — 32/32 tools detected; "Caveman" section with `defaultMode` display; `DoctorReport` JSON on `--json`.
- `assertNotAgentsPath()` / `lockCavemanUltra()` — hard guards in install.ts; both tested.
- `fulcrum skills sync` — all 28 compressed skills under `<agent>/skills/fulcrum/<name>/`.
- `fulcrum init <dir>` — seeds AGENTS.md, `.claude/CLAUDE.md` (`@AGENTS.md` import), `.gitignore`.
- Format-hook smoke: piped a malformed `.py` Edit envelope → ruff rewrote it correctly.
- `scripts/eval-skill-claude.sh <skill> --runs-per-query 1` — confirmed with new match-words + data-rich queries. jq: 83/0 on `/tmp/jq-sanity4` (baseline was 66/12). Auth via Claude Code keychain — no `ANTHROPIC_API_KEY`.
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
| Caveman compression of in-repo content is part of CI | Verbose skills waste tokens every session; soft-fail gate prevents accidental uncompressed commits. | `scripts/compress-with-caveman.sh`, `scripts/ci.ts` |
| Per-skill iteration over batch leaderboard tuning | Batch runs confound measurement between skills; one skill at a time is the safe unit. | `scripts/eval-skill-{claude,codex}.sh` |

---

## 5. Branch + commit map

```
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

Branch should stay on `feat/agent-foundation-clean` for now. PR #1 was closed because the branch is not ready to merge. Do not open a new PR until §6 is cleared.

---

## 6. Remaining work — start here

Do these before opening any new PR. Completed setup work has been moved to §3 and removed from this active queue.

1. **Hook registration contract.** `fulcrum hooks enable/disable` records markers and prints snippets; it does not edit agent configs. Decide whether this is the intended contract or implement per-agent config edits plus clean unregister paths for Codex, Gemini, OpenCode, Pi, and Claude Code. Drift sources: README says hook recipes are "registered per-agent"; [docs/hooks.md](docs/hooks.md) says snippets are printed; [docs/agents.md](docs/agents.md) has the per-agent hook config shapes; code lives in `src/cli/hooks.ts`.
2. **Curated upstream skills are installable, not fully ready.** `fulcrum skills upstream` installs these 20 entries from branch tips via `src/cli/upstream-skills.ts`. Before ship, each entry needs a pinned SHA in [skills/upstream.lock](skills/upstream.lock), license/author_class/pinned_on/review_due metadata, and a decision whether the folder-install contract is enough or native plugin install is required. Keep all under `fulcrum-upstream/`, separate from authored `fulcrum/` skills.

   | Install name | Source | Remaining work |
   |---|---|---|
   | `superpowers-brainstorming` | `obra/superpowers:skills/brainstorming` | Pin SHA/license; decide native superpowers plugin vs folder install; verify trigger behavior in Codex/Claude. |
   | `superpowers-writing-plans` | `obra/superpowers:skills/writing-plans` | Pin SHA/license; decide native superpowers plugin vs folder install; verify trigger behavior. |
   | `superpowers-systematic-debugging` | `obra/superpowers:skills/systematic-debugging` | Pin SHA/license; decide native superpowers plugin vs folder install; verify trigger behavior. |
   | `superpowers-requesting-code-review` | `obra/superpowers:skills/requesting-code-review` | Pin SHA/license; map docs claim "`code-review`" to actual upstream split (`requesting-code-review` / receiving-review not installed). |
   | `superpowers-using-git-worktrees` | `obra/superpowers:skills/using-git-worktrees` | Pin SHA/license; map docs claim "`worktrees`" to actual install name. |
   | `superpowers-using-superpowers` | `obra/superpowers:skills/using-superpowers` | Pin SHA/license; map docs claim "`using-skills`" to actual upstream name or add the intended skill if different. |
   | `ast-grep` | `ast-grep/agent-skill:ast-grep/skills/ast-grep` | Pin SHA/license; verify tool-author skill layout remains stable. |
   | `tavily-best-practices` | `tavily-ai/skills:skills/tavily-best-practices` | Pin SHA/license; decide if all Tavily skills should install by default or only CLI/search. |
   | `tavily-cli` | `tavily-ai/skills:skills/tavily-cli` | Pin SHA/license; verify binary name `tvly` vs skill naming/docs. |
   | `tavily-crawl` | `tavily-ai/skills:skills/tavily-crawl` | Pin SHA/license; verify trigger scope and API-key assumptions. |
   | `tavily-extract` | `tavily-ai/skills:skills/tavily-extract` | Pin SHA/license; verify trigger scope and API-key assumptions. |
   | `tavily-map` | `tavily-ai/skills:skills/tavily-map` | Pin SHA/license; verify trigger scope and API-key assumptions. |
   | `tavily-research` | `tavily-ai/skills:skills/tavily-research` | Pin SHA/license; verify trigger scope and API-key assumptions. |
   | `tavily-search` | `tavily-ai/skills:skills/tavily-search` | Pin SHA/license; verify trigger scope and API-key assumptions. |
   | `playwright-cli` | `microsoft/playwright-cli:skills/playwright-cli` | Pin SHA/license; verify browser install docs (`npx playwright install chromium`) in [docs/capabilities.md](docs/capabilities.md). |
   | `semgrep` | `semgrep/skills:skills/semgrep` | Pin SHA/license; decide default install alongside authored security tools. |
   | `semgrep-code-security` | `semgrep/skills:skills/code-security` | Pin SHA/license; verify overlap with `semgrep` skill. |
   | `semgrep-llm-security` | `semgrep/skills:skills/llm-security` | Pin SHA/license; verify overlap with `semgrep` skill. |
   | `graphify` | `safishamsi/graphify:graphify/skill.md` | Pin SHA/license; copied from single `skill.md` to `SKILL.md`; verify frontmatter compatibility and `graphifyy` install command in [docs/capabilities.md](docs/capabilities.md). |
   | `ctx7` | `edxeth/superlight-context7-skill:SKILL.md` | Pin SHA/license; copied from root `SKILL.md`; verify command naming (`ctx7`) and Context7-vs-MCP policy. |

3. **Curated upstream docs drift.** [docs/skills.md](docs/skills.md) and [skills/SOURCES.md](skills/SOURCES.md) still describe desired upstream packages in prose, not the exact 20 install entries above. Align names, installed set, skipped set, and rationale. Notable mismatches: superpowers docs say `code-review`, `worktrees`, `using-skills`; installer currently uses actual upstream names listed above. Tavily says 7 skills, installer installs 8 including `tavily-dynamic-search` is not installed and `tavily-best-practices` is installed.
4. **Repomix skill decision.** [skills/SOURCES.md](skills/SOURCES.md) lists repomix as upstream skill material, while [docs/skills.md](docs/skills.md) mentions generating a repomix skill. The upstream repo currently exposes guide markdown rather than a clean `SKILL.md` folder in the checked layout. Choose one: generate/vendor an authored `skills/repomix/`, adapt the guide into a maintained skill, or remove repomix from the installable upstream promise.
5. **Native plugin installer decision.** Current third-party support installs skill folders only. [docs/skills.md](docs/skills.md) and [skills/SOURCES.md](skills/SOURCES.md) still discuss native plugin/extension installers for `obra/superpowers` and related packages. Decide whether Fulcrum should call those native installers, or document filesystem skill install as the supported cross-agent layer.
6. **Capability tools policy.** [docs/capabilities.md](docs/capabilities.md) lists manual CLI installs and `doctor` checks many tools, but Fulcrum does not install or pin those binaries. Decide whether tool installation belongs in Fulcrum, or update README + capabilities docs to say capabilities are bring-your-own-tools plus `fulcrum doctor`.
7. **MCP policy wording.** [docs/mcp.md](docs/mcp.md) says MCPs are default-off but DeepWiki is always on and now installed by `fulcrum install`; README still says "MCPs off by default" and reading order says to register DeepWiki manually. Align README, [docs/mcp.md](docs/mcp.md), and [docs/agents.md](docs/agents.md) around the real contract: DeepWiki is the only Fulcrum-managed default MCP; everything else is opt-in. Also document Claude Code removal remains manual (`claude mcp remove -s user deepwiki`).
8. **Skill verification docs.** [docs/skill-smoke-test.md](docs/skill-smoke-test.md) still says trigger-rate measurement is Claude-only and does not mention `scripts/eval-skill-codex.sh`. Update it to match [docs/skills.md](docs/skills.md) §7: Claude and Codex have scriptable trigger-rate harnesses; Gemini/OpenCode/Pi remain manual smoke.
9. **Install/uninstall smoke docs.** README and §7 smoke tests should cover `fulcrum uninstall --dry-run`, `fulcrum skills upstream`, DeepWiki MCP registration, and the `--no-skills` / `--no-upstream-skills` install flags. Current smoke tests still focus on old install + hook + eval paths.
10. **Ship gate.** After the above, run `bun run ci`, re-run a scratch install/uninstall smoke, then create a fresh PR from `feat/agent-foundation-clean`. Release can happen only after merge to `main` via `bun run release vX.Y.Z [--gh]`.

---

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

# 5. Single-skill eval (~2-5 min)
bun run src/index.ts skills sync   # ensure skill is at ~/.claude/skills/fulcrum/<skill>
scripts/eval-skill-claude.sh jq --model sonnet --runs-per-query 1 \
  --results-dir /tmp/jq-iter

# 6. Leaderboard (all 28 skills; ~30-60 min)
scripts/eval-all.sh --model sonnet --runs-per-query 1

# 7. Re-score existing leaderboard run without re-running evals
scripts/eval-all.sh --regenerate-only --results-dir eval-results/<ts>

# 8. Doctor JSON output
fulcrum doctor --json | jq .verdict
# expect: "ok", "warning", or "error"
```

---

## 8. Known limitations (current)

- **Trigger-rate eval exists for Claude Code and Codex only.** No equivalent harness for Gemini / OpenCode / Pi. `docs/skill-smoke-test.md` still needs cleanup where it says Claude-only.
- **Uninstall is conservative.** It does not remove caveman by default and keeps modified policy files unless `--purge`.
- **Third-party upstream sync is not pinned yet.** It installs curated sources by branch tip; `skills/upstream.lock` still needs real SHA entries and review dates.
- **DeepWiki is the only managed default MCP.** Other MCPs remain opt-in. README/docs wording still needs alignment so "MCPs off by default" does not contradict DeepWiki auto-registration.
- **Claude Code MCP removal is manual.** Install can call `claude mcp add`, but uninstall prints `claude mcp remove -s user deepwiki` instead of invoking it.
- **OpenCode is archived** (2025-09-18). Successor: Charm's Crush. `shims/opencode/fulcrum.ts` is written against last-stable OpenCode; Crush's plugin contract may differ.
- **Pi has no MCP support** by design. Tier rules keyed `mcp__*` will never fire on Pi (`docs/agents.md` §5.6).
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
