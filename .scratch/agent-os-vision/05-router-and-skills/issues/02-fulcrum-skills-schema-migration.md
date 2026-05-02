---
Status: completed
Triage: AFK
Owner: codex-orchestrator
Pillar: 05-router-and-skills
Blocked-by: None
ReviewDebtResolved: 2026-05-02T09:59:24Z — Claude adversarial review review-moo61qcn-s8r5vi SPEC PASS / no blocking findings.
---

# FulcrumSkill entity + migration class + skills.lock.json design

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Write and test `FulcrumSkill` and `SkillVersion` as MikroORM v7 `@Entity` classes plus generated migration class `Migration<timestamp>`. `FulcrumSkill` owns table name `fulcrum_skills`, enum validation for `source` (`upstream|local|package`), and `@Unique({ name: 'fulcrum_skills_org_slug', properties: ['org', 'slug'] })`. Define the `skills.lock.json` schema (TypeScript type + Zod validator) that lives at `~/.fulcrum/skills.lock.json` and tracks installed skills, their hashes, and any `upstream_conflict` diffs.

## Acceptance criteria

- [ ] Schema / module: generated `Migration<timestamp>` creates/updates `fulcrum_skills` idempotently from entity metadata.
- [ ] Schema / module: `SkillSource` enum rejects values outside `upstream|local|package`.
- [ ] Schema / module: `UNIQUE(org_id, slug)` enforced at DB level — duplicate slug insert throws
- [ ] Schema / module: `fulcrum_skills_org_slug` unique decorator present in MikroORM metadata.
- [ ] Schema / module: `FulcrumSkillRepository` exported from `src/db/repositories/skills/FulcrumSkillRepository.ts`.
- [ ] Schema / module: `SkillsLockFile` Zod type exported from `src/skills/lock.ts`; shape: `{ [slug]: { version, hash, installedAt, upstream_conflict?: string, enabled_agents: string[] } }`
- [ ] Logic: `skills.lock.json` round-trips (write → read → same object) via helper functions in `src/skills/lock.ts`
- [ ] Tests: unique constraint violation test
- [ ] Tests: lock file parse test (valid + invalid)
- [ ] Tests: migration class idempotency test

## Blocked by

None — can start immediately

## Notes

`enabled_agents` in the lock file mirrors `fulcrum_skills.enabled_agents jsonb`. Keep them in sync on every install/upgrade/uninstall operation. The lock file is human-readable; pretty-print with 2-space indent.
