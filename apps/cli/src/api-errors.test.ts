import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { REQUIRED_RESILIENCE_STATES } from "@platform-core/application/interface-parity/resilience-state-matrix.ts";
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

  test("formats permission and missing feature flag failures as actionable stderr-safe strings", () => {
    expect(formatCommandError({
      kind: "forbidden",
      message: "permission denied",
      recovery: "Request access.",
      traceId: "trace-cli-denied",
    })).toBe("FORBIDDEN: permission denied Recovery: Request access. Trace: trace-cli-denied");
    expect(formatCommandError({
      code: "FUL_MISSING_FEATURE_FLAG",
      message: "Enable public-api.",
      recovery: "Run fulcrum doctor.",
    })).toBe(
      "FUL_MISSING_FEATURE_FLAG: Enable public-api. Recovery: Run fulcrum doctor.",
    );
    expect(REQUIRED_RESILIENCE_STATES.filter((state) => state.surface === "cli").map((state) => state.state)).toEqual([
      "missing-api",
      "permission-denied",
      "missing-feature-flag",
      "empty-list",
    ]);
  });

  test("formats plain errors and unknown thrown values", () => {
    expect(formatApiError(new Error("bad input"))).toBe("bad input");
    expect(formatCommandError(new Error("bad input"))).toBe("Error: bad input");
    expect(formatApiError("bad input")).toBe("bad input");
    expect(apiErrorCode("bad input")).toBeUndefined();
  });

  test("maps missing public API configuration to a stable CLI error code", () => {
    const error = new Error(
      "Public API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL for runs, run, cycle, module, context, notifications, audit, webhooks, or connectors commands.",
    );

    expect(apiErrorCode(error)).toBe("FUL_PUBLIC_API_NOT_CONFIGURED");
    expect(hasApiErrorCode(error, "FUL_PUBLIC_API_NOT_CONFIGURED")).toBe(true);
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
