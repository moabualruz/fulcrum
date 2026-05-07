import { describe, expect, test } from "bun:test";
import { getPackageSurfaceManifest, type PackageSurfaceManifest } from "./package-surfaces.ts";
import { planPackageMirrorTargets, packageSlug } from "./package-mirror.ts";

function withoutNative(manifest: PackageSurfaceManifest): PackageSurfaceManifest {
  return {
    ...manifest,
    source: { ...manifest.source, officialInstallers: {} },
  };
}

describe("package mirror planner", () => {
  test("uses official native installers before mirroring surfaces", async () => {
    const manifest = await getPackageSurfaceManifest("package.repomix");

    const targets = planPackageMirrorTargets(manifest, ["claude-code"]);

    expect(targets.length).toBe(manifest.surfaces.length);
    expect(targets.every((target) => target.support === "native")).toBe(true);
    expect(targets.every((target) => target.nativeInstaller?.includes("claude"))).toBe(true);
  });

  test("maps all supported surface kinds into Codex plugin package paths", async () => {
    const manifest = withoutNative(await getPackageSurfaceManifest("package.repomix"));

    const targets = planPackageMirrorTargets(manifest, ["codex"]);

    expect(targets.every((target) => target.support === "mirror")).toBe(true);
    expect(targets.map((target) => target.surface.kind)).toContain("skill");
    expect(targets.map((target) => target.surface.kind)).toContain("command");
    expect(targets.map((target) => target.surface.kind)).toContain("agent");
    expect(targets.map((target) => target.surface.kind)).toContain("mcp");
    expect(targets.map((target) => target.surface.kind)).toContain("rule");
    expect(targets.map((target) => target.surface.kind)).toContain("metadata");
    expect(targets.every((target) => target.targetPath?.startsWith("~/.codex/plugins/cache/repomix/repomix/"))).toBe(true);
  });

  test("records unsupported reasons instead of silently omitting non-portable surfaces", async () => {
    const manifest = withoutNative(await getPackageSurfaceManifest("package.caveman"));

    const targets = planPackageMirrorTargets(manifest, ["claude-code"]);

    expect(targets.length).toBe(manifest.surfaces.length);
    expect(targets.every((target) => target.support === "unsupported")).toBe(true);
    expect(targets.every((target) => typeof target.unsupportedReason === "string" && target.unsupportedReason.length > 0)).toBe(true);
  });

  test("Pi and OpenCode mirrors include package metadata and hooks where supported", async () => {
    const manifest = withoutNative(await getPackageSurfaceManifest("package.superpowers"));

    const targets = planPackageMirrorTargets(manifest, ["opencode", "pi"]);
    const opencodeKinds = targets.filter((target) => target.agentId === "opencode").map((target) => target.surface.kind);
    const piKinds = targets.filter((target) => target.agentId === "pi").map((target) => target.surface.kind);

    expect(opencodeKinds).toContain("metadata");
    expect(opencodeKinds).toContain("hook");
    expect(piKinds).toContain("metadata");
    expect(piKinds).toContain("hook");
    expect(targets.filter((target) => target.surface.kind === "mcp").every((target) => target.configMutation?.includes("mcp"))).toBe(true);
  });

  test("uses package-specific paths for full package payload mirrors", async () => {
    const cloudflare = withoutNative(await getPackageSurfaceManifest("package.cloudflare"));
    const caveman = withoutNative(await getPackageSurfaceManifest("package.caveman"));
    const repomix = withoutNative(await getPackageSurfaceManifest("package.repomix"));

    const cloudflareTargets = planPackageMirrorTargets(cloudflare, ["opencode"]);
    const cavemanTargets = planPackageMirrorTargets(caveman, ["codex"]);
    const repomixTargets = planPackageMirrorTargets(repomix, ["opencode", "pi"]);

    expect(cloudflareTargets.some((target) => target.targetPath === "~/.config/opencode/packages/cloudflare/skills/wrangler/SKILL.md")).toBe(true);
    expect(cavemanTargets.some((target) => target.targetPath === "~/.codex/plugins/cache/caveman/caveman/0.1.0/package/skills/caveman/SKILL.md")).toBe(true);
    expect(repomixTargets.some((target) => target.targetPath === "~/.config/opencode/commands/pack-local.md")).toBe(true);
    expect(repomixTargets.some((target) => target.targetPath === "~/.pi/agent/prompts/pack-local.md")).toBe(true);
    expect(repomixTargets.some((target) => target.agentId === "pi" && target.support === "unsupported" && target.surface.kind === "agent")).toBe(true);
  });

  test("package slugs are stable and strip component prefix", () => {
    expect(packageSlug("package.cloudflare")).toBe("cloudflare");
    expect(packageSlug("package.superpowers")).toBe("superpowers");
  });
});
