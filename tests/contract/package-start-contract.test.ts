import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listInstallTargetProbes } from "@fulcrum/core";

const rootDir = process.cwd();

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(rootDir, path), "utf8")) as Record<string, unknown>;
}

describe("package/start contract", () => {
  it("exposes a root fulcrum binary and packaged start scripts", () => {
    const rootPackage = readJson("package.json");
    expect(rootPackage.bin).toEqual({ fulcrum: "apps/cli/dist/main.js" });
    expect(rootPackage.scripts?.["build:package"]).toBe("pnpm -r build");
    expect(String(rootPackage.scripts?.start)).toContain("spawnSync");
    expect(String(rootPackage.scripts?.start)).toContain("apps/cli/dist/main.js");
    expect(rootPackage.scripts?.["start:server"]).toBe("node apps/server/dist/main.js");
    expect(rootPackage.scripts?.["start:tui"]).toBe("node apps/tui/dist/main.js");
  });

  it("keeps the CLI package executable after build", () => {
    const cliPackage = readJson("apps/cli/package.json");
    expect(cliPackage.bin).toEqual({ fulcrum: "dist/main.js" });
    expect(cliPackage.scripts).toMatchObject({
      build: "tsc -p tsconfig.json",
      start: "node dist/main.js"
    });
    const source = readFileSync(join(rootDir, "apps/cli/src/main.ts"), "utf8");
    expect(source.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("declares health probes for all packaged local surfaces", () => {
    const targets = listInstallTargetProbes({ rootDir });
    expect(targets.map((target) => target.targetId)).toEqual([
      "source",
      "npm",
      "pnpm-dlx",
      "bun-binary",
      "fulcrum-setup",
      "fulcrum-doctor",
      "fulcrum-server",
      "fulcrum-cockpit",
      "fulcrum-tui",
      "fulcrum-mcp"
    ]);
    expect(targets.find((target) => target.targetId === "pnpm-dlx")).toMatchObject({
      status: "degraded"
    });
    expect(targets.find((target) => target.targetId === "bun-binary")).toMatchObject({
      status: "degraded"
    });
    expect(targets.every((target) => target.nextAction.length > 0)).toBe(true);
  });
});
