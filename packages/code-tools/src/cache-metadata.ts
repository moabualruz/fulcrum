import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CodeToolCacheMetadataInput {
  rootPath: string;
  tool: string;
  args?: string[];
  configPaths?: string[];
  includedFiles?: string[];
  ignoredPaths?: string[];
}

export interface CodeToolCacheMetadata {
  tool: string;
  version: string;
  configHash: string;
  repoCommit?: string;
  includedFiles: string[];
  ignoredPaths: string[];
  generatedAt: string;
}

export async function buildCodeToolCacheMetadata(
  input: CodeToolCacheMetadataInput
): Promise<CodeToolCacheMetadata> {
  const [version, repoCommit, configHash] = await Promise.all([
    readToolVersion(input.tool, input.args),
    readRepoCommit(input.rootPath),
    hashConfig(input.rootPath, input.configPaths ?? [])
  ]);

  return {
    tool: input.tool,
    version,
    configHash,
    repoCommit,
    includedFiles: input.includedFiles ?? [],
    ignoredPaths: input.ignoredPaths ?? [],
    generatedAt: new Date().toISOString()
  };
}

async function readToolVersion(tool: string, args = ["--version"]): Promise<string> {
  try {
    const { stdout } = await execFileAsync(tool, args, { encoding: "utf8", timeout: 2500 });
    return stdout.split(/\r?\n/)[0]?.trim() || "unknown";
  } catch {
    return "unavailable";
  }
}

async function readRepoCommit(rootPath: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", rootPath, "rev-parse", "HEAD"], {
      encoding: "utf8",
      timeout: 2500
    });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

async function hashConfig(rootPath: string, configPaths: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const configPath of configPaths.sort()) {
    const absolute = path.isAbsolute(configPath) ? configPath : path.join(rootPath, configPath);
    const body = await readFile(absolute).catch(() => undefined);
    if (body) {
      hash.update(configPath);
      hash.update(body);
    }
  }
  return hash.digest("hex");
}
