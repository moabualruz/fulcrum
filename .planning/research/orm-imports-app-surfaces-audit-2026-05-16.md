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

## Verification Command
```bash
rg -l "from.*(typeorm|@mikro-orm|kysely)" apps/web/src/ apps/cli/src/ apps/tui/src/ --type ts --type svelte --glob '!*.test.ts' --glob '!*.spec.ts'
```
