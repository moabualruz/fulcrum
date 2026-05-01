---
Status: completed
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 07-feature-flag-registry
---

# Auth + org tRPC procedures — whoami, invite, acceptInvite, org member management

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Implement all auth + org tRPC procedures in `src/server/trpc/routers/auth.ts` and `src/server/trpc/routers/orgs.ts`. Each procedure resolves repositories from `ctx.container` (needle-di) and uses MikroORM repository calls — no raw SQL.

**Auth procedures:**
- `auth.whoami` → `{ userId, orgId, email, role }`
- `auth.invite(email, role)` → `{ invitationId, token }` — creates an `Invitation` entity via `em.create(Invitation, {...}); em.persistAndFlush(...)`; admin/owner only.
- `auth.acceptInvite(token)` → `{ userId, orgId }` — `await invitationRepo.findOne({ token })`, validates expiry + org match; creates or links user via `em.upsert(User, {...})`; creates `OrgMember` row via `em.create(OrgMember, {...}); em.persistAndFlush(...)`; sets `invitation.acceptedAt = new Date(); em.flush();` to invalidate token.

**Org procedures:**
- `orgs.get()` → `await orgRepo.findOne({ id: ctx.orgId })`.
- `orgs.update(name)` → `org.name = name; await em.flush();` (owner only).
- `orgs.members.list()` → `await orgMemberRepo.find({ org: ctx.orgId }, { populate: ['user'] })` (admin/owner only).
- `orgs.members.updateRole(userId, role)` → finds `OrgMember`, mutates `role`, `em.flush()` (owner only).
- `orgs.members.remove(userId)` → `await em.removeAndFlush(orgMember)` (owner/admin only; cannot remove self if last owner — guarded by an `orgMemberRepo.count({ org, role: 'owner' }) > 1` check).

All Zod input schemas live in `src/server/trpc/schemas/auth.ts` and `src/server/trpc/schemas/orgs.ts`.

Cuts through: Zod schemas → tRPC procedures → `assertPermission` middleware → repository writes/reads → web admin UI (slice `12`) → CLI auth verbs (slice `10`) → tests.

## Acceptance criteria
- [ ] Schema: `Invitation` row created + `acceptedAt` set + `OrgMember` row created on `acceptInvite` (verified via `invitationRepo.findOne` + `orgMemberRepo.findOne`).
- [ ] Server action / tRPC: all procedures listed above callable in-process. FORBIDDEN returned when caller lacks required role. `acceptInvite` with expired token returns validation error, not 500.
- [ ] Web surface: N/A — web surfaces for invite/user-management are slice `12`; this slice exposes the procedures consumed by that slice.
- [ ] CLI command: N/A — CLI bindings are slice `10`.
- [ ] TUI screen: N/A — TUI auth screen is slice `15`.
- [ ] Tests: `tests/trpc/auth.test.ts` — `whoami` returns correct payload; `invite` creates `Invitation` row (asserted via `invitationRepo.findOne`); `acceptInvite` with valid token creates `OrgMember` row; expired token → error; wrong org token → error. `tests/trpc/orgs.test.ts` — member list, role update, remove member. Role guard: guest calling `update` → FORBIDDEN. RED → GREEN.

## Blocked by
- `07-feature-flag-registry` (procedures use `protectedProcedure` from router scaffold + flag registry initialized).

## Notes
`auth.acceptInvite` is a `publicProcedure` (unauthenticated — the invited user doesn't have a session yet). All other auth/org procedures are `protectedProcedure`. Token must be cryptographically random (use `crypto.randomBytes(32).toString('hex')`); token stored hashed in DB (the `Invitation.token` field stores the hash; the plaintext is returned only once at creation).
