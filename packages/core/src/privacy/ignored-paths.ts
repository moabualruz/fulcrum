import { readFile } from "node:fs/promises";
import path from "node:path";

const ignoreFiles = [".gitignore", ".ignore", ".fulcrumignore", ".repomixignore"] as const;

export interface IgnoredPathPolicy {
  rootPath: string;
  patterns: string[];
  sources: string[];
  isIgnored(candidatePath: string): boolean;
}

export async function loadIgnoredPathPolicy(rootPath: string): Promise<IgnoredPathPolicy> {
  const patterns: string[] = [];
  const sources: string[] = [];
  for (const filename of ignoreFiles) {
    try {
      const body = await readFile(path.join(rootPath, filename), "utf8");
      sources.push(filename);
      for (const raw of body.split(/\r?\n/)) {
        const line = raw.trim();
        if (line && !line.startsWith("#")) {
          patterns.push(line);
        }
      }
    } catch {
      // Missing ignore files are normal.
    }
  }
  return {
    rootPath,
    patterns,
    sources,
    isIgnored(candidatePath: string): boolean {
      const relative = path
        .relative(rootPath, path.resolve(rootPath, candidatePath))
        .replaceAll(path.sep, "/");
      return patterns.some((pattern) => matchesPattern(relative, pattern));
    }
  };
}

function matchesPattern(relative: string, pattern: string): boolean {
  const normalized = pattern.replace(/^\//, "").replaceAll(path.sep, "/");
  if (normalized.endsWith("/")) {
    return relative.startsWith(normalized.slice(0, -1));
  }
  if (normalized.includes("*")) {
    const regex = new RegExp(`^${normalized.split("*").map(escapeRegex).join(".*")}$`);
    return regex.test(relative);
  }
  return relative === normalized || relative.startsWith(`${normalized}/`);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
