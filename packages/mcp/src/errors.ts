import { makeId, SCHEMA_VERSION, type PolicyDecision } from "@fulcrum/shared";

export interface McpStructuredError {
  code:
    | "NOT_FOUND"
    | "INVALID_INPUT"
    | "INVALID_TRANSITION"
    | "POLICY_DENIED"
    | "APPROVAL_REQUIRED"
    | "CAPABILITY_DEGRADED"
    | "INTERNAL_ERROR";
  message: string;
  nextAction: string;
  capabilityId?: string;
  policyDecisionId?: string | null;
  redactionStatus: "redacted" | "not_redacted" | "not_applicable" | "needs_review";
}

export interface McpCommonResponse<T = unknown> {
  schemaVersion: string;
  requestId: string;
  status: "ok" | "error";
  data?: T;
  error?: McpStructuredError;
  degraded: Array<{ capabilityId: string; state: string; nextAction?: string }>;
  policyDecisionIds: string[];
  redactionStatus: "redacted" | "not_redacted" | "not_applicable" | "needs_review";
}

export function ok<T>(
  data: T,
  input: {
    requestId?: string;
    degraded?: McpCommonResponse["degraded"];
    policyDecisionIds?: string[];
    redactionStatus?: McpCommonResponse["redactionStatus"];
  } = {}
): McpCommonResponse<T> {
  return {
    schemaVersion: SCHEMA_VERSION,
    requestId: input.requestId ?? makeId("evt", `req-${Date.now()}-${Math.random()}`),
    status: "ok",
    data,
    degraded: input.degraded ?? [],
    policyDecisionIds: input.policyDecisionIds ?? [],
    redactionStatus: input.redactionStatus ?? "not_applicable"
  };
}

export function errorResponse(
  error: McpStructuredError,
  input: { requestId?: string; policyDecisionIds?: string[] } = {}
): McpCommonResponse {
  return {
    schemaVersion: SCHEMA_VERSION,
    requestId: input.requestId ?? makeId("evt", `req-${Date.now()}-${Math.random()}`),
    status: "error",
    error,
    degraded: [],
    policyDecisionIds: input.policyDecisionIds ?? [],
    redactionStatus: error.redactionStatus
  };
}

export function fromUnknownError(error: unknown): McpCommonResponse {
  const message = error instanceof Error ? error.message : String(error);
  return errorResponse({
    code: classifyMessage(message),
    message,
    nextAction: nextActionFor(message),
    policyDecisionId: null,
    redactionStatus: "not_applicable"
  });
}

export function fromPolicyDecision(decision: PolicyDecision): McpCommonResponse {
  const status = decision.status === "denied" ? "POLICY_DENIED" : "APPROVAL_REQUIRED";
  return errorResponse(
    {
      code: status,
      message: decision.reason,
      nextAction:
        decision.nextAction ??
        (decision.status === "denied"
          ? "Change request or policy before retrying."
          : "Approve policy decision before retrying."),
      policyDecisionId: decision.policyDecisionId,
      redactionStatus: decision.redactionStatus
    },
    { policyDecisionIds: [decision.policyDecisionId] }
  );
}

function classifyMessage(message: string): McpStructuredError["code"] {
  if (/not found|unknown/i.test(message)) return "NOT_FOUND";
  if (/transition|terminal/i.test(message)) return "INVALID_TRANSITION";
  if (/approval|required/i.test(message)) return "APPROVAL_REQUIRED";
  if (/degraded|disabled|unavailable/i.test(message)) return "CAPABILITY_DEGRADED";
  if (/empty|invalid/i.test(message)) return "INVALID_INPUT";
  return "INTERNAL_ERROR";
}

function nextActionFor(message: string): string {
  if (/not found|unknown/i.test(message)) return "Verify the Fulcrum ID and retry.";
  if (/transition|terminal/i.test(message))
    return "Refresh state and choose a valid lifecycle transition.";
  if (/approval|required/i.test(message)) return "Request or pass an approved policy decision.";
  if (/degraded|disabled|unavailable/i.test(message))
    return "Use local fallback or enable the capability.";
  return "Inspect local logs and retry.";
}
