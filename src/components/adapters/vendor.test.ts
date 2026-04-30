import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

  test("skills.upstream component excludes Cloudflare package-owned source", async () => {
    const repoDirBefore = process.env["FULCRUM_REPO_DIR"];
    process.env["FULCRUM_REPO_DIR"] = scratch;
    await mkdir(join(scratch, "skills"), { recursive: true });
    await mkdir(join(scratch, ".codex", "skills"), { recursive: true });
    await writeFile(join(scratch, "skills", "upstream.lock"), [
      "[meta]",
      "schema_version = 1",
      "",
      "[skills.wrangler]",
      'source = "https://github.com/cloudflare/skills"',
      'subpath = "skills/wrangler"',
      'ref = "main"',
      'tree_sha = "0123456789abcdef0123456789abcdef01234567"',
      'license = "Apache-2.0"',
      'author_class = "tool-vendor"',
      'pinned_on = "2026-04-28"',
      'review_due = "2026-07-27"',
      "",
      "[skills.semgrep]",
      'source = "https://github.com/semgrep/skills"',
      'subpath = "skills/semgrep"',
      'ref = "main"',
      'tree_sha = "89abcdef0123456789abcdef0123456789abcdef"',
      'license = "MIT"',
      'author_class = "tool-vendor"',
      'pinned_on = "2026-04-28"',
      'review_due = "2026-07-27"',
      "",
    ].join("\n"));

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

    try {
      await applyVendorAction(vendorAction("skills.upstream", "create-or-update"), true);
    } finally {
      console.log = originalLog;
      if (repoDirBefore === undefined) delete process.env["FULCRUM_REPO_DIR"];
      else process.env["FULCRUM_REPO_DIR"] = repoDirBefore;
    }

    expect(logs.some((line) => line.includes("1 curated skill(s)"))).toBe(true);
    expect(logs.some((line) => line.includes("semgrep"))).toBe(true);
    expect(logs.some((line) => line.includes("wrangler"))).toBe(false);
  });

  test("Cloudflare package install cleans stale upstream copies before writing package skills", async () => {
    const repoDirBefore = process.env["FULCRUM_REPO_DIR"];
    process.env["FULCRUM_REPO_DIR"] = scratch;
    await mkdir(join(scratch, "skills"), { recursive: true });
    await mkdir(join(scratch, ".pi", "agent", "skills", "cloudflare"), { recursive: true });
    await mkdir(join(scratch, ".fulcrum", "cache", "cloudflare-skills", "skills", "cloudflare"), { recursive: true });
    await writeFile(
      join(scratch, ".fulcrum", "cache", "cloudflare-skills", "skills", "cloudflare", "SKILL.md"),
      "---\nname: cloudflare\n---\n",
    );
    await writeFile(join(scratch, "skills", "upstream.lock"), [
      "[meta]",
      "schema_version = 1",
      "",
      "[skills.cloudflare-platform]",
      'source = "https://github.com/cloudflare/skills"',
      'subpath = "skills/cloudflare"',
      'ref = "main"',
      'tree_sha = "0123456789abcdef0123456789abcdef01234567"',
      'license = "Apache-2.0"',
      'author_class = "tool-vendor"',
      'pinned_on = "2026-04-28"',
      'review_due = "2026-07-27"',
      "",
    ].join("\n"));

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(" "));

    try {
      await applyVendorAction(vendorAction("package.cloudflare", "create-or-update"), true);
    } finally {
      console.log = originalLog;
      if (repoDirBefore === undefined) delete process.env["FULCRUM_REPO_DIR"];
      else process.env["FULCRUM_REPO_DIR"] = repoDirBefore;
    }

    const cleanupIndex = logs.findIndex((line) => line.includes("fulcrum upstream skills remove"));
    const installIndex = logs.findIndex((line) => line.includes("Pi CLI cloudflare loadable skill mirror installed"));
    expect(cleanupIndex).toBeGreaterThanOrEqual(0);
    expect(installIndex).toBeGreaterThan(cleanupIndex);
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
