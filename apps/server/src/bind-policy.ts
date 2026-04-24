import { PolicyEnforcementService } from "@fulcrum/core";

export interface BindPolicyResult {
  hostname: string;
  policyDecisionId?: string;
}

export function enforceServerBindPolicy(input: {
  hostname?: string;
  port: number;
  policy: PolicyEnforcementService;
  approvedDecisionId?: string;
}): BindPolicyResult {
  const hostname = input.hostname ?? "127.0.0.1";
  if (hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1") {
    return { hostname };
  }
  if (input.approvedDecisionId) {
    const decision = input.policy.get(input.approvedDecisionId);
    if (
      decision?.action === "public_bind" &&
      decision.status === "approved" &&
      decision.subjectId === `${hostname}:${input.port}`
    ) {
      return { hostname, policyDecisionId: decision.policyDecisionId };
    }
  }
  const { decision } = input.policy.check({
    action: "public_bind",
    subjectType: "server_bind",
    subjectId: `${hostname}:${input.port}`,
    requester: "server",
    preview: true,
    localOnly: false
  });
  throw Object.assign(new Error(decision.reason), { policyDecision: decision });
}
