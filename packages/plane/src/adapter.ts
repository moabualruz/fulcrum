import type { AdapterPreview, FulcrumAdapter } from "@fulcrum/core";
import {
  makeId,
  type AdapterMetadata,
  type CapabilityHealthRecord,
  type PolicyDecision
} from "@fulcrum/shared";

export interface PlaneWorkItem {
  externalId: string;
  title: string;
  body?: string;
  status?: string;
  updatedAt?: string;
  url?: string;
  docs?: Array<{ title: string; url: string; updatedAt?: string }>;
}

export interface PlaneWritebackInput {
  externalId: string;
  comment?: string;
  status?: string;
  requester?: string;
}

export interface ExternalPmAdapter extends FulcrumAdapter<
  unknown,
  PlaneWorkItem[] | PlaneWritebackInput | PolicyDecision
> {
  importWorkItems(): Promise<PlaneWorkItem[]>;
  previewWriteback(input: PlaneWritebackInput): Promise<AdapterPreview>;
  writeback(input: PlaneWritebackInput, policyDecisionId: string): Promise<PlaneWritebackInput>;
}

export const planeAdapterMetadata: AdapterMetadata = {
  adapterId: makeId("adapter", "plane"),
  category: "external_pm",
  name: "Plane",
  enabled: false,
  ownershipBoundary:
    "External item text/status is remote-owned; Fulcrum execution state is local-owned.",
  networkRequired: true,
  credentialStatus: "not_configured",
  privacyNotes: "No data shared unless operator enables sync/writeback.",
  offlineBehavior: "Existing local mirrors remain usable; sync is disabled.",
  disablementBehavior: "Local task history is preserved; remote writeback unavailable.",
  importExportStrategy:
    "Import selected remote items into local mirrors; preview writebacks before posting.",
  rebuildStrategy: "Rebuild local mirror projections from SQLite and optional remote refetch."
};

export function disabledPlaneHealth(now = new Date().toISOString()): CapabilityHealthRecord {
  return {
    capabilityId: makeId("cap", "external-pm-plane"),
    state: "disabled",
    blocking: false,
    cause: "Plane adapter is not configured.",
    nextAction: "Configure Plane credentials to enable import and writeback.",
    privacyStatus: "local_only",
    affectedWorkflows: ["external_pm_import", "external_writeback"],
    freshness: now
  };
}

export function externalWritebackPreview(input: PlaneWritebackInput): AdapterPreview {
  return {
    effects: [
      input.comment ? "Post external comment" : "No external comment",
      input.status ? `Set external status to ${input.status}` : "Leave external status unchanged"
    ],
    recordsAffected: [input.externalId],
    externalVisibility: "remote",
    policyRequirements: ["external_writeback"],
    redactionStatus: "needs_review",
    dataSharedExternally: [input.comment, input.status].filter(Boolean) as string[]
  };
}

export function policyPlaceholder(input: PlaneWritebackInput): PolicyDecision {
  return {
    policyDecisionId: makeId("pol", `external-writeback-${input.externalId}`),
    action: "external_writeback",
    subjectType: "external_work_item",
    subjectId: input.externalId,
    requester: input.requester ?? "operator",
    status: "approval_required",
    approvalRequired: true,
    reason: "External PM writeback requires operator approval.",
    createdAt: new Date().toISOString(),
    nextAction: "Review preview and approve before execution.",
    redactionStatus: "needs_review"
  };
}
