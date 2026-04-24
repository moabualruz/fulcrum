---
date: 2026-04-16
topic: memory-architecture-v2
part: "08"
title: Per-Host Plugin Integration Requirements
index: index.md
prev: 07-acceptance-and-planning.md
research: docs/research/plugin-standards-per-agent-host.md
---

# Memory Architecture v2 — 08 — Per-Host Plugin Integration Requirements

**[← Index](index.md)** · **[← Prev: Acceptance & Planning](07-acceptance-and-planning.md)**

Consolidates plugin / extension standards for the six target agent harnesses that Fulcrum integrates with. Grounded in local-source + documentation research at [`docs/research/plugin-standards-per-agent-host.md`](../../research/plugin-standards-per-agent-host.md).

**User concern (verbatim, v2 session):** "our extensions and plugins are lacking and not standardized and not fully utilizing what these agent harnesses offer for integrations."

**Verdict:** All current `agent-integration/*` are salvageable but uneven. One-line summary of the gap: *we ship some hooks for some hosts, six skills for one host, zero plugins anywhere, and zero Copilot integration*. Total effort to close all gaps: **~9h 45m across six hosts** (from the line-item manifest table below; safe-fix #3 reconciles with the per-host section totals).

**Scope split (per v2a/v2b decision, see `00-scope-split.md`).** This part mixes correctness-required work (v2a: hook matcher narrowing §S2, run-lifecycle signals §S3, shared skills deployment §S1 for existing hosts, Codex `PLACEHOLDER_PLUGIN_PATH` fix, OpenCode tool allowlist, Pi dead-JSON deletion + cockpit CLI) with enhancement / distribution work (v2b: plugin bundles §S4, Copilot integration §H5, Claude marketplace distribution, Gemini `BeforeModel/AfterModel/PreCompress`, Codex `approval_mode` switch, Pi npm publish). The manifest table below is annotated with `[v2a]` / `[v2b]` per row.

---

## Cross-Cutting Standards (§S1–S4)

### S1. Shared skills library

**Canonical location:** `agent-integration/skills/<name>/SKILL.md` (one tree, source of truth).

**Cross-agent convention adopted:** `.agents/skills/<name>/SKILL.md` — all five non-Pi hosts now read this path. Fulcrum ships the canonical content once; each host's integration directory symlinks into it.

```
agent-integration/
├── skills/                           # canonical source of truth (new)
│   ├── memory-recall/SKILL.md
│   ├── task-tracking/SKILL.md
│   ├── team-invocation/SKILL.md
│   ├── project-orientation/SKILL.md
│   └── ...
├── claude/.agents/skills   → ../../../skills   (symlink)
├── gemini/.agents/skills   → ../../../skills   (symlink)
├── codex/.agents/skills    → ../../../skills   (symlink)
├── opencode/.agents/skills → ../../../skills   (symlink)
├── copilot/.agents/skills  → ../../../skills   (symlink, new host)
└── pi/cockpit/skills       → ../../skills      (symlink)
```

**Current state:** Gemini ships 6 skills under its own `hooks/skills/` path. Codex plugin ships 6 skills (not yet discoverable pre-install). Claude / OpenCode / Copilot ship zero.

**Upgrade:** move the Gemini + Codex skills into `agent-integration/skills/`; symlink from every host. Result: agents on all six hosts can model-invoke Fulcrum skills.

### S2. Hook matcher narrowing

**Current default everywhere:** wildcard — hooks fire on every tool call including `Read` / `Glob` / `Grep`.

**Fulcrum fix:** narrow matchers to write-ish tools only. Per-host syntax:

| Host | Matcher syntax | Target |
|---|---|---|
| Claude Code | `"matcher": "Bash|Write|Edit|MultiEdit|Task|NotebookEdit"` (regex in `PreToolUse` / `PostToolUse` hooks) | Only write-ish tool calls trigger memory hooks |
| Gemini CLI | `"tools": ["Bash", "Write", "Edit", "MultiEdit", "NotebookEdit"]` in `BeforeTool` / `AfterTool` config | Same |
| Codex CLI | `allowed_tools = ["bash", "write", "edit", …]` in `config.toml` hook entry | Same |
| OpenCode | in-plugin allowlist check in `tool.execute.before` / `tool.execute.after` handlers before shelling out | Same — prevents shelling `fulcrum hook auto` for every Read/Glob/Grep |
| Copilot | n/a at hook level (Copilot has no hook surface); handled upstream via `.vscode/mcp.json` tool-allowlist | n/a |
| Pi | filter inside `cockpit/index.ts` pre/post handler | Same |

**Acceptance:** zero memory writes originate from `Read` / `Glob` / `Grep` tool calls under typical sessions (criterion §11.68).

### S3. Run-lifecycle signals (not just Stop)

Each harness has a proper "turn ends / run completes" event Fulcrum is not using today. Wire these for correct `session_summary` + `task_outcome` writes:

| Host | Events to add |
|---|---|
| Claude Code | `SessionEnd` + `SubagentStart` + `SubagentStop` (for parent-side delegation-summary memory per v2 §1 writes) |
| Gemini CLI | `AfterAgent` (fires at end of full agent turn, not just tool call) |
| Codex CLI | `notify` (stable + documented; prefer over `[[hooks]]` which is feature-flagged) |
| OpenCode | subscribe `event` bus to `session.idle` + `session.compacted` + `todo.updated` |
| Copilot | n/a (no hook surface) |
| Pi | existing cockpit lifecycle already exposes; wire properly per §7 |

### S4. Plugin bundle format (where applicable)

Each host with a plugin format should have a real bundle — not just loose config files.

| Host | Bundle file | Current state | Upgrade |
|---|---|---|---|
| Claude Code | `.claude-plugin/plugin.json` | missing — we ship `.mcp.json` + `settings-hooks-snippet.json` loose | wrap in bundle — unlocks `/plugin install` + marketplace distribution |
| Codex CLI | `.codex-plugin/plugin.json` + `marketplace.json` | present but `marketplace.json` has `PLACEHOLDER_PLUGIN_PATH` — broken | fix path + validate |
| OpenCode | `plugins/fulcrum.ts` | present, single TS file | upgrade to subscribe additional events + allowlist tool names |
| Gemini CLI | `gemini-extension.json` | present | add new hook entries (S3) |
| Copilot | no bundle format (MCP-based) | no integration | create `agent-integration/copilot/` with MCP + instructions |
| Pi | `fulcrum.extension.json` | dead / unused | delete; publish `fulcrum-cockpit` npm package instead |

---

## Per-Host Requirements

### §H1. Claude Code

**Current integration** (`agent-integration/claude/`): `.mcp.json` (references Fulcrum MCP server), `settings-hooks-snippet.json` (hook config template for `~/.claude/settings.json`).

**Gaps vs. standards:**
- No `.claude-plugin/plugin.json` bundle → cannot `/plugin install` from marketplace.
- Zero skills shipped.
- Hook matchers are wildcard.
- Missing `SessionEnd` + `SubagentStart/Stop` hooks.

**Upgrades:**

1. Wrap existing hook config + MCP manifest in `.claude-plugin/plugin.json` bundle. Unlocks marketplace distribution.
2. Symlink shared skills library into `agent-integration/claude/.agents/skills/`.
3. Add hook entries for `SessionEnd`, `SubagentStart`, `SubagentStop`. `SessionEnd` writes `session_summary` memory (fallback when no `task_outcome` this run); `SubagentStop` writes `delegation_summary` to parent's memory.
4. Narrow `PreToolUse` + `PostToolUse` matchers to `Bash|Write|Edit|MultiEdit|Task|NotebookEdit`.
5. MCP is optional add-on (CLI-first via hooks + skills per v2 §1.4). User running `/plugin install fulcrum` installs hooks + skills; they add MCP to `.mcp.json` only if they want structured tool calls.

**Effort:** ~2 hours.

### §H2. Gemini CLI

**Current integration** (`agent-integration/gemini/`): `gemini-extension.json`, `hooks/hooks.json` with `SessionStart` + `BeforeAgent` + `BeforeTool` + `AfterTool` + `SessionEnd` entries, 6 skills under `hooks/skills/`, 6 slash commands under `commands/*.toml`.

**Gaps vs. standards:**
- Skills live under integration dir, not shared canonical tree.
- Missing `BeforeModel` / `AfterModel` / `PreCompress` hooks.
- `BeforeAgent` stub unused (v2 §2 deletes it — no auto-recall injection).
- Hook matchers are wildcard.

**Upgrades:**

1. Move 6 existing skills to `agent-integration/skills/`; symlink `agent-integration/gemini/.agents/skills/` → canonical tree.
2. Add `BeforeModel` / `AfterModel` / `PreCompress` hook entries:
   - `BeforeModel`: no-op by default; hook point for future secret-redaction of model inputs.
   - `AfterModel`: no-op by default; hook point for response logging if operator enables analytics rule.
   - `PreCompress`: Fulcrum's PreCompact extractor (v2 §3 / §7) — synthesize `pre_compact_extract` memories before context drops.
3. Delete the `BeforeAgent` entry per v2 §2 divergence (no auto-recall).
4. Switch `AfterAgent` to the run-lifecycle signal for `session_summary` writes (S3).
5. Narrow `BeforeTool` / `AfterTool` matchers.

**Effort:** ~1.5 hours.

### §H3. Codex CLI

**Current integration** (`agent-integration/codex/`): `config.toml` (hook entries + MCP config), `plugin/.codex-plugin/plugin.json`, `marketplace.json`.

**Gaps vs. standards:**
- `marketplace.json` has `PLACEHOLDER_PLUGIN_PATH` — broken.
- Hook-based policy for `invoke_team` instead of native per-tool `approval_mode`.
- `[[hooks]]` in `config.toml` is feature-flagged; stable `notify` is unused.
- Hook matchers are wildcard.

**Upgrades:**

1. Fix `marketplace.json` `PLACEHOLDER_PLUGIN_PATH` → `./plugin`.
2. Switch `invoke_team` tool from hook-based policy gate to per-tool `approval_mode = "prompt"` in `config.toml`. Native UX; eliminates a hook round-trip.
3. Migrate from `[[hooks]]` (feature-flagged) to `notify` (stable + documented) for run-end signals.
4. Move Codex plugin's 6 skills to canonical `agent-integration/skills/`; symlink.
5. Narrow hook `allowed_tools` lists.

**Effort:** ~1 hour (5 min for marketplace fix; most effort in `invoke_team` migration).

### §H4. OpenCode (sst)

**Current integration** (`agent-integration/opencode/`): `plugins/fulcrum.ts` — single TS file with `tool.execute.before` / `tool.execute.after` / `permission.ask` / `experimental.chat.system.transform` handlers.

**Gaps vs. standards:**
- Subscribing only to tool events, not `event: session.idle` / `session.compacted` / `todo.updated`.
- No in-plugin allowlist — shells `fulcrum hook auto` for every tool call including Read/Glob/Grep.
- Zero skills shipped.

**Upgrades:**

1. Subscribe `event` bus to `session.idle`, `session.compacted`, `todo.updated`:
   - `session.idle` → run `session_summary` fallback if no `task_outcome` this run.
   - `session.compacted` → run PreCompact extractor.
   - `todo.updated` → when OpenCode's internal todo list changes, optionally mirror into Fulcrum `tasks`.
2. Add in-plugin tool-name allowlist (S2) to prevent hook fan-out on read-only tool calls.
3. Symlink shared skills library into `agent-integration/opencode/.agents/skills/`.

**Effort:** ~1.5 hours.

### §H5. GitHub Copilot (**new host — no existing integration**)

**Current integration:** none — `agent-integration/copilot/` does not exist.

**Feasibility:** **YES, at low cost.** Three integration paths; recommended stack below covers 80% of value in ~2 hours.

**Three paths:**

| Path | Surface | Effort | Coverage |
|---|---|---|---|
| **A** | MCP via `.vscode/mcp.json` or user `settings.json` | ~30 min | Copilot Chat + CLI + cloud-agent all support MCP in 2026. GitHub MCP Registry at github.com/mcp for discovery. |
| **B** | Agent Skills at `.agents/skills/` (announced Dec 2025) | ~1 hour (shared with other hosts) | All Copilot modes read this convention. |
| **C** | Custom instructions via `.github/copilot-instructions.md` | ~15 min | Chat + cloud agent auto-load this file. |
| **D** (defer) | Full Copilot Extension (GitHub App + SSE + OAuth callback) | days | Only if Fulcrum wants hosted-as-a-service. |

**Recommended stack (A + B + C):** ~1 hour 45 minutes total for a complete initial integration.

**Upgrades (all net-new files):**

1. `agent-integration/copilot/.vscode/mcp.json` — points to `fulcrum serve mcp --profile software_engineer`. Users copy this into their workspace's `.vscode/` directory; MCP tools appear in Copilot Chat.
2. `agent-integration/copilot/.github/copilot-instructions.md` — CLI-first guidance for Copilot (for Agent Mode and cloud agent; instructs Copilot to call `fulcrum action exec <name>` when appropriate).
3. `agent-integration/copilot/.agents/skills/` — symlink to shared skills library.
4. `agent-integration/copilot/README.md` — instructions for users: copy `.vscode/mcp.json` + `.github/copilot-instructions.md` into your repo's appropriate paths; run `gh mcp install fulcrum` if gh-mcp-cli is available.

**Effort:** ~2 hours for complete initial integration.

### §H6. Pi (Fulcrum's own co-runtime cockpit)

**Current integration** (`agent-integration/pi/`): `fulcrum.extension.json` (dead), `cockpit/index.ts`, `cockpit/package.json`.

**Gaps vs. standards:**
- `fulcrum.extension.json` unused — legacy.
- `cockpit/` not published on npm — installation is "clone the monorepo."
- Missing activation command (`fulcrum pi cockpit start` per v2 §1.4).

**Upgrades:**

1. Delete `fulcrum.extension.json`.
2. Publish `fulcrum-cockpit` on npm (scope: `fulcrum-cockpit` or org equivalent). Installable via `npm i -g fulcrum-cockpit`.
3. Wire `fulcrum pi cockpit {start|stop|status}` command in CLI per v2 §1.4 and source inventory PR 14.
4. Symlink shared skills library into `agent-integration/pi/cockpit/skills/`.
5. Document the cockpit's extension shape for third-party Pi plugins (Pi is the only host Fulcrum owns; this is the canonical reference).

**Effort:** ~2.5 hours (most in npm publishing + documentation).

---

## CLI-First Fallback Exception

Per v2 §1.4, CLI-first is primary; MCP is an optional overlay added on demand. **Exactly one host where CLI-first doesn't apply:**

- **GitHub Copilot Chat** (pure chat form in VS Code; no Bash tool available).

All other Copilot modes (Agent Mode, Copilot CLI, cloud agent) have terminal access → CLI-first works. Claude Code, Gemini, Codex, OpenCode, Pi all expose Bash or equivalent; `fulcrum action exec <name>` works there.

**For Copilot Chat, MCP-install is mandatory** — Path A above is the primary integration, not optional.

This is documented in the Copilot section so users know: if they're using Copilot Chat, they must install the MCP (`.vscode/mcp.json`); if they're using Copilot Agent Mode or Copilot CLI, CLI-first works and MCP is optional.

---

## Copy-File / Upgrade Manifest (per-host work)

Concrete file-level changes per host, ordered by effort ascending. Scope tags: `[v2a]` ships in baseline (required for correctness); `[v2b]` deferred to knowledge-graph roadmap.

| # | Scope | Host | Change | Path (repo-relative) | Effort |
|---|---|---|---|---|---:|
| 1 | [v2a] | Pi | DELETE dead extension JSON | `agent-integration/pi/fulcrum.extension.json` | 2 min |
| 2 | [v2a] | Codex | FIX `marketplace.json` PLACEHOLDER | `agent-integration/codex/marketplace.json` | 5 min |
| 3 | [v2b] | Copilot | NEW `.github/copilot-instructions.md` | `agent-integration/copilot/.github/copilot-instructions.md` | 15 min |
| 4 | [v2b] | Copilot | NEW `.vscode/mcp.json` | `agent-integration/copilot/.vscode/mcp.json` | 30 min |
| 5 | [v2a] | All | CREATE shared skills canonical tree + symlinks for existing 5 hosts | `agent-integration/skills/` + 5 symlinks | 1 hr |
| 6 | [v2b] | Codex | SWITCH `invoke_team` to `approval_mode = "prompt"` | `agent-integration/codex/config.toml` | 30 min |
| 7 | [v2a] | Codex | MIGRATE `[[hooks]]` → `notify` | `agent-integration/codex/config.toml` | 30 min |
| 8 | split | Gemini | [v2a] DELETE `BeforeAgent` stub + ADD `AfterAgent` (30m) · [v2b] ADD `BeforeModel` / `AfterModel` / `PreCompress` (30m) | `agent-integration/gemini/hooks/hooks.json` | 1 hr total |
| 9 | split | OpenCode | [v2a] ADD tool allowlist + `session.idle`/`session.compacted` (1h) · [v2b] ADD `todo.updated` sub + `session.compacted` graph write path (30m) | `agent-integration/opencode/plugins/fulcrum.ts` | 1.5 hr total |
| 10 | [v2b] | Claude | NEW `.claude-plugin/plugin.json` bundle for marketplace distribution | `agent-integration/claude/.claude-plugin/plugin.json` | 1 hr |
| 11 | [v2a] | Claude | ADD `SessionEnd` / `SubagentStart` / `SubagentStop` hooks | `agent-integration/claude/settings-hooks-snippet.json` | 30 min |
| 12 | [v2a] | All | NARROW hook matchers to write-ish tools | hooks configs across 5 hosts | 45 min |
| 13 | [v2b] | Pi | PUBLISH `fulcrum-cockpit` on npm | `agent-integration/pi/cockpit/package.json` + publish workflow | 2 hr |
| 14 | [v2a] | Pi | WIRE `fulcrum pi cockpit {start|stop|status}` | `packages/cli/src/` + `agent-integration/pi/cockpit/` | 30 min (overlaps with memory-v2 PR 14) |

**v2a subtotal:** ~4h 22m (rows 1, 2, 5, 7, 8-v2a, 9-v2a, 11, 12, 14).
**v2b subtotal:** ~5h 23m (rows 3, 4, 6, 8-v2b, 9-v2b, 10, 13).
**Total (all rows):** ~9h 45m — canonical figure per safe-fix #3; supersedes prior "~9–10h" hand-wave.

---

## Acceptance Criteria (host-specific, continuing §11 numbering from chunk 07)

60. **Claude Code plugin bundle.** `agent-integration/claude/.claude-plugin/plugin.json` validates against Claude's plugin schema. A user running `/plugin install <marketplace_url>` installs hooks + skills + MCP manifest in one step.

61. **Gemini lifecycle hooks complete.** `BeforeModel` / `AfterModel` / `PreCompress` / `AfterAgent` hooks fire correctly. `PreCompress` produces at least one `pre_compact_extract` memory in a long session with compaction.

62. **Codex marketplace validates.** `agent-integration/codex/marketplace.json` resolves without `PLACEHOLDER_PLUGIN_PATH`. `codex plugin install <marketplace_url>` succeeds end-to-end.

63. **Codex `invoke_team` prompt approval.** Calling `invoke_team` via Codex triggers native per-tool prompt approval (not hook-based denial). User sees Codex's native confirmation UI.

64. **OpenCode event subscriptions.** OpenCode event bus subscriptions for `session.idle`, `session.compacted`, `todo.updated` produce the correct memory writes (session_summary, pre_compact_extract, task mirror).

65. **Copilot Chat MCP.** With `agent-integration/copilot/.vscode/mcp.json` copied into a user's workspace, Copilot Chat lists Fulcrum MCP tools and can call them.

66. **Copilot Agent Mode CLI-first.** With `.github/copilot-instructions.md` loaded, Copilot Agent Mode calls `fulcrum action exec <name>` via its Bash tool and behaves like every other CLI-first host.

67. **Shared skills library deployed.** `agent-integration/skills/` exists; all six host integration directories contain `.agents/skills/` symlink pointing to it. Skills discovered natively by Claude / Gemini / Codex / OpenCode / Copilot / Pi.

68. **Hook matcher narrowness.** Across all five hook-capable hosts, invoking `Read` / `Glob` / `Grep` in a typical agent session produces zero memory write events. `Bash` / `Write` / `Edit` / `MultiEdit` / `Task` / `NotebookEdit` produce the expected memory writes per v2 §1.

69. **Pi cockpit on npm.** `npm install -g fulcrum-cockpit` (or chosen scope) succeeds. `fulcrum pi cockpit start` from a clean shell spawns the cockpit process.

70. **Dead artifacts removed.** `agent-integration/pi/fulcrum.extension.json` deleted. `agent-integration/gemini/hooks/hooks.json` no longer contains `BeforeAgent` stub entry.

---

## Planning Questions (host-specific, continuing §12 numbering from chunk 07)

32. **Shared skills deployment mechanism.** Symlinks work on macOS/Linux dev machines but break on Windows + in some CI runners. Planning picks: (a) symlinks with a `fulcrum skills sync` fallback that copies files on filesystems that don't support symlinks, or (b) bundled copies at release time with a build step that snapshots the canonical tree into each host directory.

33. **Copilot full-extension path.** Path D (GitHub App + SSE + OAuth) is deferred but not rejected. Planning confirms: when/if Fulcrum runs as hosted-SaaS, do we build a Copilot Extension? Initial decision: defer to post-v2.

34. **Pi cockpit npm package ownership.** Which npm org publishes `fulcrum-cockpit`? Who manages the publish keys + release automation? Planning confirms ownership before PR 14 (v2 manifest).

35. **Claude Code marketplace strategy.** Do we publish Fulcrum's Claude plugin to Anthropic's central marketplace, self-host in the Fulcrum repo's GitHub Releases, or both? Planning picks distribution channel.

36. **Per-host skill authoring.** Does each skill live in one canonical file that applies to every host verbatim, or do we maintain per-host variants (e.g., Claude's Bash tool differs from OpenCode's)? Initial plan: one canonical file; host-specific notes in frontmatter. Planning confirms.

37. **Cross-host skill compatibility test.** Planning specifies a CI job that loads each skill on each host's native skill-loader and asserts the skill is interpretable (metadata valid, tool references resolvable).

---

**[← Index](index.md)** · **[← Prev: Acceptance & Planning](07-acceptance-and-planning.md)**
