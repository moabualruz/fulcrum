---
Status: ready-for-agent
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: None
---

# fulcrum_skills schema migration + skills.lock.json design

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Write and test the idempotent Drizzle migration that creates `fulcrum_skills` table with all columns, `UNIQUE(org_id, slug)` constraint, and `fulcrum_skills_org_slug` composite index. Define the `skills.lock.json` schema (TypeScript type + Zod validator) that lives at `~/.fulcrum/skills.lock.json` and tracks installed skills, their hashes, and any `upstream_conflict` diffs.

## Acceptance criteria

- [ ] Schema / module: migration creates `fulcrum_skills` idempotently
- [ ] Schema / module: `source` CHECK constraint rejects values outside `('upstream','local','package')`
- [ ] Schema / module: `UNIQUE(org_id, slug)` enforced at DB level — duplicate slug insert throws
- [ ] Schema / module: `fulcrum_skills_org_slug` composite index present in `pg_indexes`
- [ ] Schema / module: `FulcrumSkillRow` Drizzle schema + TS types exported from `src/db/schema.ts`
- [ ] Schema / module: `SkillsLockFile` Zod type exported from `src/skills/lock.ts`; shape: `{ [slug]: { version, hash, installedAt, upstream_conflict?: string, enabled_agents: string[] } }`
- [ ] Logic: `skills.lock.json` round-trips (write → read → same object) via helper functions in `src/skills/lock.ts`
- [ ] Tests: unique constraint violation test
- [ ] Tests: lock file parse test (valid + invalid)
- [ ] Tests: migration idempotency test

## Blocked by

None — can start immediately

## Notes

`enabled_agents` in the lock file mirrors `fulcrum_skills.enabled_agents jsonb`. Keep them in sync on every install/upgrade/uninstall operation. The lock file is human-readable; pretty-print with 2-space indent.
