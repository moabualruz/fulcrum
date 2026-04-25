import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import type { ExactSearchResult, PathIgnorePolicy } from "./exact-search.js";

const execFileAsync = promisify(execFile);

export interface StructuralSearchOptions {
  rootPath: string;
  pattern: string;
  ignorePolicy?: PathIgnorePolicy;
  limit?: number;
}

export interface StructuralSearchResponse {
  state: "available" | "degraded";
  results: ExactSearchResult[];
  limitation?: string;
}

export async function searchStructural(
  options: StructuralSearchOptions
): Promise<StructuralSearchResponse> {
  try {
    const { stdout } = await execFileAsync(
      "ast-grep",
      ["run", "-p", options.pattern, "--json", options.rootPath],
      {
        cwd: options.rootPath,
        encoding: "utf8",
        timeout: 10_000,
        maxBuffer: 10 * 1024 * 1024
      }
    );
    return parseAstGrepOutput(stdout, options);
  } catch (error) {
    const failure = error as {
      code?: string | number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    if (failure.stdout) {
      return parseAstGrepOutput(failure.stdout, options);
    }
    if (failure.code === 1 && !failure.stderr) {
      return { state: "available", results: [] };
    }
    return {
      state: "degraded",
      results: [],
      limitation: failure.message ?? "ast-grep structural-search adapter is unavailable."
    };
  }
}

function parseAstGrepOutput(
  stdout: string,
  options: StructuralSearchOptions
): StructuralSearchResponse {
  try {
    return { state: "available", results: parseAstGrepJson(stdout, options) };
  } catch (error) {
    return {
      state: "degraded",
      results: [],
      limitation:
        error instanceof Error
          ? `ast-grep returned invalid JSON: ${error.message}`
          : "ast-grep returned invalid JSON."
    };
  }
}

interface AstGrepMatch {
  file?: string;
  range?: {
    start?: { line?: number };
    end?: { line?: number };
  };
  text?: string;
}

function parseAstGrepJson(stdout: string, options: StructuralSearchOptions): ExactSearchResult[] {
  if (!stdout.trim()) {
    return [];
  }
  const parsed = JSON.parse(stdout) as AstGrepMatch[];
  const limit = options.limit ?? 50;
  return parsed
    .filter((match) => Boolean(match.file))
    .filter((match) => {
      const absolute = path.isAbsolute(match.file!)
        ? match.file!
        : path.join(options.rootPath, match.file!);
      return !options.ignorePolicy?.isIgnored(absolute);
    })
    .slice(0, limit)
    .map((match) => {
      const absolute = path.isAbsolute(match.file!)
        ? match.file!
        : path.join(options.rootPath, match.file!);
      const lineStart = normalizeLine(match.range?.start?.line);
      const lineEnd = normalizeLine(match.range?.end?.line) ?? lineStart;
      return {
        filePath: path.relative(options.rootPath, absolute).replaceAll(path.sep, "/"),
        lineStart,
        lineEnd,
        symbol: match.text?.split(/\s+/).find(Boolean),
        evidenceType: "structural",
        sourceTool: "ast-grep",
        reason: "Pattern matched source code with ast-grep structural search."
      };
    });
}

function normalizeLine(line: number | undefined): number | undefined {
  if (!Number.isFinite(line)) return undefined;
  return Math.max(1, Math.floor(line!));
}
