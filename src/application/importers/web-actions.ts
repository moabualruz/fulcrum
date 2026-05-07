import { AppInvariantError, AppValidationError } from "../errors.ts";

export type ImporterName = "csv" | "linear" | "jira" | "plane";

export interface ImporterColumnMapping {
  source: string;
  target: string;
}

export interface ImportResult {
  id: string;
  importerName: ImporterName;
  importedAt: string;
  rowCount: number;
  status: "success" | "failure";
  message: string;
}

export interface ImporterDescriptor {
  name: ImporterName;
  enabled: boolean;
}

export interface CsvPreflightInput {
  importerName: "csv";
  file: File | null;
}

export interface ApiPreflightInput {
  importerName: Exclude<ImporterName, "csv">;
  apiKey: string;
}

export type ImporterPreflightInput = CsvPreflightInput | ApiPreflightInput;

export interface ImporterPreflightResult {
  preflightOk: true;
  importerName: ImporterName;
  rowCount: number;
  columns: string[];
}

export const IMPORTER_NAMES: ImporterName[] = ["csv", "linear", "jira", "plane"];

export function featureList(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env["FULCRUM_FEATURES"] ?? "").split(",").map((feature) => feature.trim()).filter(Boolean);
}

export function isImporterEnabled(name: ImporterName, env: NodeJS.ProcessEnv = process.env): boolean {
  return featureList(env).includes(`import-${name}`);
}

export function listImporters(env: NodeJS.ProcessEnv = process.env): ImporterDescriptor[] {
  return IMPORTER_NAMES.map((name) => ({
    name,
    enabled: isImporterEnabled(name, env),
  }));
}

export function listImportHistory(): ImportResult[] {
  return [];
}

export async function preflightImporter(
  input: ImporterPreflightInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ImporterPreflightResult> {
  assertImporterEnabled(input.importerName, env);

  if (input.importerName === "csv") {
    if (!input.file || input.file.size === 0) throw new AppValidationError("File is required.");
    const text = await input.file.text();
    const rows = parseCsvRows(text);
    const columns = (rows[0] ?? []).map((column, index) => index === 0 ? stripBom(column).trim() : column.trim()).filter(Boolean);
    return {
      preflightOk: true,
      importerName: input.importerName,
      rowCount: Math.max(0, rows.length - 1),
      columns,
    };
  }

  if (!input.apiKey) throw new AppValidationError("API key is required.");
  throw new AppInvariantError(`Importer application service is not configured: ${input.importerName}`);
}

export async function runImporter(): Promise<never> {
  throw new AppInvariantError("Importer execution requires an application import service.");
}

function assertImporterEnabled(name: ImporterName, env: NodeJS.ProcessEnv): void {
  if (!IMPORTER_NAMES.includes(name)) throw new AppValidationError("Unknown importer.");
  if (!isImporterEnabled(name, env)) throw new AppValidationError(`import-${name} feature not enabled.`);
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let sawNonEmptyCell = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      sawNonEmptyCell = true;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      sawNonEmptyCell ||= cell.trim().length > 0;
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      sawNonEmptyCell ||= cell.trim().length > 0;
      if (sawNonEmptyCell) rows.push(row);
      row = [];
      cell = "";
      sawNonEmptyCell = false;
      continue;
    }

    cell += char;
  }

  if (inQuotes) throw new AppValidationError("CSV contains unterminated quoted field.");
  row.push(cell);
  sawNonEmptyCell ||= cell.trim().length > 0;
  if (sawNonEmptyCell) rows.push(row);
  return rows;
}
