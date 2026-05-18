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
import { Session } from "@identity-access/infrastructure/database/entities/auth/Session.ts";
import {
  WorkflowAuditEventEntity,
  type WorkflowAuditEvent,
} from "@workflow-coordination/infrastructure/database/audit-log.entities.ts";
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

export interface AuthSessionListInput {
  orgId: string;
  userId: string;
  currentSessionId?: string | null;
  now?: Date;
}

export interface AuthManagedSessionRow {
  id: string;
  userId: string;
  orgId: string;
  deviceType: string;
  browser: string;
  ipAddress: string | null;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface AuthSessionRevocationRow {
  revokedSessionIds: string[];
  audit: Array<{
    action: "auth.session.revoked";
    actorId: string;
    sessionId: string;
    deviceType: string;
    browser: string;
    ipAddress: string | null;
    revokedAt: string;
  }>;
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
      org: null,
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

  async listSessions(input: AuthSessionListInput): Promise<AuthManagedSessionRow[]> {
    const now = input.now ?? new Date();
    const rows = await this.dataSource.getRepository(Session).find({
      where: { orgId: input.orgId, userId: input.userId },
      order: { createdAt: "DESC" },
    });
    return rows
      .filter((session) => session.expiresAt >= now)
      .map((session) => this.mapManagedSession(session, input.currentSessionId));
  }

  async revokeSession(input: AuthSessionListInput & { sessionId: string }): Promise<AuthSessionRevocationRow> {
    if (input.currentSessionId && input.sessionId === input.currentSessionId) {
      throw new AuthValidationError("Current session cannot be revoked from session management.");
    }
    const repository = this.dataSource.getRepository(Session);
    const session = await repository.findOneBy({
      id: input.sessionId,
      orgId: input.orgId,
      userId: input.userId,
    });
    if (!session) throw new AuthValidationError("Session was not found.");
    await repository.delete({ id: session.id, orgId: input.orgId, userId: input.userId });
    return await this.revocationResult(input.userId, [this.mapManagedSession(session, input.currentSessionId)]);
  }

  async revokeOtherSessions(input: AuthSessionListInput): Promise<AuthSessionRevocationRow> {
    const sessions = await this.listSessions(input);
    const targets = sessions.filter((session) => !session.isCurrent);
    if (targets.length === 0) return { revokedSessionIds: [], audit: [] };
    await this.dataSource.getRepository(Session).delete(targets.map((session) => session.id));
    return await this.revocationResult(input.userId, targets);
  }

  private mapManagedSession(session: Session, currentSessionId?: string | null): AuthManagedSessionRow {
    const browser = browserFromUserAgent(session.userAgent);
    return {
      id: session.id,
      userId: session.userId,
      orgId: session.orgId,
      deviceType: deviceTypeFromUserAgent(session.userAgent),
      browser,
      ipAddress: anonymizeIp(session.ipAddress),
      lastActiveAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      isCurrent: Boolean(currentSessionId && session.id === currentSessionId),
    };
  }

  private async revocationResult(actorId: string, sessions: AuthManagedSessionRow[]): Promise<AuthSessionRevocationRow> {
    const revokedAt = new Date().toISOString();
    const audit = sessions.map((session) => ({
      action: "auth.session.revoked" as const,
      actorId,
      sessionId: session.id,
      deviceType: session.deviceType,
      browser: session.browser,
      ipAddress: session.ipAddress,
      revokedAt,
    }));
    if (sessions.length > 0) {
      const repository = this.dataSource.getRepository<WorkflowAuditEvent>(WorkflowAuditEventEntity);
      await repository.save(sessions.map((session) => ({
        id: randomUUID(),
        orgId: session.orgId,
        projectId: null,
        userId: actorId,
        verb: "auth.session.revoked",
        subjectKind: "auth.session",
        subjectId: session.id,
        payload: {
          deviceType: session.deviceType,
          browser: session.browser,
          ipAddress: session.ipAddress,
          revokedAt,
        },
        traceId: null,
      })));
    }
    return { revokedSessionIds: sessions.map((session) => session.id), audit };
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

function deviceTypeFromUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent?.toLowerCase() ?? "";
  if (ua.includes("mobile") || ua.includes("iphone") || ua.includes("android")) return "mobile";
  if (ua.includes("ipad") || ua.includes("tablet")) return "tablet";
  if (ua.includes("bot")) return "automation";
  return "desktop";
}

function browserFromUserAgent(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) return "Chrome";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return "Safari";
  if (/curl\//i.test(ua)) return "curl";
  return "Unknown";
}

function anonymizeIp(ipAddress: string | null | undefined): string | null {
  if (!ipAddress) return null;
  if (ipAddress.includes(".")) {
    const parts = ipAddress.split(".");
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
  }
  if (ipAddress.includes(":")) {
    return `${ipAddress.split(":").slice(0, 4).join(":")}::`;
  }
  return null;
}
