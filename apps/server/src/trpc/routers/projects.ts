import { z } from "zod";

import {
  createProject,
  createProjectFromSetup,
  deleteProject,
  updateProject,
  updateProjectToolPermissionMode,
} from "@work-management/application/projects/commands.ts";
import { getProjectOrNull, listProjectRows, loadProjectOverview } from "@work-management/application/projects/queries.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";
import { requireTrpcEntityManager, type TRPCContext } from "../context.ts";
import { permissionedProcedure } from "../middleware.ts";
import { t } from "../trpc.ts";

const IdInputSchema = z.object({ id: z.string().min(1) });
const ProjectCreateSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  description: z.string().nullish(),
  parentId: z.string().min(1).nullish(),
  kind: z.enum(["workspace", "project", "subproject"]).optional(),
  repoPath: z.string().min(1).optional(),
  template: z.string().min(1).optional(),
});
const ProjectUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().nullish(),
});
const ToolPermissionModeSchema = z.enum(["review_each_tool", "auto", "danger"]);

function appContext(ctx: TRPCContext, projectId?: string | null): AppContext {
  return {
    orgId: ctx.orgId ?? "",
    userId: ctx.userId,
    projectId: projectId ?? null,
  };
}

export const projectsRouter = t.router({
  list: permissionedProcedure({ resource: "projects", action: "list" })
    .input(z.object({}).optional())
    .query(async ({ ctx }) => listProjectRows(requireTrpcEntityManager(ctx), appContext(ctx))),

  get: permissionedProcedure({ resource: "projects", action: "get" })
    .input(IdInputSchema)
    .query(async ({ ctx, input }) => getProjectOrNull(requireTrpcEntityManager(ctx), appContext(ctx, input.id), input.id)),

  create: permissionedProcedure({ resource: "projects", action: "create" })
    .input(ProjectCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireTrpcEntityManager(ctx);
      if (input.repoPath || input.template) {
        return createProjectFromSetup(em, appContext(ctx), {
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          parentId: input.parentId ?? null,
          kind: input.kind,
          repoPath: input.repoPath,
          template: input.template,
          trustMode: "manual",
        });
      }
      return createProject(em, appContext(ctx), {
        name: input.name,
        slug: input.slug ?? input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        description: input.description ?? null,
        parentId: input.parentId ?? null,
        kind: input.kind,
      });
    }),

  update: permissionedProcedure({ resource: "projects", action: "update" })
    .input(ProjectUpdateSchema)
    .mutation(async ({ ctx, input }) => updateProject(requireTrpcEntityManager(ctx), appContext(ctx, input.id), input)),

  updateToolPermissionMode: permissionedProcedure({ resource: "projects", action: "update" })
    .input(z.object({ id: z.string().min(1), permissionMode: ToolPermissionModeSchema }))
    .mutation(async ({ ctx, input }) =>
      updateProjectToolPermissionMode(requireTrpcEntityManager(ctx), appContext(ctx, input.id), input)
    ),

  delete: permissionedProcedure({ resource: "projects", action: "delete" })
    .input(IdInputSchema)
    .mutation(async ({ ctx, input }) => deleteProject(requireTrpcEntityManager(ctx), appContext(ctx, input.id), input.id)),

  stats: permissionedProcedure({ resource: "projects", action: "stats" })
    .input(IdInputSchema)
    .query(async ({ ctx, input }) => {
      const overview = await loadProjectOverview(requireTrpcEntityManager(ctx), appContext(ctx, input.id), input.id, { includeDescendants: true });
      return overview?.summary ?? {};
    }),
});
