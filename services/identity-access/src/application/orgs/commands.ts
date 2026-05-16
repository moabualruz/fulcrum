import type { EntityManager } from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { OrgMember } from "@identity-access/infrastructure/database/entities/auth/OrgMember.ts";
import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { requireAdminOrOwner, requireOwner, type OrgAppContext } from "@identity-access/application/orgs/queries.ts";

export async function updateOrg(
  em: EntityManager,
  ctx: OrgAppContext,
  input: { name: string },
): Promise<{ ok: true }> {
  await requireOwner(em, ctx);
  const org = await em.findOne(Org, { where: { id: ctx.orgId } as never });
  if (!org) throw new AppNotFoundError(`Org ${ctx.orgId} not found.`);
  org.name = input.name;
  await em.save(org);
  return { ok: true };
}

export async function updateOrgMemberRole(
  em: EntityManager,
  ctx: OrgAppContext,
  input: { userId: string; role: string },
): Promise<{ ok: true }> {
  await requireOwner(em, ctx);
  const member = await em.findOne(OrgMember, { where: { orgId: ctx.orgId, userId: input.userId } as never });
  if (!member) throw new AppNotFoundError(`User ${input.userId} is not a member of this org.`);
  member.role = input.role;
  await em.save(member);
  return { ok: true };
}

export async function removeOrgMember(
  em: EntityManager,
  ctx: OrgAppContext,
  input: { userId: string },
): Promise<{ ok: true }> {
  await requireAdminOrOwner(em, ctx);
  const member = await em.findOne(OrgMember, { where: { orgId: ctx.orgId, userId: input.userId } as never });
  if (!member) throw new AppNotFoundError(`User ${input.userId} is not a member of this org.`);

  if (member.role === "owner") {
    const ownerCount = await em.count(OrgMember, { where: { orgId: ctx.orgId, role: "owner" } });
    if (ownerCount <= 1) throw new AppValidationError("Cannot remove the last owner of an org.");
  }

  await em.getRepository(OrgMember).delete({ id: member.id });
  return { ok: true };
}
