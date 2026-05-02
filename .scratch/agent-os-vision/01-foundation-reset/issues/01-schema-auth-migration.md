---
Status: integration-review
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: None
Owner: claude-orchestrator
CompletedAt: 2026-05-01T18:30:00Z
ReviewVerdict: APPROVED — Codex round-3 review (commit e8bedac) SPEC PASS / QUALITY APPROVED. All 6 splitter forms verified (single/double/dollar quotes + line/block comments); guard ordering correct; 5 regression tests; stale header comment fixed; "non-issue" claim removed. Path B (decorator-class entities via @mikro-orm/decorators/es) locked. Per .scratch/agent-os-vision/research/p1-01-pathB-round2-review.md.
---

# Auth migration class — User, Session, Invitation, OrgMember, FeatureFlag entities

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Define the five core auth entities under `src/db/entities/auth/` and auto-generate the corresponding `Migration<timestamp>` class (auth tables) at `src/db/migrations/` via `mikro-orm migration:create`. Covers the full vertical path from MikroORM v7 entity decorators through the snapshot-driven migrator to a verified table layout — no web or CLI surface yet, but the entity metadata + tables must be reachable by all later slices.

Cuts through: entity classes (`User`, `Session`, `Invitation`, `OrgMember`, `FeatureFlag` per PRD schema section) → `mikro-orm migration:create` emits `Migration<timestamp>.ts` → `MikroORM.getMigrator().up()` runs on PGlite (via `mikro-orm-pglite`) and Postgres (via `@mikro-orm/postgresql`) → seed file → entity metadata + round-trip tests.

## Acceptance criteria
- [ ] Entities: `src/db/entities/auth/User.ts`, `Session.ts`, `Invitation.ts`, `OrgMember.ts`, `FeatureFlag.ts` decorated with `@Entity`, `@PrimaryKey`, `@Property`, `@ManyToOne`, `@Enum` (for `role`), `@Index`, `@Unique` matching the PRD schema section. ES Stage-3 decorators (`@mikro-orm/decorators/es`).
- [ ] Migration class: `src/db/migrations/Migration<timestamp>_auth.ts` auto-generated from the entity diff. `migrator.up()` is idempotent on both PGlite and Postgres (second run is a no-op via `mikro_orm_migrations` ledger, not an error).
- [ ] Server action / migration runner: `bun run db:migrate` wraps `MikroORM.getMigrator().up()` and applies the auth migration class.
- [ ] Web surface: N/A — pure schema; later slices consume it.
- [ ] CLI command: N/A — pure schema.
- [ ] TUI screen: N/A — pure schema.
- [ ] Tests: `tests/db/entities/auth.test.ts` — assert `em.getMetadata().get(User).properties` contains every column with correct type, nullability, FK target; same for `Session`, `Invitation`, `OrgMember`, `FeatureFlag`. Round-trip: `em.create(User, {...}); await em.persistAndFlush(...); const found = await userRepo.findOne({ id });` succeeds for each entity. RED (entity absent / metadata mismatch) → GREEN (entity decorated + migration class applied).

## Blocked by
- None — can start immediately.

## Notes
Migration class must round-trip on both PGlite WASM dialect and standard Postgres. If `mikro-orm-pglite` driver fails the Gate-1 spike (Date round-trip, FK cascading, transaction rollback, schema-generator on PGlite WASM), per the C7 failure gate fall back to TypeORM (loses FTS until pgvector-FTS-on-Postgres maturity). Pin `mikro-orm-pglite` version in `package.json` at the same time. ES decorator flags must be duplicated in root `tsconfig.json` (Bun issue #6326 workaround for `extends`-chained tsconfigs per C8).
