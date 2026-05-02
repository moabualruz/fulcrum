---
Status: ready-for-agent
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 04-agent-profiles-migration
---

# AgentProfile type + registry with UnknownAgentError

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Define the `AgentProfile` TypeScript type and the profile registry in `src/agents/`. The registry loads all profiles at startup, validates each against a Zod schema, and exposes `getProfile(name)` which throws `UnknownAgentError` for unknown names. This is the shared contract that both `sandbox-runner.ts` and the CLI `agents` commands depend on.

## Acceptance criteria

- [ ] Adapter / profile: `src/agents/types.ts` exports `AgentProfile` type with fields: `name`, `cliPath`, `defaultFlags`, `skillFolder`, `authEnvVars`, `sandcastleProvider`, `maxIterations`, `defaultTimeout`; Zod schema in same file or sibling `schema.ts`.
- [ ] Adapter / profile: `src/agents/registry.ts` exports `getProfile(name: string): AgentProfile` (throws `UnknownAgentError`) and `listProfiles(): AgentProfile[]`; validates all registered profiles against Zod schema at startup (throws if invalid).
- [ ] Lifecycle integration: `UnknownAgentError` class exported from `src/agents/registry.ts`; message includes the unknown name and a list of known names.
- [ ] Surfaces parity: tRPC procedures `agents.listProfiles` and `agents.getProfile` created (stubs OK if profiles not yet loaded — returns empty list until profile files exist).
- [ ] Tests: unit test — `getProfile('nonexistent')` throws `UnknownAgentError`; `getProfile` with valid name returns profile; registry startup validation rejects a profile missing a required field.

## Blocked by

04-agent-profiles-migration

## Notes

`sandcastleProvider` on the in-memory type is the string key (`'noSandbox' | 'docker' | 'podman' | 'vercel' | 'daytona' | 'modal' | 'e2b'`); the actual Sandcastle provider object is resolved at runtime by `sandbox-runner.ts`. This keeps profile definitions free of Sandcastle imports.
