# 04 — Multi-User / Accounts / Collaboration / SaaS Readiness

> Research date: 2026-05-01. Local-only is default run mode. Design must support solo-local today and SaaS-multi-tenant tomorrow without data rewrites.

---

## 1. Auth / Identity Candidates

| Name | License | Lang | Last release | Stars | Local-first viable | Notes |
|------|---------|------|-------------|-------|-------------------|-------|
| **Better Auth** | MIT | TS | v1.6.9 (Apr 2026) | ~28k | Yes — SQLite adapter, no server req | First-party org + teams plugin. Fastest-growing TS auth lib. **Recommended pick.** |
| Auth.js (NextAuth v5) | ISC | TS | Active 2025 | ~24k | Partial — needs DB adapter; SQLite possible | SvelteKit adapter stable. Less batteries than Better-Auth for orgs. |
| ~~Lucia v3~~ | MIT | TS | **Deprecated Mar 2025** | 10.5k | N/A | Now a learning resource only. Do not adopt. |
| Clerk | Commercial | hosted | Active | — | No — cloud-only | Zero infra ops; not suitable for local-first default. |
| WorkOS | Commercial | hosted | Active | — | No — cloud-only | Enterprise SSO target; viable as SaaS bolt-on, not default. |
| Authelia | Apache-2.0 | Go | Active 2025 | ~22k | Needs Docker sidecar | SSO/2FA proxy. Overkill for single-user local; possible enterprise add-on. |
| Keycloak | Apache-2.0 | Java | Active 2026 | ~23k | Heavy — JVM req | Enterprise IdP. Not suitable as embedded default. |
| Ory (Kratos/Hydra) | Apache-2.0 | Go | Active 2026 | ~11k (Kratos) | Needs separate services | Cloud-native design; self-hostable but sidecar-heavy. |
| Supabase Auth | Apache-2.0 | Go | Active 2026 | ~70k (supabase) | Partial — can self-host GoTrue | Pairs naturally if adopting Supabase DB; adds a service. |
| FusionAuth | Custom (free tier) | Java | Active 2026 | ~800 | Needs JVM server | Feature-rich but heavy. Not local-first. |

**Winner: Better Auth v1.** MIT, 28k stars, SQLite adapter, first-party `organization` plugin with orgs/teams/roles/invitations, SvelteKit handler native. Runs entirely in-process against SQLite for local mode; swap adapter to Postgres/LibSQL for SaaS. No external service required in either mode.

---

## 2. Org / Team / Role / Permission Engines

| Name | License | Lang | Last release | Stars | Embedded? | Notes |
|------|---------|------|-------------|-------|----------|-------|
| **Better Auth org plugin** | MIT | TS | v1.6.9 (Apr 2026) | (bundled) | Yes — in-process | Orgs → Teams → Roles → Permissions. Sufficient for 90% of SaaS RBAC needs. |
| **Casbin** | Apache-2.0 | Go/TS/multi | Active 2026 | ~17k (node-casbin ~2.5k) | Yes — library, no sidecar | Policy files or DB-stored. ACL/RBAC/ABAC/ReBAC. `node-casbin` is the TS variant. Good for local-first; policies stored in SQLite. **Recommended permission-engine fallback.** |
| Cerbos | Apache-2.0 | Go | Active 2026 | ~4.1k | Partial — can embed as Go lib or sidecar | Policy-as-code (YAML), excellent audit log. Sidecar adds ops burden for local. |
| Permify | Apache-2.0 | Go | Active 2026 | ~5.7k | Needs sidecar | Zanzibar-style ReBAC. Powerful for complex relationship graphs; overkill for MVP. |
| OpenFGA | Apache-2.0 | Go | v1.15.0 (Apr 2026) | ~5.1k | Yes — embeds as Go lib; SQLite (beta) | CNCF incubating. Zanzibar-style. JS SDK available. Local-viable if wrapped in a thin service. Upgrade path when Casbin becomes limiting. |

**Recommended stack:**
- Local mode: Better Auth org plugin handles RBAC. No extra engine needed.
- SaaS v1 (complex permissions): Casbin via `node-casbin` + SQLite policy store → swap to Postgres.
- SaaS v2 (relationship-based, enterprise): OpenFGA as sidecar with SQLite (beta) backend for self-hosted, Postgres for cloud.

**Failure gate:** If org plugin roles prove too coarse before SaaS launch, add `node-casbin` in-process (no new service) as v1.5 step.

---

## 3. Multi-Tenancy Schema Patterns

### Pattern A — Shared schema, `org_id` everywhere (Recommended)

Every tenant-scoped table carries an `org_id` (UUID) column. A synthetic "local" org is created on first run with a fixed well-known UUID (e.g., `00000000-0000-0000-0000-000000000001`). All queries filter by `org_id`; local mode always uses the fixed org.

**Pros:**
- Single migration file. No schema duplication.
- Local → SaaS: add real orgs, user auth, real org IDs. Data stays in same tables.
- SQLite works identically — no RLS needed for local (single-user, trust the process).
- Postgres: add `SET app.current_org_id = ?` + `USING (org_id = current_setting('app.current_org_id')::uuid)` RLS policy. Zero application-layer query rewrites.

**Cons:**
- Requires composite indexes: `(org_id, <other columns>)`. Missing index = 100× slower queries.
- Cross-tenant reporting requires superuser bypass of RLS.
- Regulatory isolation (GDPR right-to-erasure per tenant) requires `DELETE WHERE org_id = ?`; works fine.

### Pattern B — Per-tenant schema (Postgres only)

Each org gets its own Postgres schema (`tenant_<uuid>.users`, etc.). Schema is cloned from a template on org creation.

**Pros:** Stronger isolation, per-tenant backup/restore.
**Cons:** Incompatible with SQLite local mode. Migration complexity grows O(tenants). Schema changes require `FOR EACH SCHEMA` loops. Not viable as the primary pattern for a local-first system.

### Pattern C — Per-tenant database

Each org gets its own DB/file.

**Pros:** Maximum isolation; natural for SQLite (one file per org).
**Cons:** Local mode with multiple orgs = multiple files. Connection pool proliferation in SaaS. Operational overhead. Only viable for regulated verticals (healthtech, finance) at tens/hundreds of tenants, not thousands.

**Decision: Pattern A.** Synthetic local org keeps local mode identical to SaaS mode. Composite indexes on `(org_id, …)` are non-negotiable and must be added at schema design time, not retrofitted.

---

## 4. Auth Strategy: Local vs SaaS

### Local mode
- Better Auth + SQLite adapter.
- Auto-create a single `admin` user on first run (email/password or passkey).
- Sessions stored in SQLite `session` table (cookie-based, no JWT required).
- Organization plugin creates the synthetic local org on init.
- No external IdP, no OAuth server. Fully offline.

### SaaS mode (additive, no schema rewrite)
- Swap SQLite adapter → LibSQL (Turso) or Postgres adapter.
- Enable Better Auth's social providers (Google, GitHub OAuth) — these are opt-in plugins.
- Enable Magic Link / Email OTP via Better Auth's email plugin.
- Organization plugin handles multi-tenancy: real orgs, invitations, team membership.
- Enterprise: WorkOS SSO plugin for Better Auth (or Authelia proxy) as enterprise add-on.

**Migration gate:** The only required change is the DB adapter env var. Schema is identical because `org_id` was always there. Session table carries `activeOrganizationId` (Better Auth default) in both modes.

---

## 5. Real-Time Presence + Collaboration

| Name | License | Lang | Last release | Stars | Local-first viable | Notes |
|------|---------|------|-------------|-------|-------------------|-------|
| **Yjs** | MIT | TS/WASM | Active 2026 | ~17k | Yes — offline-first by design | De-facto standard CRDT. Works peer-to-peer, no server needed for offline. |
| **Hocuspocus v4** | MIT | TS/Node | v2.x active 2025 | ~2.5k | Yes — self-hosted Node server; SQLite extension | Yjs WebSocket backend by Tiptap. Cross-runtime (Bun, Deno, Workers). SQLite persistence ext available. **Recommended Yjs backend.** |
| Loro | MIT | Rust/WASM | Active 2026 | ~5.3k | Yes — Rust lib + WASM | Next-gen CRDT, Fugue algo, better memory perf than Yjs. No mature ecosystem yet vs Yjs. Future upgrade path. |
| Liveblocks | Commercial | hosted | Active 2026 | — | No — cloud-only backend required | Polished hosted Yjs platform. Not local-first. |
| PartyKit | Apache-2.0 | TS | Active 2026 | ~4k | No — Cloudflare Workers-only | Serverless Yjs sync. SaaS path option; not embeddable locally. |
| Cloudflare Durable Objects | Commercial | TS | Active 2026 | — | No — Cloudflare platform lock-in | Excellent for SaaS edge collab; not viable for local mode. |

**Recommended stack:**
- Local solo mode: Yjs with `y-indexeddb` (browser) or in-memory provider. No server. Offline-first by definition.
- Local networked mode (LAN collab): Yjs + Hocuspocus running in-process on the local server (same Bun/Node process as the app).
- SaaS mode: Yjs + Hocuspocus deployed as a separate service, or swap to Cloudflare Durable Objects / PartyKit for edge scaling.

**Failure gate:** If Hocuspocus service fails, Yjs degrades to local-only CRDT state — users continue editing, sync resumes on reconnect. This is the correct offline-first failure mode.

---

## 6. Notifications

| Name | License | Self-host | Notes |
|------|---------|----------|-------|
| **In-process event bus** | N/A | Yes | Phase 0: emit events, log to `events` table. No external dep. |
| **Novu** | MIT | Yes — Docker | 30k events/mo free tier. Best OSS self-hosted option. Schema-driven multi-channel (email, in-app, push, SMS). |
| Knock | Commercial | No | Most polished managed service. SaaS mode upgrade path. |
| Courier | Commercial | No | Multi-channel, marketing + transactional. Enterprise add-on. |

**Recommended stack:**
- Local mode: in-process emit + write to `events` table. No notification infra.
- SaaS v1: Novu self-hosted as a sidecar (Docker). Single service, full channel support.
- SaaS v2 scale: Knock as managed service, or Novu Cloud.

---

## 7. Audit Log

The existing `events` table is already the right primitive. Structure needed:

```sql
events (
  id         uuid PRIMARY KEY,
  org_id     uuid NOT NULL REFERENCES organizations(id),  -- add this
  user_id    uuid REFERENCES users(id),
  action     text NOT NULL,   -- e.g. "task.created", "member.invited"
  resource   text,            -- resource type
  resource_id uuid,
  payload    jsonb,           -- before/after state, metadata
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
)
```

**Index required:** `(org_id, created_at DESC)` for per-tenant audit queries.

**Compared to alternatives:**
- Cerbos audit log: excellent if Cerbos is already the policy engine; writes decision records automatically. Not worth adopting Cerbos just for audit.
- OpenFGA Changes API: tracks model changes, not application-level events. Complementary, not a replacement.

**Gap:** The `events` table needs `org_id` added before any multi-user data lands. Must-write now, not at SaaS time.

---

## 8. API Layer (for SaaS path)

| Name | License | Notes |
|------|---------|-------|
| **tRPC v11** | MIT | End-to-end typesafe. Native Fetch API in v11 = clean SvelteKit integration without an adapter. ~36k stars. No codegen step. **Recommended for internal/first-party clients.** |
| graphql-yoga + Pothos | MIT | Schema-first + code-first GraphQL. Good for public API with complex querying. More setup than tRPC. |
| REST + OpenAPI + orval | MIT | When external partners need a stable contract. `orval` codegen from OpenAPI spec to TS client. |

**Recommended:** tRPC v11 as the internal API layer from day one. If a public REST API is needed for SaaS integrations, add an OpenAPI layer via `hono` + `@hono/zod-openapi` as a thin wrapper over the same service logic. Do not build both tRPC and REST at MVP — pick one lane.

---

## 9. Permission UI Patterns

| Model | Notes |
|-------|-------|
| **GitHub role model** | Owner / Admin / Member / Outside Collaborator per org. Teams inherit org roles but can be granted narrower or broader repo-level access. Simple to reason about. |
| Linear role model | Admin / Member / Guest per workspace. Guests see only what they're invited to. Close to what most B2B SaaS needs at v1. |
| Notion permission inheritance | Page-level override of space permissions. Powerful but complex to implement; creates "permission debt" if added late. |

**Recommended for v1:** Linear-style flat role model (Admin / Member / Guest) per org, implemented via Better Auth org plugin's default `owner / admin / member` roles + one custom `guest` role. No page-level inheritance at MVP.

---

## 10. Recommended Architecture

### Schema strategy
- `org_id` column on every tenant-scoped table from day one.
- `organizations` table: `{ id, name, slug, plan, created_at }`.
- Synthetic local org: `INSERT INTO organizations VALUES ('00000000-0000-0000-0000-000000000001', 'Local', 'local', 'local', NOW()) ON CONFLICT DO NOTHING`.
- All queries: `WHERE org_id = current_org_id()` — same code path for local and SaaS.
- Composite indexes: `(org_id, <sort_col>)` on every high-traffic table. Non-negotiable.
- SQLite: no RLS needed (single-user, trusted process). Postgres: RLS via `app.current_org_id` setting.

### Auth strategy
- **Local:** Better Auth + SQLite adapter. Single admin user. No OAuth. Passkey optional.
- **SaaS:** Better Auth + Postgres/LibSQL adapter. Social providers (Google, GitHub). Magic links. Organization plugin active.
- Migration: change `DATABASE_URL` env var. No schema changes. No data migration.
- **Fallback:** Auth.js v5 if Better Auth org plugin proves limiting (less likely given v1.6.9 trajectory).

### Permission engine
- **v1:** Better Auth org plugin (owner/admin/member/guest). In-process, no sidecar.
- **v1.5 (if needed):** `node-casbin` in-process, policies in SQLite `casbin_rule` table. No new service.
- **v2 (enterprise):** OpenFGA as sidecar (SQLite backend for self-hosted, Postgres for cloud). Apache-2.0.
- **Failure gate:** Permission check throws → deny by default (fail closed).

### Real-time collab
- **Local solo:** Yjs + `y-indexeddb`. No server.
- **Local networked / SaaS v1:** Yjs + Hocuspocus (in-process or separate service), SQLite persistence extension.
- **SaaS scale:** Yjs + Cloudflare Durable Objects or PartyKit.
- **Failure gate:** Hocuspocus down → Yjs offline mode. Users continue working; sync on reconnect. No data loss (CRDT merge resolves on reconnect).

### Notifications
- Local: emit to `events` table only.
- SaaS: Novu self-hosted. Knock managed as scale upgrade.

### Audit log
- `events` table with `org_id` column. Must add `org_id` NOW before any feature work.
- Index: `(org_id, created_at DESC)`.

### Migration path local → SaaS
1. `DATABASE_URL` points to Postgres. Schema already has `org_id` everywhere. Zero data rewrite.
2. Enable Better Auth social providers (env var flags).
3. Create real org records; old local data gets `org_id = local-org-id`.
4. Point Hocuspocus at a shared server (or Cloudflare DO).
5. Add Novu sidecar.
6. Done. No schema migrations required if `org_id` was on tables from the start.

---

## 11. Must-Write Gaps (Design-Now-or-Pay-Later)

| Gap | Risk if deferred | Action |
|-----|-----------------|--------|
| `org_id` on `events` table | Audit log unusable in multi-tenant without backfill | Add in next schema migration |
| Composite `(org_id, …)` indexes | 100× query slowdown when RLS added to Postgres | Add at table creation |
| Synthetic local org seed | Local mode breaks when org plugin is activated | Seed script in `src/db/seed.ts` |
| `current_org_id()` context helper | Every query must know the org — centralize now | One function, injected via Better Auth session middleware |
| Permission fail-closed default | Missing check = data leak | Lint rule: every route handler must call `assertPermission()` |
| tRPC context carries `orgId` + `userId` | Retrofitting context = touch every procedure | Set in `createContext` from day one |

---

## 12. Fallback Summary

| Layer | Primary | Fallback 1 | Fallback 2 |
|-------|---------|-----------|-----------|
| Auth | Better Auth v1 | Auth.js v5 | Roll own (Lucia v3 source as reference) |
| Org RBAC | Better Auth org plugin | node-casbin in-process | OpenFGA sidecar |
| Real-time | Yjs + Hocuspocus | Yjs + PartyKit | Yjs + Cloudflare DO |
| Notifications | events table | Novu self-hosted | Knock managed |
| API layer | tRPC v11 | Hono + OpenAPI | graphql-yoga + Pothos |
| Multi-tenancy | Row-level org_id | Per-tenant Postgres schema | Per-tenant DB (regulated only) |
