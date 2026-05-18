import { createHash, randomUUID } from "node:crypto";

import { DataSource } from "typeorm";

import {
  FulcrumInvitationEntity,
  type FulcrumInvitation,
} from "@identity-access/infrastructure/database/invitation.entities.ts";
import { InvitationStore } from "@identity-access/infrastructure/database/invitation-store.ts";
import {
  OrganizationMemberEntity,
  type OrganizationRole,
} from "@identity-access/infrastructure/database/organization.entities.ts";
import { FulcrumWorkspaceEntity } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export interface AuthSessionPublicRow {
  userId: string;
  orgId: string;
  activeOrgId: string;
  sessionId: string | null;
  sessionExpiresAt: string | null;
  email: string | null;
  role: OrganizationRole | null;
  orgName?: string;
}

export interface AuthInvitationAcceptedRow {
  userId: string;
  orgId: string;
}

export class AuthValidationError extends Error {}

export class AuthStore {
  private readonly invitations: InvitationStore;

  constructor(private readonly dataSource: DataSource) {
    this.invitations = new InvitationStore(dataSource);
  }

  async whoami(input: { orgId: string; userId: string }): Promise<AuthSessionPublicRow> {
    const [membership, organization] = await Promise.all([
      this.dataSource.getRepository(OrganizationMemberEntity).findOneBy({
        orgId: input.orgId,
        userId: input.userId,
      }),
      this.dataSource.getRepository(FulcrumWorkspaceEntity).findOneBy({ id: input.orgId }),
    ]);

    return {
      userId: input.userId,
      orgId: input.orgId,
      activeOrgId: input.orgId,
      sessionId: null,
      sessionExpiresAt: null,
      email: input.userId.includes("@") ? input.userId : null,
      role: membership?.role ?? null,
      orgName: organization?.name ?? input.orgId,
    };
  }

  async invite(input: {
    orgId: string;
    userId: string;
    email: string;
    role: OrganizationRole;
  }): Promise<{ invitationId: string; token: string }> {
    const invitation = await this.invitations.create(input);
    return {
      invitationId: invitation.id,
      token: invitation.token,
    };
  }

  async acceptInvite(input: { token: string }): Promise<AuthInvitationAcceptedRow> {
    const repository = this.dataSource.getRepository<FulcrumInvitation>(FulcrumInvitationEntity);
    const invitation = await repository.findOneBy({ tokenHash: hashToken(input.token) });
    if (!invitation) throw new AuthValidationError("Invalid or unknown invitation token.");
    if (invitation.status !== "pending") throw new AuthValidationError("Invitation token has already been used.");
    if (invitation.revokedAt) throw new AuthValidationError("Invitation token has been revoked.");
    if (new Date() > invitation.expiresAt) throw new AuthValidationError("Invitation token has expired.");

    const userId = invitation.email;
    const memberRepository = this.dataSource.getRepository(OrganizationMemberEntity);
    const existing = await memberRepository.findOneBy({ orgId: invitation.orgId, userId });
    if (!existing) {
      await memberRepository.save({
        id: randomUUID(),
        orgId: invitation.orgId,
        userId,
        role: invitation.role,
      });
    }

    invitation.status = "accepted";
    invitation.acceptedAt = new Date();
    await repository.save(invitation);

    return {
      userId,
      orgId: invitation.orgId,
    };
  }
}

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}
