export type CsvEntity = "tasks";

export interface CsvTask {
  id: string;
  externalId?: string;
  title: string;
  status: string;
  createdAt: string;
}

export interface CsvImportError {
  row?: number;
  message: string;
  code?: string;
}

export interface CsvImportResult {
  created: number;
  skipped: number;
  errors: CsvImportError[];
}

export class CsvValidationError extends Error {
  readonly columns: string[];

  constructor(columns: string[]) {
    super(`missing required CSV columns: ${columns.join(", ")}`);
    this.name = "CsvValidationError";
    this.columns = columns;
  }
}

const TASK_HEADERS = ["id", "external_id", "title", "status", "created_at"];

export function exportTasksCsv(tasks: CsvTask[]): string {
  const rows = [TASK_HEADERS, ...tasks.map((task) => [
    task.id,
    task.externalId ?? "",
    task.title,
    task.status,
    task.createdAt,
  ])];

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

export function importTasksCsv(
  csv: string,
  createTask: (input: { externalId?: string; title: string; status?: string }) => void,
  hasExternalId: (externalId: string) => boolean,
): CsvImportResult {
  const rows = parseCsv(csv);
  if (rows.length === 0) throw new CsvValidationError(["title"]);

  const headerRow = rows[0];
  if (!headerRow) throw new CsvValidationError(["title"]);

  const headers = headerRow.map((header) => header.trim());
  const titleIndex = headers.indexOf("title");
  if (titleIndex === -1) throw new CsvValidationError(["title"]);

  const externalIdIndex = headers.indexOf("external_id");
  const statusIndex = headers.indexOf("status");
  const result: CsvImportResult = { created: 0, skipped: 0, errors: [] };

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row) continue;
    if (row.length === 1 && row[0] === "") continue;

    const title = row[titleIndex]?.trim() ?? "";
    if (!title) {
      result.errors.push({ row: index + 1, message: "missing required title", code: "VALIDATION_ERROR" });
      continue;
    }

    const externalId = externalIdIndex === -1 ? undefined : row[externalIdIndex]?.trim() || undefined;
    if (externalId && hasExternalId(externalId)) {
      result.skipped += 1;
      continue;
    }

    const status = statusIndex === -1 ? undefined : row[statusIndex]?.trim() || undefined;
    createTask({ externalId, title, status });
    result.created += 1;
  }

  return result;
}

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (inQuotes) throw new CsvValidationError(["csv"]);
  row.push(cell);
  rows.push(row);
  return rows;
}
