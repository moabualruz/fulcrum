import { createHash, randomBytes, randomUUID } from "node:crypto";

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
import { User } from "@identity-access/infrastructure/database/entities/auth/User.ts";
import { Verification } from "@identity-access/infrastructure/database/entities/auth/Verification.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { FulcrumWorkspaceEntity } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

export interface AuthSessionPublicRow {
  userId: string;
  orgId: string;
  activeOrgId: string;
  sessionId: string | null;
  sessionExpiresAt: string | null;
  email: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  role: OrganizationRole | null;
  orgName?: string;
}

export interface AuthInvitationAcceptedRow {
  userId: string;
  orgId: string;
}

export class AuthValidationError extends Error {}

export interface EmailVerificationRequestInput {
  orgId: string;
  userId: string;
  email?: string | null;
  baseUrl?: string | null;
  now?: Date;
}

export interface EmailVerificationRequestRow {
  email: string;
  verificationUrl: string;
  expiresAt: string;
  resendAvailableAt: string;
}

export interface EmailVerificationResultRow {
  userId: string;
  orgId: string;
  email: string;
  emailVerified: true;
  emailVerifiedAt: string;
}

export class AuthStore {
  private readonly invitations: InvitationStore;

  constructor(private readonly dataSource: DataSource) {
    this.invitations = new InvitationStore(dataSource);
  }

  async whoami(input: { orgId: string; userId: string }): Promise<AuthSessionPublicRow> {
    const [membership, organization, user] = await Promise.all([
      this.dataSource.getRepository(OrganizationMemberEntity).findOneBy({
        orgId: input.orgId,
        userId: input.userId,
      }),
      this.dataSource.getRepository(FulcrumWorkspaceEntity).findOneBy({ id: input.orgId }),
      this.findUser(input.orgId, input.userId),
    ]);

    return {
      userId: input.userId,
      orgId: input.orgId,
      activeOrgId: input.orgId,
      sessionId: null,
      sessionExpiresAt: null,
      email: user?.email ?? (input.userId.includes("@") ? input.userId : null),
      emailVerified: user?.emailVerified ?? false,
      emailVerifiedAt: user?.emailVerifiedAt?.toISOString() ?? null,
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

  async requestEmailVerification(input: EmailVerificationRequestInput): Promise<EmailVerificationRequestRow> {
    const now = input.now ?? new Date();
    const user = await this.requireUser(input.orgId, input.userId, input.email);
    if (user.emailVerified) {
      throw new AuthValidationError("Email address is already verified.");
    }

    const identifier = emailVerificationIdentifier(user.orgId, user.id, user.email);
    const repository = this.dataSource.getRepository(Verification);
    const previous = await repository.findOneBy({ identifier });
    if (previous) {
      const resendAvailableAt = new Date(previous.createdAt.getTime() + 60_000);
      if (resendAvailableAt > now) {
        throw new AuthValidationError(
          `Verification resend is throttled until ${resendAvailableAt.toISOString()}.`,
        );
      }
      await repository.delete({ identifier });
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60_000);
    const verification = repository.create({
      org: await this.dataSource.getRepository(Org).findOneBy({ id: user.orgId }),
      identifier,
      value: hashToken(token),
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    await repository.save(verification);

    return {
      email: user.email,
      verificationUrl: buildVerificationUrl(input.baseUrl, token),
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: new Date(now.getTime() + 60_000).toISOString(),
    };
  }

  async verifyEmail(input: { token: string; now?: Date }): Promise<EmailVerificationResultRow> {
    const now = input.now ?? new Date();
    const repository = this.dataSource.getRepository(Verification);
    const verification = await repository.findOneBy({ value: hashToken(input.token) });
    if (!verification) throw new AuthValidationError("Invalid or unknown verification token.");
    if (verification.expiresAt < now) throw new AuthValidationError("Verification token has expired.");

    const parsed = parseEmailVerificationIdentifier(verification.identifier);
    if (!parsed) throw new AuthValidationError("Verification token has an invalid scope.");
    const user = await this.requireUser(parsed.orgId, parsed.userId, parsed.email);
    user.emailVerified = true;
    user.emailVerifiedAt = now;
    user.updatedAt = now;
    await this.dataSource.getRepository(User).save(user);
    await repository.delete({ identifier: verification.identifier });

    return {
      userId: user.id,
      orgId: user.orgId,
      email: user.email,
      emailVerified: true,
      emailVerifiedAt: now.toISOString(),
    };
  }

  private async findUser(orgId: string, userId: string): Promise<User | null> {
    const repository = this.dataSource.getRepository(User);
    const byId = isUuid(userId) ? await repository.findOneBy({ orgId, id: userId }) : null;
    return byId ?? await repository.findOneBy({ orgId, email: userId.toLowerCase() });
  }

  private async requireUser(orgId: string, userId: string, email?: string | null): Promise<User> {
    const repository = this.dataSource.getRepository(User);
    const normalizedEmail = email?.trim().toLowerCase();
    const user = await this.findUser(orgId, userId)
      ?? (normalizedEmail ? await repository.findOneBy({ orgId, email: normalizedEmail }) : null);
    if (!user) throw new AuthValidationError("User was not found for email verification.");
    if (normalizedEmail && user.email.toLowerCase() !== normalizedEmail) {
      throw new AuthValidationError("Email does not match the authenticated user.");
    }
    return user;
  }
}

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

function emailVerificationIdentifier(orgId: string, userId: string, email: string): string {
  return `email-verification:${orgId}:${userId}:${email.toLowerCase()}`;
}

function parseEmailVerificationIdentifier(identifier: string): { orgId: string; userId: string; email: string } | null {
  const parts = identifier.split(":");
  if (parts.length < 4 || parts[0] !== "email-verification") return null;
  const [_, orgId, userId, ...emailParts] = parts;
  if (!orgId || !userId || emailParts.length === 0) return null;
  return { orgId, userId, email: emailParts.join(":") };
}

function buildVerificationUrl(baseUrl: string | null | undefined, token: string): string {
  const origin = baseUrl?.trim() || "http://localhost";
  const url = new URL("/auth/verify-email", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
