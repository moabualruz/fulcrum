import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, relative, sep } from "node:path";
import type { AgentId } from "./mcp-registry.ts";

export type PackageSurfaceKind =
  | "skill"
  | "rule"
  | "mcp"
  | "command"
  | "agent"
  | "hook"
  | "tool"
  | "metadata"
  | "asset";

export interface PackageSurface {
  packageId: string;
  kind: PackageSurfaceKind;
  name: string;
  sourcePath: string;
  relativePath: string;
  sha256: string;
  runtimeRequired: boolean;
  packageOwned: boolean;
}

export interface PackageSurfaceManifest {
  packageId: string;
  source: {
    repo?: string;
    ref?: string;
    localPath?: string;
    officialInstallers: Partial<Record<AgentId, readonly string[]>>;
  };
  surfaces: readonly PackageSurface[];
}

export interface AgentSurfaceTarget {
  agentId: AgentId;
  surface: PackageSurface;
  targetPath?: string;
  additionalTargetPaths?: readonly string[];
  configMutation?: string;
  nativeInstaller?: readonly string[];
  support: "native" | "mirror" | "unsupported";
  unsupportedReason?: string;
}

export const MANAGED_PACKAGE_IDS = [
  "package.caveman",
  "package.repomix",
  "package.cloudflare",
  "package.superpowers",
] as const;

export type ManagedPackageId = (typeof MANAGED_PACKAGE_IDS)[number];

const EXCLUDED_SEGMENTS = new Set([
  ".git",
  ".github",
  ".claude",
  "node_modules",
  "_archive",
  "_template",
  "benchmarks",
  "coverage",
  "evals",
  "tests",
  "__pycache__",
  ".venv",
  "worktrees",
]);

const EXCLUDED_SUFFIXES = [
  ".original.md",
  ".backup.md",
];

const PACKAGE_DEFINITIONS: Record<ManagedPackageId, Omit<PackageSurfaceManifest, "surfaces">> = {
  "package.caveman": {
    packageId: "package.caveman",
    source: {
      repo: "https://github.com/JuliusBrussee/caveman",
      officialInstallers: {
        "claude-code": ["claude", "plugin", "install", "caveman@caveman"],
        gemini: ["gemini", "extensions", "install", "https://github.com/JuliusBrussee/caveman"],
      },
    },
  },
  "package.repomix": {
    packageId: "package.repomix",
    source: {
      repo: "https://github.com/yamadashy/repomix",
      officialInstallers: {
        "claude-code": ["claude", "plugin", "install", "repomix-mcp@repomix"],
      },
    },
  },
  "package.cloudflare": {
    packageId: "package.cloudflare",
    source: {
      repo: "https://github.com/cloudflare/skills",
      officialInstallers: {
        "claude-code": ["claude", "plugin", "install", "cloudflare@cloudflare"],
      },
    },
  },
  "package.superpowers": {
    packageId: "package.superpowers",
    source: {
      repo: "https://github.com/obra/superpowers",
      officialInstallers: {
        "claude-code": ["claude", "plugin", "install", "superpowers@claude-plugins-official"],
        gemini: ["gemini", "extensions", "install", "https://github.com/obra/superpowers"],
        opencode: ["opencode", "plugin", "add", "superpowers@git+https://github.com/obra/superpowers.git"],
        pi: ["pi", "install", "https://github.com/obra/superpowers"],
      },
    },
  },
};

const FALLBACK_SURFACES: Record<ManagedPackageId, Array<{ kind: PackageSurfaceKind; name: string; relativePath: string }>> = {
  "package.caveman": [
    { kind: "skill", name: "caveman", relativePath: "skills/caveman/SKILL.md" },
    { kind: "skill", name: "caveman-commit", relativePath: "skills/caveman-commit/SKILL.md" },
    { kind: "skill", name: "caveman-help", relativePath: "skills/caveman-help/SKILL.md" },
    { kind: "skill", name: "caveman-review", relativePath: "skills/caveman-review/SKILL.md" },
    { kind: "skill", name: "compress", relativePath: "skills/compress/SKILL.md" },
    { kind: "command", name: "caveman", relativePath: "commands/caveman.toml" },
    { kind: "hook", name: "caveman-activate", relativePath: "hooks/caveman-activate.js" },
    { kind: "rule", name: "AGENTS", relativePath: "AGENTS.md" },
    { kind: "metadata", name: "claude-plugin", relativePath: ".claude-plugin/plugin.json" },
  ],
  "package.repomix": [
    { kind: "skill", name: "repomix-pack-local", relativePath: "skills/repomix-pack-local/SKILL.md" },
    { kind: "skill", name: "repomix-pack-remote", relativePath: "skills/repomix-pack-remote/SKILL.md" },
    { kind: "skill", name: "repomix-explorer", relativePath: "skills/repomix-explorer/SKILL.md" },
    { kind: "skill", name: "repomix-explore-local", relativePath: "skills/repomix-explore-local/SKILL.md" },
    { kind: "skill", name: "repomix-explore-remote", relativePath: "skills/repomix-explore-remote/SKILL.md" },
    { kind: "mcp", name: "repomix", relativePath: ".mcp.json" },
    { kind: "command", name: "pack-local", relativePath: "commands/pack-local.md" },
    { kind: "command", name: "pack-remote", relativePath: "commands/pack-remote.md" },
    { kind: "command", name: "explore-local", relativePath: "commands/explore-local.md" },
    { kind: "command", name: "explore-remote", relativePath: "commands/explore-remote.md" },
    { kind: "agent", name: "repomix-explorer", relativePath: "agents/explorer.md" },
    { kind: "rule", name: "base", relativePath: "rules/base.md" },
    { kind: "metadata", name: "codex-plugin", relativePath: ".codex-plugin/plugin.json" },
  ],
  "package.cloudflare": [
    { kind: "skill", name: "workers-best-practices", relativePath: "skills/workers-best-practices/SKILL.md" },
    { kind: "skill", name: "wrangler", relativePath: "skills/wrangler/SKILL.md" },
    { kind: "skill", name: "cloudflare", relativePath: "skills/cloudflare/SKILL.md" },
    { kind: "skill", name: "durable-objects", relativePath: "skills/durable-objects/SKILL.md" },
    { kind: "skill", name: "agents-sdk", relativePath: "skills/agents-sdk/SKILL.md" },
    { kind: "skill", name: "sandbox-sdk", relativePath: "skills/sandbox-sdk/SKILL.md" },
    { kind: "skill", name: "web-perf", relativePath: "skills/web-perf/SKILL.md" },
    { kind: "skill", name: "cloudflare-email-service", relativePath: "skills/cloudflare-email-service/SKILL.md" },
    { kind: "mcp", name: "cloudflare-api", relativePath: ".mcp.json" },
    { kind: "command", name: "wrangler", relativePath: "commands/wrangler.md" },
    { kind: "command", name: "deploy", relativePath: "commands/deploy.md" },
    { kind: "metadata", name: "claude-plugin", relativePath: ".claude-plugin/plugin.json" },
    { kind: "asset", name: "icon", relativePath: "assets/icon.png" },
  ],
  "package.superpowers": [
    { kind: "skill", name: "using-superpowers", relativePath: "skills/using-superpowers/SKILL.md" },
    { kind: "skill", name: "brainstorming", relativePath: "skills/brainstorming/SKILL.md" },
    { kind: "skill", name: "test-driven-development", relativePath: "skills/test-driven-development/SKILL.md" },
    { kind: "skill", name: "verification-before-completion", relativePath: "skills/verification-before-completion/SKILL.md" },
    { kind: "command", name: "use-superpowers", relativePath: "commands/use-superpowers.md" },
    { kind: "command", name: "review", relativePath: "commands/review.md" },
    { kind: "agent", name: "code-reviewer", relativePath: "agents/code-reviewer.md" },
    { kind: "hook", name: "hooks", relativePath: "hooks.json" },
    { kind: "metadata", name: "plugin", relativePath: ".claude-plugin/plugin.json" },
    { kind: "asset", name: "README", relativePath: "README.md" },
  ],
};

export function isKnownPackageId(packageId: string): packageId is ManagedPackageId {
  return (MANAGED_PACKAGE_IDS as readonly string[]).includes(packageId);
}

export function packageCacheSourceRoot(packageId: ManagedPackageId, home: string = process.env["HOME"] ?? ""): string {
  const fulcrumHome = process.env["FULCRUM_HOME"] ?? `${home}/.fulcrum`;
  switch (packageId) {
    case "package.caveman":
      return `${fulcrumHome}/cache/caveman`;
    case "package.cloudflare":
      return `${fulcrumHome}/cache/cloudflare-skills`;
    case "package.repomix":
      return `${fulcrumHome}/cache/repomix`;
    case "package.superpowers":
      return `${fulcrumHome}/cache/superpowers`;
  }
}

export function isMirrorablePackagePath(relativePath: string): boolean {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || normalized.startsWith("../") || normalized === "..") return false;
  const segments = normalized.split("/");
  if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) return false;
  return !EXCLUDED_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export async function discoverPackageSurfaces(packageId: ManagedPackageId, sourceRoot: string): Promise<PackageSurface[]> {
  const root = sourceRoot.replace(/\/+$/, "");
  const files = await walkFiles(root);
  const surfaces: PackageSurface[] = [];
  for (const sourcePath of files) {
    const relativePath = normalizeRelativePath(relative(root, sourcePath));
    if (!isMirrorablePackagePath(relativePath)) continue;
    const kind = classifySurface(relativePath);
    if (kind === null) continue;
    const bytes = await readFile(sourcePath);
    surfaces.push({
      packageId,
      kind,
      name: surfaceName(kind, relativePath),
      sourcePath,
      relativePath,
      sha256: sha256(bytes),
      runtimeRequired: true,
      packageOwned: true,
    });
  }
  return surfaces.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export async function getPackageSurfaceManifest(
  packageId: string,
  opts: { sourceRoot?: string } = {},
): Promise<PackageSurfaceManifest> {
  if (!isKnownPackageId(packageId)) {
    throw new Error(`unknown package surface manifest: ${packageId}`);
  }
  const definition = PACKAGE_DEFINITIONS[packageId];
  const surfaces = opts.sourceRoot
    ? await discoverPackageSurfaces(packageId, opts.sourceRoot)
    : fallbackSurfaces(packageId);
  return {
    ...definition,
    source: {
      ...definition.source,
      ...(opts.sourceRoot ? { localPath: opts.sourceRoot } : {}),
    },
    surfaces,
  };
}

function fallbackSurfaces(packageId: ManagedPackageId): PackageSurface[] {
  return FALLBACK_SURFACES[packageId].map((surface) => ({
    packageId,
    kind: surface.kind,
    name: surface.name,
    sourcePath: `${packageId}:${surface.relativePath}`,
    relativePath: surface.relativePath,
    sha256: sha256(Buffer.from(`${packageId}:${surface.relativePath}:${surface.kind}:${surface.name}`)),
    runtimeRequired: true,
    packageOwned: true,
  })).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function walkFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  async function visit(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (EXCLUDED_SEGMENTS.has(entry.name)) continue;
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        output.push(path);
      }
    }
  }
  await visit(root);
  return output;
}

function classifySurface(relativePath: string): PackageSurfaceKind | null {
  const segments = relativePath.split("/");
  const file = segments.at(-1) ?? "";
  if (relativePath === ".mcp.json" || relativePath === "mcp.json" || file === ".mcp.json" || file === "mcp.json") return "mcp";
  if (file === "SKILL.md" && (segments[0] === "skills" || segments.length >= 2)) return "skill";
  if (segments[0] === "commands" && [".md", ".toml"].includes(extname(file))) return "command";
  if ((segments[0] === "agents" || segments[0] === "subagents") && [".md", ".toml", ".json"].includes(extname(file))) return "agent";
  if (file === "hooks.json" || segments[0] === "hooks") return "hook";
  if (["AGENTS.md", "CLAUDE.md", "GEMINI.md"].includes(file) || ["rules", "context", "configs"].includes(segments[0] ?? "")) return "rule";
  if (segments[0] === "tools" || segments[0] === "bin" || segments[0] === "scripts") return "tool";
  if (segments[0] === "assets" || segments[0] === "templates" || segments[0] === "themes" || segments[0] === "docs") return "asset";
  if (
    segments[0] === ".claude-plugin" ||
    segments[0] === ".codex-plugin" ||
    file === "gemini-extension.json" ||
    file === "package.json" ||
    file === ".app.json" ||
    file === "README.md" ||
    file === "LICENSE"
  ) return "metadata";
  return "asset";
}

function surfaceName(kind: PackageSurfaceKind, relativePath: string): string {
  const segments = relativePath.split("/");
  if (kind === "skill" && segments.length >= 2) return segments.at(-2)!;
  if ((kind === "command" || kind === "agent") && segments.length >= 2) return basename(relativePath, extname(relativePath));
  if (kind === "mcp") return basename(relativePath);
  return basename(relativePath, extname(relativePath));
}

function normalizeRelativePath(path: string): string {
  return path.split(sep).join("/");
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
