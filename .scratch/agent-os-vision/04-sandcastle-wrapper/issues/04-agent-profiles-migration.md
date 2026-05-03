---
Status: implemented
Owner: claude-orchestrator
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 03-artifacts-edges-migration
ImplCommit: c6e6bbd1
ImplRuntime: codex
---

# agent_profiles table migration + test-result persistence

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Create the `AgentProfile` entity (`src/db/entities/sandbox/AgentProfile.ts`) and generate a MikroORM v7 migration class via `mikro-orm migration:create`. The entity persists the registry of agent profiles including their test state (`lastTestedAt`, `testPassed`). Unique index `(org_id, name)` prevents duplicate profiles per org. After migration, wire the `agents.testProfile` tRPC mutation to write `lastTestedAt` + `testPassed` back to DB via `agentProfileRepo.assign(profile, { lastTestedAt: new Date(), testPassed }) + em.flush()`.

## Acceptance criteria

- [ ] Adapter / profile: `AgentProfile` entity created with all PRD properties: `id`, `org`, `name`, `cliPath`, `skillFolder`, `defaultFlags string[]`, `authEnvVars string[]`, `maxIterations`, `defaultTimeout`, `lastTestedAt`, `testPassed`, `createdAt`, `updatedAt`.
- [ ] Adapter / profile: UNIQUE index `agent_profiles_org_name ON agent_profiles (org_id, name)`.
- [ ] Lifecycle integration: `agents.testProfile` tRPC mutation — after `--version` check, writes `lastTestedAt = new Date()` and `testPassed = true/false` via `agentProfileRepo.assign(profile, {...}); em.flush()`.
- [ ] Surfaces parity: no new UI in this slice; entity + mutation only.
- [ ] Tests: migration class applied in test DB; integration test calls `testProfile` mutation → asserts `lastTestedAt` set on repository read-back; covers `testPassed=true` and `testPassed=false`.

## Blocked by

03-artifacts-edges-migration

## Notes

`agents.upsertProfile` mutation (seeding the six built-in profiles on first install) can be wired in this slice or deferred to the profile slices (05/06/07). Prefer wiring the upsert here so profile slices can just provide data, not schema plumbing.
