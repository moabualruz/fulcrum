import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, test } from "bun:test";

const FEATURE_FLAGS_ROOT = "services/feature-flags/src";
const PLATFORM_CORE_ROOT = "services/platform-core/src";
const PLATFORM_CORE_COMPOSITION_ALLOWLIST = new Set([
  "services/platform-core/src/infrastructure/application-database/typeorm.config.ts",
  "services/platform-core/src/application/runtime/web-request-runtime.ts",
]);

async function tsFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (entry.isFile() && path.endsWith(".ts")) result.push(path);
    }
  }
  await walk(root);
  return result.sort();
}

describe("feature-flags service isolation", () => {
  test("feature-flags service does not import platform-core", async () => {
    const offenders: string[] = [];
    for (const file of (await tsFiles(FEATURE_FLAGS_ROOT)).filter((path) => !path.endsWith(".test.ts"))) {
      const source = await readFile(file, "utf8");
      if (source.includes("@platform-core/") || source.includes("services/platform-core/")) {
        offenders.push(relative(".", file));
      }
    }

    expect(offenders).toEqual([]);
  });

  test("platform-core does not depend on feature-flags outside composition roots", async () => {
    const offenders: string[] = [];
    for (const file of await tsFiles(PLATFORM_CORE_ROOT)) {
      const rel = relative(".", file);
      if (PLATFORM_CORE_COMPOSITION_ALLOWLIST.has(rel)) continue;

      const source = await readFile(file, "utf8");
      if (source.includes("@feature-flags/") || source.includes("services/feature-flags/")) {
        offenders.push(rel);
      }
    }

    expect(offenders).toEqual([]);
  });

  test("legacy platform-core feature-flag implementation files are gone", async () => {
    const offenders: string[] = [];
    const legacyPrefixes = [
      "services/platform-core/src/application/feature-flags/",
      "services/platform-core/src/infrastructure/database/feature-flag",
      "services/platform-core/src/interface/feature-flags.ts",
      "services/platform-core/src/interface/http/feature-flag-public-api.controller.ts",
      "services/platform-core/src/interface/http/feature-experiment-public-api.controller.ts",
      "services/platform-core/src/interface/http/dto/feature-flag.dto.ts",
      "services/platform-core/src/interface/http/dto/feature-experiment.dto.ts",
    ];

    for (const file of await tsFiles(PLATFORM_CORE_ROOT)) {
      const rel = relative(".", file);
      if (legacyPrefixes.some((prefix) => rel.startsWith(prefix) || rel === prefix)) {
        offenders.push(rel);
      }
    }

    expect(offenders).toEqual([]);
  });
});
