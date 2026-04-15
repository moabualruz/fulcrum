# Skills Files Structure Research

## Industry Best Practices

### The SKILL.md Open Standard (2025–2026)

The SKILL.md pattern has emerged as the de-facto portable skill definition format for LLM agents, adopted by Claude Code, GitHub Copilot (VS Code), OpenCode, and the agentskills.io open spec. Every skill file is a Markdown document with two layers:

1. **YAML frontmatter** between `---` delimiters — the skill's identity and trigger contract
2. **Markdown body** — the procedural playbook the agent executes

#### Required frontmatter fields

| Field | Constraint | Purpose |
|---|---|---|
| `name` | ≤64 chars, `[a-z0-9-]`, must match parent directory | Unique identifier; used as the slash-command slug |
| `description` | ≤1024 chars, non-empty | Primary trigger signal — Claude routes to skills by semantic match on this field |

#### Optional but widely used frontmatter fields

| Field | Values | Purpose |
|---|---|---|
| `tools` / `allowed-tools` | comma-separated tool names | Declares tool access; tools not listed run without prompts |
| `disable-model-invocation` | `true` | User-only; disables LLM auto-invocation (side-effect skills) |
| `user-invocable` | `false` | Claude-only background knowledge; never a slash command |
| `context` | `fork` | Run skill in isolated subagent with clean context window |
| `agent` | `Explore`, etc. | Which agent type to use when forked |
| `triggers` | string list | Explicit trigger conditions (semantic, not algorithmic) |
| `metadata` / `version` | semver string | Authoring metadata; no formal spec enforcement |
| `license` | SPDX string | For community/marketplace skills |

#### What the body should contain (authoritative sources: agentskills.io, Anthropic best practices)

- **Numbered, actionable steps** — not prose paragraphs; each step maps to a concrete tool call or decision
- **Positive and negative examples** ("GOOD: …" / "BAD: …" / "DO NOT DO THIS") — the highest-ROI pattern for reducing model deviation
- **Red flags section** — short self-audit checklist the model runs when a tool call fails; proven to reduce silent failures
- **Cross-links** to related skills using relative paths so the directory is portable
- **Progressive disclosure** — core instructions in SKILL.md, deep reference material in `references/` subdirectory; body target ≤500 lines
- **Dynamic context injection** using `` !`command` `` syntax to embed live state (git branch, test counts, etc.) before the skill runs
- **Input/output contracts** — explicit statement of what the skill expects as `$ARGUMENTS` and what it produces
- **Error handling** — concrete recovery steps when the skill's tool calls fail (not generic advice)

#### What makes a description trigger reliably

The description is the **only** routing signal Claude uses — there is no embedding lookup, keyword match, or classifier. The proven formula is:

> *What the skill does* + *When to invoke it* + *Key capability/tool it uses*

A vague description like "helps with tasks" will never trigger. A specific one like "Query the Fulcrum memory layer before writing new code or architectural decisions. Applies whenever you are about to produce novel output on a topic the project may have prior context on." triggers correctly.

#### How other frameworks compare

- **LangChain/LangGraph tools**: Python function + docstring; no portability across frameworks; no invocation control; no progressive disclosure
- **CrewAI tasks**: Python `Task(description=..., agent=..., tools=[...])` objects; code-only, no file-based authoring, no user-invocable concept
- **AutoGPT plugins**: JSON manifests with name/description/parameters; no procedural body; schema-first not instruction-first
- **Google A2A Agent Cards**: JSON at `/.well-known/agent.json`; capability discovery only, not execution instructions
- **Spring AI Agent Skills (2026)**: Java annotations + structured YAML; strong I/O schema, weak procedural guidance

The SKILL.md pattern wins on portability and authoring ergonomics because it separates the *routing contract* (frontmatter) from the *execution playbook* (body), and both layers are editable as plain text without code changes.

---

## Gap Analysis

### GAP-SKILLS-1: Inconsistent `triggers` field usage

- **Standard**: `triggers` is a list of human-readable trigger conditions in the frontmatter, giving the model explicit additional routing signals beyond `description`. Widely used in the ecosystem (see agentskills.io spec).
- **Fulcrum**: Some skill files use `triggers` (`session-start/SKILL.md:4-6`, `escalate/SKILL.md:4-7`, `create-plan/SKILL.md:3-6`, `review-pr/SKILL.md:3-7`) and some don't (`start-every-task/SKILL.md`, `recall-before-writing/SKILL.md`, `heartbeat-during-long-operations/SKILL.md`, `complete-agent-run/SKILL.md`, `block-when-stuck/SKILL.md`, `secret-hygiene/SKILL.md`). No consistency rule enforced.
- **Severity**: Minor
- **Fix direction**: Either commit to using `triggers` everywhere as a mandatory second field (alongside `description`), or document a convention — "omit `triggers` when the description is self-sufficient, add it when there are discrete event-based conditions". Currently the skill corpus is split 50/50 with no rationale, which will confuse skill authors.

---

### GAP-SKILLS-2: No input/output contract in any Fulcrum skill file

- **Standard**: Best-practice skills declare what they expect as input (`$ARGUMENTS` or a structured parameter block) and what they produce (structured output shape, artifact type, or MCP tool call return). The agentskills.io spec and the Block Engineering blog explicitly call this the "quality contract". Discord's `access/SKILL.md` in the raise profile shows `$ARGUMENTS` used correctly; Fulcrum's skills omit it entirely.
- **Fulcrum**: No skill file in `agent-integration/skills/` declares an input or output contract. Skills like `create-plan` implicitly accept a PRD ID but never state it; `review-pr` implicitly needs a PR URL or diff but never declares it.
- **Severity**: Major
- **Fix direction**: Add an `## Input` and `## Output` section (or a `## Contract` section) to every non-trivial skill body, stating required arguments, optional arguments with defaults, and the shape of what the skill produces (artifact type from `ArtifactType` in `types.ts`, memory kind, or MCP call result).

---

### GAP-SKILLS-3: No `allowed-tools` declarations in any Fulcrum skill file

- **Standard**: `allowed-tools` in frontmatter scopes tool access to exactly what the skill needs. This serves two purposes: (1) tools run without confirmation prompts when listed; (2) the skill becomes self-documenting about what it touches (Read-only vs. write-capable). Claude Code's claude-automation-recommender SKILL.md (`tools: Read, Glob, Grep, Bash`) and the discord/access SKILL.md (`allowed-tools: Read, Write, Bash(ls *), Bash(mkdir *)`) both use this field.
- **Fulcrum**: No skill in `agent-integration/skills/` declares `allowed-tools`. Skills like `secret-hygiene` and `invoke-team-only-from-cos` are read-only advisories but are indistinguishable from `complete-agent-run` which drives multiple MCP calls.
- **Severity**: Major
- **Fix direction**: Add `allowed-tools` to all skill files. Read-only advisory skills should list only `Read` (or nothing); action-driving skills should enumerate the MCP tool names they invoke (e.g., `mcp__fulcrum__start_agent_run, mcp__fulcrum__heartbeat_agent_run`). This also protects against skills being hijacked to call tools outside their intended scope.

---

### GAP-SKILLS-4: `AgentDefinition.system_prompt` is never populated in seed data

- **Standard**: The system prompt for a role is the primary behavior-shaping artifact in any agent framework (LangChain, CrewAI, AutoGPT all treat it as mandatory for named roles). It encodes the role's persona, constraints, and non-negotiables in a way that persists across every run without requiring the agent to recall a skill at startup.
- **Fulcrum**: `m032b.ts:36-45` — the seed INSERT statement omits `system_prompt` for all 24 built-in roles. The `AgentDefinition` type at `types.ts:273` includes `system_prompt: string | null` but every seeded row has `null`. The skill files partially compensate (e.g., `chief-of-staff-response-format/SKILL.md` encodes CoS constraints) but skills are opt-in and memory-loaded; a system prompt is unconditional.
- **Severity**: Critical
- **Fix direction**: Populate `system_prompt` in m032b seed data for at minimum `chief_of_staff` (cannot-write constraint), `integration_worker` (merge-gate invariants), and `security_reviewer` (no-approval-of-own-code). Skills should reference but not replace system prompts.

---

### GAP-SKILLS-5: No versioning or authorship metadata on skill files

- **Standard**: The agentskills.io spec reserves `metadata` as a catch-all frontmatter block for `version`, `author`, and `last-updated`. GitHub Copilot agent skills and the VS Code spec both surface version for marketplace trust decisions. Version also enables deprecation workflows — a skill at `version: 2.0.0` can coexist with `version: 1.x` while agents migrate.
- **Fulcrum**: No skill file in `agent-integration/skills/` carries version or author metadata. The `AgentDefinition` DB type has `version: string` (defaulting to `"0.1.0"`) and `stability` fields, but these are absent from the Markdown skill files entirely. The two representations (DB definition vs. skill file) are not linked.
- **Severity**: Minor
- **Fix direction**: Add `metadata: { version: "1.0.0" }` to skill frontmatter and establish a convention that the skill file version and the corresponding `AgentDefinition.version` in the DB must match. A lint step in CI can enforce this.

---

### GAP-SKILLS-6: Skill files have no `disable-model-invocation` or `user-invocable` control

- **Standard**: The invocation control fields are the primary mechanism for preventing LLM-triggered side effects. `disable-model-invocation: true` means only a human `/slash-invocation` can fire the skill; `user-invocable: false` means only the model can surface it. Without this distinction, a skill that writes memory or starts an agent run can fire in unexpected contexts.
- **Fulcrum**: No Fulcrum skill file uses `disable-model-invocation` or `user-invocable`. Skills like `complete-agent-run` and `start-every-task` call write-capable MCP tools; if triggered in a read-only analysis context, they create spurious runs. Skills like `chief-of-staff-response-format` (background formatting rule) would be better as `user-invocable: false` since they're not user-invoked workflows.
- **Severity**: Major
- **Fix direction**: Audit each skill and assign invocation control. Advisory/formatting skills (chief-of-staff-response-format, secret-hygiene, invoke-team-only-from-cos): `user-invocable: false`. Side-effect skills (complete-agent-run, team-launch, worktree-merge): `disable-model-invocation: true`. Lifecycle skills (start-every-task, heartbeat): leave default (both can invoke).

---

### GAP-SKILLS-7: `AgentDefinition.output_schema` is unused and unlinked to skill files

- **Standard**: Structured output schemas are a first-class pattern in AutoGPT (JSON parameters schema), LangChain (Pydantic output parsers), and the A2A agent card spec. An explicit output schema enables downstream agents to validate what they received, enables the CoS context builder to filter artifact types, and is the foundation for eval automation.
- **Fulcrum**: `types.ts:283` defines `output_schema: Record<string, unknown> | null`; `agent-definitions.ts:43` parses it. But `m032b.ts` seeds all 24 roles with `NULL` output schema, and no skill file references or produces a structured output that maps to a schema. The `RunArtifacts` type at `types.ts:105-111` defines the artifact shape but it is not connected to any role's `output_schema`.
- **Severity**: Major
- **Fix direction**: For roles with deterministic output shapes (prd_planner → PRD artifact, issue_decomposer → task list, code_reviewer → review_report), populate `output_schema` in the seed data with a minimal JSON Schema. Reference the schema in the corresponding skill's `## Output` section so agents know the expected shape.

---

### GAP-SKILLS-8: No example invocations in skill bodies

- **Standard**: The "concise stepwise guidance with a working example outperforms exhaustive documentation" principle from agentskills.io best practices means every skill should include at least one concrete invocation example showing the exact tool call, parameters, and expected result. The discord/access skill shows this well for its `$ARGUMENTS`-based dispatch table. FastAPI's SKILL.md uses explicit DO / DO NOT code blocks throughout.
- **Fulcrum**: Skill files use code blocks to show MCP call syntax (e.g., `start-every-task/SKILL.md:27-36`) but never show a complete worked example from trigger to outcome. There are no "before/after" or "this run, in full" examples that a new agent could copy verbatim.
- **Severity**: Minor
- **Fix direction**: Add a `## Example` section at the bottom of the three highest-friction skills (start-every-task, complete-agent-run, block-when-stuck) showing a realistic end-to-end trace: trigger condition → MCP call with real-looking parameters → expected response → next action.

---

### GAP-SKILLS-9: Skills directory is not co-located with the agent runner; no discovery path documented

- **Standard**: The Claude Code convention places skills in `.claude/skills/<name>/SKILL.md` (global) or `<repo>/.claude/skills/<name>/SKILL.md` (project-scoped). The index file references cross-links using relative paths "so the directory is portable between `agent-integration/skills/` and `~/.claude/skills/`" (`index.md:57-58`). But the skills currently live in `agent-integration/skills/` with no documented installation step or symlink to `~/.claude/skills/`.
- **Fulcrum**: `agent-integration/skills/index.md:57-58` acknowledges portability as a goal, but there is no `Makefile` target, `package.json` script, or README step that copies or symlinks the skill directory into the location where Claude Code's skill loader actually reads from. An agent starting fresh has no guarantee these skills are loaded.
- **Severity**: Critical
- **Fix direction**: Add an `install-skills` target (or equivalent) that symlinks or copies `agent-integration/skills/` to `~/.claude/skills/fulcrum/` (or the workspace `.claude/skills/` path). Document the install step in the onboarding guide. The skill index should also be a `README.md` in addition to `index.md` so it is visible in GitHub without a viewer navigating into the directory.
