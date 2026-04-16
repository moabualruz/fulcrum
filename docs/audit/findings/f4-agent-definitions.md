# F4 — Agent Definitions Audit

> Audit of Fulcrum's role / profile / team configuration surface against R4
> (`docs/audit/research/r4-agent-definitions.md`).
> Methodology: source-driven — every finding cites R4 and codebase file:line.
> Date: 2026-04-14.

---

## 0. TL;DR

Fulcrum does **not** have an agent-definition system in the R4 sense. It has:

1. A **compile-time `AgentRole` string union** of 24 slugs
   (`packages/core/src/types.ts:16-40`) used as a routing label on
   `agent_runs.role`.
2. A **hardcoded `AgentProfile[]` array** in
   `packages/core/src/status.ts:47-72` that maps each role slug to a one-line
   description plus two capability booleans (`can_create_teams`,
   `can_dispatch_agents`).
3. A **set of 24 Markdown role files** in `agent-integration/roles/*.md` with
   no frontmatter, no tool declarations, no model binding, and no handoff
   routing — used only to extract the "Purpose" paragraph at read time
   (`packages/core/src/status.ts:30-42`).
4. An **`agent_profiles` DB table** (migration 030,
   `packages/core/src/db/migrations.ts:2207-2230`) with fields
   `profile_id, workspace_id, name, base_role, description, system_prompt,
   capabilities (opaque JSON), created_by, created_at` — and **zero production
   consumers**. Nothing reads `system_prompt`. Nothing reads `capabilities`.
   `startAgentRun` does not accept `profile_id`.
5. A **team template slot shape** (`packages/teams/src/types.ts:16-30`) that
   can reference an `agent_profile` string, but the scheduler
   (`packages/teams/src/scheduler.ts`) enforces only global / project /
   template instance caps, not anything profile-level.

Against R4 §5 (minimum viable agent definition — 8 categories: identity,
behaviour, capabilities, constraints, memory access, handoffs, model spec,
observability), Fulcrum implements **identity (partial), behaviour (partial),
capabilities (weak JSON blob)** — 2.5 of 8. Against the R4 §8 MUST checklist
(10 items), Fulcrum passes **2** cleanly: stable identity (kind of — we have
role slugs, not profile ids) and observability (via the events / telemetry
pipeline, not declared on the agent).

This is the weakest surface of the audit so far: Fulcrum does not yet have a
thing that R4 would recognise as an "agent definition".

---

## 1. Conformance strengths

Despite the gaps listed throughout, a few pieces are in reasonable shape and
can be salvaged when rebuilding:

- **Clear role ↔ capability derivation in code.**
  `packages/core/src/roles.ts:34-44` derives `can_invoke_teams`, `can_merge`,
  `can_edit_files`, `can_write_code` from the role slug in one place, and
  exposes `canInvokeTeams / canMerge / canWriteCode / canEditFiles` as the
  enforcement entry points (H-11 "single source of truth" comment). R4 §8.1
  item 5 ("permission mode / isolation must be declarative") is not met, but
  the centralisation makes the migration to declarative permissions
  straightforward.

- **DB-side enforcement of the role enum.**
  `packages/core/src/db/migrations.ts:2210-2219` places a CHECK on
  `agent_profiles.base_role`, and
  `packages/core/src/tests/check-constraints.test.ts:144-156` guards it
  against drift. This is the same pattern the rest of the enum surface uses
  and it works — new roles can't be inserted without a migration update.

- **Role prompt source-of-truth lives in Markdown, not code.**
  `packages/core/src/status.ts:30-42` reads the `## Purpose` paragraph from
  `agent-integration/roles/<slug>.md` at runtime and falls back to the
  hardcoded description. This is the embryo of a declarative format. R4 §7
  calls "declarative-by-default with a typed code escape hatch" the right
  target; this scaffold is aimed in that direction, just radically incomplete.

- **Policy gates are centralised at dispatch time.**
  `invokeTeam` in `packages/teams/src/teams.ts:69-72` calls
  `canInvokeTeams(input.caller_role)` before doing any state mutation, which
  means the permission check is a single call to change when permissions
  become profile-driven.

- **24 roles cover the Python spec's role set 1:1.**
  The `AgentRole` union at `packages/core/src/types.ts:16-40` matches the
  original pi-agent-os role list, giving us a clean starting set even if the
  *shape* of each role needs redesigning.

- **Teams have a first-class DB identity separate from agents.**
  `TeamTemplate` / `TeamInstance` / `TeamMember` in
  `packages/teams/src/types.ts:48-91` are modelled as distinct objects with
  their own lifecycle. R4 §3 explicitly warns against conflating teams and
  agents ("workflow / crew / team is a container, not an agent"); we got
  that distinction right structurally.

None of these are large wins, but they mean we don't have to throw everything
away — the enforcement harness and the role enum can carry forward.

---

## 2. Nomenclature alignment — disentangle role / agent / subagent / profile / team

R4 §3 establishes a defensible taxonomy:

| R4 term      | Definition (R4 §3)                                                                   |
|--------------|--------------------------------------------------------------------------------------|
| **tool**     | A single dispatchable function. Stateless from the agent's view.                     |
| **skill**    | Bundle of domain knowledge + optional scripts + optional tools. No context window.   |
| **agent**    | Configured runtime: model + system prompt + tools + optional memory + subagents.     |
| **subagent** | An agent invoked by another agent via structured dispatch (Task, handoff, sub-graph). |
| **workflow / team / crew** | Composition of agents + execution rules (seq/parallel/round-robin).     |
| **persona / role**         | Descriptive text embedded in instructions or split out (CrewAI-style). |

Fulcrum's vocabulary is:

| Fulcrum term      | Where it lives                                                     | Closest R4 concept                                      |
|-------------------|--------------------------------------------------------------------|---------------------------------------------------------|
| `AgentRole`       | `packages/core/src/types.ts:16-40` (compile-time string union)     | R4's **persona / role** tag — *not* an agent definition  |
| `AgentProfile`    | `packages/core/src/status.ts:47-72` (hardcoded 24-row array)       | R4's **agent** field set (but minimal: 2 booleans)       |
| `AgentProfileRow` | `packages/core/src/types.ts:210-220` + `agent_profiles` DB table   | Aspiring **agent definition** — present but unused      |
| `roles/<slug>.md` | `agent-integration/roles/*.md`                                     | R4's **Claude Code subagent file** (wrong location, no frontmatter) |
| `TeamTemplate`    | `packages/teams/src/types.ts:48-56`                                | R4's **workflow / team / crew** container               |
| `TeamInstance`    | `packages/teams/src/types.ts:58-73`                                | A *runtime* team; R4 does not distinguish template vs instance — most frameworks don't |
| `TeamSlot.role`   | `packages/teams/src/types.ts:17-30`                                | R4's **persona / role** again (not a profile reference) |
| `pi_profile`      | `StartAgentRunInput.pi_profile` `types.ts:378`, just a free string | Opaque model-binding tag — no R4 analogue, closest is AutoGen v0.4 component provider string |

### The core conflation

**Fulcrum uses the word "profile" to mean three different things:**

1. The *hardcoded capability hint* row in
   `AGENT_PROFILES` (`status.ts:47-72`). Two booleans.
2. The *DB-backed extensibility row* in `agent_profiles` / `AgentProfileRow`
   (`types.ts:210-220`). A name + base_role + description + unused
   `system_prompt` + opaque `capabilities` JSON.
3. The *executor binding tag* `pi_profile` (`types.ts:121, 367, 378`) —
   e.g. `"claude-cli/claude-opus-4-5"`. This has nothing to do with the
   first two. It is a *model / runner selector*, not an agent definition.

R4 uses "profile" only informally; the closest term is **agent definition**
(OpenAI SDK's `Agent`, CrewAI's `agents.yaml` entry, Claude Code's
`.claude/agents/*.md`, Letta's agent JSON). Fulcrum has nothing by that name.

### What each Fulcrum concept *should* map to

Using R4's taxonomy, here is the cleanest mapping to straighten this out:

- `AgentRole` should be called a **role class** — a capability tag. It is
  closer to a Unix group than to an agent. A role class is never dispatched
  on its own; it is a constraint that many agent definitions may share.
- `AgentProfileRow` (rename: `AgentDefinition`) should be the **actual R4
  agent definition** — identity, instructions, model, tools, handoffs,
  constraints, memory scope. The `base_role` column becomes one of many
  fields and serves as the capability-class tag.
- `pi_profile` should be renamed **`executor_binding`** or
  **`runner_uri`** — it identifies *how* to invoke the agent (CLI + model),
  not *what* the agent is.
- `agent-integration/roles/<slug>.md` files should be split in two:
  - The **24 role-class descriptor files** (what a `software_engineer` is in
    the abstract). These stay somewhere like `docs/roles/`.
  - The **individual agent definitions**. These live at
    `.claude/agents/<name>.md` for native Claude Code compatibility (R4 §1.2)
    *and* are ingested into Fulcrum's `agent_definitions` table. Same file,
    two readers.
- `TeamTemplate` is a **workflow container**. That's fine — the name is
  accurate once "team" stops overlapping with "profile". A slot references
  an **agent definition id**, not a bare role class.
- **Subagent** does not exist in Fulcrum today. When one agent dispatches
  another via the Task tool or via `invoke_team`, the dispatched agent is
  structurally a subagent — but we don't model that distinction, and the
  dispatched agent has no way to receive a scoped / trimmed context. R4 §3
  explicitly says "the file format is usually identical; the distinction is
  positional, not structural" — so the fix is to give agents a positional
  `parent_run_id` (which we already have on `agent_runs`) and track the
  subagent relationship there, not to invent a second object type.

### Where we use the wrong word

- **`AgentProfile` hardcoded list in `status.ts:47-72`.** These are not
  profiles. They are **role-class descriptors** (one per role slug, not one
  per *agent instance*). Renaming to `ROLE_CLASS_DESCRIPTORS` would be more
  accurate, and the object should be called `RoleClass` not `AgentProfile`.
- **`listAgentProfiles()` in `status.ts:178-206`.** Returns a merged list of
  role-class descriptors + DB agent definitions. The function is doing two
  things and should be split.
- **`agent-integration/roles/README.md:1` — "Fulcrum Role Definitions".**
  These are neither role *definitions* (they duplicate and partially
  override `AGENT_PROFILES` text) nor agent definitions (no frontmatter, no
  tools, no model). They are **role prompt fragments** at best.
- **`TeamSlot.agent_profile` field** (`types.ts:24`). The comment in
  `packages/cli/src/index.ts:826` calls it "Optional DB-backed profile_id"
  — but no code path actually resolves a `profile_id` into anything, so the
  field is a hint in search of a consumer.

---

## 3. Per-role Markdown file review — all 24

Every file in `agent-integration/roles/*.md` was read in full. The audit
checks against R4 §1.2 (Claude Code subagent format) and §5 (minimum viable
agent definition fields).

| # | Role slug (file)             | Frontmatter? | `tools`? | `model`? | Handoffs? | Lines | Issues vs R4 |
|---|------------------------------|:------------:|:--------:|:--------:|:---------:|------:|--------------|
| 1 | analyst.md                   | no           | no       | no       | prose-only | 28 | no FM, capability list is prose ("HTTP access to the monitor endpoints") not a tool whitelist |
| 2 | architecture_reviewer.md     | no           | no       | no       | no         | 28 | no FM; no `permission_mode: plan` declaration even though this role is read-only |
| 3 | browser_worker.md            | no           | no       | no       | no         | 28 | no FM; needs Playwright MCP binding but none declared |
| 4 | chief_of_staff.md            | no           | no       | no       | prose-only | 46 | no FM; positive handoff routing mentioned in prose ("L2 roles") not enumerated |
| 5 | code_reviewer.md             | no           | no       | no       | no         | 25 | no FM; read-only role — should declare `disallowedTools: [Write, Edit, Bash]` per R4 §8.1 item 4 |
| 6 | context_gatherer.md          | no           | no       | no       | no         | 28 | no FM |
| 7 | custom.md                    | no           | no       | no       | no         | 26 | describes the "escape hatch" pattern in prose; that pattern needs to be actual fields |
| 8 | data_engineer.md             | no           | no       | no       | no         | 28 | no FM |
| 9 | devops_engineer.md           | no           | no       | no       | no         | 28 | no FM |
| 10 | documentation_writer.md     | no           | no       | no       | no         | 28 | no FM |
| 11 | implementation_planner.md   | no           | no       | no       | prose-only | 28 | no FM; downstream "hand off to issue_decomposer / software_engineer" is prose |
| 12 | integration_worker.md       | no           | no       | no       | no         | 27 | no FM; only role permitted `shell_exec:git` — uniqueness should be declarative, not prose |
| 13 | issue_decomposer.md         | no           | no       | no       | no         | 28 | no FM |
| 14 | memory_curator.md           | no           | no       | no       | no         | 27 | no FM |
| 15 | ml_engineer.md              | no           | no       | no       | no         | 28 | no FM |
| 16 | orchestrator.md             | no           | no       | no       | prose-only | 28 | **claims `invoke_team` "within declared scope"** which contradicts `canInvokeTeams` in `roles.ts:46-48` that only allows `chief_of_staff`. Drift bug. |
| 17 | prd_planner.md              | no           | no       | no       | prose-only | 55 | no FM; longest file because of a Response format block — good content, wrong container |
| 18 | product_manager.md          | no           | no       | no       | no         | 28 | no FM |
| 19 | qa_engineer.md              | no           | no       | no       | no         | 28 | no FM |
| 20 | refactor_worker.md          | no           | no       | no       | no         | 28 | no FM |
| 21 | research_worker.md          | no           | no       | no       | no         | 28 | no FM |
| 22 | security_reviewer.md        | no           | no       | no       | no         | 25 | no FM; read-only role; blocking CRITICAL verdicts described in prose, no declarative gate field |
| 23 | software_engineer.md        | no           | no       | no       | prose-only | 28 | no FM; Tools section names `run_tests`, `search_codebase` which don't exist in the actual tool namespace |
| 24 | tech_lead.md                | no           | no       | no       | no         | 25 | no FM |

### Structural observations

**Zero of 24 files have YAML frontmatter.** Verified with
`rg '^---$' agent-integration/roles/` which returned zero matches. This is
the single biggest gap: R4 §1.2 establishes that Claude Code subagents are
YAML-frontmatter + body, and Fulcrum's role files are *almost* that format —
they just happen to omit the only machine-readable part.

**The "Tools / Capabilities" sections are prose, not lists.** Every file has
a bulleted "Tools / Capabilities" section, but the entries are a mix of
real tool names (`Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob`), MCP tool
names (`mcp__fulcrum__recall_memory`), names of Fulcrum primitives
(`spawn_agent`, `dispatch_agent`, `create_task`) that are not actually tools
exposed to subagents, and imaginary tools (`run_tests`, `search_codebase`).
Nothing validates these against the actual tool namespace. R4 §8.1 item 3
("tool surface is declared") fails.

**No file names a model.** R4 §8.1 item 7 ("model spec is explicit") fails
uniformly. Every agent Fulcrum spawns inherits whatever the `pi_profile`
string at run time happens to be — and that string is a runtime input, not a
property of the role or the agent.

**Handoff routing is all prose, where it exists at all.** Only
`chief_of_staff.md`, `implementation_planner.md`, `prd_planner.md`,
`orchestrator.md`, and `software_engineer.md` mention downstream roles at
all, and only in sentences like "hand off to `integration_worker`". R4 §5.6
and §8.1 item 9 want `handoffs: [...]` as a first-class field, and the
OpenAI Agents SDK additionally has `handoff_description` — neither exists.

**No permission mode field.** Six of the 24 roles are effectively read-only
(architecture_reviewer, code_reviewer, security_reviewer, context_gatherer,
analyst, memory_curator-partial). Claude Code supports `permissionMode: plan`
for exactly this case (R4 §1.2). None of the Markdown files declare it, and
enforcement instead happens in `packages/core/src/roles.ts:41-42`
(`can_edit_files: !is_l1 && !is_reviewer`) via a hardcoded reviewer set at
`roles.ts:24-28`.

**The "chief_of_staff has a Response format" idea is the right instinct in
the wrong place.** `chief_of_staff.md:30-46` and `prd_planner.md:30-55`
include structured output templates as Markdown code fences. R4 §6 ("typed
output contracts") is exactly this — but it should be a schema (Pydantic /
Zod / JSON Schema) wired to `output_type`, not Markdown the model has to
guess about. See F4-ISSUE-07.

### Orchestrator drift

`orchestrator.md:5` says this role "plans and dispatches within its assigned
scope, … Invokes teams only within the declared scope of this orchestrator
instance." But `packages/core/src/roles.ts:21`
(`L1_ROLES = ['chief_of_staff']`) plus `roleCapabilities.can_invoke_teams =
is_l1` means `orchestrator` is **not** permitted to invoke teams, at all. If
a hypothetical orchestrator agent calls `invoke_team`, `teams.ts:70-72`
throws `POLICY_DENIED`.

Either:
- the Markdown is aspirational and misleading (fix: rewrite to say "cannot
  invoke teams; must escalate"); or
- the code is wrong and some non-CoS roles should have bounded team
  invocation authority (fix: introduce per-scope policy gates).

Without a declarative field on the agent definition for "may_invoke_teams",
this kind of drift is undetectable. Tracked as F4-ISSUE-08.

---

## 4. Dynamic `agent_profiles` gap analysis — against R4 §5

R4 §5 lists 8 categories of fields any serious agent definition needs.
`AgentProfileRow` (`packages/core/src/types.ts:210-220`) plus the
`agent_profiles` table (`packages/core/src/db/migrations.ts:2207-2230`) are
the closest thing Fulcrum has. Here is a field-by-field gap analysis.

### 5.1 Identity

| R4 field          | Fulcrum                                                   | Gap |
|-------------------|-----------------------------------------------------------|-----|
| `id` / `name`     | `profile_id` (PK), `name` (unique per workspace)          | OK  |
| `display_name`    | absent (conflated with `name`)                            | minor |
| `description`     | `description` column, `NOT NULL`                          | OK  |
| `version`         | **absent** — no column, no surface in row type             | **BLOCKER** per R4 §8.1 item 1 |

### 5.2 Behaviour

| R4 field          | Fulcrum                                                   | Gap |
|-------------------|-----------------------------------------------------------|-----|
| `instructions` / `system_prompt` | `system_prompt TEXT` (nullable) in migration line 2222; `system_prompt` on row type                    | **present but not consumed anywhere** — `startAgentRun` in `runs.ts:175` does not read it; no callsite in `packages/*` outside tests |
| Optional `role`/`goal`/`backstory` split | absent                                      | missing — would be a SHOULD per R4 §8.3 item 21 |

### 5.3 Capabilities

| R4 field          | Fulcrum                                                   | Gap |
|-------------------|-----------------------------------------------------------|-----|
| `tools` (allowlist) | `capabilities` (opaque `Record<string, unknown>` — JSON blob stored as TEXT, line 2223) | **no schema, no validator, no consumer** |
| `mcp_servers`     | absent                                                    | missing |
| `skills`          | absent                                                    | missing |
| `knowledge_sources`| absent                                                   | missing |

### 5.4 Constraints

| R4 field          | Fulcrum                                                   | Gap |
|-------------------|-----------------------------------------------------------|-----|
| `disallowed_tools`| absent                                                    | **missing** per R4 §8.1 item 4 |
| `permission_mode` | absent on profile; derived from role in `roles.ts:34-44` | derived, not declared |
| `max_turns` / `max_iter`   | absent on profile; runtime `wip_limit` on policy       | wrong layer — this is per-agent-definition, not workspace-wide |
| `max_rpm` / rate limit    | absent                                                    | missing |
| `max_execution_time`      | absent                                                    | missing |
| `token_budget`   | absent                                                    | missing |
| `isolation`      | absent (runtime-only via `worktree_id` on runs)           | not declarative |

### 5.5 Memory access

| R4 field          | Fulcrum                                                   | Gap |
|-------------------|-----------------------------------------------------------|-----|
| `memory_scope`   | absent on profile; `recallTaskContext` at run start in `runs.ts:207-211` is hardcoded | **missing** per R4 §8.1 item 8 |
| `memory_blocks`  | absent                                                    | missing (R4 §5.5, Letta-style) |
| `embedder`       | absent on profile; global config in `FulcrumConfig.embedding` in `types.ts:272-282` | declared workspace-wide, not per-agent |

### 5.6 Handoffs / delegation

| R4 field          | Fulcrum                                                   | Gap |
|-------------------|-----------------------------------------------------------|-----|
| `handoffs` / `can_delegate_to` | absent on profile; hardcoded via `L1_ROLES` set in `roles.ts:21` (= chief_of_staff only) | **missing** per R4 §8.1 item 9 |
| `handoff_description` | absent                                                 | missing |
| `allow_delegation`    | derived from `is_l1`, not a field                     | not declarative |

### 5.7 Model spec

| R4 field          | Fulcrum                                                   | Gap |
|-------------------|-----------------------------------------------------------|-----|
| `model`           | `pi_profile` on `agent_runs` (free string), **not on agent_profiles at all** | **not on the agent definition** per R4 §8.1 item 7 |
| `model_settings`  | absent                                                    | missing |
| `fallback_model`  | absent                                                    | missing |
| `function_calling_llm` | absent                                               | missing (CrewAI pattern) |

### 5.8 Observability

| R4 field          | Fulcrum                                                   | Gap |
|-------------------|-----------------------------------------------------------|-----|
| `tracing`         | On by default via `telemetry` / `trace_events` table     | OK (one of the two strengths) |
| `metrics`         | Emitted via `FulcrumEvent` pipeline                      | OK |
| `evals`           | absent                                                    | missing (R4 §6) |
| `hooks`           | absent                                                    | missing |

### §6 Advanced fields

| R4 §6 field            | Fulcrum | Notes |
|------------------------|---------|-------|
| Typed output contract  | no      | `artifact_contract_id` on `TaskPacket`/`HandoffPacket` is close in spirit (`types.ts:355, 320`) but operates on a *task*, not on the agent definition — wrong layer |
| Input validation       | no      | |
| Output guardrails      | no      | `chief_of_staff_no_direct_writes` invariant in `roles.ts` is closest — but it's hardcoded, not declarative |
| Evals / benchmarks     | no      | |
| Versioning             | **no**  | — agent_profiles has no `version` column; cf. task.version, run.version |
| Lineage / inheritance  | no      | |
| Signing                | no      | |
| Cost budget ($)        | no      | |
| Concurrency class      | partial | `wip_limit_per_role` in `PolicyConfig` (types.ts:252-257) is role-level, not agent-definition-level |

### Score: 2.5 / 8 on R4 §5 + 1 / 9 on §6

Identity: partial (no version). Behaviour: partial (system_prompt exists but
unused). Capabilities: weak (opaque JSON). Constraints: none declaratively.
Memory access: none. Handoffs: none. Model spec: none on the definition.
Observability: OK via the events pipeline.

### The killer finding: `agent_profiles` has no production consumers

Confirmed by searching `createAgentProfile` / `listAgentProfileRows` /
`getAgentProfile` / `profile_id` usage across the monorepo.

- `createAgentProfile` is imported from `@moabualruz/fulcrum-core` into **only one**
  non-test file: `packages/cli/src/index.ts:598, 1128-1132`, which wires it
  to the `mcp__fulcrum__create_agent_profile` MCP tool for external callers.
- `listAgentProfileRows` is called from `status.ts:194` and from tests.
- `getAgentProfile` / `updateAgentProfile` / `deleteAgentProfile` are called
  **only from their own test file** `tests/agent-profiles.test.ts`.
- No call in `runs.ts`, no call in `teams.ts`, no call in `scheduler.ts`.
- `StartAgentRunInput` (`types.ts:373-381`) accepts `role: AgentRole` and an
  optional string `pi_profile`, and `agent_id` — it does **not** accept
  `profile_id`. You cannot start a run "using profile X"; you can only start
  a run "with role X".

**Consequence.** A user can call `mcp__fulcrum__create_agent_profile` to
register a custom agent definition, but the system will never dispatch that
definition. The only effect is that `listAgentProfiles` will return an extra
row. The `system_prompt` is written but never read. The `capabilities` JSON
blob has no schema and no consumer. The `base_role` field provides the only
link back into the rest of the system, and it is only used to inherit the
hardcoded reviewer-vs-L2 policy from `roleCapabilities()`.

The `agent_profiles` table is **cosmetic**.

The same story holds for `TeamSlot.agent_profile?: string`
(`packages/teams/src/types.ts:24`): only tests
(`packages/teams/src/tests/teams.test.ts:422, 437, 452`) set or inspect the
field. No team dispatcher resolves a slot's `agent_profile` into a concrete
agent definition. Template slots with a non-null `agent_profile` behave
identically to slots with a null one.

---

## 5. Comparison to R4 frameworks

For each framework R4 surveys in §1, this is what Fulcrum has (or lacks) at
the same field:

### 5.1 vs OpenAI Agents SDK (R4 §1.1)

| OpenAI `Agent` field | Fulcrum equivalent | Status |
|----------------------|---------------------|--------|
| `name`               | `AgentProfileRow.name`          | OK (but never dispatched by name) |
| `instructions`       | `system_prompt` (nullable, unused) | **present, dead** |
| `model`              | `pi_profile` on the *run*, not the profile | **wrong layer** |
| `model_settings`     | none | missing |
| `tools`              | `capabilities` JSON blob, unschematised | **missing** |
| `handoffs`           | derived from `L1_ROLES` set | not declarative |
| `handoff_description`| none | missing |
| `output_type`        | `artifact_contract_id` on tasks only | **wrong layer** |
| `input_guardrails`   | none | missing |
| `output_guardrails`  | `chief_of_staff_no_direct_writes` invariant (hardcoded in `roles.ts`) | partial, non-declarative |
| `mcp_servers`        | none | missing |
| `hooks`              | none | missing |
| `tool_use_behavior`  | none | missing |

### 5.2 vs Claude Code subagents (R4 §1.2)

| Frontmatter field   | Fulcrum file | Status |
|---------------------|--------------|--------|
| `name`              | filename slug only                              | implicit |
| `description`       | `## Purpose` section                             | present |
| `tools`             | prose in `## Tools / Capabilities`               | **not a list, not validated** |
| `disallowedTools`   | none                                             | missing |
| `model`             | none                                             | missing |
| `permissionMode`    | none (derived from role in code)                 | not declarative |
| `maxTurns`          | none                                             | missing |
| `skills`            | none                                             | missing |
| `mcpServers`        | none                                             | missing |
| `hooks`             | none                                             | missing |
| `memory`            | none                                             | missing |
| `background`        | none                                             | missing |
| `effort`            | none                                             | missing |
| `isolation`         | none (runtime-only via `worktree_id` on runs)    | not declarative |
| `color`             | none                                             | missing (low priority) |
| `initialPrompt`     | none                                             | missing |

The Fulcrum `.md` files are close to Claude Code subagents in *spirit* — the
body is a system prompt and the sections are human-authored — but they miss
every single declarative field and they live in the wrong location
(`agent-integration/roles/` instead of `.claude/agents/`). **None of the
role MDs are usable as Claude Code subagents today without modification.**

### 5.3 vs CrewAI agents.yaml (R4 §1.4)

| CrewAI field            | Fulcrum | Status |
|-------------------------|---------|--------|
| `role` (name)           | `AgentRole` slug | OK |
| `goal`                  | none | **missing** |
| `backstory`             | none | **missing** |
| `llm` (model)           | `pi_profile` at runtime, not on profile | wrong layer |
| `tools`                 | unschematised JSON | weak |
| `function_calling_llm`  | none | missing |
| `allow_delegation`      | derived from `L1_ROLES` | not declarative |
| `max_iter`              | none | missing |
| `max_rpm`               | none | missing |
| `max_execution_time`    | none | missing |
| `max_retry_limit`       | none | missing |
| `memory`                | crew-level only (via `TeamPolicy.memory_policy` string) | weak |
| `knowledge_sources`     | none | missing |

The CrewAI role/goal/backstory triad is notably absent. Fulcrum's `description`
column bundles all three into one short sentence, losing the persona
clarity CrewAI intentionally enforces (R4 §1.4 calls this the "clearest
prior art for anyone designing a declarative agent format").

### 5.4 vs AutoGen v0.4 component dump (R4 §1.5)

AutoGen's `dump_component() / load_component()` format is the only place R4
§2 shows a `version` field on a serialised agent. Fulcrum's agent_profiles
schema has **no version column** (confirmed: migration 030, columns listed
above, no `version`). Task table and agent_runs table have `version` for
optimistic concurrency, but the profile surface does not. R4 §8.1 item 1
("stable identity … with a version string (SemVer)") fails.

### 5.5 vs Letta / MemGPT memory blocks (R4 §1.8)

Letta makes pinned memory blocks a definitional concern of the agent
(`persona`, `human`, plus arbitrary user-defined blocks). Fulcrum has a
`memories` table and `write_memory` / `recall_memory` tools, but none of
them are pinned — they are recall-on-demand. There is no per-agent
memory-block configuration. Closest fit: `recallTaskContext` in
`packages/core/src/runs.ts:207-211` runs unconditionally at agent start for
*every* role, with no declarative scope filter.

### 5.6 vs Google ADK (R4 §1.9)

ADK is the only framework with first-class workflow agents
(`SequentialAgent`, `ParallelAgent`, `LoopAgent`) as peers of LLM agents.
Fulcrum has `TeamTemplate` / `TeamInstance`, which is closest to a
multi-agent crew, but the scheduler
(`packages/teams/src/scheduler.ts:14-22`) only enforces instance counts. It
does not encode sequential-vs-parallel semantics. `TeamPolicy` has a
`communication_mode: 'broadcast' | 'direct' | 'hub_and_spoke'` field in
`types.ts:32, 38-46` but no `execution_mode`. There is no LoopAgent analogue
at all.

### 5.7 vs A2A Agent Cards (R4 §4.1)

A2A defines the interop layer: an `/.well-known/agent.json` describing a
remote agent. Fulcrum does not emit an Agent Card, does not host one, and
has no "agent ID as URI" surface. For cross-system interop (R4 §8.2 item 19:
"Emit A2A Agent Card automatically"), Fulcrum scores zero. When pi-agent-os
starts talking to outside Fulcrum instances, this will be load-bearing.

### 5.8 vs AGENTS.md convention (R4 §4.3)

Fulcrum has no `AGENTS.md` at the repository root. `CLAUDE.md` exists
(user-level memory per the session context), which overlaps somewhat, but
AGENTS.md is the cross-tool standard being stewarded by the LF Agentic AI
Foundation. Adding one is low-effort, high-impact alignment.

---

## 6. Proposed new agent definition schema

This is the minimum-viable schema Fulcrum should target, derived from R4 §5
/ §6 and the per-framework comparisons above. It replaces `agent_profiles`
with `agent_definitions` and keeps `AgentRole` as a *capability class tag*
referenced by the definition.

### 6.1 DB schema (`agent_definitions` table)

```sql
CREATE TABLE agent_definitions (
  -- Identity
  definition_id    TEXT PRIMARY KEY,                     -- id_{nanoid}
  workspace_id     TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  name             TEXT NOT NULL,                        -- lowercase-hyphen, unique per workspace
  display_name     TEXT,                                 -- optional human label
  description      TEXT NOT NULL,                        -- when to dispatch
  version          TEXT NOT NULL DEFAULT '0.1.0',        -- SemVer
  stability        TEXT NOT NULL DEFAULT 'experimental'  -- experimental|beta|stable|deprecated
    CHECK(stability IN ('experimental','beta','stable','deprecated')),

  -- Capability class (link back to the 24 role slugs)
  role_class       TEXT NOT NULL                         -- one of the 24 AgentRole values
    CHECK(role_class IN (
      'chief_of_staff','context_gatherer','prd_planner','implementation_planner',
      'issue_decomposer','software_engineer','research_worker','refactor_worker',
      'browser_worker','data_engineer','ml_engineer','devops_engineer',
      'architecture_reviewer','code_reviewer','qa_engineer','security_reviewer',
      'integration_worker','documentation_writer','memory_curator','tech_lead',
      'product_manager','analyst','orchestrator','custom'
    )),

  -- Behaviour (R4 §5.2)
  instructions     TEXT NOT NULL,                        -- the system prompt body
  goal             TEXT,                                 -- CrewAI-style
  backstory        TEXT,                                 -- CrewAI-style

  -- Model spec (R4 §5.7)
  model_provider   TEXT NOT NULL,                        -- 'anthropic','openai','google',...
  model_name       TEXT NOT NULL,                        -- 'claude-opus-4-6','gpt-5',...
  model_fallback   TEXT,                                 -- optional fallback model
  function_call_model TEXT,                              -- CrewAI-style cheaper model
  model_settings   TEXT NOT NULL DEFAULT '{}',           -- JSON: temperature, top_p, max_tokens, tool_choice

  -- Capabilities (R4 §5.3)
  tools_allow      TEXT NOT NULL DEFAULT '[]',           -- JSON string[] — canonical tool names
  tools_deny       TEXT NOT NULL DEFAULT '[]',           -- JSON string[] — always wins
  mcp_servers      TEXT NOT NULL DEFAULT '[]',           -- JSON of server refs or inline configs
  skills           TEXT NOT NULL DEFAULT '[]',           -- JSON string[] — skill bundle names

  -- Constraints (R4 §5.4)
  permission_mode  TEXT NOT NULL DEFAULT 'default'       -- default|plan|accept_edits|bypass
    CHECK(permission_mode IN ('default','plan','accept_edits','bypass')),
  max_turns        INTEGER,                              -- null = no cap
  max_execution_ms INTEGER,
  max_tool_calls   INTEGER,
  token_budget     INTEGER,
  cost_budget_cents INTEGER,
  isolation        TEXT NOT NULL DEFAULT 'none'          -- none|worktree|sandbox|container
    CHECK(isolation IN ('none','worktree','sandbox','container')),
  concurrency_class TEXT NOT NULL DEFAULT 'parallel'     -- singleton|per-workspace|parallel
    CHECK(concurrency_class IN ('singleton','per-workspace','parallel')),
  rate_limit_rpm   INTEGER,

  -- Memory access (R4 §5.5)
  memory_read_scopes  TEXT NOT NULL DEFAULT '[]',        -- JSON string[] of scopes: global|project|file|task
  memory_write_kinds  TEXT NOT NULL DEFAULT '[]',        -- JSON string[] of MemoryKind values
  memory_blocks       TEXT NOT NULL DEFAULT '[]',        -- JSON of {label, description, limit, read_only}
  embedder            TEXT,                              -- provider:model ref, null = inherit workspace

  -- Handoffs / delegation (R4 §5.6)
  handoff_description TEXT,                              -- how OTHERS describe this agent when picking
  handoff_targets     TEXT NOT NULL DEFAULT '[]',        -- JSON string[] of definition_id OR role_class slugs
  allow_delegation    INTEGER NOT NULL DEFAULT 0,        -- boolean

  -- Observability (R4 §5.8)
  tracing_enabled     INTEGER NOT NULL DEFAULT 1,        -- boolean
  metrics             TEXT NOT NULL DEFAULT '[]',        -- JSON string[] — which metrics to emit
  eval_suites         TEXT NOT NULL DEFAULT '[]',        -- JSON string[] — eval IDs this agent must pass
  hooks               TEXT NOT NULL DEFAULT '{}',        -- JSON { onStart, onEnd, onToolUse, onHandoff }

  -- Output contract (R4 §6)
  output_schema       TEXT,                              -- JSON schema or Zod export, for structured output
  input_guardrails    TEXT NOT NULL DEFAULT '[]',        -- JSON of guardrail refs
  output_guardrails   TEXT NOT NULL DEFAULT '[]',        -- JSON of guardrail refs

  -- Lineage (R4 §6)
  extends_definition_id TEXT REFERENCES agent_definitions(definition_id),
  deprecates_definition_id TEXT REFERENCES agent_definitions(definition_id),

  -- Administrative
  tags                TEXT NOT NULL DEFAULT '[]',        -- JSON string[]
  created_by          TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),

  -- Signing (R4 §6 / A2A)
  signature           TEXT,                              -- null = unsigned
  signer_key_id       TEXT
);

CREATE UNIQUE INDEX idx_agent_definitions_ws_name_version
  ON agent_definitions(workspace_id, name, version);
CREATE INDEX idx_agent_definitions_role_class
  ON agent_definitions(role_class);
CREATE INDEX idx_agent_definitions_stability
  ON agent_definitions(stability);
```

Migration note: keep the existing `agent_profiles` table behind a view for a
release cycle to avoid breaking the MCP tool surface; write an adapter that
translates `CreateAgentProfileInput` → `agent_definitions` insert so the
existing `mcp__fulcrum__create_agent_profile` caller keeps working while
new fields populate with sensible defaults.

### 6.2 Corresponding file format (one file, two readers)

The same file lives at `.claude/agents/<name>.md` and is parseable by
Fulcrum. Claude Code reads only the fields it knows; Fulcrum reads them all.

```markdown
---
# ---- Identity ----
name: senior-security-auditor
description: >
  Deep security audit for high-risk PRs. Invoked when security_reviewer
  flags a CRITICAL finding or when diffs touch auth, crypto, or network
  code paths. Read-only.
version: 0.3.1
stability: beta

# ---- Capability class (Fulcrum-specific, ignored by Claude Code) ----
roleClass: security_reviewer

# ---- Behaviour (CrewAI-style optional split) ----
goal: >
  Produce a structured security verdict (PASS | WARN | CRITICAL) with
  exploit scenarios and concrete remediation steps.
backstory: >
  You are a senior security engineer with a decade of experience in
  application and infrastructure security. You prefer specific,
  reproducible findings over vague warnings. You never pass-through on
  CRITICAL findings.

# ---- Model spec ----
model: claude-opus-4-6
modelFallback: claude-sonnet-4-5
modelSettings:
  temperature: 0.0
  max_tokens: 8192
  tool_choice: auto

# ---- Capabilities ----
tools:
  - Read
  - Grep
  - Glob
  - WebFetch
disallowedTools:
  - Write
  - Edit
  - MultiEdit
  - Bash
mcpServers:
  - fulcrum
skills:
  - owasp-top-10
  - crypto-review

# ---- Constraints ----
permissionMode: plan          # Claude Code field: read-only plan mode
maxTurns: 40
maxExecutionMs: 900000        # 15 minutes wall clock
tokenBudget: 200000
costBudgetCents: 500
isolation: worktree
concurrencyClass: per-workspace
rateLimitRpm: 10

# ---- Memory ----
memoryReadScopes:  [project, task]
memoryWriteKinds:  [task_decision, task_outcome, lesson]
memoryBlocks:
  - label: persona
    description: Self-concept for this auditor
    limit: 2000
    read_only: true
    value: >
      Senior security engineer, meticulous, uses OWASP Top 10 and CWE
      references, never glosses over crypto mistakes.

# ---- Handoffs ----
handoffDescription: >
  Use for deep security review on diffs already flagged CRITICAL or
  touching auth / crypto / network code paths.
handoffTargets:
  - integration_worker        # may escalate CRITICAL to halt merges
  - chief_of_staff            # may escalate blocked runs
allowDelegation: false

# ---- Output contract ----
outputSchema:
  $schema: https://json-schema.org/draft/2020-12/schema
  type: object
  required: [verdict, findings]
  properties:
    verdict: { enum: [PASS, WARN, CRITICAL] }
    findings:
      type: array
      items:
        type: object
        required: [severity, category, file, line, remediation]
        properties:
          severity:    { enum: [low, medium, high, critical] }
          category:    { type: string }
          file:        { type: string }
          line:        { type: integer }
          cwe:         { type: string }
          remediation: { type: string }

# ---- Observability ----
tracingEnabled: true
metrics: [latency, tokens, tool_calls, cost_cents]
evalSuites:
  - security-review-golden-set-v1
hooks:
  onStart: log:debug
  onEnd:   log:info

# ---- Administrative ----
tags: [security, read-only, high-risk]
---

You are a senior security engineer conducting a deep audit on the
provided diff. Your job is to identify concrete, exploitable security
problems and produce a structured verdict the integration_worker can
act on.

## Process

1. Read the full diff before commenting on any single hunk.
2. For each changed file, check:
   - Input validation at trust boundaries.
   - Output encoding against injection (SQL, template, XSS, command).
   - Authentication and authorisation decisions.
   - Cryptographic primitives (keys, IVs, algorithms, protocols).
   - Secret leakage (log lines, error messages, dumps).
   - Unsafe deserialisation and dependency pins.
3. For each finding, record: file, line, severity, category, CWE
   (if applicable), remediation as a specific diff the author can apply.
4. Choose a verdict:
   - `PASS`   — no findings above `low` severity.
   - `WARN`   — findings up to `high` severity with clear fixes.
   - `CRITICAL` — any `critical` finding, any exploit primitive
     demonstrated, or any unresolved auth/crypto bug.
5. Emit the `outputSchema`-conforming JSON as your final answer.

Do not modify any files. Do not run tests or the build. If you need
information beyond the diff, request it through the `read_file` tool or
escalate to the Chief of Staff rather than guessing.
```

Claude Code will ignore `roleClass`, `goal`, `backstory`, `modelFallback`,
`concurrencyClass`, `rateLimitRpm`, `memoryReadScopes`, `memoryBlocks`,
`handoffTargets`, `outputSchema`, `evalSuites`, `tags` — these are silently
dropped as unknown frontmatter fields. Fulcrum's parser reads them. The body
serves as the system prompt for both readers.

### 6.3 Ingest path

1. On `workspace_open`, walk `.claude/agents/*.md` + `~/.claude/agents/*.md`
   + `plugin agents/*.md` (R4 §1.2 scope precedence).
2. For each file, parse the frontmatter into the `agent_definitions` row
   shape, hash the body as `instructions_sha256`, and upsert by
   `(workspace_id, name, version)`.
3. Write a signing hook that computes a canonical hash over the full row +
   body and stores it in `signature` / `signer_key_id` when a dev key is
   present. (R4 §8.2 item 17.)
4. Emit an A2A Agent Card by projecting the row into
   `/.well-known/agent.json` shape (R4 §8.2 item 19) — mostly a renaming job
   plus a `url` field pointing at the Fulcrum MCP server.

### 6.4 `start_agent_run` migration

`StartAgentRunInput` gains a `definition_id?: string` field alongside the
existing `role: AgentRole`. At dispatch time:

- If `definition_id` is present, look up the row and use its `role_class`,
  `model_provider`/`model_name`, `tools_allow`, `memory_read_scopes`, etc.
- If only `role` is present, synthesise a legacy-shim definition at dispatch
  time (derive tools and model from the existing hardcoded
  `roleCapabilities()` table). This preserves backward compatibility for a
  release.
- Eventually, deprecate the bare `role` path and require `definition_id`.

### 6.5 `TeamSlot` changes

`TeamSlot.role` becomes `TeamSlot.role_class`. A new field
`TeamSlot.definition_id?: string` resolves a slot to a concrete agent
definition. If both `role_class` and `definition_id` are supplied,
`definition_id` wins but must match `role_class`. This lets a team template
say "two software_engineers, one of them using the senior-rust agent
definition."

---

## 7. Team composition gaps

### 7.1 Slots cannot reference a profile id

`TeamSlot` (`packages/teams/src/types.ts:16-30`) has an `agent_profile?:
string` field but no code path reads it at dispatch time. Confirmed via grep:
the only matches outside the type definition are in
`packages/teams/src/tests/teams.test.ts:422, 437, 452`, which merely assert
the field round-trips through the DB. The field is an undocumented hint.

R4 §5.5 / §5.6 imply that a team's composition should pin exact agent
definitions, not bare role tags, because otherwise any changes to the
underlying definition silently reshape the team. Fix: rename to
`definition_id`, make it resolve at `invokeTeam` time, and cache the
resolved id in `TeamInstance.resolved_slots`.

### 7.2 Heartbeat model mismatch

`TeamInstance` has its own `status` enum
(`created | ready | spawning | running | waiting | blocked | completed |
failed | cancelled` — `types.ts:64`) which is *similar to but distinct from*
`AgentRun.status` (`created | starting | running | waiting | blocked |
failed | finished | aborted | stale`). The team instance does not have a
`heartbeat_at` column, while `AgentRun.heartbeat_at` exists
(`types.ts:131`). Consequence: a team instance can go `stale` only by being
recomputed from its member runs' statuses, and there is no direct "team is
alive" signal. For long-running teams with many members, this is an
observability gap — R4 §8.1 item 10 ("observability turned on by default")
is implemented at the run level but not the team level.

### 7.3 Scheduler knows counts, not per-profile rate limits

`packages/teams/src/scheduler.ts:22-60` enforces three caps: `global_cap=8`,
`per_project_cap=4`, `per_template_cap=2`. It does not know:

- per-definition concurrency class (`singleton` / `per-workspace` /
  `parallel`) because definitions don't have that field;
- per-definition `max_rpm` rate limits;
- per-definition `cost_budget_cents`;
- `PolicyConfig.wip_limit_per_role` (`types.ts:254`) is applied by
  `runs.ts` on `startAgentRun`, not by the team scheduler.

Fix: the agent definition becomes the carrier for these fields and the
team scheduler consults them at `canStartTeam` time. See F4-ISSUE-05.

### 7.4 No subteam recursion

There is no `TeamTemplate → TeamTemplate` composition. A template's slots
reference roles, not templates. CrewAI does not support subteams either, but
Google ADK does via `SequentialAgent` / `ParallelAgent` containing other
agents. Fulcrum would benefit from being able to compose "implementation
team" as "planner + (N software_engineers in parallel) + reviewer_team".
Without this, complex workflows have to be flattened in the CoS prompt,
which is exactly the token-bloat pattern R4 §1.2 warns against for subagent
dispatch.

### 7.5 `TeamPolicy.budget_class` / `latency_class` / `quality_class` are strings

`types.ts:34-36` defines these as unions (`small | medium | large`, etc.)
but nothing acts on them. They are hints to the scheduler and the selector,
but no scheduler entry point accepts them. R4 §6 (cost budget in dollars) is
the right direction — replace with concrete numeric budgets that the
scheduler enforces.

---

## 8. Findings — CRITICAL

### C1 — `agent_profiles` table is cosmetic; nothing dispatches it

**Evidence.** `createAgentProfile` is imported from non-test code only at
`packages/cli/src/index.ts:598, 1128-1132`. `startAgentRun` in
`packages/core/src/runs.ts:175-235` accepts `role`, `agent_id`, `pi_profile`,
`task_packet`, `git_branch` — no `profile_id` / `definition_id`. There is no
call in `runs.ts`, `teams.ts`, or `scheduler.ts` that reads `system_prompt`
or `capabilities` from an `AgentProfileRow`. The existing MCP tool
`mcp__fulcrum__create_agent_profile` is a write-only surface — the data it
writes cannot be dispatched.

**Impact.** The entire dynamic-extensibility story in the spec is a lie.
Users cannot "define a custom agent and run it". The custom role's
Markdown file (`agent-integration/roles/custom.md:5`) documents this pattern
as if it worked, but the resolution step where "the paired `agent_profiles`
row provides the concrete description, system prompt, and capability
overrides" is not implemented anywhere.

**Fix.** Migrate to `agent_definitions` per §6 above, add `definition_id`
to `StartAgentRunInput`, and wire `runs.ts` to load instructions, model,
tools, and memory scopes from the row at dispatch time.

### C2 — Agent definitions have no `version` field

**Evidence.** `agent_profiles` migration at
`packages/core/src/db/migrations.ts:2207-2230`; no `version` column. R4 §8.1
item 1 and R4 §2 row "Version field on agent" — only AutoGen v0.4 has this
today, and R4 flags it as a should-be-universal gap.

**Impact.** You cannot pin a team to a specific version of an agent
definition, which breaks reproducibility and makes A/B testing or
stability-tier promotion (experimental → beta → stable) impossible. Every
edit to an agent definition is destructive.

**Fix.** Add `version TEXT NOT NULL DEFAULT '0.1.0'` + stability column, and
make `(workspace_id, name, version)` the unique key instead of
`(workspace_id, name)`.

### C3 — Zero role MD files declare tools, model, or handoffs

**Evidence.** `rg '^---$' agent-integration/roles/` returns no matches. No
file has YAML frontmatter. All tool lists are prose bullets; all handoff
routing is prose sentences; no file specifies a model.

**Impact.** R4 §8.1 items 3 ("tool surface is declared"), 7 ("model spec is
explicit"), 9 ("handoffs are declared") all fail uniformly. The .md files
are human-readable but not machine-actionable, so every enforcement gate
must be open-coded in TypeScript (`roles.ts:34-44`). Drift between the prose
and the code is inevitable and has already happened (F4-ISSUE-08 below).

**Fix.** Add frontmatter per §6.2 to all 24 files. Split the 24 role-class
descriptors into `docs/roles/` (human docs) and actual dispatchable
definitions into `.claude/agents/` (ingested by Fulcrum).

### C4 — Role MDs live in the wrong directory for Claude Code compatibility

**Evidence.** Files are at `agent-integration/roles/*.md`. R4 §1.2 says
Claude Code discovers subagents at `.claude/agents/<name>.md` (project) or
`~/.claude/agents/<name>.md` (user). Fulcrum's location is read only by
`packages/core/src/status.ts:30-42` via a hand-rolled parser.

**Impact.** None of these files are usable as Claude Code subagents today,
even though the content is 80% of the way there. We bought the "markdown
subagent" pattern and then walked past the place where it would be
automatically picked up.

**Fix.** Move (or symlink) `agent-integration/roles/` content to
`.claude/agents/` after adding frontmatter. Tracked as F4-ISSUE-02.

### C5 — `startAgentRun` accepts a free-form `pi_profile` string with no validation

**Evidence.** `types.ts:121` (`pi_profile: string | null`); `types.ts:378`
(input type allows any string); `runs.ts:195-203` persists it verbatim.
There is no enum, no validation, and no link to an agent definition. The
string format is documented in comments as
`"claude-cli/claude-opus-4-5"` / `"gemini-cli/gemini-pro"`
(`types.ts:367`) but nothing enforces that format.

**Impact.** The thing that actually binds an agent to a model is a
free-form label. R4 §8.1 item 7 ("model spec is explicit") and R4 §8.1
item 10 ("observability turned on by default — drift as the framework
changes") both fail. Two agents with the same role can run on wildly
different models and nothing surfaces the difference.

**Fix.** Move model binding onto `agent_definitions.model_provider` +
`model_name` + `model_settings`. Replace `pi_profile` with
`definition_id`; keep it as a transitional shim.

---

## 9. Findings — HIGH

### H1 — `system_prompt` is a dead field

`agent_profiles.system_prompt` is nullable and never read outside tests.
The comment at `packages/core/src/agent-profiles.ts:1-6` documents an intent
("so that custom specializations can be composed into team templates") but
the read side was never built. Either wire it to dispatch, or delete the
column until you are ready to implement it. Today it is a honey-pot that
makes the CoS think it can customise behaviour when it cannot.

### H2 — `capabilities Record<string, unknown>` has no schema

`types.ts:217` and migration `capabilities TEXT NOT NULL DEFAULT '{}'`. No
validator, no documented shape. R4 §5.3 requires `tools`, `mcp_servers`,
`skills`, `knowledge_sources` as first-class lists. Replace with the
four typed columns or strict-typed JSON sub-fields.

### H3 — Handoff targets are not declared anywhere

`handoffs` table exists (`types.ts:305-326`) for *runtime* handoff packets,
but there is no *design-time* declaration of "which agents may any given
agent hand off to." The only rule in the codebase is "L1 may delegate,
everyone else may not" — implicit in `canInvokeTeams`. R4 §5.6 / §8.1 item 9
wants this explicit per agent.

### H4 — Memory access is unscoped at the agent level

`recallTaskContext` in `runs.ts:207-211` is called for every run regardless
of role. There is no declarative "this role may only read project-scope
memories" or "this role may not write memories of kind `lesson`". Compare
R4 §1.2 (Claude Code `memory` field) and R4 §1.8 (Letta memory blocks).

### H5 — No guardrails are first-class

R4 §6 input/output guardrails are not a field on any Fulcrum type. The
`chief_of_staff_no_direct_writes` invariant is hardcoded in `roles.ts` and
referenced in prose in `chief_of_staff.md:21`. Moving to declarative
guardrails on the agent definition would make this auditable and
user-extensible.

### H6 — Team slots can't pin agent definitions

`TeamSlot.agent_profile?: string` is a field without a consumer. Teams can
therefore be specified only at the role-class level, not the
agent-definition level. Any change to a role class silently changes every
team that uses it. R4 §5.6 implicitly requires definition-level pinning.

### H7 — Scheduler is role-blind

`packages/teams/src/scheduler.ts:14-60` only caps by instance count. It does
not know about per-definition concurrency class, rate limits, or cost
budgets — because those fields don't exist. The scheduler cannot express
"only one senior-security-auditor at a time" or "max 20 LLM requests per
minute across this workspace's instances of definition X".

### H8 — No A2A Agent Card surface

R4 §4.1 + §8.2 item 19. Zero implementation. When Fulcrum needs to expose
an agent to another Fulcrum instance or to a third-party system, there is
no `.well-known/agent.json` to point at.

---

## 10. Findings — MEDIUM

### M1 — `listAgentProfiles()` conflates role-class descriptors with dynamic definitions

`packages/core/src/status.ts:178-206` returns a merged list where
"hardcoded" rows represent *role classes* and "db" rows represent *dynamic
definitions*. Callers cannot distinguish "this is a capability tag" from
"this is a dispatchable agent". Split into `listRoleClasses()` and
`listAgentDefinitions()`.

### M2 — Tool names in MD files are not validated

Examples: `software_engineer.md:29` names `run_tests`, `search_codebase` —
neither is a real tool name in the Fulcrum or Claude Code namespace. The
list is aspirational, documenting intent, not declaring capability.

### M3 — No role/goal/backstory split

`AgentProfileRow.description` collapses R4 §5.2's role/goal/backstory triad
into one short column. For roles authored by non-engineers (PMs, analysts),
the CrewAI pattern is demonstrably more useful.

### M4 — `TeamPolicy.budget_class`/`latency_class`/`quality_class` fields are unread

`types.ts:38-46`. Grep shows no consumer outside tests. Either delete or
wire into the scheduler decision logic.

### M5 — No permission_mode on agent definitions

`roles.ts` derives a read-only vs write capability from the role slug
(`REVIEWER_ROLES` at `roles.ts:24-28`). A declarative `permission_mode`
field on the definition would let a single role class have both read-only
and write variants (e.g., a sandboxed research_worker vs a normal one).

### M6 — No isolation field on agent definitions

`worktree_id` exists on `agent_runs` (`types.ts:133`) but isolation is
decided outside the agent definition, so two runs of the same role can have
different isolation envelopes. R4 §1.2 (Claude Code `isolation: worktree`)
shows the declarative version.

### M7 — No `concurrency_class` distinction

`packages/teams/src/scheduler.ts` cannot express "this agent is a
singleton" because there is no field to express it on. F4-ISSUE-05.

### M8 — README.md in `agent-integration/roles/` calls them "Role Definitions"

The README at `agent-integration/roles/README.md:1` uses the word "role
definition", while the files themselves function as "role prompt fragments".
Rename to match the new nomenclature (§2 above).

### M9 — `orchestrator.md` claims team invocation it does not have

Documented under §3 above. The orchestrator role file says it may invoke
teams "within the declared scope" but `L1_ROLES` in `roles.ts:21` excludes
it. This is an undetectable prose-vs-code drift bug that a declarative
`may_invoke_teams` field would make a compile-time type error.

### M10 — No AGENTS.md at repo root

R4 §4.3. Low-effort, high-signal — ship a minimal one referencing the
Fulcrum agent definitions workflow.

### M11 — Hardcoded `AGENT_PROFILES` duplicates MD file content

`status.ts:47-72` has 24 rows of `description` fallbacks that the runtime
loader will always try to override with the MD's `## Purpose` paragraph.
Either delete the fallbacks (and make the MD files required) or treat the
hardcoded list as the authoritative source and delete the MD files. Pick
one; having two sources of truth is a recurring phase-3 bug pattern.

### M12 — `AgentProfile.source` field is a leaky abstraction

`types.ts:199-205` exposes `source: 'hardcoded' | 'db'` to downstream UI
code so it can tell the two apart. R4's answer is that these are different
object types entirely (role class vs agent definition) and the conflation
should not exist in the API surface. See M1 and §2.

---

## 11. Findings — LOW

### L1 — No `color` / UI hint field

R4 §1.2 lists `color` as a UX convenience in Claude Code. Not important for
correctness, but free to add.

### L2 — No `effort` field

R4 §1.2 `effort: low|medium|high|max`. Fulcrum uses `pi_profile` to imply
effort (opus vs sonnet) which conflates two concerns.

### L3 — No lineage / inheritance

R4 §6 `extends: base-agent`. No framework ships this today. Ship later.

### L4 — No signing

R4 §6 cryptographic signature over the canonicalised spec. Defer until
definitions live in a registry.

### L5 — MD body mixes persona and process

Several files (e.g. `prd_planner.md:30-55`) include both persona framing and
step-by-step process. Splitting the body into `persona:` + `process:` would
match §6.2's YAML-prominent style better, but this is optional.

### L6 — Role file lengths are clustered at 28 lines

21 of 25 MD files are 25–28 lines. This suggests templated minimum content
rather than actual specification. When the rewrite happens, allow
substantially longer files where needed (the CrewAI reference agents are
often 60–100 lines of YAML).

### L7 — `custom` role file is circular

`custom.md:5` describes itself as "always paired with a DB-backed
`agent_profiles` row" — which is the thing that doesn't work (C1). Reword
after C1 is fixed.

### L8 — No `tags` field on agent definitions

Discoverability aid. Add when building the listing UI.

---

## 12. Issues to plan

- **F4-ISSUE-01 — Replace `agent_profiles` with `agent_definitions`.**
  Implement the §6.1 schema. Write migration 031 adding the new table,
  backfill from `agent_profiles`, keep the old table behind a read-only
  view for one release. Update `AgentProfileRow` →  `AgentDefinitionRow`.
  Update the MCP tool to accept all new fields. Deprecate
  `mcp__fulcrum__create_agent_profile`; introduce
  `mcp__fulcrum__create_agent_definition`.
  **Addresses:** C1, C2, H1, H2, H3, H4, M1, M3, M5, M6, M7, M8, M11, M12.
  **Size:** L (schema + MCP + core API + tests).

- **F4-ISSUE-02 — Migrate role MDs to Claude Code subagent format with
  frontmatter, move to `.claude/agents/`.** Add frontmatter to all 24 files
  using §6.2 as the template. Split aspirational content (prose
  descriptions, narrative responsibilities) into `docs/roles/<slug>.md`
  which becomes the human-readable reference. The `.claude/agents/<slug>.md`
  file becomes the machine-readable dispatchable definition. Add a loader
  that ingests `.claude/agents/` into `agent_definitions` on workspace open.
  **Addresses:** C3, C4, M2.
  **Size:** L (24 files × rewrite, plus the loader and new docs).

- **F4-ISSUE-03 — Add declarative `tools_allow` / `tools_deny` / `model` /
  `handoff_targets` / `permission_mode` / `memory_read_scopes` to agent
  definitions and wire them to `startAgentRun`.** Replace the derivation
  logic in `roles.ts:34-44` with field lookups on the definition row.
  Preserve `roleCapabilities()` as a legacy shim that synthesises fields
  from the role class alone until F4-ISSUE-01 lands.
  **Addresses:** C5, H3, H4, H5, M5.
  **Size:** L. Depends on F4-ISSUE-01.

- **F4-ISSUE-04 — Migrate `pi_profile` to `definition_id` + `executor_uri`.**
  Split the conflated `pi_profile` string into two fields: `definition_id`
  (which agent?) and `executor_uri` (which runner/CLI binding?). Keep
  `pi_profile` as a computed read-only view on `agent_runs` for one
  release. Update `buildSpawnableRun` in `@pi/executor` callers.
  **Addresses:** C5, §2 nomenclature.
  **Size:** M.

- **F4-ISSUE-05 — Teach the team scheduler about per-definition
  concurrency class, rate limits, and cost budgets.** Extend
  `SchedulerConfig` with per-definition caps read from `agent_definitions`.
  Extend `TeamSlot` to have `definition_id?: string` (deprecate
  `agent_profile`). In `invokeTeam`, consult per-definition concurrency
  class before admitting a new team member.
  **Addresses:** H6, H7, M4, M7.
  **Size:** M. Depends on F4-ISSUE-01.

- **F4-ISSUE-06 — Emit an A2A Agent Card from each agent definition.**
  Add a read-only endpoint that returns `/.well-known/agent.json` per
  definition. Accept an agent definition as the only input; map fields 1:1
  where possible. Sign with a workspace-local key if configured.
  **Addresses:** H8.
  **Size:** M.

- **F4-ISSUE-07 — First-class typed output contracts on agent
  definitions.** Add `output_schema` JSON-Schema field. Enforce via a
  run-time validator on agent run completion. Promote the existing CoS /
  PRD planner Markdown response format blocks to schemas.
  **Addresses:** part of H5 and §6 advanced fields.
  **Size:** M.

- **F4-ISSUE-08 — Fix `orchestrator.md` drift vs `roles.ts`.** Either
  (a) rewrite `orchestrator.md:5, 7-15` to say the role *cannot* invoke
  teams and must escalate, or (b) extend `L1_ROLES` / `canInvokeTeams` to
  accept a bounded `orchestrator` instance with a scope field and enforce
  it. Recommended path: (a) now, (b) once F4-ISSUE-01/03 give us a place
  to declare scope-bounded team invocation.
  **Addresses:** M9.
  **Size:** S for option (a), L for option (b).

- **F4-ISSUE-09 — Declarative agent definition version + stability.**
  Add `version` + `stability` columns to `agent_definitions`. Add a
  promotion helper (`promote_agent_definition`) that copies
  experimental → beta → stable with trace-linked deprecation.
  **Addresses:** C2 and R4 §6 versioning.
  **Size:** M. Depends on F4-ISSUE-01.

- **F4-ISSUE-10 — Agent definition-level evals.** Add `eval_suites` field
  and a `run_definition_eval` entry point. Block promotion from beta to
  stable without a passing eval run. Out of scope for the F4 audit itself
  but tracked here.
  **Size:** L.

- **F4-ISSUE-11 — Subteam recursion / ADK-style workflow agents.** Allow
  a `TeamTemplate` to nest other templates under a slot. Introduce
  `SequentialAgent` / `ParallelAgent` / `LoopAgent` workflow templates.
  **Addresses:** §7.4 subteams gap.
  **Size:** L.

- **F4-ISSUE-12 — Add `AGENTS.md` at repository root** describing Fulcrum's
  agent definition conventions, how to add a new one, and where the code
  that dispatches them lives. Minimal compliance with R4 §4.3.
  **Size:** S.

- **F4-ISSUE-13 — Delete the hardcoded `AGENT_PROFILES` array once
  Markdown ingestion is the source of truth.** Part of F4-ISSUE-02 cleanup.
  **Size:** S.

- **F4-ISSUE-14 — Teach `TeamInstance` to heartbeat.** Add
  `heartbeat_at TEXT` column; janitor marks team instances stale when all
  their members are stale; event pipeline emits
  `team_instance_heartbeat` / `team_instance_stale`.
  **Addresses:** §7.2 heartbeat gap.
  **Size:** M.

- **F4-ISSUE-15 — Validate tool names in agent definitions against a
  registry.** On ingest, reject `tools_allow` entries that do not appear in
  the Fulcrum tool registry + declared MCP servers. Makes M2 a startup
  error instead of a latent drift bug.
  **Size:** S.

---

## 13. Rebuild vs retrofit decision

**Recommendation: retrofit aggressively, not rebuild.**

Reasoning:

1. **The enforcement harness is usable.** `roles.ts`, `canInvokeTeams`,
   the DB CHECK-constraint tests, the `isL1` guard, the
   `chief_of_staff_no_direct_writes` invariant — these are the *correct*
   shape; they just need declarative fields to read instead of hardcoded
   sets. That migration is mechanical.

2. **The team surface is structurally right.** `TeamTemplate`,
   `TeamInstance`, `TeamMember` are modelled as distinct objects with
   lifecycle, versioning, and the right SQL shape. The fix is to give
   slots a `definition_id` and teach the scheduler about per-definition
   constraints — additive work, not a rewrite.

3. **`agent_profiles` is cosmetic but not actively harmful.** It's an
   unused table with one MCP write endpoint. Replacing it via a migration
   is low-risk because nothing consumes the data yet. Migration 031 can
   create `agent_definitions` cleanly with no production data to preserve
   beyond a handful of test fixtures.

4. **The 24 Markdown files already carry ~70% of the R4 agent-definition
   body content** (the `## Purpose`, `## Responsibilities`, `## Prohibitions`
   sections are closely aligned to goal/instructions/permissions). Adding
   frontmatter and moving them into `.claude/agents/` is a mechanical
   sweep — call it a few hours of work per file, on the order of a
   one-day project for all 24.

5. **The design debt is concentrated in *what is missing*, not in *what is
   wrong*.** The pieces Fulcrum has all point in the right direction; they
   just stop early. Comparison to R4 §5: of the 8 categories, 2.5 are
   partially present and 5.5 are outright missing. That is painful but it
   is additive work — add columns, add fields, add a loader, wire the new
   fields into `startAgentRun`. No inversion, no demolition.

6. **The only structural rebuild pattern that would be justified**
   is replacing "role slug as the unit of dispatch" with "definition_id as
   the unit of dispatch". That is a big change but `startAgentRun` has one
   caller surface (`packages/cli/src/index.ts` + the MCP tool +
   `packages/core/src/index.ts` re-export), not dozens, so the blast
   radius is contained.

### Ordered execution plan

1. **F4-ISSUE-01** (agent_definitions schema) — unblocks everything else.
2. **F4-ISSUE-02** (Markdown frontmatter + `.claude/agents/` move) — in
   parallel with 01; no dependency.
3. **F4-ISSUE-03 + F4-ISSUE-04** (wire new fields to dispatch + split
   `pi_profile`) — depends on 01.
4. **F4-ISSUE-09** (version + stability) — depends on 01, lands with or
   just after it.
5. **F4-ISSUE-08** (orchestrator drift) — ship option (a) immediately as a
   one-line fix; revisit option (b) after 03 exists.
6. **F4-ISSUE-05** (scheduler learns about definitions) — depends on 01/03.
7. **F4-ISSUE-07** (typed output contracts) — depends on 01; can ship
   incrementally per role.
8. **F4-ISSUE-06** (A2A Agent Card emitter) — depends on 01; independent
   after that.
9. **F4-ISSUE-15** (tool name validation on ingest) — depends on 02.
10. **F4-ISSUE-14** (team heartbeat) — independent; can land any time.
11. **F4-ISSUE-11** (subteams / workflow agents) — largest, ship last.
12. **F4-ISSUE-10** (eval suites) — ship with a first eval implementation.
13. **F4-ISSUE-12** (AGENTS.md) — trivial; ship whenever.
14. **F4-ISSUE-13** (delete hardcoded fallbacks) — cleanup after 02.

### What would trigger a rebuild

If any of the following were true, the recommendation would flip to a
full rebuild of the agent surface:

- If `AgentRole` had become dynamic — i.e. users could add role classes at
  runtime. It hasn't; it's a compile-time union.
- If `agent_runs.role` were used for policy decisions at many sites
  instead of being centralised through `roleCapabilities()`. It isn't.
- If `pi_profile` were parsed into executor + model at dozens of call
  sites. It isn't — it's a pass-through string consumed only by the
  executor process Pi.
- If `TeamSlot` were referenced from outside the teams package. It isn't
  — it's contained.

None of these are true. Retrofit.

---

## 14. Appendix — audit sources

- R4: `docs/audit/research/r4-agent-definitions.md` (1198 lines read)
- `packages/core/src/types.ts` (433 lines read)
- `packages/core/src/roles.ts` (61 lines read)
- `packages/core/src/agent-profiles.ts` (162 lines read)
- `packages/core/src/status.ts` (207 lines read)
- `packages/core/src/runs.ts` (excerpt around `startAgentRun`, lines 175–235)
- `packages/core/src/db/migrations.ts` (agent_profiles section, lines 2195–2232)
- `packages/core/src/tests/check-constraints.test.ts` (229 lines read)
- `packages/cli/src/index.ts` (relevant MCP tool wiring, lines 598–1132)
- `packages/teams/src/types.ts` (152 lines read)
- `packages/teams/src/scheduler.ts` (lines 1–60 read)
- `packages/teams/src/teams.ts` (lines 1–80 read)
- `agent-integration/roles/*.md` (24 files read in full)
- `agent-integration/roles/README.md` (50 lines read)

R4 sections directly cited in this audit: §1.1, §1.2, §1.4, §1.5, §1.8,
§1.9, §2, §3, §4.1, §4.3, §5 (all subsections), §6, §7, §8.1, §8.2, §8.3.
