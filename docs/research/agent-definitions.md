# Agent Definition Standards Research

_Date: 2026-04-15_

---

## Key Standards Summary

### A2A Protocol (v0.3.x, Google, 2025)

Agent Cards are JSON metadata documents served at `/.well-known/agent.json`. They describe an agent's identity, endpoint, capabilities, skills, and security requirements. Fulcrum's monitor already serves this endpoint.

**Required fields:** `protocolVersion`, `name`, `description`, `url`

**Important optional fields:** `provider` (org + url), `version`, `documentationUrl`, `iconUrl`, `capabilities` (streaming, pushNotifications, stateTransitionHistory), `defaultInputModes`, `defaultOutputModes`, `skills`, `securitySchemes`

**Skill fields:** `id`, `name`, `description`, `tags?`, `examples?`, `inputModes?`, `outputModes?`

**Authentication:** Uses OpenAPI-aligned `securitySchemes` objects (`type: http/oauth2/apiKey`, `scheme: bearer`, etc.), not a flat string array.

**Discovery:** HTTP GET `/.well-known/agent.json` (unauthenticated by default; spec allows guarding it).

### OpenAI Agents SDK (Python)

Agent defined as a class instance: `Agent(name, instructions, model, tools, handoffs, outputType, handoffDescription)`. No file-based format; entirely programmatic. Key concepts: `name` (human identity/trace label), `instructions` (system prompt), `tools` (list of function_tool or built-in tools), `handoffs` (list of agents to delegate to), `outputType` (structured output schema).

### CrewAI

Agents defined with `role`, `goal`, `backstory`, `llm`, `tools`, `memory`, `allow_delegation`, `verbose`. Supports YAML-based agent definitions (`agents.yaml`) for static setups alongside the Python API. The Role-Goal-Backstory triad is CrewAI's core primitive: role maps to a job title, goal drives decisions, backstory provides contextual persona.

### LangGraph

No explicit "agent definition" object. Agents are expressed as graph nodes with a shared typed `State` schema (`TypedDict` or Pydantic model). Identity comes from node names in the `StateGraph`. Capabilities are implicit in the node's function body. No central registry of agent roles.

### Claude Code `CLAUDE.md`

Roles defined in markdown via prose: role name, boundaries (`MUST NOT`, `MUST`), allowed tools, output format constraints. No formal schema. The CLAUDE.md in this repo defines `chief_of_staff` (L1) and all other roles (L2) with explicit behavioral constraints and response format templates.

---

## Gap Analysis

### GAP-AGENTDEF-1: Missing `protocolVersion` in A2AAgentCard

- **Standard**: A2A spec requires `protocolVersion: string` (e.g., `"0.3.0"`) as a top-level field in every Agent Card.
- **Fulcrum**: `packages/core/src/a2a-card.ts:24-34` — `A2AAgentCard` interface has no `protocolVersion` field. `packages/monitor/src/agent-card.ts` — `buildAgentCard()` also omits it from the returned object.
- **Severity**: Major
- **Fix direction**: Add `protocolVersion: string` to the `A2AAgentCard` interface, default it to `"0.3.0"`, and emit it in both `buildA2ACard` and `buildAgentCard`.

---

### GAP-AGENTDEF-2: Authentication uses flat string array instead of OpenAPI securitySchemes

- **Standard**: A2A spec requires `securitySchemes` as an OpenAPI-aligned object map (e.g., `{ "bearer": { "type": "http", "scheme": "bearer" } }`), not a flat `{ schemes: ["Bearer"] }` array.
- **Fulcrum**: `packages/monitor/src/agent-card.ts:38-40` — `authentication: { schemes: ['Bearer'] }` is an informal structure that does not match the OpenAPI security scheme object format the spec demands.
- **Severity**: Major
- **Fix direction**: Replace `authentication` with `securitySchemes: Record<string, { type, scheme, ... }>` and add a corresponding `security` array at the card level, following OpenAPI 3.x security scheme conventions.

---

### GAP-AGENTDEF-3: Two inconsistent card builders, neither fully spec-compliant

- **Standard**: A2A spec expects one canonical card per agent endpoint.
- **Fulcrum**: Two independent builders exist: `packages/core/src/a2a-card.ts` (uses proper MIME types `text/plain`/`application/json`, omits `provider` and `authentication`) and `packages/monitor/src/agent-card.ts` (includes `provider` and `authentication`, but uses bare `['text']` instead of MIME types, and serves the aggregate workspace card). Together they cover the spec, but neither is individually compliant, and the core builder is never called by the monitor.
- **Severity**: Major
- **Fix direction**: Consolidate into one builder in core, or have monitor call `buildA2ACard` per definition and merge. Either way, the aggregate card must include `provider`, `authentication`, proper MIME types, and `protocolVersion`.

---

### GAP-AGENTDEF-4: A2A skill `examples` field not supported

- **Standard**: A2A `AgentSkill` supports an `examples?: string[]` field listing example prompts/scenarios for each skill, aiding agent discovery and routing.
- **Fulcrum**: `packages/core/src/a2a-card.ts:9-16` — `A2ASkill` interface has no `examples` field. The `CAPABILITY_SKILL_MAP` (lines 83–140) defines static skills with no examples.
- **Severity**: Minor
- **Fix direction**: Add `examples?: string[]` to the `A2ASkill` interface; populate example prompts in the `CAPABILITY_SKILL_MAP` entries and the fallback generic skill.

---

### GAP-AGENTDEF-5: No file-based agent definition format (YAML/TOML/JSON)

- **Standard**: CrewAI supports `agents.yaml` for declarative agent definitions without code changes. Claude Code uses `CLAUDE.md` (markdown). Most frameworks allow shipping agent definitions as static files alongside the code.
- **Fulcrum**: All 24 built-in role definitions live exclusively in a DB migration (`packages/core/src/db/migrations/m032b.ts`). Custom profiles are stored in the `agent_profiles` DB table. There is no file-based format (no YAML/TOML/JSON schema) that an operator can author, commit to source control, and have Fulcrum load without writing migration SQL.
- **Severity**: Major
- **Fix direction**: Define a YAML or JSON schema for agent definitions (role, display_name, description, model, tools, capabilities, system_prompt, etc.) and add a loader that syncs file-defined agents into the DB at startup, similar to how `fulcrum.config.yaml` works for workspace config.

---

### GAP-AGENTDEF-6: Capabilities array and role enforcement are disconnected

- **Standard**: Agent capability declarations should drive behavior — the listed capabilities should correspond to what the agent is actually allowed to do.
- **Fulcrum**: `AgentDefinition.capabilities` is a flat `string[]` (e.g., `["write_code", "edit_files"]`) stored in the DB at `packages/core/src/db/migrations/m031.ts`. However, actual capability enforcement happens in `packages/core/src/roles.ts` via hardcoded sets (`L1_ROLES`, `REVIEWER_ROLES`) that are completely independent of the `capabilities` array. Changing a definition's `capabilities` in the DB does not change what tools the agent can actually use.
- **Severity**: Major
- **Fix direction**: Either (a) make `roles.ts` policy read from `AgentDefinition.capabilities` so the DB is the source of truth, or (b) document clearly that capabilities in the definition are for A2A/discovery metadata only, and enforce policy exclusively in `roles.ts`. The current state silently implies editability that doesn't exist.

---

### GAP-AGENTDEF-7: No `allow_delegation` / dispatch flag on AgentDefinition

- **Standard**: CrewAI's `allow_delegation` flag per agent controls whether the agent can delegate to others. OpenAI Agents SDK uses `handoffs` lists. Both express per-agent delegation authority in the definition itself.
- **Fulcrum**: Delegation authority (`can_invoke_teams`, `can_dispatch_agents`) is tracked in `AgentProfile.capabilities` (the old `agent_profiles` table) and hardcoded in `roles.ts`, but not captured in the newer `AgentDefinition` interface (`packages/core/src/types.ts:269-289`). An `AgentDefinition` row has no explicit field indicating whether the role can dispatch or orchestrate other agents.
- **Severity**: Minor
- **Fix direction**: Add `allow_dispatch: boolean` (or derive it from `capabilities.includes('dispatch_agents')`) to `AgentDefinition`, wire it into `roles.ts`-derived policy checks, and ensure the A2A card reflects the capability accurately.

---

### GAP-AGENTDEF-8: Seeded role descriptions are too thin for meaningful agent routing

- **Standard**: OpenAI Agents SDK uses detailed `instructions` (full system prompts). CrewAI requires `role`, `goal`, and `backstory` as distinct structured fields. A2A skills have `description` and `examples` to aid routing decisions.
- **Fulcrum**: The 24 seeded definitions in `packages/core/src/db/migrations/m032b.ts` have single-sentence `description` values (e.g., `"Gathers context about codebase, requirements, and environment"`) and `system_prompt: NULL` for all built-in roles. There are no `goal`, `backstory`, or per-skill examples. Another agent attempting to route tasks to the right Fulcrum role has minimal signal.
- **Severity**: Major
- **Fix direction**: Populate `system_prompt` for each of the 24 built-in roles in a follow-on migration. Add structured `goal` and `backstory` fields to `AgentDefinition` (or encode them in the system_prompt template), and add skill examples to the A2A card output.

---

### GAP-AGENTDEF-9: A2A card `iconUrl` not supported

- **Standard**: A2A spec includes optional `iconUrl: string` for agent branding and UI display.
- **Fulcrum**: Neither `A2AAgentCard` (`packages/core/src/a2a-card.ts`) nor `buildAgentCard` (`packages/monitor/src/agent-card.ts`) include `iconUrl`.
- **Severity**: Minor
- **Fix direction**: Add `iconUrl?: string` to `A2AAgentCard` and `AgentDefinition`; pass it through to the card builder when set.

---

### GAP-AGENTDEF-10: `agent_definitions` table has no `workspace_id` UNIQUE constraint on `role`

- **Standard**: Multiple workspaces should be able to define the same role independently. The DB schema should enforce uniqueness per (workspace, role), not globally per role.
- **Fulcrum**: `packages/core/src/db/migrations/m031.ts:12` — `role TEXT NOT NULL UNIQUE` is a global unique constraint. The `createAgentDefinition` function in `packages/core/src/agent-definitions.ts:54` scopes the existence check to `workspace_id`, but the DB constraint is workspace-blind — a second workspace attempting to seed `software_engineer` would violate the UNIQUE constraint, not just get a logical conflict error.
- **Severity**: Major
- **Fix direction**: Change the DB constraint to `UNIQUE(workspace_id, role)`, add `workspace_id TEXT NOT NULL DEFAULT 'default'`, and update the index accordingly. The application-level checks in `createAgentDefinition` already assume this shape.

---

## Summary Table

| Gap | Area | Severity |
|-----|------|----------|
| GAP-AGENTDEF-1 | Missing `protocolVersion` in A2A card | Major |
| GAP-AGENTDEF-2 | Wrong `securitySchemes` format | Major |
| GAP-AGENTDEF-3 | Two inconsistent card builders | Major |
| GAP-AGENTDEF-4 | Missing A2A skill `examples` field | Minor |
| GAP-AGENTDEF-5 | No file-based agent definition format | Major |
| GAP-AGENTDEF-6 | Capabilities array disconnected from enforcement | Major |
| GAP-AGENTDEF-7 | No `allow_delegation` flag on AgentDefinition | Minor |
| GAP-AGENTDEF-8 | Built-in role descriptions too thin | Major |
| GAP-AGENTDEF-9 | Missing `iconUrl` field | Minor |
| GAP-AGENTDEF-10 | UNIQUE constraint not workspace-scoped | Major |
