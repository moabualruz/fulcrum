import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ExactEvidenceType =
  | "exact_identifier"
  | "exact_string"
  | "path"
  | "filename"
  | "error"
  | "import"
  | "export";

export interface PathIgnorePolicy {
  isIgnored(candidatePath: string): boolean;
}

export interface ExactSearchResult {
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  symbol?: string;
  evidenceType: ExactEvidenceType;
  sourceTool: "ripgrep" | "node-fs";
  reason: string;
}

export interface ExactSearchOptions {
  rootPath: string;
  query: string;
  ignorePolicy?: PathIgnorePolicy;
  limit?: number;
}

export async function searchExact(options: ExactSearchOptions): Promise<ExactSearchResult[]> {
  const started = Date.now();
  const pathMatches = await searchPaths(options);
  const contentMatches = await searchContentWithRipgrep(options).catch(() =>
    searchContentWithFs(options)
  );
  return rankAndLimit([...pathMatches, ...contentMatches], options.limit ?? 50, started);
}

export async function searchPaths(options: ExactSearchOptions): Promise<ExactSearchResult[]> {
  const files = await listFiles(options.rootPath, options.ignorePolicy);
  const query = options.query.toLowerCase();
  return files
    .filter((filePath) => filePath.toLowerCase().includes(query))
    .map((filePath) => ({
      filePath,
      evidenceType: path.basename(filePath).toLowerCase().includes(query)
        ? ("filename" as const)
        : ("path" as const),
      sourceTool: "node-fs" as const,
      reason: "Query matched repository path or filename."
    }));
}

async function searchContentWithRipgrep(options: ExactSearchOptions): Promise<ExactSearchResult[]> {
  const files = await listFiles(options.rootPath, options.ignorePolicy);
  if (files.length === 0) {
    return [];
  }
  const results: ExactSearchResult[] = [];

  for (const chunk of chunks(files, 200)) {
    const absoluteFiles = chunk.map((filePath) => path.join(options.rootPath, filePath));
    const { stdout } = await execFileAsync(
      "rg",
      [
        "--json",
        "--fixed-strings",
        "--line-number",
        "--no-heading",
        "--",
        options.query,
        ...absoluteFiles
      ],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
    );
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      const event = JSON.parse(line) as RgEvent;
      if (event.type !== "match") {
        continue;
      }
      const absolute = path.resolve(event.data.path.text);
      if (options.ignorePolicy?.isIgnored(absolute)) {
        continue;
      }
      const text = event.data.lines.text;
      results.push({
        filePath: path.relative(options.rootPath, absolute).replaceAll(path.sep, "/"),
        lineStart: event.data.line_number,
        lineEnd: event.data.line_number,
        evidenceType: classifyContent(options.query, text),
        sourceTool: "ripgrep",
        reason: "Query matched file content with exact local search."
      });
    }
  }

  return results;
}

async function searchContentWithFs(options: ExactSearchOptions): Promise<ExactSearchResult[]> {
  const files = await listFiles(options.rootPath, options.ignorePolicy);
  const results: ExactSearchResult[] = [];
  for (const filePath of files) {
    const absolute = path.join(options.rootPath, filePath);
    const body = await readFile(absolute, "utf8").catch(() => "");
    if (!body) {
      continue;
    }
    body.split(/\r?\n/).forEach((line, index) => {
      if (line.includes(options.query)) {
        results.push({
          filePath,
          lineStart: index + 1,
          lineEnd: index + 1,
          evidenceType: classifyContent(options.query, line),
          sourceTool: "node-fs",
          reason: "Query matched file content with exact local fallback search."
        });
      }
    });
  }
  return results;
}

async function listFiles(rootPath: string, ignorePolicy?: PathIgnorePolicy): Promise<string[]> {
  const results: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
      if (entry.name === ".git" || entry.name === ".fulcrum" || entry.name === "node_modules") {
        continue;
      }
      const absolute = path.join(directory, entry.name);
      if (ignorePolicy?.isIgnored(absolute)) {
        continue;
      }
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        const info = await stat(absolute).catch(() => undefined);
        if (info && info.size <= 1024 * 1024) {
          results.push(path.relative(rootPath, absolute).replaceAll(path.sep, "/"));
        }
      }
    }
  }
  await visit(rootPath);
  return results;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function classifyContent(query: string, line: string): ExactEvidenceType {
  if (/^\s*import\s/.test(line)) {
    return "import";
  }
  if (/^\s*export\s/.test(line)) {
    return "export";
  }
  if (
    /error|exception|failed|failure/i.test(line) ||
    /error|exception|failed|failure/i.test(query)
  ) {
    return "error";
  }
  return /^[A-Za-z_$][\w$]*$/.test(query) ? "exact_identifier" : "exact_string";
}

function rankAndLimit(
  results: ExactSearchResult[],
  limit: number,
  started: number
): ExactSearchResult[] {
  void started;
  const seen = new Set<string>();
  return results
    .filter((result) => {
      const key = `${result.filePath}:${result.lineStart ?? 0}:${result.evidenceType}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

interface RgEvent {
  type: "begin" | "match" | "end" | "summary";
  data: {
    path: { text: string };
    lines: { text: string };
    line_number: number;
  };
}
