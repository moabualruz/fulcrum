import type { AgentId } from "../cli/mcp-registry.ts";

export type ComponentKind = "profile" | "rules" | "policy" | "hook" | "skill" | "package" | "mcp";
export type SurfaceKind = "sentinel-block" | "policy-seed" | "hook-registration" | "skill-sync" | "upstream-skill-sync" | "mcp-registry-entry" | "mcp-agent-config" | "vendor-command" | "directory-copy" | "file-copy" | "json-patch" | "toml-block";
export type Operation = "install" | "remove" | "enable" | "disable" | "status";
export type RemovePolicy = "managed-only" | "sentinel-only" | "keep-modified" | "purgeable";

export interface ComponentSpec {
  readonly id: string;
  readonly kind: ComponentKind;
  readonly description: string;
  /** Component is included by default/default install state; this does not mean the component is a profile. */
  readonly defaultProfile?: boolean;
  readonly verifyAllProfile?: boolean;
  readonly dependsOn?: readonly string[];
  readonly conflictsWith?: readonly string[];
  readonly surfaces: readonly SurfaceSpec[];
  readonly profileMembers?: readonly string[];
}

export interface SurfaceSpec {
  readonly id: string;
  readonly kind: SurfaceKind;
  readonly componentId: string;
  readonly agents?: readonly AgentId[];
  readonly target: string;
  readonly ownerKey: string;
  readonly removePolicy: RemovePolicy;
  readonly supportsDisable?: boolean;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface ComponentAction {
  id: string;
  componentId: string;
  surfaceId: string;
  agentId?: AgentId;
  operation: Exclude<Operation, "status">;
  kind: SurfaceKind;
  target: string;
  change: "create-or-update" | "remove" | "enable" | "disable" | "noop" | "preserve";
  risk: "managed" | "external-command" | "modified-user-file";
  reason: string;
  payload?: Record<string, unknown>;
}

export interface ComponentPlan {
  operation: Exclude<Operation, "status">;
  target: string;
  profile: string | null;
  agents: AgentId[];
  actions: ComponentAction[];
  warnings: string[];
}
