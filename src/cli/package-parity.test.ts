import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { planPackageMirrorTargets } from "./package-mirror.ts";
import { getPackageSurfaceManifest } from "./package-surfaces.ts";
import { auditPackageParity } from "./package-parity.ts";

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
});
