import { BUILTIN_MCPS } from "@fulcrum/cli/mcp-builtins.ts";
import type { ComponentSpec } from "./types.ts";

export const HOOKS = [
  "format",
  "lint-gate",
  "pm-policy",
  "test-on-edit",
  "audit-log",
  "index-check",
  "index-rebuild",
  "tool-output-router",
] as const;

const DEFAULT_PROFILE_MEMBERS = [
  "policy.tool-output",
  "rules.global",
  "package.caveman",
  "skills.authored",
  "skills.upstream",
  "package.cloudflare",
  "package.superpowers",
  "mcp.deepwiki",
  "mcp.registry",
] as const;

const DEFAULT_PROFILE_MEMBER_IDS = new Set<string>(DEFAULT_PROFILE_MEMBERS);

const MINIMAL_PROFILE_MEMBERS = [
  "policy.tool-output",
  "rules.global",
  "mcp.registry",
  "mcp.deepwiki",
] as const;

function hookComponent(name: (typeof HOOKS)[number]): ComponentSpec {
  const id = `hooks.${name}`;
  return {
    id,
    kind: "hook",
    description: `${name} hook registration`,
    surfaces: [
      {
        id: `${id}:registration`,
        kind: "hook-registration",
        componentId: id,
        target: `hook:${name}`,
        ownerKey: `fulcrum:hook:${name}`,
        removePolicy: "managed-only",
        supportsDisable: true,
        payload: { recipe: name },
      },
    ],
  };
}

function mcpComponent(name: string): ComponentSpec {
  const id = `mcp.${name}`;
  return {
    id,
    kind: "mcp",
    description: `${name} MCP registry entry`,
    defaultProfile: DEFAULT_PROFILE_MEMBER_IDS.has(id) ? true : undefined,
    surfaces: [
      {
        id: `${id}:registry`,
        kind: "mcp-registry-entry",
        componentId: id,
        target: `mcp:${name}`,
        ownerKey: `fulcrum:mcp:${name}`,
        removePolicy: "managed-only",
        supportsDisable: true,
        payload: { name },
      },
    ],
  };
}

export const MCP_COMPONENTS: readonly ComponentSpec[] = BUILTIN_MCPS.map(({ name }) => mcpComponent(name));

const VERIFY_ALL_PROFILE_MEMBERS = [
  "profile.default",
  ...MCP_COMPONENTS.map((component) => component.id),
] as const;

export const ALL_COMPONENTS: readonly ComponentSpec[] = [
  {
    id: "profile.default",
    kind: "profile",
    description: "default Fulcrum setup profile",
    surfaces: [],
    profileMembers: [...DEFAULT_PROFILE_MEMBERS],
  },
  {
    id: "profile.minimal",
    kind: "profile",
    description: "minimal Fulcrum setup profile",
    surfaces: [],
    profileMembers: [...MINIMAL_PROFILE_MEMBERS],
  },
  {
    id: "profile.rules-only",
    kind: "profile",
    description: "cross-agent rules-only setup profile",
    surfaces: [],
    profileMembers: ["rules.global"],
  },
  {
    id: "profile.verify-all",
    kind: "profile",
    description: "verification profile covering all managed component surfaces",
    verifyAllProfile: true,
    surfaces: [],
    profileMembers: [...VERIFY_ALL_PROFILE_MEMBERS],
  },
  {
    id: "policy.tool-output",
    kind: "policy",
    description: "tool output policy seed",
    defaultProfile: true,
    surfaces: [
      {
        id: "policy.tool-output:file",
        kind: "policy-seed",
        componentId: "policy.tool-output",
        target: "~/.fulcrum/tool-output-policy.toml",
        ownerKey: "fulcrum:policy:tool-output",
        removePolicy: "keep-modified",
      },
    ],
  },
  {
    id: "rules.global",
    kind: "rules",
    description: "cross-agent rules sentinel block",
    defaultProfile: true,
    surfaces: [
      {
        id: "rules.global:sentinel",
        kind: "sentinel-block",
        componentId: "rules.global",
        target: "agent-rules-files",
        ownerKey: "FULCRUM RULES",
        removePolicy: "sentinel-only",
      },
    ],
  },
  ...HOOKS.map((name) => hookComponent(name)),
  {
    id: "skills.authored",
    kind: "skill",
    description: "Fulcrum-authored skills",
    defaultProfile: true,
    surfaces: [
      {
        id: "skills.authored:sync",
        kind: "skill-sync",
        componentId: "skills.authored",
        target: "agent-skill-roots",
        ownerKey: "fulcrum:skills:authored",
        removePolicy: "managed-only",
      },
    ],
  },
  {
    id: "skills.upstream",
    kind: "skill",
    description: "pinned upstream skills",
    defaultProfile: true,
    surfaces: [
      {
        id: "skills.upstream:sync",
        kind: "upstream-skill-sync",
        componentId: "skills.upstream",
        target: "vendor-skill-roots",
        ownerKey: "fulcrum:skills:upstream",
        removePolicy: "managed-only",
      },
    ],
  },
  vendorPackageComponent("caveman"),
  vendorPackageComponent("cloudflare"),
  vendorPackageComponent("superpowers"),
  vendorPackageComponent("ast-grep"),
  vendorPackageComponent("tavily"),
  vendorPackageComponent("pi-mcp-adapter"),
  {
    id: "mcp.registry",
    kind: "mcp",
    description: "Fulcrum MCP registry file",
    defaultProfile: true,
    surfaces: [
      {
        id: "mcp.registry:entries",
        kind: "mcp-registry-entry",
        componentId: "mcp.registry",
        target: "~/.fulcrum/state/global/mcp-registry.toml",
        ownerKey: "fulcrum:mcp:registry",
        removePolicy: "managed-only",
      },
    ],
  },
  ...MCP_COMPONENTS,
];

const COMPONENTS_BY_ID = new Map(ALL_COMPONENTS.map((component) => [component.id, component]));

export function getComponent(id: string): ComponentSpec | null {
  return COMPONENTS_BY_ID.get(id) ?? null;
}

export function expandProfile(id: string): ComponentSpec[] {
  const profile = getComponent(id);
  if (profile === null || profile.kind !== "profile") {
    return [];
  }

  const expanded: ComponentSpec[] = [];
  const seen = new Set<string>();
  const visitingProfiles = new Set<string>();

  function visit(componentId: string): void {
    const component = getComponent(componentId);
    if (component === null) {
      throw new Error(`Unknown profile member: ${componentId}`);
    }
    if (component.kind === "profile") {
      if (visitingProfiles.has(component.id)) {
        throw new Error(`Profile cycle detected: ${component.id}`);
      }
      visitingProfiles.add(component.id);
      try {
        for (const memberId of component.profileMembers ?? []) {
          visit(memberId);
        }
      } finally {
        visitingProfiles.delete(component.id);
      }
      return;
    }
    if (seen.has(component.id)) {
      return;
    }
    seen.add(component.id);
    expanded.push(component);
  }

  for (const memberId of profile.profileMembers ?? []) {
    visit(memberId);
  }

  return expanded;
}

function vendorPackageComponent(
  name:
    | "caveman"
    | "cloudflare"
    | "superpowers"
    | "ast-grep"
    | "tavily"
    | "pi-mcp-adapter",
): ComponentSpec {
  const id = `package.${name}`;
  return {
    id,
    kind: "package",
    description: `${name} managed package surfaces`,
    defaultProfile: DEFAULT_PROFILE_MEMBER_IDS.has(id) ? true : undefined,
    surfaces: [
      {
        id: `${id}:install`,
        kind: "vendor-command",
        componentId: id,
        target: `agent-${name}-surfaces`,
        ownerKey: `fulcrum:package:${name}`,
        removePolicy: name === "caveman" ? "purgeable" : "managed-only",
        payload: { name },
      },
    ],
  };
}
