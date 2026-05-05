/**
 * Memories sub-router — Plan 06-06 (Pillar 10)
 *
 * Real CRUD + promote + search procedures delegating to MemoryService.
 * C8: needle-di Container pattern; service resolved from ctx.container.
 *
 * T-06-13: org_id filter enforced in MemoryService on all queries.
 * T-06-14: promote guarded by permissionedProcedure write permission + orgId ownership.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { t } from "../trpc.ts";
import { permissionedProcedure } from "../middleware.ts";
import { MemoryService } from "../../memory/memory-service.ts";
import type { TRPCContext } from "../context.ts";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const MemoryImportanceSchema = z.enum(["low", "medium", "high"]);
const MemoryKindSchema = z.enum([
  "note",
  "decision",
  "blocker",
  "file_ref",
  "section_anchor",
  "link",
  "fact",
]);

const ListMemoriesInputSchema = z.object({
  projectId: z.string().optional(),
});

const GetMemoryInputSchema = z.object({
  id: z.string(),
});

const SearchMemoriesInputSchema = z.object({
  term: z.string(),
  projectId: z.string(),
});

const CreateMemoryInputSchema = z.object({
  body: z.string().min(1),
  projectId: z.string().optional(),
  importance: MemoryImportanceSchema.default("medium"),
  kind: MemoryKindSchema.default("note"),
  tags: z.array(z.string()).optional(),
});

const PromoteMemoryInputSchema = z.object({
  id: z.string(),
});

const DeleteMemoryInputSchema = z.object({
  id: z.string(),
});

// ---------------------------------------------------------------------------
// Service resolver (C8 needle-di container pattern)
// ---------------------------------------------------------------------------

function memoryService(ctx: TRPCContext): MemoryService {
  const svc = ctx.container?.get(MemoryService) as MemoryService | undefined;
  if (!svc) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "MemoryService not available in container.",
    });
  }
  return svc;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const memoriesRouter = t.router({
  /** list — returns project-scoped + global memories */
  list: permissionedProcedure({ resource: "memories", action: "list" })
    .input(ListMemoriesInputSchema)
    .query(async ({ ctx, input }) => {
      const svc = memoryService(ctx);
      return svc.list(ctx.orgId, input.projectId ?? "");
    }),

  /** get — fetch a single memory by ID */
  get: permissionedProcedure({ resource: "memories", action: "get" })
    .input(GetMemoryInputSchema)
    .query(async ({ ctx, input }) => {
      const svc = memoryService(ctx);
      const memory = await svc.get(ctx.orgId, input.id);
      if (!memory) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Memory not found." });
      }
      return memory;
    }),

  /** search — FTS with project>global ranking (D-24) */
  search: permissionedProcedure({ resource: "memories", action: "search" })
    .input(SearchMemoriesInputSchema)
    .query(async ({ ctx, input }) => {
      const svc = memoryService(ctx);
      return svc.search(ctx.orgId, input.term, input.projectId);
    }),

  /** create — persist a new memory */
  create: permissionedProcedure({ resource: "memories", action: "create" })
    .input(CreateMemoryInputSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = memoryService(ctx);
      return svc.create(ctx.orgId, {
        body: input.body,
        projectId: input.projectId ?? null,
        importance: input.importance,
        kind: input.kind,
        source: "manual",
        tags: input.tags ?? [],
      });
    }),

  /** promote — set global=true, preserve projectId per D-27 */
  promote: permissionedProcedure({ resource: "memories", action: "promote" })
    .input(PromoteMemoryInputSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = memoryService(ctx);
      await svc.promote(input.id, ctx.orgId);
    }),

  /** delete — soft-delete (archive) memory */
  delete: permissionedProcedure({ resource: "memories", action: "delete" })
    .input(DeleteMemoryInputSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = memoryService(ctx);
      await svc.delete(ctx.orgId, input.id);
    }),
});

export type MemoriesRouter = typeof memoriesRouter;
