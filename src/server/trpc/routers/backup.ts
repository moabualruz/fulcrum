import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { permissionedProcedure } from "../../../trpc/middleware.ts";
import { t } from "../../../trpc/trpc.ts";

const FORMAT = "fulcrum.db-dump.v1" as const;

const DumpTableSchema = z.object({
  columns: z.array(z.string()),
  columnTypes: z.record(z.string(), z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
});

const DumpSchema = z.object({
  format: z.literal(FORMAT),
  createdAt: z.string(),
  tables: z.record(z.string(), DumpTableSchema),
});

const BackupOutputSchema = z.object({
  ok: z.literal(true),
  format: z.literal(FORMAT),
  dump: z.string(),
  entityCounts: z.record(z.string(), z.number().int().nonnegative()),
});

const RestoreInputSchema = z.object({
  dump: z.string().min(1),
});

const RestoreOutputSchema = z.object({
  ok: z.literal(true),
  format: z.literal(FORMAT),
  entityCounts: z.record(z.string(), z.number().int().nonnegative()),
});

type EntityManager = import("@mikro-orm/postgresql").EntityManager;
type Dump = z.infer<typeof DumpSchema>;

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

function countKey(table: string): string {
  return table === "tasks" ? "tasks" : table;
}

async function createDump(em: EntityManager): Promise<Dump> {
  const tables: Dump["tables"] = {};

  for (const table of await tableNames(em)) {
    const { columns, columnTypes } = await columnsForTable(em, table);
    const rows = await execute<Record<string, unknown>>(
      em,
      `select * from ${quoteIdent(table)} order by ${columns.includes("id") ? quoteIdent("id") : "1"}`,
    );
    tables[table] = { columns, columnTypes, rows };
  }

  return {
    format: FORMAT,
    createdAt: new Date().toISOString(),
    tables,
  };
}

function encodeDump(dump: Dump): string {
  return Buffer.from(JSON.stringify(dump), "utf8").toString("base64");
}

function decodeDump(encoded: string): Dump {
  try {
    const json = Buffer.from(encoded, "base64").toString("utf8");
    return DumpSchema.parse(JSON.parse(json));
  } catch (cause) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Backup dump is invalid.",
      cause,
    });
  }
}

function entityCounts(dump: Dump): Record<string, number> {
  return Object.fromEntries(
    Object.entries(dump.tables).map(([table, data]) => [countKey(table), data.rows.length]),
  );
}

async function restoreDump(em: EntityManager, dump: Dump): Promise<void> {
  for (const [table, data] of Object.entries(dump.tables)) {
    if (!data.columns.includes("id")) continue;
    if (data.rows.length === 0) continue;

    const columns = data.columns.map(quoteIdent).join(", ");
    const placeholders = data.columns.map(() => "?").join(", ");
    const updates = data.columns
      .filter((column) => column !== "id")
      .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
      .join(", ");

    for (const row of data.rows) {
      await execute(
        em,
        `
          insert into ${quoteIdent(table)} (${columns})
          values (${placeholders})
          on conflict (${quoteIdent("id")}) do update set ${updates}
        `,
        data.columns.map((column) => sqlValue(row[column], data.columnTypes[column])),
      );
    }
  }
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

export const backupRouter = t.router({
  create: permissionedProcedure({ resource: "backup", action: "create" })
    .output(BackupOutputSchema)
    .mutation(async ({ ctx }) => {
      const em = requireEntityManager(ctx);
      const dump = await createDump(em);
      return {
        ok: true as const,
        format: FORMAT,
        dump: encodeDump(dump),
        entityCounts: entityCounts(dump),
      };
    }),

  restore: permissionedProcedure({ resource: "backup", action: "restore" })
    .input(RestoreInputSchema)
    .output(RestoreOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const em = requireEntityManager(ctx);
      const dump = decodeDump(input.dump);
      await restoreDump(em, dump);
      return {
        ok: true as const,
        format: FORMAT,
        entityCounts: entityCounts(dump),
      };
    }),
});
