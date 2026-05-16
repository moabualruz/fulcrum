# ORM Imports Audit — App Surfaces (web/CLI/TUI)

**Date:** 2026-05-16
**Auditor:** Automated scan
**Scope:** Production files in apps/web/src/, apps/cli/src/, apps/tui/src/

## Results

### apps/web/src/ (production, excluding tests)
```
rg -l "from.*typeorm" apps/web/src/ --type ts --type svelte --glob '!*.test.ts' --glob '!*.spec.ts'
→ 0 matches
```

### apps/cli/src/ (production, excluding tests)
```
rg -l "from.*typeorm" apps/cli/src/ --type ts --glob '!*.test.ts'
→ 0 matches
```

### apps/tui/src/ (production, excluding tests)
```
rg -l "from.*typeorm" apps/tui/src/ --type ts --glob '!*.test.ts'
→ 0 matches
```

### MikroORM imports (all app surfaces)
```
rg -l "@mikro-orm" apps/web/src/ apps/cli/src/ apps/tui/src/ --type ts --glob '!*.test.ts'
→ 0 matches
```

### Kysely imports (all app surfaces)
```
rg -l "kysely" apps/web/src/ apps/cli/src/ apps/tui/src/ --type ts --glob '!*.test.ts'
→ 0 matches
```

## Fixed Items (this session)
- None needed — all app surfaces were already clean of direct ORM imports.

## Remaining Items
- None — zero direct ORM imports in any app surface production code.

## Deeper Boundary Audit (2026-05-16 re-verification)

### Direct entity/infrastructure imports
```
rg 'from.*infrastructure/database/entities' apps/web/src/ apps/cli/src/ apps/tui/src/ --type ts --glob '!*.test.*'
→ 0 matches
```

### Application-layer imports (acceptable per DDD)
Web imports `@platform-core/application/runtime/`, `@platform-core/application/orm-helpers.ts`, `@platform-core/application/legacy/orm-web-adapter.ts` — these are application-layer re-exports, not direct DB access.
CLI imports `@platform-core/application/runtime/`, `@platform-core/application/db/`, `@platform-core/application/runtime-support/` — application-layer.
TUI imports application-layer callers only.

### Legacy orm-helpers.ts (apps/web/src/lib/server/)
Re-exports `sqlAccess`, `appendEventOrm`, `enqueueJobOrm`, `indexSearchDocumentOrm` from platform-core application layer. Not direct entity/DB access. Migration debt: should eventually route through service interfaces.

## Verification Commands
```bash
# Zero ORM framework imports
rg -l "from.*(typeorm|@mikro-orm|kysely)" apps/web/src/ apps/cli/src/ apps/tui/src/ --type ts --glob '!*.test.*'
# Zero direct entity imports
rg 'from.*infrastructure/database/entities' apps/web/src/ apps/cli/src/ apps/tui/src/ --type ts --glob '!*.test.*'
```
