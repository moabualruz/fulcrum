/**
 * auth tRPC router — Pillar 9 (auth tRPC procedures + org management).
 *
 * Procedures:
 *   - auth.whoami        → { userId, orgId, email, role }       (protectedProcedure)
 *   - auth.invite        → { invitationId, token }              (protectedProcedure, admin/owner)
 *   - auth.acceptInvite  → { userId, orgId }                    (publicProcedure)
 *
 * Notes (from issue #09):
 *   - acceptInvite is publicProcedure — the invited user has no session yet.
 *   - Token stored HASHED in DB; plaintext returned only once at creation.
 *   - Token: crypto.randomBytes(32).toString('hex') → hashed with SHA-256.
 *   - Expiry default: 7 days.
 *
 * Web-bundle safety:
 *   All decorated classes resolved via dynamic import at call time — never as
 *   static value imports so SvelteKit SSR bundle stays clean.
 *
 * C6: No raw SQL.
 * C7: MikroORM v7 em.create / em.persistAndFlush / em.upsert / em.flush.
 * C8: Repositories resolved from ctx.container or ctx.em.
 */

import { createHash, randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { t } from "../../../trpc/trpc.ts";
import { protectedProcedure } from "../../../trpc/middleware.ts";
import { publicProcedure } from "../../../trpc/trpc.ts";
import {
  InviteInputSchema,
  AcceptInviteInputSchema,
} from "../../../trpc/schemas/auth.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Lazy entity/repo loaders (web-bundle-safe)
// ─────────────────────────────────────────────────────────────────────────────

async function getUserClass() {
  const { User } = await import("../../../db/entities/auth/User.ts");
  return User;
}

async function getUserRepository() {
  const { UserRepository } = await import(
    "../../../db/repositories/auth/UserRepository.ts"
  );
  return UserRepository;
}

async function getOrgMemberClass() {
  const { OrgMember } = await import("../../../db/entities/auth/OrgMember.ts");
  return OrgMember;
}

async function getOrgMemberRepository() {
  const { OrgMemberRepository } = await import(
    "../../../db/repositories/auth/OrgMemberRepository.ts"
  );
  return OrgMemberRepository;
}

async function getInvitationClass() {
  const { Invitation } = await import("../../../db/entities/auth/Invitation.ts");
  return Invitation;
}

async function getInvitationRepository() {
  const { InvitationRepository } = await import(
    "../../../db/repositories/auth/InvitationRepository.ts"
  );
  return InvitationRepository;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Hash a plaintext token with SHA-256 for storage. */
function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

type CtxWithEm = {
  em: import("@mikro-orm/postgresql").EntityManager | null;
  container: import("@needle-di/core").Container | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveRepo<T>(ctx: CtxWithEm, RepoClass: new (...args: any[]) => T): Promise<T | null> {
  if (ctx.container) {
    try {
      return ctx.container.get(RepoClass) as T;
    } catch {
      // fallthrough to em
    }
  }
  return null;
}

async function requireOwnerOrAdmin(ctx: CtxWithEm & { orgId: string | null; userId: string | null }): Promise<void> {
  if (!ctx.orgId || !ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Session is missing orgId or userId. Re-authenticate.",
    });
  }

  const OrgMember = await getOrgMemberClass();
  const OrgMemberRepository = await getOrgMemberRepository();
  const orgMemberRepo = await resolveRepo(ctx, OrgMemberRepository);
  let membership: { role: string } | null = null;
  if (orgMemberRepo) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    membership = await (orgMemberRepo as any).findOne({ orgId: ctx.orgId, userId: ctx.userId });
  } else if (ctx.em) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    membership = await ctx.em.findOne(OrgMember, { orgId: ctx.orgId, userId: ctx.userId } as any);
  } else {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "OrgMember repository could not be resolved.",
    });
  }

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only org owners and admins can invite members.",
    });
  }
}

async function requireEm(ctx: CtxWithEm) {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager not available in tRPC context.",
    });
  }
  return ctx.em;
}

// ─────────────────────────────────────────────────────────────────────────────
// auth router
// ─────────────────────────────────────────────────────────────────────────────

export const authRouter = t.router({
  /**
   * auth.whoami — returns current user + org info from session.
   * Looks up the User row to get email + role when em is available.
   * Falls back to session-only data (no email/role) when em is null (e.g. test stubs).
   */
  whoami: protectedProcedure.query(async ({ ctx }) => {
    // Base response from session (always available after assertPermission)
    const base = {
      userId: ctx.userId,
      orgId: ctx.orgId,
      sessionId: ctx.session.id,
      email: null as string | null,
      role: null as string | null,
    };

    if (!ctx.em) {
      return base;
    }

    const User = await getUserClass();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await ctx.em.findOne(User, { id: ctx.userId } as any);
    if (!user) {
      return base;
    }

    return {
      ...base,
      email: (user as { email: string }).email,
      role: (user as { role: string }).role,
    };
  }),

  /**
   * auth.invite — create an Invitation row + return plaintext token.
   * Admin/owner only. Token stored HASHED; plaintext returned once.
   */
  invite: protectedProcedure
    .input(InviteInputSchema)
    .mutation(async ({ ctx, input }) => {
      // ── Authorization: owner or admin only ────────────────────────────────
      await requireOwnerOrAdmin(ctx);

      const em = await requireEm(ctx);
      const Invitation = await getInvitationClass();

      // ── Generate + hash token ─────────────────────────────────────────────
      const plaintext = randomBytes(32).toString("hex");
      const tokenHash = hashToken(plaintext);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

      // ── Persist ───────────────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invitation = em.create(Invitation, {
        orgId: ctx.orgId,
        email: input.email,
        role: input.role,
        token: tokenHash,
        invitedById: ctx.userId,
        expiresAt,
        createdAt: new Date(),
      } as any);
      em.persist(invitation);
      await em.flush();

      return {
        invitationId: (invitation as { id: string }).id,
        token: plaintext,
      };
    }),

  /**
   * auth.acceptInvite — publicProcedure (no session required).
   * Validates plaintext token → creates/links user → creates OrgMember row.
   */
  acceptInvite: publicProcedure
    .input(AcceptInviteInputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = await requireEm(ctx);
      const Invitation = await getInvitationClass();
      const User = await getUserClass();
      const OrgMember = await getOrgMemberClass();

      const tokenHash = hashToken(input.token);

      // ── Find invitation ───────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invitation = await em.findOne(Invitation, { token: tokenHash } as any);
      if (!invitation) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or unknown invitation token.",
        });
      }

      const inv = invitation as {
        id: string;
        orgId: string;
        email: string;
        role: string;
        expiresAt: Date;
        acceptedAt?: Date;
      };

      // ── Validate expiry ───────────────────────────────────────────────────
      if (new Date() > inv.expiresAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invitation token has expired.",
        });
      }

      // ── Validate not already accepted ─────────────────────────────────────
      if (inv.acceptedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invitation token has already been used.",
        });
      }

      // ── Upsert user ───────────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let user = await em.findOne(User, { email: inv.email, orgId: inv.orgId } as any);
      if (!user) {
        user = em.create(User, {
          orgId: inv.orgId,
          email: inv.email,
          name: input.name ?? null,
          role: inv.role as "owner" | "admin" | "member" | "guest",
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any);
        em.persist(user);
        await em.flush();
      }

      const u = user as { id: string };

      // ── Create OrgMember row ──────────────────────────────────────────────
      // Check if membership already exists (idempotent)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await em.findOne(OrgMember, { orgId: inv.orgId, userId: u.id } as any);
      if (!existing) {
        const member = em.create(OrgMember, {
          orgId: inv.orgId,
          userId: u.id,
          role: inv.role,
          joinedAt: new Date(),
        } as any);
        em.persist(member);
      }

      // ── Mark invitation accepted ──────────────────────────────────────────
      (invitation as { acceptedAt: Date }).acceptedAt = new Date();
      await em.flush();

      return {
        userId: u.id,
        orgId: inv.orgId,
      };
    }),
});
