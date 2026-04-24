import { readFileSync } from "node:fs";
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
  return loadIgnoredPathPolicyFromReader(rootPath, async (filePath) => readFile(filePath, "utf8"));
}

export function loadIgnoredPathPolicySync(rootPath: string): IgnoredPathPolicy {
  return loadIgnoredPathPolicyFromReaderSync(rootPath, (filePath) =>
    readFileSync(filePath, "utf8")
  );
}

function loadIgnoredPathPolicyFromReaderSync(
  rootPath: string,
  read: (filePath: string) => string
): IgnoredPathPolicy {
  const patterns: string[] = [];
  const sources: string[] = [];

  for (const filename of ignoreFiles) {
    try {
      collectPatterns(filename, read(path.join(rootPath, filename)), patterns, sources);
    } catch {
      // Missing ignore files are normal.
    }
  }

  return makePolicy(rootPath, patterns, sources);
}

function loadIgnoredPathPolicyFromReader(
  rootPath: string,
  read: (filePath: string) => string | Promise<string>
): IgnoredPathPolicy | Promise<IgnoredPathPolicy> {
  const patterns: string[] = [];
  const sources: string[] = [];

  const pending: Promise<void>[] = [];
  for (const filename of ignoreFiles) {
    const filePath = path.join(rootPath, filename);
    try {
      const body = read(filePath);
      if (typeof body === "string") {
        collectPatterns(filename, body, patterns, sources);
      } else {
        pending.push(
          body
            .then((text) => collectPatterns(filename, text, patterns, sources))
            .catch(() => undefined)
        );
      }
    } catch {
      // Missing ignore files are normal.
    }
  }

  return pending.length > 0
    ? Promise.all(pending).then(() => makePolicy(rootPath, patterns, sources))
    : makePolicy(rootPath, patterns, sources);
}

function makePolicy(rootPath: string, patterns: string[], sources: string[]): IgnoredPathPolicy {
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

function collectPatterns(
  filename: string,
  body: string,
  patterns: string[],
  sources: string[]
): void {
  sources.push(filename);
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line && !line.startsWith("#")) {
      patterns.push(line);
    }
  }
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
