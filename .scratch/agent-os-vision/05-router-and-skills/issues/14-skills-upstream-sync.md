---
Status: implemented
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 13-skills-loader-per-agent-install
Owner: codex-worker-p5-upstream-sync
---

# Skills upstream sync — fetch, auto-merge clean, conflict to lock file

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement `src/skills/upstream-sync.ts` for `fulcrum skills sync --fetch-upstream`. The flow: `git clone --depth 1 <upstream_repo>` into a temp dir, diff each skill's SKILL.md against the installed local copy. If clean (no local edits since last install): auto-merge (overwrite + update hash + update lock file). If locally edited (hash differs from what was recorded at install): write a `upstream_conflict` diff string to `skills.lock.json[slug].upstream_conflict`. Never auto-commit. Upstream unreachable → warn, preserve local, return partial results.

## Acceptance criteria

- [x] Schema / module: `src/skills/upstream-sync.ts` exports `syncUpstream(orgId: string, options: { fetchUpstream: boolean }): Promise<SyncResult>`
- [x] Schema / module: `SyncResult` type: `{ merged: string[]; conflicts: string[]; errors: string[]; }`
- [x] Logic: clean skill (hash matches recorded install hash) → auto-merged, `hash_verified` updated, lock file updated, no conflict key
- [x] Logic: locally-edited skill (hash differs) → `upstream_conflict` written to `skills.lock.json` as unified diff string; local files untouched
- [x] Logic: upstream repo unreachable → error logged, local skills preserved, slug added to `errors` array
- [x] Logic: sync never auto-commits to git — read/write files only
- [x] Logic: `skills.lock.json` valid JSON after all three paths (merge, conflict, error)
- [x] Tests: mock upstream repo (fixture dir) with updated skill → auto-merge verified in agent dirs + DB hash updated
- [x] Tests: locally-edited skill → conflict diff in lock file, local file unchanged
- [x] Tests: unreachable upstream → returns error in `SyncResult.errors`, local unchanged

## Blocked by

- `13-skills-loader-per-agent-install`

## Notes

Per Q6/Q19: local-only sync, no GitHub Actions or remote CI. `git clone --depth 1` is the fetch mechanism. Store `upstream_repo` and `upstream_ref` in `fulcrum_skills` so the sync knows where to pull from for each skill.

## EXECUTION-LOG

- 2026-05-02 codex-worker-p5-upstream-sync: RED `bun test tests/skills/upstream-sync.test.ts` failed on missing `src/skills/upstream-sync.ts` module (0 pass, 1 fail, 1 error).
- 2026-05-02 codex-worker-p5-upstream-sync: Implemented `syncUpstream` with depth-1 clone, clean auto-merge, lock conflict diff, unreachable-upstream partial errors, and no git commit path.
- 2026-05-02 codex-worker-p5-upstream-sync: GREEN `bun test tests/skills/loader.test.ts tests/skills/lock.test.ts tests/skills/upstream-sync.test.ts` passed (22 pass, 0 fail); `bun run lint` passed.
- 2026-05-02 codex-worker-p5-upstream-sync: Full `bun run ci` blocked by unrelated inference TUI failure: `tui.pullInferenceModel is not a function` in `src/server/trpc/routers/__tests__/inference.test.ts`.
