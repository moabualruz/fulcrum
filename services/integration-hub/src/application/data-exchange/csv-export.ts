// CSV Export — gated behind FULCRUM_FEATURES=export-csv.
// Streams rows for large exports; column headers match TaskRow field names.

import { createWriteStream } from "node:fs";

export interface TaskCsvRow {
  id: string;
  org_id: string;
  project_id: string | null;
  parent_id: string | null;
  title: string;
  description: string | null;
  status: string | null;
  priority: number | null;
  created_at: string;
  updated_at: string;
}

export interface ExportResult {
  path: string;
  entity_count: number;
}

/** CSV field order for task entities. */
const TASK_COLUMNS: (keyof TaskCsvRow)[] = [
  "id",
  "org_id",
  "project_id",
  "parent_id",
  "title",
  "description",
  "status",
  "priority",
  "created_at",
  "updated_at",
];

/** Escape a CSV cell value per RFC 4180. */
function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  // Wrap in quotes if contains comma, quote, or newline
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Serialize an array of TaskRow objects to a CSV file at `outPath`. */
export async function exportTasksToCsv(
  tasks: TaskCsvRow[],
  outPath: string,
): Promise<ExportResult> {
  const stream = createWriteStream(outPath, { encoding: "utf8" });

  // Write header
  stream.write(TASK_COLUMNS.join(",") + "\n");

  // Write rows
  for (const task of tasks) {
    const row = TASK_COLUMNS.map((col) => escapeCell(task[col])).join(",");
    stream.write(row + "\n");
  }

  await new Promise<void>((resolve, reject) => {
    stream.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return { path: outPath, entity_count: tasks.length };
}
