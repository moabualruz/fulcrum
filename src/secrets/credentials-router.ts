/**
 * credentials tRPC router — Pillar 17 (Issue 02 secrets vault).
 *
 * Procedures (all protectedProcedure → assertPermission session check):
 *   - list({ includeArchived? })           → list rows scoped to ctx.orgId
 *   - get({ name, userId? })               → plaintext value (auth-scoped)
 *   - set({ name, value })                 → upsert ciphertext for caller
 *   - rotate({ name, newValue })           → re-encrypt + bump last_used_at
 *   - archive({ name })                    → archived=true (hidden by default)
 *   - remove({ name })                     → delete row
 *
 * Authorization rules (Issue 02):
 *   - Only the credential owner OR an org admin/owner may `get`, `rotate`,
 *     `archive`, `remove` someone else's credential within the same org.
 *   - `set` always targets the caller's userId.
 *   - `list` returns only the caller's credentials by default; admins/owners
 *     may pass `userId` to scope to another user. (Future: org-wide listing
 *     once a `scope=org` flag is wired through; this slice keeps it scoped.)
 *
 * Plaintext discipline:
 *   - The plaintext `value` appears only in the response body of `get`.
 *   - `Event.payload` / telemetry MUST NOT be passed the value here (no logger
 *     call inside this router emits the value or ciphertext).
 *
 * Web-bundle safety: all entity/repo imports lazy via dynamic import().
 *
 * Closes (issue): .scratch/agent-os-vision/17-cross-cutting-platform/issues/02-secrets-keyring-and-vault.md
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { t } from "../trpc/trpc.ts";
import { protectedProcedure } from "../trpc/middleware.ts";
import {
  ALGO_LABEL,
  KDF_LABEL,
  decrypt,
  encrypt,
} from "./vault.ts";
import {
  loadOrCreateMasterKey,
  requireMasterKey,
  SecretsKeyringToken,
  type KeyringConfig,
} from "./keyring.ts";

const NAME = z.string().min(1).max(255);

const SetInput = z.object({ name: NAME, value: z.string().min(1) });
const GetInput = z.object({ name: NAME, userId: z.string().uuid().optional() });
const NameInput = z.object({ name: NAME, userId: z.string().uuid().optional() });
const RotateInput = z.object({
  name: NAME,
  newValue: z.string().min(1),
  userId: z.string().uuid().optional(),
});
const ListInput = z
  .object({ includeArchived: z.boolean().optional() })
  .optional();

const RowOutput = z.object({
  id: z.string(),
  name: z.string(),
  archived: z.boolean(),
  provider: z.string(),
  algo: z.string(),
  kdf: z.string(),
  lastUsedAt: z.date().nullable(),
  createdAt: z.date(),
});

const SetOutput = z.object({ id: z.string(), name: z.string() });
const GetOutput = z.object({ name: z.string(), value: z.string() });
const OkOutput = z.object({ ok: z.literal(true) });

async function getCredentialClass() {
  const { Credential } = await import("../db/entities/platform/Credential.ts");
  return Credential;
}

async function getOrgMemberClass() {
  const { OrgMember } = await import("../db/entities/auth/OrgMember.ts");
  return OrgMember;
}

async function getOrgMemberRepository() {
  const { OrgMemberRepository } = await import(
    "../db/repositories/auth/OrgMemberRepository.ts"
  );
  return OrgMemberRepository;
}

async function getOrgClass() {
  const { Org } = await import("../db/entities/auth/Org.ts");
  return Org;
}

async function getUserClass() {
  const { User } = await import("../db/entities/auth/User.ts");
  return User;
}

type Ctx = {
  em: import("@mikro-orm/postgresql").EntityManager | null;
  container: import("@needle-di/core").Container | null;
  orgId: string;
  userId: string;
};

function requireEm(ctx: { em: Ctx["em"] }): import("@mikro-orm/postgresql").EntityManager {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager not available in tRPC context.",
    });
  }
  return ctx.em;
}

function resolveKeyringConfig(ctx: { container: Ctx["container"] }): KeyringConfig {
  if (ctx.container) {
    try {
      const v = ctx.container.get(SecretsKeyringToken) as
        | KeyringConfig
        | undefined;
      if (v) return v;
    } catch {
      // not bound — fall through
    }
  }
  return {};
}

async function findCallerMembership(ctx: Ctx): Promise<{ role: string } | null> {
  const OrgMember = await getOrgMemberClass();
  const OrgMemberRepository = await getOrgMemberRepository();

  let row: { role: string } | null = null;
  if (ctx.container) {
    try {
      const repo = ctx.container.get(OrgMemberRepository);
      row = (await (repo as unknown as {
        findOne: (q: object) => Promise<{ role: string } | null>;
      }).findOne({ orgId: ctx.orgId, userId: ctx.userId })) as {
        role: string;
      } | null;
    } catch {
      row = null;
    }
  }
  if (!row && ctx.em) {
    row = (await ctx.em.findOne(OrgMember, {
      orgId: ctx.orgId,
      userId: ctx.userId,
    } as object)) as { role: string } | null;
  }
  return row;
}

async function requireActiveMembership(ctx: Ctx): Promise<{ role: string }> {
  const membership = await findCallerMembership(ctx);
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Active org membership required for credential access.",
    });
  }
  return membership;
}

async function assertCanAct(ctx: Ctx, targetUserId: string): Promise<void> {
  const membership = await requireActiveMembership(ctx);
  if (targetUserId === ctx.userId) return;
  if (membership.role === "owner" || membership.role === "admin") return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Only the credential owner or an org admin may operate on this credential.",
  });
}

async function findCred(
  em: import("@mikro-orm/postgresql").EntityManager,
  orgId: string,
  userId: string,
  name: string,
) {
  const Credential = await getCredentialClass();
  return em.findOne(Credential, { org: orgId, user: userId, name } as object) as Promise<
    | (import("../db/entities/platform/Credential.ts").Credential & {
        org: { id: string };
        user: { id: string };
      })
    | null
  >;
}

function rowFor(c: {
  id: string;
  name: string;
  archived: boolean;
  provider: string;
  algo: string;
  kdf: string;
  lastUsedAt?: Date | null;
  createdAt: Date;
}) {
  return {
    id: c.id,
    name: c.name,
    archived: c.archived,
    provider: c.provider,
    algo: c.algo,
    kdf: c.kdf,
    lastUsedAt: c.lastUsedAt ?? null,
    createdAt: c.createdAt,
  };
}

export const credentialsRouter = t.router({
  list: protectedProcedure
    .input(ListInput)
    .output(z.array(RowOutput))
    .query(async ({ ctx, input }) => {
      await requireActiveMembership(ctx as Ctx);
      const em = requireEm(ctx);
      const Credential = await getCredentialClass();
      const where: Record<string, unknown> = {
        org: ctx.orgId,
        user: ctx.userId,
      };
      if (!input?.includeArchived) where.archived = false;
      const rows = (await em.find(Credential, where as object, {
        orderBy: { createdAt: "DESC" } as object,
      })) as Array<Parameters<typeof rowFor>[0]>;
      return rows.map(rowFor);
    }),

  get: protectedProcedure
    .input(GetInput)
    .output(GetOutput)
    .query(async ({ ctx, input }) => {
      const targetUserId = input.userId ?? ctx.userId;
      await assertCanAct(ctx as Ctx, targetUserId);
      const em = requireEm(ctx);
      const cred = await findCred(em, ctx.orgId, targetUserId, input.name);
      if (!cred) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Credential '${input.name}' not found.`,
        });
      }
      const cfg = resolveKeyringConfig(ctx);
      const { key } = await requireMasterKey(cfg);
      const plain = decrypt(key, new Uint8Array(cred.encryptedValue));
      return { name: cred.name, value: new TextDecoder().decode(plain) };
    }),

  set: protectedProcedure
    .input(SetInput)
    .output(SetOutput)
    .mutation(async ({ ctx, input }) => {
      await requireActiveMembership(ctx as Ctx);
      const em = requireEm(ctx);
      const Credential = await getCredentialClass();
      const cfg = resolveKeyringConfig(ctx);
      const { key } = await loadOrCreateMasterKey(cfg);
      const ct = encrypt(key, input.value);

      const existing = await findCred(em, ctx.orgId, ctx.userId, input.name);
      if (existing) {
        existing.encryptedValue = Buffer.from(ct);
        existing.algo = ALGO_LABEL;
        existing.kdf = KDF_LABEL;
        await em.flush();
        return { id: existing.id, name: existing.name };
      }
      const Org = await getOrgClass();
      const User = await getUserClass();
      const created = em.create(Credential, {
        org: em.getReference(Org, ctx.orgId),
        user: em.getReference(User, ctx.userId),
        name: input.name,
        encryptedValue: Buffer.from(ct),
        algo: ALGO_LABEL,
        kdf: KDF_LABEL,
        provider: "local",
        archived: false,
        createdAt: new Date(),
      } as any);
      em.persist(created);
      await em.flush();
      return { id: (created as { id: string }).id, name: input.name };
    }),

  rotate: protectedProcedure
    .input(RotateInput)
    .output(OkOutput)
    .mutation(async ({ ctx, input }) => {
      const targetUserId = input.userId ?? ctx.userId;
      await assertCanAct(ctx as Ctx, targetUserId);
      const em = requireEm(ctx);
      const cred = await findCred(em, ctx.orgId, targetUserId, input.name);
      if (!cred) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Credential '${input.name}' not found.`,
        });
      }
      const cfg = resolveKeyringConfig(ctx);
      const { key } = await loadOrCreateMasterKey(cfg);
      cred.encryptedValue = Buffer.from(encrypt(key, input.newValue));
      cred.algo = ALGO_LABEL;
      cred.kdf = KDF_LABEL;
      cred.lastUsedAt = new Date();
      await em.flush();
      return { ok: true as const };
    }),

  archive: protectedProcedure
    .input(NameInput)
    .output(OkOutput)
    .mutation(async ({ ctx, input }) => {
      const targetUserId = input.userId ?? ctx.userId;
      await assertCanAct(ctx as Ctx, targetUserId);
      const em = requireEm(ctx);
      const cred = await findCred(em, ctx.orgId, targetUserId, input.name);
      if (!cred) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Credential '${input.name}' not found.`,
        });
      }
      cred.archived = true;
      await em.flush();
      return { ok: true as const };
    }),

  remove: protectedProcedure
    .input(NameInput)
    .output(OkOutput)
    .mutation(async ({ ctx, input }) => {
      const targetUserId = input.userId ?? ctx.userId;
      await assertCanAct(ctx as Ctx, targetUserId);
      const em = requireEm(ctx);
      const cred = await findCred(em, ctx.orgId, targetUserId, input.name);
      if (!cred) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Credential '${input.name}' not found.`,
        });
      }
      em.remove(cred);
      await em.flush();
      return { ok: true as const };
    }),

});

export type CredentialsRouter = typeof credentialsRouter;
