import {
  makeId,
  SCHEMA_VERSION,
  type PolicyCheckRequest,
  type PolicyDecision,
  type RunEvent
} from "@fulcrum/shared";
import { evaluatePolicy } from "@fulcrum/policy";
import type { GraphLinkWriters } from "../graph/link-writers.js";

export interface PolicyDecisionRepositoryPort {
  save(decision: PolicyDecision): PolicyDecision;
  get(policyDecisionId: string): PolicyDecision | undefined;
  listPending(): PolicyDecision[];
}

export interface PolicyEventRepositoryPort {
  append(event: Omit<RunEvent, "sequence"> & { sequence?: number }): RunEvent;
}

export interface PolicyCheckResult {
  decision: PolicyDecision;
  event: RunEvent;
}

export class PolicyEnforcementService {
  constructor(
    private readonly decisions: PolicyDecisionRepositoryPort,
    private readonly events: PolicyEventRepositoryPort,
    private readonly graphLinks?: GraphLinkWriters
  ) {}

  check(request: PolicyCheckRequest): PolicyCheckResult {
    const evaluated = evaluatePolicy(request);
    const eventType = evaluated.status === "denied" ? "policy.denied" : "policy.checked";
    const event = this.events.append({
      eventId: makeId(
        "evt",
        `policy-${evaluated.status}-${request.action}-${request.subjectType}-${request.subjectId}`
      ),
      timestamp: new Date().toISOString(),
      source: "policy",
      severity: evaluated.status === "denied" ? "warn" : "info",
      type: eventType,
      projectId: request.projectId,
      taskId: request.taskId,
      runId: request.runId,
      correlationId: evaluated.policyDecisionId,
      payloadSummary: {
        action: request.action,
        subjectType: request.subjectType,
        subjectId: request.subjectId,
        requester: request.requester,
        status: evaluated.status,
        reason: evaluated.reason
      },
      payloadRef: null,
      artifactRefs: [],
      policyDecisionRefs: [evaluated.policyDecisionId],
      redactionStatus: "not_applicable",
      degraded: [],
      schemaVersion: SCHEMA_VERSION
    });
    const decision = this.decisions.save({
      ...evaluated,
      auditEventId: event.eventId
    });
    if (request.projectId && request.runId) {
      this.graphLinks?.policy(request.projectId, { type: "run", id: request.runId }, decision);
    }
    return { decision, event };
  }

  approve(policyDecisionId: string, approvedBy: string): PolicyDecision {
    const decision = this.decisions.get(policyDecisionId);
    if (!decision) {
      throw new Error(`Policy decision not found: ${policyDecisionId}`);
    }
    if (decision.status !== "approval_required") {
      throw new Error(`Policy decision is not pending approval: ${policyDecisionId}`);
    }
    const approvedAt = new Date().toISOString();
    const approved = this.decisions.save({
      ...decision,
      status: "approved",
      approvalRequired: false,
      approvedBy,
      approvalTime: approvedAt,
      nextAction: "Retry the original action with this policy decision."
    });
    this.events.append({
      eventId: makeId("evt", `policy-approved-${policyDecisionId}`),
      timestamp: approvedAt,
      source: "policy",
      severity: "info",
      type: "policy.approved",
      projectId: approved.projectId,
      taskId: approved.taskId,
      runId: approved.runId,
      correlationId: policyDecisionId,
      payloadSummary: {
        policyDecisionId,
        approvedBy,
        action: approved.action,
        subjectType: approved.subjectType,
        subjectId: approved.subjectId
      },
      payloadRef: null,
      artifactRefs: [],
      policyDecisionRefs: [policyDecisionId],
      redactionStatus: approved.redactionStatus,
      degraded: [],
      schemaVersion: SCHEMA_VERSION
    });
    return approved;
  }

  get(policyDecisionId: string): PolicyDecision | undefined {
    return this.decisions.get(policyDecisionId);
  }

  listPending(): PolicyDecision[] {
    return this.decisions.listPending();
  }
}
