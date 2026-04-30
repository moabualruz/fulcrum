import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { planPackageMirrorTargets } from "./package-mirror.ts";
import { getPackageSurfaceManifest } from "./package-surfaces.ts";
import { auditPackageParity } from "./package-parity.ts";
import { registerServer, setEnabled } from "./mcp-registry.ts";

let originalHome: string | undefined;
let originalFulcrumHome: string | undefined;

beforeEach(() => {
  originalHome = process.env["HOME"];
  originalFulcrumHome = process.env["FULCRUM_HOME"];
});

afterEach(() => {
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  if (originalFulcrumHome === undefined) delete process.env["FULCRUM_HOME"];
  else process.env["FULCRUM_HOME"] = originalFulcrumHome;
});

describe("package parity audit", () => {
  test("counts source and installed surfaces by kind", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-package-parity-"));
    const manifest = await getPackageSurfaceManifest("package.repomix");
    const targets = planPackageMirrorTargets(manifest, ["codex"]);
    for (const target of targets) {
      if (!target.targetPath) continue;
      const path = target.targetPath.replace(/^~/, home);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, target.surface.relativePath);
    }

    const report = await auditPackageParity(manifest, targets, { home });

    expect(report.ok).toBe(true);
    expect(report.sourceCounts.skill).toBeGreaterThan(0);
    expect(report.installedCounts.skill).toBe(report.sourceCounts.skill);
    expect(report.missing).toEqual([]);
  });

  test("reports missing targets and unsupported targets explicitly", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-package-parity-"));
    const manifest = await getPackageSurfaceManifest("package.caveman");
    const targets = planPackageMirrorTargets({
      ...manifest,
      source: { ...manifest.source, officialInstallers: {} },
    }, ["claude-code", "codex"]);

    const report = await auditPackageParity(manifest, targets, { home });

    expect(report.ok).toBe(false);
    expect(report.missing.some((target) => target.agentId === "codex")).toBe(true);
    expect(report.unsupported.some((target) => target.agentId === "claude-code")).toBe(true);
  });

  test("reports missing native package installers instead of assuming installed", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-package-parity-"));
    const manifest = await getPackageSurfaceManifest("package.cloudflare");
    const targets = planPackageMirrorTargets(manifest, ["claude-code"]);

    const report = await auditPackageParity(manifest, targets, { home });

    expect(report.ok).toBe(false);
    expect(report.missing.some((target) => target.support === "native")).toBe(true);
  });

  test("accepts native package installer surfaces when native state is present", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-package-parity-"));
    await mkdir(join(home, ".claude", "plugins", "cache", "cloudflare"), { recursive: true });
    const manifest = await getPackageSurfaceManifest("package.cloudflare");
    const targets = planPackageMirrorTargets(manifest, ["claude-code"]);

    const report = await auditPackageParity(manifest, targets, { home });

    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
  });

  test("treats explicit unsupported targets as acceptable when nothing supported is missing", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-package-parity-"));
    const manifest = await getPackageSurfaceManifest("package.repomix");
    const targets = planPackageMirrorTargets(manifest, ["pi"]);
    for (const target of targets) {
      if (!target.targetPath) continue;
      const path = target.targetPath.replace(/^~/, home);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, target.surface.relativePath);
    }

    const report = await auditPackageParity(manifest, targets, { home });

    expect(report.unsupported.some((target) => target.surface.kind === "agent")).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.ok).toBe(true);
  });

  test("detects source-only file leaks under installed mirror roots", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-package-parity-"));
    const manifest = await getPackageSurfaceManifest("package.repomix");
    const targets = planPackageMirrorTargets(manifest, ["codex"]);
    await mkdir(join(home, ".codex", "plugins", "cache", "repomix", "repomix", "1.0.0", "skills", "x"), { recursive: true });
    await writeFile(join(home, ".codex", "plugins", "cache", "repomix", "repomix", "1.0.0", "skills", "x", "SKILL.original.md"), "backup\n");

    const report = await auditPackageParity(manifest, targets, { home });

    expect(report.leakedSourceOnlyFiles.length).toBe(1);
    expect(report.leakedSourceOnlyFiles[0]).toContain("SKILL.original.md");
    expect(report.ok).toBe(false);
  });

  test("requires package skills and MCP manifests to be adapted into native agent surfaces", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-package-parity-"));
    process.env["HOME"] = home;
    process.env["FULCRUM_HOME"] = join(home, ".fulcrum");
    const source = join(home, "source", "cloudflare");
    await mkdir(join(source, "skills", "wrangler"), { recursive: true });
    await writeFile(join(source, "skills", "wrangler", "SKILL.md"), "---\nname: wrangler\n---\n");
    await writeFile(join(source, ".mcp.json"), JSON.stringify({
      mcpServers: {
        "cloudflare-api": { type: "http", url: "https://mcp.cloudflare.com/mcp" },
      },
    }, null, 2) + "\n");
    const manifest = await getPackageSurfaceManifest("package.cloudflare", { sourceRoot: source });
    const targets = planPackageMirrorTargets(manifest, ["codex"]);
    for (const target of targets) {
      if (!target.targetPath) continue;
      const path = target.targetPath.replace(/^~/, home);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, target.surface.relativePath);
    }

    const report = await auditPackageParity(manifest, targets, { home });

    expect(report.ok).toBe(false);
    expect(report.missing.some((target) => target.surface.kind === "skill")).toBe(true);
    expect(report.missing.some((target) => target.surface.kind === "mcp")).toBe(true);
  });

  test("accepts package skills and MCP manifests when adapted native surfaces exist", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-package-parity-"));
    process.env["HOME"] = home;
    process.env["FULCRUM_HOME"] = join(home, ".fulcrum");
    const source = join(home, "source", "cloudflare");
    await mkdir(join(source, "skills", "wrangler"), { recursive: true });
    await writeFile(join(source, "skills", "wrangler", "SKILL.md"), "---\nname: wrangler\n---\n");
    await writeFile(join(source, ".mcp.json"), JSON.stringify({
      mcpServers: {
        "cloudflare-api": { type: "http", url: "https://mcp.cloudflare.com/mcp" },
      },
    }, null, 2) + "\n");
    const manifest = await getPackageSurfaceManifest("package.cloudflare", { sourceRoot: source });
    const targets = planPackageMirrorTargets(manifest, ["codex"]);
    for (const target of targets) {
      if (!target.targetPath) continue;
      const path = target.targetPath.replace(/^~/, home);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, target.surface.relativePath);
    }
    await mkdir(join(home, ".codex", "skills", "cloudflare", "wrangler"), { recursive: true });
    await writeFile(join(home, ".codex", "skills", "cloudflare", "wrangler", "SKILL.md"), "---\nname: wrangler\n---\n");
    await registerServer("cloudflare-api", {
      transport: "http",
      url: "https://mcp.cloudflare.com/mcp",
      description: "Cloudflare API",
      vendor: "cloudflare",
      default_enabled: true,
      auth_env_vars: [],
      agent_visibility: { "claude-code": false, codex: true, gemini: false, opencode: false, pi: false },
    });
    await setEnabled("cloudflare-api", true, { agents: ["codex"] });
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(join(home, ".codex", "config.toml"), "[mcp_servers.cloudflare-api]\nurl = \"https://mcp.cloudflare.com/mcp\"\n");

    const report = await auditPackageParity(manifest, targets, { home });

    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
  });

  test("accepts disabled package MCPs on agents without native disabled config", async () => {
    const home = await mkdtemp(join(tmpdir(), "fulcrum-package-parity-"));
    process.env["HOME"] = home;
    process.env["FULCRUM_HOME"] = join(home, ".fulcrum");
    const source = join(home, "source", "cloudflare");
    await mkdir(source, { recursive: true });
    await writeFile(join(source, ".mcp.json"), JSON.stringify({
      mcpServers: {
        "cloudflare-api": { type: "http", url: "https://mcp.cloudflare.com/mcp" },
      },
    }, null, 2) + "\n");
    const manifest = await getPackageSurfaceManifest("package.cloudflare", { sourceRoot: source });
    const targets = planPackageMirrorTargets(manifest, ["pi"]);
    for (const target of targets) {
      if (!target.targetPath) continue;
      const path = target.targetPath.replace(/^~/, home);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, target.surface.relativePath);
    }
    await registerServer("cloudflare-api", {
      transport: "http",
      url: "https://mcp.cloudflare.com/mcp",
      description: "Cloudflare API",
      vendor: "cloudflare",
      default_enabled: false,
      auth_env_vars: [],
      agent_visibility: { "claude-code": false, codex: false, gemini: false, opencode: false, pi: true },
    });
    await setEnabled("cloudflare-api", false, { agents: ["pi"] });

    const report = await auditPackageParity(manifest, targets, { home });

    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
  });
});
