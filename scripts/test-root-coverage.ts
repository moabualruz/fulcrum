import { existsSync, readFileSync } from "node:fs";

export type CoverageMap = Map<string, Map<number, number>>;

const ignoredLineCache = new Map<string, Set<number>>();

export function isTestCoverageFile(path: string): boolean {
  return /(^|\/)tests\//.test(path) || /\.(test|spec)\.(ts|tsx)$/.test(path);
}

export function mergeLcov(target: CoverageMap, lcov: string): void {
  let currentFile = "";
  for (const line of lcov.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      currentFile = line.slice(3);
      if (isTestCoverageFile(currentFile)) {
        currentFile = "";
        continue;
      }
      if (!target.has(currentFile)) target.set(currentFile, new Map());
      continue;
    }
    if (!currentFile || !line.startsWith("DA:")) continue;
    const [lineNumberText, hitsText] = line.slice(3).split(",");
    const lineNumber = Number.parseInt(lineNumberText ?? "", 10);
    const hits = Number.parseInt(hitsText ?? "", 10);
    if (!Number.isFinite(lineNumber) || !Number.isFinite(hits)) continue;
    if (isNonRuntimeCoverageLine(currentFile, lineNumber)) continue;
    const fileLines = target.get(currentFile)!;
    fileLines.set(lineNumber, Math.max(fileLines.get(lineNumber) ?? 0, hits));
  }
}

export function isNonRuntimeCoverageLine(path: string, lineNumber: number): boolean {
  if (!/\.[cm]?tsx?$/.test(path) || !existsSync(path)) return false;
  let ignored = ignoredLineCache.get(path);
  if (!ignored) {
    ignored = collectNonRuntimeCoverageLines(path);
    ignoredLineCache.set(path, ignored);
  }
  return ignored.has(lineNumber);
}

function collectNonRuntimeCoverageLines(path: string): Set<number> {
  const ignored = new Set<number>();
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  let inTemplateLiteral = false;
  let inTypeBlock = false;
  let typeBraceDepth = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("//")) {
      ignored.add(lineNumber);
      return;
    }

    if (inTemplateLiteral) {
      ignored.add(lineNumber);
      if (hasUnescapedBacktick(line)) inTemplateLiteral = false;
      return;
    }

    if (inTypeBlock) {
      ignored.add(lineNumber);
      typeBraceDepth += braceDelta(line);
      if (typeBraceDepth <= 0 && /[};]\s*$/.test(trimmed)) inTypeBlock = false;
      return;
    }

    if (/^(export\s+)?(interface|type)\b/.test(trimmed)) {
      ignored.add(lineNumber);
      inTypeBlock = trimmed.includes("{") && !trimmed.includes("}");
      typeBraceDepth = braceDelta(line);
      if (typeBraceDepth <= 0 && /[};]\s*$/.test(trimmed)) inTypeBlock = false;
      return;
    }

    if (/^(readonly\s+)?[A-Za-z_$][\w$?]*:\s+[^=]+[;,]$/.test(trimmed)) {
      ignored.add(lineNumber);
      return;
    }

    const firstBacktick = firstUnescapedBacktick(line);
    if (firstBacktick >= 0 && firstUnescapedBacktick(line.slice(firstBacktick + 1)) < 0) {
      inTemplateLiteral = true;
    }
  });

  return ignored;
}

function braceDelta(line: string): number {
  return [...line].reduce((delta, char) => {
    if (char === "{") return delta + 1;
    if (char === "}") return delta - 1;
    return delta;
  }, 0);
}

function hasUnescapedBacktick(line: string): boolean {
  return firstUnescapedBacktick(line) >= 0;
}

function firstUnescapedBacktick(line: string): number {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== "`") continue;
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) slashCount += 1;
    if (slashCount % 2 === 0) return index;
  }
  return -1;
}

export function renderMergedLcov(coverageMap: CoverageMap): string {
  const records: string[] = [];
  for (const [file, lines] of [...coverageMap.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sortedLines = [...lines.entries()].sort(([a], [b]) => a - b);
    const hitLines = sortedLines.filter(([, hits]) => hits > 0).length;
    records.push("TN:");
    records.push(`SF:${file}`);
    for (const [lineNumber, hits] of sortedLines) records.push(`DA:${lineNumber},${hits}`);
    records.push(`LF:${sortedLines.length}`);
    records.push(`LH:${hitLines}`);
    records.push("end_of_record");
  }
  return `${records.join("\n")}\n`;
}

export function coverageStats(coverageMap: CoverageMap): { covered: number; total: number; ratio: number } {
  let total = 0;
  let covered = 0;
  for (const lines of coverageMap.values()) {
    total += lines.size;
    for (const hits of lines.values()) {
      if (hits > 0) covered += 1;
    }
  }
  return { covered, total, ratio: total === 0 ? 0 : covered / total };
}
