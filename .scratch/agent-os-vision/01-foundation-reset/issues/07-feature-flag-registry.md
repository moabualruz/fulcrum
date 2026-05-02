---
Status: in-progress
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 06-trpc-core-router-and-permission-middleware
ReviewDebtResolved: 2026-05-02T06:44:06Z — Claude adversarial review review-monyckiz-hm38tr SPEC PASS, follow-up review-monz2qeb-brwjnb SPEC PASS / QUALITY APPROVED after F1/F2 fixes.
ReviewGate: 2026-05-02T10:01:13Z — Claude adversarial review review-moo61q5y-llfvx1 QUALITY CHANGES_REQUIRED: global FeatureFlag uniqueness broken by SQL NULL semantics.
---

# Feature-flag registry — env-var + entity-backed override + tRPC procedures

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Implement the complete feature-flag system end-to-end:

- `src/flags/registry.ts` — `@Injectable() FlagRegistry` exposing typed `FeatureFlag` union of all flag names (see PRD "Always-on features" list + gated table). Exports `isEnabled(flag: FeatureFlag, ctx?: { orgId?, userId? }): boolean`. Resolution order: `featureFlagRepo.findOne({ org, user, flag })` (per-org-per-user override) → `FULCRUM_FEATURES` env var (comma-separated) → `false`. In-process 60s TTL cache for repo lookups. Constructor injects `EntityRepository<FeatureFlag>` via needle-di `inject(...)` default-param pattern.
- All flags registered: `router-llm`, `embeddings`, `memory-llm-extract`, `saas-auth`, `real-time-collab-server`, `external-llm-provider`, `public-api`, `outbound-webhooks`, `notify-email`, `notify-webhook`, `notify-slack`, `casbin-policies`, `pgvector`, `connector-linear`, `symphony-ssh-worker`, `symphony-http-api`.
- tRPC procedures in `src/server/trpc/routers/flags.ts`: `flags.list()` → `FeatureFlag[]` with `{ name, enabled, description }`. `flags.set(flag, enabled)` → `{ ok }` (owner/admin only, calls `em.upsert(FeatureFlag, {...})` via repository, busts cache).
- Description strings for every flag in a `FLAG_DESCRIPTIONS` constant (used by web UI and TUI).

Cuts through: `src/flags/registry.ts` (`@Injectable()` + needle-di) → `FeatureFlag` entity via `featureFlagRepo` → tRPC `flags.list` / `flags.set` → web flags page → CLI `fulcrum flags list/set` → TUI flags screen.

## Acceptance criteria
- [ ] Schema: `FeatureFlag` entity from migration class `01` used. After `flags.set('router-llm', true)`, `featureFlagRepo.findOne({ flag: 'router-llm' })` returns a row with `enabled: true`; `flagRegistry.isEnabled('router-llm')` returns `true` within 60s (or immediately after cache bust).
- [ ] Server action / tRPC: `flags.list()` returns all registered flags with `enabled: false` on fresh install. `flags.set('router-llm', true)` upserts the `FeatureFlag` row via `em.upsert(...)` and returns `{ ok: true }`. Non-owner/admin calling `flags.set` → FORBIDDEN.
- [ ] Web surface: `src/web/src/routes/settings/flags/+page.svelte` lists all flags with toggle switches. Toggling a flag calls `flags.set` via tRPC client; page re-queries `flags.list` to reflect new state. Admin/owner only (route guard).
- [ ] CLI command: `fulcrum flags list [--json]` prints all flags + current state. `fulcrum flags set <flag> <on|off>` upserts the row; subsequent `list` shows updated state. `--json` on both commands.
- [ ] TUI screen: Settings → Feature Flags screen shows toggle list with descriptions. Toggling calls `flags.set` in-process. Renders without crash on first boot.
- [ ] Tests: `tests/flags/registry.test.ts` — instantiate `FlagRegistry` from a test container; `isEnabled` false by default; true when env var set; `featureFlagRepo` row overrides env var. `tests/trpc/flags.test.ts` — full round-trip: set → list → assert updated. `tests/cli/flags.test.ts` — CLI set + list. RED → GREEN.

## Blocked by
- `06-trpc-core-router-and-permission-middleware` (flags procedures use `protectedProcedure`).
- `03-composite-indexes-and-flag-stub-tables` (needs `FeatureFlag` entity from auth migration class, plus `CasbinRule`/`WebhookSubscription`/`NotificationRule` from flag-stub migration class referenced in flag descriptions).

## Notes
`isEnabled` is called in hot paths (tRPC middleware, SvelteKit load functions). The 60s TTL cache is mandatory to avoid per-request repository round-trips. Cache key: `${orgId}:${userId}:${flag}` — tenant-scoped. Global (no-org) cache key: `global:${flag}` for CLI/TUI calls without a session. `FlagRegistry` is registered as a singleton in the root needle-di container so the cache is process-wide.
