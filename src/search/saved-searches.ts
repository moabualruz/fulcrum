import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { Org } from "../db/entities/auth/Org.ts";
import { OrgMember } from "../db/entities/auth/OrgMember.ts";
import {
  SavedView,
  SAVED_VIEW_SCOPES,
  type SavedViewScope,
} from "../db/entities/tasks/SavedView.ts";
import type { AuthenticatedContext } from "@fulcrum/server/trpc/middleware.ts";

const SearchQueryJsonSchema = z.object({
  text: z.string().default(""),
  filters: z.record(z.string(), z.unknown()).default({}),
  facets: z.record(z.string(), z.array(z.string())).default({}),
});

export const SavedSearchOutputSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  projectId: z.string().nullable(),
  scope: z.enum(SAVED_VIEW_SCOPES),
  name: z.string(),
  queryJson: SearchQueryJsonSchema,
  viewType: z.literal("search"),
  createdById: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const SavedSearchCreateInputSchema = z.object({
  name: z.string().trim().min(1),
  scope: z.enum(SAVED_VIEW_SCOPES).default("private"),
  projectId: z.string().uuid().nullable().optional(),
  queryJson: SearchQueryJsonSchema.default({
    text: "",
    filters: {},
    facets: {},
  }),
  viewType: z.literal("search").optional(),
});

export const SavedSearchUpdateInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).optional(),
  scope: z.enum(SAVED_VIEW_SCOPES).optional(),
  projectId: z.string().uuid().nullable().optional(),
  queryJson: SearchQueryJsonSchema.optional(),
});

export const SavedSearchDeleteInputSchema = z.object({
  id: z.string().uuid(),
});

export type SavedSearchOutput = z.infer<typeof SavedSearchOutputSchema>;

function requireEntityManager(ctx: AuthenticatedContext) {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Saved search procedures require an EntityManager.",
    });
  }
  return ctx.em;
}

async function requireOrgMember(ctx: AuthenticatedContext): Promise<void> {
  const em = requireEntityManager(ctx);
  const membership = await em.findOne(OrgMember, {
    orgId: ctx.orgId,
    userId: ctx.userId,
  });
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Org membership required.",
    });
  }
}

async function assertScopeAllowed(
  ctx: AuthenticatedContext,
  scope: SavedViewScope,
): Promise<void> {
  if (scope === "private") return;
  await requireOrgMember(ctx);
}

function toOutput(view: SavedView): SavedSearchOutput {
  return {
    id: view.id,
    orgId: view.org.id,
    projectId: view.projectId,
    scope: view.scope,
    name: view.name,
    queryJson: SearchQueryJsonSchema.parse(view.queryJson),
    viewType: "search",
    createdById: view.createdById,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

async function findVisibleSearch(
  ctx: AuthenticatedContext,
  id: string,
): Promise<SavedView> {
  const em = requireEntityManager(ctx);
  const view = await em.findOne(SavedView, {
    id,
    org: ctx.orgId,
    viewType: "search",
  });
  if (!view) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Saved search not found.",
    });
  }

  if (view.scope === "private" && view.createdById !== ctx.userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Saved search is private.",
    });
  }
  if (view.scope !== "private") await requireOrgMember(ctx);
  return view;
}

export async function listSavedSearches(
  ctx: AuthenticatedContext,
): Promise<SavedSearchOutput[]> {
  const em = requireEntityManager(ctx);
  const membership = await em.findOne(OrgMember, {
    orgId: ctx.orgId,
    userId: ctx.userId,
  });
  const scopes: SavedViewScope[] = membership ? ["project", "org"] : [];
  const views = await em.find(
    SavedView,
    {
      org: ctx.orgId,
      viewType: "search",
      $or: [
        { scope: "private", createdById: ctx.userId },
        ...scopes.map((scope) => ({ scope })),
      ],
    },
    { orderBy: { createdAt: "asc" } },
  );
  return views.map(toOutput);
}

export async function createSavedSearch(
  ctx: AuthenticatedContext,
  input: z.infer<typeof SavedSearchCreateInputSchema>,
): Promise<SavedSearchOutput> {
  await assertScopeAllowed(ctx, input.scope);
  const em = requireEntityManager(ctx);
  const view = em.create(SavedView, {
    org: em.getReference(Org, ctx.orgId),
    projectId: input.scope === "project" ? input.projectId ?? null : null,
    scope: input.scope,
    name: input.name,
    queryJson: input.queryJson as never,
    viewType: "search",
    createdById: ctx.userId,
  });
  em.persist(view);
  await em.flush();
  return toOutput(view);
}

export async function updateSavedSearch(
  ctx: AuthenticatedContext,
  input: z.infer<typeof SavedSearchUpdateInputSchema>,
): Promise<SavedSearchOutput> {
  const view = await findVisibleSearch(ctx, input.id);
  if (view.createdById !== ctx.userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the saved search creator can update it.",
    });
  }
  if (input.scope) await assertScopeAllowed(ctx, input.scope);
  if (input.name !== undefined) view.name = input.name;
  if (input.scope !== undefined) view.scope = input.scope;
  if (input.projectId !== undefined) view.projectId = input.projectId;
  if (input.scope && input.scope !== "project") view.projectId = null;
  if (input.queryJson !== undefined) view.queryJson = input.queryJson as never;
  await requireEntityManager(ctx).flush();
  return toOutput(view);
}

export async function deleteSavedSearch(
  ctx: AuthenticatedContext,
  input: z.infer<typeof SavedSearchDeleteInputSchema>,
): Promise<{ ok: true }> {
  const view = await findVisibleSearch(ctx, input.id);
  if (view.createdById !== ctx.userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the saved search creator can delete it.",
    });
  }
  const em = requireEntityManager(ctx);
  em.remove(view);
  await em.flush();
  return { ok: true };
}
