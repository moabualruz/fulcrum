import { makeId, type PolicyCheckRequest, type PolicyDecision } from "@fulcrum/shared";

const remoteActions = new Set<PolicyCheckRequest["action"]>([
  "remote_provider",
  "remote_pm",
  "remote_model",
  "telemetry",
  "remote_observability",
  "public_bind"
]);

const approvalRequiredActions = new Set<PolicyCheckRequest["action"]>([
  ...remoteActions,
  "destructive",
  "permanent_memory",
  "arbitrary_shell",
  "backup_purge",
  "sensitive_export",
  "worktree_cleanup",
  "external_writeback",
  "memory_delete",
  "adapter_execute",
  "package_global_mutation",
  "adapter_certification",
  "compliance_override"
]);

const readinessActions = new Set<PolicyCheckRequest["action"]>([
  "release_validation",
  "adapter_certification",
  "compliance_override",
  "package_global_mutation"
]);

export function evaluatePolicy(request: PolicyCheckRequest): PolicyDecision {
  if (request.localOnly && remoteActions.has(request.action)) {
    return decision(
      request,
      "denied",
      `Local-only mode denies ${request.action}.`,
      "Use local evidence or change policy outside this request."
    );
  }
  if (approvalRequiredActions.has(request.action)) {
    return decision(
      request,
      "approval_required",
      `${request.action} requires operator approval.`,
      "Review preview and approve policy decision."
    );
  }
  if (readinessActions.has(request.action)) {
    return decision(
      request,
      "allowed",
      `${request.action} allowed with local evidence capture.`,
      "Record command, artifacts, and redaction status in release evidence."
    );
  }
  return decision(request, "allowed", "Action allowed by default policy.");
}

function decision(
  request: PolicyCheckRequest,
  status: PolicyDecision["status"],
  reason: string,
  nextAction?: string
): PolicyDecision {
  return {
    policyDecisionId: makeId(
      "pol",
      `${request.action}-${request.subjectType}-${request.subjectId}`
    ),
    action: request.action,
    subjectType: request.subjectType,
    subjectId: request.subjectId,
    requester: request.requester,
    projectId: request.projectId,
    taskId: request.taskId,
    runId: request.runId,
    status,
    approvalRequired: status === "approval_required",
    reason,
    bypassScope: request.preview ? "preview" : undefined,
    previewRef: request.previewRef,
    createdAt: new Date().toISOString(),
    nextAction,
    redactionStatus: "not_applicable"
  };
}
