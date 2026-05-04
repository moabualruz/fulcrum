import type { ProductDb } from "../../product-kernel/db/types.ts";

export async function tableColumns(db: ProductDb, tableName: string): Promise<Set<string>> {
  const rows = await db.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_name = $1`,
    [tableName],
  );
  return new Set(rows.map((row) => row.column_name));
}

export function textFromUnknown(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(textFromUnknown).filter(Boolean).join(" ");
  if (typeof value === "object") return Object.values(value).map(textFromUnknown).filter(Boolean).join(" ");
  return String(value);
}

export function tagsFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((tag): tag is string => typeof tag === "string" && tag.length > 0);
}
