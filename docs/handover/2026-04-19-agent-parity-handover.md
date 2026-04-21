---
title: "Handover: cross-agent parity + Fulcrum-first behavioral rules"
type: handover
status: open
date: 2026-04-19
origin: 2026-04-19 session audit of what `pnpm run setup` installs across 5 CLI agents (Claude Code, Codex, Gemini, opencode, PI)
---

# Handover — Agent parity audit + Fulcrum-first behavioral rules

> **Scope of this handover:** DOCUMENT gaps + package context so a fresh
> session can (a) do proper online research for each CLI agent's extension
> surface, (b) write a comprehensive plan, (c) then implement. This handover
> is NOT a plan. The plan is authored in the next session.

## 1. Why this exists

The user asked: "did we install rules for each agent to use Fulcrum for
memory and project search?" Audit today showed the answer is **partial**.

Claude Code + Codex + PI are fully wired with behavioral skills. Gemini +
opencode have the MCP tools + slash commands but no proactive skill/rule
files — the agent only touches Fulcrum when the user manually invokes a
command, not by default. Also: no skill on any agent biases the model
toward `search_code` / `recall_memory` **before** Grep/Glob for code
discovery — that's a gap everywhere.

The user's follow-up flagged a second-order issue: **we aren't even using
the full extension surface each agent exposes**. Specifically:

- Gemini has a hook system we're barely using (only `hooks/hooks.json`
  landed; full event surface unexplored).
- opencode has a plugin system that lets plugins attach to *any native
  operation* — "hooks on steroids" in the user's words. We ship a single
  plugin file and barely use it.
- All CLI agents support some form of agent-file declaration; we don't
  treat them equally.

The goal for the next session: **parity across the board**. Every CLI
agent should be able to "do anything and everything" with Fulcrum, via the
richest extension surface that agent offers. PI's cockpit-specific
primitives are the only legitimate per-agent specialisation.

## 2. State today (audit findings — verified in this session)

### 2.1 What's installed per agent (as of this commit)

| Agent | MCP tools | Hooks | Skills | Sub-agents / roles | Commands | Global context | Plugin |
|---|---|---|---|---|---|---|---|
| **Claude Code** | ✓ user-scope | ✓ 5 events (PreToolUse, PostToolUse, SessionStart, Stop, PreCompact) | ✓ 34 skills in `~/.claude/skills/fulcrum/` | ✓ 24 agent MDs in `~/.claude/agents/` | ✓ 4 slash commands | ✓ `~/.claude/CLAUDE.md` (fulcrum marker block) | — |
| **Codex CLI** | ✓ `~/.codex/config.toml` | ✓ `[[hooks]]` block installed | ✓ 6 `fulcrum-*` skills in `~/.codex/skills/` | ✗ no sub-agent MDs (N/A in codex) | ✗ no codex slash commands | ✓ `AGENTS.md` (project root) | ✓ registered in `~/.agents/plugins/marketplace.json` |
| **PI cockpit** | ✓ via cockpit | (inherits) | ✓ 34 skills (same set as Claude) | ✓ 24 agent roles via cockpit | (cockpit-native) | ✓ cockpit injection | ✓ cockpit IS the plugin |
| **Gemini CLI** | ✓ extension | ⚠ `hooks/hooks.json` landed but unexplored | ✗ **6 `fulcrum-*` skills** (smaller than Claude/PI) | ✓ 2 sub-agent MDs (`fulcrum-cos`, `fulcrum-memory`) | ✓ 6 TOML slash commands | ✓ `GEMINI.md` | — |
| **opencode** | ✓ project-local | ⚠ single plugin file — plugin API under-used | ✗ **no skill/rule dir** | ✗ no sub-agent system detected | ✓ 5 MD slash commands | ✓ `.opencode/opencode.md` (skip-if-exists on install) | ⚠ `.opencode/plugins/fulcrum.ts` — minimal |

### 2.2 Specific gaps identified

**A. No "Fulcrum-first" behavioral bias on any agent.** Every agent is told
*how* to use Fulcrum tools (via skill frontmatter descriptions) but none is
told to prefer Fulcrum for memory / context / file-search operations by
default. The agent will happily `Grep -r "X"` without first calling
`search_code` or `recall_memory`. This is the most important user ask.

**B. Gemini + opencode are behaviorally thin.** Both have the MCP tools
registered, but the agent itself has no proactive-skill dir. Rules only
fire when the user types a slash command. Parity with Claude/Codex/PI
requires skill files.

**C. opencode plugin API is under-used.** User called this out explicitly.
Today we ship one plugin file that does nearly nothing. opencode's plugin
API can intercept every tool call and session event ("hooks on steroids"
per the user). This is a huge unexploited surface.

**D. Gemini hook system is under-used.** We ship `hooks/hooks.json` with a
minimal config. Full event surface (BeforeTool, AfterTool, onSessionStart,
onSessionEnd, onCommandComplete — actual names need verification) is not
mapped.

**E. Skill-count imbalance.** Claude/PI have 34 skills; Codex/Gemini have 6
`fulcrum-*`-prefixed skills; opencode has 0 skills. Even for agents that
DO have a skill dir, the surface area is uneven.

**F. No canonical source of truth.** Each agent-integration dir has its
own copy of skills. `agent-integration/skills/` (for Claude/PI) and
`agent-integration/pi/cockpit/skills/` are byte-identical but maintained by
hand — no sync script. Drift risk is real.

**G. opencode.md is skip-if-exists at install time.** Updates to
`agent-integration/opencode/opencode.md` never reach existing opencode
installs. Same issue exists for any "template" file that install.ts marks
as create-only.

**H. File-search bias: no rule anywhere.** User cares about this: "bias to
use fulcrum 1st for memory ops, context ops, **file search** operations."
None of the 34 existing skills instruct the agent to try `search_code` or
`recall_memory` before `Grep`/`Glob` for code discovery.

**I. PI has no public docs.** 30+ web searches turned up nothing for "PI
coding agent with cockpit system." It appears to be private or
working-name. The cockpit mechanism is visible in this repo
(`agent-integration/pi/cockpit/`) but the tool consuming it is not
publicly documented. Research agent in this session flagged this.
**The next session should confirm with the user whether PI is private,
where its docs live, or whether PI is a name for something else entirely.**

## 3. User's stated intent

Direct quotes from this session, for the next session's record:

> "bias to use fulcrum 1st for memory operations, context operations, file
> search operations"

> "gemini has a hook system and opencode allow plugins to attach to any
> native operation so basically hooks on steroids why we are not using
> that too? Why we are not covering all operations on all agents, i know
> pi has some unique cockpit related ones but other than that they all
> should be able to do anything and everything, all cli agents have some
> kind of support for agents files and declaration that is not also done
> for all equally why we did fail in that area this big?"

Target state: every agent can "do anything and everything" via its native
extension surface. PI cockpit specialisations are the only legitimate
per-agent divergence.

## 4. Where everything lives (file map for the next session)

### Repo structure (source of truth for installs)

```
agent-integration/
├── install.ts                 -- fan-out script; runs via `pnpm run setup`
├── claude/CLAUDE.md           -- Claude Code global context template
├── skills/                    -- Claude + PI shared skill set (34 dirs)
│   ├── <name>/SKILL.md
│   └── index.md               -- TOC
├── codex/
│   ├── AGENTS.md              -- project-root AGENTS.md template
│   ├── config.toml            -- Codex hooks + MCP config
│   ├── marketplace.json       -- plugin registration
│   ├── docs/                  -- ?
│   └── plugin/skills/         -- 6 `fulcrum-*` Codex skills
├── gemini/
│   ├── gemini-extension.json  -- extension manifest
│   ├── GEMINI.md              -- global context
│   ├── hooks/hooks.json       -- hook config (under-used)
│   ├── commands/*.toml        -- 6 slash commands
│   ├── skills/fulcrum-*/      -- 6 skills (smaller than Claude)
│   └── agents/*.md            -- 2 sub-agent MDs
├── opencode/
│   ├── opencode.jsonc         -- config template
│   ├── opencode.md            -- global context (skip-if-exists on install)
│   ├── command/*.md           -- 5 slash commands
│   └── plugins/               -- single TS plugin (under-used)
├── pi/cockpit/
│   ├── package.json           -- has `pi` key for cockpit manifest
│   ├── skills/                -- 34 skills (byte-identical to agent-integration/skills/)
│   ├── index.ts               -- cockpit entry
│   └── tests/
└── roles/                     -- ? (not yet inspected)
```

### Install targets (where things land after `pnpm run setup`)

- Claude Code: `~/.claude/{CLAUDE.md, skills/fulcrum/, agents/, commands/, settings.json}`
- Codex: `~/.codex/{config.toml, skills/}`, project `AGENTS.md`
- Gemini: `~/.gemini/extensions/fulcrum/{GEMINI.md, hooks/, commands/, skills/, agents/, gemini-extension.json}`
- opencode: project `.opencode/{opencode.jsonc, opencode.md, command/, plugins/}`
- PI: `pi install <path>` into PI's own extension dir (location unknown; PI itself is undocumented)

### Files the next session must read first

1. **`agent-integration/install.ts`** — the fan-out mechanism. Understand
   what's skip-if-exists vs overwrite-every-install per agent before
   planning any additions.
2. **`agent-integration/skills/index.md`** — existing skill TOC.
3. **`agent-integration/gemini/hooks/hooks.json`** — current hook config
   to see what we declared.
4. **`agent-integration/opencode/plugins/fulcrum.ts`** — current plugin to
   see what we're doing today (minimal).
5. **`~/.codex/config.toml`** — operator copy; see `[[hooks]]` block shape.
6. **`packages/cli/src/mcp-tools.ts`** — 32 MCP tools + their schemas; the
   tool surface every agent must reach.

## 5. Research the next session needs to do online

The prior session tried to web-fetch the documentation directly and saved
tool-call traces rather than synthesised findings. The next session should
redo research — targeted, with clean syntheses.

### Per-agent extension surfaces to document:

**Claude Code** (`docs.anthropic.com/en/docs/claude-code`):
- Hooks: exact event names, settings.json schema, stdin/stdout contract,
  block vs warn semantics, matcher regex support.
- Sub-agents: `~/.claude/agents/<name>.md` frontmatter, context inheritance
  model, tool allow/deny.
- Skills: `~/.claude/skills/<ns>/<name>/SKILL.md` frontmatter fields
  (especially `user-invocable`), auto-trigger discovery model, references/
  dir convention, `scripts/` convention (bash), allowed tools.
- Slash commands: frontmatter, argument substitution (`$ARGUMENTS`,
  positional), bash execution pattern.
- Plugins + marketplaces: `.claude-plugin/plugin.json`, multi-agent-skill
  bundles, marketplace install flow.
- Status-line / output-styles / keybindings / managed Agent SDK.

**Codex CLI** (`developers.openai.com/codex` + `github.com/openai/codex`):
- `~/.codex/config.toml`: full schema (model, approvalPolicy, mcp_servers,
  hooks, features, sandbox_permissions).
- Hooks: `[[hooks]]` schema, event names, command execution contract.
- Skills: `~/.codex/skills/<name>/SKILL.md` vs plugin-shipped skills.
- Plugins + marketplace.json: plugin bundle shape, install surface.
- Auth modes: chatgpt (current) vs api-key vs device-auth — which models
  each mode accepts via `codex exec -m` vs `codex app-server`.
- `codex app-server`: JSON-RPC protocol, ThreadStartParams, TurnStartParams,
  notification events. (Already partially reverse-engineered in the
  curator refactor.)

**Gemini CLI** (`github.com/google-gemini/gemini-cli`):
- `gemini-extension.json`: full schema.
- `hooks/hooks.json`: every event name, execution contract, can hooks
  block? Can they modify tool input/output?
- Commands TOML schema (unusual format — why TOML not MD?).
- Agents MDs: frontmatter, discovery.
- Skills (does Gemini auto-trigger skills like Claude, or user-only?).
- MCP tool naming (`mcp_fulcrum_*` with underscores — Gemini convention).

**opencode** (`opencode.ai` + `github.com/sst/opencode`):
- **PRIMARY FOCUS per user.** Plugin API: TypeScript types, lifecycle
  events, session/tool interception points. What does "attach to any
  native operation" concretely mean?
- `opencode.jsonc` schema.
- Commands + rules structure.
- Agents (if any).

**PI**:
- First question: **is PI public or private?** Ask the user.
- If public: find its docs, map the same 10-point checklist as the others.
- If private: get the spec from the user or from a private repo they point
  us at.

### Research discipline

- One-shot web fetches or `find-docs` skill — don't send a Research-Worker
  subagent on a 50-call exploration, it wastes tokens and the output is
  unusable. Targeted fetches per URL; synthesise inline.
- Verify every event name + file path against the current version. 2025-26
  docs drift fast; prior ledgers in this repo may cite stale names.

## 6. Known-bad avenues (don't repeat)

- **Research agent dispatch for extension-surface docs** — tried this
  session; returned 280KB of raw tool-call traces with no synthesis. Do
  one-shot WebFetch or `find-docs` skill calls from the main loop instead.
- **"Just add skill files and run setup"** — won't work for opencode
  (skip-if-exists on `opencode.md`, no skills dir) and for PI (private
  tool; can't write cockpit skill specs without knowing PI's conventions).
- **Assuming Gemini's hook schema matches Claude's** — untested. Verify
  before building.

## 7. Open questions the next session must resolve early

1. **PI tool provenance.** Is PI public, private, or a working name? Where
   do its docs live? If it's the tool being *built* in this repo, say so
   — the cockpit spec is in our hands and we design it.
2. **"Parity" definition.** User said "all should do anything and
   everything." Does that mean feature-for-feature across agents, or
   behavioral-rule parity only? If feature-for-feature, opencode needs a
   sub-agent system it doesn't ship natively — is that our problem?
3. **Drift ownership.** Should we consolidate `agent-integration/skills/`
   + `agent-integration/pi/cockpit/skills/` + `agent-integration/gemini/
   skills/` + `agent-integration/codex/plugin/skills/` into a single
   source with fan-out transforms (`fulcrum-`-prefix for codex/gemini), or
   keep the per-agent copies?
4. **opencode.md skip-if-exists.** Should the install flip to overwrite
   with user-diff-preservation, or do we add a separate rules dir
   opencode's plugin loads?
5. **PostToolUse hook volume.** Claude Code's PostToolUse hook fires after
   every tool call. If the next session wires equivalent on Gemini +
   opencode, every keystroke-heavy session will spawn hundreds of hook
   invocations. Budget this before implementing.

## 8. What's NOT in scope for the next session's first pass

Don't implement yet. The next session's sequence is:

1. **Research online** — targeted, per-agent. Produce a clean extension-
   surface reference doc.
2. **Confirm PI provenance with the user.**
3. **Write a comprehensive plan** (`docs/plans/2026-04-19-004-agent-parity-plan.md`)
   following the same shape as `docs/plans/2026-04-18-002-memory-tiered-architecture-plan.md`
   — goal, constraints, skill matrix, phased PR rollout, test strategy,
   open questions.
4. **Stop.** Get user review of the plan before any code changes.

Implementation is a LATER session after plan approval.

## 9. Related prior work (not this PR)

- **Memory v3** — shipped through PR 9 this week. `docs/plans/
  2026-04-18-002-memory-tiered-architecture-plan.md` is the reference for
  plan shape + phased rollout.
- **`fulcrum install plan`** command — exists but is planner-only; no
  `apply` path. The next plan may want to introduce
  `fulcrum install apply` so the fan-out is operator-testable without
  running `pnpm run setup`.
- **MCP smoke test fix** (commit `860268a`) — async `spawn` + kill-on-
  response replacing `spawnSync` + `input:`. Relevant because the pattern
  generalises to any future "does the MCP server actually respond?"
  check we build into per-agent install verification.

## 10. TL;DR for the resuming agent

You are picking up a cross-agent parity audit. Fulcrum installs into 5 CLI
agents (Claude Code, Codex, Gemini, opencode, PI) unevenly. Before any
code, (a) research each agent's full extension surface online, (b)
confirm PI's public/private status with the user, (c) write a plan
matching the memory-v3 plan's shape, (d) stop. The pickup prompt at
`docs/plans/2026-04-19-004-agent-parity-prompt.md` enforces this
sequencing.
