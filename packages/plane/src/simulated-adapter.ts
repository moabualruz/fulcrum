import type { AdapterPreview } from "@fulcrum/core";
import type { CapabilityHealthRecord } from "@fulcrum/shared";
import {
  disabledPlaneHealth,
  externalWritebackPreview,
  planeAdapterMetadata,
  policyPlaceholder,
  type ExternalPmAdapter,
  type PlaneWorkItem,
  type PlaneWritebackInput
} from "./adapter.js";

export class SimulatedPlaneAdapter implements ExternalPmAdapter {
  metadata = {
    ...planeAdapterMetadata,
    name: "Simulated Plane",
    enabled: true,
    credentialStatus: "not_required" as const,
    privacyNotes: "Test-only simulated Plane adapter; no remote data is shared."
  };
  private enabled = true;

  constructor(private readonly items: PlaneWorkItem[] = []) {}

  async healthCheck(): Promise<CapabilityHealthRecord> {
    if (!this.enabled) {
      return disabledPlaneHealth();
    }
    return {
      ...disabledPlaneHealth(),
      state: "managed",
      cause: "Simulated Plane adapter is available.",
      nextAction: "Import selected work items or preview writeback.",
      privacyStatus: "operator_configured"
    };
  }

  async describeCapabilities() {
    return {
      supported: ["import_work_items", "preview_writeback", "disable"],
      optional: ["execute_writeback"],
      unavailable: this.enabled ? [] : ["remote_writeback"],
      localFallback: ["existing_local_mirrors"],
      policyGated: ["external_writeback"]
    };
  }

  async preview(operation: string, input: unknown): Promise<AdapterPreview> {
    if (operation === "writeback") {
      return externalWritebackPreview(input as PlaneWritebackInput);
    }
    return {
      effects: ["Import remote work item snapshots"],
      recordsAffected: this.items.map((item) => item.externalId),
      externalVisibility: "none",
      policyRequirements: [],
      redactionStatus: "not_applicable",
      dataSharedExternally: []
    };
  }

  async execute(operation: string, input: unknown, policyDecisionId?: string) {
    if (operation === "writeback") {
      return policyDecisionId
        ? this.writeback(input as PlaneWritebackInput, policyDecisionId)
        : policyPlaceholder(input as PlaneWritebackInput);
    }
    return this.importWorkItems();
  }

  async disable(): Promise<void> {
    this.enabled = false;
    this.metadata = { ...this.metadata, enabled: false };
  }

  async exportLocalState(): Promise<PlaneWorkItem[]> {
    return this.items;
  }

  async rebuild(): Promise<PlaneWorkItem[]> {
    return this.enabled ? this.items : [];
  }

  async importWorkItems(): Promise<PlaneWorkItem[]> {
    if (!this.enabled) {
      throw new Error("Plane adapter disabled");
    }
    return this.items;
  }

  async previewWriteback(input: PlaneWritebackInput): Promise<AdapterPreview> {
    return externalWritebackPreview(input);
  }

  async writeback(
    input: PlaneWritebackInput,
    _policyDecisionId: string
  ): Promise<PlaneWritebackInput> {
    if (!this.enabled) {
      throw new Error("Plane adapter disabled");
    }
    return input;
  }
}
