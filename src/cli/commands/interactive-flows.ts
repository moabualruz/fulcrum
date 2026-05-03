/**
 * Interactive CLI flows for routing rules editing, skills conflict resolution,
 * and CSV import column-mapping wizard.
 *
 * P14 issue 10 — interactive flows, routing, skills, imports.
 *
 * All flows support `--non-interactive` which exits with code 7
 * (INTERACTIVE_REQUIRED) when TTY is unavailable and interactive input needed.
 */

import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const INTERACTIVE_REQUIRED_EXIT_CODE = 7;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

interface RoutingRuleRow {
  id: string;
  name: string;
  projectId: string | null;
  conditionsJson: JsonRecord;
  actionAgent: string;
  actionSkillSet: string[];
  priority: number;
  enabled: boolean;
  source: string;
}

interface SkillOutput {
  id: string;
  name: string;
  slug: string;
  source: string;
  upstreamRepo: string | null;
  upstreamRef: string | null;
  enabledAgents: string[];
}

interface CsvImportResult {
  created: number;
  skipped: number;
  errors: Array<{ row?: number; message: string; code?: string }>;
}

export interface RoutingEditCaller {
  get: (id: string) => Promise<RoutingRuleRow>;
  update: (input: JsonRecord) => Promise<RoutingRuleRow | null>;
}

export interface SkillsConflictCaller {
  resolveConflict: (input: { slug: string; resolution: string }) => Promise<SkillOutput>;
}

export interface ImportCsvCaller {
  importCsv: (input: { rows: JsonRecord[]; columnMap: Record<string, string> }) => Promise<CsvImportResult>;
}

export interface InteractiveFlowOptions {
  print: (line: string) => void;
  printErr: (line: string) => void;
  exit: (code: number) => void;
  isTTY?: boolean;
  editorCmd?: string;
  tmpDir?: string;
  routingCaller?: RoutingEditCaller;
  skillsConflictCaller?: SkillsConflictCaller;
  importCaller?: ImportCsvCaller;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

function needsInteractive(argv: readonly string[], opts: InteractiveFlowOptions): boolean {
  return argv.includes("--non-interactive") || opts.isTTY === false;
}

function exitInteractiveRequired(opts: InteractiveFlowOptions): void {
  opts.printErr("INTERACTIVE_REQUIRED: this command requires a TTY for interactive input. Use --keep, --map-columns, or run in a terminal.");
  opts.exit(INTERACTIVE_REQUIRED_EXIT_CODE);
}

// ---------------------------------------------------------------------------
// 1. fulcrum routing rules edit <id>
// ---------------------------------------------------------------------------

/**
 * Opens rule YAML in $EDITOR; parses on exit; updates via caller.
 * With --non-interactive: exits 7.
 */
export async function runRoutingRulesEdit(
  argv: readonly string[],
  opts: InteractiveFlowOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const jsonMode = argv.includes("--json");

  const positional = argv.filter((a) => !a.startsWith("-"));
  const id = positional[0];

  if (!id) {
    printErr("fulcrum routing rules edit: missing required argument <id>");
    exit(1);
    return;
  }

  // --non-interactive guard
  if (needsInteractive(argv, opts)) {
    exitInteractiveRequired(opts);
    return;
  }

  if (!opts.routingCaller) {
    printErr("fulcrum routing rules edit: no routing caller available");
    exit(1);
    return;
  }

  try {
    // Fetch current rule
    const rule = await opts.routingCaller.get(id);

    // Serialize to YAML-like format (simple key: value for testability)
    const yamlContent = ruleToYaml(rule);

    // Write to temp file
    const dir = opts.tmpDir ?? await mkdtemp(join(tmpdir(), "fulcrum-routing-edit-"));
    const tmpFile = join(dir, `rule-${id}.yaml`);
    await writeFile(tmpFile, yamlContent, "utf8");

    // Open editor
    const editor = opts.editorCmd ?? process.env["EDITOR"] ?? "vi";
    execSync(`${editor} ${tmpFile}`, { stdio: "inherit" });

    // Read back edited file
    const edited = await readFile(tmpFile, "utf8");
    const parsed = yamlToRule(edited, id);

    // Update via caller
    const updated = await opts.routingCaller.update(parsed);

    // Clean up temp file (best effort)
    if (!opts.tmpDir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }

    if (jsonMode) {
      print(JSON.stringify(updated));
    } else {
      print(`Updated routing rule ${id}.`);
    }
  } catch (err) {
    printErr(`fulcrum routing rules edit: ${(err as Error).message}`);
    exit(1);
  }
}

function ruleToYaml(rule: RoutingRuleRow): string {
  const lines = [
    `name: ${rule.name}`,
    `actionAgent: ${rule.actionAgent}`,
    `priority: ${rule.priority}`,
    `enabled: ${rule.enabled}`,
    `source: ${rule.source}`,
    `actionSkillSet: [${rule.actionSkillSet.join(", ")}]`,
    `conditionsJson: ${JSON.stringify(rule.conditionsJson)}`,
  ];
  if (rule.projectId) lines.push(`projectId: ${rule.projectId}`);
  return lines.join("\n") + "\n";
}

function yamlToRule(yaml: string, id: string): JsonRecord {
  const result: JsonRecord = { id };
  for (const line of yaml.split("\n")) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || rawValue === undefined) continue;
    const value = rawValue.trim();

    if (key === "conditionsJson") {
      try { result[key] = JSON.parse(value); } catch { result[key] = {}; }
    } else if (key === "actionSkillSet") {
      const inner = value.replace(/^\[/, "").replace(/\]$/, "");
      result[key] = inner ? inner.split(",").map((s) => s.trim()) : [];
    } else if (key === "priority") {
      result[key] = Number(value);
    } else if (key === "enabled") {
      result[key] = value === "true";
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 2. fulcrum skills conflicts resolve <slug>
// ---------------------------------------------------------------------------

/**
 * Interactive: shows diff in pager, offers k/u/m choices.
 * Non-interactive: requires --keep local|upstream, else exits 7.
 */
export async function runSkillsConflictsResolve(
  argv: readonly string[],
  opts: InteractiveFlowOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const jsonMode = argv.includes("--json");

  const positional = argv.filter((a) => !a.startsWith("-"));
  const slug = positional[0];

  if (!slug) {
    printErr("fulcrum skills conflicts resolve: missing required argument <slug>");
    exit(1);
    return;
  }

  // Check for --keep (non-interactive path)
  const keepIdx = argv.indexOf("--keep");
  const keepValue = keepIdx >= 0 ? argv[keepIdx + 1] : undefined;

  if (keepValue && ["local", "upstream"].includes(keepValue)) {
    // Non-interactive path — works regardless of TTY
    if (!opts.skillsConflictCaller) {
      printErr("fulcrum skills conflicts resolve: no caller available");
      exit(1);
      return;
    }
    try {
      const skill = await opts.skillsConflictCaller.resolveConflict({
        slug,
        resolution: keepValue,
      });
      if (jsonMode) {
        print(JSON.stringify(skill));
      } else {
        print(`Resolved conflict for '${slug}': kept ${keepValue}.`);
      }
    } catch (err) {
      printErr(`fulcrum skills conflicts resolve: ${(err as Error).message}`);
      exit(1);
    }
    return;
  }

  // Interactive path requires TTY
  if (needsInteractive(argv, opts)) {
    exitInteractiveRequired(opts);
    return;
  }

  // Interactive mode: would show side-by-side diff in less pager
  // For now, prompt is handled by the TUI layer; CLI requires --keep
  printErr("fulcrum skills conflicts resolve: interactive mode requires --keep <local|upstream> in CLI. Use TUI for interactive resolution.");
  exit(1);
}

// ---------------------------------------------------------------------------
// 3. fulcrum import csv
// ---------------------------------------------------------------------------

const REQUIRED_COLUMNS = ["title", "status"] as const;

/**
 * CSV import with column-mapping wizard.
 * --map-columns title=Name,status=State  → non-interactive
 * Without --map-columns + no TTY → exits 7
 */
export async function runImportCsv(
  argv: readonly string[],
  opts: InteractiveFlowOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const jsonMode = argv.includes("--json");

  const positional = argv.filter((a) => !a.startsWith("-"));
  const filePath = positional[0];

  if (!filePath) {
    printErr("fulcrum import csv: missing required argument <file>");
    printErr("Usage: fulcrum import csv <file.csv> [--map-columns title=Name,status=State] [--json]");
    exit(1);
    return;
  }

  // Parse --map-columns
  const mapColumnsRaw = flagValue(argv, "--map-columns");
  let columnMap: Record<string, string> | undefined;

  if (mapColumnsRaw) {
    columnMap = {};
    for (const pair of mapColumnsRaw.split(",")) {
      const [target, source] = pair.split("=");
      if (target && source) columnMap[target.trim()] = source.trim();
    }
  }

  // Without --map-columns, need interactive wizard
  if (!columnMap) {
    if (needsInteractive(argv, opts)) {
      exitInteractiveRequired(opts);
      return;
    }
    // Interactive wizard would go here; for CLI, require --map-columns
    printErr("fulcrum import csv: interactive column-mapping wizard requires a TTY. Use --map-columns for non-interactive mode.");
    exit(1);
    return;
  }

  // Read and parse CSV
  let csvContent: string;
  try {
    csvContent = await readFile(filePath, "utf8");
  } catch (err) {
    printErr(`fulcrum import csv: cannot read file: ${(err as Error).message}`);
    exit(1);
    return;
  }

  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) {
    printErr("fulcrum import csv: CSV file must have a header row and at least one data row.");
    exit(1);
    return;
  }

  const headers = parseCsvLine(lines[0]!);
  const rows: JsonRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]!);
    const row: JsonRecord = {};
    for (const [target, source] of Object.entries(columnMap)) {
      const colIdx = headers.indexOf(source);
      if (colIdx >= 0 && cells[colIdx] !== undefined) {
        row[target] = cells[colIdx];
      }
    }
    rows.push(row);
  }

  if (!opts.importCaller) {
    printErr("fulcrum import csv: no import caller available");
    exit(1);
    return;
  }

  try {
    const result = await opts.importCaller.importCsv({ rows, columnMap });
    if (jsonMode) {
      print(JSON.stringify(result));
    } else {
      print(`Import complete: ${result.created} created, ${result.skipped} skipped, ${result.errors.length} errors.`);
    }
  } catch (err) {
    printErr(`fulcrum import csv: ${(err as Error).message}`);
    exit(1);
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
