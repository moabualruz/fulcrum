import { describe, expect, test } from "bun:test";

import {
  WORKFLOW_UAT_FIXTURE,
  assertWorkflowContractFixtureIntegrity,
  workflowFixtureIds,
} from "@fulcrum/test-fixtures";

describe("client workflow UAT fixture", () => {
  test("declares one shared Agent OS work cycle spine for every client", () => {
    expect(workflowFixtureIds()).toEqual({
      workspaceId: "uat_ws_agent_os",
      parentProjectId: "uat_project_fulcrum",
      childProjectId: "uat_project_fulcrum_cli",
      repositoryId: "uat_repo_fulcrum",
      epicId: "uat_work_epic_product_workflow",
      taskId: "uat_work_task_agent_dispatch",
      documentId: "uat_doc_agent_context",
      contextBundleId: "uat_context_agent_dispatch",
      runId: "uat_run_codex_dispatch",
      artifactId: "uat_artifact_run_summary",
      memoryId: "uat_memory_dispatch_learning",
      automationId: "uat_automation_parent_triage",
      notificationId: "uat_notification_run_review",
      reportId: "uat_report_workflow_health",
      auditEventId: "uat_audit_dispatch_requested",
    });
  });

  test("links human and agent journeys through the same trace records", () => {
    expect(WORKFLOW_UAT_FIXTURE.humanJourneys.map((journey) => journey.id)).toEqual([
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
    ]);
    expect(WORKFLOW_UAT_FIXTURE.agentJourneys.map((journey) => journey.id)).toEqual([
      "A1",
      "A2",
      "A3",
      "A4",
      "A5",
    ]);
    expect(WORKFLOW_UAT_FIXTURE.trace.sourceRefs).toEqual(
      expect.arrayContaining([
        { kind: "workspace", id: "uat_ws_agent_os" },
        { kind: "project", id: "uat_project_fulcrum" },
        { kind: "project", id: "uat_project_fulcrum_cli" },
        { kind: "repository", id: "uat_repo_fulcrum" },
        { kind: "work_item", id: "uat_work_task_agent_dispatch" },
        { kind: "document", id: "uat_doc_agent_context" },
        { kind: "run", id: "uat_run_codex_dispatch" },
        { kind: "artifact", id: "uat_artifact_run_summary" },
        { kind: "memory", id: "uat_memory_dispatch_learning" },
        { kind: "audit_event", id: "uat_audit_dispatch_requested" },
      ]),
    );
  });

  test("fails closure when fixture has orphaned links or missing client coverage", () => {
    const result = assertWorkflowContractFixtureIntegrity(WORKFLOW_UAT_FIXTURE);

    expect(result).toEqual({
      ok: true,
      missingClients: [],
      orphanReferences: [],
      missingTraceKinds: [],
    });
  });
});
