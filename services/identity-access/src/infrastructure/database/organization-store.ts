import { DataSource } from "typeorm";

import {
  type OrganizationMember,
  OrganizationMemberEntity,
  type OrganizationRole,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import {
  type FulcrumWorkspace,
  FulcrumWorkspaceEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export interface OrganizationPublicRow {
  id: string;
  name: string;
  slug: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface OrganizationMemberPublicRow {
  id: string;
  userId: string;
  orgId: string;
  role: OrganizationRole;
  joinedAt: string | null;
}

export class OrganizationPermissionError extends Error {}
export class LastOrganizationOwnerError extends Error {}

export class OrganizationStore {
  constructor(private readonly dataSource: DataSource) {}

  async getOrganization(input: { orgId: string }): Promise<OrganizationPublicRow | null> {
    const organization = await this.organizationRepository().findOneBy({ id: input.orgId });
    return organization ? serializeOrganization(organization) : null;
  }

  async updateOrganization(input: { orgId: string; userId: string; name: string }): Promise<boolean> {
    await this.requireOwner(input);
    const organization = await this.organizationRepository().findOneBy({ id: input.orgId });
    if (!organization) return false;
    organization.name = input.name;
    await this.organizationRepository().save(organization);
    return true;
  }

  async listMembers(input: { orgId: string; userId: string }): Promise<OrganizationMemberPublicRow[]> {
    await this.requireAdminOrOwner(input);
    const members = await this.memberRepository().find({
      where: { orgId: input.orgId },
      order: { joinedAt: "ASC", userId: "ASC" },
    });
    return members.sort((left, right) => roleRank(left.role) - roleRank(right.role)).map(serializeMember);
  }

  async updateMemberRole(input: {
    orgId: string;
    userId: string;
    targetUserId: string;
    role: OrganizationRole;
  }): Promise<boolean> {
    await this.requireOwner(input);
    const member = await this.memberRepository().findOneBy({ orgId: input.orgId, userId: input.targetUserId });
    if (!member) return false;
    member.role = input.role;
    await this.memberRepository().save(member);
    return true;
  }

  async removeMember(input: { orgId: string; userId: string; targetUserId: string }): Promise<boolean> {
    await this.requireAdminOrOwner(input);
    const member = await this.memberRepository().findOneBy({ orgId: input.orgId, userId: input.targetUserId });
    if (!member) return false;
    if (member.role === "owner" && await this.ownerCount(input.orgId) <= 1) {
      throw new LastOrganizationOwnerError("Cannot remove the last owner of an organization.");
    }
    await this.memberRepository().delete({ orgId: input.orgId, userId: input.targetUserId });
    return true;
  }

  private async requireAdminOrOwner(input: { orgId: string; userId: string }): Promise<OrganizationMember> {
    const member = await this.memberRepository().findOneBy({ orgId: input.orgId, userId: input.userId });
    if (!member || !["owner", "admin"].includes(member.role)) {
      throw new OrganizationPermissionError("Only organization owners and admins can perform this action.");
    }
    return member;
  }

  private async requireOwner(input: { orgId: string; userId: string }): Promise<OrganizationMember> {
    const member = await this.memberRepository().findOneBy({ orgId: input.orgId, userId: input.userId });
    if (!member || member.role !== "owner") {
      throw new OrganizationPermissionError("Only organization owners can perform this action.");
    }
    return member;
  }

  private async ownerCount(orgId: string): Promise<number> {
    return await this.memberRepository().countBy({ orgId, role: "owner" });
  }

  private organizationRepository() {
    return this.dataSource.getRepository(FulcrumWorkspaceEntity);
  }

  private memberRepository() {
    return this.dataSource.getRepository(OrganizationMemberEntity);
  }
}

function serializeOrganization(organization: FulcrumWorkspace): OrganizationPublicRow {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: dateString(organization.createdAt),
    updatedAt: dateString(organization.updatedAt),
  };
}

function serializeMember(member: OrganizationMember): OrganizationMemberPublicRow {
  return {
    id: member.id,
    userId: member.userId,
    orgId: member.orgId,
    role: member.role,
    joinedAt: dateString(member.joinedAt),
  };
}

function roleRank(role: OrganizationRole): number {
  return ["owner", "admin", "member", "guest"].indexOf(role);
}

function dateString(value: Date | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}
