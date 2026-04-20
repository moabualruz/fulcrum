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

Plan target: 5 layers. Audit: 6/34 skills; 4/5 events (UserPromptSubmit missing, Bash-only platform limit).

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| `.codex-plugin/plugin.json` + `marketplace.json` | ✅ | `ls agent-integration/codex/plugin/.codex-plugin/plugin.json agent-integration/codex/marketplace.json` | pre-plan |
| SessionStart hook (Bash → `fulcrum hook codex session-start`) | ✅ | `grep -n 'runCodexSessionStartHook' packages/cli/src/index.ts` | pre-plan |
| Stop / notify hook | ✅ | `grep -n 'runCodexStopHook' packages/cli/src/index.ts` | pre-plan |
| PreToolUse hook (Bash-only platform) | ✅ | existing `fulcrum hook auto` covers | pre-plan |
| **UserPromptSubmit hook + rider content** | ⬜ | `grep -c 'codex.*user-prompt\|CodexUserPrompt' packages/cli/src/index.ts` ≥ 1 | **PR 6** |
| **34 canonical skills installed at `~/.codex/skills/` or `agent-integration/codex/plugin/skills/` sorted** | ⬜ | `ls agent-integration/codex/plugin/skills/ \| wc -l` ≥ 33 (today: 6) | PR 1 emit exists, installer wiring pending |
| **Fanout emitCodex → skills directory on disk** | ⬜ | installer writes 33 artifacts from `emitCodex(source)` into the install root | PR 13 installer wiring |
| **AGENTS.md marker block with canonical rules** | ⬜ | `grep -c 'BEGIN FULCRUM managed-block' agent-integration/codex/AGENTS.md` = 1 | PR 6 / PR 13 |
| **Codex `/plugins` TUI reads filesystem marketplace entries — verified end-to-end** | ⬜ | research: install pieces, run `codex` → `/plugins`, verify Fulcrum shows as AVAILABLE/INSTALLED. Install-state lives in `~/.codex/config.toml [plugins."<name>@<marketplace>"]` + cache. Ledger entry documents result | **PR 14.2 research** |
| **Post-install message: `Fulcrum is installed for Codex. Run 'codex' then '/plugins' to verify/manage in the TUI.`** | ⬜ | `grep -c "Run 'codex' then '/plugins'" agent-integration/install.ts` ≥ 1 | PR 14.2 |
| **`.codex-plugin/plugin.json` schema validated against current Codex plugin loader docs** | ⬜ | install-time validation passes | PR 14.2 |
| **Malformed `~/.agents/plugins/marketplace.json` entry cleanup documented** (stray `{"host":"codex",...}` object discovered 2026-04-20) | ⬜ | cleanup step in installer or doc | PR 14.2 |

---

## Gemini CLI

Plan target: 9 layers. Audit: 6/11 events (BeforeAgent, BeforeToolSelection, Notification, AfterModel-content missing); 6/34 skills; 2/24 sub-agents.

| Layer / requirement | Status | Verify | Fixed by |
|---|---|---|---|
| `gemini-extension.json` | ✅ | `ls agent-integration/gemini/gemini-extension.json` | pre-plan |
| `mcpServers` in extension manifest | ✅ | `grep -c '"mcpServers"' agent-integration/gemini/gemini-extension.json` ≥ 1 | pre-plan |
| SessionStart / BeforeModel / BeforeTool (partial) | ✅ | `grep -n 'runGeminiSessionStart\|runGeminiBeforeAgent' packages/cli/src/index.ts` | pre-plan |
| **BeforeAgent, BeforeToolSelection, Notification, AfterModel-content handlers** | ⬜ | 4 new handler functions | **PR 7** |
| **34 canonical skills installed at `agent-integration/gemini/skills/fulcrum-<name>/`** | ⬜ | `ls agent-integration/gemini/skills/ \| wc -l` ≥ 33 (today: 6) | **PR 7 / installer** |
| **24 sub-agent MDs at `agent-integration/gemini/agents/`** | ⬜ | `ls agent-integration/gemini/agents/*.md \| wc -l` ≥ 24 (today: 2) | **PR 7** |
| **`agent-integration/gemini/policies/` populated** | ⬜ | `ls agent-integration/gemini/policies/` non-empty | **PR 7** |
| **GEMINI.md marker block with canonical rules** | ⬜ | `grep -c 'BEGIN FULCRUM managed-block' agent-integration/gemini/GEMINI.md` = 1 | **PR 7** |
| **TOML slash commands regenerated from fanout** | ⬜ | `ls agent-integration/gemini/commands/*.toml \| wc -l` ≥ 6 with each matching canonical skill | PR 7 |
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
| **34 skill artifacts written to `.opencode/agents/fulcrum-skill-<name>.md` on disk** | ⚠️ | `emitOpencode(source)` produces them in-memory (PR 1) but **nothing writes them to disk**. Verify: `ls .opencode/agents/ 2>/dev/null` expects 34 files — today: dir absent. | **next session — redo PR 4 installer wiring** |
| **24 role MDs emitted / on disk for opencode** | ⬜ | `ls agent-integration/opencode/agents/ 2>/dev/null` = 24 | **next session** |
| **Bias nudge / passive injection on opencode's `tool.execute.before`** (not only Claude) | ⬜ | `grep -c "cliName === 'opencode'" packages/cli/src/hooks.ts` ≥ 1 OR opencode-plugin-side nudge logic | **next session** |
| **Actual rider `additionalContext` fallback on `session.idle` (not just telemetry)** | ⚠️ | Currently only logs `opencode_rider_never_injected`. No re-injection. AD-3 specifies fallback injection of rider into next user message via additionalContext. | **next session** |
| **`.ridersum` GENERATION tool** (vs. just VERIFICATION) | ⬜ | installer / agent-fanout CLI writes `.ridersum` next to `.opencode/rules/` with the live SHA-256 | **next session** |
| **`installOpencode()` consumes `emitOpencode(parseCanonicalSource(...))` output and writes to disk** | ⬜ | `grep -c 'emitOpencode\|agent-fanout' agent-integration/install.ts` ≥ 1 | **next session** |
| **Post-session workspace write via `fulcrum hook opencode session-end` (already wired) — verify no regression** | ✅ | existing | pre-plan |
| **`npm publish @fulcrum-agent-os/opencode-plugin` to npm registry (first release)** | ⬜ | `npm view @fulcrum-agent-os/opencode-plugin version` returns a version; published from CI workflow (not laptop) | **PR 14.3 — requires npm org registration first** |
| **`--auto` probe (`npm view @fulcrum-agent-os/opencode-plugin version`) in installOpencode** | ⬜ | `grep -c 'npm view @fulcrum-agent-os/opencode-plugin' agent-integration/install.ts` ≥ 1 | PR 14.3 |
| **Error path `opencode-plugin-unresolved` when --auto falls to --local and local file absent** | ⬜ | `grep -c 'opencode-plugin-unresolved' agent-integration/install.ts` ≥ 1 | PR 14.3 |

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
| **Installer (`agent-integration/install.ts`) consumes fanout output and writes to disk** | ⬜ | `grep -c 'parseCanonicalSource\|emit(Claude\|Codex\|Gemini\|Opencode\|Copilot\|Cursor\|Windsurf)' agent-integration/install.ts` ≥ 1 | **PR 13** |
| `fulcrum install verify --agent <name>` CLI | ⬜ | `grep -c 'install verify' packages/cli/src/index.ts` ≥ 1 | **PR 13** |
| `fulcrum bias stats` CLI for measurement | ✅ | `fulcrum bias stats` runs | PR 3 |
| Fulcrum-first bias wired for **every hook-capable agent** (Claude, opencode, Gemini, PI, Codex Bash-only) | ⚠️ | only Claude today | **PR 5-8 staggered** |
| Fulcrum-first rule text lands in **canonical CLAUDE.md / AGENTS.md / GEMINI.md / PI.md / opencode.md** marker blocks | ⚠️ | 0 of 5 today | **PR 5-8** |
| Drift canary against committed `__fixtures__/golden/` | ✅ | `pnpm -F fulcrum-agent-fanout test drift-canary` | PR 1 |
| Secret scan at parse | ✅ | `scanForSecrets` called in `parseCanonicalSource` | PR 1 |

---

## Quick one-liner: how much is left?

```
grep -c '⬜' docs/reference/2026-04-20-integration-completeness-checklist.md
```

At authoring time this returns **the count of open items across all agents**. A clean merge-ready state means that grep returns **only `🔒` (v4-deferred) rows remaining** — every `⬜` has flipped to `✅` with a green verifier.
