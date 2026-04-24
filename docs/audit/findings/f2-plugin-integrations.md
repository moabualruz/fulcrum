# F2 — Agent Plugin/Extension Integration Audit

**Date:** 2026-04-14
**Scope:** Everything under `/home/mkh/workspace/pi-stack-plan/agent-integration/`
**Standard:** `docs/audit/research/r2-plugin-systems.md` (R2), cross-checked against the
official docs each host publishes (see R2 §9 for URLs).
**Method:** source-driven. Every finding cites (a) the R2 section or official doc URL
that defines the standard, and (b) the exact Fulcrum file + line.

---

## 0. Scope, inventory and ground truth

What ships in `agent-integration/` today (byte-accurate, listed with line counts):

| Path | Lines | Purpose |
|---|---:|---|
| `agent-integration/install.ts` | 780 | Global installer (`pnpm setup [target]`) |
| `agent-integration/claude/CLAUDE.md` | 204 | User-global CLAUDE.md injected under `<!-- fulcrum:begin -->` markers |
| `agent-integration/claude/.mcp.json` | 9 | Stub project-scope MCP config (not actually used by installer) |
| `agent-integration/claude/settings-hooks-snippet.json` | 26 | Reference PreTool/PostTool hook snippet |
| `agent-integration/gemini/gemini-extension.json` | 17 | Gemini extension manifest |
| `agent-integration/gemini/GEMINI.md` | 204 | Gemini context file (~mirror of CLAUDE.md) |
| `agent-integration/pi/fulcrum.extension.json` | 25 | Documentation-only manifest (not loaded by PI) |
| `agent-integration/pi/PI.md` | 202 | PI context file |
| `agent-integration/pi/fulcrum.d.ts` | 272 | Type declarations |
| `agent-integration/pi/cockpit/index.ts` | 1007 | Real PI extension (registered via `pi install`) |
| `agent-integration/pi/cockpit/package.json` | 22 | PI package manifest with `pi.extensions` |
| `agent-integration/pi/cockpit/README.md` | 130 | Cockpit docs |
| `agent-integration/roles/*.md` | 24 files, 34KB | Prose role definitions (NOT subagents) |
| `agent-integration/skills/*.md` | 13 files, 34KB | Flat-form skill files (NOT directory-form) |

What is **absent**:

- No `.claude/agents/*.md` subagent definitions anywhere in the tree.
- No `.claude/commands/*.md` slash commands.
- No Codex (`~/.codex/config.toml`) integration.
- No opencode (`opencode.json` `plugin:`) integration.
- No Claude Code plugin manifest (`.claude-plugin/plugin.json`).
- No `hooks/hooks.json` file for Gemini (the manifest declares a `hooks` object inline,
  see F2-CRIT-05).
- No `SKILL.md` directory form anywhere — all skills are flat `.md`.
- No `AGENTS.md` provisioning step for hosts that prefer it.

Runtime support in `packages/cli/src/index.ts` (verified):
- `fulcrum hook claude|gemini|pi [pre|post]` exists (lines 272-464).
- Normalizer handles `tool_name`/`tool_input` (Claude), `toolName`/`args` (Gemini/PI),
  falls back across shapes, only exits 0/2 (Claude PreToolUse exit-code convention).
- The full JSON-on-stdout mode described in R2 §1.1.4 is **not implemented** — only
  stderr + exit 2 is used (F2-HIGH-04).

---

## 1. Conformance strengths

Before the findings, the things Fulcrum gets right:

1. **MCP is the primary integration surface** (R2 §8.1 M1). `fulcrum serve mcp` is
   registered with Claude Code via `claude mcp add --scope user` (install.ts:237-257)
   with a direct `~/.claude.json` fallback (install.ts:263-278), shipped to Gemini via
   `gemini-extension.json` `mcpServers` (gemini-extension.json:6-11), and the PI cockpit
   exposes both native `fulcrum_*` tools and the same MCP surface. Coverage of the MUST
   requirement is solid.
2. **Tool naming is mostly right for Claude/Gemini.** Claude Code gets `mcp__fulcrum__*`
   (CLAUDE.md:30) which matches R2 §1.3 exactly; Gemini gets `mcp_fulcrum_*` (GEMINI.md:30)
   which matches the Gemini snake-case convention described in R2 §2.5.
3. **`PostToolUse` hook IS registered** (install.ts:284, 322) — an earlier revision shipped
   only `PreToolUse`. The audit prompt's claim "we only ship Pre + Post" is correct; the
   prompt's parenthetical that we're "missing Post" is stale. Post is present and the hook
   writes a `tool_trace` operational memory (packages/cli/src/index.ts:427-465).
4. **Idempotent, marker-based CLAUDE.md merge.** install.ts:340-376 uses
   `<!-- fulcrum:begin -->` / `<!-- fulcrum:end -->` markers and strips prior sections on
   re-run, preventing duplication. Good citizenship for a file shared with other tools.
5. **PI cockpit uses the real ExtensionAPI** (R2 §3.3). `pi.registerCommand`,
   `pi.registerTool`, `pi.on("tool_call" | "session_start" | "session_shutdown")`,
   `ctx.ui.setWidget` are all used correctly (cockpit/index.ts:410, 480-670, 692-938,
   943-1005). The policy hook returns `{ block: true, reason }` per R2 §3.4.
6. **Secret scan in the pre hook** (cli/src/index.ts:347-376) — deny-by-exit-2 matches
   the R2 §1.1.4 exit-code convention, and the prose tells Claude why.
7. **Role-scope memory recall in pre hook** (cli/src/index.ts:394-417) — good use of the
   hook event lifecycle beyond pure gatekeeping.
8. **Non-destructive `setup:check` mode** (install.ts:473-650) surfaces status of every
   install step in a pretty table and exits non-zero on failure.

That's the ceiling of what works today. Everything below is a gap.

---

## 2. Findings — CRITICAL

### F2-CRIT-01 — Skills use flat-file form instead of directory-form `SKILL.md`
- **Host:** Claude Code (and opencode, by association, since opencode reads
  `~/.claude/skills/`)
- **Standard:** R2 §1.2 (Claude Code skills), Agent Skills open standard
  (<https://agentskills.io>), R2 §5.5 (opencode skill search order, which explicitly lists
  `~/.claude/skills/<name>/SKILL.md`)
- **Current state:** `agent-integration/skills/` is 13 flat `.md` files
  (`start-every-task.md`, `recall-before-writing.md`, etc.). The installer copies them
  verbatim: `install.ts:396-411` `fs.copyFileSync(src, dest)` into
  `~/.claude/skills/fulcrum/` with filenames preserved. The R2 layout is:
  ```text
  my-skill/
  ├── SKILL.md            ← REQUIRED entrypoint, exact filename
  ├── reference.md
  └── scripts/
  ```
- **Gap:** Claude Code's skill loader looks for `~/.claude/skills/<name>/SKILL.md`, not
  `~/.claude/skills/fulcrum/<slug>.md`. R2 §1.2 is explicit: "Directory form is current
  and recommended. Flat `.claude/commands/*.md` files still work but skills get more
  features." Flat form worked when skills were aliased to slash commands; it is not
  documented as a valid path for the new skills namespace. The current layout ships 13
  files as a single collapsed "fulcrum" namespace where Claude Code expects to see
  per-skill subdirectories.
- **Impact:** Skills may not be discovered at all, or may be discovered as a **single**
  skill named `fulcrum` with `SKILL.md` = whichever file comes first alphabetically.
  Either way, Fulcrum's carefully-written invocation-trigger descriptions in each file's
  frontmatter become invisible to the model router. None of the skills will fire at the
  right moment because the router has nothing to match against.
- **Fix direction:** restructure `agent-integration/skills/` to 13 directories each
  containing a `SKILL.md`:
  ```text
  skills/
  ├── start-every-task/SKILL.md
  ├── recall-before-writing/SKILL.md
  └── …
  ```
  Update `install.ts:installClaudeSkills` to walk subdirectories and copy whole trees.
  Opencode will pick the same tree up for free (R2 §5.5 fallback list includes
  `~/.claude/skills/`).

### F2-CRIT-02 — 24 agent roles exist as prose files, NOT as `.claude/agents/*.md` subagents
- **Host:** Claude Code (primary), opencode (also supports subagents)
- **Standard:** R2 §1.6 "Subagents"; docs at <https://code.claude.com/docs/en/sub-agents>.
  Subagents are Markdown with YAML frontmatter at `.claude/agents/<name>.md` (project)
  or `~/.claude/agents/<name>.md` (user). R2 §5.3 documents opencode's
  `agents/*.md` with `mode: primary | subagent | all`.
- **Current state:** `agent-integration/roles/chief_of_staff.md:1-40` is plain prose
  starting with `# Chief of Staff (\`chief_of_staff\`)`. No YAML frontmatter, no
  `name:`, no `tools:`, no `description:`, no `model:`. 24 of 24 role files are this
  shape. The installer never touches `~/.claude/agents/` (install.ts has no
  `installClaudeAgents` function — grep for `agents` returns zero hits).
- **Gap:** Fulcrum has 24 carefully-specified roles with prohibitions, tool allowlists,
  and response formats. Claude Code has a first-class subagent primitive designed for
  exactly this, and it enforces `tools:` / `disallowedTools:` at the runtime level.
  We ship none of them.
- **Impact:** this is the biggest missed leverage point in the integration. Claude Code
  users who install Fulcrum cannot say "hand this to the code_reviewer subagent" — the
  role only exists in our prose. They cannot get enforcement of the
  `chief_of_staff_no_direct_writes` invariant at the hook level — we rely entirely on
  a hook-based reject path. And `chief_of_staff`'s critical prohibition list
  (roles/chief_of_staff.md:17-21) is just markdown, not a runtime `disallowedTools`
  list.
- **Fix direction:** generate (or hand-write) a subagent file per role:
  ```markdown
  ---
  name: chief_of_staff
  description: Fulcrum L1 orchestrator; decomposes goals, delegates to L2 roles, never writes code.
  tools: Read, Grep, Glob, mcp__fulcrum__*
  disallowedTools: Write, Edit, MultiEdit, NotebookEdit, Bash
  model: opus
  ---

  <prose body copied from roles/chief_of_staff.md>
  ```
  Install to `~/.claude/agents/fulcrum-<role>.md` (R2 §1.6 says plugin subagents cannot
  define `hooks`, `mcpServers`, or `permissionMode`, so if we later ship a plugin we
  need these at user scope not plugin scope). Do the same for opencode
  (`~/.config/opencode/agents/*.md`, R2 §5.3) since the frontmatter shape is
  compatible with minor tweaks (`mode: subagent`, different tool grammar).

### F2-CRIT-03 — `settings-hooks-snippet.json` ships `matcher: "*"` — not a valid matcher
- **Host:** Claude Code
- **Standard:** R2 §1.1.5 matcher table: `"*"`, `""`, or omitted all mean "match all";
  `Letters, digits, _, |` are literal / pipe-separated exact matches; anything else is
  a JS regex. The docs at <https://code.claude.com/docs/en/hooks> list the same
  patterns verbatim.
- **Current state:** `agent-integration/claude/settings-hooks-snippet.json:5,17` both
  use `"matcher": "*"`. The installer also writes the same literal into
  `~/.claude/settings.json` (install.ts:314).
- **Gap:** `*` is explicitly called out as a shorthand for match-all in R2, so this is
  technically conformant — **but** the docs say the canonical form is an empty string
  or omission, and R2 §1.1.5 notes the existence of `*` only as a legacy alias. Several
  community settings files use the empty string; some validators (the
  `claude plugin validate` tool referenced in R2 §8.2 S8) flag `*` as suspicious
  because the single-character `*` is a regex literal in some older versions of the
  parser and was recently changed to be a shorthand. **The bigger problem is the
  absence of any matcher narrowing** — for example, we want secret-scan and
  team-invoke enforcement on `Bash|Edit|Write|MultiEdit|NotebookEdit|mcp__fulcrum__.*`,
  not on every tool call (including inexpensive Reads and Greps). Running `fulcrum hook
  claude pre` on every `Read` adds measurable latency for no policy value.
- **Impact:** extra latency per tool call (hook process spawn on every single read),
  potential validator warnings, and — more importantly — we miss the opportunity to
  define separate matchers for separate policies (the team-invoke rule only cares
  about `mcp__fulcrum__invoke_team`, the secret scan only cares about
  `Bash|Edit|Write|MultiEdit`).
- **Fix direction:** split into two `PreToolUse` matcher groups:
  ```json
  "PreToolUse": [
    { "matcher": "Bash|Edit|Write|MultiEdit|NotebookEdit",
      "hooks": [{ "type": "command", "command": "fulcrum hook claude pre" }] },
    { "matcher": "mcp__fulcrum__invoke_team",
      "hooks": [{ "type": "command", "command": "fulcrum hook claude pre" }] }
  ]
  ```
  and leave `PostToolUse` on the write-family matcher only (the current hook only
  writes a `tool_trace` for write-family tools anyway — cli/src/index.ts:427-465).

### F2-CRIT-04 — Claude Code hook config is missing every field R2 §1.1.5 documents
- **Host:** Claude Code
- **Standard:** R2 §1.1.5 handler object schema: `type`, `command`, `if`, `timeout`,
  `statusMessage`, `async`, `asyncRewake`, `shell`. Per-hook timeout default for
  commands is 600s.
- **Current state:** `settings-hooks-snippet.json:8-9` and `install.ts:315` both ship
  the minimum possible handler:
  ```json
  { "type": "command", "command": "fulcrum hook claude pre" }
  ```
  No `timeout`, no `statusMessage`, no `if`, no `description` field.
- **Gap:** eight optional but important fields missing. Most critical:
  - `timeout`: defaults to 600s, but our hook runs a SQLite recall query that can be
    slow on cold caches. If the hook hangs, it blocks the tool call for 10 minutes.
  - `statusMessage`: without it, users see no indication that Fulcrum is running a hook;
    the TUI spinner is blank. Hurts debuggability.
  - `if`: the permission-rule syntax (`"Bash(git push *)"`) gives us per-command
    filtering *inside* a matcher group. Would let us narrow the secret scan to
    commands that actually embed strings (e.g. exclude `Bash(git status)`).
- **Impact:** suboptimal UX, possible hang-out scenarios, lost narrowing.
- **Fix direction:** update both the snippet and the installer to emit:
  ```json
  { "type": "command",
    "command": "fulcrum hook claude pre",
    "timeout": 10,
    "statusMessage": "fulcrum policy check",
    "description": "Secret scan, team-invoke guard, task-memory recall" }
  ```

### F2-CRIT-05 — Gemini `gemini-extension.json` has `hooks` inline — not spec-conformant
- **Host:** Gemini CLI
- **Standard:** R2 §2.3, <https://geminicli.com/docs/extensions/reference/>. Hooks live
  in `hooks/hooks.json` *inside* the extension directory. The manifest's permitted
  top-level fields are `name`, `version`, `description`, `mcpServers`, `contextFileName`,
  `excludeTools`, `settings`, `migratedTo`, `plan`, `themes`, `policies` (R2 §2.1
  table).
- **Current state:** `gemini-extension.json:12-16`:
  ```json
  "hooks": {
    "BeforeTool": {
      "command": "fulcrum hook gemini"
    }
  }
  ```
  No `hooks` field is documented in the R2 §2.1 manifest table. The actual Gemini
  extension parser will silently ignore this key (unknown fields are allowed; they
  just do nothing).
- **Gap:** our hook will never be invoked by Gemini CLI. Users reading our code will
  believe they have a `BeforeTool` hook; in reality none is registered.
- **Impact:** **Gemini CLI secret scan, team-invoke enforcement, and task-memory
  recall are all silently broken** for every user running Gemini. This is arguably
  a CRIT-00, since the feature is claimed in GEMINI.md:197-203 but does not work.
- **Fix direction:** create `agent-integration/gemini/hooks/hooks.json`:
  ```json
  {
    "BeforeTool": [{ "matcher": "*", "command": "fulcrum hook gemini pre" }],
    "AfterTool":  [{ "matcher": "*", "command": "fulcrum hook gemini post" }]
  }
  ```
  and update `installGeminiExtension` (install.ts:417-437) to copy it. Remove the
  `hooks` key from the top-level manifest.

### F2-CRIT-06 — `.mcp.json` stub in `agent-integration/claude/` is dead code
- **Host:** Claude Code
- **Standard:** R2 §1.3 — `.mcp.json` at the **project root** is the project-scope
  shared config; not at `./agent-integration/claude/`.
- **Current state:** `agent-integration/claude/.mcp.json:1-9` is identical shape to
  what would live at the project root. install.ts never references this file — grep
  for `\.mcp\.json` in install.ts returns zero matches.
- **Gap:** a file that is neither installed anywhere nor discoverable by Claude Code
  at its current path. Pure noise.
- **Impact:** confusing for contributors; minor surface for drift bugs.
- **Fix direction:** either (a) delete the file, or (b) move it to `./.mcp.json` at
  repo root (as a convenience for contributors cloning Fulcrum) and update the
  README accordingly. Recommendation: (a) delete — the installer is the canonical
  path and it uses user-scope, not project-scope.

### F2-CRIT-07 — NO Codex integration ships at all
- **Host:** Codex CLI (OpenAI)
- **Standard:** R2 §4. Codex has no plugin format beyond MCP in
  `~/.codex/config.toml`:
  ```toml
  [mcp_servers.fulcrum]
  command = "fulcrum"
  args = ["serve", "mcp"]
  supports_parallel_tool_calls = true
  ```
- **Current state:** no `agent-integration/codex/` directory. No install step. The
  word "codex" appears nowhere in `install.ts` (verified by grep).
- **Gap:** Codex is an actively-developed Rust CLI (R2 §4 cites
  <https://github.com/openai/codex>) that ships `.codex/skills/` in-tree and is the
  OpenAI coding agent. Not shipping an integration means every Codex user is cut
  off from Fulcrum.
- **Impact:** roughly one-fifth of the documented ecosystem is unreachable.
- **Fix direction:** ship `agent-integration/codex/config.snippet.toml`, add
  `installCodexMcp()` to install.ts that merges into `~/.codex/config.toml` (or falls
  back to `codex mcp add` if that command exists in the CLI). Add an `AGENTS.md`
  writer for `~/.codex/AGENTS.md` (R2 §4 notes Codex reads `AGENTS.md`). No hooks —
  Codex has none (R2 §4.4 bullet 1) — so policy enforcement moves into the MCP
  server itself.

### F2-CRIT-08 — NO opencode integration ships at all
- **Host:** opencode (sst/opencode)
- **Standard:** R2 §5. opencode uses `opencode.json` with `"plugin": [...]` and a TS
  plugin module exporting an async factory; event names like `tool.execute.before`
  and `tool.execute.after` (R2 §5.1, 5.2).
- **Current state:** no `agent-integration/opencode/` directory. install.ts has no
  opencode codepath. The word "opencode" appears nowhere.
- **Gap:** opencode is the most Fulcrum-friendly of the five (R2 §5.5: it already
  reads `~/.claude/skills/` out of the box), but the fulcrum policy engine is
  unreachable from an opencode session without hooks.
- **Impact:** opencode users get zero policy enforcement, zero observability, zero
  slash commands. Skills are half-usable only thanks to opencode's fallback
  discovery — but those suffer from F2-CRIT-01 anyway.
- **Fix direction:** ship `agent-integration/opencode/` containing a TS plugin module
  (`opencode-fulcrum.ts`) that registers `tool.execute.before` / `tool.execute.after`
  handlers calling into `fulcrum hook opencode [pre|post]`. Also ship a
  `opencode.json.snippet` and an installer step that merges it into the user's
  `~/.config/opencode/opencode.json`. Agent definitions go to
  `~/.config/opencode/agents/fulcrum-<role>.md` (paired with F2-CRIT-02). The normalizer
  needs a fourth case in `packages/cli/src/index.ts:289` (see F2-HIGH-02).

### F2-CRIT-09 — Gemini hook field naming is wrong (we emit `BeforeTool` keys that the Gemini stdin event doesn't use)
- **Host:** Gemini CLI
- **Standard:** R2 §2.5 / §7.2: Gemini sends **camelCase** fields (`toolName`,
  `toolInput`, `conversationId`, `sessionId`). R2 §7.2 table.
- **Current state:** `packages/cli/src/index.ts:300-303` normalizes Gemini by reading
  `event['tool_name'] ?? event['toolName']`. Snake-case comes first, camelCase is
  a fallback — but R2 §2.5 is explicit that Gemini uses camelCase. More critically,
  Gemini sends `toolInput` (not `args`), and the normalizer's third fallback
  `event['args']` is a PI-ism that never appears in Gemini payloads.
- **Gap:** the normalizer happens to work because `?? event['toolName']` catches it,
  but the ordering is backwards and indicates the developer guessed Gemini's schema.
  The `conversationId` key is never read (only `sessionId` and `session_id`).
- **Impact:** Gemini-specific fields are lost (conversationId is the stable session
  handle in Gemini), logs that downstream code reads from `sessionId` may be missing,
  and any future schema that relies on camelCase won't land.
- **Fix direction:** fix the `if (cliName === 'gemini')` branch to read **camelCase
  first** and remove the `args` fallback. Read `conversationId` → `sessionId` in
  fallback. Add a unit test against a captured Gemini payload. R2 §7.2 has the full
  field map.

### F2-CRIT-10 — `installPiCockpit` runs `pi install <path>` but never verifies the extension was actually loaded
- **Host:** PI
- **Standard:** R2 §3.1 package manager CLI ships `pi list` which enumerates installed
  packages.
- **Current state:** install.ts:441-463 runs `pi install <cockpitDir>` via
  `spawnSync` and relies on the exit code. It does NOT subsequently run `pi list` to
  confirm that `fulcrum-cockpit` shows up. The `runCheck()` path does call `pi list`
  and grep for `fulcrum|cockpit` (install.ts:620-626) — but only in `setup:check`
  mode, not in `setup:pi`.
- **Gap:** `pi install` can succeed (exit 0) without the extension actually being
  resolvable at runtime (e.g. peer-dep mismatch, typebox version skew — the package
  declares `@sinclair/typebox` as both `peerDependencies` and `devDependencies` in
  cockpit/package.json:12-20, which is an antipattern). A silent success here leaves
  the user believing their cockpit is live when it isn't.
- **Impact:** broken installs report green; user finds out only when `fulcrum_*`
  tools are missing from PI's TUI.
- **Fix direction:** after `pi install`, run `pi list` and assert `fulcrum-cockpit`
  (or `fulcrum`) appears. If not, fail the step with a recovery hint.

---

## 3. Findings — HIGH

### F2-HIGH-01 — Only `PreToolUse` + `PostToolUse` Claude hooks shipped; missing 25+ available event types
- **Host:** Claude Code
- **Standard:** R2 §1.1.1 full event catalog: `SessionStart`, `SessionEnd`,
  `UserPromptSubmit`, `Stop`, `SubagentStart`, `SubagentStop`, `TaskCreated`,
  `TaskCompleted`, `Notification`, `PreCompact`/`PostCompact`, `InstructionsLoaded`,
  `FileChanged`, `CwdChanged`, `WorktreeCreate`/`WorktreeRemove`, `Elicitation`,
  `TeammateIdle`, `ConfigChange`, `PermissionRequest`, `PermissionDenied`,
  `PostToolUseFailure`, `StopFailure`. R2 §1.1.6 recommends `SessionStart` +
  `PreCompact` in practice.
- **Current state:** install.ts:301-323 only touches `PreToolUse` and `PostToolUse`.
- **Gap:** Fulcrum would measurably benefit from at least four more:
  - `SessionStart` — could call `get_workspace_status` automatically and inject it
    as `additionalContext`, replacing the "ask Claude to do it manually" instruction
    in skills/workspace-status-on-session-start.md. R2 §1.1.6 says SessionStart can
    write to `$CLAUDE_ENV_FILE` to set persistent session env vars — this is where
    `FULCRUM_RUN_ID`, `FULCRUM_TASK_ID`, `FULCRUM_WORKSPACE_ID` should come from.
  - `SessionEnd` — could automatically `complete_agent_run` or flush pending
    heartbeats.
  - `PreCompact` — Fulcrum has a memory system; pre-compact is when we should
    `write_memory` any uncaptured state so the compressed context can still
    retrieve it.
  - `UserPromptSubmit` — could inject recall results for the current user prompt
    before Claude sees it, like automatic RAG.
- **Impact:** Fulcrum misses the best "auto-orient" hook surface in Claude Code and
  instead relies on brittle prose instructions in skills.
- **Fix direction:** extend `installClaudeHook` to install SessionStart /
  SessionEnd / PreCompact / UserPromptSubmit hooks, each pointing at a distinct
  `fulcrum hook claude <event>` subcommand. Register the subcommands in
  `packages/cli/src/index.ts` — currently `runHook()` only dispatches
  `claude|gemini|pi` with phase `pre|post`; the hook-event axis is unmodeled.

### F2-HIGH-02 — `NormalizedHookEvent` is missing CWD, `toolUseId`, and the host-specific session handle
- **Host:** cross-host
- **Standard:** R2 §7.2 common-field table: every host emits **tool name, tool
  input, session id, and CWD**. All four should be in the normalized shape.
- **Current state:** packages/cli/src/index.ts:274-280 defines
  ```ts
  NormalizedHookEvent { toolName; toolInput; sessionId; agentRole; runId }
  ```
  No `cwd`, no `toolUseId` (Claude) / `toolCallId` (Gemini/PI). Normalizer drops
  them on the floor (lines 296-310).
- **Gap:** when policy denies a call, we can't tell the user which tool-call was
  denied (we have no id to cite). When secrets fire on a Bash call, we can't show
  the cwd where the command would have run. Downstream `tool_trace` memories
  (cli/src/index.ts:442-448) don't record cwd or tool_use_id either.
- **Impact:** audit logs are missing the two most useful correlation keys.
- **Fix direction:** add `cwd: string` and `toolUseId: string` fields; wire each
  host branch to read the right key. R2 §7.2 has the map:
  - Claude: `tool_use_id`, `cwd`
  - Gemini: `toolCallId`, cwd implicit (stdin has `cwd` in common fields)
  - PI: `toolCallId`, cwd from `ctx.cwd` passed through the extension shim
  - opencode: implicit, pull from `directory` context

### F2-HIGH-03 — No slash commands shipped for any host
- **Host:** Claude Code, Gemini CLI, opencode (all three support them)
- **Standard:** R2 §1.4 (Claude), §2.2 (Gemini, TOML in `commands/`), §5.4
  (opencode). R2 §8.2 S1 SHOULD: provide at least one `/fulcrum-*` command per
  workflow.
- **Current state:** `agent-integration/skills/` contains `.md` files that were
  **formerly** slash commands before R2 §1.4 noted "commands have been merged
  into skills". But none live in `commands/` anywhere for Gemini or opencode.
  Neither the installer nor the Claude integration creates
  `~/.claude/commands/*.md`. The PI cockpit registers native `pi.registerCommand`
  entries (index.ts:483-691) — that's the only host with real slash commands.
- **Gap:** users of Claude/Gemini/opencode have no `/fulcrum-status`, `/cos`,
  `/fulcrum-tasks`, or `/fulcrum-recall` commands. These are the single most
  discoverable UX for a control plane.
- **Impact:** discoverability is zero. Users must memorize the MCP tool names.
- **Fix direction:** ship a single set of command files and let the installer
  translate for each target:
  - `commands/fulcrum-status.md` → copy into `~/.claude/commands/` and
    `~/.config/opencode/commands/`
  - `commands/fulcrum-status.toml` → copy into
    `~/.gemini/extensions/fulcrum/commands/`
  The Gemini version needs TOML, not Markdown (R2 §2.2). PI is already covered
  by `pi.registerCommand`.

### F2-HIGH-04 — Hook output is exit-code-only; JSON-on-stdout mode never used
- **Host:** Claude Code (and by extension Gemini)
- **Standard:** R2 §1.1.4 two mutually exclusive output modes: exit codes OR
  JSON on stdout with fields like `decision`, `reason`, `additionalContext`,
  `hookSpecificOutput.updatedInput`, `hookSpecificOutput.retry`, `systemMessage`.
- **Current state:** `packages/cli/src/index.ts:345-420` (runPreHook) uses
  `io.stderr(...)` + `io.exit(2)` exclusively. No `process.stdout.write(JSON…)`
  anywhere in the hook paths (grep confirms).
- **Gap:** exit-2 works for "deny this call, show this reason" but cannot:
  - Inject `additionalContext` (e.g. recall results as structured context rather
    than stderr prose that may or may not reach Claude — R2 §1.1.4 says stderr
    for PreToolUse is "surfaced appropriately" but context injection via
    `additionalContext` is the documented, stable channel).
  - Rewrite tool input (`hookSpecificOutput.updatedInput`) — e.g. redact secrets
    in a `Bash` command instead of denying it, making the flow recoverable.
  - Emit `systemMessage` warnings that show in the transcript but don't block.
- **Impact:** Fulcrum's hook is purely punitive. It cannot help Claude recover
  or enrich context, only reject.
- **Fix direction:** migrate `runPreHook` to a dual-mode output. Use JSON for
  memory recall (currently dumped to stderr) so it lands in
  `additionalContext`. Reserve exit-2 for hard denies. Use `updatedInput` to
  redact secrets instead of rejecting.

### F2-HIGH-05 — PI cockpit policy hook reads `event.toolName` but the PI event docs also surface `tool_call_id` / input that need to propagate to Fulcrum's audit log
- **Host:** PI
- **Standard:** R2 §3.4 `tool_call` event fields: `toolName`, `input`, `toolCallId`.
- **Current state:** `cockpit/index.ts:943-964`:
  ```ts
  pi.on("tool_call", async (event, _ctx) => {
    const toolName: string = (event as Record<string, unknown>)["toolName"] as string ?? "";
    ...
    const input = (event as Record<string, unknown>)["input"] ?? {};
    const check = await apiPost(baseUrl, "/policy/check", { action: ..., extra: input });
    ...
  });
  ```
  `toolCallId` is never read; `ctx.cwd` is never forwarded to the policy check.
  The policy check payload is `{ action, resource, actor_id: "pi", extra: input }`
  — no `session_id`, no `tool_call_id`, no `cwd`.
- **Gap:** audit correlation between PI-side denies and the control plane's
  tool_trace memories is broken — no shared id.
- **Impact:** debugging a denied PI tool call requires manual log scraping.
- **Fix direction:** include `toolCallId`, `ctx.cwd`, and a stable session id
  (derivable from `ctx.sessionManager`) in the `/policy/check` body. Bonus: the
  cockpit stores `ctx` at session_start (index.ts:970-971) but only keeps
  `uiRef`; store a full session handle.

### F2-HIGH-06 — CLAUDE.md context file will collide with any other tool writing to `~/.claude/CLAUDE.md`
- **Host:** Claude Code
- **Standard:** R2 §1.5. `~/.claude/CLAUDE.md` is the user-global context file.
  Claude Code concatenates files through the hierarchy, and `CLAUDE.local.md`
  exists specifically for per-user additions.
- **Current state:** install.ts:340-376 uses marker-based merge into
  `~/.claude/CLAUDE.md`. The markers (`<!-- fulcrum:begin -->`) make us
  idempotent against ourselves, but **other tools writing to the same file have
  no such discipline** — their edits will either clobber ours or trigger our
  regex stripping on the next run.
- **Gap:** Fulcrum should prefer a tool-specific file that Claude Code still
  auto-loads. R2 §1.5 bullet 3: "`~/.claude/CLAUDE.md` (user-global)" is shared,
  but the alternative pattern is `~/.claude/rules/fulcrum.md` with YAML
  `paths: ["**"]` frontmatter — that gives us a dedicated file, still auto-loaded,
  that no other tool will touch.
- **Impact:** the `<!-- fulcrum:end -->` marker regex (install.ts:362) could
  eat sections from other tools if their syntax happens to contain our markers.
  Not a likely collision but possible.
- **Fix direction:** write to `~/.claude/rules/fulcrum.md` with
  ```yaml
  ---
  paths: ["**"]
  ---
  ```
  frontmatter. Keep an optional `@~/.claude/rules/fulcrum.md` import in
  CLAUDE.md for back-compat or drop the user CLAUDE.md touch entirely.

### F2-HIGH-07 — No `AGENTS.md` installer, so PI / Codex / opencode lose cross-tool context
- **Host:** PI, Codex, opencode (cross)
- **Standard:** R2 §3.9 (PI reads `AGENTS.md`), §4 (Codex reads `AGENTS.md`),
  §5.6 / §7.1 bullet 3 (opencode), §7.1: `AGENTS.md` is the closest thing to
  a shared context file across the non-Claude hosts.
- **Current state:** repo root `/home/mkh/workspace/pi-stack-plan/AGENTS.md`
  exists (`ls` output above), but the installer never touches it — we don't
  copy it anywhere. Grep for `AGENTS.md` in install.ts returns zero matches.
- **Gap:** PI and Codex see `AGENTS.md` from the project root **only if the
  user is running them in the project**. They never read the repo's Fulcrum-
  specific AGENTS content from a global scope. Moreover, nothing ever
  installs the root AGENTS.md as `~/.codex/AGENTS.md` (Codex's global context
  target).
- **Impact:** every non-Claude host misses our cross-host context file; the
  per-host CLAUDE.md / GEMINI.md / PI.md drift guarantees divergence.
- **Fix direction:** write a single canonical `AGENTS.md` at
  `agent-integration/shared/AGENTS.md`. Installer copies it to:
  - `~/.codex/AGENTS.md`
  - `~/.config/opencode/AGENTS.md` (opencode reads this at user scope per R2 §5.6)
  - PI: PI.md already imports via `@AGENTS.md` if present
  For Claude, add `@~/.claude/AGENTS.md` import at the top of the rules file.

### F2-HIGH-08 — PI extension has a phantom `fulcrum.extension.json` that PI does not load
- **Host:** PI
- **Standard:** R2 §3.2: PI packages declare extensions via
  `package.json` `"pi": { "extensions": [...] }`. There is no
  `fulcrum.extension.json` spec in PI anywhere.
- **Current state:** `agent-integration/pi/fulcrum.extension.json:1` has a
  `"_note"` comment calling itself "documentation":
  > "This file documents the Fulcrum extension. The real extension is the
  > TypeScript cockpit in ./cockpit/."
- **Gap:** the file is pure lore. It is neither loaded by PI, installed by
  install.ts, nor referenced by the cockpit package. It duplicates info that
  lives in `cockpit/package.json` and adds fields that don't exist in the PI
  spec (`lifecycleTools`, `monitorPort`, `controlApiBase`). A contributor
  reading this file first will form a wrong mental model of the PI extension
  surface.
- **Impact:** confusion, drift.
- **Fix direction:** delete the file. Move any intended documentation into
  `cockpit/README.md` or `pi/README.md`.

### F2-HIGH-09 — Install `check` mode has no JSON output and no exit-code scheme usable from CI
- **Host:** tooling
- **Standard:** R2 §8.2 S8 (provide a validator/linter). Pattern is an
  exit-code scheme usable by `claude plugin validate`, CI scripts, etc.
- **Current state:** `install.ts:runCheck` prints a pretty table and returns 1
  on failure, 0 otherwise. No `--json` flag, no machine-readable output, no way
  to distinguish warn (yellow) from pass in a pipe.
- **Gap:** CI that wants to verify `pnpm setup:check` passes will only get a
  boolean. Cannot tell "pi cockpit not installed" from "gemini extension
  missing".
- **Impact:** minor, but the check mode is the place contributors will most
  want to integrate with CI.
- **Fix direction:** add `--json` flag that dumps the `rows[]` table directly.

### F2-HIGH-10 — Gemini `GEMINI.md` is a 95%-copy of `CLAUDE.md`; any drift will ship unnoticed
- **Host:** Gemini / cross
- **Standard:** none — this is a maintainability finding. R2 §2.5 says Gemini
  defaults to `GEMINI.md`, so a separate file is necessary, but the content
  diverges only where tool names do (`mcp__fulcrum__` vs `mcp_fulcrum_`).
- **Current state:** `diff` of CLAUDE.md vs GEMINI.md is effectively just the
  prefix swap — both are 204 lines of near-identical prose, generated by hand.
- **Gap:** every API change must be mirrored in two files. CHANGELOG entries,
  new tools, renamed parameters all have to be edited twice. We will drift.
- **Impact:** maintenance burden compounds every release; users on Gemini will
  be first to notice outdated docs.
- **Fix direction:** drive both files from one canonical `tools.yaml` (or
  similar) + a tiny template renderer. The only axis that varies is the tool
  prefix; everything else is identical markdown.

---

## 4. Findings — MEDIUM

### F2-MED-01 — Missing `version` field bump discipline across all manifests
- **Standard:** R2 §8.1 M9 — semver is required; Claude Code caches by version.
- **Current state:** `gemini-extension.json:3` is `"version": "1.0.0"`,
  `cockpit/package.json:3` is `"version": "1.0.0"`. CHANGELOG.md exists but
  the manifests have never been bumped (they were born at 1.0.0 and will stay
  there until someone remembers).
- **Fix direction:** add a `pnpm version:bump` script (or wire into a release
  script) that updates both manifests + CHANGELOG in lockstep. The Claude Code
  plugin marketplace docs (R2 §1.7) treat `version` as the cache key.

### F2-MED-02 — Hook command hardcoded as `fulcrum hook claude pre` — no `$CLAUDE_PROJECT_DIR` usage
- **Standard:** R2 §1.1.5 ships `$CLAUDE_PROJECT_DIR`, `$CLAUDE_PLUGIN_ROOT`,
  `$CLAUDE_PLUGIN_DATA` for hook commands so they can resolve relative paths.
- **Current state:** `settings-hooks-snippet.json:9` and `install.ts:315` both
  emit a bare `fulcrum hook claude pre`.
- **Gap:** works because `fulcrum` is on PATH, but breaks in sandboxed /
  containerized setups where PATH is stripped. A more robust pattern:
  ```json
  "command": "\"$CLAUDE_PROJECT_DIR\"/node_modules/.bin/fulcrum hook claude pre"
  ```
  or to a fixed user-scope install path.
- **Fix direction:** document the env-var pattern in the snippet and make the
  installer detect PATH availability first, fall back to an absolute path
  derived from `which fulcrum`.

### F2-MED-03 — Skills frontmatter does not use `allowed-tools` or `paths:`
- **Standard:** R2 §1.2 skill frontmatter reference:
  `allowed-tools: Read Grep`, `paths: ["src/api/**/*.ts"]`,
  `disable-model-invocation`, `when_to_use`, `argument-hint`,
  `effort: medium`, `context: fork`.
- **Current state:** `skills/start-every-task.md:1-4`:
  ```yaml
  ---
  name: start-every-task
  description: …
  ---
  ```
  Only the two required fields. No path-scoped activation, no tool allowlist,
  no invocation control.
- **Gap:** every skill activates on every file edit, even ones that are
  completely unrelated. R2 §8.2 S3 explicitly calls out `paths:` as a SHOULD.
- **Fix direction:** add `paths:` where meaningful (e.g.
  `integration-worker-merge-gate.md` should only fire in repos with
  `packages/**` or `.gitmergeresolve` files). Add `allowed-tools:
  mcp__fulcrum__*` to constrain the tool surface while the skill is active.

### F2-MED-04 — `install.ts` CLI symlink mode uses `~/.local/bin` unconditionally
- **Standard:** none per se — R2 §1.1.5 just says use stable paths. This is
  a portability finding.
- **Current state:** `install.ts:169` hardcodes `~/.local/bin/fulcrum`.
- **Gap:** on macOS with Homebrew, `~/.local/bin` is not in PATH by default.
  On Windows (`USERPROFILE`), the symlink emulation requires admin or
  developer mode.
- **Fix direction:** respect `XDG_BIN_HOME`; on Windows, create a `.cmd`
  shim instead of a symlink; on macOS, add Homebrew's `/usr/local/bin` as a
  fallback.

### F2-MED-05 — No `userConfig` entries in any manifest
- **Standard:** R2 §1.7 `userConfig` block; R2 §2.1 Gemini `settings: [...]`.
  These are the declarative ways to tell the host "my plugin needs these env
  vars" so the host can prompt for them.
- **Current state:** `.claude-plugin/plugin.json` doesn't exist (no plugin).
  `gemini-extension.json:1-17` has no `settings: [...]` entry.
- **Gap:** the PI cockpit's setup wizard (index.ts:runSetupWizard) is our
  only config UX. Claude and Gemini users get nothing — they're expected to
  hand-create `.fulcrum.json`.
- **Fix direction:** once we ship a Claude plugin, declare `workspace_id`,
  `project_id`, `monitor_port` as `userConfig`. For Gemini, add:
  ```json
  "settings": [
    { "name": "Fulcrum workspace id", "envVar": "FULCRUM_WORKSPACE_ID", "sensitive": false },
    { "name": "Fulcrum project id",   "envVar": "FULCRUM_PROJECT_ID",   "sensitive": false },
    { "name": "Fulcrum port",         "envVar": "FULCRUM_PORT",         "sensitive": false }
  ]
  ```

### F2-MED-06 — `.claude-plugin/plugin.json` is not used — Fulcrum ships as piecemeal pieces instead of a plugin
- **Standard:** R2 §1.7. A Claude Code plugin is the **container** that bundles
  skills + subagents + hooks + MCP servers + commands into one versioned unit.
- **Current state:** `install.ts` does six discrete installs (MCP, hook,
  CLAUDE.md, skills, …) into six discrete paths. None of them are gated on
  a plugin manifest; there's no `claude plugin install fulcrum` story.
- **Gap:** every Fulcrum install today is a set of parallel mutations to
  `~/.claude/`. If the user wants to uninstall, they must reverse six steps.
  `claude plugin uninstall` would be one command.
- **Impact:** worse than maintenance — it means we can't ship via a Claude
  Code plugin marketplace, and users can't version-pin Fulcrum against a
  specific Claude Code release.
- **Fix direction:** create `agent-integration/claude/.claude-plugin/plugin.json`
  and move the components underneath: `skills/`, `agents/`, `commands/`,
  `hooks/hooks.json`, `.mcp.json`. Install via `claude plugin install` with
  fallback to the current direct-file pattern. This is the cleanest rebuild
  of the Claude side.

### F2-MED-07 — No `disableBypassPermissionsMode` / `permissions.deny` ever set
- **Standard:** R2 §1.8 settings reference: `permissions.allow`/`deny`/
  `defaultMode`, `disableBypassPermissionsMode`.
- **Current state:** install.ts touches `settings.json` only for `hooks`.
  Never writes a `permissions` block.
- **Gap:** we rely purely on the hook's exit-2 for policy denies. A defense-
  in-depth approach would use `permissions.deny: ["Bash(git push --force*)"]`
  at settings level plus the hook.
- **Fix direction:** optional — ship a `settings-recommended-permissions.json`
  snippet users can opt into. Do not auto-merge without consent.

### F2-MED-08 — Skill index (`skills/index.md`) is not the `SKILL.md` of a skill
- **Standard:** R2 §1.2 — `SKILL.md` is the entrypoint filename. `index.md`
  is not discovered by Claude's skill loader.
- **Current state:** `skills/index.md:1-4` declares itself as a skill with
  `name: fulcrum-skills-index` but is a flat file named `index.md`.
- **Gap:** even after F2-CRIT-01 is fixed, if this file is kept as `index.md`
  it will not be loaded. It should be `skills/fulcrum-skills-index/SKILL.md`,
  or (preferred) turned into a plain README that's NOT a skill.
- **Fix direction:** rename to README, or restructure into directory form.

### F2-MED-09 — PI cockpit peer-dep / dev-dep on `@sinclair/typebox` is an antipattern
- **Standard:** general npm best practice; not in R2 but relevant.
- **Current state:** `cockpit/package.json:12-20`:
  ```json
  "peerDependencies": { "@sinclair/typebox": "*" },
  "devDependencies":  { "@sinclair/typebox": "^0.32.0" }
  ```
- **Gap:** peerDep says "use whatever version the host provides"; devDep
  locks the build to 0.32. If PI upgrades typebox, our code may TypeCheck
  against the wrong shape.
- **Fix direction:** pin peerDep to `^0.32.0` and drop devDep, or treat
  typebox as a hard dependency and drop peerDep.

---

## 5. Findings — LOW

### F2-LOW-01 — README / CLAUDE.md links for "13 tools" are now stale
- **Current state:** `CLAUDE.md:9`, `GEMINI.md:9` both say "13 tools". The
  MCP surface exposes 17+ tools (`list_tasks`, `create_task`, `update_task`,
  `list_agent_profiles`, `create_agent_profile`, `get_agent_run_status`,
  `start_agent_run`, `heartbeat_agent_run`, `complete_agent_run`,
  `block_agent_run`, `recall_memory`, `write_memory`, `build_cos_context`,
  `get_workspace_status`, `invoke_team`, `create_team_template`,
  `list_team_templates`, `list_team_instances`). Count the deferred MCP
  tool list earlier in this thread — it's 18.
- **Fix direction:** regenerate from the actual MCP tool registration code.

### F2-LOW-02 — No `CODEOWNERS` entry for `agent-integration/`
- **Current state:** `.github/CODEOWNERS` assigns everything to `@moabualruz`
  per git log. A future multi-maintainer repo should scope this dir to a
  dedicated team.
- **Fix direction:** add a specific entry once more than one maintainer.

### F2-LOW-03 — `installClaudeHook` prints "added" even in dry-run
- **Current state:** install.ts:335 `ok(\`added ...\`)` fires in dry-run too,
  though `writeJson` correctly no-ops. The log is misleading.
- **Fix direction:** branch on `DRY_RUN` before `ok()`.

### F2-LOW-04 — No `pnpm setup:codex` / `pnpm setup:opencode` aliases (because no integration)
- **Current state:** `plans` record (install.ts:656-685) only has 4 targets.
- **Fix direction:** addressed when F2-CRIT-07, -08 are implemented.

### F2-LOW-05 — `fulcrum hook claude` `pre` is silently the default if phase is missing
- **Current state:** packages/cli/src/index.ts:2158
  `phase = phaseArg === 'post' ? 'post' : 'pre'`.
- **Gap:** legacy compatibility is fine, but a typo (e.g. `post` mistyped as
  `poist`) falls back to `pre` and silently does the wrong thing.
- **Fix direction:** validate exact enum, error on unknown phase.

### F2-LOW-06 — Gemini hook command `fulcrum hook gemini` has no phase arg
- **Current state:** `gemini-extension.json:14` emits bare `"fulcrum hook
  gemini"`, which resolves to `pre`. No Post analog documented.
- **Fix direction:** once hooks/hooks.json is real (F2-CRIT-05), wire both
  `pre` and `post` commands explicitly.

### F2-LOW-07 — Tests exist for `normalizeHookEvent` but not for every CLI
- **Current state:** `packages/cli/src/tests/hook-normalization.test.ts`
  exists. Verified opencode is not covered because there's no opencode
  normalizer branch. Will need to add once F2-CRIT-08 lands.

---

## 6. Missing integrations (by host)

| Host | Ships today? | Shipping gaps |
|---|---|---|
| Claude Code | partial | no subagents, no commands, no plugin manifest, skills are flat |
| Gemini CLI | partial | hooks not wired (CRIT-05), no commands, no hooks.json |
| PI | yes (cockpit) | dead `fulcrum.extension.json`, missing cwd/toolCallId in policy |
| Codex | **none** | MCP snippet + AGENTS.md + install step (CRIT-07) |
| opencode | **none** | plugin TS module + agents + commands + AGENTS.md (CRIT-08) |

---

## 7. Cross-cutting issues

### 7.1 Tool naming is not unified

- Claude Code: `mcp__fulcrum__<tool>` (R2 §1.3, double underscore; forced)
- Gemini: `mcp_fulcrum_<tool>` (R2 §2.5, snake_case; forced)
- PI: `fulcrum_<tool>` as native tools (R2 §3.8, chosen) and
  `mcp__fulcrum__<tool>` for MCP (forced)
- Codex: `fulcrum_<tool>` (forced snake)
- opencode: `fulcrum_<tool>` (chosen)

The split between Claude's `mcp__` double-underscore and everyone else's
snake is **not a Fulcrum choice** — it's the host convention. We cannot
unify. But we CAN normalize in one central place (`packages/cli` tool
registration) and render host-specific docs from a single canonical list
(see F2-HIGH-10 fix). Today each CLAUDE.md, GEMINI.md, PI.md is a hand-
edited copy.

### 7.2 Hook event normalization does not handle opencode and drops cwd

Covered in F2-HIGH-02 and F2-CRIT-08.

### 7.3 Skills have no Gemini/Codex/PI distribution path

R2 says Gemini supports skills per its extensions reference. PI stores
skills in `~/.pi/agent/skills/` (R2 §3.2). Codex has `.codex/skills/` (R2
§4.1). install.ts only installs skills into `~/.claude/skills/fulcrum/`.
After fixing F2-CRIT-01, the directory-form skills tree should be
mirror-copied to:
- `~/.claude/skills/fulcrum-<slug>/`
- `~/.config/opencode/skills/fulcrum-<slug>/` (or rely on opencode's
  Claude fallback, R2 §5.5)
- `~/.gemini/extensions/fulcrum/skills/<slug>/`
- `~/.pi/agent/skills/fulcrum-<slug>/`

### 7.4 Context files are three near-identical copies

CLAUDE.md, GEMINI.md, PI.md are 95% identical (F2-HIGH-10). Drive from one
template.

---

## 8. Install.ts audit (the installer itself)

| Concern | Current state | Verdict |
|---|---|---|
| Covers all hosts? | claude+gemini+pi, missing codex/opencode | **fail** (CRIT-07, -08) |
| Verifies each step? | `runCheck()` exists but only in check mode, not inline | weak |
| Check mode comprehensive? | yes for shipping hosts, no JSON output | partial |
| Recovery hints actionable? | yes (install.ts:136-159) | good |
| Partial-install handling? | yes — `.catch` in `step()` continues the plan (line 129) | good |
| Idempotent? | yes for most steps (remove-then-install pattern) | good |
| Dry-run correct? | mostly; minor log bug in installClaudeHook (F2-LOW-03) | mostly good |
| Windows support? | untested; `~/.local/bin` symlink assumption (F2-MED-04) | weak |

The installer is the **strongest** piece of agent-integration today. It
handles most edge cases (idempotency, marker-based merge, fallback paths).
The weaknesses are structural (missing hosts, no post-install verification
of pi install) rather than architectural.

---

## 9. Rebuild vs retrofit decision per host

| Host | Verdict | Justification |
|---|---|---|
| **Claude Code** | **Rebuild as a plugin** | Worth it: the plugin (R2 §1.7) is the proper container for skills + subagents + hooks + MCP + commands, and we're missing 4 of those 5 (F2-CRIT-02, -01, F2-HIGH-03, F2-MED-06). Ship `.claude-plugin/plugin.json` with directory-form skills, subagent files per role, commands, hooks.json, and the existing `.mcp.json`. The current flat installer becomes a fallback for "claude plugin install failed". |
| **Gemini CLI** | **Retrofit** | The manifest is mostly right; the fixes are (a) move hooks into `hooks/hooks.json`, (b) add `settings: [...]`, (c) add `commands/*.toml`, (d) use a directory skill tree. Manifest rewrite not needed. |
| **PI** | **Retrofit** | The cockpit is genuinely good — it uses the real ExtensionAPI correctly. Delete `fulcrum.extension.json` (F2-HIGH-08), fix policy payload fields (F2-HIGH-05), add `installPiCockpit` verification (F2-CRIT-10), fix peer-dep antipattern (F2-MED-09). Keep everything else. |
| **Codex** | **Greenfield (small)** | Only needs `~/.codex/config.toml` MCP entry + `~/.codex/AGENTS.md`. No hooks, no plugins. 30-line installer function and a README. |
| **opencode** | **Greenfield (medium)** | Needs a TS plugin file, an `opencode.json` merger, agents, commands, and a normalizer branch. Biggest net-new work, but opencode reads `~/.claude/skills/` automatically so skills come for free once F2-CRIT-01 is fixed. |

Sum: one real rebuild (Claude Code), two greenfield additions (Codex,
opencode), two retrofits (Gemini, PI).

---

## 10. Issues to plan (feeds Step 4)

Each issue below is scoped to be implementable in isolation. Suggested
plan files listed but not written.

- **F2-ISSUE-01 — Restructure skills to directory-form `SKILL.md`**
  → `docs/audit/plans/p2-01-skills-directory-form.md`
  Covers F2-CRIT-01, F2-MED-03, F2-MED-08.

- **F2-ISSUE-02 — Ship Claude Code subagent files for all 24 roles**
  → `docs/audit/plans/p2-02-claude-subagents.md`
  Covers F2-CRIT-02. Depends on a role → frontmatter template decision.

- **F2-ISSUE-03 — Convert Claude Code integration into a plugin**
  → `docs/audit/plans/p2-03-claude-plugin.md`
  Covers F2-MED-06, F2-CRIT-03, F2-CRIT-04, F2-MED-05, F2-HIGH-06.
  Plugin manifest + hooks/hooks.json + directory skills + subagents +
  commands + .mcp.json all bundled; installer falls back to piecemeal.

- **F2-ISSUE-04 — Fix Gemini hook wiring**
  → `docs/audit/plans/p2-04-gemini-hooks.md`
  Covers F2-CRIT-05, F2-CRIT-09, F2-LOW-06.

- **F2-ISSUE-05 — Ship Codex integration**
  → `docs/audit/plans/p2-05-codex-integration.md`
  Covers F2-CRIT-07, F2-HIGH-07 (partial).

- **F2-ISSUE-06 — Ship opencode integration**
  → `docs/audit/plans/p2-06-opencode-integration.md`
  Covers F2-CRIT-08, F2-HIGH-02 (opencode normalizer), F2-LOW-07.

- **F2-ISSUE-07 — Slash commands for Claude / Gemini / opencode**
  → `docs/audit/plans/p2-07-slash-commands.md`
  Covers F2-HIGH-03.

- **F2-ISSUE-08 — Add SessionStart, SessionEnd, PreCompact, UserPromptSubmit
  hooks**
  → `docs/audit/plans/p2-08-extended-hook-events.md`
  Covers F2-HIGH-01, F2-HIGH-04. Requires the cli `fulcrum hook claude
  <event>` subcommand axis to be modeled.

- **F2-ISSUE-09 — Unified context-file generator**
  → `docs/audit/plans/p2-09-context-file-generator.md`
  Covers F2-HIGH-10, F2-HIGH-07, F2-LOW-01. Drive CLAUDE.md / GEMINI.md
  / PI.md / AGENTS.md from one canonical source.

- **F2-ISSUE-10 — PI cockpit polish**
  → `docs/audit/plans/p2-10-pi-cockpit-polish.md`
  Covers F2-HIGH-05, F2-HIGH-08, F2-CRIT-10, F2-MED-09.

- **F2-ISSUE-11 — Installer hardening**
  → `docs/audit/plans/p2-11-installer-hardening.md`
  Covers F2-MED-02, F2-MED-04, F2-LOW-03, F2-HIGH-09.

- **F2-ISSUE-12 — Hook output JSON mode + normalized shape**
  → `docs/audit/plans/p2-12-hook-output-json-mode.md`
  Covers F2-HIGH-02, F2-HIGH-04, F2-CRIT-06 (delete dead .mcp.json),
  F2-LOW-05.

Priority order (top to bottom, highest first): 01, 03, 02, 04, 05, 06, 08,
10, 12, 07, 09, 11.

---

## 11. Summary

The current `agent-integration/` directory is **functional for Claude and
PI users, broken on Gemini, and absent on Codex and opencode**. The single
biggest latent bug is F2-CRIT-05 (Gemini hooks do nothing). The single
biggest unlocked leverage is F2-CRIT-02 (turn the 24 roles into real
subagents). The single biggest structural problem is that we ship files
into host-specific directories piecemeal rather than as a Claude plugin
(F2-MED-06), which makes updates, uninstalls, and version pinning all
fragile.

Rebuild recommendation: **yes for Claude Code** (as a plugin), **retrofit
for Gemini and PI**, **greenfield Codex and opencode**. Net work is
dominated by F2-ISSUE-03 and F2-ISSUE-06.

All findings cite R2 sections or file:line references. Plans for each
F2-ISSUE are the next step.
