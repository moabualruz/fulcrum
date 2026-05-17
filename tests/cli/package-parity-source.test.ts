import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { auditPackageParity } from "../../apps/cli/src/package-parity.ts";
import { planPackageMirrorTargets } from "../../apps/cli/src/package-mirror.ts";
import type { PackageSurfaceManifest } from "../../apps/cli/src/package-surfaces.ts";

let scratch: string;
let previousFulcrumHome: string | undefined;

beforeEach(async () => {
  scratch = await mkdtemp(join(tmpdir(), "fulcrum-package-parity-"));
  previousFulcrumHome = process.env["FULCRUM_HOME"];
  process.env["FULCRUM_HOME"] = join(scratch, "fulcrum-home");
  await mkdir(process.env["FULCRUM_HOME"], { recursive: true });
});

afterEach(async () => {
  if (previousFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = previousFulcrumHome;
  await rm(scratch, { recursive: true, force: true });
});

function manifest(sourcePath: string): PackageSurfaceManifest {
  return {
    packageId: "package.testpkg",
    source: {
      repo: "https://example.com/testpkg.git",
      officialInstallers: {
        "claude-code": ["testpkg", "install"],
      },
    },
    surfaces: [
      {
        packageId: "package.testpkg",
        kind: "skill",
        name: "tool",
        sourcePath,
        relativePath: "skills/tool/SKILL.md",
        sha256: "skill-sha",
        runtimeRequired: true,
        packageOwned: true,
      },
      {
        packageId: "package.testpkg",
        kind: "mcp",
        name: "main",
        sourcePath,
        relativePath: "mcp.json",
        sha256: "mcp-sha",
        runtimeRequired: true,
        packageOwned: true,
      },
      {
        packageId: "package.testpkg",
        kind: "command",
        name: "run",
        sourcePath,
        relativePath: "commands/run.md",
        sha256: "command-sha",
        runtimeRequired: true,
        packageOwned: true,
      },
    ],
  };
}

describe("package mirror target planning", () => {
  it("uses native installers when present and mirrors supported surfaces otherwise", () => {
    const m = manifest(join(scratch, "mcp.json"));
    const targets = planPackageMirrorTargets(m, ["claude-code", "codex", "opencode", "pi"]);

    expect(targets.filter((target) => target.agentId === "claude-code").every((target) => target.support === "native")).toBe(true);
    expect(targets.find((target) => target.agentId === "codex" && target.surface.kind === "skill")?.targetPath)
      .toContain("~/.codex/plugins/cache/testpkg/testpkg/1.0.0/skills/tool/SKILL.md");
    expect(targets.find((target) => target.agentId === "opencode" && target.surface.kind === "skill")?.targetPath)
      .toBe("~/.config/opencode/skills/tool/SKILL.md");
    expect(targets.find((target) => target.agentId === "pi" && target.surface.kind === "command")?.configMutation).toBeUndefined();
    expect(targets.find((target) => target.agentId === "codex" && target.surface.kind === "mcp")?.configMutation).toBe("codex:mcp");
  });
});

describe("package parity audit", () => {
  it("reports missing mirrored paths, unsupported native roots, and source-only leaks", async () => {
    const home = join(scratch, "home");
    const mcpSource = join(scratch, "source", "mcp.json");
    await mkdir(join(scratch, "source"), { recursive: true });
    await writeFile(mcpSource, JSON.stringify({ mcpServers: { testpkg: { command: "testpkg" } } }));
    const m = manifest(mcpSource);
    const targets = planPackageMirrorTargets(m, ["codex", "opencode"]);

    const skillTarget = targets.find((target) => target.agentId === "codex" && target.surface.kind === "skill");
    expect(skillTarget?.targetPath).toBeDefined();
    await mkdir(join(home, ".codex", "plugins", "cache", "testpkg", "testpkg", "1.0.0", "skills", "tool"), { recursive: true });
    await writeFile(join(home, ".codex", "plugins", "cache", "testpkg", "testpkg", "1.0.0", "skills", "tool", "SKILL.md"), "skill");
    await writeFile(join(home, ".codex", "plugins", "cache", "testpkg", "testpkg", "1.0.0", "skills", "tool", "SKILL.original.md"), "source only leak");

    const report = await auditPackageParity(m, targets, { home });

    expect(report.packageId).toBe("package.testpkg");
    expect(report.agentId).toBe("mixed");
    expect(report.sourceCounts.skill).toBe(1);
    expect(report.installedCounts.skill).toBe(1);
    expect(report.missingReasons.map((reason) => reason.kind)).toContain("mcp");
    expect(report.missingReasons.some((reason) => reason.reason === "missing-target")).toBe(true);
    expect(report.leakedSourceOnlyFiles.some((path) => path.endsWith("SKILL.original.md"))).toBe(true);
    expect(report.ok).toBe(false);
  });

  it("accepts native package roots and native MCP config across agents", async () => {
    const home = join(scratch, "home");
    const mcpSource = join(scratch, "source", "mcp.json");
    await mkdir(join(scratch, "source"), { recursive: true });
    await writeFile(mcpSource, JSON.stringify({ mcpServers: { serverA: {}, serverB: {} } }));
    const m = manifest(mcpSource);

    await mkdir(join(home, ".claude", "plugins", "cache", "caveman"), { recursive: true });
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".gemini"), { recursive: true });
    await mkdir(join(home, ".config", "opencode"), { recursive: true });
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await writeFile(join(home, ".codex", "config.toml"), "[mcp_servers.serverA]\n[mcp_servers.serverB]\n");
    await writeFile(join(home, ".gemini", "settings.json"), JSON.stringify({ mcpServers: { serverA: {}, serverB: {} } }));
    await writeFile(join(home, ".config", "opencode", "opencode.json"), JSON.stringify({ mcp: { serverA: {}, serverB: {} } }));
    await writeFile(join(home, ".pi", "agent", "mcp.json"), JSON.stringify({ mcpServers: { serverA: {}, serverB: {} } }));

    const nativeManifest: PackageSurfaceManifest = {
      ...m,
      packageId: "package.caveman",
      source: { ...m.source, officialInstallers: { "claude-code": ["claude", "plugin", "install", "caveman@caveman"] } },
    };
    const nativeReport = await auditPackageParity(nativeManifest, planPackageMirrorTargets(nativeManifest, ["claude-code"]), { home });
    expect(nativeReport.ok).toBe(true);
    expect(nativeReport.installedCounts.skill).toBe(1);

    const codexTargets = planPackageMirrorTargets(m, ["codex", "gemini", "opencode", "pi"]).filter((target) => target.surface.kind === "mcp");
    for (const target of codexTargets) {
      if (!target.targetPath) continue;
      if (target.agentId === "opencode") continue;
      await mkdir(join(home, target.targetPath.replace("~/", "").split("/").slice(0, -1).join("/")), { recursive: true });
      await writeFile(join(home, target.targetPath.replace("~/", "")), "{}");
    }
    const mcpReport = await auditPackageParity(m, codexTargets, { home });
    expect(mcpReport.missing).toHaveLength(0);
    expect(mcpReport.ok).toBe(true);
  });
});
