import type Database from "better-sqlite3";
import { PolicyDecisionSchema, SCHEMA_VERSION, type PolicyDecision } from "@fulcrum/shared";

type PolicyDecisionRow = Record<string, unknown>;

function fromRow(row: PolicyDecisionRow): PolicyDecision {
  return PolicyDecisionSchema.parse({
    policyDecisionId: row.policy_decision_id,
    action: row.action,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    requester: row.requester,
    projectId: row.project_id ?? undefined,
    taskId: row.task_id ?? undefined,
    runId: row.run_id ?? undefined,
    status: row.status,
    reason: row.reason,
    approvalRequired: Number(row.approval_required) === 1,
    approvedBy: row.approved_by ?? undefined,
    approvalTime: row.approval_time ?? undefined,
    bypassScope: row.bypass_scope ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    previewRef: row.preview_ref ?? undefined,
    auditEventId: row.audit_event_id ?? undefined,
    nextAction: row.next_action ?? undefined,
    redactionStatus: row.redaction_status,
    createdAt: row.created_at
  });
}

export class PolicyDecisionRepository {
  constructor(private readonly db: Database.Database) {}

  save(decision: PolicyDecision): PolicyDecision {
    const now = new Date().toISOString();
    const parsed = PolicyDecisionSchema.parse({
      ...decision,
      createdAt: decision.createdAt ?? now
    });
    this.db
      .prepare(
        `INSERT INTO policy_decisions (
          policy_decision_id, action, subject_type, subject_id, requester, project_id, task_id,
          run_id, status, reason, approval_required, approved_by, approval_time, bypass_scope,
          expires_at, preview_ref, audit_event_id, next_action, redaction_status, created_at,
          updated_at, schema_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(policy_decision_id) DO UPDATE SET
          status = excluded.status,
          reason = excluded.reason,
          approval_required = excluded.approval_required,
          approved_by = excluded.approved_by,
          approval_time = excluded.approval_time,
          bypass_scope = excluded.bypass_scope,
          expires_at = excluded.expires_at,
          preview_ref = excluded.preview_ref,
          audit_event_id = excluded.audit_event_id,
          next_action = excluded.next_action,
          redaction_status = excluded.redaction_status,
          updated_at = excluded.updated_at,
          schema_version = excluded.schema_version`
      )
      .run(
        parsed.policyDecisionId,
        parsed.action,
        parsed.subjectType ?? "unknown",
        parsed.subjectId ?? "unknown",
        parsed.requester ?? "unknown",
        parsed.projectId ?? null,
        parsed.taskId ?? null,
        parsed.runId ?? null,
        parsed.status,
        parsed.reason,
        parsed.approvalRequired ? 1 : 0,
        parsed.approvedBy ?? null,
        parsed.approvalTime ?? null,
        parsed.bypassScope ?? null,
        parsed.expiresAt ?? null,
        parsed.previewRef ?? null,
        parsed.auditEventId ?? null,
        parsed.nextAction ?? null,
        parsed.redactionStatus,
        parsed.createdAt,
        now,
        SCHEMA_VERSION
      );
    return parsed;
  }

  get(policyDecisionId: string): PolicyDecision | undefined {
    const row = this.db
      .prepare("SELECT * FROM policy_decisions WHERE policy_decision_id = ?")
      .get(policyDecisionId);
    return row ? fromRow(row as PolicyDecisionRow) : undefined;
  }

  listPending(): PolicyDecision[] {
    return this.db
      .prepare("SELECT * FROM policy_decisions WHERE status = ? ORDER BY created_at ASC")
      .all("approval_required")
      .map((row) => fromRow(row as PolicyDecisionRow));
  }
}
