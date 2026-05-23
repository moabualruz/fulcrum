export type CommandControlSurface = "cli" | "tui";
export type CoverageStatus = "unproven" | "pass" | "fail";

export interface SourceInventoryItem {
  id: string;
  surface: CommandControlSurface;
  action: string;
  sourcePath: string;
  flags?: readonly string[];
  outputModes?: readonly string[];
  keybindings?: readonly string[];
}

export interface ManualCoverageAnnotation {
  id: string;
  testPath?: string;
  manualSimulation?: readonly string[];
  evidencePaths?: readonly string[];
  status?: CoverageStatus;
  notes?: string;
}

export interface CommandControlCoverageRow {
  id: string;
  surface: CommandControlSurface;
  action: string;
  sourcePath: string;
  flags: readonly string[];
  outputModes: readonly string[];
  keybindings: readonly string[];
  testPath: string | null;
  manualSimulation: readonly string[];
  evidencePaths: readonly string[];
  passes: boolean;
  status: CoverageStatus;
  notes: string | null;
}

export interface CommandControlCoverageArtifact {
  schema: "fulcrum.command-control-coverage.v1";
  generatedFrom: readonly string[];
  rows: readonly CommandControlCoverageRow[];
}

export function buildCommandControlCoverageArtifact(input: {
  inventory: readonly SourceInventoryItem[];
  annotations?: readonly ManualCoverageAnnotation[];
}): CommandControlCoverageArtifact {
  const annotations = new Map((input.annotations ?? []).map((annotation) => [annotation.id, annotation]));
  const rows = input.inventory
    .map((item) => buildRow(item, annotations.get(item.id)))
    .sort((a, b) => a.surface.localeCompare(b.surface) || a.id.localeCompare(b.id));
  return {
    schema: "fulcrum.command-control-coverage.v1",
    generatedFrom: [...new Set(input.inventory.map((item) => item.sourcePath))].sort(),
    rows,
  };
}

export function mergeCoverageAnnotations(input: {
  regenerated: CommandControlCoverageArtifact;
  existing: CommandControlCoverageArtifact;
}): CommandControlCoverageArtifact {
  const annotations = input.existing.rows.map((row) => ({
    id: row.id,
    testPath: row.testPath ?? undefined,
    manualSimulation: row.manualSimulation,
    evidencePaths: row.evidencePaths,
    status: row.status,
    notes: row.notes ?? undefined,
  }));
  return buildCommandControlCoverageArtifact({
    inventory: input.regenerated.rows.map((row) => ({
      id: row.id,
      surface: row.surface,
      action: row.action,
      sourcePath: row.sourcePath,
      flags: row.flags,
      outputModes: row.outputModes,
      keybindings: row.keybindings,
    })),
    annotations,
  });
}

export function parseCliCommandInventory(sourcePath: string, source: string): SourceInventoryItem[] {
  const rows: SourceInventoryItem[] = [];
  const commandPattern = /(?:fulcrum\s+[^\n`"]+|\.command\("([^"]+)"\))/g;
  for (const match of source.matchAll(commandPattern)) {
    const raw = match[1] ?? match[0];
    const action = normalizeCommand(raw);
    if (!action || action.includes("<") || action.includes("|")) continue;
    rows.push({
      id: `cli:${action.replaceAll(" ", ":")}`,
      surface: "cli",
      action,
      sourcePath,
      flags: flagsForSource(source, raw),
      outputModes: outputModesForSource(source, raw),
    });
  }
  return uniqueRows(rows);
}

export function parseTuiActionInventory(sourcePath: string, source: string): SourceInventoryItem[] {
  const rows: SourceInventoryItem[] = [];
  for (const match of source.matchAll(/(?:handleKey\(key: string\)|renderer\.writeln\(c\.dim\("([^"]+)"\)\))/g)) {
    const hint = match[1];
    if (!hint) continue;
    for (const key of hint.split(/\s+/).filter((part) => /^[A-Za-z/?]$/.test(part))) {
      rows.push({
        id: `tui:${sourcePath}:${key}`,
        surface: "tui",
        action: `key ${key}`,
        sourcePath,
        keybindings: [key],
      });
    }
  }
  return uniqueRows(rows);
}

function buildRow(item: SourceInventoryItem, annotation: ManualCoverageAnnotation | undefined): CommandControlCoverageRow {
  const status = annotation?.status ?? "unproven";
  return {
    id: item.id,
    surface: item.surface,
    action: item.action,
    sourcePath: item.sourcePath,
    flags: [...new Set(item.flags ?? [])].sort(),
    outputModes: [...new Set(item.outputModes ?? [])].sort(),
    keybindings: [...new Set(item.keybindings ?? [])].sort(),
    testPath: annotation?.testPath ?? null,
    manualSimulation: annotation?.manualSimulation ?? [],
    evidencePaths: annotation?.evidencePaths ?? [],
    passes: status === "pass" && (annotation?.evidencePaths?.length ?? 0) > 0,
    status,
    notes: annotation?.notes ?? null,
  };
}

function flagsForSource(source: string, rawCommand: string): string[] {
  const index = source.indexOf(rawCommand);
  const window = index >= 0 ? source.slice(index, index + 1200) : source;
  return [...window.matchAll(/--[a-z0-9-]+/g)].map((match) => match[0]);
}

function outputModesForSource(source: string, rawCommand: string): string[] {
  return flagsForSource(source, rawCommand).includes("--json") ? ["json"] : [];
}

function normalizeCommand(raw: string): string {
  return raw
    .replace(/^\.command\("/, "")
    .replace(/"\)$/, "")
    .replace(/^fulcrum\s+/, "")
    .replace(/\s+\[[^\]]+\]/g, "")
    .replace(/\s+<[^>]+>/g, "")
    .replace(/\s+--[a-z0-9-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueRows(rows: SourceInventoryItem[]): SourceInventoryItem[] {
  const byId = new Map<string, SourceInventoryItem>();
  for (const row of rows) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}
