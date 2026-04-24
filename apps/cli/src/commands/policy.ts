import { PolicyEnforcementService } from "@fulcrum/core";
import { PolicyCheckRequestSchema, type PolicyDecision } from "@fulcrum/shared";

export interface PolicyCheckCommandInput {
  action: string;
  subjectType: string;
  subjectId: string;
  requester?: string;
  projectId?: string;
  taskId?: string;
  runId?: string;
  preview?: boolean;
  localOnly?: boolean;
  previewRef?: string;
}

export function checkPolicyCommand(
  service: PolicyEnforcementService,
  input: PolicyCheckCommandInput
): PolicyDecision {
  const result = service.check(
    PolicyCheckRequestSchema.parse({
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      requester: input.requester ?? "operator",
      projectId: input.projectId,
      taskId: input.taskId,
      runId: input.runId,
      preview: input.preview ?? true,
      localOnly: input.localOnly ?? false,
      previewRef: input.previewRef
    })
  );
  return result.decision;
}

export function approvePolicyCommand(
  service: PolicyEnforcementService,
  policyDecisionId: string,
  approvedBy = "operator"
): PolicyDecision {
  return service.approve(policyDecisionId, approvedBy);
}
