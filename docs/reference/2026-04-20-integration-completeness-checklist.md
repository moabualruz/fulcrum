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

## Overclaims resolved 2026-04-20 under PR 7 expanded scope

The second deep-research pass (framework-docs-researcher sweep across 8
target CLIs) found that four already-"complete" PRs (4 opencode, 5 Claude,
6 Codex, 7 Gemini) shipped with substantive correctness bugs that the
original `Verify:` commands could not catch. PR 7 units **7.1–7.27** fixed
every finding with a TDD-first compliance test as the spec gate. As of
this reconciliation (unit 7.28) the compliance suite reports:

- `claude-compliance.test.ts` — **19/19 green**
- `codex-compliance.test.ts` — **13/13 green**
- `gemini-compliance.test.ts` — **28/28 green**
- `opencode-compliance.test.ts` — **17/17 green**

Rows in the Claude / Codex / Gemini / opencode sections below carry their
matching `GAP(<id>)` evidence inline where the row was once overclaimed.
The standing rule: **no `✅` flip without a green compliance test.** When
PR 8 / 10 / 11 / 12 close, the `pi` / `copilot` / `cursor` / `windsurf`
compliance files (currently red) follow the same gate.

Status legend:
- ✅ landed, verifier green
- ⚠️ partial — landed in a form that does not fully meet spec; explained inline
- ⬜ not started
- 🔒 deferred to v4 with explicit plan reference
- N/A does not apply to this agent

---

## Claude Code

Plan target: 7 layers per AD-2. Audit hit: 5/9 events wired; 34/34 skills ✓; 24/24 roles ✓; CLAUDE.md marker block with ZERO Fulcrum-first content (H).

**Compliance gate:** `packages/cli/src/tests/compliance/claude-compliance.test.ts` — 19/19 green as of PR 7 units 7.18–7.24. Every `✅` row below is backed by at least one `GAP(claude-*)` assertion in that file.

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| Canonical skills at `agent-integration/skills/` (33 dirs, sorted) | ✅ | `find agent-integration/skills -maxdepth 1 -type d \| wc -l` = 34 (33 + parent) | PR 0 / AD-1 |
| 24 canonical role MDs at `agent-integration/claude/agents/` | ✅ | `ls agent-integration/claude/agents/*.md \| wc -l` ≥ 24 | pre-plan |
| 4 slash commands at `agent-integration/claude/commands/` | ✅ | `ls agent-integration/claude/commands/*.md` | pre-plan |
| `.claude-plugin/plugin.json` | ✅ | `ls agent-integration/claude/.claude-plugin/plugin.json` | pre-plan |
| SessionStart hook handler | ✅ | `grep -n 'runSessionStartHook' packages/cli/src/index.ts` | pre-plan |
| Stop / session-end hook handler | ✅ | split — `session-stop → runSessionStopHook` (line 3885), `session-end → runSessionEndHook` (line 3886). Distinct bodies at index.ts:922 and :1097. Compliance: `claude-compliance.test.ts` (session-end assertions green). | PR 5 / PR 7.24 |
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

**Compliance gate:** `packages/cli/src/tests/compliance/codex-compliance.test.ts` — 13/13 green as of PR 7 units 7.25–7.27. Every `✅` row below is backed by at least one `GAP(codex-*)` assertion in that file.

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
| **AGENTS.md marker block with canonical rules** | ✅ | `grep -c 'BEGIN FULCRUM managed-block' agent-integration/codex/AGENTS.md` = 1; canonical rules embedded joined with `\n\n---\n\n`. Compliance: `codex-compliance.test.ts` (marker-block assertions green). | PR 7.25 |
| **Native marketplace install path: `codex marketplace add moabualruz/fulcrum`** | ✅ | `grep -c 'codex.*marketplace.*add.*moabualruz/fulcrum' agent-integration/install.ts` ≥ 1 (note: top-level `codex marketplace add`, not `codex plugin marketplace add` — verified via `codex marketplace add --help` 2026-04-21) | **PR 14.2** |
| **Post-install message: `Fulcrum marketplace registered with Codex. Run 'codex' then '/plugins' to install/manage via the TUI.`** | ✅ | `grep -c "Run 'codex' then '/plugins'" agent-integration/install.ts` ≥ 1 | PR 14.2 |
| **`.codex-plugin/plugin.json` schema validated against `core-plugins/manifest.rs`** | ✅ | `validateCodexPluginManifest()` exported from install.ts; checks name/version/description/interface.displayName/interface.shortDescription; 5 TDD tests green | PR 14.2 |
| **Malformed `~/.agents/plugins/marketplace.json` entry cleanup** (stray `{"host":"codex",...}` entries with no `name` field pruned on write) | ✅ | `filter(p => p?.name !== undefined && p?.name !== "")` in marketplace.json step; 1 TDD test green | PR 14.2 |

---

## Gemini CLI

Plan target: 9 layers. Audit: 6/11 events (BeforeAgent, BeforeToolSelection, Notification, AfterModel-content missing); 6/34 skills; 2/24 sub-agents.

**Compliance gate:** `packages/cli/src/tests/compliance/gemini-compliance.test.ts` — 28/28 green as of PR 7 units 7.1–7.10. Every `✅` row below is backed by at least one `GAP(hooks-*|pol-*|sub-*|gemini-*)` assertion in that file.

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
| **`gemini extensions update fulcrum` post-install message printed** | ✅ | `grep -c "gemini extensions update" agent-integration/install.ts` ≥ 1; printed in both dry-run and real install paths | **PR 14.5** |
| **`gemini-extension.json` schema validated at install time** | ✅ | `validateGeminiExtensionManifest()` exported; checks name/version/mcpServers; called at top of `installGeminiExtension()`; 4 TDD tests green | **PR 14.5** |
| **`migratedTo` field scaffolding in `gemini-extension.json` (commented-out; documents future migration)** | ✅ | `grep -c 'migratedTo' agent-integration/gemini/gemini-extension.json` = 2 — field + comment present since PR 7.6 scaffolding | PR 14.5 |

---

## opencode

Plan target: 9 layers. Audit: plugin wires 6 event classes + 10 custom tools (most-complete interception today); 0/34 skills; 0 role MDs; 5 MD slash commands ✓; `opencode.md` skip-if-exists; `opencode.jsonc` mcp block ✓.

**Compliance gate:** `packages/cli/src/tests/compliance/opencode-compliance.test.ts` — 17/17 green as of PR 7 units 7.11–7.17. Every `✅` row below is backed by at least one `GAP(oc-*)` assertion in that file.

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
| **34 skill artifacts written to `.opencode/agents/fulcrum-skill-<name>.md` on disk** | ✅ | installer now consumes `emitOpencode(parseCanonicalSource(...))` and writes 33 skill artifacts to `.opencode/agents/` (PR 1 observation — 33 skills, not 34; `index.md` is a catalog). Verify: `pnpm -F fulcrum-agent-fanout test -- emit-new-shapes` asserts `mode: subagent`, `hidden: true`, and `permission.task['*'] === 'deny'` (GAP(oc-agents-M4) — PR 9). Compliance live-env gate in `opencode-compliance.test.ts` (skips gracefully when installer not run; `.opencode/` is gitignored). | PR 4 c2 + PR 9 |
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

**Compliance gate:** `packages/cli/src/tests/compliance/pi-compliance.test.ts` — 11/11 green as of PR 8. Every `✅` row below is backed by at least one `GAP(pi-*)` assertion in that file.

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| Symlink `agent-integration/pi/cockpit/skills -> ../../skills` intact | ✅ | `ls -la agent-integration/pi/cockpit/skills` shows `->` | pre-plan |
| `session_start` event bound | ✅ | `grep -n 'session_start\|sessionStart' agent-integration/pi/cockpit/` | pre-plan |
| **Remaining ~19 PI events bound (before_agent_start, before_provider_request, context, tool_call, tool_result, session_before_compact, agent_end, turn_start/end, user_bash, input, etc.)** | ✅ | 14 `pi.on(<event>, ...)` handlers in `agent-integration/pi/cockpit/index.ts` covering the GAP(pi-M1) required set: `session_start`, `session_shutdown`, `resources_discover`, `tool_call`, `before_agent_start`, `agent_end`, `tool_result`, `context`, `before_provider_request`, `turn_start`, `turn_end`, `session_before_compact`, `user_bash`, `input`. Observational handlers registered from session_start via `registerObservationalEvents()`. | **PR 8.1** |
| **`/fulcrum:role <slug>` role-switcher slash command** | ✅ | `grep -c "fulcrum:role" agent-integration/pi/cockpit/index.ts` ≥ 2 (command registration + internal state). `pi.registerCommand("fulcrum:role", ...)` sets `activeRole` + loads `skills/roles/<slug>.md`; `before_agent_start` handler appends the role MD body to `systemPrompt` so every subsequent turn runs with role context. `/fulcrum:role clear` resets. | **PR 8.2** |
| **24 role MDs emitted under cockpit skill path** | ✅ | `ls agent-integration/skills/roles/*.md \| wc -l` = 24. Flat layout at `agent-integration/pi/cockpit/skills/roles/<slug>.md` (via the `cockpit/skills → ../../skills` symlink). Emitted by `scripts/fanout-pi-cockpit.ts` which translates Claude role MDs for PI (drops Claude-specific `model:` + `tools:`; keeps name + description + body). parseCanonicalSource safely skips the `roles/` subdir (no top-level SKILL.md). | **PR 8.3** |
| **AGENTS.md marker block with canonical rules (PI walks AGENTS.md up from cwd; PI.md not auto-loaded)** | ✅ | `grep -c 'BEGIN FULCRUM managed-block' AGENTS.md` = 1 at repo root. `scripts/fanout-pi-cockpit.ts` appends a BEGIN/END FULCRUM managed-block v1 embedding the 3 canonical rules joined with `\n\n---\n\n`. User-owned prose outside markers survives regeneration. Research 2026-04-20 confirmed PI walks `AGENTS.md`, not `PI.md` (per docs/skills.md:31 + docs/sdk.md). | **PR 8.4** |
| **`agent-integration/pi/cockpit/package.json` name → `@fulcrum-agent-os/pi-cockpit`** | ✅ | `grep '"name"' agent-integration/pi/cockpit/package.json` → `"@fulcrum-agent-os/pi-cockpit"`. Workflow-file rename + npm publish + --auto probe remain PR 14.4 scope. | **PR 8.5** |
| **`npm publish @fulcrum-agent-os/pi-cockpit` to npm registry** | ⬜ | `npm view @fulcrum-agent-os/pi-cockpit version` returns a version | **PR 14.4 — operator step; requires npm org registration** |
| **Rename `.github/workflows/publish-cockpit.yml` → `publish-pi-cockpit.yml` with `pi-cockpit/v*` tag namespace** | ✅ | `ls .github/workflows/publish-pi-cockpit.yml` (old file deleted via git mv) AND name/tag updated in YAML | PR 14.4 |
| **`@fulcrum/cockpit` npm history checked (legacy conflict)** | ✅ | `npm view @fulcrum/cockpit time 2>&1` → HTTP 404 Not Found — no legacy package, no conflict. 2026-04-21 | PR 14.4 |
| **`--auto` probe (`npm view @fulcrum-agent-os/pi-cockpit version`) in installPiCockpit** | ✅ | `probePiCockpitOnNpm()` exported; called in `installPiCockpit()` before `pi install`; prints npm version + install guidance when package is live | PR 14.4 |

---

## Copilot (GitHub Copilot CLI — standalone `copilot` binary)

**2026-04-21 surface correction:** target is the Copilot CLI (`/usr/bin/copilot` v1.0.x),
NOT the VS Code extension. Extension surface doc rewritten — see
`docs/reference/2026-04-19-copilot-extension-surface.md`.
Plan target: 5 layers (MCP, instructions, agents, hooks, AGENTS.md). Compliance: **12/12 green (PR 10)**.

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| `.github/copilot-instructions.md` source | ✅ | `ls agent-integration/copilot/.github/copilot-instructions.md` | pre-plan |
| **`.mcp.json` source (replaces `.vscode/mcp.json` — removed from CLI v1.0.22)** | ✅ | `ls agent-integration/copilot/.mcp.json` | PR 10 |
| **`.github/copilot-instructions.public.md` (sanitized public-repo variant, AD-8)** | ✅ | `grep FULCRUM_PUBLIC_REPO_VARIANT agent-integration/copilot/.github/copilot-instructions.public.md` | PR 10 |
| **33 `.github/instructions/fulcrum-skill-<name>.instructions.md` path-scoped files** | ✅ | `ls agent-integration/copilot/.github/instructions/fulcrum-skill-*.instructions.md \| wc -l` ≥ 33 | PR 10 |
| **24 `.github/agents/<role>.agent.md` custom agent files** | ✅ | `ls agent-integration/copilot/.github/agents/*.agent.md \| wc -l` ≥ 24 | PR 10 |
| **`.github/hooks/fulcrum.json` with Claude Code-style matchers (Write/Edit/Bash)** | ✅ | `grep -c 'Write\|Edit\|Bash' agent-integration/copilot/.github/hooks/fulcrum.json` ≥ 1 | PR 10 |
| **`AGENTS.md` with BEGIN FULCRUM managed-block** | ✅ | `grep 'BEGIN FULCRUM managed-block' agent-integration/copilot/AGENTS.md` | PR 10 |
| **`installCopilot()` written in agent-integration/install.ts** | ✅ | `grep -c 'installCopilot' agent-integration/install.ts` ≥ 1 | PR 10 |
| Extension surface doc updated for Copilot CLI (not VS Code) | ✅ | `grep 'standalone' docs/reference/2026-04-19-copilot-extension-surface.md` | PR 10 |

---

## Cursor

**2026-04-21 surface correction:** Cursor 2.4+ has 6 surfaces (rules, skills, hooks, commands, MCP, AGENTS.md) — not "rules-only". Extension surface doc rewritten. Compliance: **12/12 green (PR 11)**.

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| **`.cursor/mcp.json` source** | ✅ | `ls agent-integration/cursor/.cursor/mcp.json` | PR 11 (moved to .cursor/ prefix) |
| **`.cursor/rules/fulcrum-core.mdc` (alwaysApply:true) with canonical rules** | ✅ | `grep alwaysApply agent-integration/cursor/.cursor/rules/fulcrum-core.mdc` | PR 11 |
| **33 `.cursor/rules/fulcrum-skill-<name>.mdc` (description-match mode)** | ✅ | `ls agent-integration/cursor/.cursor/rules/fulcrum-skill-*.mdc \| wc -l` ≥ 33 | PR 11 |
| **33 `.cursor/skills/fulcrum-*/SKILL.md` (Cursor 2.4+ Agent Skills format)** | ✅ | `find agent-integration/cursor/.cursor/skills -name SKILL.md \| wc -l` ≥ 33 | PR 11 |
| **`.cursor/hooks.json` (16 events: preToolUse, postToolUse, sessionStart, …)** | ✅ | `grep preToolUse agent-integration/cursor/.cursor/hooks.json` | PR 11 |
| **`.cursor/commands/*.md` × 6 user-invokable slash commands** | ✅ | `ls agent-integration/cursor/.cursor/commands/*.md \| wc -l` ≥ 5 | PR 11 |
| **`installCursor()` expanded to emit all 6 surfaces** | ✅ | `grep -c 'fulcrum-skill\|hooks\.json\|commands' agent-integration/install.ts` ≥ 3 | PR 11 |
| Extension surface doc updated (hooks/skills/commands confirmed) | ✅ | `grep '2026-04-21' docs/reference/2026-04-19-cursor-extension-surface.md` | PR 11 |

---

## Windsurf

Plan target: 5 layers. Audit: no hooks; `.windsurf/rules/<skill>.md`; 0 skills today; no installer.

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| `.windsurf/rules/fulcrum.mdc` stub | ✅ | `ls agent-integration/windsurf/.windsurf/rules/` | pre-plan |
| **`installWindsurf()` written** | ✅ | `grep -c 'installWindsurf' agent-integration/install.ts` ≥ 1 | **PR 12** |
| **33 `.windsurf/rules/fulcrum-skill-<name>.md` (trigger: model_decision)** | ✅ | `ls agent-integration/windsurf/.windsurf/rules/fulcrum-skill-*.md \| wc -l` = 33 | **PR 12** |
| **`.windsurf/rules/fulcrum-core.md` (trigger: always_on) with canonical rules** | ✅ | `head -3 agent-integration/windsurf/.windsurf/rules/fulcrum-core.md` | **PR 12** |
| **Workflows for user-invocable skills** | ✅ | `ls agent-integration/windsurf/.windsurf/workflows/*.md \| wc -l` = 6 | **PR 12** |
| **`.windsurf/hooks.json` (10 events)** | ✅ | `cat agent-integration/windsurf/.windsurf/hooks.json` | **PR 12** |
| **Optional global opt-in (`--global` flag in installWindsurf)** | ✅ | `grep -c 'global_rules\.md\|--global' agent-integration/install.ts` ≥ 1 | **PR 12** |
| **12000-byte hard lint** (already in `emitWindsurf`) | ✅ | `grep -c 'WINDSURF_MAX_BYTES' packages/agent-fanout/src/emit/windsurf.ts` ≥ 1 | PR 1 |

---

## Cross-cutting (applies to every agent)

| Item | Status | Verify | Fixed by |
|---|---|---|---|
| Canonical source at `agent-integration/skills/` + `agent-integration/rules/` | ✅ | `ls agent-integration/skills/ agent-integration/rules/` | PR 0, PR 2 |
| `packages/agent-fanout/` produces emit artifacts for all 8 targets | ✅ | `pnpm -F fulcrum-agent-fanout test` green | PR 1 |
| **Installer (`agent-integration/install.ts`) consumes fanout output and writes to disk** | ⚠️ | `grep -c 'parseCanonicalSource\|emit(Claude\|Codex\|Gemini\|Opencode\|Copilot\|Cursor\|Windsurf)' agent-integration/install.ts` = 9 (opencode fan-out landed PR 4 c2); other installers (Claude / Codex / Gemini / Copilot / Cursor / Windsurf) still consume templates directly — full consolidation remains PR 13 scope | **PR 13** (opencode partial — PR 4 c2) |
| `fulcrum install verify --agent <name>` CLI | ✅ | `verifyInstall()` exported from `agent-integration/install.ts`; `runInstall()` handles `verify` + `apply` subcommands; 15 tests in `install-verify.test.ts` — 688/688 green | PR 13 |
| **`fulcrum install verify` reports install mode + plugin version (PR 14.8)** | ✅ | `verifyInstall()` returns `installMode` + `pluginVersion` + `canonicalVersion`; rules-only agents (cursor/windsurf/copilot) → `"manual"`; codex → `"marketplace"`; opencode → detects from installed `opencode.jsonc` plugin ref (`"local"` / `"npm"` / `"unknown"`); 12 new TDD tests in `install-verify-mode-version-pr148.test.ts` — 715/715 green | **PR 14.8** |
| **`docs/architecture/install-paths.md` per-agent install matrix** | ✅ | `ls docs/architecture/install-paths.md` exists; covers all 8 agents (native install command + manual fallback + sentinel) | **PR 14.6** |
| **`SECURITY.md` at repo root (Constraints #21 + #22 posture)** | ✅ | `ls SECURITY.md` exists; covers npm org 2FA, publish-only CI tokens, signed release tags, branch protection, signed commits, marketplace `source:` scoping | **PR 14.0** |
| **Post-pack tarball secret scan in publish workflows (PR 14.9)** | ✅ | `grep -c 'tarball secret scan' .github/workflows/publish-pi-cockpit.yml .github/workflows/publish-opencode-plugin.yml` = 2; `ls agent-integration/pi/cockpit/.npmignore` exists | **PR 14.9** |
| **CHANGELOG + semver version-bump scripts for publish-candidate packages (PR 14.10)** | ✅ | `ls agent-integration/pi/cockpit/CHANGELOG.md agent-integration/opencode/CHANGELOG.md` both exist; `version:patch/minor/major` + `release` scripts in both `package.json`s | **PR 14.10** |
| `fulcrum bias stats` CLI for measurement | ✅ | `fulcrum bias stats` runs | PR 3 |
| Fulcrum-first bias wired for **every hook-capable agent** (Claude, opencode, Gemini, PI, Codex Bash-only) | ⚠️ | Claude (PR 3) + opencode (PR 4 c4) + Gemini (PR 7 cross-cut) wired — `cliName === 'opencode' \|\| cliName === 'gemini'` trust-checked alongside claude in hooks.ts §3a/§3b/§3-opt-out; `HOOK_SEARCH_TOOLS` covers both `Grep/Glob/Read` and `grep_search/list_directory/read_file`; PI + Codex still pending | **PR 5-8 staggered** |
| Fulcrum-first rule text lands in **canonical CLAUDE.md / AGENTS.md (Codex + PI) / GEMINI.md / opencode.md** marker blocks | ✅ | CLAUDE.md (PR 5), opencode.md (PR 4), GEMINI.md (PR 7.6), Codex AGENTS.md (PR 7.25), repo-root AGENTS.md for PI (PR 8.4). Research 2026-04-20 confirmed PI walks `AGENTS.md` up from cwd, not `PI.md` (docs/skills.md:31 + docs/sdk.md) — `PI.md` row retired as a misnomer. | PR 4–8 |
| Drift canary against committed `__fixtures__/golden/` | ✅ | `pnpm -F fulcrum-agent-fanout test drift-canary` | PR 1 |
| Secret scan at parse | ✅ | `scanForSecrets` called in `parseCanonicalSource` | PR 1 |

---

## Quick one-liner: how much is left?

```
grep -c '⬜' docs/reference/2026-04-20-integration-completeness-checklist.md
```

At authoring time this returns **the count of open items across all agents**. A clean merge-ready state means that grep returns **only `🔒` (v4-deferred) rows remaining** — every `⬜` has flipped to `✅` with a green verifier.
