import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { CustomFieldDef, CustomFieldConfigSchema } from "../../../db/entities/tasks/CustomFieldDef.ts";
import { Task } from "../../../db/entities/tasks/Task.ts";
import { protectedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

const FieldTypeSchema = z.enum([
  "text",
  "boolean",
  "select",
  "multi_select",
  "number",
  "date",
  "user",
  "url",
  "json",
]);

const CustomFieldDefOutputSchema = z.object({
  id: z.uuid(),
  orgId: z.string().regex(/^[0-9a-fA-F-]{36}$/),
  projectId: z.uuid(),
  entityType: z.literal("task"),
  name: z.string(),
  slug: z.string(),
  type: FieldTypeSchema,
  configJson: z.record(z.string(), z.unknown()),
  required: z.boolean(),
  archived: z.boolean(),
  position: z.number().int(),
});

const TaskCustomFieldsOutputSchema = z.object({
  taskId: z.uuid(),
  customFields: z.record(z.string(), z.unknown()),
});

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

function resolveEntityManager(ctx: { em: EntityManager | null }): EntityManager {
  if (ctx.em) return ctx.em;

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "EntityManager could not be resolved.",
  });
}

function serializeFieldDef(field: CustomFieldDef): z.infer<typeof CustomFieldDefOutputSchema> {
  return {
    id: field.id,
    orgId: field.org.id,
    projectId: field.projectId,
    entityType: "task",
    name: field.name,
    slug: field.slug,
    type: field.type,
    configJson: field.configJson,
    required: field.required,
    archived: field.archived,
    position: field.position,
  };
}

async function findFieldDef(
  em: EntityManager,
  orgId: string,
  id: string,
): Promise<CustomFieldDef | null> {
  return em.findOne(CustomFieldDef, { id, org: orgId, archived: false } as never);
}

async function findTask(em: EntityManager, orgId: string, id: string): Promise<Task | null> {
  return em.findOne(Task, { id, org: orgId, deletedAt: null } as never);
}

function failValidation(field: CustomFieldDef, reason: string): never {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Invalid value for custom field ${field.slug}: ${reason}.`,
  });
}

function assertRequiredValue(field: CustomFieldDef, value: unknown): void {
  if (!field.required) return;
  if (value === null || value === undefined) {
    failValidation(field, "required value missing");
  }
  if (typeof value === "string" && value.trim() === "") {
    failValidation(field, "required value missing");
  }
  if (Array.isArray(value) && value.length === 0) {
    failValidation(field, "required value missing");
  }
}

function selectOptions(field: CustomFieldDef): Set<string> {
  const parsed = CustomFieldConfigSchema.safeParse({
    type: field.type,
    ...field.configJson,
  });
  if (!parsed.success || !("options" in parsed.data)) return new Set();
  return new Set(parsed.data.options.map((option) => option.value));
}

function validateValue(field: CustomFieldDef, value: unknown): unknown {
  assertRequiredValue(field, value);
  if (value === null || value === undefined || value === "") return value;

  switch (field.type as CustomFieldDef["type"] | "boolean") {
    case "text":
    case "url":
    case "user":
      if (typeof value !== "string") failValidation(field, "expected string");
      return value;
    case "boolean":
      if (typeof value !== "boolean") failValidation(field, "expected boolean");
      return value;
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        failValidation(field, "expected number");
      }
      const config = CustomFieldConfigSchema.parse({ type: "number", ...field.configJson });
      if ("min" in config && config.min !== undefined && value < config.min) {
        failValidation(field, `must be at least ${config.min}`);
      }
      if ("max" in config && config.max !== undefined && value > config.max) {
        failValidation(field, `must be at most ${config.max}`);
      }
      return value;
    }
    case "date":
      if (
        typeof value !== "string" ||
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isNaN(Date.parse(value)))
      ) {
        failValidation(field, "expected date string");
      }
      return value;
    case "select": {
      if (typeof value !== "string") failValidation(field, "expected option value");
      if (!selectOptions(field).has(value)) failValidation(field, "unknown option");
      return value;
    }
    case "multi_select": {
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        failValidation(field, "expected option value array");
      }
      const options = selectOptions(field);
      for (const item of value) {
        if (!options.has(item)) failValidation(field, "unknown option");
      }
      return value;
    }
    case "json":
      return value;
  }
}

export const customFieldDefsRouter = t.router({
  list: protectedProcedure
    .input(ListCustomFieldDefsInputSchema)
    .output(z.array(CustomFieldDefOutputSchema))
    .query(async ({ ctx, input }) => {
      if (input?.entityType && input.entityType !== "task") return [];
      const em = resolveEntityManager(ctx);
      const fields = await em.find(
        CustomFieldDef,
        { org: ctx.orgId, archived: false } as never,
        { orderBy: { position: "ASC", name: "ASC", id: "ASC" } },
      );
      return fields.map(serializeFieldDef);
    }),
});

export const taskCustomFieldsRouter = t.router({
  set: protectedProcedure
    .input(FieldValueInputSchema)
    .output(TaskCustomFieldsOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const em = resolveEntityManager(ctx);
      const [task, field] = await Promise.all([
        findTask(em, ctx.orgId, input.taskId),
        findFieldDef(em, ctx.orgId, input.fieldDefId),
      ]);
      if (!task || !field) return null;

      const value = validateValue(field, input.value);
      task.customFields = { ...task.customFields, [field.slug]: value };
      task.updatedAt = new Date();
      em.persist(task);
      await em.flush();
      return { taskId: task.id, customFields: task.customFields };
    }),

  clear: protectedProcedure
    .input(ClearFieldInputSchema)
    .output(TaskCustomFieldsOutputSchema.nullable())
    .mutation(async ({ ctx, input }) => {
      const em = resolveEntityManager(ctx);
      const [task, field] = await Promise.all([
        findTask(em, ctx.orgId, input.taskId),
        findFieldDef(em, ctx.orgId, input.fieldDefId),
      ]);
      if (!task || !field) return null;

      if (field.required) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Custom field ${field.slug} is required.`,
        });
      }

      const { [field.slug]: _removed, ...customFields } = task.customFields;
      task.customFields = customFields;
      task.updatedAt = new Date();
      em.persist(task);
      await em.flush();
      return { taskId: task.id, customFields: task.customFields };
    }),
});
