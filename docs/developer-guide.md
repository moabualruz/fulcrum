# Fulcrum Developer Guide

> See also: [user-guide.md](user-guide.md) | [contributing.md](contributing.md) | [HANDOVER.md](../HANDOVER.md) for current state

---

## Repo layout

```
fulcrum/
├── src/
│   ├── index.ts                        # CLI dispatcher — routes subcommands to handlers
│   ├── types.ts                        # shared TypeScript types
│   ├── agents/
│   │   ├── registry.ts                 # AGENTS[5] array + Agent interface (SINGLE SOURCE OF TRUTH)
│   │   └── registry.test.ts
│   ├── utils/
│   │   ├── io.ts                       # readHookEvent, deriveTool (Pi proxy-shape normaliser)
│   │   ├── io.test.ts
│   │   └── proc.ts                     # which, exists, run, spawnDetached
│   ├── cli/
│   │   ├── init.ts                     # fulcrum init — bootstrap project AGENTS.md + .claude/CLAUDE.md
│   │   ├── component.ts                # fulcrum component — lifecycle list/info/plan/status/apply
│   │   ├── install.ts                  # fulcrum install — default component profile wrapper
│   │   ├── uninstall.ts                # fulcrum uninstall — conservative profile removal wrapper
│   │   ├── compress.ts                 # fulcrum compress — caveman compression subcommand
│   │   ├── hooks.ts                    # fulcrum hooks list/enable/disable (detection-aware)
│   │   ├── skills.ts                   # fulcrum skills sync + lint
│   │   ├── upstream-skills.ts          # pinned curated skill installer w/ subpath SHA-256 verify
│   │   ├── mcp.ts                      # legacy DeepWiki/Pi compatibility helpers
│   │   ├── mcp-registry.ts             # MCP registry TOML store + applyToAgents/removeFromAgents
│   │   ├── mcp-cmd.ts                  # fulcrum mcp list/register/unregister/enable/disable
│   │   ├── doctor.ts                   # health check: 47 tools + caveman + Pi + MCP + policy
│   │   ├── install.test.ts
│   │   ├── uninstall.test.ts
│   │   ├── hooks.test.ts
│   │   ├── upstream-skills.test.ts
│   │   ├── mcp-registry.test.ts
│   │   ├── mcp-cmd.test.ts
│   │   └── doctor.test.ts
│   ├── components/                     # catalog, planner, ledger, executor, surface adapters
│   └── hooks/
│       ├── audit-log.ts                # PostToolUse Bash — append command + exit code to log
│       ├── format.ts                   # PostToolUse Write|Edit — run language formatter
│       ├── index-check.ts              # SessionStart — warn if tags/graphify stale
│       ├── index-rebuild.ts            # Stop — rebuild ctags + graphify + repomix on HEAD change
│       ├── lint-gate.ts                # PostToolUse Write|Edit — block if lint fails (exit 2)
│       ├── pm-policy.ts                # PreToolUse Bash — refuse wrong package manager (exit 2)
│       ├── test-on-edit.ts             # PostToolUse Write|Edit — run project-configured tests (opt-in)
│       ├── tool-output-router.ts       # PostToolUse any — TOML-driven per-tool output strategy
│       └── *.test.ts                   # per-hook test files
│
├── shims/
│   ├── opencode/fulcrum.ts             # OpenCode TypeScript plugin — re-dispatches to fulcrum binary
│   └── pi/fulcrum.ts                   # Pi TypeScript extension — re-dispatches to fulcrum binary
│
├── scripts/
│   ├── ci.ts                           # bun run ci — 6-stage: install→tsc→test→build:all→skills:lint→compress:check
│   ├── build-all.ts                    # cross-compile to 5 targets (darwin-arm64/x64, linux-x64/arm64, windows-x64)
│   ├── release.ts                      # bun run release vX.Y.Z [--gh] — gated release runner
│   ├── install.sh                      # bootstrap; forwards flags to fulcrum install
│   ├── compress-with-caveman.sh        # idempotent bash compress wrapper (--check for CI)
│   ├── eval-skill-claude.sh            # trigger-rate harness — Claude Code
│   ├── eval-skill-codex.sh             # trigger-rate harness — Codex CLI
│   ├── eval-skill-gemini.sh            # trigger-rate harness — Gemini CLI
│   ├── eval-skill-opencode.sh          # trigger-rate harness — OpenCode
│   ├── eval-skill-pi.sh                # trigger-rate harness — Pi CLI
│   └── eval-all.sh                     # leaderboard runner (--engine, --skip-<agent>)
│
├── config/
│   └── tool-output-policy.toml         # default per-tool output tier matrix (~50 tools)
│
├── hooks/recipes/
│   └── *.snippet.md                    # per-agent registration snippets; vendored to ~/.fulcrum/hooks/snippets/
│
├── rules/
│   └── AGENTS.md                       # 90-line behavioral rules; sentinel-spliced into every agent
│
├── skills/
│   ├── _template/SKILL.md              # canonical authoring template
│   ├── _archive/                       # retired skills (gh-authored, etc.)
│   ├── <name>/SKILL.md × 28           # compressed agent-read form
│   ├── <name>/SKILL.original.md × 28  # human-edit form
│   ├── <name>/references/*.md         # progressive section detail (compressed)
│   ├── <name>/references/*.original.md
│   ├── SOURCES.md                      # skill registry + authoring queue
│   └── upstream.lock                   # pinned curated upstream skill manifest (subpath_sha256)
│
├── evals/
│   ├── <name>.json × 28               # 18–21-entry trigger/anti-trigger sets per skill
│   └── <name>.match-words × 28        # per-skill word-boundary grep overrides
│
├── dist/                               # gitignored; built by bun run build:all
├── package.json                        # bun scripts: ci, compress, release, build:all, changelog
├── tsconfig.json
├── cliff.toml                          # git-cliff config for CHANGELOG.md
├── CHANGELOG.md
├── LICENSE                             # MIT
├── README.md                           # public-facing install + usage
├── AGENTS.md                           # project instructions for agents and humans
└── HANDOVER.md                         # live state snapshot, outstanding work, decisions
```

---

## Build and run

### Prerequisites

- [Bun](https://bun.sh) — `curl -fsSL https://bun.sh/install | bash`
- Node.js (optional, only for `npx` calls in some scripts)
- Caveman installed (required for `bun run compress`): `claude plugin install caveman@caveman`

### Commands

```bash
bun install            # install dependencies
bun run ci             # full 6-stage gate (install → tsc → test → build:all → skills:lint → compress:check)
bun run build:all      # cross-compile to 5 platform targets (output: dist/)
bun run compress       # compress all in-repo markdown via caveman
bun run compress -- --check  # CI gate: exit 1 if any .md lacks .original.md sibling
bun run changelog      # regenerate CHANGELOG.md (needs git-cliff)
bun run release vX.Y.Z        # gated release: clean tree → ci → changelog → tag → build
bun run release vX.Y.Z --gh   # also create GitHub release and upload dist/*
```

### Run from source

```bash
bun run src/index.ts doctor           # any subcommand
bun run src/index.ts install --dry-run
bun run src/index.ts hook format      # test a hook (reads stdin JSON)
```

### CI stages

`bun run ci` runs these six stages in order; any failure stops the chain:

1. `fulcrum install --dry-run` — install smoke.
2. `bun run typecheck` — `tsc --noEmit`.
3. `bun test` — full Bun test suite across all `*.test.ts` files.
4. `bun run build:all` — cross-compile to 5 targets.
5. `bun run skills:lint` — `fulcrum skills lint skills/` (29 skills, strictest-union frontmatter rules).
6. `bun run compress -- --check` — hard gate: fail if any `.md` lacks `.original.md` sibling.

---

## Architecture

### Agent registry (`src/agents/registry.ts`)

The `AGENTS` array is the single source of truth for all five agent definitions. Every operation that differs per agent (install, doctor, skills, hooks) reads from this array. No agent configs are hardcoded in other files.

```typescript
interface Agent {
  id: string;              // "claude-code" | "codex" | "gemini" | "opencode" | "pi"
  name: string;            // display name
  rootDir: string;         // ~/.claude | ~/.codex | etc. — presence = detected
  rulesFile: string;       // path to primary rules file
  skillsDir: string;       // path to skills root
  hooksConfig: string;     // path to hooks config file
}
```

Detection-aware logic: if `agent.rootDir` does not exist, skip writes for that agent. `--all` flag bypasses detection.

### Install / uninstall flow

`fulcrum install` defaults to `profile.minimal` through the component lifecycle engine. `--profile full` runs the historical `profile.default`; `--profile rules-only` runs only `rules.global`; `--enable-all-mcps` switches the target to `profile.verify-all`. `--no-skills`, `--no-upstream-skills`, and `--no-default-mcps` become planner exclusions plus the existing MCP default-state compatibility step.

The minimal profile covers rules, policy, MCP registry setup, and minimal MCP defaults. The full profile adds hooks, skills, Caveman, upstream skills, and vendor packages:

1. **Rules splice** — read `rules/AGENTS.md`, insert between `<!-- BEGIN/END FULCRUM RULES -->` sentinels in each detected agent's rules file. Preserves content outside the markers.
2. **Policy seed** — copy `config/tool-output-policy.toml` to `~/.fulcrum/tool-output-policy.toml` (first run only; subsequent runs leave user edits).
3. **Caveman per-agent** — call vendor install commands for Claude/Gemini; clone the official repo and mirror skills/plugin surfaces into native Codex/OpenCode/Pi paths.
4. **Caveman ultra lock** — write `~/.config/caveman/config.json` with `{"defaultMode":"ultra"}` (idempotent).
5. **Authored skills** — `fulcrum skills sync` distributes per-agent: Claude Code via `claude plugin marketplace add moabualruz/fulcrum && claude plugin install fulcrum@fulcrum` (skills surface as `/fulcrum:<name>`); OpenCode/Pi mirror to `<skills-root>/fulcrum/<name>/`; Gemini to `~/.gemini/extensions/fulcrum-skills/skills/<name>/`; Codex global scope is opt-in (`--codex-global`) or project-local (`--codex-project <dir>`). Legacy `~/.claude/skills/fulcrum/*` is removed after plugin install succeeds. Generated mirrors exclude `.original.md`, `_archive`, `_template`, `.git`, `node_modules`, and worktree folders.
6. **Upstream skills** — `fulcrum skills upstream` clones pinned repos, verifies `subpath_sha256`, installs to vendor placement (`<agent>/skills/<name>/`, Gemini `~/.gemini/skills/<name>/`).
7. **DeepWiki MCP** — registry builtin, registered through the same MCP lifecycle path as every other builtin (Pi via `pi-mcp-adapter` auto-install).
8. **Builtin MCPs** — register 17 builtin entries in `~/.fulcrum/state/global/mcp-registry.toml`; minimal default state enables `deepwiki` and `context7` only where no user state exists, while `--no-default-mcps` registers without changing enable state and `--enable-all-mcps` enables all builtins.
9. **Vendor packages** — install Caveman, Repomix, Cloudflare, and Superpowers through official installers first, then mirror complete plugin/extension/package surfaces to supported CLIs that lack a first-party or generic installer. Package parity reports cover skills, rules/context, MCPs, commands/prompts, agents, hooks, tools/scripts, metadata, and assets.

`fulcrum uninstall` is conservative by default: removes managed rules blocks, hook registrations, hook snippets/markers, `skills/fulcrum/`, legacy `skills/fulcrum-upstream/` namespaces, Gemini managed extensions, Gemini `@AGENTS.md` import, and DeepWiki. Keeps edited policy files, vendor-placed third-party skills, and caveman unless `--purge` / `--include-caveman` flags are passed.

**Hard guards in `install.ts`:**
- `assertNotAgentsPath()` — throws if any install path resolves to `~/.agents/`. Tested.
- `lockCavemanUltra()` — idempotent write of the ultra lock. Tested.

### Hook dispatcher

Hooks are TypeScript subcommands of the `fulcrum` binary. The CLI dispatcher routes `fulcrum hook <name>` to the handler in `src/hooks/<name>.ts`.

Each handler:
1. Reads stdin as a JSON hook event envelope via `readHookEvent()` from `src/utils/io.ts`.
2. Extracts the relevant fields (`tool_input`, `tool_response`, `cwd`, etc.).
3. Performs its action (spawn formatter, run lint, check policy, write log, etc.).
4. Writes output per the hook contract (stdout for context injection, stderr for diagnostics, exit 2 to block).

`deriveTool()` in `src/utils/io.ts` normalises Pi's proxy-shape `mcp(...)` calls to canonical `mcp__<server>__<tool>` form so `tool-output-router` policies apply to Pi without duplication.

Three agents (Claude Code, Codex, Gemini) call `fulcrum hook <name>` directly from native hook config. OpenCode and Pi use TypeScript shims (`shims/{opencode,pi}/fulcrum.ts`) that re-dispatch to the same binary.

### MCP registry

The registry lives at `~/.fulcrum/state/global/mcp-registry.toml`. Schema version 1.

`mcp-registry.ts` owns:
- `registerServer()` / `unregisterServer()` — add/remove TOML entries.
- `enableServer(name, agentId)` / `disableServer(name, agentId)` — push/remove from agent's native MCP config.
- `applyToAgents()` / `removeFromAgents()` — bulk apply/remove for install/uninstall.

`mcp-builtins.ts` declares the 17 builtin server definitions (id, transport, url/command, vendor, auth env vars, description).

`doctor.ts` reads the registry and probes each enabled HTTP server's HEAD endpoint; reports `auth_status: "ok" | "missing-env" | "n/a"` per server.

### Component lifecycle engine

`src/components/catalog.ts` declares every managed component and profile. `planner.ts` converts desired operations into action plans. `executor.ts` applies plans through adapters and records state in `~/.fulcrum/state/global/components.db`.

Adapters own surface-specific behavior:

- `adapters/hooks.ts` delegates to hook registration helpers.
- `adapters/mcp.ts` delegates to the MCP registry.
- `adapters/sentinel.ts` manages rules sentinel blocks.
- `adapters/files.ts` manages policy files and remove-vs-purge behavior.
- `adapters/vendor.ts` delegates to skills, upstream skills, caveman, Repomix, Cloudflare, and Superpowers helpers.

The public CLI is `fulcrum component list/info/plan/status/install/remove/enable/disable`. `fulcrum install` and `fulcrum uninstall` are compatibility wrappers over component profiles; install defaults to `profile.minimal`, while `--profile full` keeps the historical `profile.default` bootstrap.

Add new managed parts by adding a catalog entry, adapter support if the surface kind is new, planner tests, executor tests, and doctor status coverage.

### Upstream skills lockfile

`skills/upstream.lock` is TOML. Each `[skills.<name>]` block contains:

```toml
[skills.jq]
repo        = "jqlang/jq"
tree_sha    = "<40-char commit SHA>"
subpath     = "skills/jq"
subpath_sha256 = "<64-char SHA-256 hex>"
subpath_size   = 12345
license     = "MIT"
author_class = "vendor"
```

`fulcrum skills upstream`:
1. Reads every `[skills.*]` block.
2. `git fetch` + `git checkout <tree_sha>` into `~/.fulcrum/cache/upstream-skills/<repo>/`.
3. Compute `subpath_sha256` by walking all files under `subpath` in lexicographic order (NUL-terminated relative-path + uint64 byte-length + raw bytes into SHA-256).
4. Verify against lockfile; exit non-zero on mismatch.
5. Copy skill to vendor placement: `<agent-skills-root>/<name>/` (Gemini: `~/.gemini/skills/<name>/`), unless `vendor_canonical_agents` says the vendor installer owns that agent.

`--update-pins`: recompute all hashes and write back to `upstream.lock`.

### Doctor reporting shape

`DoctorReport` (from `src/cli/doctor.ts`):

```typescript
interface DoctorReport {
  verdict: "ok" | "warning" | "error";
  agents: AgentHealth[];        // per-agent: detected, rulesSpliced, caveman state
  caveman: CavemanHealth;       // defaultMode + source + per-agent install state
  tools: ToolHealth[];          // 47 tools: name, present, path
  policy: PolicyHealth;         // presence, size, mtime
  piMcpAdapter: PiAdapterHealth;
  mcp: McpHealth;               // registered servers + auth_status
}
```

`fulcrum doctor --json` emits this as JSON. Every new OS layer (§6.1–§6.7 in HANDOVER) adds a section to `DoctorReport` and updates the `DoctorReport` interface.

---

## Adding a new hook recipe

1. **Write the handler** at `src/hooks/<name>.ts`. Contract:
   - Read stdin via `readHookEvent()`.
   - All work in TypeScript; shell-out only for external CLIs.
   - Write diagnostics to stderr; context injection to stdout.
   - Exit 2 to block (PreToolUse / PostToolUse blocking events only).
   - Fail-open: missing tool → exit 0 (log to stderr).
   - Target <200ms for PreToolUse, <500ms for PostToolUse.

2. **Register in the CLI dispatcher** (`src/index.ts`) under the `hook` subcommand.

3. **Add the recipe table entry** in `docs/hooks.md §5` (name, lifecycle, purpose, blocks?).

4. **Add a snippet** at `hooks/recipes/<name>.snippet.md` with per-agent registration examples.

5. **Register in hooks.ts** in the `RECIPES` table so `fulcrum hooks enable/disable <name>` can write native configs.

6. **Write tests** at `src/hooks/<name>.test.ts`. Minimum: stdin envelope parse, happy-path behavior, missing-tool fail-open.

7. **Run `bun run ci`** to confirm all six stages pass.

Example skeleton:

```typescript
// src/hooks/my-hook.ts
import { readHookEvent } from "../utils/io.ts";

const event = await readHookEvent(process.stdin);
if (!event) process.exit(0);

const { tool_input, cwd } = event;
// ... do work ...
process.exit(0);
```

---

## Adding a new managed MCP

1. **Add the builtin definition** in `src/cli/mcp-builtins.ts`:

```typescript
{
  id: "my-server",
  transport: "http",            // or "stdio"
  url: "https://...",           // for http
  // command: "npx ...",        // for stdio
  vendor: "vendor-org",
  description: "...",
  authEnvVars: ["MY_API_KEY"],  // empty array if no auth
  defaultDisabled: true,
}
```

2. **Update `fulcrum doctor`** in `src/cli/doctor.ts` to probe the server if HTTP, and report `auth_status`.

3. **Add auth entry** to `docs/mcp.md §5` table.

4. **Add a catalogue entry** in `docs/mcp.md §3`.

5. **Write or update tests** in `src/cli/mcp-registry.test.ts` and `src/cli/mcp-cmd.test.ts`.

6. **Run `bun run ci`**.

---

## Adding a new authored skill

1. **Copy the template**: `cp -r skills/_template skills/<name>`.

2. **Edit `skills/<name>/SKILL.md`** (the human-edit form initially — compression happens next):
   - Set `name:` (lowercase + digits + hyphens, ≤64 chars, dir-name match).
   - Set `description:` (≤300 chars; trigger summary only — what the skill teaches, when to invoke).
   - Fill `## When to use`, `## Invocation`, `## Patterns`, `## Anti-patterns`, `## Cross-refs`.
   - Verify flags and subcommands against the tool's `--help` or upstream docs. Content correctness is NOT verified by lint.

3. **Write the eval set** at `evals/<name>.json` (≥18 entries, ~60/40 trigger/anti-trigger split) and `evals/<name>.match-words` (comma-separated words that confirm activation).

4. **Lint**: `fulcrum skills lint skills/<name>/SKILL.md`.

5. **Compress**: `bun run compress` (or `scripts/compress-with-caveman.sh skills/<name>/SKILL.md`). This creates `SKILL.original.md` (backup) and compresses `SKILL.md` in-place.

6. **Register** the skill in `skills/SOURCES.md` (status `✍️ shipped`).

7. **Sync and test**: `fulcrum skills sync` (add `--codex-global` for global Codex evals or `--codex-project <dir>` for repo-scoped checks), then run the trigger-rate harnesses:

```bash
scripts/eval-skill-claude.sh <name> --runs-per-query 1
scripts/eval-skill-codex.sh  <name> --model <model>
```

Pass bar: ≥80% trigger rate on trigger phrases, 0% on anti-trigger phrases.

8. **Run `bun run ci`** to confirm compress:check gate passes (`.original.md` sibling must exist).

---

## Adding a new upstream skill pin

1. **Identify the upstream repo**, `tree_sha`, subpath, license, and `author_class`.

2. **Add the entry** to `skills/upstream.lock`:

```toml
[skills.<name>]
repo         = "vendor/repo"
tree_sha     = "<sha>"
subpath      = "skills/<name>"
license      = "MIT"
author_class = "vendor"
# subpath_sha256 left absent initially — computed by --update-pins
```

3. **Compute the hash**:

```bash
fulcrum skills upstream --update-pins
```

This checks out the tree SHA, computes `subpath_sha256`, and writes it back.

4. **Register** in `skills/SOURCES.md` (status `✅` upstream) with the source URL.

5. **Update `docs/mcp.md`** if the skill has an associated MCP that you also want to manage.

6. **Run `bun run ci`** (no compress gate change needed — upstream skills are not in the in-repo markdown).

---

## Cross-agent integration

### Where each agent differs

| Concern | Claude Code | Codex | Gemini | OpenCode | Pi |
|---|---|---|---|---|---|
| Rules | sentinel splice `~/.claude/CLAUDE.md` | sentinel splice `~/.codex/AGENTS.md` | splice to `~/AGENTS.md`; `GEMINI.md` → `@AGENTS.md` shim | splice `~/.config/opencode/AGENTS.md` | splice `~/.pi/agent/AGENTS.md` |
| Hook config | `~/.claude/settings.json` `hooks` block | `~/.codex/hooks.json` | `~/.gemini/settings.json` `hooks` | TypeScript plugin (`shims/opencode/fulcrum.ts`) | TypeScript extension (`shims/pi/fulcrum.ts`) |
| Hook blocking | exit 2 | exit 2 | exit 2 | return `{deny:true}` from plugin | return `{block:true,reason}` from extension |
| Skills | plugin `fulcrum@fulcrum` (marketplace `moabualruz/fulcrum`) — `/fulcrum:<name>` | global opt-in `~/.codex/skills/fulcrum/<name>/` or project `.codex/skills/fulcrum/<name>/` | wrapped in extension at `~/.gemini/extensions/fulcrum-skills/skills/<name>/` | `~/.config/opencode/skills/fulcrum/<name>/` | `~/.pi/agent/skills/fulcrum/<name>/` |
| MCP | `claude mcp add` / settings.json | `~/.codex/config.toml` | `~/.gemini/settings.json` `mcpServers` | `opencode.json` `mcp` block | `~/.pi/agent/mcp.json` via `pi-mcp-adapter` |

### Codex specifics

- Hook config: `~/.codex/hooks.json` in JSON format (TOML has known startup bug).
- `Stop` event must return JSON, not plain text.
- Six events only (vs 25+ in Claude Code).

### Gemini specifics

- Reads `GEMINI.md`, not `AGENTS.md`. Fulcrum makes `GEMINI.md` a one-line `@AGENTS.md` import.
- Skills must be wrapped inside Gemini extensions with a `gemini-extension.json` manifest.
- MCP server names must use hyphens, not underscores.
- Hook output must return JSON for `additionalContext` injection to work.

### OpenCode specifics

- Archived 2025-09-18. `shims/opencode/fulcrum.ts` targets last stable release.
- Also reads `~/.claude/CLAUDE.md` — no additional rules file needed if Claude Code is configured.
- Hooks are TypeScript plugins, not shell commands.

### Pi specifics

- No native MCP manager; uses `pi-mcp-adapter`.
- Extensions are TypeScript files at `~/.pi/agent/extensions/*.ts`, hot-reloadable via `/reload`.
- `deriveTool()` normalises Pi's proxy `mcp(...)` shape to canonical `mcp__<server>__<tool>` for router policy lookup.
- `before_agent_start` event can inject messages and rewrite the system prompt (equivalent to Claude Code `SessionStart` context injection).

---

## Testing

### What tests exist

- `src/agents/registry.test.ts` — AGENTS array invariants (all 5 present, rootDir unique).
- `src/utils/io.test.ts` — `readHookEvent` parse + `deriveTool` Pi proxy normalisation.
- `src/cli/install.test.ts` — `assertNotAgentsPath`, `lockCavemanUltra`, sentinel-splice idempotency.
- `src/cli/uninstall.test.ts` — removal of managed artifacts; edited policy preserved.
- `src/cli/hooks.test.ts` — enable/disable detection-aware + `--all` overrides.
- `src/cli/upstream-skills.test.ts` — `subpath_sha256` verify + mismatch exit.
- `src/cli/mcp-registry.test.ts` — round-trip register/unregister, enable/disable, apply/remove.
- `src/cli/mcp-cmd.test.ts` — CLI verb round-trip.
- `src/cli/doctor.test.ts` — report shape, tool detection, caveman section, Pi adapter.
- `src/hooks/*.test.ts` — per-hook stdin parse, happy path, fail-open on missing tool.

### Running tests

```bash
bun test                                 # full test suite
bun test src/cli/install.test.ts         # single file
bun test --watch                         # watch mode
```

### Scratch HOME pattern

Tests that mutate the filesystem use a scratch HOME:

```typescript
const scratch = await fs.mkdtemp("/tmp/fulcrum-test-");
const originalHome = process.env.HOME;
process.env.HOME = scratch;
// ... test ...
process.env.HOME = originalHome;
await fs.rm(scratch, { recursive: true });
```

**Never mock the registry or the `AGENTS` array.** Tests that need detection to work should create the agent's `rootDir` inside the scratch HOME. Mocking the registry changes what the code under test sees; tests must exercise the real code paths.

### What NOT to mock

- `AGENTS` array from `src/agents/registry.ts` — mock this and your test proves nothing about real install behavior.
- File I/O for the sentinel splice — use scratch HOME, not stubs.
- `subpath_sha256` verification — the whole point of the integrity check is that it catches tampering; a mocked hash cannot catch anything.

---

## Release

```bash
bun run release vX.Y.Z        # clean-tree gate → ci → changelog → tag → build:all
bun run release vX.Y.Z --gh   # also create GitHub release and upload dist/*
```

Steps performed by `scripts/release.ts`:

1. Verify working tree is clean (`git status --porcelain`).
2. Run `bun run ci` (full 6-stage gate).
3. `bun run changelog` — regenerate `CHANGELOG.md` via `git-cliff`.
4. `git tag vX.Y.Z`.
5. `bun run build:all` — cross-compile to 5 targets in `dist/`.
6. (With `--gh`) `gh release create vX.Y.Z dist/*` — upload binaries.

The release does **not** push. Push is a separate deliberate step.

### Commit and tag convention

- Conventional commits: `type(scope): subject` — `feat|fix|docs|refactor|test|chore|perf|build|ci`.
- `git-cliff` reads these to generate `CHANGELOG.md`.
- Tags: `vX.Y.Z` (semver). No pre-release tags in current mode.

### No GitHub Actions

Local `bun run ci` and `bun run release` are the gates. No `.github/workflows/` exists. If added later, workflows must be additive, not a source-of-truth replacement.

---

## Cross-refs

- [HANDOVER.md](../HANDOVER.md) — live state, decisions on the record, §6 layer specs.
- [AGENTS.md](../AGENTS.md) — project conventions that apply to code in this repo.
- [docs/hooks.md](hooks.md) — hook event catalogue and recipe library.
- [docs/skills.md](skills.md) — skill paths, authoring template, verification.
- [docs/mcp.md](mcp.md) — MCP policy, registry CLI, auth.
- [docs/agents.md](agents.md) — per-agent config translation.
- [docs/caveman.md](caveman.md) — compression gate, CI, opt-out.
- [contributing.md](contributing.md) — PR workflow, code style, reviewer expectations.
