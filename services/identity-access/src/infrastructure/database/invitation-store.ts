import { createHash, randomBytes, randomUUID } from "node:crypto";

import { DataSource } from "typeorm";

import {
  OrganizationMemberEntity,
  type OrganizationMember,
  type OrganizationRole,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import {
  FulcrumInvitationEntity,
  type FulcrumInvitation,
} from "@identity-access/infrastructure/database/invitation.entities.ts";

export interface InvitationPublicRow {
  id: string;
  orgId: string;
  email: string;
  role: OrganizationRole;
  invitedBy: string;
  status: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export class InvitationPermissionError extends Error {}

export class InvitationStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: { orgId: string; userId: string }): Promise<InvitationPublicRow[]> {
    await this.requireInvitePermission(input, "member");
    const invitations = await this.invitationRepository().find({
      where: { orgId: input.orgId },
      order: { createdAt: "DESC", id: "ASC" },
    });
    return invitations.map(serializeInvitation);
  }

  async get(input: { orgId: string; userId: string; id: string }): Promise<InvitationPublicRow | null> {
    await this.requireInvitePermission(input, "member");
    const invitation = await this.invitationRepository().findOneBy({ orgId: input.orgId, id: input.id });
    return invitation ? serializeInvitation(invitation) : null;
  }

  async create(input: {
    orgId: string;
    userId: string;
    email: string;
    role: OrganizationRole;
  }): Promise<InvitationPublicRow & { token: string }> {
    await this.requireInvitePermission(input, input.role);
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const saved = await this.invitationRepository().save({
      id: randomUUID(),
      orgId: input.orgId,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      tokenHash: hashToken(token),
      invitedBy: input.userId,
      status: "pending",
      expiresAt,
      acceptedAt: null,
      revokedAt: null,
    });
    return { ...serializeInvitation(saved), token };
  }

  async revoke(input: { orgId: string; userId: string; id: string }): Promise<boolean> {
    await this.requireInvitePermission(input, "member");
    const invitation = await this.invitationRepository().findOneBy({ orgId: input.orgId, id: input.id });
    if (!invitation) return false;
    invitation.status = "revoked";
    invitation.revokedAt = new Date();
    await this.invitationRepository().save(invitation);
    return true;
  }

  private async requireInvitePermission(
    input: { orgId: string; userId: string },
    invitedRole: OrganizationRole,
  ): Promise<OrganizationMember> {
    const membership = await this.dataSource.getRepository(OrganizationMemberEntity).findOneBy({
      orgId: input.orgId,
      userId: input.userId,
    });
    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      throw new InvitationPermissionError("Only organization owners and admins can invite members.");
    }
    if (membership.role === "admin" && (invitedRole === "owner" || invitedRole === "admin")) {
      throw new InvitationPermissionError("Only organization owners can invite owners and admins.");
    }
    return membership;
  }

  private invitationRepository() {
    return this.dataSource.getRepository<FulcrumInvitation>(FulcrumInvitationEntity);
  }
}

function serializeInvitation(invitation: FulcrumInvitation): InvitationPublicRow {
  return {
    id: invitation.id,
    orgId: invitation.orgId,
    email: invitation.email,
    role: invitation.role,
    invitedBy: invitation.invitedBy,
    status: invitation.status,
    expiresAt: dateString(invitation.expiresAt) ?? "",
    acceptedAt: dateString(invitation.acceptedAt ?? undefined),
    revokedAt: dateString(invitation.revokedAt ?? undefined),
    createdAt: dateString(invitation.createdAt),
    updatedAt: dateString(invitation.updatedAt),
  };
}

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

function dateString(value: Date | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}
