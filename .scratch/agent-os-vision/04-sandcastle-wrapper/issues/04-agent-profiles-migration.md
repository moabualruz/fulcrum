---
Status: ready-for-agent
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 03-artifacts-edges-migration
---

# agent_profiles table migration + test-result persistence

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Write the Drizzle migration for the `agent_profiles` table. This table persists the registry of agent profiles including their test state (`last_tested_at`, `test_passed`). The unique index `(org_id, name)` prevents duplicate profiles per org. After migration, wire the `agents.testProfile` tRPC mutation to write `last_tested_at` + `test_passed` back to DB after running the profile test.

## Acceptance criteria

- [ ] Adapter / profile: `agent_profiles` table created with all PRD columns: `id`, `org_id`, `name`, `cli_path`, `skill_folder`, `default_flags TEXT[]`, `auth_env_vars TEXT[]`, `max_iterations`, `default_timeout`, `last_tested_at`, `test_passed`, `created_at`, `updated_at`.
- [ ] Adapter / profile: UNIQUE index `agent_profiles_org_name ON agent_profiles (org_id, name)`.
- [ ] Lifecycle integration: `agents.testProfile` tRPC mutation stub created (or extended if partial) — after running `--version` check, writes `last_tested_at = NOW()` and `test_passed = true/false` to the DB row.
- [ ] Surfaces parity: no new UI in this slice; DB + mutation only.
- [ ] Tests: migration schema-check test; integration test calls `testProfile` mutation → asserts `last_tested_at` is set on the DB row; test covers both `test_passed=true` and `test_passed=false` branches.

## Blocked by

03-artifacts-edges-migration

## Notes

`agents.upsertProfile` mutation (seeding the six built-in profiles on first install) can be wired in this slice or deferred to the profile slices (05/06/07). Prefer wiring the upsert here so profile slices can just provide data, not schema plumbing.
