// CSV Import — gated behind FULCRUM_FEATURES=import-csv.
// Parses CSV; maps headers via user-provided column-map; validates required fields.

import { readFile } from "node:fs/promises";

export interface ImportRecord {
  [key: string]: string;
}

export interface SkippedRecord {
  record: number; // 1-based row number (data rows only, after header)
  reason: string;
}

export interface ImportResult {
  total: number;
  written: number;
  skipped: number;
  skipped_records: SkippedRecord[];
  records: ImportRecord[]; // parsed+mapped records (valid ones)
}

export interface ImportOptions {
  dryRun?: boolean;
}

/** Minimal RFC-4180 CSV parser — handles quoted fields. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() === "") continue;
    const cells: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        // Quoted field
        let val = "";
        i++; // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            val += '"';
            i += 2;
          } else if (line[i] === '"') {
            i++; // skip closing quote
            break;
          } else {
            val += line[i++];
          }
        }
        cells.push(val);
        if (line[i] === ",") i++; // skip comma
      } else {
        const end = line.indexOf(",", i);
        if (end === -1) {
          cells.push(line.slice(i));
          break;
        }
        cells.push(line.slice(i, end));
        i = end + 1;
      }
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * Import CSV from `csvPath` using `columnMap` to map CSV headers → Fulcrum fields.
 * `columnMap` shape: `{ "CSV Header": "fulcrum_field", ... }`
 *
 * Validates:
 * - All keys in columnMap must exist as CSV headers.
 * - `title` is a required Fulcrum field; rows missing it are skipped.
 */
export async function importCsv(
  csvPath: string,
  columnMap: Record<string, string>,
  options: ImportOptions = {},
): Promise<ImportResult> {
  const { dryRun = false } = options;

  const raw = await readFile(csvPath, "utf8");
  const rows = parseCsv(raw);
  if (rows.length === 0) {
    return { total: 0, written: 0, skipped: 0, skipped_records: [], records: [] };
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow as string[];

  // Validate column-map keys exist in CSV headers
  for (const csvCol of Object.keys(columnMap)) {
    if (!headers.includes(csvCol)) {
      throw new Error(`Column '${csvCol}' not found in CSV`);
    }
  }

  // Build index map: CSV column name → column index
  const colIndex: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    colIndex[headers[i] as string] = i;
  }

  const records: ImportRecord[] = [];
  const skipped_records: SkippedRecord[] = [];

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row = dataRows[rowIdx] as string[];
    const record: ImportRecord = {};

    // Map CSV columns → Fulcrum fields
    for (const [csvCol, fulcrumField] of Object.entries(columnMap)) {
      const idx = colIndex[csvCol] as number;
      record[fulcrumField] = row[idx] ?? "";
    }

    // Also include unmapped columns directly if their header maps directly
    // (identity pass — header name = field name, no explicit mapping needed
    //  when the user mapped every column they need)

    // Validate required field: title
    if (!record["title"] || record["title"].trim() === "") {
      skipped_records.push({
        record: rowIdx + 1,
        reason: "Missing required field: title",
      });
      continue;
    }

    records.push(record);
  }

  const total = dataRows.length;
  const skipped = skipped_records.length;
  const written = dryRun ? 0 : records.length;

  return { total, written, skipped, skipped_records, records };
}
