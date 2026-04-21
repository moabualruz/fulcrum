---
title: "refactor: cross-agent parity + Fulcrum-first behavioral bias + plugin-standard packaging across 8 CLI agents (v3)"
type: refactor
status: active-closeout
date: 2026-04-19
origin: handover at docs/handover/2026-04-19-agent-parity-handover.md; audit of `pnpm run setup` coverage across Claude Code / Codex / Gemini / opencode / PI / Copilot / Cursor / Windsurf; v3 adds plugin-standard packaging parity (PR 14) after user raised the gap 2026-04-19
---

# Agent parity + Fulcrum-first behavioral bias + plugin-standard packaging — cross-agent refactor plan (v3)

> **For agentic workers:** this plan is skill-dense. See `§Skill Utilization Matrix` for the authoritative mapping of skill → PR → unit. Every unit names the skills required at that point. Skipping a required skill is an auditable defect.

## Revision history

- **v1** (this session, earliest draft): 9 PRs. Surfaced for user review. v1 persona sweep ran.
- **v2** (this session): user direction locked three decisions — (1) no scope caps; (2) wire every achievable interception point per agent; (3) skills=HOW preserved + rules=WHAT/WHEN, never drop skills. Symlink-premise falsification from feasibility persona folded in. 9 → 14 PRs.

  (v2 "14 PRs" counted PR 0 + PRs 1-13. v3 renumbers to make room for PR 14. Semantics unchanged.)
- **v3** (this session): user flagged missing standardization — Claude Code / Codex / opencode / PI each have native plugin/extension distribution paths Fulcrum only half-uses. Added **PR 14 (Plugin-standard packaging parity)**, **AD-10**, **Critical Constraint #19**, 3 new Open Questions, 4 new Risks, and a "Distribution path" column in the audit table. Timeline: 32 → 35 days.
- **v3.3** (this session, current): PR 0 unit 0.5 persona re-pass (adversarial/coherence/feasibility/scope-guardian/security-lens already done v3.1→v3.2; **product-lens + design-lens ran fresh on v3.2**) + **4-agent web-research pass** (behavioral-bias empirical state; Claude marketplace maturity; research-owed items for PR 14). Four substantive plan reshapes folded:
  - **R1 (per product-lens H1 + research Q1 + Q2)**: "recall-before-file-search" bias is empirically unfalsified; production tools (Cursor Memory, Continue, Cody) inject retrieved context passively rather than trusting a rule. **PR 3 scoped to a measurement spike on Claude Code only (1 agent, not 3). Rule + hook fanout PRs 4-12 gated on ≥20pp delta** (matches plan's own Risk-table threshold). If the spike fails the gate, switch architecture to AD-11 (passive-injection) or abandon the bias mechanism entirely; either way, stop fanning out a dead premise.
  - **R2 (per product-lens H2 + H3 + research Q3 + Q6)**: Claude marketplace is shipping-but-janky as of Q2 2026 (open issues #46594 silent update failures, #46081 stale cache, #38271 no refresh, #37886 SSH-keyring prompts). PI ecosystem has zero third-party npm plugins. Codex has no install CLI. **PR 14 deferred to v4** in full, except for **opencode npm publish which moves into PR 4** (opencode plugin is the v3.2 PR where packaging belongs; npm is the canonical path; multiple community examples already exist). Saves ~2.5 days + avoids shipping into broken update mechanics. `SECURITY.md`, Claude marketplace auth, PI publish, Codex TUI work all move to v4 once Claude marketplace fixes land + user demand materializes.
  - **R3 (new AD-11)**: passive-injection alternative to the behavioral bias rule. A PreToolUse hook on Grep/Read/Glob runs `recall_knowledge` silently with the tool's query and prepends results to the tool output the model sees. Converts a behavioral bet into a mechanical guarantee. Evaluated during PR 3 measurement spike against the rule-only approach; the winning mechanism drives PRs 4-12 fanout.
  - **R4 (research-owed resolutions)**: Claude marketplace `source:` field schema confirmed (resolves relative to marketplace root, `owner: {name, email?}` only, relative paths only work via git-add not URL-add); `claude plugin install` CLI confirmed non-interactive and `claude plugin marketplace add` confirmed; Codex `/plugins` TUI reads `~/.agents/plugins/marketplace.json` ✓ but install-state lives in `~/.codex/config.toml` `[plugins."name@marketplace"]` + cache dir, so pre-wiring pieces does NOT make Fulcrum show "installed"; current `~/.agents/plugins/marketplace.json` has a malformed entry needing cleanup. These resolutions scoped for v4 PR 14 reference.

  **Timeline: 35 → 32 days** (PR 14 moves out; opencode npm publish absorbed into PR 4 is net-neutral).

  **Deferred v3.3 work (not blocking PR 1):** R5 (design-lens gaps — enumerate install failure modes + post-install copy + per-PR unit IDs) folded opportunistically at PR 13 time. R6 (Copilot rule-only asymmetry) documented honestly in PR 10's install-paths doc as a known limitation ("no hook layer; rules reach model only when VS Code renders them").

- **v3.2** (this session, prior): v3.1 persona re-pass (adversarial + coherence + feasibility + scope-guardian + security-lens) surfaced 5 must-fix contradictions + 8 implementation gaps + 2 net-new security constraints. v3.2 folds:
  - Stale `@moabualruz/fulcrum-cockpit` references swept to `@fulcrum-agent-os/pi-cockpit` (coherence finding).
  - Stale v3 "LOCAL marketplace at agent-integration/claude/..." sentence fixed to v3.1's GitHub-repo-root location (adversarial F1 + coherence).
  - AD-2 opencode layer count: **10 → 9**. Layer-3 is state-adaptive content on layer-2 rider, not a separate hook. AD-2 row updated with the structural-gap note (adversarial F3).
  - **PR 14.0 typo-squat placeholder registrations DROPPED** — scope-guardian flagged premature hardening; `@fulcrum-agent-os` scope is long/specific enough. Any future typo-squat reservation happens within-org-scope only.
  - **PR 14.2 post-install message corrected**: "Run `codex` then `/plugins` to verify/manage" (not "to browse to install") — feasibility + security-lens findings.
  - **PR 14.3 (opencode publish) spec expanded**: `main`/`exports`/`files`/build-script added; `--auto` probe mechanism = `npm view <pkg> version 2>/dev/null`; error path for "npm unreachable AND no local plugin file" (feasibility HIGH + adversarial F6).
  - **PR 14.4 (PI publish) reconciles existing `.github/workflows/publish-cockpit.yml`**: rename to `publish-pi-cockpit.yml`, re-tag namespace `pi-cockpit/v*`, verify `@fulcrum/cockpit` npm history; `--auto` probe = `npm view` (feasibility HIGH).
  - **PR 14.9 tarball-content scan runs POST-pack, not on source** (security-lens finding #3 — catches inlined build-time secrets).
  - **Critical Constraint #20 enforces #19**: post-pack scan is the mechanism.
  - **Critical Constraint #21 (new — npm publish hygiene)**: 2FA org; org-scoped publish-only tokens; CI-only publish path; signed release tags (security-lens finding #1).
  - **Critical Constraint #22 (new — marketplace-backing repo posture)**: branch protection + signed commits + `SECURITY.md` on `moabualruz/fulcrum` (security-lens finding #2).

  Remaining v3.2 gaps surfaced but NOT folded (flag for user review): claude marketplace `source:` schema verification (PR 14.1 research-owed — adversarial F2); Codex TUI-visibility-after-filesystem-registration verification (PR 14.2 research-owed — adversarial F5); `--auto` probe spec for Claude `/plugin install` version (PR 14.1 research-owed); fan-out performance budget <1000ms may be tight for cold-start CI (feasibility; can widen at measurement). These are research-owed at PR-time; v3.2 does not attempt to resolve them speculatively.

- **v3.1** (this session, prior): user resolved Open Questions #2, #10, #11, #12, #13 via wizard interview. Decisions:
  - **npm scope: `@fulcrum-agent-os/*`**. Publish targets: `@fulcrum-agent-os/opencode-plugin`, `@fulcrum-agent-os/pi-cockpit`. PR 14.0 registers the npm org (typo-squat placeholders dropped in v3.2).
  - **Claude marketplace: GitHub repo root**. Ship `.claude-plugin/marketplace.json` at the `moabualruz/fulcrum` repo root (separate from plugin manifest at `agent-integration/claude/.claude-plugin/plugin.json`). Users: `/plugin marketplace add moabualruz/fulcrum`.
  - **opencode layer-3 design: state-conditional rider**. `tool.execute.before` can only throw-to-block or mutate `output.args` (confirmed — no `additionalContext` non-blocking return exists). Layer-3 nudge becomes state-driven content in layer-2 (rider). Plugin reads `recall_turn_state`; if grep-without-recall in current session, next turn's rider via `experimental.chat.system.transform` + `session.idle` fallback includes the nudge sentence.
  - **Codex 14.2: document status-quo + print TUI path**. Confirmed no `codex plugin install` CLI command exists. Only interactive `codex /plugins` TUI browser. AD-10 Codex row updated. install.ts keeps piece-by-piece install; post-install prints `Fulcrum is installed for Codex. Run 'codex' then '/plugins' to verify/manage in the TUI.`
  - **PI peerDeps publish: cleared.** npm does not validate peerDep ownership; publishing `@fulcrum-agent-os/pi-cockpit` with `peerDependencies: "@mariozechner/pi-coding-agent": "*"` is allowed.

## Goal

Bring every CLI agent Fulcrum installs into (Claude Code, Codex CLI, Gemini CLI, opencode, PI, Copilot, Cursor, Windsurf) to **full feature-for-feature parity** — every agent's native extension surface is wired end-to-end, all 33 canonical skills reach every skill-capable agent with per-skill identity preserved, a layered **"Fulcrum-first / recall-before-file-search"** rule is wired at **every achievable interception point**, and **each agent's native plugin/extension distribution standard is the install path** (not manual file-copy where the agent offers a first-class plugin mechanism).

### Why this lands

User's stated goals (verbatim):
> "bias to use fulcrum 1st for memory operations, context operations, file search operations"
> "all cli agents have some kind of support for agents files and declaration that is not also done for all equally why we did fail in that area this big?"
> "skills are the how, rules are the what and when what do what"
> "as long as they can fully utilise fulcrum use as many layers and integration points as needed even if it is 9999 layers"
> "some cli agent's have standards for installing plugins and extentions ... did we check those and to make sure everything is starndardized for each target cli agent?"

Architectural split:
- **Skills = HOW.** The 33 existing canonical skills tell the agent HOW to perform a specific workflow. Preserve per-skill identity across every agent that supports model-invoked skill discovery OR equivalent. Never concat-without-markers. Never silently drop.
- **Rules = WHAT + WHEN.** "Prefer `recall_knowledge` / `search_code` before `Grep` / `Glob` / `Read`" is a rule. "On session start, call `start_agent_run`" is a rule. Rules fire at every achievable interception point.
- **Distribution = native plugin/extension mechanism where it exists.** Claude marketplace + plugin install; Codex plugin + marketplace; Gemini extensions CLI; opencode npm package; PI package (npm or local); rules-files for Copilot/Cursor/Windsurf (which don't have plugin standards).

Today the skill coverage is uneven, NO agent has Fulcrum-first rule text wired anywhere, AND four of the agents with native plugin mechanisms (Claude, Codex, opencode, PI) have Fulcrum packaging that's half-standardized — manifests exist, but the install paths bypass them.

### Tech stack

TypeScript ESM installer (`agent-integration/install.ts`), new `packages/agent-fanout/` transform package (per-agent emit + property tests + golden fixtures), SQLite-backed shared state for cross-process hook coordination, Bun runtime for opencode plugin, Node subprocess contract for the rest, npm publish for opencode + PI + (optionally) Fulcrum Claude marketplace. `vitest` tests across install smoke + per-agent rule-content lint + per-skill identity + end-to-end bias fixture.

New runtime deps: `yaml`, `@iarna/toml` (both likely transitive already; verify via `find-docs`). New dev deps: `np` (`npm publish` helper) OR existing `pnpm publish --filter` — decide at PR 14.

### Non-goals (deferred to v4+)

- Changing the MCP tool surface (32 tools stays at 32).
- Adding new roles beyond the existing 24.
- Rewriting PI cockpit UI internals — only where parity requires.
- Cross-agent shared sessions, cloud sync.
- New LLM / embedding models.
- Publishing a Fulcrum *web* marketplace (any third-party discovery URL beyond npm is future work).

---

## Audit — current state per agent per surface (v3)

Severity codes: **H** = hard (blocks a stated goal), **S** = soft (wasted leverage), **C** = cosmetic.

**Important premise correction (from v2, carried forward):** `agent-integration/pi/cockpit/skills/` and `agent-integration/copilot/.agents/skills/` are **already symlinks** to the canonical `agent-integration/skills/` (verified 2026-04-19 via `ls -la`). They were converted 2026-04-17 per `docs/plans/2026-04-16-memory-v2a-plan.md` §602–604. Skill drift is NOT pending.

| Agent | Hooks / interception | Skills | Sub-agents / roles | Commands | Rules (WHAT+WHEN) | MCP | Distribution path (v3 focus) | Installer |
|---|---|---|---|---|---|---|---|---|
| **Claude Code** | 5/9 events. Missing: **UserPromptSubmit, SubagentStop, SessionEnd, Notification**. **H** | 33/33 ✓ (canonical) | 24/24 ✓ | 4 slash commands | CLAUDE.md marker block — ZERO Fulcrum-first content. **H** | user-scope ✓ | **`.claude-plugin/plugin.json` exists ✓; NO `.claude-plugin/marketplace.json`; install uses manual `claude mcp add` + direct `~/.claude/settings.json` edit, NOT `/plugin install fulcrum@<mp>`. H** | `installClaude` ✓ (manual) |
| **Codex CLI** | 4/5 events wired. Missing: **UserPromptSubmit**. **H** (Codex hooks Bash-only platform limit) | 6/33. **H** | ✗ platform N/A | ✗ no user slash | AGENTS.md ✓ — ZERO Fulcrum-first content. **H** | `[mcp_servers.fulcrum]` ✓ | **`.codex-plugin/plugin.json` ✓ + `marketplace.json` ✓. Install registers in user marketplace (`~/.agents/plugins/marketplace.json`) BUT installs pieces manually (config.toml MCP block, hooks, skills), NOT via a plugin-install command. S** (research-owed: does Codex even have a `codex plugin install` command? PR 14 confirms.) | `installCodex` ✓ (marketplace registered + pieces installed) |
| **Gemini CLI** | 6/11 events. Missing: BeforeAgent, BeforeToolSelection, Notification, AfterModel-content. **H** | 6/33. **H** | 2/24. **H** | 6 TOML slash commands ✓ | GEMINI.md ✓ — ZERO Fulcrum-first content. `policies/` unused. **H** | `mcpServers` in ext manifest ✓ | **`gemini-extension.json` present; installed to `~/.gemini/extensions/fulcrum/` via standard path. `gemini extensions update fulcrum` flow untested by Fulcrum CI.** ✓ (standardized; PR 14 verifies) | `installGeminiExtension` ✓ (native) |
| **opencode** | Plugin wires 6 event classes + 10 custom tools. Most-complete interception today. `experimental.chat.system.transform` needs fallback. **S** | ✗ 0/33. **H** | ✗ 0 role MDs. **H** | 5 MD slash commands ✓ | `opencode.md` skip-if-exists. **H** | `opencode.jsonc` mcp block ✓ | **`package.json` names `fulcrum-opencode-plugin@0.0.1` — NEVER PUBLISHED to npm. `opencode.jsonc` references local path `./plugins/fulcrum.ts`. Users must clone the repo. `opencode plugins update` flow unusable. H** | `installOpencode` ✓ (local path only) |
| **PI cockpit** | ~1 of ~20 events bound (`session_start` only). **H** | 33/33 ✓ (symlink) | Roles implicit via MCP `--profile`. **H** (no role-switching UX) | Cockpit native ✓ | PI.md ✓ — ZERO Fulcrum-first content. **H** | Tools native ✓ | **`package.json` has `"pi"` key + `peerDependencies` + `publishConfig.access: public` — NEVER PUBLISHED to npm. Installed via `pi install <local-path>`. `pi update` flow unusable. H** | `installPiCockpit` ✓ (local path only) |
| **Copilot** | ✗ no hooks (platform N/A) | 33 source skills exist in dead `.agents/skills/`; Copilot surface actually needs per-skill `.github/instructions/<skill>.instructions.md`. **H** | ✗ platform N/A | ✗ platform N/A | `.github/copilot-instructions.md` source, NO installer. **H** | `.vscode/mcp.json` source, NO installer. **H** | **No plugin/marketplace standard in Copilot — rule files + `.vscode/mcp.json` IS the standard. v3 plan PRs 10 wires it correctly.** ✓ (by design, once PR 10 lands) | ✗ no `installCopilot()` |
| **Cursor** | ✗ no hooks | Via `.cursor/rules/<skill>.mdc`. 0 skills today. **H** | ✗ platform N/A | `/create-rule` built-in; no custom slash | `.cursor/rules/fulcrum.mdc` thin. **H** | `.cursor/mcp.json` source ✓ | **No plugin standard in Cursor — rule files IS the standard.** ✓ (by design) | `installCursor` per-project ✓ — EXPAND |
| **Windsurf** | ✗ no hooks | Via `.windsurf/rules/<skill>.md`. 0 skills today. **H** | ✗ platform N/A | `/workflow-name` native — not wired by Fulcrum. **S** | `.windsurf/rules/fulcrum.mdc` minimal; global `~/.codeium/windsurf/memories/global_rules.md` untouched. **H** | Not yet wired. **H** | **No plugin standard in Windsurf — rule files IS the standard.** ✓ (by design, once PR 12 lands) | ✗ no `installWindsurf()` |

**Universal gaps (applied to ALL 8):**
- **No agent has Fulcrum-first rule text anywhere.** **H — #1 user ask.**
- **No agent wires the rule at every achievable interception point.** **H — #2 user ask.**
- **No explicit skills=HOW / rules=WHAT+WHEN split in the emitted artifacts.** **H — #3 user framing.**
- **Four agents (Claude / Codex / opencode / PI) have native plugin/extension standards Fulcrum only half-uses.** **H — #4 user ask (v3 addition).**

---

## Skill Utilization Matrix

### Cross-cutting (every PR, every unit)

| Skill | Role |
|---|---|
| `agent-skills:incremental-implementation` | Thin vertical slices; per-PR diff budget ~500 LOC (soft); no unit lands without its Verify gate. |
| `agent-skills:test-driven-development` | Per-agent install-smoke + per-rule lint + per-skill identity test first. |
| `agent-skills:context-engineering` | Load only files the PR touches. |
| `agent-skills:code-review-and-quality` | 5-axis self-review pre-merge. |
| `compound-engineering:ce-review` | Persona-tiered review pre-merge on every PR ≥50 LOC. |
| `agent-skills:git-workflow-and-versioning` + `compound-engineering:git-commit` | Atomic commits. |
| `compound-engineering:ce-pr-description` | Value-first PR descriptions. |
| `andrej-karpathy-skills:karpathy-guidelines` | Surgical; no speculative abstractions. |
| `agent-skills:source-driven-development` + `find-docs` | **MANDATORY** on every per-agent change. |
| `episodic-memory:remembering-conversations` | Session start + any judgment call with precedent. |

### Per-PR load-bearing skills

#### PR 0 — Reference docs + plan v3 + approval gate

- `agent-skills:spec-driven-development`
- `compound-engineering:document-review` (adversarial + coherence + feasibility + scope-guardian + security-lens; v3 re-pass on the plan)
- `agent-skills:documentation-and-adrs` — ADR per AD-* entry (now 10).
- `elements-of-style:writing-clearly-and-concisely`

#### PR 1 — `packages/agent-fanout` + canonical source extension

- `agent-skills:api-and-interface-design`
- `compound-engineering:research:repo-research-analyst` — verify symlinks intact.
- `find-docs` on `yaml` / `gray-matter` / `@iarna/toml`.
- `compound-engineering:review:api-contract-reviewer` pre-merge.

#### PR 2 — Canonical rules: Fulcrum-first + lifecycle + role-boundaries

- `codex:gpt-5-4-prompting` — load-bearing for the rule text.
- `elements-of-style:writing-clearly-and-concisely`.
- `compound-engineering:review:project-standards-reviewer`.

#### PR 3 — Cross-agent soft hook gate + `recall_turn_state` SQLite

- `agent-skills:api-and-interface-design` — migration 108 schema.
- `compound-engineering:review:data-integrity-guardian` pre-merge.
- `compound-engineering:review:schema-drift-detector` pre-merge.
- `agent-skills:security-and-hardening` — session_id trust boundary.
- `compound-engineering:agent-native-architecture`.

#### PR 4 — opencode plugin: layer coverage + integrity + fallback

- `agent-skills:performance-optimization`.
- `compound-engineering:review:julik-frontend-races-reviewer`.
- `agent-skills:security-and-hardening` — SHA-256 integrity.
- `find-docs` on `@opencode-ai/plugin`.
- `compound-engineering:review:reliability-reviewer`.

#### PR 5 — Claude Code hook parity (UserPromptSubmit + SessionEnd + Notification + SubagentStop)

- `agent-skills:api-and-interface-design`.
- `agent-skills:source-driven-development` + `find-docs` on Claude hooks.md.
- `compound-engineering:review:reliability-reviewer`.

#### PR 6 — Codex UserPromptSubmit + rider content

- `agent-skills:source-driven-development` on Codex hooks.
- `compound-engineering:review:reliability-reviewer`.

#### PR 7 — Gemini 11-event coverage + policies + 24 sub-agent MDs

- `agent-skills:api-and-interface-design`.
- `find-docs` — re-fetch `docs/hooks/reference.md` (v1 research-owed).
- `compound-engineering:review:reliability-reviewer` — hook volume budget.

#### PR 8 — PI cockpit: every event + role-switching UX

- `compound-engineering:agent-native-architecture`.
- `agent-skills:source-driven-development` — verify every PI event against local `node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`.
- `agent-skills:api-and-interface-design`.

#### PR 9 — opencode native skills: 33 hidden subagent MDs

- `codex:gpt-5-4-prompting` — per-skill description text.
- `compound-engineering:agent-native-architecture`.
- `compound-engineering:review:api-contract-reviewer`.

#### PR 10 — Copilot installer + per-skill instructions + public-repo guard

- `agent-skills:api-and-interface-design`.
- `agent-skills:security-and-hardening` — public-repo detection + sanitized variant.
- `compound-engineering:review:correctness-reviewer`.

#### PR 11 — Cursor installer expansion + 33 MDC + core rule

- `agent-skills:api-and-interface-design`.
- `codex:gpt-5-4-prompting` — per-skill descriptions (Cursor Apply-Intelligently relies on description-match).

#### PR 12 — Windsurf installer + 33 rules + workflows + global opt-in

- `agent-skills:api-and-interface-design`.
- `agent-skills:security-and-hardening` — global opt-in guard.
- `compound-engineering:review:correctness-reviewer` — 12k hard-error lint.

#### PR 13 — `fulcrum install apply` CLI + verify + cleanup + demo reel

- `agent-skills:shipping-and-launch`.
- `compound-engineering:ce-demo-reel`.
- `agent-skills:code-simplification` + `compound-engineering:code-simplify`.
- `compound-engineering:onboarding`.

#### PR 14 — Plugin-standard packaging parity (v3 addition)

- `agent-skills:api-and-interface-design` — dual-mode installer contract (native plugin vs manual fallback) across 4 agents.
- `agent-skills:source-driven-development` + `find-docs` — **LOAD-BEARING.** Each plugin-capable agent's install command contract MUST be re-fetched against current CLI version before wiring. Specifically: Claude `/plugin install` flow, Codex `codex plugin install` existence (research-owed), opencode `opencode plugins update` semantics, PI `pi install npm:*` + `pi update` semantics, Gemini `gemini extensions update`.
- `agent-skills:shipping-and-launch` — npm publishes are production-visible releases. Pre-publish checklist + rollback plan.
- `agent-skills:security-and-hardening` — published packages expose Fulcrum content publicly; secret-scan re-applied at publish time; `.npmignore` audit.
- `compound-engineering:review:api-contract-reviewer` — the dual-mode installer signature is a public contract.
- `compound-engineering:review:deployment-verification-agent` — npm publishes + Claude marketplace registration are deployment events; Go/No-Go checklist required.
- `compound-engineering:ce-demo-reel` — capture a GIF of `/plugin install fulcrum@fulcrum-local` on Claude Code + `pi install npm:@fulcrum-agent-os/pi-cockpit` for the PR body.

### Subagent delegation (cross-PR)

| Work | Subagent | When |
|---|---|---|
| Plan v3 re-review (adversarial + coherence + feasibility + scope-guardian + security-lens) | `compound-engineering:document-review:*` | PR 0 (v3 gate) |
| Per-agent doc re-fetch | `compound-engineering:research:framework-docs-researcher` | PR 3, 4, 7, 10-12, **14** |
| Plugin-ecosystem research (marketplace hosting, npm scope conventions) | `compound-engineering:research:best-practices-researcher` | PR 14 pre-implementation |
| Install smoke | `agent-skills:test-engineer` | PR 1, 10-14 |
| Pre-merge persona review | `compound-engineering:ce-review` | every PR ≥50 LOC |
| Codex rescue | `codex:rescue` | any PR after one failed attempt |
| Security audit | `agent-skills:security-auditor` | PR 3, 4, 10-12, **14** (npm publish paths are a new attack surface) |

---

## Architecture Decisions

### AD-1 — Canonical source EXISTS; fan-out library extends to 5 new emission shapes

Canonical source is `agent-integration/skills/`. `agent-integration/pi/cockpit/skills/` and `agent-integration/copilot/.agents/skills/` are already symlinks (2026-04-17). PR 1 introduces `packages/agent-fanout/` for 5 new emission shapes (opencode hidden-subagents, Copilot path-scoped instructions, Cursor per-skill MDC, Windsurf per-skill MD, Gemini TOML commands). Claude/Codex/Gemini/PI/opencode existing targets continue consuming the canonical source (directly, via symlink, or via fanout identity transform).

Per-agent emit modules (`packages/agent-fanout/src/emit/{claude,codex,gemini,opencode,pi,copilot,cursor,windsurf}.ts`) — see v2 plan for full per-agent emit shapes (carried forward unchanged).

### AD-2 — Wire every achievable interception point per agent

Layers table per agent (unchanged from v2):

| Agent | Layers | Key surfaces |
|---|---:|---|
| Claude Code | 7 | project CLAUDE.md init + user CLAUDE.md + skills + sub-agent MD prologues + UserPromptSubmit hook + PreToolUse hook + SessionStart hook |
| Codex | 5 | AGENTS.md + skills (6→33) + SessionStart hook + UserPromptSubmit hook + PreToolUse (Bash-only) |
| Gemini | 9 | GEMINI.md + skills (6→33) + policies/ + sub-agents (2→24) + SessionStart + BeforeAgent + BeforeModel + BeforeToolSelection + BeforeTool |
| opencode | 9 | plugin RIDER + chat.system.transform (state-adaptive: includes Fulcrum-first nudge when `recall_turn_state` shows grep-without-recall) + session.idle fallback + shell.env + tool.execute.before (policy gate; NOT a separate nudge layer per v3.1 OQ #2) + tool.execute.after (telemetry) + permission.ask + session.compacted + role agent MDs + 33 hidden-subagent skill MDs. **Note:** v3.1 collapsed "layer-3 post-tool nudge" into state-driven content on layer-2 rider — opencode's defense is deep but has a structural gap at tool-call-time for the recall nudge specifically (next-turn rider is the mechanism). |
| PI cockpit | 12+ | PI.md + skills + session_start + before_agent_start + before_provider_request + context event + tool_call + tool_result + model_select + session_before_compact + agent_end + role-switcher slash command |
| Copilot | 3 | copilot-instructions.md + 33 per-skill instructions + core instructions file |
| Cursor | 3 | fulcrum-core.mdc (alwaysApply: true) + 33 per-skill MDC (alwaysApply: false) + AGENTS.md |
| Windsurf | 5 | fulcrum-core.md (trigger: always_on) + 33 per-skill MD (trigger: model_decision) + AGENTS.md + workflows for user-invocable skills + optional global opt-in |

### AD-3 — opencode `experimental.*` redundancy + integrity chain (v3.3 revised 2026-04-20 per PR 4 c5)

**Primary**: `experimental.chat.system.transform` injects rider per LLM call via `output.system[]` mutation (signature per `@opencode-ai/plugin` ≥1.14 — takes `(input, output) => Promise<void>` and mutates `output.system: string[]`).

**Fallback (belt-and-suspenders redundancy, Option 2 chosen 2026-04-20)**: `experimental.chat.messages.transform` registers alongside primary and prepends the rider as a synthetic `TextPart` on the first existing user message when the plugin-closure counter `experimentalFiredCount === 0` at fallback-invocation time. Both hooks fire per LLM call; ordering is unguaranteed, so whichever lands first wins and the other skips (no duplicate rider content in the prompt).

**Why not `event` on `session.idle`**: the earlier v3 wording specified "append rider to next user message via `additionalContext`." Re-verification against `@opencode-ai/plugin@1.14.18` types 2026-04-20 (PR 4 c5) confirmed the `event` hook signature is `(input: { event }) => Promise<void>` — observable-only, no `additionalContext` return, no mechanism for a plugin to inject context after a session has gone idle. AD-3 v3.3 corrects this: session.idle keeps its telemetry role (`opencode_rider_never_injected` graph event for operator visibility) but is NOT a runtime re-injection path. Real redundancy lives at the messages.transform hook which can mutate model-visible content.

**Integrity**: `OPENCODE_SYSTEM_RIDER` constant (the concatenated canonical rules loaded by `rider.ts::loadRider`) + `.ridersum` SHA-256 companion written at install time by `packages/agent-fanout::writeRidersum` (PR 4 c1). Plugin fail-open on mismatch: log warning via `console.warn`, continue with best-effort rider.

**Second ground truth**: `opencode.md` flips to overwrite-with-marker (shipped PR 4 `d3b62e7`) as an operator-visible artifact readable without a live plugin runtime.

### AD-4 — Gemini hook volume: serialize lifecycle; parallelize tool hooks; per-event budget

Worst-case 10-turn 100-tool-call burst: 280 invocations/turn × 10 = 2800/session. p95 per-hook budget **< 20ms** (tightened from v1's 25ms). Lifecycle events use a fast-path (no SQLite); tool events hit `recall_turn_state` via WAL + prepared statements.

### AD-5 — SQLite `recall_turn_state` for cross-process hook coordination

Migration `108_recall_turn_state`:
```sql
CREATE TABLE IF NOT EXISTS recall_turn_state (
  session_id    TEXT NOT NULL,
  turn_id       TEXT,
  agent_type    TEXT NOT NULL,
  last_recall_at TEXT,
  grep_count_without_recall INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (session_id, turn_id, agent_type)
);
CREATE INDEX idx_recall_turn_state_session ON recall_turn_state(session_id);
```
Hook subprocesses (Claude / Codex / Gemini) and the opencode Bun plugin share via SQLite. session_id validated against `agent_runs.run_id` before any read/write.

### AD-6 — Per-skill identity preservation HARD constraint

Property test enforces: each canonical skill produces exactly one attributable emit per agent. Skills-as-concatenated-blob with per-skill markers is the fallback IF absolutely needed; v3 plan does NOT use concat for any agent (opencode uses hidden-subagent MDs; Copilot uses path-scoped instruction files).

### AD-7 — Skills = HOW, Rules = WHAT+WHEN (architectural constraint)

Canonical source adds `agent-integration/rules/<name>.md` sibling to `skills/`. First rule: `agent-integration/rules/fulcrum-first.md`. Per-agent emit maps skills → description-match surfaces, rules → always-on / rider surfaces.

### AD-8 — Copilot public-repo guard + sanitized variant

`installCopilot()` detects public repos via `gh repo view --json isPrivate` (if `gh` CLI available) or GitHub API probe or conservative "assume public unless `--known-private`." Default: sanitized variant (MCP tool names elided, role taxonomy summarized). `--allow-public-content` bypasses. `.fulcrum-install.json` records the choice for idempotency.

### AD-9 — Security constraints per security-lens persona

- AD-9a: `OPENCODE_SYSTEM_RIDER` + `.ridersum` integrity chain.
- AD-9b: `session_id` validation against `agent_runs` before state writes.
- AD-9c: Windsurf `--global` opt-in + confirm.
- AD-9d: Hook stderr sanitized; full trace to `${globalDataDir()}/logs/hook-<agent>-<ts>.log`.
- AD-9e: Secret-scan at `packages/agent-fanout/parse.ts` time (`sk-`, `ghp_`, `xox[bpas]-`, AWS `AKIA*`, Bearer tokens).

### AD-11 — Passive-injection as alternative bias mechanism (v3.3 addition)

**Decision**: the v3 bias mechanism (rule text + advisory PreToolUse hook that emits a nudge but does not reroute) is **one of two candidate architectures**. The alternative, evaluated during PR 3 measurement spike, is passive-injection: a PreToolUse hook on Grep/Read/Glob runs `recall_knowledge` silently with the tool's query, prepends the top-K results to the tool output the model sees, and lets the tool proceed. The model does not choose whether to recall; recall happens.

**Rationale**: Cursor Memory, Continue's context engine, Cody remote embeddings all work this way. The production pattern for agentic "retrieve-before-search" is passive injection, not instructed preference. Research (2026-04-20) found no published compliance rate for soft tool-preference rules in coding agents; shipping 12 PRs of fanout on an unfalsified premise is a bet. Passive-injection converts the bet into a mechanical guarantee.

**Tradeoffs**:
| Dimension | Variant A (rule + advisory hook) | Variant B (passive-injection) |
|---|---|---|
| Mechanism | Model chooses recall vs grep; rule nudges | Hook calls recall; model reads prepended output |
| Reliability | Probabilistic (depends on model instruction-following) | Deterministic (always runs) |
| Hook p95 budget | <20ms (hook just checks state) | <50ms (hook runs recall; SQLite + vector) |
| Agent coverage | All 8 agents (rule text works everywhere) | Hook-capable agents only (Claude, opencode, Gemini, PI, Codex Bash-only); rules-only agents (Copilot, Cursor, Windsurf) fall back to Variant A |
| Failure mode | Recall ignored; model greps | Recall query mismatched to tool query; wasted latency; noise in tool output |
| Composes with skills=HOW / rules=WHAT+WHEN | ✓ (rule is canonical) | Partial (hook is mechanical; rule text still carries the invariant) |

**Evaluation during PR 3 spike**: ship both variants on Claude Code behind a feature flag. Measure recall_knowledge call-rate + grep-without-recall rate + user-perceived latency. Pick the winner for PRs 4-12 fanout. If neither wins the 20pp gate, the bias mechanism is not load-bearing and PRs 4-12 drop the rule-fanout work (ship skill/role parity only).

---

### AD-10 — Plugin-native install path is the default; manual install is fallback (v3 addition) — **IN SCOPE (v3.3 revised 2026-04-20)**

**v3.3 revision (2026-04-20)**: AD-10 is in scope in its entirety. Earlier "deferred to v4" framing was over-scoped and has been withdrawn per user directive. Every per-agent dual-mode row below ships in v3.3 via PR 14 units 14.0–14.10.

---

**Decision:** For every agent whose ecosystem has a first-class plugin/extension install command, Fulcrum's installer USES that command as the default install path. The manual (file-copy + config edit) path stays, but behind a `--manual` flag or as automatic fallback when the native command is unavailable (old CLI version, command changed name, etc.).

Per-agent install-path matrix:

| Agent | Native install command | Current Fulcrum install mode | Target install mode (post-PR 14) |
|---|---|---|---|
| Claude Code | `/plugin marketplace add <path-or-url>` + `/plugin install fulcrum@<mp>` | Manual (`claude mcp add` + direct `settings.json` edit + manual skill copy) | **Dual-mode.** Default: native plugin path with **GitHub-root marketplace at `.claude-plugin/marketplace.json` at `moabualruz/fulcrum`**; users run `/plugin marketplace add moabualruz/fulcrum` then `/plugin install fulcrum@fulcrum`. Fallback: existing manual path via `--manual`. |
| Codex CLI | **`codex plugin marketplace {add\|upgrade\|remove}` CLI shipped** (re-verified 2026-04-20 against `codex-rs/cli/src/marketplace_cmd.rs` — was "TUI-only" in 2026-04-19 ref; that was stale). Per-plugin install/uninstall still TUI-gated. Marketplace reads `.claude-plugin/marketplace.json` OR `.agents/plugins/marketplace.json` (Claude-compat — **shares marketplace file with Claude**). | Marketplace entry registered ✓; install does manual piece-by-piece | **Dual-mode (revised).** Default: `codex plugin marketplace add moabualruz/fulcrum` + post-install TUI hint. Fallback: manual piece-by-piece (config.toml + skills + AGENTS.md). **Shared marketplace file**: one `.claude-plugin/marketplace.json` at repo root serves both Claude (PR 14.1) and Codex (PR 14.2), with per-agent `plugins[]` entries. |
| Gemini CLI | Auto-load from `~/.gemini/extensions/<name>/`; updates via `gemini extensions update <name>` | Standard (copy extension dir) | **Standard confirmed + update flow wired.** Installer prints the `gemini extensions update fulcrum` command for user-triggered updates. |
| opencode | `opencode.jsonc` `"plugin": ["@scope/pkg" | "./path"]`; resolved via Bun | Manual local path (`./plugins/fulcrum.ts`) plus auto/native installer support | **Dual-mode.** Publish **`@fulcrum-agent-os/opencode-plugin`** to npm. Installer supports `auto`, `native`, and `manual`; auto defaults to npm when resolvable and manual local-path when not. |
| PI cockpit | `pi install npm:<pkg>` / `pi install git:<url>` / `pi install <local-path>`; updates via `pi update` | Local-path (`pi install ./agent-integration/pi/cockpit`) | **Dual-mode.** Publish **`@fulcrum-agent-os/pi-cockpit`** to npm. Installer offers npm / git / local; defaults to npm if resolvable. peerDeps on `@mariozechner/pi-*` published without issue (v3.1 npm semantics confirmed). |
| Copilot / Cursor / Windsurf | N/A — no plugin standards; rule files ARE the standard | Rule-files (once PRs 10/11/12 land) | **No change needed.** Plan's rules-file install IS the native standard. AD-10 does not apply. |

**Why:**
- End-user ergonomics: `gh repo clone` + `pnpm setup` is dogfood-friendly but not end-user-friendly. `/plugin install fulcrum@fulcrum-marketplace` (Claude) or `pi install npm:@fulcrum-agent-os/pi-cockpit` (PI) are the commands real users expect.
- Update channel: native install paths carry an `update` path. Manual install = manual updates forever.
- Discoverability: marketplaces + npm are where users look for third-party agent tooling.
- Plugin isolation: some CLIs (Claude) treat plugins as a boundary (tool allow-lists, hooks scoped to plugin). Using the plugin path = we get that isolation for free.

**Dual-mode signature:** Every applicable installer function grows an optional `mode: "native" | "manual" | "auto"` parameter (defaults to `"auto"` — prefer native when available, fall back to manual). Operator knobs use the shipped mode names, e.g. `FULCRUM_CLAUDE_INSTALL_MODE=native|manual` and `FULCRUM_OPENCODE_INSTALL_MODE=auto|native|manual`; PI keeps its package/source-specific `auto|npm|git|local` plan.

**What v3 does NOT require:** publishing a Fulcrum web marketplace (third-party discovery URL). PR 14 ships a **GitHub-repo-root marketplace** at `.claude-plugin/marketplace.json` on `moabualruz/fulcrum`; users register via `/plugin marketplace add moabualruz/fulcrum` (v3.1 resolution of Open Question #11). Public marketplace hosting at a dedicated domain (e.g. `fulcrum-agent-os.dev/marketplace.json`) stays future work.

---

## Per-agent completeness gate (v3.3 — added after the opencode overclaim of 2026-04-20)

**Hard gate before any PR may be flipped to `completed`**: `docs/reference/2026-04-20-integration-completeness-checklist.md` is the authoritative per-agent coverage grid. Every PR that touches an agent surface MUST run this verifier:

```
grep -c '⬜' docs/reference/2026-04-20-integration-completeness-checklist.md
# remaining-work count across all agents
```

For the specific agent the PR touches, every ⬜ row in that agent's section must either flip to ✅ (with the row's `Verify:` command returning success) or be explicitly marked 🔒 (deferred to v4 with a reason). A PR claiming "complete" while ⬜ rows remain for its target agent is an **auditable defect** — see `docs/plans/2026-04-19-004-agent-parity-progress.md` §"PR 4 STATUS CORRECTION" (2026-04-20) for the canonical example of the failure mode.

The resume prompt at `docs/plans/2026-04-19-004-agent-parity-prompt.md` enforces this gate at Step 3.1 (PR-level close).

---

## Critical Constraints (carry forward, verbatim)

1. **Global-only data stays.** No project-local DB / vault / sessions writes beyond install artifacts.
2. **Never commit docs/ alongside code.** Two commits per PR: implementation + docs/ledger.
3. **Fulcrum-first bias NEVER blocks a tool.** Nudges only. `FULCRUM_NO_RECALL_NUDGE=1` opt-out.
4. **Install idempotency.** Every installer runs twice with no change.
5. **No destructive overwrites.** Marker-fenced blocks preserve user content outside.
6. **Agent-native parity.** Every user action has an MCP / CLI equivalent.
7. **Per-agent docs re-fetched before emission contract locks in.** Stale training data.
8. **Canonical source is one path per artifact type.** Skills: `agent-integration/skills/`. Rules: `agent-integration/rules/`.
9. **Hook volume budget:** < 3000 invocations/session; p95 < 20ms.
10. **Sequencing discipline.** No PR compression.
11. **Dry-run parity.**
12. **Never commit WIP without explicit "commit".**
13. **Skills = HOW; Rules = WHAT+WHEN.** Per-artifact identity preserved across every emit target.
14. **`session_id` from hook stdin is untrusted.** Validate against `agent_runs.run_id`.
15. **Copilot public-repo guard + sanitized variant default.** Full variant requires `--allow-public-content`.
16. **`OPENCODE_SYSTEM_RIDER` ships with SHA-256 companion.** Fail-open on mismatch.
17. **Windsurf global rule install opt-in.** `--global` + confirm.
18. **Hook stderr sanitized.** No leaks.
19. **Plugin-native install is the default where supported** (v3 addition). Agents with native plugin/extension install commands — Claude (plugin marketplace), Gemini (extensions CLI), opencode (npm plugin), PI (npm package), and Codex (if `codex plugin install` exists) — MUST route through that command by default. Manual install remains as `--manual` fallback. The version / integrity of the published / registered plugin MUST match the canonical source that shipped it (PR 14 unit 14.7 adds a CI gate that fails if the npm-published package diverges from the repo's source of truth for that release tag).
20. **Published-package surface is the same as repo source. Post-pack tarball scan, not source-only.** (Enforces #19.) No secret branches, no "real source stays private, npm gets a stub" pattern. `packages/agent-fanout` parse-time secret scan covers SOURCE (AD-9e); **PR 14.9 scans the actual tarball produced by `npm pack`** (`tar -tf` + content scan) to catch secrets inlined at build time (bundled env vars, sourcemaps, minification artifacts) that source-file scan would miss.

21. **npm publish hygiene (v3.2 addition — security-lens finding #1).** For every `@fulcrum-agent-os/*` package publish:
    - `@fulcrum-agent-os` npm org enforces 2FA for all members.
    - Publish uses an **org-scoped, package-specific, publish-only token** (not a developer personal token; not a delete-capable token). Stored as a GitHub Actions secret; rotated on every org-membership change.
    - The **only** publish path is `.github/workflows/publish-*.yml` triggered by a signed release tag. Developer CLI publish (`npm publish` from a laptop) is prohibited by org policy.
    - Release tags are **signed** (`git tag -s` with a GPG key committed to the npm org / referenced in `SECURITY.md`). CI verifies signature before publish.
    - Publish workflow runs the PR 14.9 post-pack tarball scan as a required gate.

22. **Marketplace-backing repo posture (v3.2 addition — security-lens finding #2).** Any GitHub repo that backs a Fulcrum marketplace (today: `moabualruz/fulcrum` for Claude Code; future: dedicated plugin repos) MUST:
    - Enforce branch protection on `main` (required reviews ≥1, no force-push, no admin bypass).
    - Require **signed commits** on `main`.
    - Limit org/user membership to vetted identities with 2FA.
    - Document the security posture in `SECURITY.md` at repo root so users registering `/plugin marketplace add moabualruz/fulcrum` can audit the trust chain.
    - Claude's `source:` field scoping is documented — Fulcrum's marketplace entry scopes to `./agent-integration/claude` specifically; users' plugin caches should reflect only that subtree (verify at PR 14.1 via install smoke).

---

## Phased Rollout (PRs)

Every PR ends with CI-green tests + a one-line migration note in `CHANGELOG.md`. **~500 diff lines per PR (soft target).**

### PR 0 — Reference docs + plan v3 + approval gate

- 0.1 Plan v3 committed.
- 0.2 Per-agent reference docs (8 files; already drafted + need one sweep for v3 AD-10 mentions).
- 0.3 Progress ledger updated for v3.
- 0.4 Resume prompt updated for 14 PRs.
- 0.5 Document-review persona re-pass on v3.

**Verify:** all files at expected paths + user explicit v3 approval.

### PR 1 — `packages/agent-fanout` + canonical source extension

Units as per v2 (14 units). Symlinks at pi/cockpit + copilot preserved (not dismantled).

### PR 2 — Canonical rules: Fulcrum-first + lifecycle + role-boundaries

6 units; creates `agent-integration/rules/` dir with 3 canonical rules; per-agent emit tests.

### PR 3 — Cross-agent soft hook gate + `recall_turn_state` SQLite — **MEASUREMENT SPIKE (v3.3 rescoped)**

**v3.3 reshape**: this PR is now a **1-agent empirical gate**, not a 3-agent fanout. Ship for Claude Code only. Measure `recall_knowledge` call-rate vs `Grep`/`Read`/`Glob` call-rate across 2 weeks of real use, with and without the rule + hook wired. **Gate for PRs 4-12**: ≥20pp delta in recall-first behavior (per plan's own Risk-table threshold). A/B the two mechanisms:
- **Variant A** (the v3.2 plan): rule text in CLAUDE.md + PreToolUse hook emits a nudge when grep-without-recall detected (advisory, does not reroute).
- **Variant B** (new — AD-11 passive-injection): PreToolUse hook on Grep/Read/Glob runs `recall_knowledge` silently with the tool query + prepends results to the tool output the model sees. Model does not choose; retrieval happens.

Pick the winning mechanism for PRs 4-12. If neither variant moves recall-first behavior ≥20pp, **abandon the bias plan** and ship only the skill/role parity work (still valuable; bias was the load-bearing premise for hooks across all 8 agents).

Units (v3.3 provisional): 3.1 migration 108 schema + tests; 3.2 Claude UserPromptSubmit hook + `recall_turn_state` state write; 3.3 Claude PreToolUse hook variant A (advisory rule); 3.4 Claude PreToolUse hook variant B (passive-injection); 3.5 instrumentation telemetry (recall vs grep call-rate per session, logged to `${globalDataDir()}/telemetry/recall_bias.jsonl`); 3.6 measurement harness + 2-week gate test; 3.7 session_id forgery test (AD-9b); 3.8 load test p95 <20ms; 3.9 variant decision writeup in progress ledger.

Gemini + opencode hook wiring moves to PR 4 (opencode) + PR 7 (Gemini), gated on the spike outcome.

### PR 4 — opencode plugin layer coverage + integrity + fallback + **npm publish (v3.3 absorbed from PR 14.3)**

8 units; `OPENCODE_SYSTEM_RIDER` + `.ridersum`; `event` on `session.idle` fallback; opencode.md flip; 33 hidden subagent stubs (populated in PR 9). **v3.3 addition**: unit 4.8 publishes `@fulcrum-agent-os/opencode-plugin` to npm — canonical opencode plugin distribution path per research (npm scoped packages, auto-installed to `~/.cache/opencode/node_modules/` by Bun, existing community examples `@ranger-testing/opencode-plugin`, `@noodlbox/opencode-plugin`, `oh-my-opencode`). Current shipped modes are `installOpencode({ mode: "auto" | "native" | "manual" })`: `auto` probes npm and falls back to manual local path, `native` requires npm, and `manual` uses `./plugins/fulcrum.ts`. Probe: `npm view @fulcrum-agent-os/opencode-plugin version 2>/dev/null` with 2s timeout. npm org `@fulcrum-agent-os` + 2FA + publish-only token posture (v3.2 Critical Constraints #21/#22) remains a pre-PR-4.8 operator step.

Gated on PR 3 measurement outcome: if Variant A (rule-only) wins, opencode rider includes rule text; if Variant B (passive-injection) wins, opencode `tool.execute.before` hook runs `recall_knowledge` silently + mutates `output.args` or throws-to-block-and-re-suggest.

### PR 5 — Claude Code hook parity (4 missing events)

7 units; UserPromptSubmit + SessionEnd + Notification + SubagentStop handlers; sub-agent MD prologue update embedding Fulcrum-first.

### PR 6 — Codex deep integration (v3.3 rescoped 2026-04-20 per user directive: "do this properly")

**Origin**: Codex extension-surface research 2026-04-20 against `openai/codex@1dc3535` (current `main`) + `codex-rs/` Rust source + 5 real-world plugin repos (`openai/codex-plugin-cc`, `remotion-dev/codex-plugin`, `schuettc/codex-reviewer`, `zeabur/agent-skills`, `basilisk-labs/codex-swarm`) surfaced 7 gaps between prior plan scope ("UserPromptSubmit + rider, 4 units") and what Codex now actually supports. User directive: expand PR 6 to cover all 7 gaps — Codex becomes a first-class target, not an afterthought.

**~8 units** (was: 4):

- **6.1 — `runCodexUserPromptSubmitHook`** — new phase handler mirroring runClaudeUserPromptSubmitHook. Returns `{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: "<canonical rider>"}}`. Canonical rider sourced from `agent-integration/rules/` via PR 2 fanout (not hand-authored per-agent). Wire as `fulcrum hook codex user-prompt-submit` phase; update `[[hooks]]` template in `agent-integration/codex/config.toml`.

- **6.2 — `runCodexPermissionRequestHook`** (NEW, per 2026-04-20 research — Codex added `PermissionRequest` event after prior ref doc was authored). Hook fires for ALL tool approvals including Write/Edit/MultiEdit (unlike PreToolUse/PostToolUse which remain Bash-only per `codex-rs/hooks/src/events/post_tool_use.rs` hard-coding). Returns `Allow` or `Deny{message}`. Becomes Codex's write-class interceptor — parity with Claude's PreToolUse write-path. Deny-wins fold; otherwise last-Allow wins.

- **6.3 — Hook handler types `prompt` + `agent`** — previously we used `command` handlers only. New dispatch modes shipped in `codex-rs/protocol/src/protocol.rs` `HookHandlerType` enum: `command | prompt | agent`. Wire Fulcrum's UserPromptSubmit as a `prompt` handler (injects directly to model) + SessionStart as a `command` handler (keeps telemetry path). `agent`-type dispatch evaluated but kept in scope only if the end-to-end dispatch path is stable (flagged as uncertain in research — verify at PR time).

- **6.4 — Skill fanout to Codex (6→33)** — matches PR 4 c2 opencode pattern. `installCodex()` invokes `parseCanonicalSource(...) + emitCodex(source)` (PR 1 fanout already emits 33 codex artifacts at `skills/fulcrum-<name>/SKILL.md`) and writes to `~/.codex/skills/` (or `.codex-plugin/skills/` if using the plugin-packaging route — see 6.7). Replaces the current 6 hand-authored skills under `agent-integration/codex/plugin/skills/` (which drift from canonical).

- **6.5 — Skill `openai.yaml` sidecars** — each canonical skill emits an optional sidecar at `skills/fulcrum-<name>/agents/openai.yaml` with:
  - `interface.{display_name, short_description, brand_color, default_prompt}` (derived from SKILL.md frontmatter + a Fulcrum brand-color constant)
  - `dependencies.tools[]` — declares the Fulcrum MCP tools each skill requires (read from skill body or explicit frontmatter `tools:` array)
  - `policy.allow_implicit_invocation: false` for write-memory / start-agent-run style skills (prevents auto-invoke without user/model intent); `true` for read-only recall skills.
  Schema per `codex-rs/core-skills/src/loader.rs`. Extend `packages/agent-fanout/src/emit/codex.ts` to emit sidecars alongside SKILL.md.

- **6.6 — Full `.codex-plugin/plugin.json` interface block** — current manifest ships `name` + minimal fields. Expand to production-quality per the 5 real-world examples: `name`, `version`, `description`, `skills: "./skills"`, `mcp_servers: "./mcp_servers.json"`, `interface.{displayName: "Fulcrum Agent OS", shortDescription, longDescription, developerName, category: "productivity", capabilities: ["task_management","memory","multi_agent_lifecycle","policy_hooks"], websiteURL, defaultPrompt, brandColor, composerIcon, logo, screenshots[]}`. Relative paths `./` prefixed per manifest schema. Schema verified against `codex-rs/core-plugins/src/manifest.rs`.

- **6.7 — Shared marketplace with Claude via `.claude-plugin/marketplace.json`** — per research, Codex's marketplace loader reads EITHER `.agents/plugins/marketplace.json` OR `.claude-plugin/marketplace.json` at the marketplace root (Claude-compat). PR 14.1 already ships `.claude-plugin/marketplace.json` at repo root for Claude. Extend that same file to list the Codex plugin alongside the Claude plugin; one marketplace serves both agents. Directive 2026-04-20: share the file — don't ship a separate `.agents/plugins/marketplace.json`. Update PR 14.1 approval checklist to note the dual-role file. Per-agent `plugins[]` entries in the marketplace differentiate by `source:` path.

- **6.8 — App-server JSON-RPC integration (stable surface only)** — use `config/mcpServer/reload` (stable) to hot-reload Fulcrum MCP config without requiring Codex restart when `~/.codex/config.toml` changes. Use `skills/list` (stable) for `fulcrum install verify --agent codex` skill-audit output. Explicitly DO NOT call `plugin/{list,read,install,uninstall}` — all marked "under development; do not call from production clients" in `codex-rs/app-server/README.md`. Continue deferring per-plugin install/uninstall to TUI until upstream stabilizes (tracked under PR 15–17 §Q2 upstream-issue list).

**Verify (PR-level)**:
- `grep -c 'runCodexUserPromptSubmitHook\|runCodexPermissionRequestHook' packages/cli/src/index.ts` ≥ 2
- `ls agent-integration/codex/plugin/skills/fulcrum-* | wc -l` ≥ 33 (was 6)
- `ls agent-integration/codex/plugin/skills/fulcrum-*/agents/openai.yaml` non-empty (sidecars present)
- `.codex-plugin/plugin.json` validates against `codex-rs/core-plugins/src/manifest.rs` schema
- Shared `.claude-plugin/marketplace.json` has both Claude + Codex plugin entries
- `codex plugin marketplace add moabualruz/fulcrum` then `codex` → `/plugins` shows Fulcrum (manual E2E verify)
- `config/mcpServer/reload` + `skills/list` app-server RPCs return expected shape on a smoke-test run

**Pre-merge skills**: `compound-engineering:review:api-contract-reviewer` (new exported hook phases + app-server RPC surface), `compound-engineering:review:correctness-reviewer`, `compound-engineering:review:reliability-reviewer`, `compound-engineering:review:security-reviewer` (PermissionRequest is a trust-boundary hook — can deny any tool), `compound-engineering:review:kieran-typescript-reviewer`, `agent-skills:code-reviewer` subagent, `codex:gpt-5-4-prompting` for rider-text composition.

**Research-owed at PR time**:
- Verify `HookHandlerType::Agent` end-to-end dispatch is stable (declared in protocol; research flagged as "scaffolding for future work, uncertain").
- Re-check `codex-rs/hooks/src/events/*.rs` for any new events since 2026-04-20 commit `1dc3535`.
- Re-verify app-server RPC stability markers in `codex-rs/app-server/README.md` before writing to them.

**Estimate**: 5 days (was 1 day for the previous 4-unit scope).

### PR 7 — Cross-agent integration correctness (Gemini + retroactive PR 4/5/6 fixes)

**Scope expanded 2026-04-20 following a second deep-research pass across all 8 target CLIs.** The original PR 7 shipped Gemini hook handlers + 24 agents + policies (7 units) but the research revealed the broader pattern that motivates the expansion: **every already-"done" PR (4 opencode, 5 Claude, 6 Codex) had at least one correctness bug that the completeness checklist missed because checklist rows were verified by grepping for the presence of a file/symbol, not by validating the file against the host CLI's documented contract**. The opencode `event` handler reads `input["type"]` when the SDK wraps it as `input.event.type` — all 3 event branches are silently dead. Claude subagent `tools` uses a `{allowed, denied}` object schema; the spec wants a flat array; the restriction is ignored and chief_of_staff can Write/Edit. Codex `[[hooks]]` blocks live in `config.toml` but the loader only reads `hooks.json` — the entire hook wiring is dead code. Gemini's `fulcrum-core.toml` uses `decision = "allow"` which is silently dropped at extension tier. Etc.

PR 7 absorbs retroactive corrections for all four already-shipped agents, plus the original Gemini scope, plus a new TDD compliance suite that serves as the spec gate going forward. Total: ~27 units. Expected effort: 25–40 hours. Carrier for the expanded scope is still labeled **PR 7**, not PR 7 v2 — the original PR 7 work is incomplete without these corrections.

**Canonical sub-ordering (one commit per sub-PR boundary, all under the PR 7 umbrella):**

- **7.0 — Compliance test suite (red OK).** `packages/cli/src/tests/compliance/{claude,codex,gemini,opencode,pi,copilot,cursor,windsurf}-compliance.test.ts` + `helpers.ts` + `README.md`. Every test cites the upstream doc that defines the contract. Red tests document the gaps — failing tests become the proof-of-work gate: a checklist ✅ flips only when the matching compliance test is green.

- **7.1–7.10 — Gemini scope (original 7.1–7.7 + research gaps + persona bugs).**
  - 7.1 `hooks.json` rewrite: Gemini tool-name matchers (`write_file|replace|run_shell_command`), drop Claude-only `tools: []` field, SessionStart matcher `"startup"` not `"*"`, per-hook `timeout`.
  - 7.2 `policies/fulcrum-core.toml` migration: move `decision = "allow"` rules to user-tier installer write (`~/.gemini/policies/`) OR drop entirely. Ship subagent-scoped `deny` rules for chief_of_staff write-class tools.
  - 7.3 Subagent frontmatter: add `mcpServers: { fulcrum: {...} }` inline to every role MD (isolation drops inheritance).
  - 7.4 `runGeminiSessionStartHook` emits `hookSpecificOutput.hookEventName: "SessionStart"` + `additionalContext` with workspace snapshot.
  - 7.5 `runGeminiBeforeAgentHook` emits `additionalContext` from `recall_knowledge` timeout-bounded at 200ms.
  - 7.6 `detectHookCli` ordering fix — Gemini events with `session_id` + `tool_name` + `hook_event_name: "BeforeTool"` must NOT route to claude.
  - 7.7 `extractRecallQuery` uses `absolute_path` for `list_directory`/`read_file` (not `path`).
  - 7.8 Notification handler respects hook_events 50k row cap; idempotent dedup key.
  - 7.9 TOML `"""` escape in `renderCommand`; unchecked-cast narrowing in handlers.
  - 7.10 `gemini-extension.json` adds `settings[]` for FULCRUM_MEMORY_V3 / FULCRUM_MONITOR_PORT + `plan.directory` + `contextFileName` as array. GEMINI.md modularizes via `@./rules/*.md`.

- **7.11–7.17 — opencode fixes (retroactive PR 4).**
  - 7.11 `event` handler unwraps `input.event.type` + `event.properties.*` (3 dead branches resurrect).
  - 7.12 `permission.ask` mutates `output.status` (not returns `{approved, reason}`).
  - 7.13 `tool.execute.before` replaces bare `throw` with documented block path (mutate `output.args`, or route through `permission.ask`).
  - 7.14 `todo.updated` iterates `event.properties.todos: Todo[]`.
  - 7.15 `messages.transform` synthetic Part uses a fresh `messageID` (no collision) OR migrate to `experimental.session.compacting`.
  - 7.16 Wire `experimental.session.compacting`, `chat.message`, `chat.params`, `tool.definition` — the four highest-value SHOULD_FIX surfaces.
  - 7.17 Actually set `OPENCODE_SYSTEM_RIDER` via `shell.env` return, or rename/drop the checklist row.

- **7.18–7.24 — Claude fixes (retroactive PR 5 + 14.1).**
  - 7.18 24 subagent MDs: `tools` to flat array; chief_of_staff excludes `Write`/`Edit`/`MultiEdit`/`NotebookEdit`.
  - 7.19 `plugin.json`: `mcp` → `mcpServers` (with a real MCP config).
  - 7.20 Drop `SubagentStart` event bindings (doesn't exist) everywhere.
  - 7.21 `runPreHook` emits `hookSpecificOutput.permissionDecision` + `updatedInput`, not deprecated `{continue}` shape.
  - 7.22 `runSessionStartHook` emits `hookSpecificOutput.additionalContext` with workspace snapshot (stop writing to disk-sidecar + stderr).
  - 7.23 `runUserPromptSubmitHook` emits `additionalContext` from `recall_knowledge(prompt)` timeout-bounded.
  - 7.24 Hooks.json uses `${CLAUDE_PLUGIN_ROOT}/bin/fulcrum-hook` shim; every entry declares `timeout`. Subagent descriptions carry `<example>` blocks for Task-tool auto-delegation. Commands declare `allowed-tools: Bash(fulcrum:*), Read`.

- **7.25–7.27 — Codex fixes (retroactive PR 6).**
  - 7.25 Migrate Codex hooks from `config.toml` `[[hooks]]` blocks to `hooks.json` (or installer writes `~/.codex/hooks.json`). All 6 event handlers register through the JSON carrier.
  - 7.26 Fix `[notify]` table → `notify = [...]` flat string array at root. Remove `[tool_approval.invoke_team]` (not a valid TOML key).
  - 7.27 Normalize plugin.json `capabilities` + `category` to upstream-recognized capitalized verbs (`["Interactive", "Write"]`, `"Productivity"`).

- **7.28 — Checklist reconciliation.** Flip overclaimed ✅ rows to ⚠️ with evidence pointer to the matching compliance test. Add a new `compliance test` column for every row. The rule: no ✅ without a green compliance test.

**Cross-cutting work products:**
- `packages/cli/src/tests/compliance/` suite (8 files + helpers + README). Runs via `pnpm -F fulcrum-agent-cli test -- compliance`.
- Each sub-PR's commit attaches the compliance run as evidence in the ledger entry.
- The compliance suite is the **spec gate** for every future agent-integration PR. No new ✅ row may flip until its compliance test is green.

**Pre-merge skills (on PR close):** `compound-engineering:ce-review` orchestrator + all always-on reviewers (`correctness-reviewer`, `maintainability-reviewer`, `testing-reviewer`, `project-standards-reviewer`) + PR 7 load-bearing (`api-contract-reviewer`, `kieran-typescript-reviewer`, `security-reviewer`, `reliability-reviewer`, `adversarial-reviewer`, `code-simplicity-reviewer`).

**Verify gate (PR 7 close):**
- `pnpm -F fulcrum-agent-cli test -- compliance` fully green (0 red).
- `pnpm -r build` clean.
- Full checklist `grep -c '⬜'` reduced by the count of fixed rows; no new overclaimed ✅ entries.
- Ledger carries per-sub-unit evidence: compliance tests that went red→green.

### PR 8 — PI cockpit: every event + role-switching UX (rev. 2026-04-20 per research)

**Original scope (5 units) holds with corrections:**
1. Bind the remaining PI events. Correct count is **24, not 19** per `node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`. 5 currently bound (`session_start`, `session_shutdown`, `resources_discover`, `tool_call`, `before_agent_start`); at minimum bind 14 more (`agent_end`, `tool_result`, `context`, `before_provider_request`, `turn_start`, `turn_end`, `session_before_compact`, `user_bash`, `input`, plus observational events).
2. `/fulcrum:role <slug>` slash command. **No `pi agent switch` primitive exists** — synthesize via `registerCommand("fulcrum:role", ...)` + `before_agent_start` handler chain that appends role MD to `systemPrompt`.
3. 24 role MDs emitted under cockpit skill path (`cockpit/skills/roles/<slug>/SKILL.md` so `/skill:fulcrum-role-chief_of_staff` works alongside auto-dispatch).
4. **PI context-file convention is `AGENTS.md`, NOT `PI.md`.** PI walks `AGENTS.md` up from cwd. Emit managed block into repo-root `AGENTS.md`; `PI.md` is not auto-loaded.
5. `package.json` rename to `@fulcrum-agent-os/pi-cockpit` (PR 14.4 dependency).

**Compliance tests:** `pi-compliance.test.ts` (GAP(pi-M1) / GAP(pi-M2) / GAP(pi-S1-4)).

### PR 9 — opencode native skills: 33 hidden subagent MDs + Task permissions

4 units; `.opencode/agents/fulcrum-skill-<name>.md` with `mode: subagent, hidden: true`.

### PR 10 — Copilot installer + per-skill instructions + public-repo guard (EXPANDED 2026-04-20)

**Original 7-unit "no hook layer" scope is outdated.** VS Code shipped Agent hooks (Preview) + custom `.agent.md` + `.prompt.md` + Claude-format `.claude/settings.json` compat. PR 10 should ship the full surface, not the rules-only subset:

1. `.github/copilot-instructions.md` + `AGENTS.md` root summary (always-on).
2. 33 `.github/instructions/fulcrum-skill-<name>.instructions.md` (path-scoped with `applyTo` glob + `description` frontmatter).
3. **24 `.github/agents/<role>.agent.md`** files mapping 1:1 onto Fulcrum role MDs. `chief_of_staff.agent.md` uses `handoffs:` / `agents:` frontmatter for delegation — the Copilot analog of CoS orchestration.
4. **`.github/hooks/fulcrum.json`** (VS Code Agent hooks schema) + `.claude/settings.json` compat layer so the Claude installer output also works for Copilot. Tool-name matcher translation table: `Write→create_file`, `Edit→replace_string_in_file`, `Bash→run_in_terminal`. Property-name shim (snake_case Claude → camelCase VS Code).
5. 6 `.github/prompts/fulcrum-<name>.prompt.md` slash commands for user-invokable skills.
6. `.vscode/mcp.json` with `chat.mcp.autoStart: true` guidance.
7. Public-repo detection + sanitized variant default (AD-8). Critical after 2026-04-24 Copilot training-data policy change: Free/Pro/Pro+ interaction data trains models by default, so any `.github/instructions/*.md` content on a public repo is a training-data leak channel. Sanitized variant strips internal URLs, monitor ports, MCP command strings, and role-specific tool references.

**Compliance tests:** `copilot-compliance.test.ts` (GAP(cp-M1-M5) + GAP(cp-S1-S4)).

### PR 11 — Cursor full integration (EXPANDED 2026-04-20)

**Original 5-unit "rules-only" scope is too narrow.** Research found Cursor has SIX surfaces (rules, skills, agents, commands, hooks, MCP) — and Cursor 2.4+ is actively migrating rules → Skills (SKILL.md). PR 11 ships:

1. `.cursor/rules/fulcrum-core.mdc` (alwaysApply: true) with canonical rules, under the 500-line soft limit.
2. 33 `.cursor/rules/fulcrum-skill-<name>.mdc` (alwaysApply: false, description-match mode — description is the retrieval signal for "Apply Intelligently"). Pre-2.4 fallback.
3. **33 `.cursor/skills/fulcrum-<name>/SKILL.md`** — Anthropic format, strategic bet as Cursor 2.4+ migrates there.
4. **`.cursor/hooks.json`** — Cursor DOES have hooks (~18 events: `preToolUse`, `postToolUse`, `sessionStart`, `subagentStart/Stop`, `beforeMCPExecution`, `beforeReadFile`, `afterFileEdit`, `beforeSubmitPrompt`, etc.). Parity with Claude Code's hook layer. `fulcrum hook cursor` CLI entry point translates stdin envelope.
5. `.cursor/commands/*.md` slash commands for user-invokable skills.
6. `.cursor/mcp.json` — already done; verify schema.
7. Installer expansion: `installCursor()` emits all of (1)-(5), not rules-only.

`.cursorrules` legacy singular file is **deprecated**; do not emit.

**Compliance tests:** `cursor-compliance.test.ts` (GAP(cu-M1-M4) + GAP(cu-S1-S2)).

### PR 12 — Windsurf installer (new) + hooks promoted to first-class (rev. 2026-04-20)

**Hooks are now first-class, not "optional":**

1. `installWindsurf()` new entry point in `agent-integration/install.ts`.
2. `.windsurf/rules/fulcrum-core.md` (trigger: `always_on`) with canonical rules. **12000-byte hard limit** per file (already enforced in `emitWindsurf`).
3. 33 `.windsurf/rules/fulcrum-skill-<name>.md` (trigger: `model_decision` + REQUIRED description).
4. 5+ `.windsurf/workflows/<name>.md` for user-invokable slash commands (nestable).
5. **`.windsurf/hooks.json` with 12 events** — `pre_read_code`, `pre_write_code`, `pre_run_command`, `pre_mcp_tool_use`, `pre_user_prompt`, + post_* variants. Exit 2 blocks. 1:1 parity with Claude Code's hook model. `fulcrum hook windsurf` CLI entry point.
6. `.windsurf/mcp_config.json` template (installer writes to `~/.codeium/windsurf/mcp_config.json` at user scope).
7. Global opt-in (`~/.codeium/windsurf/memories/global_rules.md`) — explicit `--global` flag only, 6000-byte cap, no workspace-specific IDs. Shared-machine leak risk: installer refuses by default and warns on existing non-empty global file.

**Compliance tests:** `windsurf-compliance.test.ts` (GAP(ws-M1-M3) + GAP(ws-S1-S3)).

### PR 13 — `fulcrum install apply` CLI + verify + cleanup + demo reel

5 units; `fulcrum install apply --agent <name>`; `fulcrum install verify --agent <name>`; ONBOARDING.md + CLAUDE.md regen; demo reel.

### PR 14 — Plugin-standard packaging parity — **RESTORED IN SCOPE (v3.3 revised 2026-04-20)**

**v3.3 revision (2026-04-20, post PR 4 overclaim correction)**: the earlier "PR 14 deferred to v4" decision (R2 from this session's research pass) was over-scoped without explicit multi-item user approval. User directive 2026-04-20: unlock every 🔒 item and restore full PR 14 scope to this plan. Research findings that drove R2 (Claude marketplace update jank, zero PI demand, Codex no-install-CLI) stay documented as **load-bearing PR-time caveats** (must be accommodated in unit-level design), not as scope-exclusion grounds.

Full unit list — everything below ships in v3.3, not v4:

- **14.0 — npm org `@fulcrum-agent-os` registration + 2FA + publish-only CI token + `SECURITY.md` at repo root.** Out-of-band operator work (npmjs.com web UI + GitHub Actions secret). Documented in `SECURITY.md` per Constraints #21 + #22 (2FA; branch protection; signed commits; signed release tags; publish-only tokens; CI-only publish path).
- **14.1 — Claude marketplace `.claude-plugin/marketplace.json` at repo root** of `moabualruz/fulcrum`, referencing plugin manifest via `source: "./agent-integration/claude"`. Bundled `hooks/hooks.json` inside plugin dir. Dual-mode `installClaude({ mode: "auto" | "manual" })` — native path drives `claude plugin marketplace add moabualruz/fulcrum` + `claude plugin install fulcrum@fulcrum`; fallback: existing manual path. PR-time caveat: Claude marketplace update mechanics have known open issues (#46594/#46081/#38271/#37886); installer prints a "run `claude plugin marketplace refresh` to pick up updates" hint and degrades gracefully when refresh fails.
- **14.2 — Codex install path: marketplace CLI + post-install message (v3.3 revised 2026-04-20 per Codex research).** `codex plugin marketplace {add|upgrade|remove}` is a real CLI today (shipped in alpha.11/12 per `codex-rs/cli/src/marketplace_cmd.rs`). `installCodex({mode: 'native' | 'manual'})`: native path runs `codex plugin marketplace add moabualruz/fulcrum` (same GitHub repo that hosts the shared `.claude-plugin/marketplace.json` from PR 14.1 + 6.7). Per-plugin install (toggling `AVAILABLE` → `INSTALLED_BY_DEFAULT` or user-opt-in install) remains TUI-only — post-install prints `Fulcrum marketplace registered with Codex. Run 'codex' then '/plugins' to install/manage via the TUI.` Install-state lives in `~/.codex/config.toml [plugins."<name>@<marketplace>"]` + cache at `~/.codex/plugins/cache/<marketplace>/<plugin>/` — manual-mode installer writes the config.toml block + cache dir so `/plugins` TUI shows Fulcrum as INSTALLED (not just AVAILABLE). Cleanup step for the malformed `{"host":"codex",...}` entry in `~/.agents/plugins/marketplace.json`.
- **14.3 — opencode npm publish as `@fulcrum-agent-os/opencode-plugin`.** package.json rename (DONE in commit `2aa65b0`) + actual first `npm publish` via `.github/workflows/publish-opencode-plugin.yml` on signed tag `opencode-plugin/v*`. `auto` probe (`npm view @fulcrum-agent-os/opencode-plugin version 2>/dev/null` with 2s timeout) in `installOpencode`. Error path `opencode-plugin-unresolved` when native resolution fails or auto has neither npm package nor manual local file.
- **14.4 — PI cockpit npm publish as `@fulcrum-agent-os/pi-cockpit`.** package.json rename; rename `.github/workflows/publish-cockpit.yml` → `publish-pi-cockpit.yml` with `pi-cockpit/v*` tag namespace; verify `@fulcrum/cockpit` npm history (legacy conflict check); keep existing `peerDependencies` on `@mariozechner/pi-*` (v3.1 confirmed npm does not validate peerDep ownership). Dual-mode `installPiCockpit({ mode: "auto" | "npm" | "git" | "local" })`.
- **14.5 — Gemini extension lifecycle verification.** Post-install print `gemini extensions update fulcrum` command; `migratedTo` field scaffolding (commented-out) in `gemini-extension.json`; install-time schema validation against `find-docs`-verified schema.
- **14.6 — `docs/architecture/install-paths.md`** — per-agent table of native install command vs manual fallback vs "rules-only (no plugin standard)". Referenced from README.md + ONBOARDING.md.
- **14.7 — Published-package / source integrity CI gate.** CI job compares `npm pack` tarball content against `agent-integration/<agent>/` repo source post-build. Fails on drift. Enforced for opencode + PI packages.
- **14.8 — `fulcrum install verify --agent <name>` extended.** Reports install mode (`native` / `manual` / `auto-detected`) + version of installed plugin vs canonical source.
- **14.9 — `.npmignore` audit + POST-PACK tarball secret scan.** Publish workflow runs `npm pack` → extract → scan every extracted file with the secret scanner → fails on match. This catches build-time inlined secrets (bundled env vars, sourcemaps, minification artifacts) that the source-file scan (AD-9e) would miss. Post-pack scan is the enforcement mechanism for Constraint #20.
- **14.10 — CHANGELOG + semver version-bump discipline.** Each npm-publishable package adopts semver; version bumps land in the PR that ships the content change (not in PR 14 retroactively). PR 14 sets initial `1.0.0` for opencode + PI packages and wires changeset / version-scripts.

**PR-time caveats (carry from v3.3 research — do NOT use as deferral justification)**:
- Claude marketplace update mechanics have open issues #46594/#46081/#38271/#37886. Ship anyway; document behavior in SECURITY.md + install-paths.md; installer degrades gracefully when `refresh` fails.
- PI ecosystem has near-zero third-party npm plugin history. Publish anyway; first publish sets the precedent; CHANGELOG documents "first release" semantics.
- Codex has no `codex plugin install` CLI. PR 14.2 ships status-quo documented + the TUI visibility path.
- Fanout performance budget <2000ms cold-CI / <500ms warm (v3.2 widened from v3's <1000ms per feasibility finding on CI I/O budget).

**Verify (PR-level gate)**:
- `pnpm setup:claude --auto` drives `/plugin install` on a fresh machine (or clearly reports fallback reason).
- `pnpm setup:opencode --auto` uses npm package when resolvable.
- `pnpm setup:pi --auto` uses `pi install npm:...`.
- `fulcrum install verify --agent claude` reports install mode + plugin version.
- CI integrity gate green on a release tag.
- `docs/architecture/install-paths.md` renders.
- `SECURITY.md` at repo root with Constraints #21 + #22 content.
- Post-pack tarball scan passes clean.
- Every ⬜ row in the PR 14 section of `docs/reference/2026-04-20-integration-completeness-checklist.md` flipped to ✅.

**Pre-merge skills**: `compound-engineering:review:deployment-verification-agent`, `agent-skills:security-auditor`, `compound-engineering:review:api-contract-reviewer`, `compound-engineering:ce-review` persona panel.

---

**LEGACY PR 14 spec (v3.2 verbatim — preserved for context):**

**Goal:** each plugin-capable agent (Claude / Codex / Gemini / opencode / PI) uses its native plugin/extension install command by default. npm publishes wired for opencode + PI. Claude gets a local marketplace manifest. Codex install path validated against current Codex CLI. Gemini update flow verified.

**Units:**

- **14.0 — npm org registration + 2FA posture (v3.1, revised v3.2).** Register npm org `@fulcrum-agent-os` (free for public packages) via npmjs.com web UI. Enforce org-wide 2FA (Constraint #21). Create publish-only org-scoped tokens for `.github/workflows/publish-*.yml`; store as GitHub Actions secrets. Document the posture in a new `SECURITY.md` at repo root (Constraint #22). **v3.2 REMOVED typo-squat placeholder reservations** — the specific `@fulcrum-agent-os` scope is long + specific enough that typo-squatting is negligible pre-1.0; scope-guardian persona flagged the placeholders as premature hardening. If install volume grows post-1.0 and a real typo-squat incident happens, reserve then. Any `@fulcrum-agent-os/*` typo reservation happens ONLY within the Fulcrum-owned org scope (e.g. `@fulcrum-agent-os/opencode`, `@fulcrum-agent-os/plugin`) — NOT other top-level scopes. Out-of-band operator work; plan tracks completion before 14.3/14.4 publish.

- **14.1 — Claude Code GitHub-root marketplace (v3.1).** Author `/.claude-plugin/marketplace.json` at the **repo root** of `moabualruz/fulcrum` (NOT inside `agent-integration/claude/`). Marketplace entry for Fulcrum references the plugin manifest location via `source: "./agent-integration/claude"` — Claude resolves `source + "/.claude-plugin/plugin.json"` to find the manifest. Verify against `plugin-marketplaces.md` schema via `find-docs`. Author a bundled `hooks/hooks.json` inside the plugin dir (currently Fulcrum ships hooks via direct settings.json edit; the plugin path requires them inline). Dual-mode in `installClaude()`: default `--auto` detects whether `claude` CLI supports `/plugin marketplace add` (version probe); if yes, drives `claude /plugin marketplace add moabualruz/fulcrum` + `claude /plugin install fulcrum@fulcrum`. If no, or `--manual` passed, falls back to existing manual path. Retire `agent-integration/claude/settings-hooks-snippet.json` in favor of the plugin-bundled `hooks.json` (the plugin-install path picks it up automatically).

  **Load-bearing research:** verify `claude plugin marketplace add` CLI-triggerable form at current Claude Code version (docs document `/plugin` as interactive slash command; CLI-triggered variant needs confirmation — re-fetch `plugin-marketplaces.md` + `cli-reference.md` at PR time).

  **Marketplace file shape (v3.1 target):**
  ```json
  {
    "name": "fulcrum",
    "owner": { "name": "Mo Abualruz" },
    "plugins": [
      {
        "name": "fulcrum",
        "source": "./agent-integration/claude",
        "description": "Fulcrum Agent OS — task management, memory, multi-agent lifecycle, and policy hooks",
        "version": "2.0.0",
        "category": "productivity"
      }
    ]
  }
  ```

- **14.2 — Codex plugin install: document status-quo + TUI verify path (v3.1, revised v3.2).** Confirmed: no `codex plugin install` CLI command; only interactive `codex /plugins` TUI browser. `installCodex()` keeps piece-by-piece install (MCP block + hooks in config.toml + skills copy + AGENTS.md). Post-install prints the v3.2-corrected message: **`Fulcrum is installed for Codex. Run 'codex' then '/plugins' to verify/manage in the TUI.`** (v3 said "to browse Fulcrum to install" — misleading since Fulcrum is ALREADY installed after this script runs.) Validate `agent-integration/codex/plugin/.codex-plugin/plugin.json` schema against current Codex plugin loader docs. **Load-bearing research (v3.2 added):** confirm that `codex /plugins` TUI actually reads from the filesystem `~/.agents/plugins/marketplace.json` and shows Fulcrum as installed; if not, the status-quo install path leaves invisible state. Update `docs/reference/2026-04-19-codex-cli-extension-surface.md` with the outcome.

- **14.3 — opencode npm publish as `@fulcrum-agent-os/opencode-plugin` (v3.1, revised v3.2).** Rename `agent-integration/opencode/package.json` → `"name": "@fulcrum-agent-os/opencode-plugin"`. **v3.2 new sub-items (feasibility persona finding):** the current package has NO `main`/`exports`/`files`/`types`/build — plugin is shipped as raw `plugins/fulcrum.ts`. For npm install resolution, add: `"main": "./dist/fulcrum.js"`, `"exports": { ".": { "types": "./dist/fulcrum.d.ts", "import": "./dist/fulcrum.js" } }`, `"files": ["dist/", "README.md"]`, and a `build` script (`tsc` or `bun build`) that pre-compiles TS → JS + .d.ts in `dist/`. `.npmignore` audit: exclude `node_modules`, `tests/`, `plugins/*.ts` (source; `dist/` is the published artifact). Add CI step in `.github/workflows/publish-opencode-plugin.yml` triggered on release tag `opencode-plugin/v*`. **`auto` probe (v3.2 specified):** `npm view @fulcrum-agent-os/opencode-plugin version 2>/dev/null` — exit 0 + version output = resolvable; any non-zero = fallback. Current shipped modes are `installOpencode({ mode: "auto" | "native" | "manual" })`: `auto` runs the probe (2s timeout); if yes, set `opencode.jsonc` `"plugin": ["@fulcrum-agent-os/opencode-plugin"]`; if no or `manual`, keep `./plugins/fulcrum.ts`. Error path (v3.2 added per adversarial persona F6): if `auto` has neither npm package nor `./plugins/fulcrum.ts`, or if `native` cannot resolve the npm package, `installOpencode` throws `OpencodePluginUnresolvedError` with code `opencode-plugin-unresolved`.

- **14.4 — PI cockpit npm publish as `@fulcrum-agent-os/pi-cockpit` (v3.1, revised v3.2).** Rename `agent-integration/pi/cockpit/package.json` → `"name": "@fulcrum-agent-os/pi-cockpit"`. Keep existing `peerDependencies` on `@mariozechner/pi-*` — npm does not validate peerDep ownership (v3.1 confirmed). **v3.2 existing-workflow reconciliation (feasibility persona HIGH finding):** repo already has `.github/workflows/publish-cockpit.yml` titled `Publish @fulcrum/cockpit` triggering on `cockpit/v*` tags. Three names are in play (`fulcrum-cockpit` source; `@fulcrum/cockpit` workflow; `@fulcrum-agent-os/pi-cockpit` plan target). Reconciliation: (a) update the workflow to `.github/workflows/publish-pi-cockpit.yml` title `Publish @fulcrum-agent-os/pi-cockpit`, trigger on `pi-cockpit/v*`; (b) verify `@fulcrum/cockpit` history on npm — if ever published, document legacy status + whether deprecation is needed; (c) update `package.json` `name`. `.npmignore` audit. **`--auto` probe (v3.2 specified):** `npm view @fulcrum-agent-os/pi-cockpit version 2>/dev/null` — exit 0 + version = resolvable. Dual-mode `installPiCockpit({ mode: "auto" | "npm" | "git" | "local" })`: default `--auto` runs probe (2s timeout); resolvable → `pi install npm:@fulcrum-agent-os/pi-cockpit`; unresolvable → fallback to `pi install <local-path>`. Post-install prints: `pi install npm:@fulcrum-agent-os/pi-cockpit` as the user-facing re-install command.

- **14.5 — Gemini extension lifecycle verification.** Not a packaging change (Gemini is already standard). Units: (a) add post-install print of `gemini extensions update fulcrum` command; (b) add `migratedTo` field scaffolding (commented-out; documents future migration path); (c) add `gemini-extension.json` schema validation at install time via `find-docs`-verified schema.

- **14.6 — Install-path matrix doc.** `docs/architecture/install-paths.md` — per-agent table of native install command vs manual fallback vs "no plugin standard (rules-only)". Human-facing. Referenced from `README.md` + `ONBOARDING.md`.

- **14.7 — Published-package / source integrity CI gate.** CI job compares `dist/` published npm artifact against `agent-integration/<agent>/` repo source post-build. Fails on drift. Enforced for opencode + PI packages.

- **14.8 — `fulcrum install verify` extended.** Per-agent verify reports install mode (`native` / `manual` / `auto-detected`) + version of installed plugin vs canonical source.

- **14.9 — `.npmignore` + POST-PACK tarball secret scan (v3.2 corrected per security-lens finding #3).** All publish-candidate packages get a `.npmignore` audit script. **v3.2 critical change:** publish step runs `npm pack` FIRST (produces the actual tarball), then extracts it, then scans EVERY file in the extracted tarball contents with the secret-scanner — fails on match. v3 said "scan source files before pack" which misses secrets inlined at build-time (bundled env vars, sourcemaps, minification artifacts). The post-pack scan catches those. Source-file scan at `packages/agent-fanout/parse.ts` (AD-9e) remains; post-pack is the second gate, not a replacement.

- **14.10 — CHANGELOG + version-bump discipline.** Each npm-publishable package adopts semver; version bumps land in the PR that ships the content change, not in PR 14 retroactively. PR 14 sets initial version-1.0.0 for opencode + PI packages + wires changeset / version-scripts.

**Verify:**
- `pnpm setup:claude --auto` installs via `/plugin install` path on a fresh machine (or clearly reports fallback reason).
- `pnpm setup:opencode --auto` uses npm package when resolvable.
- `pnpm setup:pi --auto` uses `pi install npm:...`.
- `fulcrum install verify --agent claude` reports install mode + plugin version.
- CI integrity gate green on a release tag.
- `docs/architecture/install-paths.md` renders.

**Pre-merge skills:** `compound-engineering:review:deployment-verification-agent` (npm publishes are production deployments), `agent-skills:security-auditor` (subagent — published-package content audit), `compound-engineering:review:api-contract-reviewer` (installer signature dual-mode), `compound-engineering:ce-review` (persona panel — PR will be ≥50 LOC).

---

## Bootstrap Mode

PR 1 + PR 10 + PR 12 + PR 13 + PR 14 are Bootstrap PRs (install.ts / install CLI / npm publish wiring). Substitutes:

| Step | Normal | Bootstrap |
|---|---|---|
| Orient | `mcp__fulcrum__build_cos_context` | Read plan + ledger directly. |
| Start run | `mcp__fulcrum__start_agent_run` | uuid; record in ledger. |
| Heartbeat | `mcp__fulcrum__heartbeat_agent_run` | Skip. |
| Record decision | `mcp__fulcrum__write_memory` | Append to ledger. |

Skill invocations stay in every Bootstrap PR.

---

## Testing Strategy

- Per-skill identity property test (AD-6 + AD-7).
- Transform idempotency property test.
- Per-agent install-smoke (`pnpm setup:dry --target <agent>`).
- Per-skill / per-rule lint (frontmatter, placeholders, secrets).
- Migration 108 test (apply clean; rollback documented).
- Hook volume budget test (synthetic 10-turn 100-tool-call burst; < 3000 invocations; p95 < 20ms).
- Per-agent install verify (`fulcrum install verify`).
- Integrity chain test (opencode tampered rider).
- Session_id forgery test.
- Public-repo sanitization test (Copilot).
- Drift canary CI (fanout output vs committed fixtures).
- **(v3 new) Dual-mode install parity test** — for each plugin-capable agent, `--native` mode and `--manual` mode produce equivalent end-state (same files at same paths with same content post-install). Smoke-tested via fixture dirs in CI.
- **(v3 new) Published-package integrity CI gate** — `pnpm pack` output compared against repo source for opencode + PI packages; drift = CI red.
- **(v3 new) npm publish smoke** — nightly CI runs `pnpm pack` + `npm publish --dry-run` for both publish-candidate packages; surfaces any pre-publish error before real release.
- End-to-end bias check (probabilistic; > 80% pass rate on 20 trials / 3-5 agents; informational).

### Performance budgets

| Budget | Target |
|---|---|
| Fan-out transform (8 agents, 33 skills + 3 rules) | < 2000ms cold-start CI; < 500ms warm cache (v3.2 widened from v3's <1000ms per feasibility finding on CI I/O budget) |
| Per-agent install (heaviest: Claude with plugin marketplace) | < 5s non-dry-run (increased from v2's 2s to allow for `claude /plugin install` subprocess roundtrip) |
| `fulcrum install verify --agent <any>` | < 3s incl. MCP ping |
| Hook invocation (any agent, any event, any tool) | p95 < 20ms |
| Recall-turn-state SQLite write | p95 < 5ms |
| npm publish smoke (dry-run, per package) | < 30s |
| End-to-end bias-check (informational) | > 80% on 20 trials / 3-5 agents |

### PR 15 — `fulcrum install wipe` one-shot cleanup (v3.3 added 2026-04-20 per user directive)

**Origin**: PR 4 closeout review 2026-04-20 — user flagged that `install.ts` records per-step `setRollback` hints (19 of them across ~2100 LOC) but nothing aggregates them. A user who runs the installer cannot cleanly remove what it wrote; partial installs leave orphaned state future runs skip around. Three-PR lifecycle set (PR 15 → 16 → 17) converges on a symmetric install/uninstall surface.

**Ordering rationale (per user directive)**: wipe FIRST so users can reset current state before PR 16 refactors install internals.

**Scope**: `fulcrum install wipe [--agent <name>] [--all] [--global | --project] [--dry-run] [--yes]`

- `--all` requires `--yes` (no interactive confirm; CI-safe default fail).
- `--agent <name>` wipes one of {claude, codex, gemini, opencode, pi, copilot, cursor, windsurf}.
- `--global` / `--project` (mutually exclusive) — explicit scope per §Q4 recommendation (npm model). Default per agent: Claude/Gemini/Codex/PI → `--global`; opencode/Cursor/Windsurf/Copilot → `--project`. Always log chosen scope.
- `--dry-run` prints exactly what `--yes` would mutate; no side effects.
- Shared files (e.g. `.vscode/mcp.json`, `~/.claude/settings.json`, `~/.gemini/settings.json`, `~/.codex/config.toml`, `~/.codeium/windsurf/memories/global_rules.md`) follow §Q5: marker-block strip only — never delete. If file is empty after strip, retain with log "file retained (user-owned)."

**What to wipe per agent** (exhaustive, derived from `install.ts` catalog 2026-04-20):

- **Global wrapper**: `~/.local/bin/fulcrum` symlink (only if it points at a repo path; do not touch system-installed `fulcrum`).
- **Claude Code**: `claude plugin uninstall fulcrum@fulcrum --scope user || true` + `claude plugin marketplace remove fulcrum --scope user || true` + `claude mcp remove --scope user fulcrum || true` + reverse-apply `BEGIN/END FULCRUM managed-block` region in `~/.claude/CLAUDE.md` + remove FULCRUM hook entries from `~/.claude/settings.json` (match by `command: "fulcrum hook claude …"`; leave hand-written hooks untouched).
- **Codex**: remove `[mcp_servers.fulcrum]` + `[experimental.hooks.fulcrum]` blocks from `~/.codex/config.toml` + Fulcrum entry from `~/.agents/plugins/marketplace.json` + `rm -rf ~/.codex/plugins/cache/fulcrum` + `rm -rf ~/.codex/skills/fulcrum-*` (if present).
- **Gemini**: `gemini extensions uninstall fulcrum || true` (native) + fallback `rm -rf ~/.gemini/extensions/fulcrum` + remove FULCRUM mcpServers entry from `~/.gemini/settings.json` (native uninstall does NOT touch settings.json per research 2026-04-20).
- **opencode**: remove plugin entry matching `@fulcrum-agent-os/opencode-plugin` OR `./plugins/fulcrum.ts` from `~/.config/opencode/opencode.jsonc` + `rm -rf ~/.cache/opencode/node_modules/@fulcrum-agent-os` (Bun per-plugin cache purge) + for project-scoped: `rm -rf .opencode/{agents,rules,plugins,command}` + `rm -f .opencode/.ridersum` + `rm -f .opencode/opencode.md` + remove plugin entry from `.opencode/opencode.jsonc`.
- **PI cockpit**: no native `pi uninstall` (verified `@mariozechner/pi-coding-agent@0.66.1` docs 2026-04-20); `rm -rf ~/.pi/agent/extensions/fulcrum` + remove `fulcrum` entry from `~/.pi/agent/settings.json` `extensions[]`.
- **Copilot / Cursor / Windsurf** (per-project, file-based): targeted `rm -f` of Fulcrum-named files; for shared JSON files (`.vscode/mcp.json`, `.cursor/mcp.json`, `.windsurf/mcp.json`) remove only the `fulcrum` key. For Windsurf `--global`: edit the managed region in `~/.codeium/windsurf/memories/global_rules.md`; never delete the file (user may have hand-written memories).

**Design requirements**:

- **Idempotent**: running wipe twice produces the same end state. Every step guards with `existsSync` / `|| true`.
- **Conservative on hand-edits**: never delete user-authored content. When removing from JSON/TOML/MD, either (a) reverse-apply a managed marker block, or (b) remove only the `fulcrum` key and leave other keys intact.
- **Destructive commands require explicit opt-in**: `fulcrum install wipe --all` fails without `--yes`.
- **`--dry-run` must be byte-faithful**: prints the exact commands + file paths that `--yes` would mutate.

**Non-goals**:

- Does NOT wipe Fulcrum's global data dir (`${FULCRUM_DATA_DIR}`). That's user data (memory vault, sessions, agent_runs) — separate `fulcrum memory wipe` surface.
- Does NOT uninstall Fulcrum itself (the `fulcrum` binary on PATH is out of scope).

**Verify**:
- `fulcrum install wipe --agent opencode --dry-run` against a fully-installed temp opencode tree prints expected removals, mutates nothing.
- `fulcrum install wipe --agent opencode --yes` leaves the temp tree empty of Fulcrum artifacts; hand-authored siblings preserved.
- Double-run idempotency: second invocation prints "already wiped" per step.
- 8 agents × (dry-run + yes + double-run) ≥ 48 scripted assertions.

**Pre-merge skills**: `compound-engineering:review:correctness-reviewer`, `compound-engineering:review:reliability-reviewer`, `compound-engineering:review:security-reviewer` (destructive-command surface), `agent-skills:cli-readiness-reviewer`, `agent-skills:security-auditor` subagent.

**Estimate**: 1.5 days.

### PR 16 — Sanitize `install.ts` — unify native plugin/extension surfaces + install journal (v3.3 added 2026-04-20)

**Origin**: PR 4 closeout review 2026-04-20 — user flagged that Claude's installer had a three-mode vocabulary (`auto`, `native`, `manual`) while other agents' surfaces were inconsistent (Gemini file-copies when `gemini extensions install` exists natively; opencode used older npm/local naming, etc.). Also: no install journal exists, which means PR 17's uninstall would have no authoritative record of what to reverse.

**Per-agent target shape**:

| Agent | Current | Target (PR 16) |
|---|---|---|
| Claude Code | `auto\|native\|manual` | `native\|manual` with `auto` as the default behavior (probe + fallback) when no flag passed |
| Codex | File-copy + config.toml merge + marketplace.json edit | Stays manual — no native `codex plugin install` CLI (research 2026-04-20) |
| Gemini | File-copy to `~/.gemini/extensions/fulcrum/` | **Switch to `gemini extensions install <localpath>`** native path; file-copy fallback under `--install-mode=manual` |
| opencode | PR 4 c6: `auto\|npm\|local` | Rename to `native\|manual` (native = npm, manual = local) — align vocabulary across agents |
| PI cockpit | `pi install <cockpitDir>` native | Keep; add `--install-mode=manual` fallback (direct copy to `~/.pi/agent/extensions/`) |
| Copilot / Cursor / Windsurf | File-copy (only option) | Keep; `--install-mode` accepted but only `manual` supported; graceful-degradation flag for UX consistency |

**Shared surface changes**:

- **Flag vocabulary**: every `installXxx()` accepts `{ mode?: "native" | "manual" }`. `FULCRUM_INSTALL_MODE` env applies globally; per-agent overrides via `FULCRUM_<AGENT>_INSTALL_MODE`.
- **Install journal** (§Q1 recommendation — split by scope, XDG-spec-compliant): global installs → `${XDG_STATE_HOME:-$HOME/.local/state}/fulcrum/install/<agent>.jsonl`; project installs → `./.fulcrum/install.jsonl` (directory grows siblings; add `.fulcrum/` to `fulcrum init` `.gitignore` guidance). PR 17's uninstall consumes this. Schema:
  ```ts
  interface InstallJournalEntry {
    ts: string;              // ISO8601
    agent: string;           // one of 8 agent slugs
    step_name: string;       // matches the human-readable step
    action: "write_file" | "merge_json" | "merge_toml" | "symlink" | "native_cli" | "managed_marker";
    target_path: string;     // absolute
    rollback: string;        // shell command OR structured instruction
    mode: "native" | "manual";
    install_run_id: string;  // groups multi-step installs
    sha256_before?: string;  // for merge_json / merge_toml — hand-edit drift detection
    sha256_after?: string;
  }
  ```
- **Managed-marker blocks everywhere** (§Q5 — Ansible `blockinfile` pattern): current installer uses `BEGIN/END FULCRUM managed-block v1` for `CLAUDE.md` + `opencode.md` only. Extend to every shared config file — `~/.claude/settings.json` (JSON sentinel-key variant: `"_fulcrum_managed": {...}`), `~/.codex/config.toml` (TOML `# BEGIN FULCRUM MANAGED BLOCK` comment region), `~/.gemini/settings.json`, `.vscode/mcp.json`, `.cursor/mcp.json`, `.windsurf/mcp.json`, `~/.codeium/windsurf/memories/global_rules.md`. Uninstall (PR 17) reads the marker to bound its removal. Never delete shared files — only strip marker-bounded content.
- **Close the install.ts rollback gaps**: 6 current install steps have NO `setRollback` hint — Claude `~/.claude/settings.json` hook merge (line 536), Claude `claude plugin install` side-effects (line 327), Claude `claude mcp add` (line 805 neighborhood), Codex `~/.codex/config.toml` merges (lines 1560, 1637), Codex `~/.agents/plugins/marketplace.json` edit (line 1696), PI `pi install` native side-effects (line 754). PR 16 fills these so PR 17 can reverse them.

**Refactor plan**:

1. Extract `packages/agent-fanout/src/install-journal.ts` with `appendJournal(entry)` + `readJournal(agent)`.
2. Add managed-marker discipline for every JSON/TOML config edit (6 new call sites).
3. Convert Gemini install to `gemini extensions install <localpath>` native path; file-copy fallback.
4. Keep opencode modes on the shipped vocabulary `{auto, native, manual}`. Ensure pre-v3 mode names do not reappear in docs or tests.
5. Remove Claude's `FULCRUM_CLAUDE_INSTALL_MODE=auto` special-casing; collapse into two modes + default probe behavior.
6. End-to-end: `fulcrum install --all --dry-run` shows a coherent per-agent install plan with consistent mode vocabulary.

**Verify**:
- `installClaude({ mode: 'native' })` against a mocked `claude` CLI journals the probe + both install sub-commands + `action: 'native_cli'`.
- `installGemini({ mode: 'native' })` invokes `gemini extensions install` (mocked spawnSync); non-zero status falls to manual with journaled reason.
- Every agent's `installXxx({ mode: 'manual' })` writes journal entries with `action: 'write_file'` + `mode: 'manual'`.
- `readJournal('opencode')` returns rows in install order + SHA-256 capture for every merge action.

**Pre-merge skills**: `compound-engineering:review:api-contract-reviewer` (new unified mode vocabulary is a public contract), `compound-engineering:review:kieran-typescript-reviewer`, `compound-engineering:review:correctness-reviewer`, `compound-engineering:review:maintainability-reviewer`, `agent-skills:code-reviewer` subagent.

**Estimate**: 2 days.

### PR 17 — `fulcrum install uninstall` durable CLI (v3.3 added 2026-04-20)

**Origin**: symmetric with `fulcrum install apply` (PR 13). Consumes the install journal from PR 16 and walks it in reverse to undo exactly what install did.

**Scope** (§Q3 dpkg-style two verbs):
- `fulcrum install uninstall [--agent <name>] [--all] [--global | --project] [--dry-run] [--yes]` — DEFAULT: preserves hand-edited files; renames drifted files to `<file>.fulcrum-orphan` and logs the rename.
- `fulcrum install uninstall --purge [--agent <name>] …` — force-remove everything the journal owns, regardless of drift.

No interactive prompts — breaks CI. Drift detection via SHA-256 recorded in the install journal (§Q1 + PR 16) vs current file contents.

**Semantics**:

- Reads `${XDG_STATE_HOME:-$HOME/.local/state}/fulcrum/install/<agent>.jsonl` (global) or `./.fulcrum/install.jsonl` (project) per §Q1.
- Walks entries in REVERSE order of write; applies the `rollback` instruction per row.
- For `action: 'native_cli'` — run the matching uninstall command:
  - Claude: `claude plugin uninstall fulcrum@fulcrum --scope user` + `claude plugin marketplace remove fulcrum --scope user`
  - Gemini: `gemini extensions uninstall fulcrum`
  - PI: no native — falls back to file-delete.
- For `action: 'managed_marker'` — reverse-apply via `agent-fanout::replaceMarkerBlock(...)` with empty replacement. Never deletes the enclosing file (§Q5 — shared files retained if empty post-strip).
- For `action: 'write_file'` — default verb: `rm -f <target_path>` only if the file's current contents still match the journal's `sha256_after`; on mismatch, rename to `<target_path>.fulcrum-orphan` + log. `--purge` ignores drift.
- For `action: 'symlink'` — `rm -f` only if it points at the recorded target.

**Differs from PR 15 wipe**:

- **Wipe** (PR 15) = forceful, state-agnostic, "remove everything Fulcrum-labelled I find anywhere." No journal required.
- **Uninstall** (PR 17) = reversal of a known install, driven by the install journal. Safer (won't remove hand-authored content under a shared dir), auditable (every step logged), but requires PR 16's journal to exist.

**Integration with PR 15**:

`fulcrum install uninstall` tries the journal-based path first. If no journal exists (pre-PR-16 install, or `${FULCRUM_DATA_DIR}` was wiped), falls through to `fulcrum install wipe --agent <name>` with a warning explaining the downgrade.

**Verify**:
- `fulcrum install <agent>` writes a complete journal; `fulcrum install uninstall <agent>` walks it in reverse and produces the empty pre-install filesystem state.
- Hand-edit drift: user edits `.opencode/rules/fulcrum-first.md` post-install; uninstall detects SHA mismatch, skips deletion with `--preserve-hand-edits` (default true).
- Stale-journal fallback: uninstall on a machine where the journal is absent → falls through to wipe with warning.
- Replay: uninstall twice produces the same end state; second run reports "already uninstalled" per row.
- Per-agent matrix: 8 × (install → uninstall → empty → reinstall → uninstall × 2) = ≥ 48 scripted assertions.

**Pre-merge skills**: `compound-engineering:review:correctness-reviewer`, `compound-engineering:review:reliability-reviewer`, `compound-engineering:review:security-reviewer`, `compound-engineering:review:data-integrity-guardian` (hand-edit drift = data integrity), `agent-skills:cli-readiness-reviewer`, `compound-engineering:ce-review` persona panel.

**Estimate**: 1 day (depends on PR 16 install-journal landing first).

### PR 15–17 combined

- Total estimate: **~4.5 days + 1 day buffer = 5.5 days**.
- Sequencing: PR 15 ships first standalone. PR 16 + PR 17 land as a coherent pair right before PR 13 (so PR 13's `fulcrum install apply` CLI has the lifecycle primitives to build on, not after-the-fact).
- Also: **operator-task at PR 15/16 review time — file upstream uninstall-feature issues against Codex CLI, opencode, and PI cockpit** (§Q2 — standard OSS citizenship; we keep our workaround until upstream ships). One issue per host titled `"feat: add \`<tool> uninstall <plugin>\` command"`, linking to our fallback code.

### PR 15–17 design decisions (locked via research, 2026-04-20)

Five design questions researched against industry standards — recommendations adopted directly, no user preference requested:

| # | Question | Decision | Source |
|---|---|---|---|
| Q1 | Install-journal location | Split by scope: global → `${XDG_STATE_HOME:-$HOME/.local/state}/fulcrum/install/<agent>.jsonl`; project → `./.fulcrum/install.jsonl` (directory). Matches Homebrew/dpkg/npm co-location convention; XDG_STATE_HOME is spec-correct for journals. | XDG Base Dir spec v0.8; Homebrew `INSTALL_RECEIPT.json`; dpkg `/var/lib/dpkg/` |
| Q2 | File upstream uninstall-feature issues | Yes — file against Codex CLI, opencode, PI. Pattern: one issue per host, link to our workaround. Remove workaround when upstream ships. | AOSP upstream-contribution guide |
| Q3 | Hand-edit drift policy | dpkg two-verb model: default `uninstall` preserves drifted files (renames to `<file>.fulcrum-orphan`); `uninstall --purge` force-removes regardless of drift. No interactive prompt (breaks CI). | `dpkg(1)` / Debian `conffile` handling |
| Q4 | `--global` vs `--project` flag | Explicit mutually-exclusive flags with per-agent defaults (npm model). Default: Claude/Gemini/Codex/PI → `--global`; opencode/Cursor/Windsurf/Copilot → `--project`. Always log chosen scope. | npm `-g` convention; mise/asdf sub-verbs |
| Q5 | Shared-file uninstall policy | Marker-block strip only. Never delete shared files (even if empty post-strip). Reserve deletion for `--purge` AND only for files Fulcrum itself created (journal-tracked). | Ansible `blockinfile`; dpkg `conffile`; nvm installer; chezmoi |

---

## Open Questions (track in -progress.md as we hit them)

1. **Codex / Gemini skill prefix** — keep `fulcrum-` prefix on Codex and Gemini skill dirs (shared namespaces)? **→ Default: keep.** Confirm at PR 1.
2. **opencode non-blocking nudge return shape.** ~~Re-fetch~~ **→ RESOLVED 2026-04-19 (v3.1):** no `additionalContext` non-blocking return exists. `tool.execute.before` is throw-to-block OR `output.args` mutation ONLY. Layer-3 becomes **state-conditional content in layer-2 rider** (plugin reads `recall_turn_state`; if grep-without-recall, next turn's rider via `experimental.chat.system.transform` + `session.idle` fallback embeds the nudge sentence).
3. **PR 8 role-switching UX on PI** — cockpit-internal state vs mid-session MCP profile change? **→ Slash command updates cockpit-internal state + UI; MCP profile change via env var only.**
4. **Windsurf global 6k budget** — can Fulcrum-first + lifecycle + role summary fit? **→ Measure at PR 2; if overflow, workspace-only.**
5. **PI cross-harness skill consumption** — PI reads `~/.claude/skills/` natively. **→ PR 1 unit for PI is a no-op.**
6. **Hook volume under burst agentic mode** — v2 widened budget to 3000/session; real measurement at PR 3/7.
7. **Plan v3 persona re-pass** — PR 0 unit 0.5 gate before PR 1.
8. **Copilot public-repo detection method** — gh CLI / GitHub API / assume-public. **→ gh CLI first; else network probe; else assume public.**
9. **opencode hidden-subagent vs `/skill:<name>` dynamic command** — subagents (AD-7 default) vs slash commands. **→ Subagents.**
10. **(v3) npm publish scope.** ~~Decision at PR 14 start~~ **→ RESOLVED 2026-04-19 (v3.1): `@fulcrum-agent-os/*`.** Publish targets: `@fulcrum-agent-os/opencode-plugin`, `@fulcrum-agent-os/pi-cockpit`. PR 14.0 added: register the npm org with 2FA + publish-only CI tokens. Typo-squat placeholder reservations DROPPED in v3.2 (scope-guardian finding — premature hardening).
11. **(v3) Claude marketplace hosting.** ~~Local vs public URL~~ **→ RESOLVED 2026-04-19 (v3.1): GitHub repo root.** `.claude-plugin/marketplace.json` lives at the `moabualruz/fulcrum` repo root (separate from the plugin manifest at `agent-integration/claude/.claude-plugin/plugin.json`). Users: `/plugin marketplace add moabualruz/fulcrum`. The marketplace entry's `source` field points at `./agent-integration/claude` to locate the plugin manifest. Public marketplace URL hosting stays deferred to v4+.
12. **(v3) Codex `codex plugin install` command existence.** ~~Research-owed~~ **→ RESOLVED 2026-04-19 (v3.1): does NOT exist.** Confirmed via `developers.openai.com/codex/plugins` docs research. Only install path is interactive TUI (`codex /plugins`). AD-10 Codex row updated. PR 14.2 branch (b) is the ship path: document status-quo; post-install prints `Fulcrum is installed for Codex. Run 'codex' then '/plugins' to verify/manage in the TUI.` install.ts keeps piece-by-piece install.
13. **(v3) PI npm scope + authorization path.** ~~Verify npm peerDeps semantics~~ **→ RESOLVED 2026-04-19 (v3.1): npm does NOT validate peerDep ownership.** Confirmed via `docs.npmjs.com` research. Publishing `@fulcrum-agent-os/pi-cockpit` with `peerDependencies: "@mariozechner/pi-coding-agent": "*"` + `publishConfig.access: public` is allowed.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Fan-out transform silently drops a skill | AD-6 property test; CI fails on drop. |
| Soft hook gate too chatty | `recall_turn_state` session scope; cooldown; `FULCRUM_NO_RECALL_NUDGE=1`. |
| Gemini 11-event load > budget | PR 7 load test; lifecycle fast-path; tool-event budget 20ms. |
| Windsurf 12k truncation mid-sentence | Replaced with hard lint error; no truncation. |
| opencode `experimental.*` hook deprecated | AD-3 fallback + `opencode.md` second ground truth. |
| New installers break dry-run | Dry-run parity test in every installer PR. |
| User edits outside Fulcrum marker; install blows away | Marker discipline; regression test. |
| PI cross-harness skill consumption breaks on PI settings schema change | Fallback: emit to `~/.pi/agent/skills/`. |
| Rider tampering (opencode) | SHA-256 lockfile; fail-open warning (AD-9a). |
| Session_id forgery | Validation against `agent_runs` (AD-9b). |
| Fulcrum content leaks publicly via Copilot push | Public-repo detection + sanitized variant (AD-8, AD-9). |
| Windsurf global rules pollute other-user sessions | `--global` opt-in + confirm (AD-9c). |
| Hook stderr leaks paths into CI logs | Sanitized error handler (AD-9d). |
| Secrets in canonical SKILL.md / RULE.md | Secret-scan at parse (AD-9e). |
| Layer-3 hook gate is theater (adversarial persona) | PR 3 empirical pass-rate test; deprecate as follow-up if < 20pp delta. |
| **(v3) npm publish failure mid-release** | Publish smoke runs `--dry-run` nightly; real publish runs the full tarball build + integrity gate first (PR 14 unit 14.7). Rollback: `npm unpublish` within 72h if content-sensitive. |
| **(v3) Published package diverges from repo source** | CI integrity gate compares tarball output to repo source (PR 14 unit 14.7). Release tags are the only version source; manual `npm publish` outside the tag workflow is prohibited. |
| **(v3) Claude marketplace install path fails on older Claude CLI** | Dual-mode installer; `--auto` probes version; falls back to manual with a clear "Claude CLI too old for `/plugin install`" message. Explicit version-minimum in `plugin.json`. |
| **(v3) Codex `codex plugin install` doesn't exist** | PR 14.2 branch (b): document status-quo; AD-10 row becomes explicit "marketplace-registration-only, no install-command." Not a blocker — Fulcrum still installs via the existing manual pieces; PR 14 just adds honest documentation. |
| **(v3) npm scope squatting / typo risk** | Publish with the scope decided at PR 14 Open Q #10. Register any near-typos as placeholder packages if scope is personal. Or adopt a reserved org scope (`@fulcrum-agent-os`). |

---

## Timeline estimate

Rough, one engineer, no heavy blockers.

| PR | Effort |
|---|---|
| 0 | 1 day (v3 persona re-pass + approval) |
| 1 | 3 days (fanout package + 8 emit modules + property tests) |
| 2 | 1 day (canonical rules text) |
| 3 | 3 days (3-agent hook + SQLite + load tests) |
| 4 | 3 days (opencode plugin + integrity + fallback + opencode.md flip) |
| 5 | 2 days (Claude hook parity 4 events + sub-agent MD prologue) |
| 6 | **5 days** (Codex deep integration — UserPromptSubmit + PermissionRequest + prompt/agent handler types + skill fanout 6→33 + openai.yaml sidecars + full `.codex-plugin/plugin.json` interface block + shared `.claude-plugin/marketplace.json` with Claude + app-server `config/mcpServer/reload` + `skills/list` RPCs. v3.3 rescoped 2026-04-20 per Codex research pass — was 1 day for 4 units) |
| 7 | 3 days (Gemini 11-event + policies + 24 sub-agent MDs) |
| 8 | 3 days (PI cockpit + role-switching UX) |
| 9 | 2 days (opencode 33 hidden subagent MDs) |
| 10 | 3 days (Copilot installer + public-repo guard + sanitized variant) |
| 11 | 2 days (Cursor 33 MDCs) |
| 12 | 3 days (Windsurf installer + workflows + global opt-in) |
| 13 | 2 days (install apply CLI + verify + demo reel) |
| **14** | **3 days** (plugin-standard packaging — RESTORED IN SCOPE 2026-04-20; opencode npm scaffold already landed in PR 4 unit 4.8) |
| **15** | **1.5 days** (`fulcrum install wipe` — one-shot cleanup; v3.3 added 2026-04-20) |
| **16** | **2 days** (sanitize `install.ts` — unify native/manual vocabulary + install journal + managed-marker discipline; v3.3 added 2026-04-20) |
| **17** | **1 day** (`fulcrum install uninstall` — dpkg-style two-verb CLI; v3.3 added 2026-04-20; depends on PR 16) |

Total: **~43.5 focused engineering days** (v3.3 revised 2026-04-20 — PR 14 restored + PR 15/16/17 install lifecycle added + PR 6 rescoped from 1d to 5d for Codex deep integration per research pass). Buffer for review + regressions: ~10 days. Shippable increment per PR. PR 3 measurement spike is a 2-week calendar window inside the 3-day PR 3 estimate — development is ~3 days, but the empirical gate for PRs 4-12 adds real time before fanout begins.

PR 15/16/17 sequencing: PR 15 ships standalone (operator utility to reset current state); PR 16 + PR 17 land as a coherent pair right before PR 13 so `fulcrum install apply` has the lifecycle primitives to build on.

---

## Approval checklist (v3.3)

- [x] User approves v3.3 phased breakdown (2026-04-20 — "Apply recommendations and proceed").
- [x] Persona re-pass on v3 recorded in PR 0 ledger entry — 5 personas v3.1→v3.2; product-lens + design-lens v3.2→v3.3; research pass 2026-04-20 folded.
- [x] ~~PI provenance~~ — `@mariozechner/pi-coding-agent`.
- [x] ~~Parity scope~~ — feature-for-feature; native subagents map onto Fulcrum roles.
- [x] ~~Agent set~~ — 8 agents.
- [x] ~~Drift framing~~ — canonical source exists; fan-out extends to 5 new shapes.
- [x] ~~Skills / rules split~~ — HARD constraint #13.
- [x] ~~Layer multiplicity~~ — AD-2 per-agent layer table.
- [x] ~~Security constraints~~ — #14-18 + AD-8 + AD-9.
- [x] ~~Skill utilization~~ — mapped per PR.
- [x] ~~**Plugin-standard packaging (v3)**~~ — AD-10 + PR 14 + Critical Constraints #19-20. **v3.3 revised 2026-04-20: full scope RESTORED. PR 14 units 14.0–14.10 all in scope.**
- [x] ~~Open Question #10 (npm publish scope)~~ — **`@fulcrum-agent-os/*`** (v3.1 user decision). Used for opencode (PR 4 + PR 14.3) and PI (PR 14.4).
- [x] ~~Open Question #11 (Claude marketplace hosting)~~ — **GitHub repo root at `moabualruz/fulcrum`** (v3.1). **v3.3 revised 2026-04-20: in scope via PR 14.1.**
- [x] ~~Open Question #12 (Codex plugin install)~~ — **does not exist; status-quo + TUI path** (v3.1). **v3.3 revised 2026-04-20: ship status-quo via PR 14.2.**
- [x] ~~Open Question #13 (npm peerDeps publish)~~ — **npm does not validate; publish allowed** (v3.1). **v3.3 revised 2026-04-20: used in PR 14.4.**
- [x] ~~Open Question #2 (opencode non-blocking return)~~ — **state-conditional rider, not separate hook** (v3.1).
- [x] **R1 (v3.3)**: PR 3 scoped as measurement spike on Claude Code only; PRs 4-12 gated on ≥20pp delta. Variant A (rule + advisory hook) vs Variant B (passive-injection per AD-11).
- [x] ~~**R2 (v3.3)**: PR 14 deferred to v4 except opencode npm publish absorbed into PR 4 unit 4.8.~~ **RESCINDED 2026-04-20** per user directive — the auto-deferral of 14 items without explicit multi-item sign-off was over-scoped. R2 is withdrawn; full PR 14 scope is in v3.3. Research caveats from R2 (Claude marketplace update jank, zero PI demand, Codex no-install-CLI) stay as **PR-time design caveats**, not scope-exclusion grounds.
- [x] **R3 (v3.3)**: AD-11 added (passive-injection alternative). Evaluated during PR 3 spike.
- [x] **R4 (v3.3)**: research-owed items for Claude marketplace + Codex TUI resolved + folded into legacy PR 14 reference for v4.
- [ ] **R5 (v3.3)**: design-lens gaps folded opportunistically at PR 13 time (enumerate install failure modes + post-install copy + per-PR unit IDs).
- [ ] **R6 (v3.3)**: Copilot rule-only asymmetry documented in PR 10's install-paths doc.
- [ ] Plan v3.3 ledger entry committed.
- [ ] npm org `@fulcrum-agent-os` registered with 2FA + publish-only CI tokens (PR 14.0 — operator out-of-band).
- [ ] `SECURITY.md` authored at repo root documenting Constraints #21 + #22 posture (PR 14.0 companion).
- [ ] Claude marketplace `source:` schema verified against current Claude Code docs (PR 14.1 research — resolved 2026-04-20: resolves relative to marketplace root dir, `owner: {name, email?}` only, relative paths only via git-add not URL-add).
- [ ] Codex `/plugins` TUI reads filesystem marketplace entries verified (PR 14.2 research — resolved 2026-04-20: reads `~/.agents/plugins/marketplace.json`; install-state in `~/.codex/config.toml [plugins."<name>@<marketplace>"]`).
- [ ] `@fulcrum/cockpit` npm history checked (PR 14.4 — verify no legacy conflict before publishing `@fulcrum-agent-os/pi-cockpit`).
- [ ] `.github/workflows/publish-cockpit.yml` renamed to `publish-pi-cockpit.yml` with `pi-cockpit/v*` tag namespace (PR 14.4).
- [ ] `docs/architecture/install-paths.md` authored (PR 14.6).
- [ ] Published-package integrity CI gate wired (PR 14.7).
- [ ] Post-pack tarball secret scan workflow step (PR 14.9).
- [ ] CHANGELOG per publish-candidate package + semver version-bump discipline (PR 14.10).
- [ ] **PR 15/16/17 install-lifecycle set** — user directive 2026-04-20: add wipe → sanitize → uninstall PRs at the tail of v3.3. 5 design questions researched 2026-04-20 (§PR 15–17 design decisions table); recommendations applied directly. PR 15 ships first standalone; PR 16/17 land as a coherent pair right before PR 13.
- [ ] File upstream uninstall-feature issues against Codex CLI, opencode, PI cockpit (§Q2 — operator task during PR 15/16 review window; standard OSS citizenship).

---

## Handover doc reference

- Handover: `docs/handover/2026-04-19-agent-parity-handover.md`.
- Reference plan shape: `docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md`.
- Progress ledger: `docs/plans/2026-04-19-004-agent-parity-progress.md`.
- Resume prompt: `docs/plans/2026-04-19-004-agent-parity-prompt.md`.
- Per-agent reference docs: `docs/reference/2026-04-19-<agent>-extension-surface.md`.
- Fulcrum MCP tool surface: `packages/cli/src/mcp-tools.ts` (32 tools).
- Install entry: `agent-integration/install.ts` (to be refactored across PRs 1/10/12/13/14).
- Skill source: `agent-integration/skills/` (33 `SKILL.md` files plus `roles/` role catalog).
- Rule source (NEW in PR 2): `agent-integration/rules/`.
- Claude plugin manifest: `agent-integration/claude/.claude-plugin/plugin.json`.
- Codex plugin manifest: `agent-integration/codex/plugin/.codex-plugin/plugin.json`.
- Codex marketplace: `agent-integration/codex/marketplace.json`.
- Gemini extension manifest: `agent-integration/gemini/gemini-extension.json`.
- opencode plugin package: `agent-integration/opencode/package.json`.
- PI cockpit package: `agent-integration/pi/cockpit/package.json`.
- Memory v3 plan (reference shape): `docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md`.
- v1 persona-sweep findings: folded into AD-8 / AD-9 / Critical Constraints #13-18 / Risks.
- v3 user-raised gap: folded into AD-10 / Critical Constraints #19-20 / PR 14 / Open Questions #10-13 / Risks.
