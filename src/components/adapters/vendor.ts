import { installCaveman } from "../../cli/install.ts";
import {
  installRepomixClaudePlugins,
  installRepomixPackageMirrors,
  uninstallRepomixClaudePlugins,
  uninstallRepomixPackageMirrors,
} from "../../cli/repomix-package.ts";
import { removeAuthoredSkills, syncSkills } from "../../cli/skills.ts";
import { removeUpstreamSkills, syncUpstreamSkills } from "../../cli/upstream-skills.ts";
import { removeCavemanCopies } from "../../cli/uninstall.ts";
import {
  runAstGrepIntegration,
  runGraphifyIntegration,
  runPiMcpAdapterIntegration,
  runTavilyIntegration,
} from "../../cli/vendor-installs.ts";
import {
  installCloudflarePackage,
  installSuperpowersPackage,
  uninstallCloudflarePackage,
  uninstallSuperpowersPackage,
} from "../../cli/vendor-packages.ts";
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
  switch (action.change) {
    case "create-or-update":
    case "enable":
      await installVendor(vendor, dryRun);
      return;
    case "remove":
    case "disable":
      await removeVendor(vendor, dryRun);
      return;
  }
}

async function installVendor(vendor: VendorComponent, dryRun: boolean): Promise<void> {
  switch (vendor) {
    case "skills-authored":
      await syncSkills({ dryRun });
      return;
    case "skills-upstream":
      await syncUpstreamSkills({ dryRun, excludeSources: PACKAGE_OWNED_UPSTREAM_SOURCES });
      return;
    case "caveman":
      await installCaveman(process.env["HOME"] ?? "", { dryRun });
      return;
    case "repomix":
      await installRepomixClaudePlugins({ dryRun });
      await installRepomixPackageMirrors({ dryRun });
      return;
    case "cloudflare":
      await removeUpstreamSkillsIfLockExists({ dryRun, source: CLOUDFLARE_SKILLS_SOURCE });
      await installCloudflarePackage({ dryRun });
      return;
    case "superpowers":
      await installSuperpowersPackage({ dryRun });
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

async function removeVendor(vendor: VendorComponent, dryRun: boolean): Promise<void> {
  switch (vendor) {
    case "skills-authored":
      await removeAuthoredSkills({ dryRun });
      return;
    case "skills-upstream":
      await removeUpstreamSkillsIfLockExists({ dryRun });
      return;
    case "caveman":
      await removeCavemanCopies(process.env["HOME"] ?? "", { dryRun });
      return;
    case "repomix":
      await uninstallRepomixClaudePlugins({ dryRun });
      await uninstallRepomixPackageMirrors({ dryRun });
      return;
    case "cloudflare":
      await uninstallCloudflarePackage({ dryRun });
      await removeUpstreamSkillsIfLockExists({ dryRun, source: CLOUDFLARE_SKILLS_SOURCE });
      return;
    case "superpowers":
      await uninstallSuperpowersPackage({ dryRun });
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
