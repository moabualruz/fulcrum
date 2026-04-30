import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyVendorAction, classifyVendorComponent } from "./vendor.ts";
import type { ComponentAction } from "../types.ts";

let scratch = "";
let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-vendor-adapter-"));
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["HOME"] = scratch;
  process.env["FULCRUM_HOME"] = join(scratch, ".fulcrum");
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

describe("vendor component adapter", () => {
  test.each([
    ["skills.authored", "skills-authored"],
    ["skills.upstream", "skills-upstream"],
    ["package.caveman", "caveman"],
    ["package.repomix", "repomix"],
    ["package.cloudflare", "cloudflare"],
    ["package.superpowers", "superpowers"],
    ["package.graphify", "graphify"],
    ["package.ast-grep", "ast-grep"],
    ["package.tavily", "tavily"],
    ["package.pi-mcp-adapter", "pi-mcp-adapter"],
  ] as const)("classifies %s", (componentId, expected) => {
    expect(classifyVendorComponent(componentId)).toBe(expected);
  });

  test("rejects unsupported vendor component ids", () => {
    expect(() => classifyVendorComponent("package.unknown")).toThrow(
      "unsupported vendor component: package.unknown",
    );
  });

  test("noop and preserve actions return without invoking vendor helpers", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

    try {
      await applyVendorAction(vendorAction("package.caveman", "noop"), false);
      await applyVendorAction(vendorAction("package.caveman", "preserve"), false);
    } finally {
      console.log = originalLog;
    }

    expect(logs).toEqual([]);
  });

  test.each([
    "skills.authored",
    "skills.upstream",
    "package.caveman",
    "package.repomix",
    "package.cloudflare",
    "package.superpowers",
    "package.graphify",
    "package.ast-grep",
    "package.tavily",
    "package.pi-mcp-adapter",
  ] as const)("routes dry-run install/remove for %s without creating state", async (componentId) => {
    await applyVendorAction(vendorAction(componentId, "create-or-update"), true);
    await applyVendorAction(vendorAction(componentId, "remove"), true);

    expect(await Bun.file(join(scratch, ".agents")).exists()).toBe(false);
    expect(
      await Bun.file(join(scratch, ".fulcrum", "state", "global", "components.db")).exists(),
    ).toBe(false);
  });

  test("vendor command components with no safe uninstall report manual removal reason", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

    try {
      for (const componentId of [
        "package.graphify",
        "package.ast-grep",
        "package.tavily",
        "package.pi-mcp-adapter",
      ] as const) {
        await applyVendorAction(vendorAction(componentId, "remove"), true);
      }
    } finally {
      console.log = originalLog;
    }

    const combined = logs.join("\n");
    expect(combined).toContain("graphify removal is manual");
    expect(combined).toContain("ast-grep removal is manual");
    expect(combined).toContain("tavily removal is manual");
    expect(combined).toContain("pi-mcp-adapter removal is manual");
  });
});

function vendorAction(
  componentId: string,
  change: ComponentAction["change"],
): ComponentAction {
  return {
    id: `${componentId}:test`,
    componentId,
    surfaceId: `${componentId}:surface`,
    operation: change === "remove" ? "remove" : "install",
    kind: componentId.startsWith("skills.")
      ? componentId === "skills.authored"
        ? "skill-sync"
        : "upstream-skill-sync"
      : "vendor-command",
    target: "vendor-test-target",
    change,
    risk: "managed",
    reason: "test vendor action",
  };
}
