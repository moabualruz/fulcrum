export type WorkflowContractClient = "api" | "cli" | "tui" | "web";

export type WorkflowContractRefKind =
  | "artifact"
  | "audit_event"
  | "automation"
  | "context_bundle"
  | "document"
  | "memory"
  | "notification"
  | "project"
  | "repository"
  | "report"
  | "run"
  | "work_item"
  | "workspace";

export type WorkflowContractRef = {
  kind: WorkflowContractRefKind;
  id: string;
};

export type WorkflowContractJourney = {
  id: string;
  title: string;
  requiredClients: WorkflowContractClient[];
  refs: WorkflowContractRef[];
};

export type WorkflowContractUatFixture = {
  workspace: { id: string; name: string };
  projects: Array<{ id: string; parentId: string | null; name: string }>;
  repository: { id: string; projectId: string; path: string };
  workItems: Array<{ id: string; projectId: string; parentId: string | null; type: "epic" | "task"; title: string }>;
  document: { id: string; projectId: string; linkedWorkItemId: string; title: string };
  contextBundle: { id: string; projectId: string; workItemId: string; documentIds: string[] };
  run: { id: string; projectId: string; workItemId: string; contextBundleId: string; agent: "codex"; state: "succeeded" };
  artifact: { id: string; projectId: string; runId: string; filename: string };
  memory: { id: string; projectId: string; sourceRunId: string; sourceArtifactId: string };
  automation: { id: string; projectId: string; inheritance: "descendants"; targetWorkItemType: "task" };
  notification: { id: string; projectId: string; runId: string };
  report: { id: string; projectId: string; includesProjectIds: string[] };
  auditEvent: { id: string; projectId: string; runId: string; verb: "dispatch.requested" };
  trace: { causationId: string; sourceRefs: WorkflowContractRef[] };
  clientCoverage: Record<WorkflowContractClient, string[]>;
  humanJourneys: WorkflowContractJourney[];
  agentJourneys: WorkflowContractJourney[];
};

export type WorkflowContractFixtureIntegrity = {
  ok: boolean;
  missingClients: WorkflowContractClient[];
  orphanReferences: WorkflowContractRef[];
  missingTraceKinds: WorkflowContractRefKind[];
};

const ids = {
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
} as const;

const workTaskRef: WorkflowContractRef = { kind: "work_item", id: ids.taskId };
const runRef: WorkflowContractRef = { kind: "run", id: ids.runId };
const artifactRef: WorkflowContractRef = { kind: "artifact", id: ids.artifactId };
const memoryRef: WorkflowContractRef = { kind: "memory", id: ids.memoryId };

export const WORKFLOW_UAT_FIXTURE: WorkflowContractUatFixture = {
  workspace: { id: ids.workspaceId, name: "Agent OS Workspace" },
  projects: [
    { id: ids.parentProjectId, parentId: null, name: "Fulcrum" },
    { id: ids.childProjectId, parentId: ids.parentProjectId, name: "Fulcrum CLI" },
  ],
  repository: { id: ids.repositoryId, projectId: ids.parentProjectId, path: "/workspace/fulcrum" },
  workItems: [
    {
      id: ids.epicId,
      projectId: ids.parentProjectId,
      parentId: null,
      type: "epic",
      title: "Product workflow completeness",
    },
    {
      id: ids.taskId,
      projectId: ids.childProjectId,
      parentId: ids.epicId,
      type: "task",
      title: "Dispatch reviewed agent run",
    },
  ],
  document: {
    id: ids.documentId,
    projectId: ids.childProjectId,
    linkedWorkItemId: ids.taskId,
    title: "Agent dispatch context",
  },
  contextBundle: {
    id: ids.contextBundleId,
    projectId: ids.childProjectId,
    workItemId: ids.taskId,
    documentIds: [ids.documentId],
  },
  run: {
    id: ids.runId,
    projectId: ids.childProjectId,
    workItemId: ids.taskId,
    contextBundleId: ids.contextBundleId,
    agent: "codex",
    state: "succeeded",
  },
  artifact: {
    id: ids.artifactId,
    projectId: ids.childProjectId,
    runId: ids.runId,
    filename: "run-summary.md",
  },
  memory: {
    id: ids.memoryId,
    projectId: ids.childProjectId,
    sourceRunId: ids.runId,
    sourceArtifactId: ids.artifactId,
  },
  automation: {
    id: ids.automationId,
    projectId: ids.parentProjectId,
    inheritance: "descendants",
    targetWorkItemType: "task",
  },
  notification: { id: ids.notificationId, projectId: ids.childProjectId, runId: ids.runId },
  report: { id: ids.reportId, projectId: ids.parentProjectId, includesProjectIds: [ids.parentProjectId, ids.childProjectId] },
  auditEvent: { id: ids.auditEventId, projectId: ids.childProjectId, runId: ids.runId, verb: "dispatch.requested" },
  trace: {
    causationId: ids.auditEventId,
    sourceRefs: [
      { kind: "workspace", id: ids.workspaceId },
      { kind: "project", id: ids.parentProjectId },
      { kind: "project", id: ids.childProjectId },
      { kind: "repository", id: ids.repositoryId },
      { kind: "work_item", id: ids.taskId },
      { kind: "document", id: ids.documentId },
      { kind: "context_bundle", id: ids.contextBundleId },
      runRef,
      artifactRef,
      memoryRef,
      { kind: "automation", id: ids.automationId },
      { kind: "notification", id: ids.notificationId },
      { kind: "report", id: ids.reportId },
      { kind: "audit_event", id: ids.auditEventId },
    ],
  },
  clientCoverage: {
    api: ["H1", "H2", "H3", "H4", "H5", "H6", "A1", "A2", "A3", "A4", "A5"],
    cli: ["H1", "H2", "H3", "H5", "A1", "A2", "A3", "A4", "A5"],
    tui: ["H1", "H2", "H3", "H5", "A1", "A3", "A4", "A5"],
    web: ["H1", "H2", "H3", "H4", "H5", "H6", "A1", "A2", "A3", "A4", "A5"],
  },
  humanJourneys: [
    { id: "H1", title: "Create workspace project and subproject", requiredClients: ["api", "cli", "tui", "web"], refs: [{ kind: "project", id: ids.parentProjectId }, { kind: "project", id: ids.childProjectId }] },
    { id: "H2", title: "Create scoped work hierarchy", requiredClients: ["api", "cli", "tui", "web"], refs: [{ kind: "work_item", id: ids.epicId }, workTaskRef] },
    { id: "H3", title: "Attach docs context and knowledge", requiredClients: ["api", "cli", "tui", "web"], refs: [{ kind: "document", id: ids.documentId }, { kind: "context_bundle", id: ids.contextBundleId }] },
    { id: "H4", title: "Review project dashboard and report", requiredClients: ["api", "web"], refs: [{ kind: "report", id: ids.reportId }] },
    { id: "H5", title: "Inspect run artifact memory and notification", requiredClients: ["api", "cli", "tui", "web"], refs: [runRef, artifactRef, memoryRef, { kind: "notification", id: ids.notificationId }] },
    { id: "H6", title: "Complete final review from audit trail", requiredClients: ["api", "web"], refs: [{ kind: "audit_event", id: ids.auditEventId }] },
  ],
  agentJourneys: [
    { id: "A1", title: "Preview context from scoped task", requiredClients: ["api", "cli", "tui", "web"], refs: [workTaskRef, { kind: "context_bundle", id: ids.contextBundleId }] },
    { id: "A2", title: "Dispatch signed or assisted run", requiredClients: ["api", "cli", "web"], refs: [runRef, { kind: "audit_event", id: ids.auditEventId }] },
    { id: "A3", title: "Supervise run observability", requiredClients: ["api", "cli", "tui", "web"], refs: [runRef, artifactRef] },
    { id: "A4", title: "Promote artifact learning to memory", requiredClients: ["api", "cli", "tui", "web"], refs: [artifactRef, memoryRef] },
    { id: "A5", title: "Trigger inherited project automation", requiredClients: ["api", "cli", "tui", "web"], refs: [{ kind: "automation", id: ids.automationId }, workTaskRef] },
  ],
};

export function workflowFixtureIds(): typeof ids {
  return ids;
}

export function assertWorkflowContractFixtureIntegrity(fixture: WorkflowContractUatFixture): WorkflowContractFixtureIntegrity {
  const knownRefs = new Set<string>();
  const add = (kind: WorkflowContractRefKind, id: string) => knownRefs.add(`${kind}:${id}`);

  add("workspace", fixture.workspace.id);
  for (const project of fixture.projects) add("project", project.id);
  add("repository", fixture.repository.id);
  for (const item of fixture.workItems) add("work_item", item.id);
  add("document", fixture.document.id);
  add("context_bundle", fixture.contextBundle.id);
  add("run", fixture.run.id);
  add("artifact", fixture.artifact.id);
  add("memory", fixture.memory.id);
  add("automation", fixture.automation.id);
  add("notification", fixture.notification.id);
  add("report", fixture.report.id);
  add("audit_event", fixture.auditEvent.id);

  const refs = [
    ...fixture.trace.sourceRefs,
    ...fixture.humanJourneys.flatMap((journey) => journey.refs),
    ...fixture.agentJourneys.flatMap((journey) => journey.refs),
  ];
  const orphanReferences = refs.filter((ref) => !knownRefs.has(`${ref.kind}:${ref.id}`));
  const coveredJourneys = new Set([...fixture.humanJourneys, ...fixture.agentJourneys].map((journey) => journey.id));
  const missingClients = (Object.entries(fixture.clientCoverage) as Array<[WorkflowContractClient, string[]]>)
    .filter(([, journeys]) => journeys.some((journey) => !coveredJourneys.has(journey)))
    .map(([client]) => client);
  const requiredTraceKinds: WorkflowContractRefKind[] = [
    "workspace",
    "project",
    "repository",
    "work_item",
    "document",
    "context_bundle",
    "run",
    "artifact",
    "memory",
    "audit_event",
  ];
  const traceKinds = new Set(fixture.trace.sourceRefs.map((ref) => ref.kind));
  const missingTraceKinds = requiredTraceKinds.filter((kind) => !traceKinds.has(kind));

  return {
    ok: missingClients.length === 0 && orphanReferences.length === 0 && missingTraceKinds.length === 0,
    missingClients,
    orphanReferences,
    missingTraceKinds,
  };
}
