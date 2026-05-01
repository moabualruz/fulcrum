---
Status: ready-for-agent
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 07-feature-flag-registry
---

# Auth + org tRPC procedures — whoami, invite, acceptInvite, org member management

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Implement all auth + org tRPC procedures in `src/server/trpc/routers/auth.ts` and `src/server/trpc/routers/orgs.ts`:

**Auth procedures:**
- `auth.whoami` → `{ userId, orgId, email, role }`
- `auth.invite(email, role)` → `{ invitationId, token }` — inserts `invitations` row; admin/owner only.
- `auth.acceptInvite(token)` → `{ userId, orgId }` — validates token expiry + org match; creates or links user; inserts `org_members` row; invalidates token.

**Org procedures:**
- `orgs.get()` → org row.
- `orgs.update(name)` → org row (owner only).
- `orgs.members.list()` → `OrgMember[]` (admin/owner only).
- `orgs.members.updateRole(userId, role)` → `{ ok }` (owner only).
- `orgs.members.remove(userId)` → `{ ok }` (owner/admin only; cannot remove self if last owner).

All Zod input schemas live in `src/server/trpc/schemas/auth.ts` and `src/server/trpc/schemas/orgs.ts`.

Cuts through: Zod schemas → tRPC procedures → `assertPermission` middleware → DB writes/reads → web admin UI (slice `12`) → CLI auth verbs (slice `10`) → tests.

## Acceptance criteria
- [ ] Schema: `invitations` row created + `accepted_at` set + `org_members` row created on `acceptInvite`.
- [ ] Server action / tRPC: all procedures listed above callable in-process. FORBIDDEN returned when caller lacks required role. `acceptInvite` with expired token returns validation error, not 500.
- [ ] Web surface: N/A — web surfaces for invite/user-management are slice `12`; this slice exposes the procedures consumed by that slice.
- [ ] CLI command: N/A — CLI bindings are slice `10`.
- [ ] TUI screen: N/A — TUI auth screen is slice `15`.
- [ ] Tests: `tests/trpc/auth.test.ts` — `whoami` returns correct payload; `invite` creates invitation row; `acceptInvite` with valid token creates `org_members` row; expired token → error; wrong org token → error. `tests/trpc/orgs.test.ts` — member list, role update, remove member. Role guard: guest calling `update` → FORBIDDEN. RED → GREEN.

## Blocked by
- `07-feature-flag-registry` (procedures use `protectedProcedure` from router scaffold + flag registry initialized).

## Notes
`auth.acceptInvite` is a `publicProcedure` (unauthenticated — the invited user doesn't have a session yet). All other auth/org procedures are `protectedProcedure`. Token must be cryptographically random (use `crypto.randomBytes(32).toString('hex')`); token stored hashed in DB.
