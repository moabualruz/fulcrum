# 01-09 Summary: Module Boundaries — Fix Layering Violations

**Status:** DONE  
**Addresses:** ARCH-05, ARCH-06

## What Changed

### 1. Created Service Layer (`src/services/`)
Moved business logic out of web layer into canonical service modules:
- `src/services/tasks.ts` — task CRUD (createTaskAction, updateTaskAction, deleteTaskAction, moveTaskStatusAction)
- `src/services/runs.ts` — agent run dispatch/cancel/retry
- `src/services/artifacts.ts` — artifact list/detail/delete/stats
- `src/services/index.ts` — barrel re-export

### 2. Fixed Layering Violations (3 files)
| File | Old import | New import |
|------|-----------|------------|
| `src/product-kernel/api/router.ts` | `../../web/src/lib/server/tasks.ts` | `../../services/tasks.ts` |
| `src/cli/agent.ts` | `../web/src/lib/server/runs.ts` | `../services/runs.ts` |
| `src/cli/artifact.ts` | `../web/src/lib/server/artifacts.ts` | `../services/artifacts.ts` |
| `scripts/seed-web-shell.ts` | `../src/web/src/lib/server/tasks.ts` | `../src/services/tasks.ts` |

### 3. Web Layer → Re-export Shims
Web files now re-export from services, preserving `$lib/server/` alias for SvelteKit consumers:
- `src/web/src/lib/server/tasks.ts` → re-exports from `../../../../services/tasks.ts`
- `src/web/src/lib/server/runs.ts` → re-exports from `../../../../services/runs.ts`
- `src/web/src/lib/server/artifacts.ts` → re-exports from `../../../../services/artifacts.ts`

### 4. Module Boundary Lint
- `scripts/check-module-boundaries.ts` — enforces no web/ imports from product-kernel/, cli/, services/
- Added `lint:boundaries` script to package.json

## Dependency Direction (enforced)
```
web → services → product-kernel
cli → services → product-kernel
```

## Remaining (out of scope)
- `src/product-kernel/search.test.ts` imports `scoreCommand` from web layer (test utility — not a production violation, but flagged by boundary checker)

## Commits
1. `feat(services): create service layer with barrel exports (ARCH-05)`
2. `fix(arch): eliminate web-layer import violations (ARCH-05, ARCH-06)`
3. `feat(lint): add module boundary enforcement script (ARCH-06)`
