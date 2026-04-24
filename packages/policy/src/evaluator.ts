import { makeId, type PolicyCheckRequest, type PolicyDecision } from "@fulcrum/shared";

const approvalRequiredActions = new Set<PolicyCheckRequest["action"]>([
  "destructive",
  "permanent_memory",
  "public_bind",
  "arbitrary_shell",
  "backup_purge",
  "sensitive_export",
  "worktree_cleanup",
  "external_writeback"
]);

export function evaluatePolicy(request: PolicyCheckRequest): PolicyDecision {
  if (request.localOnly && request.action === "remote_provider") {
    return decision(
      request,
      "denied",
      "Local-only mode denies remote provider access.",
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
    status,
    reason,
    bypassScope: request.preview ? "preview" : undefined,
    nextAction,
    redactionStatus: "not_applicable"
  };
}
