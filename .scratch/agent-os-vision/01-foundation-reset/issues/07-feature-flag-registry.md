---
Status: ready-for-agent
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 06-trpc-core-router-and-permission-middleware
---

# Feature-flag registry — env-var + DB override + tRPC procedures

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Implement the complete feature-flag system end-to-end:

- `src/flags/registry.ts` — typed `FeatureFlag` union of all flag names (see PRD "Always-on features" list + gated table). Exports `isEnabled(flag: FeatureFlag, ctx?: { orgId?, userId? }): boolean`. Resolution order: DB row (per-org-per-user override) → `FULCRUM_FEATURES` env var (comma-separated) → `false`. In-process 60s TTL cache for DB lookups.
- All flags registered: `router-llm`, `embeddings`, `memory-llm-extract`, `saas-auth`, `real-time-collab-server`, `external-llm-provider`, `public-api`, `outbound-webhooks`, `notify-email`, `notify-webhook`, `notify-slack`, `casbin-policies`, `pgvector`, `connector-linear`, `symphony-ssh-worker`, `symphony-http-api`.
- tRPC procedures in `src/server/trpc/routers/flags.ts`: `flags.list()` → `FeatureFlag[]` with `{ name, enabled, description }`. `flags.set(flag, enabled)` → `{ ok }` (owner/admin only, writes `feature_flags` row, busts cache).
- Description strings for every flag in a `FLAG_DESCRIPTIONS` constant (used by web UI and TUI).

Cuts through: `src/flags/registry.ts` → DB table → tRPC `flags.list` / `flags.set` → web flags page → CLI `fulcrum flags list/set` → TUI flags screen.

## Acceptance criteria
- [ ] Schema: `feature_flags` table from migration `01` used. After `flags.set('router-llm', true)`, a row exists in `feature_flags`; `isEnabled('router-llm')` returns `true` within 60s (or immediately after cache bust).
- [ ] Server action / tRPC: `flags.list()` returns all registered flags with `enabled: false` on fresh install. `flags.set('router-llm', true)` upserts the DB row and returns `{ ok: true }`. Non-owner/admin calling `flags.set` → FORBIDDEN.
- [ ] Web surface: `src/web/src/routes/settings/flags/+page.svelte` lists all flags with toggle switches. Toggling a flag calls `flags.set` via tRPC client; page re-queries `flags.list` to reflect new state. Admin/owner only (route guard).
- [ ] CLI command: `fulcrum flags list [--json]` prints all flags + current state. `fulcrum flags set <flag> <on|off>` writes the DB row; subsequent `list` shows updated state. `--json` on both commands.
- [ ] TUI screen: Settings → Feature Flags screen shows toggle list with descriptions. Toggling calls `flags.set` in-process. Renders without crash on first boot.
- [ ] Tests: `tests/flags/registry.test.ts` — `isEnabled` false by default; true when env var set; DB row overrides env var. `tests/trpc/flags.test.ts` — full round-trip: set → list → assert updated. `tests/cli/flags.test.ts` — CLI set + list. RED → GREEN.

## Blocked by
- `06-trpc-core-router-and-permission-middleware` (flags procedures use `protectedProcedure`).
- `03-composite-indexes-and-flag-stub-tables` (needs `feature_flags` table from migration `01`, `casbin_rule`/`webhook_subscriptions`/`notification_rules` from migration `07` referenced in flag descriptions).

## Notes
`isEnabled` is called in hot paths (tRPC middleware, SvelteKit load functions). The 60s TTL cache is mandatory to avoid per-request DB round-trips. Cache key: `${orgId}:${userId}:${flag}` — tenant-scoped. Global (no-org) cache key: `global:${flag}` for CLI/TUI calls without a session.
