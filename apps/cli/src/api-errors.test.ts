import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { apiErrorCode, formatApiError, formatCommandError, hasApiErrorCode } from "./api-errors.ts";

describe("CLI API error handling", () => {
  test("formats coded application errors without importing server router packages", () => {
    const error = { code: "FORBIDDEN", message: "denied" };

    expect(formatApiError(error)).toBe("FORBIDDEN: denied");
    expect(formatCommandError(error)).toBe("FORBIDDEN: denied");
    expect(apiErrorCode(error)).toBe("FORBIDDEN");
    expect(hasApiErrorCode(error, "FORBIDDEN")).toBe(true);
    expect(hasApiErrorCode(error, "UNAUTHORIZED")).toBe(false);
  });

  test("formats AppError-shaped failures from local application services", () => {
    const error = { kind: "unauthorized", message: "login required" };

    expect(formatApiError(error)).toBe("UNAUTHORIZED: login required");
    expect(formatCommandError(error)).toBe("UNAUTHORIZED: login required");
    expect(apiErrorCode(error)).toBe("UNAUTHORIZED");
    expect(hasApiErrorCode(error, "UNAUTHORIZED")).toBe(true);
  });

  test("formats plain errors and unknown thrown values", () => {
    expect(formatApiError(new Error("bad input"))).toBe("bad input");
    expect(formatCommandError(new Error("bad input"))).toBe("Error: bad input");
    expect(formatApiError("bad input")).toBe("bad input");
    expect(apiErrorCode("bad input")).toBeUndefined();
  });

  test("CLI source files do not import @trpc/server", async () => {
    const files = await listTypeScriptFiles("apps/cli/src");
    const offenders: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");
      const packageName = ["@trpc", "server"].join("/");
      if (source.includes(`from "${packageName}"`) || source.includes(`from '${packageName}'`)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});

async function listTypeScriptFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listTypeScriptFiles(path));
    } else if (path.endsWith(".ts")) {
      files.push(path);
    }
  }

  return files;
}
