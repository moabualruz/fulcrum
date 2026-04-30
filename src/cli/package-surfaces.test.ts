import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import {
  discoverPackageSurfaces,
  getPackageSurfaceManifest,
  isMirrorablePackagePath,
  type PackageSurfaceKind,
} from "./package-surfaces.ts";

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fulcrum-package-surfaces-"));
  const files: Record<string, string> = {
    "skills/pack-local/SKILL.md": "---\nname: repomix-pack-local\n---\n",
    "commands/pack-local.md": "Pack local\n",
    "agents/explorer.md": "---\nname: explorer\n---\n",
    ".mcp.json": JSON.stringify({ mcpServers: { repomix: { command: "npx" } } }),
    "rules/base.md": "Use official package behavior.\n",
    "hooks.json": JSON.stringify({ hooks: [] }),
    ".codex-plugin/plugin.json": JSON.stringify({ name: "fixture" }),
    "assets/icon.png": "fake png",
    "tools/helper.sh": "#!/bin/sh\n",
    "scripts/install.sh": "#!/bin/sh\n",
    "templates/prompt.md": "template payload\n",
    "themes/dark.json": "{}\n",
    "docs/runtime.md": "runtime docs exposed by package\n",
    "dist/runtime.js": "runtime bundle\n",
    "vendor/runtime.js": "vendored helper\n",
    "skills/pack-local/SKILL.original.md": "source backup\n",
    "_archive/old/SKILL.md": "old\n",
    ".github/workflows/ci.yml": "ignored\n",
    "tests/runtime.test.ts": "ignored\n",
    "node_modules/pkg/index.js": "ignored\n",
    ".git/config": "ignored\n",
  };
  for (const [path, body] of Object.entries(files)) {
    const full = join(root, path);
    await mkdir(join(full, ".."), { recursive: true });
    await writeFile(full, body);
  }
  return root;
}

function countByKind(kinds: readonly PackageSurfaceKind[], kind: PackageSurfaceKind): number {
  return kinds.filter((candidate) => candidate === kind).length;
}

describe("package surface discovery", () => {
  test("discovers every supported package surface kind and hashes deterministically", async () => {
    const root = await fixtureRoot();

    const surfaces = await discoverPackageSurfaces("package.repomix", root);
    const kinds = surfaces.map((surface) => surface.kind);

    expect(countByKind(kinds, "skill")).toBe(1);
    expect(countByKind(kinds, "command")).toBe(1);
    expect(countByKind(kinds, "agent")).toBe(1);
    expect(countByKind(kinds, "mcp")).toBe(1);
    expect(countByKind(kinds, "rule")).toBe(1);
    expect(countByKind(kinds, "hook")).toBe(1);
    expect(countByKind(kinds, "metadata")).toBe(1);
    expect(countByKind(kinds, "tool")).toBe(2);
    expect(countByKind(kinds, "asset")).toBe(6);
    expect(surfaces.every((surface) => /^[a-f0-9]{64}$/.test(surface.sha256))).toBe(true);
    expect(surfaces.map((surface) => surface.relativePath)).toEqual([...surfaces.map((surface) => surface.relativePath)].sort());
  });

  test("filters source-only backups but keeps shipped runtime assets", async () => {
    const root = await fixtureRoot();

    const surfaces = await discoverPackageSurfaces("package.repomix", root);
    const relativePaths = surfaces.map((surface) => surface.relativePath);

    expect(relativePaths).not.toContain("skills/pack-local/SKILL.original.md");
    expect(relativePaths.some((path) => path.startsWith("_archive/"))).toBe(false);
    expect(relativePaths.some((path) => path.startsWith(".github/"))).toBe(false);
    expect(relativePaths.some((path) => path.startsWith("tests/"))).toBe(false);
    expect(relativePaths.some((path) => path.startsWith("node_modules/"))).toBe(false);
    expect(relativePaths.some((path) => path.startsWith(".git/"))).toBe(false);
    expect(relativePaths).toContain("templates/prompt.md");
    expect(relativePaths).toContain("themes/dark.json");
    expect(relativePaths).toContain("docs/runtime.md");
    expect(relativePaths).toContain("dist/runtime.js");
    expect(relativePaths).toContain("vendor/runtime.js");
    expect(isMirrorablePackagePath("skills/foo/SKILL.md")).toBe(true);
    expect(isMirrorablePackagePath("skills/foo/SKILL.original.md")).toBe(false);
    expect(isMirrorablePackagePath("dist/runtime.js")).toBe(true);
    expect(isMirrorablePackagePath("vendor/runtime.js")).toBe(true);
    expect(isMirrorablePackagePath("_template/SKILL.md")).toBe(false);
  });

  test("managed package manifests expose full package-surface families", async () => {
    const repomix = await getPackageSurfaceManifest("package.repomix");
    const caveman = await getPackageSurfaceManifest("package.caveman");
    const cloudflare = await getPackageSurfaceManifest("package.cloudflare");
    const superpowers = await getPackageSurfaceManifest("package.superpowers");

    expect(new Set(repomix.surfaces.map((surface) => surface.kind))).toEqual(new Set(["skill", "mcp", "command", "agent", "rule", "metadata"]));
    expect(new Set(caveman.surfaces.map((surface) => surface.kind))).toEqual(new Set(["skill", "command", "hook", "rule", "metadata"]));
    expect(new Set(cloudflare.surfaces.map((surface) => surface.kind))).toEqual(new Set(["skill", "mcp", "command", "metadata", "asset"]));
    expect(new Set(superpowers.surfaces.map((surface) => surface.kind))).toEqual(new Set(["skill", "command", "agent", "hook", "metadata", "asset"]));
  });
});
