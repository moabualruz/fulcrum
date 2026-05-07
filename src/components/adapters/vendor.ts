import { installCaveman } from "@fulcrum/cli/install.ts";
import {
  installRepomixClaudePlugins,
  installRepomixPackageMirrors,
  uninstallRepomixClaudePlugins,
  uninstallRepomixPackageMirrors,
} from "@fulcrum/cli/repomix-package.ts";
import { removeAuthoredSkills, syncSkills } from "@fulcrum/cli/skills.ts";
import { removeUpstreamSkills, syncUpstreamSkills } from "@fulcrum/cli/upstream-skills.ts";
import { removeCavemanCopies } from "@fulcrum/cli/uninstall.ts";
import {
  runAstGrepIntegration,
  runGraphifyIntegration,
  runPiMcpAdapterIntegration,
  runTavilyIntegration,
} from "@fulcrum/cli/vendor-installs.ts";
import {
  installCloudflarePackage,
  installSuperpowersPackage,
  uninstallCloudflarePackage,
  uninstallSuperpowersPackage,
} from "@fulcrum/cli/vendor-packages.ts";
import type { AgentId } from "@fulcrum/cli/mcp-registry.ts";
import type { ComponentAction } from "../types.ts";

const CLOUDFLARE_SKILLS_SOURCE = "https://github.com/cloudflare/skills";
const PACKAGE_OWNED_UPSTREAM_SOURCES = [CLOUDFLARE_SKILLS_SOURCE] as const;

export type VendorComponent =
  | "skills-authored"
  | "skills-upstream"
  | "caveman"
  | "repomix"
  | "cloudflare"
  | "superpowers"
  | "graphify"
  | "ast-grep"
  | "tavily"
  | "pi-mcp-adapter";

export function classifyVendorComponent(componentId: string): VendorComponent {
  switch (componentId) {
    case "skills.authored":
      return "skills-authored";
    case "skills.upstream":
      return "skills-upstream";
    case "package.caveman":
      return "caveman";
    case "package.repomix":
      return "repomix";
    case "package.cloudflare":
      return "cloudflare";
    case "package.superpowers":
      return "superpowers";
    case "package.graphify":
      return "graphify";
    case "package.ast-grep":
      return "ast-grep";
    case "package.tavily":
      return "tavily";
    case "package.pi-mcp-adapter":
      return "pi-mcp-adapter";
    default:
      throw new Error(`unsupported vendor component: ${componentId}`);
  }
}

export async function applyVendorAction(action: ComponentAction, dryRun: boolean): Promise<void> {
  if (action.change === "noop" || action.change === "preserve") return;

  const vendor = classifyVendorComponent(action.componentId);
  const agents = action.agentId === undefined ? undefined : [action.agentId];
  switch (action.change) {
    case "create-or-update":
    case "enable":
      await installVendor(vendor, dryRun, agents);
      return;
    case "remove":
    case "disable":
      await removeVendor(vendor, dryRun, agents);
      return;
  }
}

async function installVendor(
  vendor: VendorComponent,
  dryRun: boolean,
  agents: readonly AgentId[] | undefined,
): Promise<void> {
  switch (vendor) {
    case "skills-authored":
      await syncSkills({ dryRun, agents, codexScope: agents?.includes("codex") ? "global" : undefined });
      return;
    case "skills-upstream":
      await syncUpstreamSkills({ dryRun, agents, excludeSources: PACKAGE_OWNED_UPSTREAM_SOURCES });
      return;
    case "caveman":
      await installCaveman(process.env["HOME"] ?? "", { dryRun });
      return;
    case "repomix":
      await installRepomixClaudePlugins({ dryRun, agents });
      await installRepomixPackageMirrors({ dryRun, agents });
      return;
    case "cloudflare":
      await removeUpstreamSkillsIfLockExists({ dryRun, agents, source: CLOUDFLARE_SKILLS_SOURCE });
      await installCloudflarePackage({ dryRun, agents });
      return;
    case "superpowers":
      await installSuperpowersPackage({ dryRun, agents });
      return;
    case "graphify":
      await runGraphifyIntegration(process.cwd(), process.env["HOME"] ?? "", dryRun);
      return;
    case "ast-grep":
      await runAstGrepIntegration(process.cwd(), dryRun);
      return;
    case "tavily":
      await runTavilyIntegration(process.cwd(), dryRun);
      return;
    case "pi-mcp-adapter":
      await runPiMcpAdapterIntegration(process.cwd(), process.env["HOME"] ?? "", dryRun);
      return;
  }
}

async function removeVendor(
  vendor: VendorComponent,
  dryRun: boolean,
  agents: readonly AgentId[] | undefined,
): Promise<void> {
  switch (vendor) {
    case "skills-authored":
      await removeAuthoredSkills({ dryRun, agents });
      return;
    case "skills-upstream":
      await removeUpstreamSkillsIfLockExists({ dryRun, agents });
      return;
    case "caveman":
      await removeCavemanCopies(process.env["HOME"] ?? "", { dryRun });
      return;
    case "repomix":
      await uninstallRepomixClaudePlugins({ dryRun, agents });
      await uninstallRepomixPackageMirrors({ dryRun, agents });
      return;
    case "cloudflare":
      await uninstallCloudflarePackage({ dryRun, agents });
      await removeUpstreamSkillsIfLockExists({ dryRun, agents, source: CLOUDFLARE_SKILLS_SOURCE });
      return;
    case "superpowers":
      await uninstallSuperpowersPackage({ dryRun, agents });
      return;
    case "graphify":
      console.log("     · graphify removal is manual: vendor installer does not publish a safe uninstall command");
      return;
    case "ast-grep":
      console.log("     · ast-grep removal is manual: npx skills add does not publish a safe uninstall command");
      return;
    case "tavily":
      console.log("     · tavily removal is manual: npx skills add does not publish a safe uninstall command");
      return;
    case "pi-mcp-adapter":
      console.log("     · pi-mcp-adapter removal is manual: Pi adapter package does not publish a safe uninstall command");
      return;
  }
}

async function removeUpstreamSkillsIfLockExists(
  opts: Parameters<typeof removeUpstreamSkills>[0],
): Promise<void> {
  try {
    await removeUpstreamSkills(opts);
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
    console.log("     · upstream skills lock not available — skip vendor skill mirror removal");
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
