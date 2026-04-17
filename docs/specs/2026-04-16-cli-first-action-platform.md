# Spec: CLI-First Action Platform for Fulcrum

## Assumptions

1. The current `packages/cli/src/tool-registry.ts` is the correct starting point for the canonical action contract rather than introducing a second parallel registry.
2. Existing MCP tool names and MCP-based clients must remain functional for backward compatibility, even if they become aliases over canonical actions.
3. Built-in Fulcrum capabilities and plugin capabilities are both in scope for the canonical action contract in this pass; this repo has no active clients, so we should optimize for architectural cleanliness rather than a long-lived plugin compatibility bridge.
4. Skills, hooks, agent definitions, installer-generated context files, and runtime prompts are part of the platform surface and must follow the CLI-first contract, not just the TypeScript code.
5. This change should optimize for agent runtime behavior, not only developer ergonomics: smaller tool catalogs, lower token usage, lower latency, and fewer wrong tool selections are first-class success criteria.

## Objective

Fulcrum currently has partial CLI parity for MCP tools, but the platform contract is still MCP-shaped in several critical places: registry naming, runtime prompts, skill instructions, agent definitions, and MCP exposure defaults. The result is inconsistent execution paths, larger-than-necessary tool catalogs, and skills that instruct agents to call `mcp__fulcrum__*` directly even when native hooks or deterministic CLI commands are better choices.

The goal of this feature is to standardize Fulcrum around a single canonical action model with multiple execution backends. The preferred runtime order must be native hooks first, CLI second, and MCP third. MCP stays available as a compatibility layer and fallback mechanism, but it stops being the primary internal contract. Fulcrum should expose only the minimum MCP surface required for the current runtime, agent type, and capability gap.

Success means:
- every MCP-exposed capability has a stable CLI contract
- skills and internal automation default to CLI or hook-backed execution
- MCP exposure is selectively filtered instead of defaulting to the whole catalog
- one canonical action contract drives CLI, MCP, hooks, policy, and observability
- plugins author against the canonical action contract instead of MCP-only registration

## Tech Stack

- TypeScript + ESM
- `packages/cli` as the main execution and adapter surface
- `@modelcontextprotocol/sdk` for MCP transport compatibility
- Fulcrum core packages for domain logic and policy evaluation
- Existing agent integration assets under `agent-integration/`
- Vitest for unit and integration coverage

## Commands

Development and verification commands relevant to this feature:

```bash
pnpm --filter fulcrum-cli test
pnpm --filter fulcrum-cli vitest run src/tests/tool-registry.test.ts
pnpm --filter fulcrum-cli vitest run src/tests/mcp-server.test.ts
pnpm --filter fulcrum-cli vitest run src/tests/cli-coverage.test.ts
pnpm test
```

Representative runtime commands that this feature must standardize:

```bash
fulcrum tool list --json
fulcrum tool exec list_tasks --json '{"workspace_id":"ws_x","project_id":"proj_y"}'
fulcrum serve mcp
fulcrum serve mcp --profile hook-only
fulcrum serve mcp --profile software_engineer
```

New CLI forms to formalize in this migration:

```bash
fulcrum action list --json
fulcrum action exec <action_name> --json '<payload>'
fulcrum mcp plan --agent-type <role> --platform <platform> --runtime <runtime>
```

Grouped domain commands such as `fulcrum task list` remain preferred user-facing interfaces where they already exist.

## Project Structure

Primary implementation areas:

```text
packages/cli/src/tool-registry.ts      Canonical action registry source, replacing MCP-first assumptions
packages/cli/src/index.ts              CLI command surface and generic action execution entrypoint
packages/cli/src/mcp-server.ts         MCP adapter and selective exposure planner integration
packages/cli/src/mcp-tools.ts          MCP schema adapter layer, no longer source of truth
packages/cli/src/hooks.ts              Native hook integration and CLI-backed substitution rules
packages/cli/src/tests/                Registry, CLI, MCP, and filtering verification
packages/fulcrum-mcp/src/index.ts      Compatibility wrapper and installer/runtime guidance
agent-integration/skills/              Skill guidance migration from MCP-first to CLI-first
agent-integration/agent-defs/          Agent tool/runtime contracts and filtered exposure defaults
agent-integration/roles/               Human-readable role guidance that currently references MCP names
agent-integration/claude/CLAUDE.md     Generated or curated runtime guidance that must stop teaching MCP-first usage
docs/guides/cli-reference.md           User-facing CLI contract
docs/guides/mcp-tools.md               MCP compatibility guidance
docs/specs/                            Architecture and migration records
```

## Code Style

The platform should express one canonical action entry that describes all backends without duplicating business logic:

```ts
interface ActionDefinition {
  action_name: string
  handler: (args: Record<string, unknown>, deps: HandlerDeps) => Promise<unknown>
  cli: {
    command: string[]
    stdin_json: boolean
    exit_codes: {
      success: 0
      denied: 2
      invalid_input: 3
      unsupported: 4
      execution_failed: 5
    }
  }
  mcp: {
    tool_name: string
    schema?: ToolSchema
    compatibility_only?: boolean
  }
  hooks: {
    coverage: 'none' | 'partial' | 'full'
    native_points: string[]
    cli_substitutable: boolean
  }
  capabilities: {
    readOnly: boolean
    destructive: boolean
    longRunning?: boolean
    minRole?: string
  }
  availability: {
    platforms: string[]
    agent_types?: string[]
    runtime_capabilities?: string[]
    config_flags?: string[]
  }
  fallback_order: Array<'hook' | 'cli' | 'mcp'>
  observability: {
    trace_name: string
    event_name: string
  }
}
```

Guiding principles:
- canonical names live in code, not prompt text
- grouped CLI commands are the primary user/developer experience
- generic action execution exists for scripting, hooks, and compatibility
- MCP schema remains an adapter over the canonical action definition

## Testing Strategy

Testing must prove both architectural correctness and backward compatibility.

Required coverage:

1. Registry contract tests
- every built-in action has complete metadata
- every action with MCP exposure has a valid MCP mapping
- every MCP-exposed action has a stable CLI mapping

2. CLI execution tests
- `fulcrum action exec` and `fulcrum tool exec` invoke the same handler path
- exit codes are standardized and deterministic
- grouped CLI commands and generic action execution stay aligned

3. MCP exposure planner tests
- filtering by hook coverage
- filtering by platform
- filtering by agent type
- filtering by runtime capabilities
- filtering by policy/config
- explicit compatibility mode preserves full MCP exposure

4. Hook and fallback tests
- native hook path wins when coverage is full
- CLI substitution is used before MCP when hooks are missing but shell execution is available
- MCP fallback remains available when runtime constraints require it

5. Content-surface tests
- skills, role docs, agent defs, and generated runtime guidance stop defaulting to `mcp__fulcrum__*` when a CLI-backed action exists
- backward-compatibility docs still explain MCP usage for MCP-native clients

6. Plugin contract tests
- plugin actions can register into the same canonical action model
- plugin MCP exposure is generated from action metadata
- MCP-only plugin registration is rejected or clearly unsupported

## Boundaries

- Always:
  - keep one canonical business handler per action
  - preserve existing MCP compatibility for current clients
  - prefer native hooks, then CLI, then MCP
  - keep CLI behavior deterministic and scriptable
  - keep filtering explainable and observable

- Ask first:
  - renaming existing public grouped CLI commands
  - removing legacy docs that external users may still rely on
  - changing plugin manifest formats in a breaking way
  - changing agent-definition semantics outside tool exposure/execution

- Never:
  - remove MCP entirely
  - duplicate domain logic separately for CLI, MCP, and hooks
  - expose the full MCP catalog by default when the runtime only needs a subset
  - make skills depend on MCP names when a hook or CLI contract exists
  - silently break current MCP-based workflows

## Architecture

### 1. Canonical Action Registry

Evolve `packages/cli/src/tool-registry.ts` into the canonical action registry. The registry stops being “the list of MCP tools” and becomes “the source of truth for all platform actions.”

The registry must own:
- canonical action name
- business handler
- CLI mapping
- MCP mapping
- hook metadata
- capability metadata
- availability rules
- fallback order
- observability/tracing metadata

### 2. Execution Order

The default execution preference is:

```text
native hook -> CLI action executor -> MCP compatibility layer
```

Rules:
- if a runtime has full hook coverage for an action, do not rely on MCP for that path
- if no hook exists, internal automation should call the CLI action contract by default
- MCP remains available for MCP-native clients, partial-coverage runtimes, or explicitly enabled compatibility mode

### 3. MCP Exposure Planner

Replace coarse filtering with a rule-driven exposure planner.

Each action’s MCP availability is computed from:
- hook coverage
- platform
- agent type
- runtime capabilities
- policy/config
- explicit compatibility enablement

The planner should support:
- full exposure mode
- filtered mode
- minimal mode

The output is the smallest MCP catalog necessary for the current runtime to fill missing capabilities.

### 4. CLI-Oriented Hook Substitution

When native hooks are missing but shell execution is available, a CLI-oriented agent should satisfy missing capabilities through CLI-backed adapters before falling back to MCP.

Examples:
- context bootstrap via CLI instead of `get_current_context` MCP when feasible
- memory recall via CLI or hook snapshot before MCP
- run lifecycle commands via CLI by default

### 5. Plugin Support

Plugins should register actions against the same contract.

For this repo, plugin action-contract compliance is the target architecture now, not a later cleanup:
- built-ins fully adopt the canonical action model
- plugins register action-native definitions immediately
- MCP exposure for plugins is derived from action metadata, not authored separately as the primary contract
- MCP-only plugin registration should not remain as a documented or supported steady-state path

## Migration Plan

### Phase 1: Canonicalize the Registry

- rename the internal conceptual model from tool registry to action registry
- add canonical action metadata without breaking current MCP or CLI behavior
- keep existing handlers intact, but reframe mappings as adapters

### Phase 2: Standardize CLI Execution

- formalize `fulcrum action exec` as the generic action path
- retain `fulcrum tool exec` as a compatibility alias
- align grouped CLI commands and generic execution on the same action handler path
- standardize input/output/error contracts and exit codes

### Phase 3: Introduce MCP Exposure Planning

- replace the current coarse `--profile` logic with rule-based exposure planning
- support filtering by hook coverage, platform, agent type, runtime capabilities, and config/policy
- provide explainable traces for why an MCP action is exposed or hidden

### Phase 4: Migrate Content Surfaces

- update skills to call CLI commands or hook-backed actions by default
- update role docs and agent definitions away from MCP-first naming
- update installer-generated guidance and compatibility docs
- stop emitting `mcp__fulcrum__*` as the preferred next action in readiness helpers

### Phase 5: Plugin Enforcement

- enforce action-native plugin registration
- remove or avoid documenting MCP-only plugin authoring paths
- document deprecation of MCP-first internal references, not MCP itself

## Performance, Token Usage, and Reliability Considerations

Expected improvements:
- smaller MCP catalogs in prompt/context
- fewer wrong tool calls because the agent sees only the relevant surface
- lower latency when hook or CLI execution avoids MCP round-trips
- better cross-platform consistency because CLI behavior is deterministic and scriptable

Reliability requirements:
- filtering must never hide a required capability without a fallback
- compatibility mode must remain available when rollout issues arise
- action routing decisions should be traceable in logs or events

## Risks and Edge Cases

1. Alias drift between canonical action names, grouped CLI commands, and legacy MCP names
2. Partial migration where docs or skills still teach MCP-first behavior
3. Plugin implementations lagging the enforced action contract
4. Over-filtering that removes required MCP tools for a runtime that cannot execute CLI or hooks
5. Runtime prompts or readiness helpers continuing to suggest MCP names after the architecture changes

Mitigations:
- registry validation tests
- docs/skill linting for MCP-first references where CLI-native paths exist
- explicit compatibility modes
- exposure planner tests across representative runtime matrices

## Success Criteria

- every built-in MCP-exposed action has a canonical action definition and stable CLI mapping
- skills, hooks, and generated runtime guidance prefer hooks or CLI over MCP where available
- MCP remains fully usable for existing MCP clients
- MCP exposure can be filtered by hook coverage, platform, agent type, runtime capabilities, and policy/config
- the system can expose only the missing MCP capabilities needed by a specific agent/runtime
- plugin action registration is required for plugin capabilities in this repo
- token usage and tool-catalog size are measurably reduced for filtered runtimes

## Open Questions

1. Should `fulcrum action ...` become the documented generic interface immediately, or should `fulcrum tool ...` remain the only generic surface for one release and `action` ship as an alias first?
2. Should agent-definition files continue to list concrete MCP tool aliases for compatibility, or should they move to canonical action names plus exposure-policy metadata in the same pass?
3. How much of `agent-integration/claude/CLAUDE.md` is generated versus hand-maintained today, and should this migration include generation changes immediately?
