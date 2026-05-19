# Orgs

Application-layer commands and queries that read and mutate an **Org** and its **OrgMembers** on behalf of the currently signed-in **User**, gated by per-membership role checks.

## Language

**OrgAppContext**:
The `{ orgId, userId }` pair this area requires on every command/query, derived upstream from the **AuthApplicationContext**.
_Avoid_: Request, session, principal, auth context.

**OrgOutput**:
The flat DTO shape (`id`, `name`, `slug`, `createdAt`, `updatedAt`) returned to interfaces for an **Org**; never the raw entity.
_Avoid_: OrgDto, Organization, OrgRecord.

**OrgMemberOutput**:
The flat DTO shape (`id`, `userId`, `orgId`, `role`, `joinedAt`) returned for an **OrgMember**.
_Avoid_: MemberDto, Membership, Seat.

**CurrentMembership**:
The caller's own **OrgMember** row for `ctx.orgId`, loaded to authorise the call.
_Avoid_: Viewer, self, me, actor.

**OwnerGuard**:
The `requireOwner` check that rejects when **CurrentMembership** role is not `owner`.
_Avoid_: Owner-only, root check, admin guard.

**AdminOrOwnerGuard**:
The `requireAdminOrOwner` check that rejects when **CurrentMembership** role is not `owner` or `admin`.
_Avoid_: Staff check, elevated check, manager guard.

**LastOwnerInvariant**:
The rule that `removeOrgMember` refuses to delete an **OrgMember** whose role is `owner` when it is the last `owner` row for the **Org**.
_Avoid_: Owner lock, safety check, final owner rule.

## Relationships

- Every command/query takes an **OrgAppContext** and resolves a **CurrentMembership** before doing work.
- `updateOrg` and `updateOrgMemberRole` require **OwnerGuard**; `removeOrgMember` and `listOrgMembers` require **AdminOrOwnerGuard**; `getOrg` is unguarded beyond `ctx`.
- `removeOrgMember` enforces the **LastOwnerInvariant** before deleting an **OrgMember**.
- Commands return `{ ok: true }`; queries return **OrgOutput** or **OrgMemberOutput[]** — never the TypeORM entity.

## Example dialogue

> **Dev:** "If an `admin` calls `updateOrgMemberRole` to demote an `owner`, what happens?"
> **Domain expert:** "**OwnerGuard** rejects it before we load the target — only an `owner` can change a role. **AdminOrOwnerGuard** is reserved for member removal and listing."
> **Dev:** "And if the last `owner` tries to remove themselves?"
> **Domain expert:** "**AdminOrOwnerGuard** lets the call in, then the **LastOwnerInvariant** throws an `AppValidationError`."

## Flagged ambiguities

- **CurrentMembership vs User.role** — authorisation in this area reads the **OrgMember** row only; the parent context's denormalised **User**.`role` is not consulted here.
- **OwnerGuard vs AdminOrOwnerGuard** — both are membership-role checks, but they are not interchangeable: mutating the **Org** or a member's role is owner-only, while listing or removing members is admin-or-owner.
