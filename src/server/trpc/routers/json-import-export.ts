import { TRPCError } from "@trpc/server";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

import { protectedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

const FORMAT = "fulcrum.json-export.v1" as const;
const SCHEMA_VERSION = 1 as const;
const FULCRUM_VERSION = "0.1.0";
const CREDENTIAL_SECRET_COLUMNS = new Set(["encrypted_value"]);

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ])
);

const ManifestHeaderSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  fulcrum_version: z.string(),
  exported_at: z.string(),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  column_types: z.record(z.string(), z.record(z.string(), z.string())).optional(),
});

const ImportManifestSchema = z.object({
  format: z.literal(FORMAT),
  manifest: ManifestHeaderSchema,
}).catchall(z.array(z.record(z.string(), JsonValueSchema)));

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

type EntityManager = import("@mikro-orm/postgresql").EntityManager;
type ImportManifest = {
  format: typeof FORMAT;
  manifest: z.infer<typeof ManifestHeaderSchema>;
} & Record<string, unknown>;

function requireEntityManager(ctx: { em: EntityManager | null }): EntityManager {
  if (!ctx.em) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "EntityManager could not be resolved.",
    });
  }
  return ctx.em;
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

async function execute<T extends Record<string, unknown>>(
  em: EntityManager,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return await em.getConnection().execute(sql, params) as T[];
}

async function tableNames(em: EntityManager): Promise<string[]> {
  const rows = await execute<{ table_name: string }>(
    em,
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name
    `,
  );
  return rows.map((row) => row.table_name);
}

async function columnsForTable(em: EntityManager, table: string): Promise<{
  columns: string[];
  columnTypes: Record<string, string>;
}> {
  const rows = await execute<{ column_name: string; data_type: string }>(
    em,
    `
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ?
      order by ordinal_position
    `,
    [table],
  );
  return {
    columns: rows.map((row) => row.column_name),
    columnTypes: Object.fromEntries(rows.map((row) => [row.column_name, row.data_type])),
  };
}

function exportableColumns(table: string, columns: string[]): string[] {
  if (table !== "credentials") return columns;
  return columns.filter((column) => !CREDENTIAL_SECRET_COLUMNS.has(column));
}

function redactRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  if (table !== "credentials") return row;
  return { ...row, redacted: true };
}

async function createManifest(em: EntityManager): Promise<ImportManifest> {
  const manifest: ImportManifest = {
    format: FORMAT,
    manifest: {
      schema_version: SCHEMA_VERSION,
      fulcrum_version: FULCRUM_VERSION,
      exported_at: new Date().toISOString(),
      counts: {},
      column_types: {},
    },
  };

  for (const table of await tableNames(em)) {
    const { columns, columnTypes } = await columnsForTable(em, table);
    const selectedColumns = exportableColumns(table, columns);
    const rows = selectedColumns.length === 0
      ? []
      : await execute<Record<string, unknown>>(
        em,
        `select ${selectedColumns.map(quoteIdent).join(", ")} from ${quoteIdent(table)} order by ${
          selectedColumns.includes("id") ? quoteIdent("id") : "1"
        }`,
      );

    manifest[table] = rows.map((row) => redactRow(table, row));
    manifest.manifest.counts[table] = rows.length;
    manifest.manifest.column_types![table] = Object.fromEntries(
      selectedColumns.map((column) => [column, columnTypes[column] ?? "unknown"]),
    );
  }

  return manifest;
}

async function readManifest(path: string): Promise<ImportManifest> {
  try {
    return ImportManifestSchema.parse(JSON.parse(await readFile(path, "utf8"))) as ImportManifest;
  } catch (cause) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Import manifest is invalid.",
      cause,
    });
  }
}

function entityEntries(manifest: ImportManifest): Array<[string, Array<Record<string, unknown>>]> {
  return Object.entries(manifest)
    .filter(([key, value]) => key !== "format" && key !== "manifest" && Array.isArray(value))
    .map(([key, value]) => [key, value as Array<Record<string, unknown>>]);
}

async function collisionList(
  em: EntityManager,
  manifest: ImportManifest,
): Promise<Array<{ kind: string; id: string }>> {
  const tables = new Set(await tableNames(em));
  const collisions: Array<{ kind: string; id: string }> = [];

  for (const [kind, rows] of entityEntries(manifest)) {
    if (!tables.has(kind)) continue;
    for (const row of rows) {
      if (typeof row.id !== "string") continue;
      const existing = await execute<{ id: string }>(
        em,
        `select id from ${quoteIdent(kind)} where id = ? limit 1`,
        [row.id],
      );
      if (existing.length > 0) collisions.push({ kind, id: row.id });
    }
  }

  return collisions;
}

function sqlValue(value: unknown, dataType: string | undefined): unknown {
  if (dataType === "ARRAY" && Array.isArray(value)) return toPostgresArrayLiteral(value);
  return value ?? null;
}

function toPostgresArrayLiteral(values: unknown[]): string {
  return `{${values.map((value) => {
    const text = String(value ?? "");
    return `"${text.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
  }).join(",")}}`;
}

async function importManifest(
  em: EntityManager,
  manifest: ImportManifest,
  onConflict: "skip" | "update" | "error",
): Promise<{ imported: number; updated: number; skipped: number }> {
  const tables = new Set(await tableNames(em));
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const [kind, rows] of entityEntries(manifest)) {
    if (!tables.has(kind) || kind === "credentials") {
      skipped += rows.length;
      continue;
    }

    const columnTypes = manifest.manifest.column_types?.[kind] ?? {};
    for (const row of rows) {
      if (typeof row.id !== "string") {
        skipped += 1;
        continue;
      }

      const existing = await execute<{ id: string }>(
        em,
        `select id from ${quoteIdent(kind)} where id = ? limit 1`,
        [row.id],
      );
      const collides = existing.length > 0;
      if (collides && onConflict === "error") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Import collision for ${kind}:${row.id}.`,
        });
      }
      if (collides && onConflict === "skip") {
        skipped += 1;
        continue;
      }

      const columns = Object.keys(row).filter((column) => columnTypes[column] !== undefined);
      if (!columns.includes("id")) columns.unshift("id");
      const insertColumns = columns.map(quoteIdent).join(", ");
      const placeholders = columns.map(() => "?").join(", ");
      const values = columns.map((column) => sqlValue(row[column], columnTypes[column]));

      if (collides) {
        const updates = columns
          .filter((column) => column !== "id")
          .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
          .join(", ");
        if (updates.length === 0) {
          skipped += 1;
          continue;
        }
        await execute(
          em,
          `
            insert into ${quoteIdent(kind)} (${insertColumns})
            values (${placeholders})
            on conflict (${quoteIdent("id")}) do update set ${updates}
          `,
          values,
        );
        updated += 1;
      } else {
        await execute(
          em,
          `
            insert into ${quoteIdent(kind)} (${insertColumns})
            values (${placeholders})
          `,
          values,
        );
        imported += 1;
      }
    }
  }

  return { imported, updated, skipped };
}

export const dataExportRouter = t.router({
  create: protectedProcedure
    .input(ExportCreateInputSchema)
    .output(ExportCreateOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const manifest = await createManifest(requireEntityManager(ctx));
      const json = JSON.stringify(manifest, null, input?.pretty ? 2 : 0);
      if (input?.outputPath) await writeFile(input.outputPath, json, "utf8");
      return {
        ok: true as const,
        format: FORMAT,
        json,
        entityCounts: manifest.manifest.counts,
        outputPath: input?.outputPath,
      };
    }),
});

export const dataImportRouter = t.router({
  preflight: protectedProcedure
    .input(ImportPreflightInputSchema)
    .output(ImportPreflightOutputSchema)
    .query(async ({ ctx, input }) => {
      const manifest = await readManifest(input.path);
      return {
        ok: true as const,
        importId: input.path,
        counts: manifest.manifest.counts,
        collisions: await collisionList(requireEntityManager(ctx), manifest),
      };
    }),

  run: protectedProcedure
    .input(ImportRunInputSchema)
    .output(ImportRunOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const manifest = await readManifest(input.importId);
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

      const result = await em.transactional((tx) =>
        importManifest(tx as EntityManager, manifest, input.onConflict)
      );
      return {
        ok: true as const,
        ...result,
        errors: 0,
        counts: manifest.manifest.counts,
      };
    }),
});
