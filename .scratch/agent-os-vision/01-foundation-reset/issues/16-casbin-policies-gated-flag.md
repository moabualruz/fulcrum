---
Status: ready-for-agent
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 09-auth-trpc-procedures-and-org-management, 03-composite-indexes-and-flag-stub-tables
---

# `casbin-policies` flag — node-casbin in-process ABAC integration (shipped + gated)

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Wire `node-casbin` in-process behind the `casbin-policies` feature flag. When flag is OFF: `assertPermission` uses only Better-Auth `hasPermission()` (always-on behavior). When flag is ON: `assertPermission` evaluates a Casbin model first, then falls back to Better-Auth for anything not covered by a Casbin policy.

**`src/server/trpc/middleware/assertPermission.ts` update:**
- Check `isEnabled('casbin-policies')`. If ON: instantiate Casbin enforcer with `casbin_rule` table as adapter (from migration `0007`). Evaluate `enforcer.enforce(userId, resource, action)`. If Casbin returns `true` → allow; if Casbin returns `false` and a rule exists for this subject → deny; if no rule → fall through to Better-Auth.
- If flag OFF: existing Better-Auth path unchanged.

**Casbin enforcer initialization (`src/auth/casbin.ts`):**
- Singleton enforcer, lazy-initialized on first use when flag is ON.
- Uses `casbin_rule` table as the policy store (Postgres/PGlite adapter via `typeorm-adapter` or raw SQL adapter).
- Default policy model: RBAC with resource + action. Seed a default `owner` → `*` policy for the local org on `fulcrum init`.
- Failure gate: if `node-casbin` ARM64 binding fails → use `casbin-wasm` build; same policy API.

Cuts through: `casbin_rule` table → enforcer singleton → `assertPermission` middleware → tRPC mutation call → tests for both flag-OFF and flag-ON paths.

## Acceptance criteria
- [ ] Schema: `casbin_rule` table (from `0007`) populated with default owner policy on `fulcrum init`. No new migrations needed.
- [ ] Server action / tRPC: flag OFF → behavior unchanged; flag ON → Casbin enforcer evaluates before Better-Auth; owner policy allows all; non-existent rule falls through to Better-Auth. A user with no Better-Auth role + no Casbin rule → FORBIDDEN.
- [ ] Web surface: no visible change to end user. `/settings/flags` toggle for `casbin-policies` works (from slice `07` flags UI).
- [ ] CLI command: no new CLI verbs; `fulcrum flags set casbin-policies on` activates the enforcer on next call.
- [ ] TUI screen: no new TUI screen; flag toggle in flags screen (from slice `15`) activates/deactivates.
- [ ] Tests: `tests/auth/casbin.test.ts` — with flag OFF: mutation succeeds for owner. With flag ON: add a Casbin `DENY` rule for user X on resource Y; assert mutation from X returns FORBIDDEN. Add `ALLOW` rule; assert succeeds. RED → GREEN.

## Blocked by
- `09-auth-trpc-procedures-and-org-management` (assertPermission middleware needs auth procedures live).
- `03-composite-indexes-and-flag-stub-tables` (needs `casbin_rule` table from migration `0007`).

## Notes
Full ABAC policy management UI + per-resource policy editor is Owned by Pillar 5 (Permissions). This slice only wires the enforcer into `assertPermission` and seeds the default owner policy. The `casbin_rule` table is ready for Pillar 5 to populate without a schema change.
