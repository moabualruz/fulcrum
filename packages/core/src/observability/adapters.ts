import { makeId, type AdapterMetadata, type CapabilityHealthRecord } from "@fulcrum/shared";
import type { AdapterPreview, FulcrumAdapter } from "../adapters/adapter.js";

export type ObservabilityExporterKind = "opentelemetry" | "langfuse" | "helicone";

export interface ObservabilityAdapterConfig {
  kind: ObservabilityExporterKind;
  enabled?: boolean;
  endpoint?: string;
  exportPath?: string;
  credentialConfigured?: boolean;
  localOnly?: boolean;
  redactionEnabled?: boolean;
}

export interface ObservabilityExportInput {
  events: Array<Record<string, unknown>>;
  localOnly?: boolean;
}

export interface ObservabilityExportResult {
  adapterId: string;
  exported: boolean;
  destination: "local_file" | "remote";
  exportPath?: string;
  redactionStatus: "redacted" | "needs_review";
  blockedReason?: string;
  eventCount: number;
}

const names: Record<ObservabilityExporterKind, string> = {
  opentelemetry: "OpenTelemetry",
  langfuse: "Langfuse",
  helicone: "Helicone-style"
};

export class ObservabilityAdapter implements FulcrumAdapter<
  ObservabilityExportInput,
  ObservabilityExportResult
> {
  metadata: AdapterMetadata;

  constructor(private config: ObservabilityAdapterConfig) {
    this.metadata = {
      adapterId: makeId("adapter", `observability-${config.kind}`),
      category: "telemetry",
      name: names[config.kind],
      enabled: config.enabled ?? false,
      ownershipBoundary:
        "Fulcrum owns local events; observability exporters receive only redacted opt-in payloads.",
      networkRequired: true,
      credentialStatus: config.credentialConfigured ? "configured" : "not_configured",
      privacyNotes: "Disabled by default. Local-only mode blocks remote export.",
      offlineBehavior: "Local JSONL events and artifacts remain available.",
      disablementBehavior: "Disabling stops export and preserves local history.",
      importExportStrategy: "Export redacted event summaries to local file or configured endpoint.",
      rebuildStrategy:
        "Re-evaluate configuration and privacy status; derived exports are rebuildable."
    };
  }

  async healthCheck(input?: ObservabilityExportInput): Promise<CapabilityHealthRecord> {
    const localOnly = input?.localOnly ?? this.config.localOnly ?? false;
    if (!this.metadata.enabled) {
      return this.record(
        "disabled",
        "Adapter disabled by default.",
        "Enable only after privacy review."
      );
    }
    if (localOnly) {
      return this.record(
        "blocked",
        "Local-only mode blocks remote observability.",
        "Disable local-only outside this command before exporting telemetry.",
        true
      );
    }
    if (!this.config.redactionEnabled) {
      return this.record(
        "blocked",
        "Redaction must be enabled before observability export.",
        "Enable redaction or use local event logs.",
        true
      );
    }
    if (!this.config.endpoint && !this.config.exportPath) {
      return this.record(
        "guided",
        "No endpoint or local export path configured.",
        "Configure an endpoint or export path."
      );
    }
    return this.record("managed", undefined, "No action needed.");
  }

  async describeCapabilities() {
    return {
      supported: ["health", "privacy_status", "redacted_export"],
      optional: ["remote_export", "local_file_export"],
      unavailable: this.metadata.enabled ? [] : ["remote_export"],
      localFallback: ["Local JSONL event log and artifacts remain available."],
      policyGated: ["telemetry", "remote_observability"]
    };
  }

  async preview(_operation: string, input: ObservabilityExportInput): Promise<AdapterPreview> {
    return {
      effects: [`Export ${input.events.length} redacted observability events.`],
      recordsAffected: [this.metadata.adapterId],
      externalVisibility: this.config.exportPath ? "none" : "remote",
      policyRequirements: ["telemetry", "remote_observability"],
      redactionStatus: this.config.redactionEnabled ? "redacted" : "needs_review",
      dataSharedExternally: this.config.exportPath ? [] : ["redacted event summaries"]
    };
  }

  async execute(
    _operation: string,
    input: ObservabilityExportInput
  ): Promise<ObservabilityExportResult> {
    const health = await this.healthCheck(input);
    if (health.state === "blocked" || health.state === "disabled" || health.state === "guided") {
      return {
        adapterId: this.metadata.adapterId,
        exported: false,
        destination: this.config.exportPath ? "local_file" : "remote",
        exportPath: this.config.exportPath,
        redactionStatus: this.config.redactionEnabled ? "redacted" : "needs_review",
        blockedReason: health.cause,
        eventCount: input.events.length
      };
    }
    return {
      adapterId: this.metadata.adapterId,
      exported: true,
      destination: this.config.exportPath ? "local_file" : "remote",
      exportPath: this.config.exportPath,
      redactionStatus: "redacted",
      eventCount: input.events.length
    };
  }

  async disable(reason: string): Promise<void> {
    this.config = { ...this.config, enabled: false };
    this.metadata = {
      ...this.metadata,
      enabled: false,
      privacyNotes: `${this.metadata.privacyNotes} ${reason}`
    };
  }

  async exportLocalState(): Promise<ObservabilityExportResult> {
    return this.execute("export", { events: [], localOnly: this.config.localOnly });
  }

  async rebuild(): Promise<ObservabilityExportResult> {
    return this.exportLocalState();
  }

  private record(
    state: CapabilityHealthRecord["state"],
    cause: string | undefined,
    nextAction: string | undefined,
    blocking = false
  ): CapabilityHealthRecord {
    return {
      capabilityId: makeId("cap", `observability-${this.config.kind}`),
      state,
      blocking,
      cause,
      nextAction,
      privacyStatus: this.config.localOnly ? "local_only" : "local_first",
      affectedWorkflows: ["observability", "doctor", "privacy"],
      freshness: new Date().toISOString()
    };
  }
}

export function createObservabilityAdapters(
  configs: Partial<Record<ObservabilityExporterKind, Omit<ObservabilityAdapterConfig, "kind">>> = {}
): ObservabilityAdapter[] {
  return (["opentelemetry", "langfuse", "helicone"] as const).map(
    (kind) => new ObservabilityAdapter({ kind, ...configs[kind] })
  );
}
