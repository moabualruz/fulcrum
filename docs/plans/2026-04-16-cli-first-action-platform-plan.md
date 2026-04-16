# Implementation Plan: CLI-First Action Platform

## Overview
Migrate Fulcrum from an MCP-shaped internal contract to a canonical action model with hook-first, CLI-second, MCP-third execution. Keep MCP available as a compatibility transport, but stop treating MCP tool names as the primary developer and runtime interface. Enforce the same action contract for built-ins and plugins.

## Architecture Decisions
- Evolve `packages/cli/src/tool-registry.ts` into the canonical action registry instead of introducing a second registry.
- Add a generic `fulcrum action ...` surface while retaining `fulcrum tool ...` as a compatibility alias.
- Replace coarse MCP `--profile` filtering with rule-based exposure planning derived from canonical action metadata.
- Require plugin capabilities to register as actions; MCP exposure for plugins is derived from action metadata.
- Migrate runtime guidance surfaces away from `mcp__fulcrum__*` defaults wherever a hook or CLI action exists.

## Task List

### Phase 1: Canonical Action Registry

- [x] Task 1: Define canonical action metadata types and registry helpers
  - Acceptance: `packages/cli/src/tool-registry.ts` (or a new adjacent module imported by it) defines an action-native contract that includes canonical action name, CLI mapping, MCP mapping, hook coverage, availability rules, fallback order, and observability metadata.
  - Verify: `pnpm --filter @moabualruz/fulcrum-cli vitest run src/tests/tool-registry.test.ts`
  - Files: `packages/cli/src/tool-registry.ts`, `packages/cli/src/tests/tool-registry.test.ts`

- [x] Task 2: Add registry-level compatibility aliases for legacy MCP-oriented names where needed
  - Acceptance: existing tool handlers still resolve correctly, while the registry can address actions canonically and expose legacy tool aliases without duplicating business logic.
  - Verify: `pnpm --filter @moabualruz/fulcrum-cli vitest run src/tests/tool-registry.test.ts src/tests/mcp-server.test.ts`
  - Files: `packages/cli/src/tool-registry.ts`, `packages/cli/src/mcp-tools.ts`, `packages/cli/src/tests/mcp-server.test.ts`

### Checkpoint: Registry Foundation

- [x] Canonical action metadata exists for all built-in actions
- [x] Existing MCP handler behavior still passes current registry/MCP tests

### Phase 2: CLI Action Surface

- [x] Task 3: Implement `fulcrum action list` and `fulcrum action exec`
  - Acceptance: a generic action CLI exists, uses the canonical registry, emits deterministic JSON/text output, and supports standardized exit codes.
  - Verify: `pnpm --filter @moabualruz/fulcrum-cli vitest run src/tests/cli-coverage.test.ts`
  - Files: `packages/cli/src/index.ts`, `packages/cli/src/tests/cli-coverage.test.ts`

- [x] Task 4: Make `fulcrum tool list/exec` a compatibility alias over the same action executor
  - Acceptance: `fulcrum tool exec <name>` and `fulcrum action exec <canonical-name>` hit the same handler path and output contract.
  - Verify: `pnpm --filter @moabualruz/fulcrum-cli vitest run src/tests/cli-coverage.test.ts src/tests/tool-registry.test.ts`
  - Files: `packages/cli/src/index.ts`, `packages/cli/src/tool-registry.ts`, `docs/guides/cli-reference.md`

- [x] Task 5: Update readiness/helper responses to return CLI-first next actions
  - Acceptance: `get_current_context` and related helper surfaces stop suggesting `mcp__fulcrum__*` names and instead return canonical or CLI-first next actions.
  - Verify: `pnpm --filter @moabualruz/fulcrum-cli vitest run src/tests/serve-mcp-monitor.test.ts src/tests/mcp-server.test.ts`
  - Files: `packages/cli/src/tool-registry.ts`, `packages/cli/src/index.ts`, `packages/cli/src/tests/serve-mcp-monitor.test.ts`, `packages/cli/src/tests/mcp-server.test.ts`

### Checkpoint: CLI Path

- [x] `fulcrum action exec` works for built-ins
- [x] `fulcrum tool exec` remains functional as an alias
- [x] Readiness output no longer teaches MCP-first next actions

### Phase 3: MCP Exposure Planner

- [x] Task 6: Replace `buildProfileFilter` with rule-driven MCP exposure planning
  - Acceptance: MCP exposure can be filtered by hook coverage, platform, agent type, runtime capabilities, and policy/config rather than only `hook-only` or role profile.
  - Verify: `pnpm --filter @moabualruz/fulcrum-cli vitest run src/tests/mcp-server.test.ts`
  - Files: `packages/cli/src/tool-registry.ts`, `packages/cli/src/mcp-server.ts`, `packages/cli/src/tests/mcp-server.test.ts`

- [x] Task 7: Add explainability for exposure decisions
  - Acceptance: the exposure planner or CLI can report why an action is exposed or hidden for a runtime/agent combination.
  - Verify: `pnpm --filter @moabualruz/fulcrum-cli vitest run src/tests/mcp-server.test.ts`
  - Files: `packages/cli/src/tool-registry.ts`, `packages/cli/src/index.ts`, `packages/cli/src/tests/mcp-server.test.ts`

- [x] Task 8: Route plugin MCP exposure through the same planner
  - Acceptance: plugin-provided actions participate in the same filtering and metadata rules as built-ins.
  - Verify: `pnpm --filter @moabualruz/fulcrum-cli vitest run src/tests/plugin-mcp-tools.test.ts src/tests/mcp-server.test.ts`
  - Files: `packages/cli/src/plugin-discovery.ts`, `packages/cli/src/mcp-server.ts`, `packages/cli/src/tests/plugin-mcp-tools.test.ts`

### Checkpoint: Minimal MCP Surface

- [x] Runtime-specific filtering works for built-ins and plugins
- [x] MCP can still expose the full catalog when explicitly requested

### Phase 4: Plugin Contract Enforcement

- [x] Task 9: Replace plugin `tools` registration with action-native registration
  - Acceptance: plugin manifests support canonical action definitions instead of MCP-schema-only `tools`, and the registration pipeline rejects or clearly flags MCP-only plugin registration.
  - Verify: `pnpm --filter @moabualruz/fulcrum-cli vitest run src/tests/plugin-mcp-tools.test.ts`
  - Files: `packages/cli/src/plugin-discovery.ts`, `packages/cli/src/tests/plugin-mcp-tools.test.ts`

- [x] Task 10: Ensure plugin-generated MCP schemas derive from action metadata
  - Acceptance: plugin MCP exposure is produced from action metadata and does not require a separate MCP-first authoring path.
  - Verify: `pnpm --filter @moabualruz/fulcrum-cli vitest run src/tests/plugin-mcp-tools.test.ts src/tests/mcp-server.test.ts`
  - Files: `packages/cli/src/plugin-discovery.ts`, `packages/cli/src/mcp-tools.ts`, `packages/cli/src/mcp-server.ts`

### Phase 5: Skills, Agent Definitions, and Runtime Guidance

- [x] Task 11: Migrate Fulcrum skills from MCP-first references to CLI-first or hook-first guidance
  - Acceptance: `agent-integration/skills/` stop instructing agents to default to `mcp__fulcrum__*` when a hook or CLI action exists; `allowed-tools`/guidance reflect the new contract.
  - Verify: `rg -n \"mcp__fulcrum__\" agent-integration/skills`
  - Files: `agent-integration/skills/index.md`, `agent-integration/skills/**/*.md`

- [x] Task 12: Migrate agent definitions and role docs to canonical/CLI-first action references
  - Acceptance: `agent-integration/agent-defs/` and `agent-integration/roles/` no longer encode MCP-first tool lists as the primary contract.
  - Verify: `rg -n \"mcp__fulcrum__\" agent-integration/agent-defs agent-integration/roles`
  - Files: `agent-integration/agent-defs/*.json`, `agent-integration/roles/*.md`

- [x] Task 13: Update generated and installed runtime guidance
  - Acceptance: `agent-integration/claude/CLAUDE.md`, `packages/fulcrum-mcp/src/index.ts`, and installation/generation paths stop teaching MCP-first usage as the default internal path while preserving MCP compatibility instructions for MCP-native setups.
  - Verify: `rg -n \"mcp__fulcrum__|TOOL_SCHEMAS|serve mcp\" agent-integration/claude packages/fulcrum-mcp/src agent-integration/install.ts`
  - Files: `agent-integration/claude/CLAUDE.md`, `agent-integration/install.ts`, `packages/fulcrum-mcp/src/index.ts`

### Checkpoint: Content Surfaces

- [x] Skills no longer teach MCP-first execution by default
- [x] Agent definitions and role docs align with canonical actions
- [x] Generated runtime guidance matches the new contract

### Phase 6: Documentation and Final Verification

- [x] Task 14: Update CLI and MCP docs for the new action model
  - Acceptance: `docs/guides/cli-reference.md` and `docs/guides/mcp-tools.md` clearly describe canonical actions, CLI-first execution, selective MCP exposure, and plugin action requirements.
  - Verify: manual doc review plus `rg -n \"MCP-first|mcp__fulcrum__|fulcrum tool exec|fulcrum action exec\" docs/guides`
  - Files: `docs/guides/cli-reference.md`, `docs/guides/mcp-tools.md`

- [x] Task 15: Run focused and full verification
  - Acceptance: targeted CLI/MCP/plugin tests pass, and the repo test suite still passes or any unrelated failures are explicitly documented.
  - Verify: `pnpm --filter @moabualruz/fulcrum-cli test` and `pnpm test`
  - Files: no source changes required; captures end-state verification

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Action metadata and legacy tool names drift apart | High | Add registry-level parity tests and alias validation |
| MCP exposure planner hides a needed tool | High | Keep explicit full-exposure mode and planner explainability output |
| Content-surface migration is incomplete | Medium | Add grep-driven verification for `mcp__fulcrum__` references in agent-integration surfaces |
| Plugin contract change ripples through tests and docs | Medium | Land plugin registration changes after the built-in action registry is stable |
| Readiness/helper responses change more surfaces than expected | Medium | Update tests first and keep response shape additive where possible |

## Open Questions

- Should canonical action names remain `snake_case` to stay close to existing tool names, or should CLI-specific naming diverge more aggressively at the command layer?
- Should agent definition `tools_allow` move fully to canonical action names in the same PR series, or should there be a temporary alias resolution layer?
