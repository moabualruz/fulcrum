# 01-01 Summary: Remove inline stub routers from AppRouter

## Status: DONE

## What was done

Removed ~200 lines of inline stub infrastructure from `src/trpc/router.ts`:

1. **Extracted stub helpers** to `src/trpc/routers/stub-helpers.ts`:
   - `EmptyInputSchema`, `IdInputSchema`, `OptionalRecordInputSchema`, `StubRowSchema`, `StubOperationOutputSchema`
   - `op()`, `listProcedure()`, `getProcedure()`, `mutationProcedure()`, `idMutationProcedure()`, `crudProcedures()`, `crudRouter()`

2. **Moved inline stub routers** to individual files under `src/trpc/routers/`:
   - `projects.ts`, `custom-fields.ts`, `saved-views.ts`, `doc-versions.ts`, `doc-comments.ts`, `doc-links.ts`
   - `context.ts`, `agent-runs.ts`, `agents.ts`, `repo-branches.ts`, `repo-commits.ts`
   - `connectors.ts`, `doctor.ts`, `invitations.ts`

3. **Merged searchRouter**: Combined inline saved-search procedures with `routers/search.ts` (recordClick). Removed stub duplication.

4. **Removed 4 duplicate mount aliases**:
   - `skills` (canonical: `fulcrum_skills`)
   - `memory` (canonical: `memories`)
   - `runs` (canonical: `agent_runs`)
   - `notifications` (canonical: `notify`)

5. **Updated consumers** of removed aliases:
   - `src/cli/commands/skills.ts` — `skills` → `fulcrum_skills`
   - `src/server/trpc/routers/__tests__/skills.test.ts` — same
   - `tests/trpc/memory.test.ts` — `memory` → `memories`
   - `tests/trpc/router.test.ts` — same
   - `tests/trpc/stubs.test.ts` — `memory` → `memories`, `runs` → `agent_runs`, `notifications` → `notify`
   - `tests/parity/p13-three-surfaces.test.ts` — `runs` → `agent_runs`
   - `tests/parity/p14-cli-parity-gate.test.ts` — same

## Verification

- `bun run lint` (tsc --noEmit): PASS — zero errors
- `bun test tests/trpc/app-router-scaffold.test.ts`: 7/7 pass
- `bun test tests/trpc/stubs.test.ts`: 21/21 pass
- `bun test tests/trpc/router.test.ts`: 21/21 pass
- AppRouter type export unchanged

## Result

`src/trpc/router.ts` reduced from 384 lines to 113 lines (declarative mounts only).
No inline stub helpers. No duplicate aliases. tRPC inference intact.
