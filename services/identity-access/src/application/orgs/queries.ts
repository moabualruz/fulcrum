import type { EntityManager } from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { OrgMember } from "@identity-access/infrastructure/database/entities/auth/OrgMember.ts";
import { AppForbiddenError, AppNotFoundError } from "@platform-core/domain/errors.ts";

export interface OrgAppContext {
  orgId: string;
  userId: string;
}

export interface OrgOutput {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrgMemberOutput {
  id: string;
  userId: string;
  orgId: string;
  role: string;
  joinedAt: Date;
}

async function currentMembership(em: EntityManager, ctx: OrgAppContext): Promise<OrgMember | null> {
  return em.findOne(OrgMember, { where: { orgId: ctx.orgId, userId: ctx.userId } as never });
}

export async function requireAdminOrOwner(em: EntityManager, ctx: OrgAppContext): Promise<OrgMember> {
  const membership = await currentMembership(em, ctx);
  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new AppForbiddenError("Only org owners and admins can perform this action.");
  }
  return membership;
}

export async function requireOwner(em: EntityManager, ctx: OrgAppContext): Promise<OrgMember> {
  const membership = await currentMembership(em, ctx);
  if (!membership || membership.role !== "owner") {
    throw new AppForbiddenError("Only org owners can perform this action.");
  }
  return membership;
}

export async function getOrg(em: EntityManager, ctx: OrgAppContext): Promise<OrgOutput> {
  const org = await em.findOne(Org, { where: { id: ctx.orgId } as never });
  if (!org) throw new AppNotFoundError(`Org ${ctx.orgId} not found.`);
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    createdAt: org.createdAt,
    updatedAt: org.updatedAt,
  };
}

export async function listOrgMembers(em: EntityManager, ctx: OrgAppContext): Promise<OrgMemberOutput[]> {
  await requireAdminOrOwner(em, ctx);
  const members = await em.find(OrgMember, { orgId: ctx.orgId } as never);
  return members.map((member) => ({
    id: member.id,
    userId: member.userId,
    orgId: member.orgId,
    role: member.role,
    joinedAt: member.joinedAt,
  }));
}
