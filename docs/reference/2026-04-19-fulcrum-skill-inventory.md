---
title: "Fulcrum agent-parity plan — complete skill inventory + per-PR maximization map"
type: reference
date: 2026-04-20
origin: referenced by docs/plans/2026-04-19-004-agent-parity-prompt.md; co-evolves with docs/plans/2026-04-19-004-agent-parity-plan.md
---

# Skill inventory + per-PR maximization map

Authoritative list of every skill + subagent available in this session, mapped to the PRs they serve. The resume prompt at `docs/plans/2026-04-19-004-agent-parity-prompt.md` consults this file; keep them in sync when either moves.

---

## Part 1 — Skill inventory (grouped by purpose)

### 1.1 Always-on (fire at the named moment, every PR, every unit)

| Skill | When | Why |
|---|---|---|
| `agent-skills:context-engineering` | Unit start | Load only files the unit touches; refuse guesswork on stale snapshots. |
| `agent-skills:incremental-implementation` | Unit design | Thin vertical slices; ~500 LOC soft cap per PR. |
| `agent-skills:test-driven-development` | Before any implementation | Failing test first; every behavioral change has a committed regression test. |
| `agent-skills:code-review-and-quality` | Before committing | 5-axis self-review (correctness / readability / architecture / security / performance). |
| `agent-skills:source-driven-development` + `find-docs` | Before touching any external library API | Training data stale; verify current signature. |
| `andrej-karpathy-skills:karpathy-guidelines` | Throughout | Surgical changes; no speculative abstractions; verifiable success. |
| `episodic-memory:remembering-conversations` | Session start + before any judgment call | Search prior sessions via search-conversations subagent; inherit context not in live conversation. |
| `compound-engineering:git-commit` | At commit time | Value-communicating commit messages; conventional format. |
| `compound-engineering:ce-pr-description` | When opening a PR | Value-first PR body. |
| `compound-engineering:ce-review` | Before merge on any PR ≥50 LOC | Persona-tiered review pipeline. |
| `agent-skills:git-workflow-and-versioning` | Before any commit | Atomic commits; clean history. |

### 1.2 Design / planning skills

| Skill | When | Why |
|---|---|---|
| `agent-skills:spec-driven-development` | New feature or PR 0 | The plan IS the spec; ensure requirements + acceptance criteria exist. |
| `agent-skills:planning-and-task-breakdown` | Starting any PR | Break into verifiable chunks with dependency ordering. |
| `agent-skills:api-and-interface-design` | Any public surface change | Public contracts designed deliberately; stable error codes. |
| `compound-engineering:ce-plan` | Plan authoring / deepening | Structured plan for any multi-step task. |
| `compound-engineering:ce-brainstorm` | Requirements vague | Explore options before locking. |
| `compound-engineering:ce-ideate` | Brainstorm feels stuck | Generate grounded improvement ideas with evaluation. |
| `agent-skills:idea-refine` | Very early refinement | Divergent + convergent thinking on an idea. |
| `compound-engineering:agent-native-architecture` | Designing agent-facing surfaces | Every action an agent can take = action a user can also take (mirror rule). |

### 1.3 Research skills

| Skill / subagent | When | Why |
|---|---|---|
| `find-docs` | Any library / framework / CLI question | MANDATORY — training data stale. |
| `compound-engineering:research:framework-docs-researcher` | Deep docs needed | Pulls official framework docs with implementation patterns. |
| `compound-engineering:research:repo-research-analyst` | "Does this already exist?" | Before implementing new, check repo. |
| `compound-engineering:research:git-history-analyzer` | "Why was this code added?" | Archaeological context. |
| `compound-engineering:research:learnings-researcher` | "Have we hit this before?" | Search docs/solutions/ for institutional knowledge. |
| `compound-engineering:research:session-historian` | "What did I try last time?" | Search prior CLI-agent sessions. |
| `compound-engineering:research:best-practices-researcher` | External standards needed | Industry standards + community conventions. |
| `compound-engineering:research:issue-intelligence-analyst` | Pattern in reported bugs | GitHub issue analysis. |
| `compound-engineering:ce-sessions` | User references "last time" | Question-answerable search over prior sessions. |
| `compound-engineering:ce-slack-research` | Team-org context needed | Cross-cutting Slack synthesis. |

### 1.4 Skills for writing code (by domain)

| Skill | When | Why |
|---|---|---|
| `agent-skills:security-and-hardening` | User input / auth / data / external APIs | OWASP prevention + input validation + least privilege. |
| `agent-skills:performance-optimization` | Performance budget named | Measure first; profiled before tuning. |
| `agent-skills:debugging-and-error-recovery` | Tests fail / unexpected behavior | Reproduce → localize → fix → guard. |
| `agent-skills:deprecation-and-migration` | Removing / migrating old systems | Migration IS a deprecation. |
| `agent-skills:code-simplification` | Refactoring for clarity | Behavior-preserving simplification. |
| `agent-skills:frontend-ui-engineering` | User-facing UI | Production-quality UI with a11y (N/A this plan). |
| `agent-skills:ci-cd-and-automation` | CI pipelines | Automated quality gates. |
| `agent-skills:shipping-and-launch` | Pre-deploy | Pre-launch checklist + monitoring + rollback. |
| `agent-skills:browser-testing-with-devtools` | Browser surface | DOM inspection + console + network (N/A this plan). |

### 1.5 Skills for writing prose / rules / prompts

| Skill | When | Why |
|---|---|---|
| `codex:gpt-5-4-prompting` | Authoring structured-output LLM prompts; authoring rule text that must carry meaning across transforms | **LOAD-BEARING for PR 2 + PR 11 + PR 12** (per-agent rule text translation). |
| `elements-of-style:writing-clearly-and-concisely` | Any user-facing prose | Strunk-style clarity. |
| `compound-engineering:every-style-editor` | Editorial pass on copy | Line-by-line grammar + Every style guide. |
| `agent-skills:documentation-and-adrs` | ADR per architecture decision; reference docs | Document decisions + context. |
| `compound-engineering:onboarding` | ONBOARDING.md update | Regenerate for new contributors. |

### 1.6 Review skills (pre-merge)

**Always-on (fire on every PR before merge):**
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:maintainability-reviewer`
- `compound-engineering:review:testing-reviewer`
- `compound-engineering:review:project-standards-reviewer`

**Conditional (fire when criteria match):**

| Reviewer | Condition |
|---|---|
| `compound-engineering:review:adversarial-reviewer` | Diff ≥50 LOC OR touches auth/data/IO |
| `compound-engineering:review:api-contract-reviewer` | Public API / schema / exported type changes |
| `compound-engineering:review:data-integrity-guardian` | DB migrations / persistent data |
| `compound-engineering:review:data-migration-expert` | ID mappings / column renames / enum conversions |
| `compound-engineering:review:data-migrations-reviewer` | Migration files / backfills |
| `compound-engineering:review:schema-drift-detector` | schema.rb / schema.ts changes without matching migration |
| `compound-engineering:review:deployment-verification-agent` | Production data / migrations / risky changes |
| `compound-engineering:review:security-reviewer` | Auth / public endpoints / untrusted input |
| `compound-engineering:review:security-sentinel` | Full security audit (OWASP) |
| `compound-engineering:review:reliability-reviewer` | Error handling / retries / timeouts / async / background jobs |
| `compound-engineering:review:performance-reviewer` | DB queries / loops / caching / I/O paths |
| `compound-engineering:review:performance-oracle` | Algorithmic complexity deep-dive |
| `compound-engineering:review:julik-frontend-races-reviewer` | Async UI / Stimulus/Turbo / DOM-timing |
| `compound-engineering:review:cli-readiness-reviewer` | CLI command definitions / argument parsing |
| `compound-engineering:review:cli-agent-readiness-reviewer` | CLI designed for agents (severity rubric) |
| `compound-engineering:review:kieran-typescript-reviewer` | TypeScript code (strict bar) |
| `compound-engineering:review:kieran-python-reviewer` | Python code |
| `compound-engineering:review:kieran-rails-reviewer` | Rails app code |
| `compound-engineering:review:dhh-rails-reviewer` | Rails architectural choices |
| `compound-engineering:review:previous-comments-reviewer` | PR with existing review threads |
| `compound-engineering:review:pattern-recognition-specialist` | Pattern / anti-pattern / dedup audit |
| `compound-engineering:review:code-simplicity-reviewer` | Final simplification pass |
| `compound-engineering:review:agent-native-reviewer` | UI features / agent tools — parity check |

**Subagent review variants (dispatched via Agent tool):**
- `agent-skills:code-reviewer` (full 5-axis; deeper than self-review)
- `agent-skills:security-auditor` (vulnerability detection; hardening)
- `agent-skills:test-engineer` (test strategy + coverage analysis)

### 1.7 Document-review personas (pre-merge on plans / specs / docs)

Dispatchable via Agent tool for plan / spec / ADR / handover review:

| Persona | Lens |
|---|---|
| `compound-engineering:document-review:adversarial-document-reviewer` | Challenges premises; surfaces unstated assumptions |
| `compound-engineering:document-review:coherence-reviewer` | Internal consistency; terminology drift; ambiguity |
| `compound-engineering:document-review:feasibility-reviewer` | Will the proposed approach survive implementation? |
| `compound-engineering:document-review:scope-guardian-reviewer` | Scope alignment; unjustified complexity |
| `compound-engineering:document-review:security-lens-reviewer` | Security gaps at the plan level |
| `compound-engineering:document-review:product-lens-reviewer` | Senior product-leader lens; premise + strategic consequences |
| `compound-engineering:document-review:design-lens-reviewer` | Information architecture + interaction states + AI-slop risk |

### 1.8 Codex-specific helper skills

| Skill | When |
|---|---|
| `codex:rescue` | Stuck after one diagnosis / fix attempt. Dispatch Codex for independent second opinion. |
| `codex:setup` | Verifying local Codex CLI state |
| `codex:codex-cli-runtime` | Subprocess contract for `codex exec --json --output-schema` |
| `codex:codex-result-handling` | Parse Codex JSONL event stream into structured output |
| `codex:gpt-5-4-prompting` | Compose Codex / GPT-5.4 prompts with delimiter discipline |

### 1.9 Claude Code ecosystem helper skills

| Skill | When |
|---|---|
| `superpowers-developing-for-claude-code:working-with-claude-code` | Authoritative Claude Code docs (hooks / skills / sub-agents / plugins / marketplace / etc.) |
| `superpowers-developing-for-claude-code:developing-claude-code-plugins` | Creating / modifying / releasing Claude Code plugins |

### 1.10 Git / workflow / shipping skills

| Skill | When |
|---|---|
| `compound-engineering:git-commit` | Committing changes |
| `compound-engineering:git-commit-push-pr` | Commit + push + open PR in one flow |
| `compound-engineering:git-clean-gone-branches` | Post-merge branch cleanup |
| `compound-engineering:git-worktree` | Parallel development setup |
| `compound-engineering:ce-demo-reel` | Capture GIF for PR body |
| `compound-engineering:ce-compound` | Document a solved problem |
| `compound-engineering:ce-debug` | Systematic root-cause |
| `compound-engineering:ce-optimize` | Metric-driven iterative loops |
| `compound-engineering:ce-work` | Execute work efficiently while maintaining quality |
| `compound-engineering:todo-resolve` | Batch-resolve approved todos |
| `compound-engineering:proof` | Create / comment on Proof docs |

### 1.11 Fulcrum-native actions (CLI / MCP — use when hooks are unavailable)

- `fulcrum-memory` — search Fulcrum agent memory
- `fulcrum-run` — start / check / complete an agent run
- `fulcrum-status` — workspace status
- `fulcrum-task` — create / update task

**MCP tools (the 32 tools at `packages/cli/src/mcp-tools.ts`):** `mcp__fulcrum__*` — prefer these over `fulcrum action exec` when the MCP server is running.

### 1.12 Subagents dispatchable via Agent tool (full list)

**Specialist engineering agents:**
`Analyst`, `Architecture Reviewer`, `Browser Worker`, `Chief of Staff`, `Code Reviewer`, `Context Gatherer`, `Data Engineer`, `DevOps Engineer`, `Documentation Writer`, `Implementation Planner`, `Integration Worker`, `Issue Decomposer`, `Memory Curator`, `ML Engineer`, `Orchestrator`, `PRD Planner`, `Product Manager`, `QA Engineer`, `Refactor Worker`, `Research Worker`, `Security Reviewer`, `Software Engineer`, `Tech Lead`.

**Exploration agents:** `Explore` (fast codebase search), `Plan` (architect), `general-purpose`.

**Compound-engineering personas** (see 1.6 + 1.7 above).

### 1.13 Utility / one-shot skills

| Skill | When |
|---|---|
| `simplify` | Review changed code for reuse / quality / efficiency + fix |
| `fewer-permission-prompts` | Pattern common Bash / MCP calls into allowlist |
| `update-config` | Modify settings.json / hooks / env |
| `keybindings-help` | Customize keyboard shortcuts |
| `loop` | Recurring task |
| `schedule` | Cron-style recurring agents |
| `claude-api` | Build/debug/optimize Claude API apps (N/A this plan — we don't touch the API) |
| `agent-browser` | Browser automation |
| `playwright-cli` | Playwright browser tests |
| `tavily-*` | External web research (use find-docs first) |

---

## Part 2 — Per-PR skill maximization map

Each PR lists: load-bearing skills, conditional skills, subagents for pre-merge, and skills-to-skip (so the agent is explicit about what NOT to invoke).

### PR 0 — Reference docs + plan + approval gate

**Load-bearing:**
- `agent-skills:spec-driven-development` — plan IS the spec.
- `compound-engineering:document-review` — 7 personas in parallel (adversarial + coherence + feasibility + scope-guardian + security-lens + product-lens + design-lens).
- `agent-skills:documentation-and-adrs` — ADR per AD-1 through AD-10.
- `elements-of-style:writing-clearly-and-concisely` — Strunk pass.
- `compound-engineering:every-style-editor` — editorial pass on rule text.

**Conditional:**
- `compound-engineering:research:session-historian` — pull prior-session context if available.
- `compound-engineering:ce-sessions` — search history for plan-related work.

**Skip:** any implementation skill. PR 0 produces docs only.

### PR 1 — `packages/agent-fanout` + canonical source extension

**Load-bearing:**
- `agent-skills:api-and-interface-design` — canonical source shape is public contract.
- `agent-skills:test-driven-development` — property test (per-skill identity + idempotency) first.
- `agent-skills:incremental-implementation` — 14 units; one commit per.
- `agent-skills:source-driven-development` + `find-docs` — yaml / gray-matter / @iarna/toml current APIs.
- `compound-engineering:research:repo-research-analyst` — verify symlink topology intact.
- `compound-engineering:research:framework-docs-researcher` — deep docs on any new lib.
- `agent-skills:deprecation-and-migration` — no symlink-dismantle.
- `andrej-karpathy-skills:karpathy-guidelines` — surgical; no speculative abstractions.

**Pre-merge reviewers (dispatch in parallel after diff ≥50 LOC):**
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:maintainability-reviewer`
- `compound-engineering:review:testing-reviewer`
- `compound-engineering:review:api-contract-reviewer`
- `compound-engineering:review:kieran-typescript-reviewer`
- `compound-engineering:review:pattern-recognition-specialist`
- `compound-engineering:review:code-simplicity-reviewer`
- `compound-engineering:review:project-standards-reviewer`
- Subagent: `agent-skills:test-engineer` — review test coverage.

**Skip:** UI / performance / data-migration / security-sentinel (no security-sensitive surface).

### PR 2 — Canonical rules text

**Load-bearing:**
- `codex:gpt-5-4-prompting` — **LOAD-BEARING.** Compose rule text before any emit transform locks in.
- `elements-of-style:writing-clearly-and-concisely` — hot-path user-facing prose.
- `compound-engineering:every-style-editor` — editorial pass.
- `agent-skills:documentation-and-adrs` — rules are architectural decisions codified as prose.

**Pre-merge reviewers:**
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:project-standards-reviewer` (matches existing CLAUDE.md convention)
- `compound-engineering:review:maintainability-reviewer`

**Skip:** all TypeScript / data / perf / security reviewers (no code in this PR).

### PR 3 — Cross-agent soft hook gate + `recall_turn_state` SQLite migration

**Load-bearing:**
- `agent-skills:api-and-interface-design` — migration 108 schema.
- `agent-skills:test-driven-development` — per-agent hook + session_id forgery test first.
- `agent-skills:security-and-hardening` — session_id trust boundary.
- `compound-engineering:agent-native-architecture` — nudges introspectable to the agent.
- `agent-skills:performance-optimization` — hook volume budget.

**Pre-merge reviewers:**
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:data-integrity-guardian`
- `compound-engineering:review:data-migrations-reviewer`
- `compound-engineering:review:schema-drift-detector`
- `compound-engineering:review:security-reviewer`
- `compound-engineering:review:security-sentinel`
- `compound-engineering:review:reliability-reviewer`
- `compound-engineering:review:performance-reviewer`
- `compound-engineering:review:adversarial-reviewer` (hits untrusted input threshold)
- Subagent: `agent-skills:security-auditor` — session_id forgery + recall-state attack surface.
- Subagent: `agent-skills:test-engineer` — load test for hook volume.

**Conditional / helpers:**
- `compound-engineering:ce-debug` — if hook output unexpected.
- `codex:rescue` — if stuck after one root-cause attempt.

### PR 4 — opencode plugin: full layer + integrity + fallback

**Load-bearing:**
- `agent-skills:performance-optimization` — p95 budget `tool.execute.before`.
- `agent-skills:security-and-hardening` — SHA-256 integrity chain.
- `agent-skills:source-driven-development` + `find-docs` — `@opencode-ai/plugin` current API.

**Pre-merge reviewers:**
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:reliability-reviewer`
- `compound-engineering:review:julik-frontend-races-reviewer` — async ordering.
- `compound-engineering:review:security-reviewer` — RIDER integrity.
- `compound-engineering:review:security-sentinel`
- `compound-engineering:review:performance-reviewer`
- `compound-engineering:review:kieran-typescript-reviewer`
- Subagent: `agent-skills:security-auditor` — integrity chain + fallback path.

### PR 5 — Claude Code hook parity (UserPromptSubmit + SessionEnd + Notification + SubagentStop)

**Load-bearing:**
- `agent-skills:api-and-interface-design` — new `fulcrum hook claude <event>` handlers.
- `agent-skills:source-driven-development` + `find-docs` — re-read Claude hooks.md.
- `superpowers-developing-for-claude-code:working-with-claude-code` — authoritative Claude Code docs.

**Pre-merge reviewers:**
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:reliability-reviewer`
- `compound-engineering:review:api-contract-reviewer`
- `compound-engineering:review:kieran-typescript-reviewer`

### PR 6 — Codex UserPromptSubmit hook + rider content

**Load-bearing:**
- `agent-skills:source-driven-development` + `find-docs` — Codex hooks.md.
- `codex:codex-cli-runtime` — subprocess contract.
- `codex:gpt-5-4-prompting` — rider content composition.

**Pre-merge reviewers:**
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:reliability-reviewer`

### PR 7 — Gemini full hook coverage (6→11) + policies + 2→24 sub-agent MDs

**Load-bearing:**
- `agent-skills:api-and-interface-design` — `fulcrum hook gemini` subcommand dispatch.
- `agent-skills:source-driven-development` + `find-docs` — **MANDATORY** re-fetch `docs/hooks/reference.md`.
- `compound-engineering:research:framework-docs-researcher` — if docs still thin.
- `agent-skills:performance-optimization` — volume budget (realistic burst at 2800+/session).

**Pre-merge reviewers:**
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:reliability-reviewer`
- `compound-engineering:review:performance-reviewer`
- `compound-engineering:review:api-contract-reviewer`

### PR 8 — PI cockpit: every event + role-switching UX

**Load-bearing:**
- `compound-engineering:agent-native-architecture` — role-switch contract MCP-introspectable.
- `agent-skills:source-driven-development` — re-verify every PI event against `node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`.
- `agent-skills:api-and-interface-design` — cockpit role-switch contract public surface.

**Pre-merge reviewers:**
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:reliability-reviewer`
- `compound-engineering:review:api-contract-reviewer`
- `compound-engineering:review:kieran-typescript-reviewer`

### PR 9 — opencode native skills: 34 hidden subagent MDs

**Load-bearing:**
- `codex:gpt-5-4-prompting` — per-skill description drives opencode discover-by-description.
- `compound-engineering:agent-native-architecture` — Task-tool invocation discoverable.

**Pre-merge reviewers:**
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:testing-reviewer`
- `compound-engineering:review:api-contract-reviewer`

### PR 10 — Copilot installer + per-skill instructions + public-repo guard

**Load-bearing:**
- `agent-skills:api-and-interface-design` — new `installCopilot()` signature.
- `agent-skills:security-and-hardening` — public-repo detection + sanitized variant.
- `superpowers-developing-for-claude-code:working-with-claude-code` — `.github/instructions/*.instructions.md` convention for path-scoped.

**Pre-merge reviewers:**
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:security-reviewer` — public-repo leak surface.
- `compound-engineering:review:security-sentinel`
- `compound-engineering:review:adversarial-reviewer` (diff likely ≥50 LOC + auth-ish).
- Subagent: `agent-skills:security-auditor` — sanitized-variant correctness.

### PR 11 — Cursor installer expansion + per-skill MDC + core rule

**Load-bearing:**
- `agent-skills:api-and-interface-design` — expanded `installCursor()` contract.
- `codex:gpt-5-4-prompting` — per-skill description text (Cursor Apply Intelligently depends on description-match).
- `find-docs` — Cursor's current `.mdc` frontmatter schema.

**Pre-merge reviewers:**
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:project-standards-reviewer`

### PR 12 — Windsurf installer + per-skill rules + workflows + global opt-in

**Load-bearing:**
- `agent-skills:api-and-interface-design` — new `installWindsurf()`.
- `agent-skills:security-and-hardening` — global rule is multi-user surface.
- `find-docs` — Windsurf rule format.

**Pre-merge reviewers:**
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:security-reviewer`
- `compound-engineering:review:reliability-reviewer`

### PR 13 — `fulcrum install apply` CLI + verify + cleanup + demo reel

**Load-bearing:**
- `agent-skills:shipping-and-launch` — this is the ship PR.
- `compound-engineering:ce-demo-reel` — capture the GIF.
- `agent-skills:code-simplification` + `simplify` + `compound-engineering:ce-pr-description` — final cleanup pass.
- `compound-engineering:onboarding` — ONBOARDING.md refresh.

**Pre-merge reviewers:**
- `compound-engineering:review:cli-readiness-reviewer`
- `compound-engineering:review:cli-agent-readiness-reviewer`
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:maintainability-reviewer`
- `compound-engineering:review:code-simplicity-reviewer`

### PR 14 — Plugin-standard packaging parity

**Load-bearing:**
- `agent-skills:api-and-interface-design` — dual-mode installer contract across 4 agents.
- `agent-skills:source-driven-development` + `find-docs` — **LOAD-BEARING for every one of the 4 agents.** Every plugin-capable agent's install command contract must be re-fetched before wiring.
- `compound-engineering:research:framework-docs-researcher` — for deep fetches.
- `agent-skills:shipping-and-launch` — npm publishes are production releases.
- `agent-skills:security-and-hardening` — published package is public.

**Pre-merge reviewers:**
- `compound-engineering:review:correctness-reviewer`
- `compound-engineering:review:api-contract-reviewer`
- `compound-engineering:review:deployment-verification-agent`
- `compound-engineering:review:security-reviewer`
- `compound-engineering:review:security-sentinel`
- `compound-engineering:review:ci-cd-and-automation` (if exists — else `agent-skills:ci-cd-and-automation` direct)
- Subagent: `agent-skills:security-auditor` — published-package content audit + npm token hygiene.
- `compound-engineering:ce-demo-reel` — capture GIFs of `/plugin install fulcrum@fulcrum` + `pi install npm:@fulcrum-agent-os/pi-cockpit`.

---

## Part 3 — Skill-by-scenario dispatch (cross-PR)

Fire when the condition appears, independent of which PR you're in:

| Scenario | Skill |
|---|---|
| Starting a session | `episodic-memory:remembering-conversations` (search-conversations subagent) |
| About to use an external library API | `agent-skills:source-driven-development` + `find-docs` (MANDATORY) |
| Stuck after one root-cause attempt failed | `codex:rescue` — independent second opinion |
| Pattern exists elsewhere in repo | `compound-engineering:research:repo-research-analyst` |
| "Why was this code added?" | `compound-engineering:research:git-history-analyzer` |
| Diff ≥50 LOC OR touches auth/data/IO | `compound-engineering:review:adversarial-reviewer` pre-merge |
| Unit touches any schema.ts | `compound-engineering:review:schema-drift-detector` + `compound-engineering:review:data-integrity-guardian` |
| Unit touches CLI command definitions | `compound-engineering:review:cli-readiness-reviewer` |
| Unit changes API routes / request-response / exported types | `compound-engineering:review:api-contract-reviewer` |
| Solved a non-trivial bug | `compound-engineering:ce-compound` — capture the lesson |
| Hit an unexpected error | `agent-skills:debugging-and-error-recovery` + `compound-engineering:ce-debug` |
| Metric-driven iteration needed | `compound-engineering:ce-optimize` |
| Pre-launch (PR 13, PR 14) | `agent-skills:shipping-and-launch` + `compound-engineering:review:deployment-verification-agent` |
| Committing | `compound-engineering:git-commit` |
| Opening a PR | `compound-engineering:ce-pr-description` |
| Post-merge (branches left) | `compound-engineering:git-clean-gone-branches` |
| Code feels overcomplicated | `agent-skills:code-simplification` + `simplify` + `compound-engineering:review:code-simplicity-reviewer` |

---

## Part 4 — Skills explicitly NOT used in this plan (and why)

| Skill | Why not |
|---|---|
| `agent-skills:frontend-ui-engineering` | No UI in this plan (cockpit dashboard is out of scope). |
| `agent-skills:browser-testing-with-devtools` | No browser surface. |
| `compound-engineering:frontend-design` | Same. |
| `compound-engineering:design:*` | No design artifacts. |
| `compound-engineering:test-browser` | Same. |
| `playwright-cli` / `agent-browser` | Same. |
| `compound-engineering:dhh-rails-style` / `compound-engineering:review:dhh-rails-reviewer` / `compound-engineering:review:kieran-rails-reviewer` / `compound-engineering:andrew-kane-gem-writer` / `compound-engineering:dspy-ruby` | Wrong stack (Fulcrum is TS monorepo). |
| `claude-api` | Plan touches Claude Code CLI config, not the API. |
| `tavily-*` | Web research via `find-docs` is sufficient. |
| `compound-engineering:ce-slack-research` | No Slack context relevant to this plan's technical decisions. |
| `compound-engineering:gemini-imagegen` / `compound-engineering:proof` | Wrong domain. |
| `compound-engineering:docs:ankane-readme-writer` | Ankane Ruby-gem style, not TS. |
| `compound-engineering:review:kieran-python-reviewer` | No Python. |

---

## Part 5 — File locations

- This inventory: `docs/reference/2026-04-19-fulcrum-skill-inventory.md`
- Plan: `docs/plans/2026-04-19-004-agent-parity-plan.md`
- Progress ledger: `docs/plans/2026-04-19-004-agent-parity-progress.md`
- Resume prompt (consumes this inventory): `docs/plans/2026-04-19-004-agent-parity-prompt.md`
- Per-agent reference docs: `docs/reference/2026-04-19-<agent>-extension-surface.md` (×8)
