import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  clearTaskCustomField,
  setTaskCustomField,
  TaskCustomFieldsOutputSchema,
} from "../../../application/custom-fields/commands.ts";
import {
  CustomFieldDefOutputSchema,
  listCustomFieldDefs,
  type CustomFieldAppContext,
} from "../../../application/custom-fields/queries.ts";
import { appErrorToTrpcError } from "../../../application/error-mapping.ts";
import { AppError } from "../../../application/errors.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

const ListCustomFieldDefsInputSchema = z.object({
  entityType: z.literal("task").optional(),
}).optional();

const FieldValueInputSchema = z.object({
  taskId: z.uuid(),
  fieldDefId: z.uuid(),
  value: z.unknown(),
});

const ClearFieldInputSchema = z.object({
  taskId: z.uuid(),
  fieldDefId: z.uuid(),
});

type EntityManager = import("@mikro-orm/postgresql").EntityManager;

function requireEntityManager(em: EntityManager | null): EntityManager {
  if (em) return em;

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "EntityManager could not be resolved.",
  });
}

function appContext(ctx: { orgId: string; userId: string }): CustomFieldAppContext {
  return { orgId: ctx.orgId, userId: ctx.userId };
}

async function mapAppError<T>(fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

export const customFieldDefsRouter = t.router({
  list: permissionedProcedure({ resource: "custom_fields", action: "list" })
    .input(ListCustomFieldDefsInputSchema)
    .output(z.array(CustomFieldDefOutputSchema))
    .query(async ({ ctx, input }) => {
      return mapAppError(() => listCustomFieldDefs(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),
});

export const taskCustomFieldsRouter = t.router({
  set: permissionedProcedure({ resource: "custom_fields", action: "set" })
    .input(FieldValueInputSchema)
    .output(TaskCustomFieldsOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => setTaskCustomField(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),

  clear: permissionedProcedure({ resource: "custom_fields", action: "clear" })
    .input(ClearFieldInputSchema)
    .output(TaskCustomFieldsOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => clearTaskCustomField(requireEntityManager(ctx["em"]), appContext(ctx), input));
    }),
});
