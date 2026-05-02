---
Status: implemented
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 09-auth-trpc-procedures-and-org-management, 03-composite-indexes-and-flag-stub-tables
---

# `casbin-policies` flag — node-casbin in-process ABAC integration via FulcrumCasbinAdapter (shipped + gated)

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Wire `node-casbin` in-process behind the `casbin-policies` feature flag. When flag is OFF: `assertPermission` uses only Better-Auth `hasPermission()` (always-on behavior). When flag is ON: `assertPermission` evaluates a Casbin model first (via the `FulcrumCasbinAdapter`), then falls back to Better-Auth for anything not covered by a Casbin policy.

Per C7: do NOT use any third-party `casbin-typeorm-adapter` / `casbin-knex-adapter` package. Instead ship a custom `FulcrumCasbinAdapter` (~200 LOC) that implements node-casbin's 5-method adapter interface (`loadPolicy`, `savePolicy`, `addPolicy`, `removePolicy`, `removeFilteredPolicy`) directly against `EntityRepository<CasbinRule>`. `CasbinRule` (entity from migration class `flag_stubs` in slice `03`) is owned by Fulcrum, not Casbin; the adapter reads/writes via repository calls, never raw SQL.

**`src/server/trpc/middleware/assertPermission.ts` update:**
- Resolve `FlagRegistry` via `inject(FlagRegistry)`. Check `flagRegistry.isEnabled('casbin-policies')`. If ON: instantiate Casbin enforcer with `FulcrumCasbinAdapter` (resolved from needle-di). Evaluate `await enforcer.enforce(userId, resource, action)`. If Casbin returns `true` → allow; if Casbin returns `false` and a rule exists for this subject → deny; if no rule → fall through to Better-Auth.
- If flag OFF: existing Better-Auth path unchanged.

**`src/auth/casbin.ts` (`@Injectable() FulcrumCasbinAdapter` + `@Injectable() CasbinEnforcerService`):**
- `FulcrumCasbinAdapter` constructor injects `EntityRepository<CasbinRule>`. `loadPolicy(model)` calls `casbinRuleRepo.findAll()` and pushes each row into the model. `savePolicy(model)` flushes the policy back via `em.transactional`. `addPolicy/removePolicy/removeFilteredPolicy` translate to repository calls.
- `CasbinEnforcerService` is a singleton enforcer, lazy-initialized on first use when flag is ON.
- Default policy model: RBAC with resource + action. Seed a default `owner` → `*` policy for the local org via `casbinRuleRepo` on `fulcrum init`.
- Failure gate: if `node-casbin` ARM64 binding fails → use `casbin-wasm` build; same policy API; `FulcrumCasbinAdapter` unchanged.

Cuts through: `CasbinRule` entity (from slice `03`) → `FulcrumCasbinAdapter` (`@Injectable()`) → `CasbinEnforcerService` singleton → `assertPermission` middleware → tRPC mutation call → tests for both flag-OFF and flag-ON paths.

## Acceptance criteria
- [x] Schema: `CasbinRule` entity (from migration class `flag_stubs`) populated with default owner policy on `fulcrum init` via `em.create(CasbinRule, {...}); em.persistAndFlush(...)`. No new migration classes needed.
- [x] Server action / tRPC: flag OFF → behavior unchanged; flag ON → Casbin enforcer evaluates before Better-Auth; owner policy allows all; non-existent rule falls through to Better-Auth. A user with no Better-Auth role + no Casbin rule → FORBIDDEN.
- [x] Web surface: no visible change to end user. `/settings/flags` toggle for `casbin-policies` works (from slice `07` flags UI).
- [x] CLI command: no new CLI verbs; `fulcrum flags set casbin-policies on` activates the enforcer on next call.
- [x] TUI screen: no new TUI screen; flag toggle in flags screen (from slice `15`) activates/deactivates.
- [x] Tests: `tests/permissions/casbin-enforcer.test.ts` — with flag OFF: mutation succeeds for owner. With flag ON: add a Casbin `DENY` rule for user X on resource Y via `casbinRuleRepo`; assert mutation from X returns FORBIDDEN. Add `ALLOW` rule; assert succeeds. `tests/permissions/casbin-adapter.test.ts` — unit test the 5-method adapter interface against an in-memory test EM; round-trip `addPolicy` → `loadPolicy` → assert rule present. RED → GREEN.

## Blocked by
- `09-auth-trpc-procedures-and-org-management` (assertPermission middleware needs auth procedures live).
- `03-composite-indexes-and-flag-stub-tables` (needs `CasbinRule` entity from migration class `flag_stubs`).

## Notes
Full ABAC policy management UI + per-resource policy editor is Owned by Pillar 5 (Permissions). This slice only wires the enforcer + custom adapter into `assertPermission` and seeds the default owner policy. The `CasbinRule` entity is ready for Pillar 5 to populate without a schema change. The custom `FulcrumCasbinAdapter` keeps Casbin's table contract (`ptype`, `v0..v5`) without ceding ownership of the entity to a third-party adapter package.
