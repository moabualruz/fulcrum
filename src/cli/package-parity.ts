import { readdir, stat } from "node:fs/promises";
import type { AgentId } from "./mcp-registry.ts";
import type { AgentSurfaceTarget, PackageSurfaceKind, PackageSurfaceManifest } from "./package-surfaces.ts";

export interface PackageParityReport {
  packageId: string;
  agentId: AgentId | "mixed";
  sourceCounts: Record<PackageSurfaceKind, number>;
  installedCounts: Record<PackageSurfaceKind, number>;
  missing: readonly AgentSurfaceTarget[];
  unsupported: readonly AgentSurfaceTarget[];
  leakedSourceOnlyFiles: readonly string[];
  ok: boolean;
}

const SURFACE_KINDS: readonly PackageSurfaceKind[] = [
  "skill",
  "rule",
  "mcp",
  "command",
  "agent",
  "hook",
  "tool",
  "metadata",
  "asset",
];

export async function auditPackageParity(
  manifest: PackageSurfaceManifest,
  targets: readonly AgentSurfaceTarget[],
  opts: { home?: string } = {},
): Promise<PackageParityReport> {
  const home = opts.home ?? process.env["HOME"] ?? "";
  const sourceCounts = emptyCounts();
  const installedCounts = emptyCounts();
  const missing: AgentSurfaceTarget[] = [];
  const unsupported: AgentSurfaceTarget[] = [];
  const leakRoots = new Set<string>();

  for (const surface of manifest.surfaces) {
    sourceCounts[surface.kind] += 1;
  }

  for (const target of targets) {
    if (target.support === "unsupported") {
      unsupported.push(target);
      continue;
    }
    if (target.support === "native") {
      installedCounts[target.surface.kind] += 1;
      continue;
    }
    if (!target.targetPath) {
      missing.push(target);
      continue;
    }
    const path = expandHome(target.targetPath, home);
    leakRoots.add(mirrorRoot(path, target.surface.relativePath));
    if (await exists(path)) {
      installedCounts[target.surface.kind] += 1;
    } else {
      missing.push(target);
    }
  }

  const leakedSourceOnlyFiles = (await Promise.all([...leakRoots].map((root) => findSourceOnlyLeaks(root))))
    .flat()
    .sort();

  return {
    packageId: manifest.packageId,
    agentId: singleAgent(targets),
    sourceCounts,
    installedCounts,
    missing,
    unsupported,
    leakedSourceOnlyFiles,
    ok: missing.length === 0 && leakedSourceOnlyFiles.length === 0,
  };
}

function emptyCounts(): Record<PackageSurfaceKind, number> {
  return Object.fromEntries(SURFACE_KINDS.map((kind) => [kind, 0])) as Record<PackageSurfaceKind, number>;
}

function singleAgent(targets: readonly AgentSurfaceTarget[]): AgentId | "mixed" {
  const agents = new Set(targets.map((target) => target.agentId));
  return agents.size === 1 ? targets[0]?.agentId ?? "mixed" : "mixed";
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function expandHome(path: string, home: string): string {
  return path.startsWith("~/") ? `${home}/${path.slice(2)}` : path;
}

function mirrorRoot(path: string, relativePath: string): string {
  const normalizedRelative = relativePath.replace(/\\/g, "/");
  const normalizedPath = path.replace(/\\/g, "/");
  if (normalizedPath.endsWith(normalizedRelative)) {
    return normalizedPath.slice(0, -normalizedRelative.length).replace(/\/+$/, "");
  }
  const parts = normalizedPath.split("/");
  parts.pop();
  return parts.join("/");
}

async function findSourceOnlyLeaks(root: string): Promise<string[]> {
  if (!(await exists(root))) return [];
  const leaks: string[] = [];
  async function visit(dir: string): Promise<void> {
    let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
    try {
      entries = await readdir(dir, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = String(entry.name);
      const path = `${dir}/${name}`;
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && (name.endsWith(".original.md") || name.endsWith(".backup.md"))) {
        leaks.push(path);
      }
    }
  }
  await visit(root);
  return leaks;
}
