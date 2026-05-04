---
Status: ready-for-agent
Phase: P4
Priority: medium
Test-file: tests/tui/skills-doctor.test.ts
Framework: bun-test
Blocked-by: []
---

# TUI: Skills Browser + Doctor Screen

## TDD Protocol

1. Write the test file FIRST with all assertions. Tests MUST fail (RED).
2. Commit the failing tests: `test(tui): RED — skills doctor screens`
3. Do NOT write implementation code — the test targets existing code.
4. If the test passes immediately → that gap is already covered → mark issue completed.
5. If the test fails → the failure IS the finding. Document what broke.
6. Fix the code to make tests GREEN.
7. Commit the fix: `fix(tui): GREEN — skills doctor screens`

## What to test

- `src/tui/screens/skills.ts` — `SkillsScreen` (table + conflict panel)
- `src/tui/screens/doctor.ts` — `renderDoctorScreen` (pure function presenter)

## Setup

```ts
const mockSkills = [
  { slug: "biome", version: "1.0.0", source: "upstream", hashVerified: true, enabledAgents: ["claude"], upstreamConflict: null },
  { slug: "custom-tool", version: "2.1.0", source: "local", hashVerified: false, enabledAgents: [], upstreamConflict: "diff content here" },
];
const mockDoctorChecks = [
  { name: "db-connection", status: "ok" as const, message: "Connected" },
  { name: "pglite-version", status: "warn" as const, message: "Outdated schema" },
  { name: "inference-sidecar", status: "fail" as const, message: "Not running" },
];
```

## SkillsScreen steps

1. Load + render — both skills visible with slug/version/source/hashVerified columns
2. `upstreamConflict` present → conflict indicator (e.g. `!`) in row; conflict panel visible below table
3. `j`/`k` — cursor moves; selecting conflicted row shows conflict diff in panel
4. `s` key — `skills.sync({ fetchUpstream: true })` called; merged count shown
5. `u` key — `skills.upgrade({ slug })` called on selected row
6. `D` key — confirm overlay opens; confirm → `skills.uninstall({ slug })` called
7. `k` key — `skills.resolve({ slug, strategy: "keep-local" })` called
8. `U` key — `skills.resolve({ slug, strategy: "use-upstream" })` called
9. `m` key — `skills.resolve({ slug, strategy: "editor" })` called (or editor launched)
10. No conflict row: `k`/`U`/`m` keys do nothing or show "no conflict" message

## Doctor screen steps (pure function)

1. `renderDoctorScreen(mockDoctorChecks)` — string output contains all 3 check names
2. OK check → green " OK  " badge in output
3. WARN check → yellow "WARN " badge
4. FAIL check → red " FAIL" badge
5. Message text visible for each check
6. Empty checks array → renders without crash; "no checks" or empty header

## Assertions

- [ ] SkillsScreen renders slug/version/source/hashVerified for each skill
- [ ] Conflict indicator visible; conflict panel shows diff for conflicted row
- [ ] sync/upgrade/uninstall/resolve all call correct callers with correct args
- [ ] renderDoctorScreen: all 3 status badges render with correct text
- [ ] renderDoctorScreen: handles empty array without crash
