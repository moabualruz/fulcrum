---
Status: ready-for-agent
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 14-skills-upstream-sync
---

# Skills conflict resolver — keep local / keep upstream / open editor

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement `src/skills/conflict-resolver.ts` for `fulcrum skills conflicts resolve <slug> --keep <local|upstream>`. `keep upstream` overwrites agent dirs with upstream content, recalculates `hash_verified`, clears `upstream_conflict` from lock file. `keep local` clears `upstream_conflict` from lock file without touching files (user chooses to ignore upstream). Also expose an `$EDITOR` path for TUI's `m` key that opens the SKILL.md for manual merge, then re-hashes.

## Acceptance criteria

- [ ] Schema / module: `src/skills/conflict-resolver.ts` exports `resolveConflict(slug: string, resolution: 'local' | 'upstream' | 'editor', orgId: string): Promise<FulcrumSkill>`
- [ ] Logic: `keep upstream` → all agent dirs overwritten with upstream content; `hash_verified` updated; `upstream_conflict` key removed from lock file
- [ ] Logic: `keep local` → `upstream_conflict` key removed from lock file; agent dir files untouched; `hash_verified` unchanged
- [ ] Logic: `editor` → spawns `$EDITOR` on the local SKILL.md; on exit recalculates hash; clears conflict
- [ ] Logic: `skills.lock.json` valid JSON after all three resolution paths
- [ ] Logic: resolving a slug that has no conflict → no-op (returns current skill row)
- [ ] Surfaces parity: `resolveConflict` called by CLI `conflicts resolve`, TUI `k`/`U` keys, and Web resolve buttons
- [ ] Tests: `keep upstream` clears conflict + updates hash
- [ ] Tests: `keep local` clears conflict without file change
- [ ] Tests: resolving non-existent conflict → no-op

## Blocked by

- `14-skills-upstream-sync`

## Notes

`editor` path is used only in TUI via `m` key (opens `$EDITOR`). Web surfaces use `keep local` or `keep upstream` buttons only. CLI exposes all three.
