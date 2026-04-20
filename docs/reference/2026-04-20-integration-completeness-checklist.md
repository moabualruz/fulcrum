---
title: "Per-agent integration completeness checklist — Fulcrum → 8 CLI agents"
type: reference
date: 2026-04-20
origin: retrospective on the agent-parity plan v3.3 after I claimed PRs "complete" while significant audit-listed items were missing. This file is the forward guard — every future PR that touches an agent surface regenerates / greps against this list before it can claim "done".
---

# Per-agent integration checklist

Source of truth: `docs/plans/2026-04-19-004-agent-parity-plan.md` **Audit table** + **AD-2 layers per agent**. Every row here maps to an entry in that plan.

## How to use this file

- **Before claiming a PR "complete"**: grep this file for the PR's agent, step through every `⬜` row for that agent, run the **Verify** command, and only then flip status to `✅`.
- **Every ⬜ row ships with a `Verify:` command** — a grep, `ls`, or test invocation that proves the item landed. No `✅` without a green verifier.
- **Grep-able**: `grep -c '⬜' docs/reference/2026-04-20-integration-completeness-checklist.md` returns the remaining-work count.
- **Failure to close a row** after claiming PR-complete is an auditable defect. See `docs/plans/2026-04-19-004-agent-parity-progress.md` for corrections.

## Compliance-test gate (added 2026-04-20 after 2nd deep-research pass)

Every future `✅` flip MUST be backed by a green compliance test in
`packages/cli/src/tests/compliance/<agent>-compliance.test.ts`. Rows lacking a
compliance test are **not** considered verified even if their `Verify:`
command is green — file-presence greps catch only the coarsest drift.

Run:
```
pnpm -F fulcrum-agent-cli test -- compliance
```
Every `GAP(<id>)` in the suite maps to a finding in the 2026-04-20 research
pass (see `docs/plans/2026-04-19-004-agent-parity-progress.md` PR 7 expanded
scope entry).

## Overclaims flagged 2026-04-20 (compliance gate retroactively fails these ✅ rows)

The second deep-research pass (framework-docs-researcher sweep across 8
target CLIs) found that four already-"complete" PRs (4 opencode, 5 Claude,
6 Codex, 7 Gemini) shipped with substantive correctness bugs that the
original `Verify:` commands could not catch. The rows below were previously
marked `✅` but fail their compliance test — treat them as `⚠️
overclaimed` until the matching fix lands under PR 7 expanded scope.

**Claude Code (PR 5 + 14.1):**
- "24 sub-agent MDs embed fulcrum-first prologue" — ⚠️ `tools:` uses invalid
  `{allowed, denied}` object schema; spec wants flat array; chief_of_staff
  can Write/Edit. GAP(claude-M2) in `claude-compliance.test.ts`.
- "`.claude-plugin/plugin.json`" — ⚠️ uses invalid `mcp:` field pointing at
  DEPRECATED snippet; schema wants `mcpServers:`. GAP(claude-M1).
- "PreToolUse hook handler" — ⚠️ emits deprecated `{continue}` shape
  instead of `hookSpecificOutput.permissionDecision`; `updatedInput` surface
  dead. GAP(claude-M5).
- "SessionStart hook handler" — ⚠️ writes workspace snapshot to disk
  sidecar, not `hookSpecificOutput.additionalContext`; injection surface
  dead. GAP(claude-S4).
- "UserPromptSubmit hook handler" — ⚠️ only bookkeeping; no `additionalContext`
  from `recall_knowledge`. GAP(claude-S5/S6).
- "Bundled hooks/hooks.json" — ⚠️ binds non-existent `SubagentStart` event.
  GAP(claude-M3).
- "Retire `settings-hooks-snippet.json`" — ⚠️ same `SubagentStart` defect.
  GAP(claude-M4).

**Codex CLI (PR 6):**
- "SessionStart hook", "Stop/notify hook", "PreToolUse hook", "UserPromptSubmit
  hook + rider content", "PermissionRequest hook" (5 rows) — ⚠️ Codex
  discovery loads hooks from `hooks.json`, NOT `config.toml`. Our entire
  `[[hooks]]` TOML block is dead code. GAP(codex-M1).
- "Full plugin.json interface block" — ⚠️ capabilities strings
  (`task_management`, …) are invented taxonomy; upstream expects
  capitalized verbs (`Interactive`, `Write`). GAP(codex-S1).

**Gemini CLI (PR 7 — current, uncommitted):**
- `hooks.json` BeforeTool/AfterTool matchers use Claude tool names
  (`Write|Edit|Bash`) — never fire against Gemini's `write_file|replace|
  run_shell_command`. GAP(hooks-M1).
- `hooks.json` SessionStart matcher `"*"` triggers fresh `start_agent_run`
  on `/clear` → zombie runs. GAP(hooks-M3).
- `policies/fulcrum-core.toml` uses `decision = "allow"` which is silently
  dropped at extension tier (spec says "allow decisions are ignored for
  security"). 24 rules are dead code. GAP(pol-M1).
- Subagent MDs missing `mcpServers: { fulcrum: {...} }` inline; Gemini
  subagent isolation drops inheritance — MCP tools not callable from
  chief_of_staff etc. GAP(sub-M1).

**opencode (PR 4):**
- "Plugin shell.env + tool.execute.before + ... + event" — ⚠️ the `event`
  handler reads `input["type"]` but SDK wraps it as `input.event.type`. All
  3 event branches (`session.idle`, `session.compacted`, `todo.updated`)
  are silently dead. GAP(oc-M1).
- "Plugin `experimental.chat.system.transform` wired" — ⚠️ contract bug on
  prior SDK versions; re-verify against @opencode-ai/plugin@1.14.19.
- "`permission.ask` … supports deny with reason" — ⚠️ plugin returns
  `{approved, reason}` but SDK expects `output.status` mutation. The return
  value is discarded; permissions default to pre-populated value.
  GAP(oc-M2).
- "`session.compacted` handler" — ⚠️ dead branch (consequence of oc-M1).
- "`session.idle` telemetry signal" — ⚠️ dead branch.
- "Plugin loads OPENCODE_SYSTEM_RIDER" — ⚠️ env var is never set; claim is
  a lie. GAP(oc-S2).
- "Bias nudge / passive injection on opencode's `tool.execute.before`" — ⚠️
  relies on bare `throw` as block mechanism, which is undocumented SDK
  behavior. GAP(oc-M3).
- "`todo.updated` handler" (cross-cut) — ⚠️ reads `event["todo"]` (singular)
  but SDK sends `event.properties.todos: Todo[]` (plural array).
  GAP(oc-M4).

All overclaims will resolve under **PR 7 expanded scope** (see plan
PR 7 units 7.11–7.27). Each fix attaches its green compliance test as
evidence in the progress ledger.

Status legend:
- ✅ landed, verifier green
- ⚠️ partial — landed in a form that does not fully meet spec; explained inline
- ⬜ not started
- 🔒 deferred to v4 with explicit plan reference
- N/A does not apply to this agent

---

## Claude Code

Plan target: 7 layers per AD-2. Audit hit: 5/9 events wired; 34/34 skills ✓; 24/24 roles ✓; CLAUDE.md marker block with ZERO Fulcrum-first content (H).

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| Canonical skills at `agent-integration/skills/` (33 dirs, sorted) | ✅ | `find agent-integration/skills -maxdepth 1 -type d \| wc -l` = 34 (33 + parent) | PR 0 / AD-1 |
| 24 canonical role MDs at `agent-integration/claude/agents/` | ✅ | `ls agent-integration/claude/agents/*.md \| wc -l` ≥ 24 | pre-plan |
| 4 slash commands at `agent-integration/claude/commands/` | ✅ | `ls agent-integration/claude/commands/*.md` | pre-plan |
| `.claude-plugin/plugin.json` | ✅ | `ls agent-integration/claude/.claude-plugin/plugin.json` | pre-plan |
| SessionStart hook handler | ✅ | `grep -n 'runSessionStartHook' packages/cli/src/index.ts` | pre-plan |
| Stop / session-end hook handler | ⚠️ | line 3276 aliases `session-end` to `runSessionStopHook`. PR 5 should split semantics | PR 5 |
| PreToolUse hook handler (recall-aware; Variant A nudge; Variant B passive injection; session trust via session-file resolution) | ✅ | `grep -c 'fulcrum-first' packages/cli/src/hooks.ts` ≥ 1 + `fulcrum bias stats` shows events | PR 3 |
| PostToolUse hook handler (memory write for mutating tools; dedup) | ✅ | `grep -n 'runPostHook' packages/cli/src/hooks.ts` | pre-plan |
| PreCompact hook handler | ✅ | `grep -n 'runPreCompactHook' packages/cli/src/index.ts` | pre-plan |
| **UserPromptSubmit hook handler** | ✅ | `grep -c 'runUserPromptSubmitHook\|user-prompt-submit' packages/cli/src/index.ts` ≥ 1 | PR 5 |
| **SubagentStop hook handler** | ✅ | `grep -c 'runSubagentStopHook\|subagent-stop' packages/cli/src/index.ts` ≥ 2 (not just stub) | PR 5 |
| **SessionEnd hook handler (distinct from Stop)** | ✅ | `grep -B2 "phaseArg === 'session-end'" packages/cli/src/index.ts` shows `runSessionEndHook`, not `runSessionStopHook` | PR 5 |
| **Notification hook handler** | ✅ | `grep -c 'runNotificationHook\|notification' packages/cli/src/index.ts` ≥ 1 | PR 5 |
| **Canonical `agent-integration/claude/CLAUDE.md` contains BEGIN/END FULCRUM marker block with 3 canonical rules (fulcrum-first, lifecycle, role-boundaries)** | ✅ | `grep -c 'BEGIN FULCRUM managed-block' agent-integration/claude/CLAUDE.md` = 1 AND `grep -c 'recall_knowledge' agent-integration/claude/CLAUDE.md` ≥ 1 | PR 5 |
| **24 sub-agent MD prologues embed Fulcrum-first rule reference** | ✅ | `ls agent-integration/claude/agents/*.md \| xargs grep -l 'fulcrum-first' \| wc -l` = 24 | PR 5 |
| **Claude marketplace `.claude-plugin/marketplace.json` at repo root of `moabualruz/fulcrum`** | ✅ | `ls .claude-plugin/marketplace.json` AND `grep -c '"source": "./agent-integration/claude"' .claude-plugin/marketplace.json` ≥ 1 | PR 14.1 |
| **Claude marketplace `source:` schema verified against current Claude Code docs** | ✅ | research 2026-04-20 confirmed: resolves relative to marketplace root dir (the one containing .claude-plugin/), `owner: {name, email?}` only, relative paths only via git-add not URL. Marketplace uses `source: "./agent-integration/claude"` accordingly | PR 14.1 |
| **Native `claude plugin install` path in `installClaude()` (dual-mode `auto` / `native` / `manual`)** | ✅ | `grep -c 'claude plugin install\|claude plugin marketplace add' agent-integration/install.ts` ≥ 1; `FULCRUM_CLAUDE_INSTALL_MODE=auto` (default) probes `claude plugin --help`, drives native on success, falls through to manual otherwise; `=native` fails loudly; `=manual` skips the native path | PR 14.1 |
| **Bundled `hooks/hooks.json` inside plugin dir (for `/plugin install` path)** | ✅ | `ls agent-integration/claude/hooks/hooks.json` — wires SessionStart/SessionEnd/Stop/SubagentStop/PreCompact/UserPromptSubmit/Notification/PreToolUse/PostToolUse | PR 14.1 |
| **Retire `agent-integration/claude/settings-hooks-snippet.json`** (replaced by bundled hooks.json; kept only for manual fallback) | ✅ | `grep -c '_deprecated' agent-integration/claude/settings-hooks-snippet.json` ≥ 1 — file carries DEPRECATED marker pointing at hooks/hooks.json as source of truth | PR 14.1 |

---

## Codex CLI

Plan target: **8 layers (v3.3 rescoped 2026-04-20 per Codex research pass — was 5)**. Audit as of 2026-04-20 (post PR 6 closeout): 33/33 skills fanned out + 33 openai.yaml sidecars; 6/6 events wired (UserPromptSubmit + PermissionRequest added this PR).

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| `.codex-plugin/plugin.json` + `marketplace.json` | ✅ | `ls agent-integration/codex/plugin/.codex-plugin/plugin.json agent-integration/codex/marketplace.json` | pre-plan |
| SessionStart hook (Bash → `fulcrum hook codex session-start`) | ✅ | `grep -n 'runCodexSessionStartHook' packages/cli/src/index.ts` | pre-plan |
| Stop / notify hook | ✅ | `grep -n 'runCodexStopHook' packages/cli/src/index.ts` | pre-plan |
| PreToolUse hook (Bash-only platform) | ✅ | existing `fulcrum hook auto` covers | pre-plan |
| **UserPromptSubmit hook + rider content** | ✅ | `grep -c 'runCodexUserPromptSubmitHook' packages/cli/src/index.ts` = 4; `fulcrum hook codex user-prompt-submit` dispatch + canonical rider injection via `loadCodexRider()` (reads `FULCRUM_RULES_DIR`, `~/.codex/rules/`, or dogfood `agent-integration/rules/`); 5 tests in `hook-codex-pr6.test.ts` | **PR 6 v3.3 unit 6.1** |
| **PermissionRequest hook (write-class interceptor; all tool types)** | ✅ | `grep -c 'runCodexPermissionRequestHook' packages/cli/src/index.ts` = 4; all-tool approval interceptor (unlike Bash-only PreToolUse) with secret-scan + team-invoke guard; emits `{hookSpecificOutput:{hookEventName:"PermissionRequest",decision:{behavior:"allow\|deny",message}}}`; 5 tests cover Allow/Deny paths incl. deny-wins fold | **PR 6 v3.3 unit 6.2** |
| **Hook handler types `prompt` + `agent` — investigated, NOT wired (upstream not ready)** | ✅ | Source-level verification (`codex-rs/hooks/src/engine/config.rs` `HookHandlerConfig` enum: `Prompt {}`, `Agent {}` are empty structs; `codex-rs/hooks/src/engine/dispatcher.rs` hardcodes `HookHandlerType::Command` in every `HookRunSummary`) — wiring `type = "prompt"` today creates a no-op hook. Guard tests prevent accidental future use. Ref doc updated 2026-04-20. | **PR 6 v3.3 unit 6.3** |
| **33 canonical skills installed via fanout at `agent-integration/codex/plugin/skills/fulcrum-<name>/`** | ✅ | `ls agent-integration/codex/plugin/skills/fulcrum-*/SKILL.md \| wc -l` = 33 (regen via `pnpm tsx scripts/fanout-codex-plugin.ts`). Installer also writes to `~/.codex/skills/` via `parseCanonicalSource + emitCodex` — dual-path distribution (marketplace + local install). | **PR 6 v3.3 unit 6.4** |
| **openai.yaml sidecars present for every canonical skill** | ✅ | `ls agent-integration/codex/plugin/skills/fulcrum-*/agents/openai.yaml \| wc -l` = 33. Each carries `interface.{display_name,short_description,brand_color:'#4F46E5'}`, `policy.allow_implicit_invocation` (false for write-class, true for read-only), and `dependencies.tools[]` populated by scanning skill body for `mcp__fulcrum__*` + `fulcrum action exec <name>` references. | **PR 6 v3.3 unit 6.5** |
| **Full `.codex-plugin/plugin.json` `interface` block** (displayName, brandColor, capabilities[], etc.) | ✅ | `grep -c '"displayName"\|"brandColor"\|"capabilities"' agent-integration/codex/plugin/.codex-plugin/plugin.json` ≥ 3; `capabilities: [task_management, memory, multi_agent_lifecycle, policy_hooks]`; `category: "productivity"`; `brandColor: "#4F46E5"`; `developerName`, `websiteURL`, `defaultPrompt[]`, `longDescription` all set. Visual assets (logo/composerIcon/screenshots) deferred — loader tolerates absence. | **PR 6 v3.3 unit 6.6** |
| **Shared `.claude-plugin/marketplace.json` lists Codex plugin entry** | ✅ | `grep -c 'codex/plugin' .claude-plugin/marketplace.json` ≥ 1; Codex entry `source: "./agent-integration/codex/plugin"` differentiated from Claude's `source: "./agent-integration/claude"`; `policy.installation: "AVAILABLE"`. Codex loader accepts bare-string source path per `codex-rs/core-plugins/src/marketplace.rs resolve_plugin_source`. | **PR 6 v3.3 unit 6.7** |
| **App-server `config/mcpServer/reload` + `skills/list` stable RPCs available** | ✅ | `packages/cli/src/codex-app-server.ts` exports `buildMcpReloadRequest(id)` + `buildSkillsListRequest(id, params)` — pure JSON-RPC payload builders any transport can send. Guard test proves NO source-level call sites for unstable `plugin/{list,read,install,uninstall}`. | **PR 6 v3.3 unit 6.8** |
| **AGENTS.md marker block with canonical rules** | ⬜ | `grep -c 'BEGIN FULCRUM managed-block' agent-integration/codex/AGENTS.md` = 1 | PR 6 / PR 13 |
| **Native marketplace install path: `codex plugin marketplace add moabualruz/fulcrum`** | ⬜ | `grep -c 'codex plugin marketplace add' agent-integration/install.ts` ≥ 1 | **PR 14.2 v3.3 revised** (CLI shipped; was "TUI-only" in 2026-04-19 ref) |
| **Post-install message: `Fulcrum marketplace registered with Codex. Run 'codex' then '/plugins' to install/manage via the TUI.`** | ⬜ | `grep -c "Run 'codex' then '/plugins'" agent-integration/install.ts` ≥ 1 | PR 14.2 |
| **`.codex-plugin/plugin.json` schema validated against `core-plugins/manifest.rs`** | ⬜ | install-time validation passes | PR 14.2 |
| **Malformed `~/.agents/plugins/marketplace.json` entry cleanup documented** (stray `{"host":"codex",...}` object discovered 2026-04-20) | ⬜ | cleanup step in installer or doc | PR 14.2 |

---

## Gemini CLI

Plan target: 9 layers. Audit: 6/11 events (BeforeAgent, BeforeToolSelection, Notification, AfterModel-content missing); 6/34 skills; 2/24 sub-agents.

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| `gemini-extension.json` | ✅ | `ls agent-integration/gemini/gemini-extension.json` | pre-plan |
| `mcpServers` in extension manifest | ✅ | `grep -c '"mcpServers"' agent-integration/gemini/gemini-extension.json` ≥ 1 | pre-plan |
| SessionStart / BeforeModel / BeforeTool (partial) | ✅ | `grep -n 'runGeminiSessionStart\|runGeminiBeforeAgent' packages/cli/src/index.ts` | pre-plan |
| **BeforeAgent, BeforeToolSelection, Notification, AfterModel-content handlers** | ✅ | `runGeminiBeforeAgentHook` (hookEventName contract fix), `runGeminiBeforeToolSelectionHook`, `runGeminiNotificationHook`, `runGeminiAfterModelHook` — 4 real handlers. Dispatch in `packages/cli/src/index.ts` routes `before-tool-selection`, `notification`, `after-model`. `hooks.json` registers all 11 events. | PR 7.2 |
| **34 canonical skills installed at `agent-integration/gemini/skills/fulcrum-<name>/`** | ✅ | `scripts/fanout-gemini-extension.ts` materializes `parseCanonicalSource + emitGemini` → 33 skill dirs committed at `agent-integration/gemini/skills/fulcrum-*/SKILL.md` (canonical source is 33 skills; `index.md` is a catalog). Verify: `ls agent-integration/gemini/skills/fulcrum-*/SKILL.md \| wc -l` = 33. | PR 7.3 |
| **24 sub-agent MDs at `agent-integration/gemini/agents/`** | ✅ | Fanout script `translateRoleForGemini` emits 24 canonical role MDs (name + description + `kind: local` per `docs/core/subagents.md` schema) alongside 2 legacy shortcut files. Verify: canonical 24 + legacy 2 = 26 files. | PR 7.4 |
| **`agent-integration/gemini/policies/` populated** | ✅ | `fulcrum-core.toml` (24 read-only + 8 lifecycle Fulcrum MCP tools → `allow`, priority 500) + `fulcrum-sensitive.toml` (`invoke_team`, `mark_memory_wrong`, definition edits → `ask_user`, priority 500). Schema per `docs/reference/policy-engine.md`. | PR 7.5 |
| **GEMINI.md marker block with canonical rules** | ✅ | `replaceMarkerBlock` emits BEGIN/END FULCRUM managed-block v1 embedding all 3 canonical rules joined with `\n\n---\n\n`. User-owned prose outside markers survives regeneration. Verify: `grep -c 'BEGIN FULCRUM managed-block' agent-integration/gemini/GEMINI.md` = 1. | PR 7.6 |
| **TOML slash commands regenerated from fanout** | ✅ | `emitGemini` now emits 6 TOML commands under `commands/fulcrum/<cos\|memory\|run\|status\|task\|log>.toml` derived from curated canonical skills. Schema per `docs/cli/custom-commands.md` (description + prompt + `{{args}}`). Hand-authored top-level TOMLs coexist. Verify: `find agent-integration/gemini/commands -name '*.toml' \| wc -l` = 12. | PR 7.7 |
| **`gemini extensions update fulcrum` post-install message printed** | ⬜ | `grep -c "gemini extensions update" agent-integration/install.ts` ≥ 1 | **PR 14.5** |
| **`gemini-extension.json` schema validated at install time via `find-docs`-verified schema** | ⬜ | installer validates the manifest | **PR 14.5** |
| **`migratedTo` field scaffolding in `gemini-extension.json` (commented-out; documents future migration)** | ⬜ | `grep -c 'migratedTo' agent-integration/gemini/gemini-extension.json` ≥ 1 | PR 14.5 |

---

## opencode

Plan target: 9 layers. Audit: plugin wires 6 event classes + 10 custom tools (most-complete interception today); 0/34 skills; 0 role MDs; 5 MD slash commands ✓; `opencode.md` skip-if-exists; `opencode.jsonc` mcp block ✓.

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| `opencode.jsonc` mcp block | ✅ | `grep -c '"mcp"\|"mcpServers"' agent-integration/opencode/opencode.jsonc` ≥ 1 | pre-plan |
| 5 MD slash commands at `agent-integration/opencode/command/` | ✅ | `ls agent-integration/opencode/command/*.md \| wc -l` ≥ 5 | pre-plan |
| Plugin `experimental.chat.system.transform` wired | ✅ | `grep -c 'experimental.chat.system.transform' agent-integration/opencode/plugins/fulcrum.ts` ≥ 1 | PR 4 |
| Plugin `shell.env` + `tool.execute.before` + `tool.execute.after` + `permission.ask` + `event` | ✅ | `grep -c '"tool.execute.before"\|"tool.execute.after"\|"permission.ask"\|"shell.env"\|"event"' agent-integration/opencode/plugins/fulcrum.ts` ≥ 5 | pre-plan |
| `session.compacted` handler (memory emit + graph reducer) | ✅ | `grep -A1 "session.compacted" agent-integration/opencode/plugins/fulcrum.ts` | pre-plan |
| **Plugin loads canonical rider (`OPENCODE_SYSTEM_RIDER`) with SHA-256 integrity chain (AD-9a)** | ✅ | `grep -c 'loadRider' agent-integration/opencode/plugins/fulcrum.ts` ≥ 1; vitest `rider-integrity.test.ts` green | PR 4 (`f76ee1b`) |
| **`.ridersum` integrity check fails open (console.warn; never blocks)** | ✅ | `rider-integrity.test.ts` covers | PR 4 |
| **`session.idle` telemetry signal when primary injection never fired** | ✅ | `grep -c 'opencode_rider_never_injected' agent-integration/opencode/plugins/fulcrum.ts` ≥ 1 | PR 4 |
| **`opencode.md` has BEGIN/END FULCRUM markers** | ✅ | `grep -c 'BEGIN FULCRUM managed-block' agent-integration/opencode/opencode.md` = 1 | PR 4 |
| **npm publish scaffolding (`@fulcrum-agent-os/opencode-plugin`)** | ✅ | `grep '"name"' agent-integration/opencode/package.json` shows scoped name; `npm pack --dry-run` clean | PR 4 (`2aa65b0`) |
| **34 skill artifacts written to `.opencode/agents/fulcrum-skill-<name>.md` on disk** | ✅ | installer now consumes `emitOpencode(parseCanonicalSource(...))` and writes 33 skill artifacts to `.opencode/agents/` (PR 1 observation — 33 skills, not 34; `index.md` is a catalog). Verify: `pnpm -F fulcrum-agent-cli test -- init-cursor` exercises the installer against a temp dir + asserts `fulcrum-skill-*.md` ≥ 33, each with `mode: subagent` + `hidden: true`. | PR 4 c2 |
| **24 role MDs emitted / on disk for opencode** | ✅ | installer reads the 24 canonical role MDs from `agent-integration/claude/agents/` + translates frontmatter (chief_of_staff + orchestrator → `mode: primary`; others → `mode: subagent, hidden: true`) + writes to `.opencode/agents/<role>.md`. Verify: test asserts `roleFiles.length ≥ 24` + frontmatter shape. | PR 4 c3 |
| **Bias nudge / passive injection on opencode's `tool.execute.before`** (not only Claude) | ✅ | `grep -c "cliName === 'opencode'" packages/cli/src/hooks.ts` = 4 (sections 3a + 3b + opt-out gate both opened). Plugin routes through `fulcrum hook opencode pre` (not `auto`) + writes session trust file on first observation via new `runOpencodeSessionStartHook`. Verify: `pnpm -F fulcrum-agent-cli test -- hook-bias-nudge` — 3 new opencode cases (trusted-session nudge fires, no-file silent skip, telemetry `agent_type=opencode`). | PR 4 c4 |
| **Actual rider `additionalContext` fallback on `session.idle` (not just telemetry)** | ✅ | AD-3 revised per PR 4 c5 — `event` hook on session.idle is observable-only per `@opencode-ai/plugin@1.14.18` types; there is no `additionalContext` return from any observable event. True redundancy shipped as belt-and-suspenders via `experimental.chat.messages.transform`: when `experimentalFiredCount === 0` the fallback prepends a synthetic TextPart with the rider to the first user message. Both hooks fire per LLM call; whichever lands first wins (no duplication). Session.idle retains its telemetry signal. Verify: `pnpm --dir agent-integration/opencode test` covers 7 new `messages-transform-redundancy` tests. | PR 4 c5 |
| **`.ridersum` GENERATION tool** (vs. just VERIFICATION) | ✅ | `packages/agent-fanout/src/ridersum.ts` exports `writeRidersum(rulesDir)` — computes SHA-256 over sorted `.md` bodies joined with `\n\n---\n\n` (matches `loadRider`'s read contract byte-for-byte) and writes the companion `.ridersum`. Installer calls it after writing `.opencode/rules/`. Verify: `pnpm -F fulcrum-agent-fanout test -- ridersum` (8 tests green) + installer integration test re-computes SHA independently and asserts exact match. | PR 4 c1 |
| **`installOpencode()` consumes `emitOpencode(parseCanonicalSource(...))` output and writes to disk** | ✅ | `grep -c 'emitOpencode\\|agent-fanout' agent-integration/install.ts` = 9. Installer steps: skill MDs → `.opencode/agents/`, canonical rules → `.opencode/rules/`, `.ridersum` → `.opencode/.ridersum`, 24 role MDs → `.opencode/agents/<role>.md`. | PR 4 c2 + c3 |
| **Post-session workspace write via `fulcrum hook opencode session-end` (already wired) — verify no regression** | ✅ | existing | pre-plan |
| **`npm publish @fulcrum-agent-os/opencode-plugin` to npm registry (first release)** | ⬜ | `npm view @fulcrum-agent-os/opencode-plugin version` returns a version; published from CI workflow (not laptop) | **PR 14.3 — requires npm org registration first (operator step)** |
| **`--auto` probe (`npm view @fulcrum-agent-os/opencode-plugin version`) in installOpencode** | ✅ | `grep -c 'npm view @fulcrum-agent-os/opencode-plugin' agent-integration/install.ts` = 1. `probeOpencodePluginOnNpm(2000)` runs `npm view …` 2s-bounded; returns version on success, null otherwise. `installOpencode({mode: 'auto'})` consults the probe first and falls through to local on miss. | PR 4 c6 |
| **Error path `opencode-plugin-unresolved` when --auto falls to --local and local file absent** | ✅ | `grep -c 'opencode-plugin-unresolved' agent-integration/install.ts` = 3. `OpencodePluginUnresolvedError` (code `"opencode-plugin-unresolved"`) is thrown by `installOpencode` when (a) mode=local but template missing, (b) mode=npm but probe misses, or (c) mode=auto and both paths miss. Covered by test `mode=npm throws OpencodePluginUnresolvedError …`. | PR 4 c6 |

---

## PI cockpit

Plan target: 12+ layers. Audit: ~1/~20 events bound (session_start only); 34/34 skills ✓ (via symlink); roles implicit via MCP `--profile` — no role-switching UX.

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| Symlink `agent-integration/pi/cockpit/skills -> ../../skills` intact | ✅ | `ls -la agent-integration/pi/cockpit/skills` shows `->` | pre-plan |
| `session_start` event bound | ✅ | `grep -n 'session_start\|sessionStart' agent-integration/pi/cockpit/` | pre-plan |
| **Remaining ~19 PI events bound (before_agent_start, before_provider_request, context, tool_call, tool_result, model_select, session_before_compact, agent_end, etc.)** | ⬜ | per-event handler count ≥ 15 | **PR 8** |
| **`/fulcrum:role <slug>` role-switcher slash command** | ⬜ | `grep -c 'fulcrum:role' agent-integration/pi/cockpit/` ≥ 1 | **PR 8** |
| **24 role MDs emitted under cockpit skill path** | ⬜ | per plan PR 8 scope | **PR 8** |
| **PI.md marker block with canonical rules** | ⬜ | `grep -c 'BEGIN FULCRUM managed-block' agent-integration/pi/cockpit/PI.md 2>/dev/null \|\| echo 'file missing'` = 1 | **PR 8** |
| **`agent-integration/pi/cockpit/package.json` name → `@fulcrum-agent-os/pi-cockpit`** | ⬜ | `grep '"name"' agent-integration/pi/cockpit/package.json` shows scoped name | **PR 14.4** |
| **`npm publish @fulcrum-agent-os/pi-cockpit` to npm registry** | ⬜ | `npm view @fulcrum-agent-os/pi-cockpit version` returns a version | **PR 14.4** |
| **Rename `.github/workflows/publish-cockpit.yml` → `publish-pi-cockpit.yml` with `pi-cockpit/v*` tag namespace** | ⬜ | `ls .github/workflows/publish-pi-cockpit.yml` AND old file deleted | PR 14.4 |
| **`@fulcrum/cockpit` npm history checked (legacy conflict)** | ⬜ | `npm view @fulcrum/cockpit time 2>&1` — documented result in ledger | PR 14.4 |
| **`--auto` probe (`npm view @fulcrum-agent-os/pi-cockpit version`) in installPiCockpit** | ⬜ | `grep -c 'npm view @fulcrum-agent-os/pi-cockpit' agent-integration/install.ts` ≥ 1 | PR 14.4 |

---

## Copilot (GitHub Copilot in VS Code)

Plan target: 3 layers. Audit: no hooks (platform N/A); 34 source exist in dead `.agents/skills/` symlink; no installer.

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| Symlink `agent-integration/copilot/.agents/skills -> ../../skills` intact | ✅ | `ls -la agent-integration/copilot/.agents/skills` shows `->` | pre-plan |
| `.vscode/mcp.json` source exists | ✅ | `ls agent-integration/copilot/.vscode/mcp.json 2>/dev/null` | pre-plan |
| `.github/copilot-instructions.md` source | ✅ | `ls agent-integration/copilot/.github/copilot-instructions.md 2>/dev/null` | pre-plan |
| **`installCopilot()` written** | ⬜ | `grep -c 'installCopilot' agent-integration/install.ts` ≥ 1 | **PR 10** |
| **34 `.github/instructions/fulcrum-skill-<name>.instructions.md` + 3 rule files written by installer** | ⬜ | per PR 10 | **PR 10** |
| **Public-repo detection + sanitized variant default (AD-8)** | ⬜ | `grep -c 'isPrivate\|--allow-public-content' agent-integration/install.ts` ≥ 1 | **PR 10** |
| **Known limitation documented: no hook layer → rule reaches model only when VS Code renders** | ⬜ | note in install-paths doc (PR 10 scope) | **PR 10** |

---

## Cursor

Plan target: 3 layers. Audit: no hooks; per-skill `.cursor/rules/<skill>.mdc`; 0 skills today.

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| `.cursor/mcp.json` source | ✅ | `ls agent-integration/cursor/.cursor/mcp.json 2>/dev/null` | pre-plan |
| **`.cursor/rules/fulcrum-core.mdc` (alwaysApply:true) with canonical rules** | ⬜ | installer writes it | **PR 11** |
| **34 `.cursor/rules/fulcrum-skill-<name>.mdc` (alwaysApply:false)** | ⬜ | `ls .cursor/rules/fulcrum-skill-*.mdc \| wc -l` ≥ 33 post-install | **PR 11** |
| **`installCursor()` expanded to wire all of the above** | ⬜ | `grep -c 'fulcrum-skill' agent-integration/install.ts` ≥ 1 | **PR 11** |
| **AGENTS.md for Cursor (optional)** | ⬜ | per PR 11 scope | **PR 11** |

---

## Windsurf

Plan target: 5 layers. Audit: no hooks; `.windsurf/rules/<skill>.md`; 0 skills today; no installer.

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| `.windsurf/rules/fulcrum.mdc` stub | ✅ | `ls agent-integration/windsurf/.windsurf/rules/` | pre-plan |
| **`installWindsurf()` written** | ⬜ | `grep -c 'installWindsurf' agent-integration/install.ts` ≥ 1 | **PR 12** |
| **34 `.windsurf/rules/fulcrum-skill-<name>.md` (trigger: model_decision)** | ⬜ | `ls .windsurf/rules/fulcrum-skill-*.md \| wc -l` ≥ 33 post-install | **PR 12** |
| **`.windsurf/rules/fulcrum-core.md` (trigger: always_on) with canonical rules** | ⬜ | installer wires | **PR 12** |
| **Workflows for user-invocable skills** | ⬜ | `ls .windsurf/workflows/*.md 2>/dev/null` ≥ 1 | **PR 12** |
| **Optional global opt-in (`~/.codeium/windsurf/memories/global_rules.md`)** | ⬜ | requires explicit `--global` flag + confirmation (AD-9c) | **PR 12** |
| **12000-byte hard lint** (already in `emitWindsurf`) | ✅ | `grep -c 'WINDSURF_MAX_BYTES' packages/agent-fanout/src/emit/windsurf.ts` ≥ 1 | PR 1 |

---

## Cross-cutting (applies to every agent)

| Item | Status | Verify | Fixed by |
|---|---|---|---|
| Canonical source at `agent-integration/skills/` + `agent-integration/rules/` | ✅ | `ls agent-integration/skills/ agent-integration/rules/` | PR 0, PR 2 |
| `packages/agent-fanout/` produces emit artifacts for all 8 targets | ✅ | `pnpm -F fulcrum-agent-fanout test` green | PR 1 |
| **Installer (`agent-integration/install.ts`) consumes fanout output and writes to disk** | ⚠️ | `grep -c 'parseCanonicalSource\|emit(Claude\|Codex\|Gemini\|Opencode\|Copilot\|Cursor\|Windsurf)' agent-integration/install.ts` = 9 (opencode fan-out landed PR 4 c2); other installers (Claude / Codex / Gemini / Copilot / Cursor / Windsurf) still consume templates directly — full consolidation remains PR 13 scope | **PR 13** (opencode partial — PR 4 c2) |
| `fulcrum install verify --agent <name>` CLI | ⬜ | `grep -c 'install verify' packages/cli/src/index.ts` ≥ 1 | **PR 13** |
| `fulcrum bias stats` CLI for measurement | ✅ | `fulcrum bias stats` runs | PR 3 |
| Fulcrum-first bias wired for **every hook-capable agent** (Claude, opencode, Gemini, PI, Codex Bash-only) | ⚠️ | Claude (PR 3) + opencode (PR 4 c4) + Gemini (PR 7 cross-cut) wired — `cliName === 'opencode' \|\| cliName === 'gemini'` trust-checked alongside claude in hooks.ts §3a/§3b/§3-opt-out; `HOOK_SEARCH_TOOLS` covers both `Grep/Glob/Read` and `grep_search/list_directory/read_file`; PI + Codex still pending | **PR 5-8 staggered** |
| Fulcrum-first rule text lands in **canonical CLAUDE.md / AGENTS.md / GEMINI.md / PI.md / opencode.md** marker blocks | ⚠️ | 3 of 5 today — CLAUDE.md (PR 5), opencode.md (PR 4), GEMINI.md (PR 7.6); AGENTS.md (Codex) + PI.md still pending | **PR 5-8** |
| Drift canary against committed `__fixtures__/golden/` | ✅ | `pnpm -F fulcrum-agent-fanout test drift-canary` | PR 1 |
| Secret scan at parse | ✅ | `scanForSecrets` called in `parseCanonicalSource` | PR 1 |

---

## Quick one-liner: how much is left?

```
grep -c '⬜' docs/reference/2026-04-20-integration-completeness-checklist.md
```

At authoring time this returns **the count of open items across all agents**. A clean merge-ready state means that grep returns **only `🔒` (v4-deferred) rows remaining** — every `⬜` has flipped to `✅` with a green verifier.
