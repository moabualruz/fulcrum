import { execFile } from "node:child_process";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { buildCodeToolCacheMetadata, type CodeToolCacheMetadata } from "./cache-metadata.js";

const execFileAsync = promisify(execFile);

export interface CodeToolRunInput {
  rootPath: string;
  query?: string;
  pattern?: string;
  prompt?: string;
  configPaths?: string[];
  includedFiles?: string[];
  ignoredPaths?: string[];
  limit?: number;
}

export interface CodeToolRunResult {
  tool: "fd" | "ast-grep" | "aider" | "repomix";
  state: "managed" | "degraded";
  stdout: string;
  stderr: string;
  metadata: CodeToolCacheMetadata;
  limitation?: string;
}

export async function runFd(input: CodeToolRunInput): Promise<CodeToolRunResult> {
  const args = ["--type", "f", input.query ?? ".", input.rootPath];
  return runTool("fd", args, input, parseFdIncludedFiles);
}

export async function runAstGrep(input: CodeToolRunInput): Promise<CodeToolRunResult> {
  const args = ["run", "-p", input.pattern ?? input.query ?? "", "--json", input.rootPath];
  return runTool("ast-grep", args, input, parseAstGrepIncludedFiles);
}

export async function runAider(input: CodeToolRunInput): Promise<CodeToolRunResult> {
  const args = ["--version"];
  return runTool("aider", args, input);
}

export async function runRepomix(input: CodeToolRunInput): Promise<CodeToolRunResult> {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), "fulcrum-repomix-wrapper-")),
    "repomix-output.json"
  );
  const result = await runTool(
    "repomix",
    [input.rootPath, "--style", "json", "-o", outputPath],
    input
  );
  if (result.state === "managed") {
    return {
      ...result,
      stdout: [result.stdout, `outputPath=${outputPath}`, `sizeBytes=${statSync(outputPath).size}`]
        .filter(Boolean)
        .join("\n")
    };
  }
  return result;
}

async function runTool(
  tool: CodeToolRunResult["tool"],
  args: string[],
  input: CodeToolRunInput,
  deriveIncludedFiles?: (stdout: string) => string[]
): Promise<CodeToolRunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(tool, args, {
      cwd: input.rootPath,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 5 * 1024 * 1024
    });
    const metadata = await buildMetadata(input, tool, deriveIncludedFiles?.(stdout));
    return { tool, state: "managed", stdout: limit(stdout, input.limit), stderr, metadata };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    const metadata = await buildMetadata(input, tool);
    return {
      tool,
      state: "degraded",
      stdout: limit(failure.stdout ?? "", input.limit),
      stderr: failure.stderr ?? "",
      metadata,
      limitation: failure.message ?? `${tool} unavailable`
    };
  }
}

async function buildMetadata(
  input: CodeToolRunInput,
  tool: CodeToolRunResult["tool"],
  includedFiles = input.includedFiles
): Promise<CodeToolCacheMetadata> {
  return buildCodeToolCacheMetadata({
    rootPath: input.rootPath,
    tool,
    configPaths: input.configPaths,
    includedFiles,
    ignoredPaths: input.ignoredPaths ?? []
  });
}

function limit(value: string, limit = 200): string {
  return value.split(/\r?\n/).slice(0, limit).join("\n");
}

function parseFdIncludedFiles(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseAstGrepIncludedFiles(stdout: string): string[] {
  const parsed = parseJsonArray(stdout);
  if (parsed) {
    return [
      ...new Set(
        parsed
          .map((entry) =>
            entry && typeof entry === "object" ? (entry as { file?: unknown }).file : undefined
          )
          .filter((file): file is string => typeof file === "string")
          .map((file) => file.replaceAll("\\", "/"))
      )
    ];
  }
  const files = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const match = trimmed.match(/^(.+?):\d+(?::\d+)?(?::|$)/);
    if (match) {
      const filePath = match[1];
      if (filePath) {
        files.add(filePath.replaceAll("\\", "/"));
      }
      continue;
    }
    if (!trimmed.includes(":")) {
      files.add(trimmed.replaceAll("\\", "/"));
    }
  }
  return [...files];
}

function parseJsonArray(value: string): unknown[] | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
