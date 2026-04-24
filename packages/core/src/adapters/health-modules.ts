import { execa } from "execa";
import type { AdapterMetadata, CapabilityHealthRecord } from "@fulcrum/shared";
import type { AdapterPreview, FulcrumAdapter } from "./adapter.js";

export type AdapterCategory =
  | "memory"
  | "code_tool"
  | "semantic_search"
  | "cli_agent"
  | "telemetry"
  | "remote_provider";

export interface HealthModuleOptions {
  adapterId: string;
  category: AdapterCategory;
  name: string;
  enabled?: boolean;
  command?: string;
  args?: string[];
  networkRequired?: boolean;
  credentialEnv?: string;
  affectedWorkflows: string[];
  localFallback?: string[];
  supported?: string[];
  optional?: string[];
  policyGated?: string[];
  privacyNotes?: string;
}

export class ToolHealthAdapter implements FulcrumAdapter {
  metadata: AdapterMetadata;
  private disabledReason: string | undefined;

  constructor(private readonly options: HealthModuleOptions) {
    this.metadata = {
      adapterId: options.adapterId,
      category: options.category,
      name: options.name,
      enabled: options.enabled ?? false,
      ownershipBoundary: `${options.name} reports tool availability; Fulcrum retains local canonical state.`,
      networkRequired: options.networkRequired ?? false,
      credentialStatus: this.readCredentialStatus(),
      privacyNotes:
        options.privacyNotes ??
        "Credentials are reported by status only; secret values are never returned.",
      offlineBehavior: "Local Fulcrum records remain usable; optional adapter workflows degrade.",
      disablementBehavior: "Disabling preserves Fulcrum-owned local history and provenance.",
      importExportStrategy: "Export local adapter metadata and provenance without credentials.",
      rebuildStrategy: "Re-run health checks and mark unavailable sources degraded."
    };
  }

  async healthCheck(): Promise<CapabilityHealthRecord> {
    this.metadata.credentialStatus = this.readCredentialStatus();
    const now = new Date().toISOString();
    if (!this.metadata.enabled) {
      return this.record(
        "disabled",
        false,
        this.disabledReason ?? "Adapter disabled.",
        "Enable adapter if needed.",
        now
      );
    }
    if (this.metadata.credentialStatus === "not_configured") {
      return this.record(
        "guided",
        false,
        "Credentials not configured.",
        "Configure credentials through an approved local mechanism.",
        now
      );
    }
    if (!this.options.command) {
      return this.record("managed", false, undefined, "No action needed.", now);
    }
    try {
      await execa(this.options.command, this.options.args ?? ["--version"], { timeout: 2500 });
      return this.record("managed", false, undefined, "No action needed.", now);
    } catch {
      return this.record(
        "degraded",
        false,
        `${this.options.command} unavailable.`,
        `Install ${this.options.name} or disable this adapter.`,
        now
      );
    }
  }

  async describeCapabilities() {
    return {
      supported: this.options.supported ?? ["health_check"],
      optional: this.options.optional ?? [],
      unavailable: this.metadata.enabled ? [] : ["execute"],
      localFallback: this.options.localFallback ?? ["Fulcrum local state remains available."],
      policyGated: this.options.policyGated ?? []
    };
  }

  async preview(operation: string): Promise<AdapterPreview> {
    const policyRequirements = this.options.policyGated?.length
      ? this.options.policyGated
      : this.metadata.networkRequired
        ? ["remote_provider"]
        : [];
    return {
      effects: [`Preview ${operation} on ${this.metadata.name}.`],
      recordsAffected: [this.metadata.adapterId],
      externalVisibility: this.metadata.networkRequired ? "remote" : "none",
      policyRequirements,
      redactionStatus: "not_applicable",
      dataSharedExternally: []
    };
  }

  async execute(operation = "execute", _input?: unknown, policyDecisionId?: string) {
    if (
      (this.metadata.networkRequired || (this.options.policyGated?.length ?? 0) > 0) &&
      !policyDecisionId
    ) {
      throw new Error(
        `Policy decision required before ${operation} on ${this.metadata.adapterId}.`
      );
    }
    return this.healthCheck();
  }

  async disable(reason: string): Promise<void> {
    this.disabledReason = reason;
    this.metadata.enabled = false;
  }

  async exportLocalState() {
    return { metadata: { ...this.metadata, credentialStatus: this.metadata.credentialStatus } };
  }

  async rebuild() {
    return this.healthCheck();
  }

  private readCredentialStatus(): AdapterMetadata["credentialStatus"] {
    if (!this.options.credentialEnv) {
      return "not_required";
    }
    return process.env[this.options.credentialEnv] ? "configured" : "not_configured";
  }

  private record(
    state: CapabilityHealthRecord["state"],
    blocking: boolean,
    cause: string | undefined,
    nextAction: string | undefined,
    freshness: string
  ): CapabilityHealthRecord {
    return {
      capabilityId: `cap_${this.metadata.adapterId}`,
      state,
      blocking,
      cause,
      nextAction,
      privacyStatus: this.metadata.networkRequired ? "local_first" : "local_only",
      affectedWorkflows: this.options.affectedWorkflows,
      freshness
    };
  }
}

export function createDefaultAdapterHealthModules(): FulcrumAdapter[] {
  return [
    new ToolHealthAdapter({
      adapterId: "adapter_memory_markdown",
      category: "memory",
      name: "Markdown memory",
      enabled: true,
      affectedWorkflows: ["memory", "context"],
      supported: ["import", "search", "export"]
    }),
    new ToolHealthAdapter({
      adapterId: "adapter_code_rg",
      category: "code_tool",
      name: "ripgrep code search",
      enabled: true,
      command: "rg",
      affectedWorkflows: ["code", "context"],
      supported: ["exact_search", "path_search"]
    }),
    new ToolHealthAdapter({
      adapterId: "adapter_code_fd",
      category: "code_tool",
      name: "fd path search",
      enabled: true,
      command: "fd",
      affectedWorkflows: ["code", "context"],
      supported: ["path_search", "cache_metadata"],
      localFallback: ["Node filesystem path scan remains available."]
    }),
    new ToolHealthAdapter({
      adapterId: "adapter_code_ast_grep",
      category: "code_tool",
      name: "ast-grep structural search",
      enabled: false,
      command: "ast-grep",
      affectedWorkflows: ["code", "context"],
      supported: ["structural_search", "cache_metadata"],
      localFallback: ["Exact code search remains available."]
    }),
    new ToolHealthAdapter({
      adapterId: "adapter_code_aider",
      category: "code_tool",
      name: "Aider code assistant",
      enabled: false,
      command: "aider",
      affectedWorkflows: ["run", "code"],
      supported: ["assistant_version_probe", "cache_metadata"],
      policyGated: ["arbitrary_shell"],
      localFallback: ["Other configured CLI agents remain available."]
    }),
    new ToolHealthAdapter({
      adapterId: "adapter_code_repomix",
      category: "code_tool",
      name: "Repomix repo pack",
      enabled: false,
      command: "repomix",
      affectedWorkflows: ["context", "code"],
      supported: ["repo_pack", "cache_metadata"],
      localFallback: ["Fulcrum context packs remain available."]
    }),
    new ToolHealthAdapter({
      adapterId: "adapter_semantic_local",
      category: "semantic_search",
      name: "Optional semantic search",
      enabled: false,
      affectedWorkflows: ["code", "context"],
      optional: ["semantic_search"],
      localFallback: ["Exact and path search remain available."]
    }),
    new ToolHealthAdapter({
      adapterId: "adapter_agent_validation",
      category: "cli_agent",
      name: "Deterministic validation agent",
      enabled: true,
      affectedWorkflows: ["run"],
      supported: ["supervised_run", "heartbeat"]
    }),
    new ToolHealthAdapter({
      adapterId: "adapter_copilot_cli",
      category: "cli_agent",
      name: "GitHub Copilot CLI",
      enabled: false,
      command: "copilot",
      affectedWorkflows: ["run", "doctor"],
      optional: ["prompt_mode", "mcp_config", "plugins", "skills", "session_persistence"],
      localFallback: ["Other configured CLI agents remain available."],
      privacyNotes:
        "Uses standalone copilot command detection; gh copilot is intentionally not accepted."
    }),
    new ToolHealthAdapter({
      adapterId: "adapter_telemetry_disabled",
      category: "telemetry",
      name: "Telemetry exporters",
      enabled: false,
      networkRequired: true,
      affectedWorkflows: ["observability"],
      policyGated: ["telemetry", "remote_observability"],
      localFallback: ["Local event log and artifacts remain available."]
    }),
    new ToolHealthAdapter({
      adapterId: "adapter_remote_provider",
      category: "remote_provider",
      name: "Remote model providers",
      enabled: false,
      networkRequired: true,
      credentialEnv: "FULCRUM_REMOTE_PROVIDER_TOKEN",
      affectedWorkflows: ["run", "policy"],
      policyGated: ["remote_provider"],
      localFallback: ["Fulcrum core stays local-only."]
    })
  ];
}
