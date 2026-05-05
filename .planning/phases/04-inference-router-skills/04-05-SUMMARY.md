---
phase: 04-inference-router-skills
plan: 05
subsystem: skills
tags: [mcp, skills, registry, lock, sha256, conflict, tdd]

requires:
  - phase: 04-01
    provides: MCP descriptor/tool manifest hash patterns, lock enforcement types
  - phase: 04-03
    provides: inference lifecycle and backend health patterns

provides:
  - McpVirtualSkill entity and mcp_virtual_skills table
  - buildMcpVirtualSkillDescriptors() reading built-in MCP catalog
  - SkillRegistryService merging local/upstream source values
  - SkillConflict entity and skill_conflicts table
  - verifySkillLock() with per-skill ok/sha_mismatch/missing states
  - Upstream sync creates SkillConflict records instead of inline diffs
  - Loader uses verifySkillLock for actionable hash mismatch errors

affects: [04-06, 04-07, 04-08]

tech-stack:
  added: []
  patterns:
    - TDD: test → feat commits with inline imports from production modules
    - Entity barrel exports for new skill-conflict/mcp-virtual entities
    - Lock enforcement uses LockVerificationResult with exact SHA values
    - Conflict artifacts stored as DB entity records (not inline files)

key-files:
  created:
    - src/db/entities/skills/McpVirtualSkill.ts
    - src/db/entities/skills/SkillConflict.ts
    - src/skills/mcp-virtual-skills.ts
    - src/skills/registry-service.ts
    - src/db/migrations/Migration20260505042000_skill_supply_chain.ts
  modified:
    - src/db/entities/skills/index.ts
    - src/skills/lock.ts
    - src/skills/upstream-sync.ts
    - src/skills/loader.ts
    - src/skills/mcp-virtual-skills.test.ts
    - src/skills/lock-enforcement.test.ts

key-decisions:
  - "sha256Hex moved to shared mcp-virtual-skills.ts, imported by lock.ts to avoid duplication"
  - "SkillConflict entity stores structured records with kind/status enums, not inline diff files"
  - "verifySkillLock() returns per-skill state rather than throwing — callers decide how to handle mismatches"
  - "upstream_conflict enum string kept in lock.ts schema for backward compat with existing lock files"

requirements-completed: [RTR-04, RTR-05, RTR-07]

duration: 5 min
completed: 2026-05-05
---

# Phase 04 Plan 05: Skill Registry Supply-Chain Safety Summary

**MCP virtual skill descriptors with source=mcp, invokableByFulcrum=false, SHA-256 hashes; lock fail-closed with per-skill ok/sha_mismatch/missing states; structured SkillConflict entity records replacing inline conflict diff files.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-05T03:58:11Z
- **Completed:** 2026-05-05T04:03:31Z
- **Tasks:** 2 (both TDD: 4 commits)
- **Files modified:** 11

## Accomplishments

- Created `McpVirtualSkill` entity/table with source=mcp, invokableByFulcrum=false, SHA-256 descriptor and tool manifest hashes per D-17, D-18, D-19, D-20
- Implemented `buildMcpVirtualSkillDescriptors()` reading canonical BUILTIN_MCPS list
- Created `SkillRegistryService.list()` returning merged `local | upstream | mcp` source values with no per-agent support fields per D-20
- Created `SkillConflict` entity/table with kind (`upstream_conflict | sha_mismatch`) and status (`open | overridden | resolved`) enums, audit fields, and base/local/upstream hashes per D-22, D-23
- Added `verifySkillLock()` returning per-skill `LockVerificationResult` with exact expected/actual SHA values — fail-closed per D-21
- Updated upstream sync to create `SkillConflict` records instead of inline unified diffs per D-23
- Updated loader to use `verifySkillLock` for actionable hash mismatch errors
- Migration `Migration20260505042000_skill_supply_chain` creates both tables with check constraints

## Task Commits

Each task was committed atomically via TDD RED/GREEN cycle:

1. **Task 1 RED: MCP virtual skill descriptor tests** - `c08027cb` (test)
2. **Task 1 GREEN: MCP virtual skill descriptors + registry** - `b85532f6` (feat)
3. **Task 2 RED: Lock enforcement tests** - `f875b505` (test)
4. **Task 2 GREEN: Lock fail-closed + structured conflicts** - `6022c516` (feat)

## Files Created/Modified

- `src/db/entities/skills/McpVirtualSkill.ts` - MCP virtual skill entity with source=mcp, invokableByFulcrum=false, descriptor SHA-256, tool manifest hash
- `src/db/entities/skills/SkillConflict.ts` - Structured conflict entity with kind/status enums, audit fields
- `src/db/entities/skills/index.ts` - Added McpVirtualSkill and SkillConflict exports
- `src/db/migrations/Migration20260505042000_skill_supply_chain.ts` - Creates mcp_virtual_skills and skill_conflicts tables
- `src/skills/mcp-virtual-skills.ts` - MCP virtual skill descriptor mapping with buildMcpVirtualSkillDescriptors()
- `src/skills/mcp-virtual-skills.test.ts` - Updated to import from production module
- `src/skills/registry-service.ts` - SkillRegistryService with list() returning merged source values
- `src/skills/lock.ts` - Added verifySkillLock() and LockVerificationResult type
- `src/skills/lock-enforcement.test.ts` - Updated to import from production module
- `src/skills/upstream-sync.ts` - Creates SkillConflict records instead of inline diffs
- `src/skills/loader.ts` - Uses verifySkillLock for actionable hash mismatch errors

## Decisions Made

- `sha256Hex` lives in `mcp-virtual-skills.ts` and is imported by `lock.ts` to avoid code duplication (both modules need same deterministic hash)
- `SkillConflict` entity is the single source of truth for conflict records; old `upstream_conflict` field in lock schema kept for backward compatibility with existing lock files
- `verifySkillLock()` returns state objects rather than throwing — the caller decides whether and how to handle mismatches, enabling both fail-closed and override flows

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- RTR-04 (upstream sync diffs/auto-merge), RTR-05 (MCP virtual skills), and RTR-07 (lock fail-closed) are complete
- Ready for plan 06 which wires remaining router/skills requirements
- McpVirtualSkill entity registered but not yet populated from live MCP connections — actual tool manifest harvesting requires `@modelcontextprotocol/sdk` in a follow-up

---

*Phase: 04-inference-router-skills*
*Completed: 2026-05-05*
