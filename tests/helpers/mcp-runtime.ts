import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ArtifactService,
  CodeEvidenceService,
  ContextPackBuilder,
  LocalArtifactStorage,
  LocalTaskService,
  MemoryService,
  PolicyEnforcementService,
  ProjectRegistryService,
  QualityGateRunner,
  RunLifecycleService,
  WorktreeAllocationService,
  WorktreeStatusService,
  type ArtifactRepositoryPort,
  type PolicyDecisionRepositoryPort,
  type PolicyEventRepositoryPort
} from "@fulcrum/core";
import {
  makeId,
  ProjectSchema,
  SCHEMA_VERSION,
  type ArtifactContract,
  type CodeEvidence,
  type ContextItem,
  type ContextPack,
  type MemoryEntry,
  type PolicyDecision,
  type Project,
  type QualityGateDefinition,
  type QualityGateResult,
  type Run,
  type RunEvent,
  type Task,
  type WorktreeAllocation
} from "@fulcrum/shared";
import type { FulcrumMcpRuntime } from "@fulcrum/mcp";

class TaskRepo {
  tasks = new Map<string, Task>();
  save(task: Task): Task {
    this.tasks.set(task.taskId, task);
    return task;
  }
  get(taskId: string) {
    return this.tasks.get(taskId);
  }
  list(projectId?: string) {
    return [...this.tasks.values()].filter((task) => !projectId || task.projectId === projectId);
  }
}

class ProjectRepo {
  projects = new Map<string, Project>();
  save(project: Project): Project {
    this.projects.set(project.projectId, project);
    return project;
  }
  get(projectId: string) {
    return this.projects.get(projectId);
  }
  findByRoot(rootPath: string) {
    return [...this.projects.values()].find((project) => project.rootPath === rootPath);
  }
  list() {
    return [...this.projects.values()];
  }
}

class RunRepo {
  runs = new Map<string, Run>();
  events: RunEvent[] = [];
  save(run: Run): Run {
    this.runs.set(run.runId, run);
    return run;
  }
  get(runId: string) {
    return this.runs.get(runId);
  }
  list(projectId?: string) {
    return [...this.runs.values()].filter((run) => !projectId || run.projectId === projectId);
  }
  appendEvent(event: Omit<RunEvent, "sequence">): RunEvent {
    const saved = { ...event, sequence: this.events.length };
    this.events.push(saved);
    return saved;
  }
  listEvents(runId: string) {
    return this.events.filter((event) => event.runId === runId);
  }
}

class ContextRepo {
  packs = new Map<string, ContextPack>();
  items = new Map<string, ContextItem[]>();
  savePack(pack: ContextPack) {
    this.packs.set(pack.contextPackId, pack);
    return pack;
  }
  saveItems(items: ContextItem[]) {
    this.items.set(items[0]?.contextPackId ?? "", items);
    return items;
  }
  getPack(contextPackId: string) {
    return this.packs.get(contextPackId);
  }
  listItems(contextPackId: string) {
    return this.items.get(contextPackId) ?? [];
  }
}

class MemoryRepo {
  entries = new Map<string, MemoryEntry>();
  save(entry: MemoryEntry) {
    this.entries.set(entry.memoryId, entry);
    return entry;
  }
  get(memoryId: string) {
    return this.entries.get(memoryId);
  }
  list(projectId?: string) {
    return [...this.entries.values()].filter(
      (entry) => !projectId || entry.projectId === projectId
    );
  }
}

class CodeRepo {
  evidence = new Map<string, CodeEvidence>();
  save(evidence: CodeEvidence) {
    this.evidence.set(evidence.evidenceId, evidence);
    return evidence;
  }
  list(projectId: string) {
    return [...this.evidence.values()].filter((item) => item.projectId === projectId);
  }
  markStale(evidenceId: string, staleAt: string) {
    const current = this.evidence.get(evidenceId);
    if (!current) return undefined;
    const updated = { ...current, freshness: "stale" as const, staleAt };
    this.evidence.set(evidenceId, updated);
    return updated;
  }
}

class ArtifactRepo implements ArtifactRepositoryPort {
  artifacts = new Map<string, ArtifactContract>();
  save(artifact: ArtifactContract): ArtifactContract {
    this.artifacts.set(artifact.artifactId, artifact);
    return artifact;
  }
  get(artifactId: string) {
    return this.artifacts.get(artifactId);
  }
  listByRun(runId: string) {
    return [...this.artifacts.values()].filter((artifact) => artifact.runId === runId);
  }
}

class QualityRepo {
  definitions = new Map<string, QualityGateDefinition>();
  results = new Map<string, QualityGateResult>();
  saveDefinition(definition: QualityGateDefinition) {
    this.definitions.set(definition.gateId, definition);
    return definition;
  }
  getDefinition(gateId: string) {
    return this.definitions.get(gateId);
  }
  listDefinitions(projectId: string) {
    return [...this.definitions.values()].filter((gate) => gate.projectId === projectId);
  }
  saveResult(result: QualityGateResult) {
    this.results.set(result.qualityGateResultId, result);
    return result;
  }
  getResult(resultId: string) {
    return this.results.get(resultId);
  }
  listResults(input: { projectId: string; runId?: string; taskId?: string }) {
    return [...this.results.values()].filter(
      (result) =>
        result.projectId === input.projectId &&
        (!input.runId || result.runId === input.runId) &&
        (!input.taskId || result.taskId === input.taskId)
    );
  }
}

class WorktreeRepo {
  worktrees = new Map<string, WorktreeAllocation>();
  save(worktree: WorktreeAllocation) {
    this.worktrees.set(worktree.worktreeId, worktree);
    return worktree;
  }
  get(worktreeId: string) {
    return this.worktrees.get(worktreeId);
  }
  list(projectId?: string) {
    return [...this.worktrees.values()].filter(
      (item) => !projectId || item.projectId === projectId
    );
  }
}

class PolicyRepo implements PolicyDecisionRepositoryPort {
  decisions = new Map<string, PolicyDecision>();
  save(decision: PolicyDecision) {
    this.decisions.set(decision.policyDecisionId, decision);
    return decision;
  }
  get(policyDecisionId: string) {
    return this.decisions.get(policyDecisionId);
  }
  listPending() {
    return [...this.decisions.values()].filter(
      (decision) => decision.status === "approval_required"
    );
  }
}

class EventRepo implements PolicyEventRepositoryPort {
  events: RunEvent[] = [];
  append(event: Omit<RunEvent, "sequence">): RunEvent {
    const saved = { ...event, sequence: this.events.length };
    this.events.push(saved);
    return saved;
  }
}

export function createTestMcpRuntime(root: string): FulcrumMcpRuntime & {
  task: Task;
  project: Project;
} {
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, "README.md"), "Fulcrum MCP test fixture\n");
  const taskRepo = new TaskRepo();
  const projectRepo = new ProjectRepo();
  const runRepo = new RunRepo();
  const worktreeRepo = new WorktreeRepo();
  const tasks = new LocalTaskService(taskRepo);
  const projects = new ProjectRegistryService(projectRepo, tasks);
  const project = projectRepo.save(
    ProjectSchema.parse({
      projectId: "proj_mcp",
      name: "MCP Test",
      rootPath: root,
      defaultBranch: "main",
      worktreePolicyId: "pol_worktree",
      ignoredPathPolicyId: "pol_ignore",
      qualityGateSetId: "gate_set",
      privacyMode: "local_only",
      healthState: "managed",
      enabledCapabilities: [],
      disabledCapabilities: [],
      adapterMappings: {},
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      schemaVersion: SCHEMA_VERSION
    })
  );
  const task = tasks.create({
    projectId: project.projectId,
    title: "MCP task",
    description: "Search README"
  });
  tasks.transition(task.taskId, "ready");
  const worktrees = new WorktreeAllocationService(worktreeRepo, taskRepo, projectRepo);
  const runs = new RunLifecycleService(runRepo, taskRepo);
  const artifacts = new ArtifactService(
    new ArtifactRepo(),
    new LocalArtifactStorage(path.join(root, "artifacts"))
  );
  const quality = new QualityGateRunner(new QualityRepo(), artifacts, runRepo);
  quality.define({
    gateId: "gate_mcp_validation",
    projectId: project.projectId,
    name: "MCP validation",
    command: `${process.execPath} -e "process.exit(0)"`,
    required: false
  });
  return {
    project,
    task,
    doctor: () => ({ capabilityId: "cap_mcp", state: "managed" }),
    projects,
    tasks,
    runs,
    context: new ContextPackBuilder(new ContextRepo(), taskRepo, projectRepo),
    memory: new MemoryService(new MemoryRepo()),
    code: new CodeEvidenceService(
      projectRepo,
      new CodeRepo(),
      {
        search: async ({ query }) => [
          {
            filePath: "README.md",
            lineStart: 1,
            lineEnd: 1,
            evidenceType: "exact_string",
            sourceTool: "test",
            reason: `Matched ${query}`
          }
        ]
      },
      async () => ({
        state: "disabled",
        capabilityId: "cap_semantic_code",
        nextAction: "Use exact search."
      })
    ),
    artifacts,
    quality,
    policy: new PolicyEnforcementService(new PolicyRepo(), new EventRepo()),
    worktrees,
    worktreeStatus: new WorktreeStatusService(worktreeRepo, runRepo)
  };
}
