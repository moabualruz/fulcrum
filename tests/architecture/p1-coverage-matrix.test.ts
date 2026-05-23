import { describe, expect, it } from "bun:test";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { ALL_STEPS as STEPS } from "../../scripts/ci.ts";

interface SurfaceCoverage {
  surface: string;
  roots: string[];
  match: RegExp;
}

const SURFACES: SurfaceCoverage[] = [
  { surface: "web", roots: ["tests/identity-access/auth", "apps/web/src", "apps/web/tests"], match: /\.(test|spec)\.ts$/ },
  { surface: "cli", roots: ["tests/cli", "apps/cli/src"], match: /\.test\.ts$/ },
  { surface: "tui", roots: ["tests/tui"], match: /\.test\.ts$/ },
  { surface: "tRPC", roots: ["apps/server/src/trpc/__tests__"], match: /\.test\.ts$/ },
  { surface: "auth", roots: ["tests/identity-access/auth"], match: /\.(test|spec)\.ts$/ },
  { surface: "db", roots: ["tests/platform-core", "services/platform-core/src/infrastructure/application-database"], match: /\.test\.ts$/ },
];

async function collectFiles(root: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".svelte-kit") continue;
    const path = join(root, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      files.push(...await collectFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

describe("P1 test coverage matrix", () => {
  for (const surface of SURFACES) {
    it(`has ${surface.surface} coverage discoverable by CI`, async () => {
      const files = (await Promise.all(surface.roots.map(collectFiles))).flat();
      const matches = files.filter((file) => surface.match.test(file));
      expect(matches.length).toBeGreaterThan(0);
    });
  }

  it("keeps Playwright coverage for auth login/logout routes", async () => {
    const files = await collectFiles("apps/web/tests/e2e");
    const authSpecs = files.filter((file) => /auth.*\.spec\.ts$/.test(file));
    expect(authSpecs.length).toBeGreaterThan(0);
  });
});

describe("scripts/ci.ts tiered pipeline gate", () => {
  it("has 5 tiers in the pipeline", () => {
    const tiers = [...new Set(STEPS.map((s) => s.tier))];
    expect(tiers).toEqual(["tier1", "tier2", "tier3", "tier4", "tier5"]);
  });

  it("unit tier runs fixture-backed test selector", () => {
    const unit = STEPS.find((s) => s.name === "unit");
    expect(unit).toBeDefined();
    expect(unit!.cmd).toContain("scripts/test-tier.ts");
    expect(unit!.cmd).toContain("unit");
  });

  it("integration tier runs DB/API contract test selector", () => {
    const integration = STEPS.find((s) => s.name === "integration");
    expect(integration).toBeDefined();
    expect(integration!.cmd).toContain("scripts/test-tier.ts");
    expect(integration!.cmd).toContain("integration");
  });

  it("design and real e2e tiers include web gates", () => {
    const designNames = STEPS.filter((s) => s.tier === "tier4").map((s) => s.name);
    const realNames = STEPS.filter((s) => s.tier === "tier5").map((s) => s.name);
    expect(designNames).toContain("web:check");
    expect(designNames).toContain("design-e2e");
    expect(realNames).toContain("web:build");
    expect(realNames).toContain("real-e2e");
  });
});
