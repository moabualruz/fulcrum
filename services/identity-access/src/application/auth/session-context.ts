import { createHash, randomBytes } from "node:crypto";
import type { EntityManager } from "@mikro-orm/postgresql";

import { Account } from "@platform-core/infrastructure/application-database/entities/auth/Account.ts";
import { Invitation } from "@platform-core/infrastructure/application-database/entities/auth/Invitation.ts";
import { Org } from "@platform-core/infrastructure/application-database/entities/auth/Org.ts";
import { OrgMember } from "@platform-core/infrastructure/application-database/entities/auth/OrgMember.ts";
import { User } from "@platform-core/infrastructure/application-database/entities/auth/User.ts";
import {
  AppForbiddenError,
  AppInvariantError,
  AppValidationError,
} from "@platform-core/domain/errors.ts";
import type {
  AcceptInviteInput,
  AcceptInviteOutput,
  AuthApplicationContext,
  InviteInput,
  InviteOutput,
  SessionContextDto,
} from "@identity-access/domain/identity.ts";

export async function resolveApplicationSessionContext(
  em: EntityManager | null,
  ctx: AuthApplicationContext,
): Promise<SessionContextDto> {
  const base = {
    userId: ctx.userId,
    orgId: ctx.orgId,
    sessionId: ctx.session.id,
    email: null,
    role: null,
  };

  if (!em) return base;

  const user = await em.findOne(User, { id: ctx.userId } as never);
  if (!user) return base;

  const [org, passkeyCount] = await Promise.all([
    em.findOne(Org, { id: ctx.orgId } as never),
    hasEntityMetadata(em, "Account")
      ? em.count(Account, { userId: ctx.userId, providerId: "passkey" } as never)
      : Promise.resolve(0),
  ]);

  return {
    ...base,
    email: user.email,
    role: user.role,
    orgName: org?.name ?? ctx.orgId,
    passkeyCount,
  };
}

export async function createInvitation(
  em: EntityManager,
  ctx: AuthApplicationContext,
  input: InviteInput,
): Promise<InviteOutput> {
  await requireInvitePermission(em, ctx, input.role);

  const plaintext = randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const invitation = em.create(Invitation, {
    orgId: ctx.orgId,
    email: input.email,
    role: input.role,
    token: hashToken(plaintext),
    invitedById: ctx.userId,
    expiresAt,
    createdAt: new Date(),
  } as never);
  em.persist(invitation);
  await em.flush();

  return {
    invitationId: invitation.id,
    token: plaintext,
  };
}

export async function acceptInvitation(
  em: EntityManager,
  input: AcceptInviteInput,
): Promise<AcceptInviteOutput> {
  const invitation = await em.findOne(Invitation, { token: hashToken(input.token) } as never);
  if (!invitation) throw new AppValidationError("Invalid or unknown invitation token.");

  const inv = invitation as Invitation & {
    orgId: string;
    email: string;
    role: "owner" | "admin" | "member" | "guest";
    expiresAt: Date;
    acceptedAt?: Date;
  };

  if (new Date() > inv.expiresAt) throw new AppValidationError("Invitation token has expired.");
  if (inv.acceptedAt) throw new AppValidationError("Invitation token has already been used.");

  let user = await em.findOne(User, { email: inv.email, orgId: inv.orgId } as never);
  if (!user) {
    user = em.create(User, {
      orgId: inv.orgId,
      email: inv.email,
      name: input.name ?? null,
      role: inv.role,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    em.persist(user);
    await em.flush();
  }

  const existing = await em.findOne(OrgMember, { orgId: inv.orgId, userId: user.id } as never);
  if (!existing) {
    em.persist(em.create(OrgMember, {
      orgId: inv.orgId,
      userId: user.id,
      role: inv.role,
      joinedAt: new Date(),
    } as never));
  }

  (invitation as { acceptedAt: Date }).acceptedAt = new Date();
  await em.flush();

  return {
    userId: user.id,
    orgId: inv.orgId,
  };
}

function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

async function requireInvitePermission(
  em: EntityManager,
  ctx: AuthApplicationContext,
  invitedRole: InviteInput["role"],
): Promise<void> {
  const membership = await em.findOne(OrgMember, { orgId: ctx.orgId, userId: ctx.userId } as never);
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new AppForbiddenError("Only org owners and admins can invite members.");
  }

  if (membership.role === "admin" && (invitedRole === "owner" || invitedRole === "admin")) {
    throw new AppForbiddenError("Only org owners can invite owners and admins.");
  }
}

function hasEntityMetadata(em: EntityManager, entityName: string): boolean {
  try {
    const metadata = em.getMetadata() as unknown as {
      find?: (name: string) => unknown;
      get?: (name: string) => unknown;
    };
    return Boolean(metadata.find?.(entityName) ?? metadata.get?.(entityName));
  } catch {
    return false;
  }
}

export function requireAuthEntityManager(em: EntityManager | null): EntityManager {
  if (em) return em;
  throw new AppInvariantError("OrgMember repository could not be resolved.");
}
