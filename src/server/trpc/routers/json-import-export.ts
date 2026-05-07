import type { EntityManager } from "@mikro-orm/postgresql";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { appErrorToTrpcError } from "../../../application/error-mapping.ts";
import { AppError } from "../../../application/errors.ts";
import {
  createExportManifest,
  FORMAT,
  listImportCollisions,
  readImportManifest,
  runImportManifest,
  SCHEMA_VERSION,
  writeExportJson,
  type ImportExportAppContext,
} from "../../../application/import-export/commands.ts";
import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

const importExportApplication = {
  createExportManifest,
  readImportManifest,
  listImportCollisions,
  runImportManifest,
  writeExportJson,
};

export function __setImportExportApplicationForTest(overrides: Partial<typeof importExportApplication>): () => void {
  const previous = { ...importExportApplication };
  Object.assign(importExportApplication, overrides);
  return () => Object.assign(importExportApplication, previous);
}

const ExportCreateInputSchema = z.object({
  pretty: z.boolean().default(false),
  outputPath: z.string().min(1).optional(),
}).optional();

const ExportCreateOutputSchema = z.object({
  ok: z.literal(true),
  format: z.literal(FORMAT),
  json: z.string(),
  entityCounts: z.record(z.string(), z.number().int().nonnegative()),
  outputPath: z.string().optional(),
});

const ImportPreflightInputSchema = z.object({
  path: z.string().min(1),
});

const ImportPreflightOutputSchema = z.object({
  ok: z.literal(true),
  importId: z.string(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  collisions: z.array(z.object({
    kind: z.string(),
    id: z.string(),
  })),
});

const ImportRunInputSchema = z.object({
  importId: z.string().min(1),
  dryRun: z.boolean().default(false),
  onConflict: z.enum(["skip", "update", "error"]).default("error"),
});

const ImportRunOutputSchema = z.object({
  ok: z.literal(true),
  imported: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
});

function requireEntityManager({ em }: { em: EntityManager | null }): EntityManager {
  if (em) return em;
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "EntityManager could not be resolved." });
}

function appContext(ctx: { orgId: string; userId: string }): ImportExportAppContext {
  return { orgId: ctx.orgId, userId: ctx.userId };
}

async function mapAppError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

export const dataExportRouter = t.router({
  create: permissionedProcedure({ resource: "data", action: "create" })
    .input(ExportCreateInputSchema)
    .output(ExportCreateOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(async () => {
        const manifest = await importExportApplication.createExportManifest(requireEntityManager(ctx), appContext(ctx));
        const json = JSON.stringify(manifest, null, input?.pretty ? 2 : 0);
        if (input?.outputPath) await importExportApplication.writeExportJson(input.outputPath, json);
        return {
          ok: true as const,
          format: FORMAT,
          json,
          entityCounts: manifest.manifest.counts,
          outputPath: input?.outputPath,
        };
      });
    }),
});

export const dataImportRouter = t.router({
  preflight: permissionedProcedure({ resource: "data", action: "preflight" })
    .input(ImportPreflightInputSchema)
    .output(ImportPreflightOutputSchema)
    .query(async ({ ctx, input }) => {
      return mapAppError(async () => {
        const manifest = await importExportApplication.readImportManifest(input.path);
        return {
          ok: true as const,
          importId: input.path,
          counts: manifest.manifest.counts,
          collisions: await importExportApplication.listImportCollisions(requireEntityManager(ctx), appContext(ctx), manifest),
        };
      });
    }),

  run: permissionedProcedure({ resource: "data", action: "run" })
    .input(ImportRunInputSchema)
    .output(ImportRunOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(async () => {
        const manifest = await importExportApplication.readImportManifest(input.importId);
        if (input.dryRun) {
          return {
            ok: true as const,
            imported: 0,
            updated: 0,
            skipped: 0,
            errors: 0,
            counts: manifest.manifest.counts,
          };
        }

        const result = await importExportApplication.runImportManifest(
          requireEntityManager(ctx),
          appContext(ctx),
          manifest,
          input.onConflict,
        );
        return {
          ok: true as const,
          ...result,
          errors: 0,
          counts: manifest.manifest.counts,
        };
      });
    }),
});

export const __jsonImportExportSchemaVersion = SCHEMA_VERSION;
