import type { AgentId } from "./mcp-registry.ts";
import type { AgentSurfaceTarget, PackageSurface, PackageSurfaceKind, PackageSurfaceManifest } from "./package-surfaces.ts";

const MIRROR_ROOTS: Record<AgentId, string> = {
  "claude-code": "~/.claude/plugins/cache",
  codex: "~/.codex/plugins/cache",
  gemini: "~/.gemini/extensions",
  opencode: "~/.config/opencode",
  pi: "~/.pi/agent",
};

const SUPPORT_MATRIX: Record<AgentId, ReadonlySet<PackageSurfaceKind>> = {
  "claude-code": new Set(),
  codex: new Set(["skill", "rule", "mcp", "command", "agent", "hook", "metadata", "asset", "tool"]),
  gemini: new Set(["skill", "rule", "mcp", "command", "agent", "hook", "metadata", "asset", "tool"]),
  opencode: new Set(["skill", "rule", "mcp", "command", "agent", "hook", "metadata", "asset", "tool"]),
  pi: new Set(["skill", "rule", "mcp", "command", "agent", "hook", "metadata", "asset", "tool"]),
};

export function packageSlug(packageId: string): string {
  return packageId.replace(/^package\./, "");
}

export function planPackageMirrorTargets(
  manifest: PackageSurfaceManifest,
  agents: readonly AgentId[],
): AgentSurfaceTarget[] {
  return agents.flatMap((agentId) =>
    manifest.surfaces.map((surface) => planSurfaceTarget(manifest, agentId, surface)),
  );
}

function planSurfaceTarget(
  manifest: PackageSurfaceManifest,
  agentId: AgentId,
  surface: PackageSurface,
): AgentSurfaceTarget {
  const nativeInstaller = manifest.source.officialInstallers[agentId];
  if (nativeInstaller !== undefined && nativeInstaller.length > 0) {
    return {
      agentId,
      surface,
      nativeInstaller,
      support: "native",
    };
  }

  if (manifest.packageId === "package.repomix" && agentId === "pi" && surface.kind === "agent") {
    return {
      agentId,
      surface,
      support: "unsupported",
      unsupportedReason: "Pi has no Fulcrum-safe standalone explorer-agent primitive; Fulcrum installs skills/prompts/rules/MCP plus an unsupported-agent note",
    };
  }

  if (!SUPPORT_MATRIX[agentId].has(surface.kind)) {
    return {
      agentId,
      surface,
      support: "unsupported",
      unsupportedReason: `${agentId} has no Fulcrum-safe mirror primitive for package ${surface.kind} surfaces`,
    };
  }

  return {
    agentId,
    surface,
    targetPath: targetPathFor(agentId, manifest.packageId, surface),
    configMutation: configMutationFor(agentId, surface),
    support: "mirror",
  };
}

function targetPathFor(agentId: AgentId, packageId: string, surface: PackageSurface): string {
  const slug = packageSlug(packageId);
  const packageSpecific = packageSpecificTarget(agentId, packageId, slug, surface);
  if (packageSpecific !== null) return packageSpecific;
  if (agentId === "codex") {
    return `${MIRROR_ROOTS.codex}/${slug}/${slug}/1.0.0/${surface.relativePath}`;
  }
  if (agentId === "gemini") {
    return `${MIRROR_ROOTS.gemini}/${slug}/${surface.relativePath}`;
  }
  if (agentId === "opencode") {
    return opencodeTarget(slug, surface);
  }
  if (agentId === "pi") {
    return `${MIRROR_ROOTS.pi}/packages/${slug}/${surface.relativePath}`;
  }
  return `${MIRROR_ROOTS["claude-code"]}/${slug}/${surface.relativePath}`;
}

function packageSpecificTarget(
  agentId: AgentId,
  packageId: string,
  slug: string,
  surface: PackageSurface,
): string | null {
  if (packageId === "package.cloudflare") {
    return fullPackageRoot(agentId, slug, surface.relativePath);
  }
  if (packageId === "package.superpowers" && agentId === "codex") {
    return `${MIRROR_ROOTS.codex}/${slug}/${slug}/1.0.0/${surface.relativePath}`;
  }
  if (packageId === "package.caveman") {
    if (agentId === "codex") {
      return `${MIRROR_ROOTS.codex}/${slug}/${slug}/0.1.0/package/${surface.relativePath}`;
    }
    if (agentId === "opencode" || agentId === "pi") {
      return fullPackageRoot(agentId, slug, surface.relativePath);
    }
  }
  if (packageId === "package.repomix") {
    return repomixTarget(agentId, surface);
  }
  return null;
}

function fullPackageRoot(agentId: AgentId, slug: string, relativePath: string): string {
  if (agentId === "codex") return `${MIRROR_ROOTS.codex}/${slug}/${slug}/1.0.0/${relativePath}`;
  if (agentId === "gemini") return `${MIRROR_ROOTS.gemini}/${slug}/${relativePath}`;
  if (agentId === "opencode") return `${MIRROR_ROOTS.opencode}/packages/${slug}/${relativePath}`;
  if (agentId === "pi") return `${MIRROR_ROOTS.pi}/packages/${slug}/${relativePath}`;
  return `${MIRROR_ROOTS["claude-code"]}/${slug}/${relativePath}`;
}

function repomixTarget(agentId: AgentId, surface: PackageSurface): string | null {
  if (agentId === "codex") {
    if (surface.kind === "agent") {
      return `${MIRROR_ROOTS.codex}/repomix/repomix/1.0.0/agents/${surface.name}.md`;
    }
    return `${MIRROR_ROOTS.codex}/repomix/repomix/1.0.0/${surface.relativePath}`;
  }
  if (agentId === "gemini") {
    switch (surface.kind) {
      case "command":
        return `${MIRROR_ROOTS.gemini}/repomix/commands/${surface.name}.toml`;
      case "mcp":
      case "metadata":
        return `${MIRROR_ROOTS.gemini}/repomix/gemini-extension.json`;
      default:
        return `${MIRROR_ROOTS.gemini}/repomix/${surface.relativePath}`;
    }
  }
  if (agentId === "opencode") {
    switch (surface.kind) {
      case "skill":
        return `${MIRROR_ROOTS.opencode}/skills/${surface.name}/SKILL.md`;
      case "command":
        return `${MIRROR_ROOTS.opencode}/commands/${surface.name}.md`;
      case "agent":
        return `${MIRROR_ROOTS.opencode}/agents/${surface.name}.md`;
      case "mcp":
        return `${MIRROR_ROOTS.opencode}/opencode.json`;
      case "rule":
        return `${MIRROR_ROOTS.opencode}/rules/repomix/base.md`;
      case "metadata":
        return `${MIRROR_ROOTS.opencode}/packages/repomix/package.json`;
      default:
        return `${MIRROR_ROOTS.opencode}/packages/repomix/${surface.relativePath}`;
    }
  }
  if (agentId === "pi") {
    switch (surface.kind) {
      case "skill":
        return `${MIRROR_ROOTS.pi}/skills/${surface.name}/SKILL.md`;
      case "command":
        return `${MIRROR_ROOTS.pi}/prompts/${surface.name}.md`;
      case "agent":
        return `${MIRROR_ROOTS.pi}/agents/repomix-explorer.unsupported.md`;
      case "mcp":
        return `${MIRROR_ROOTS.pi}/mcp.json`;
      case "rule":
        return `${MIRROR_ROOTS.pi}/rules/repomix/base.md`;
      case "metadata":
        return `${MIRROR_ROOTS.pi}/packages/repomix/package.json`;
      default:
        return `${MIRROR_ROOTS.pi}/packages/repomix/${surface.relativePath}`;
    }
  }
  return null;
}

function opencodeTarget(slug: string, surface: PackageSurface): string {
  switch (surface.kind) {
    case "skill":
      return `${MIRROR_ROOTS.opencode}/skills/${surface.name}/SKILL.md`;
    case "agent":
      return `${MIRROR_ROOTS.opencode}/agents/${surface.name}.md`;
    case "command":
      return `${MIRROR_ROOTS.opencode}/commands/${slug}/${surface.name}.md`;
    case "mcp":
      return `${MIRROR_ROOTS.opencode}/opencode.json`;
    default:
      return `${MIRROR_ROOTS.opencode}/packages/${slug}/${surface.relativePath}`;
  }
}

function configMutationFor(agentId: AgentId, surface: PackageSurface): string | undefined {
  if (surface.kind === "mcp") return `${agentId}:mcp`;
  if (surface.kind === "hook") return `${agentId}:hooks`;
  if (surface.kind === "metadata") return `${agentId}:package-metadata`;
  return undefined;
}
