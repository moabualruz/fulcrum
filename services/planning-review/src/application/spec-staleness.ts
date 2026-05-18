import { createHash } from "node:crypto";

export type PlanSourceKind = "doc" | "artifact" | "task_criteria" | "prototype";

export interface PlanSourceInput {
  kind: PlanSourceKind;
  id: string;
  label?: string;
  content: string;
  versionId?: string | null;
  updatedAt?: string | null;
}

export interface ApprovedPlanSourceSnapshot {
  kind: PlanSourceKind;
  id: string;
  label: string;
  contentHash: string;
  versionId?: string;
  updatedAt?: string;
}

export interface PlanStalenessChangedSource {
  kind: PlanSourceKind;
  id: string;
  label: string;
  previousHash: string;
  currentHash: string;
  previousVersionId?: string;
  currentVersionId?: string;
  previousUpdatedAt?: string;
  currentUpdatedAt?: string;
  requiredAction: "refresh_review" | "accepted_with_reason";
  summary: string;
}

export interface AcceptStaleExecutionInput {
  acceptedBy: string;
  reason: string;
  acceptedAt?: string;
}

export interface PlanExecutionStalenessInput {
  planId: string;
  approvedAt: string;
  snapshots: ApprovedPlanSourceSnapshot[];
  currentSources: PlanSourceInput[];
  acceptStaleExecution?: AcceptStaleExecutionInput;
}

export interface PlanExecutionStalenessResult {
  planId: string;
  status: "fresh" | "stale" | "accepted_stale";
  requiredAction: "continue_execution" | "refresh_review" | "accepted_with_reason";
  changedSources: PlanStalenessChangedSource[];
  override?: {
    acceptedBy: string;
    reason: string;
    acceptedAt: string;
  };
}

export function buildApprovedPlanSourceSnapshots(
  sources: PlanSourceInput[],
): ApprovedPlanSourceSnapshot[] {
  return sources.map((source) => ({
    kind: source.kind,
    id: source.id,
    label: source.label?.trim() || `${source.kind}:${source.id}`,
    contentHash: contentHash(source.content),
    ...(source.versionId?.trim() ? { versionId: source.versionId.trim() } : {}),
    ...(source.updatedAt?.trim() ? { updatedAt: source.updatedAt.trim() } : {}),
  }));
}

export function checkPlanExecutionStaleness(
  input: PlanExecutionStalenessInput,
): PlanExecutionStalenessResult {
  const currentByKey = new Map(input.currentSources.map((source) => [sourceKey(source), source]));
  const changedSources = input.snapshots.flatMap((snapshot) => {
    const current = currentByKey.get(sourceKey(snapshot));
    if (!current) {
      return [{
        kind: snapshot.kind,
        id: snapshot.id,
        label: snapshot.label,
        previousHash: snapshot.contentHash,
        currentHash: "missing",
        ...(snapshot.versionId ? { previousVersionId: snapshot.versionId } : {}),
        ...(snapshot.updatedAt ? { previousUpdatedAt: snapshot.updatedAt } : {}),
        requiredAction: "refresh_review" as const,
        summary: `${snapshot.label} is missing from current execution context.`,
      }];
    }
    const currentHash = contentHash(current.content);
    const versionChanged = Boolean(snapshot.versionId && current.versionId && snapshot.versionId !== current.versionId);
    const hashChanged = snapshot.contentHash !== currentHash;
    if (!hashChanged && !versionChanged) return [];
    return [{
      kind: snapshot.kind,
      id: snapshot.id,
      label: current.label?.trim() || snapshot.label,
      previousHash: snapshot.contentHash,
      currentHash,
      ...(snapshot.versionId ? { previousVersionId: snapshot.versionId } : {}),
      ...(current.versionId?.trim() ? { currentVersionId: current.versionId.trim() } : {}),
      ...(snapshot.updatedAt ? { previousUpdatedAt: snapshot.updatedAt } : {}),
      ...(current.updatedAt?.trim() ? { currentUpdatedAt: current.updatedAt.trim() } : {}),
      requiredAction: "refresh_review" as const,
      summary: `${current.label?.trim() || snapshot.label} changed after plan approval.`,
    }];
  });

  const override = normalizeOverride(input.acceptStaleExecution);
  if (changedSources.length === 0) {
    return {
      planId: input.planId,
      status: "fresh",
      requiredAction: "continue_execution",
      changedSources: [],
    };
  }
  if (override) {
    return {
      planId: input.planId,
      status: "accepted_stale",
      requiredAction: "accepted_with_reason",
      changedSources: changedSources.map((source) => ({ ...source, requiredAction: "accepted_with_reason" })),
      override,
    };
  }
  return {
    planId: input.planId,
    status: "stale",
    requiredAction: "refresh_review",
    changedSources,
  };
}

function normalizeOverride(input?: AcceptStaleExecutionInput): PlanExecutionStalenessResult["override"] | undefined {
  const acceptedBy = input?.acceptedBy.trim();
  const reason = input?.reason.trim();
  if (!acceptedBy || !reason) return undefined;
  return {
    acceptedBy,
    reason,
    acceptedAt: input?.acceptedAt?.trim() || new Date().toISOString(),
  };
}

function sourceKey(source: { kind: PlanSourceKind; id: string }): string {
  return `${source.kind}:${source.id}`;
}

function contentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}
