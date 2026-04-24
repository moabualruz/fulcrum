import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ContextItemSchema,
  ContextPackSchema,
  ExternalWorkItemMirrorSchema,
  MemoryEntrySchema,
  ProjectSchema,
  QualityGateDefinitionSchema,
  QualityGateResultSchema,
  RunEventSchema,
  RunSchema,
  TaskSchema,
  WorktreeAllocationSchema,
  type ContextItem,
  type ContextPack,
  type ExternalWorkItemMirror,
  CodeEvidenceSchema,
  type CodeEvidence,
  type MemoryEntry,
  type Project,
  type QualityGateDefinition,
  type QualityGateResult,
  type Run,
  type RunEvent,
  type Task,
  type WorktreeAllocation
} from "@fulcrum/shared";
import type { CodeEvidenceRepositoryPort } from "../code/evidence-service.js";
import type { ContextPackRepositoryPort } from "../context/builder.js";
import type { ExternalWorkItemMirrorRepositoryPort } from "../external-pm/service.js";
import type { MemoryRepositoryPort } from "../memory/service.js";
import type { ProjectRepositoryPort } from "../projects/service.js";
import type { QualityGateRepositoryPort } from "../quality/runner.js";
import type { RunRepositoryPort } from "../runs/service.js";
import type { TaskRepositoryPort } from "../tasks/service.js";
import type { WorktreeRepositoryPort } from "../worktrees/status.js";

interface WorkState {
  projects: Project[];
  tasks: Task[];
  externalWorkItemMirrors: ExternalWorkItemMirror[];
  codeEvidence: CodeEvidence[];
  memoryEntries: MemoryEntry[];
  runs: Run[];
  runEvents: RunEvent[];
  contextPacks: ContextPack[];
  contextItems: ContextItem[];
  worktrees: WorktreeAllocation[];
  qualityGateDefinitions: QualityGateDefinition[];
  qualityGateResults: QualityGateResult[];
}

const emptyState: WorkState = {
  projects: [],
  tasks: [],
  externalWorkItemMirrors: [],
  codeEvidence: [],
  memoryEntries: [],
  runs: [],
  runEvents: [],
  contextPacks: [],
  contextItems: [],
  worktrees: [],
  qualityGateDefinitions: [],
  qualityGateResults: []
};

export class FileWorkRepository {
  constructor(private readonly stateFile: string) {}

  save(projectOrTask: Project | Task): Project | Task {
    return "projectId" in projectOrTask && "rootPath" in projectOrTask
      ? this.saveProject(projectOrTask)
      : this.saveTask(projectOrTask as Task);
  }

  get(id: string): Project | Task | undefined {
    return this.getProject(id) ?? this.getTask(id);
  }

  findByRoot(rootPath: string): Project | undefined {
    return this.read().projects.find((project) => project.rootPath === rootPath);
  }

  list(projectId?: string): Array<Project | Task> {
    const state = this.read();
    return projectId ? state.tasks.filter((task) => task.projectId === projectId) : state.projects;
  }

  saveProject(project: Project): Project {
    const parsed = ProjectSchema.parse(project);
    const state = this.read();
    state.projects = [
      parsed,
      ...state.projects.filter((item) => item.projectId !== parsed.projectId)
    ];
    this.write(state);
    return parsed;
  }

  getProject(projectId: string): Project | undefined {
    return this.read().projects.find((project) => project.projectId === projectId);
  }

  listProjects(): Project[] {
    return this.read().projects;
  }

  saveTask(task: Task): Task {
    const parsed = TaskSchema.parse(task);
    const state = this.read();
    state.tasks = [parsed, ...state.tasks.filter((item) => item.taskId !== parsed.taskId)];
    this.write(state);
    return parsed;
  }

  getTask(taskId: string): Task | undefined {
    return this.read().tasks.find((task) => task.taskId === taskId);
  }

  listTasks(projectId?: string): Task[] {
    const tasks = this.read().tasks;
    return projectId ? tasks.filter((task) => task.projectId === projectId) : tasks;
  }

  read(): WorkState {
    try {
      const data = JSON.parse(readFileSync(this.stateFile, "utf8")) as Partial<WorkState>;
      return {
        projects: (data.projects ?? []).map((project) => ProjectSchema.parse(project)),
        tasks: (data.tasks ?? []).map((task) => TaskSchema.parse(task)),
        externalWorkItemMirrors: (data.externalWorkItemMirrors ?? []).map((mirror) =>
          ExternalWorkItemMirrorSchema.parse(mirror)
        ),
        codeEvidence: (data.codeEvidence ?? []).map((evidence) =>
          CodeEvidenceSchema.parse(evidence)
        ),
        memoryEntries: (data.memoryEntries ?? []).map((entry) => MemoryEntrySchema.parse(entry)),
        runs: (data.runs ?? []).map((run) => RunSchema.parse(run)),
        runEvents: (data.runEvents ?? []).map((event) => RunEventSchema.parse(event)),
        contextPacks: (data.contextPacks ?? []).map((pack) => ContextPackSchema.parse(pack)),
        contextItems: (data.contextItems ?? []).map((item) => ContextItemSchema.parse(item)),
        worktrees: (data.worktrees ?? []).map((worktree) =>
          WorktreeAllocationSchema.parse(worktree)
        ),
        qualityGateDefinitions: (data.qualityGateDefinitions ?? []).map((definition) =>
          QualityGateDefinitionSchema.parse(definition)
        ),
        qualityGateResults: (data.qualityGateResults ?? []).map((result) =>
          QualityGateResultSchema.parse(result)
        )
      };
    } catch {
      return { ...emptyState };
    }
  }

  write(state: WorkState): void {
    mkdirSync(path.dirname(this.stateFile), { recursive: true });
    writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
  }
}

export class FileWorktreeRepository implements WorktreeRepositoryPort {
  constructor(private readonly work: FileWorkRepository) {}

  save(worktree: WorktreeAllocation): WorktreeAllocation {
    const parsed = WorktreeAllocationSchema.parse(worktree);
    const state = this.work.read();
    state.worktrees = [
      parsed,
      ...state.worktrees.filter((item) => item.worktreeId !== parsed.worktreeId)
    ];
    this.work.write(state);
    return parsed;
  }

  get(worktreeId: string): WorktreeAllocation | undefined {
    return this.work.read().worktrees.find((worktree) => worktree.worktreeId === worktreeId);
  }

  list(projectId?: string): WorktreeAllocation[] {
    const worktrees = this.work.read().worktrees;
    return projectId ? worktrees.filter((worktree) => worktree.projectId === projectId) : worktrees;
  }
}

export class FileContextPackRepository implements ContextPackRepositoryPort {
  constructor(private readonly work: FileWorkRepository) {}

  savePack(pack: ContextPack): ContextPack {
    const parsed = ContextPackSchema.parse(pack);
    const state = this.work.read();
    state.contextPacks = [
      parsed,
      ...state.contextPacks.filter((item) => item.contextPackId !== parsed.contextPackId)
    ];
    this.work.write(state);
    return parsed;
  }

  saveItems(items: ContextItem[]): ContextItem[] {
    const parsed = items.map((item) => ContextItemSchema.parse(item));
    const state = this.work.read();
    const packIds = new Set(parsed.map((item) => item.contextPackId));
    state.contextItems = [
      ...parsed,
      ...state.contextItems.filter((item) => !packIds.has(item.contextPackId))
    ];
    this.work.write(state);
    return parsed;
  }

  getPack(contextPackId: string): ContextPack | undefined {
    return this.work.read().contextPacks.find((pack) => pack.contextPackId === contextPackId);
  }

  listItems(contextPackId: string): ContextItem[] {
    return this.work
      .read()
      .contextItems.filter((item) => item.contextPackId === contextPackId)
      .sort((left, right) => left.rank - right.rank);
  }
}

export class FileMemoryRepository implements MemoryRepositoryPort {
  constructor(private readonly work: FileWorkRepository) {}

  save(entry: MemoryEntry): MemoryEntry {
    const parsed = MemoryEntrySchema.parse(entry);
    const state = this.work.read();
    state.memoryEntries = [
      parsed,
      ...state.memoryEntries.filter((item) => item.memoryId !== parsed.memoryId)
    ];
    this.work.write(state);
    return parsed;
  }

  get(memoryId: string): MemoryEntry | undefined {
    return this.work.read().memoryEntries.find((entry) => entry.memoryId === memoryId);
  }

  list(projectId?: string): MemoryEntry[] {
    const entries = this.work.read().memoryEntries;
    return projectId ? entries.filter((entry) => entry.projectId === projectId) : entries;
  }
}

export class FileCodeEvidenceRepository implements CodeEvidenceRepositoryPort {
  constructor(private readonly work: FileWorkRepository) {}

  save(evidence: CodeEvidence): CodeEvidence {
    const parsed = CodeEvidenceSchema.parse(evidence);
    const state = this.work.read();
    state.codeEvidence = [
      parsed,
      ...state.codeEvidence.filter((item) => item.evidenceId !== parsed.evidenceId)
    ];
    this.work.write(state);
    return parsed;
  }

  list(projectId: string): CodeEvidence[] {
    return this.work.read().codeEvidence.filter((item) => item.projectId === projectId);
  }

  markStale(evidenceId: string, staleAt: string): CodeEvidence | undefined {
    const state = this.work.read();
    const current = state.codeEvidence.find((item) => item.evidenceId === evidenceId);
    if (!current) {
      return undefined;
    }
    const updated = CodeEvidenceSchema.parse({ ...current, staleAt, freshness: "stale" });
    state.codeEvidence = [
      updated,
      ...state.codeEvidence.filter((item) => item.evidenceId !== evidenceId)
    ];
    this.work.write(state);
    return updated;
  }
}

export class FileExternalWorkItemMirrorRepository implements ExternalWorkItemMirrorRepositoryPort {
  constructor(private readonly work: FileWorkRepository) {}

  save(mirror: ExternalWorkItemMirror): ExternalWorkItemMirror {
    const parsed = ExternalWorkItemMirrorSchema.parse(mirror);
    const state = this.read();
    state.externalWorkItemMirrors = [
      parsed,
      ...state.externalWorkItemMirrors.filter((item) => item.mirrorId !== parsed.mirrorId)
    ];
    this.write(state);
    return parsed;
  }

  get(mirrorId: string): ExternalWorkItemMirror | undefined {
    return this.read().externalWorkItemMirrors.find((mirror) => mirror.mirrorId === mirrorId);
  }

  findByExternal(adapterId: string, externalId: string): ExternalWorkItemMirror | undefined {
    return this.read().externalWorkItemMirrors.find(
      (mirror) => mirror.adapterId === adapterId && mirror.externalId === externalId
    );
  }

  list(projectId?: string): ExternalWorkItemMirror[] {
    const state = this.read();
    if (!projectId) {
      return state.externalWorkItemMirrors;
    }
    const taskIds = new Set(
      state.tasks.filter((task) => task.projectId === projectId).map((task) => task.taskId)
    );
    return state.externalWorkItemMirrors.filter((mirror) => taskIds.has(mirror.taskId));
  }

  private read(): WorkState {
    return this.work.read();
  }

  private write(state: WorkState): void {
    this.work.write(state);
  }
}

export class FileProjectRepository implements ProjectRepositoryPort {
  constructor(private readonly work: FileWorkRepository) {}

  save(project: Project): Project {
    return this.work.saveProject(project);
  }

  get(projectId: string): Project | undefined {
    return this.work.getProject(projectId);
  }

  findByRoot(rootPath: string): Project | undefined {
    return this.work.findByRoot(rootPath);
  }

  list(): Project[] {
    return this.work.listProjects();
  }
}

export class FileTaskRepository implements TaskRepositoryPort {
  constructor(private readonly work: FileWorkRepository) {}

  save(task: Task): Task {
    return this.work.saveTask(task);
  }

  get(taskId: string): Task | undefined {
    return this.work.getTask(taskId);
  }

  list(projectId?: string): Task[] {
    return this.work.listTasks(projectId);
  }
}

export class FileRunRepository implements RunRepositoryPort {
  constructor(private readonly work: FileWorkRepository) {}

  save(run: Run): Run {
    const parsed = RunSchema.parse(run);
    const state = this.work.read();
    state.runs = [parsed, ...state.runs.filter((item) => item.runId !== parsed.runId)];
    this.work.write(state);
    return parsed;
  }

  get(runId: string): Run | undefined {
    return this.work.read().runs.find((run) => run.runId === runId);
  }

  list(projectId?: string): Run[] {
    const runs = this.work.read().runs;
    return projectId ? runs.filter((run) => run.projectId === projectId) : runs;
  }

  appendEvent(event: Omit<RunEvent, "sequence">): RunEvent {
    const state = this.work.read();
    const parsed = RunEventSchema.parse({ ...event, sequence: state.runEvents.length });
    state.runEvents = [...state.runEvents, parsed];
    this.work.write(state);
    return parsed;
  }

  listEvents(runId: string): RunEvent[] {
    return this.work.read().runEvents.filter((event) => event.runId === runId);
  }
}

export class FileQualityGateRepository implements QualityGateRepositoryPort {
  constructor(private readonly work: FileWorkRepository) {}

  saveDefinition(definition: QualityGateDefinition): QualityGateDefinition {
    const parsed = QualityGateDefinitionSchema.parse(definition);
    const state = this.work.read();
    state.qualityGateDefinitions = [
      parsed,
      ...state.qualityGateDefinitions.filter((item) => item.gateId !== parsed.gateId)
    ];
    this.work.write(state);
    return parsed;
  }

  getDefinition(gateId: string): QualityGateDefinition | undefined {
    return this.work
      .read()
      .qualityGateDefinitions.find((definition) => definition.gateId === gateId);
  }

  listDefinitions(projectId: string): QualityGateDefinition[] {
    return this.work
      .read()
      .qualityGateDefinitions.filter((definition) => definition.projectId === projectId)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  saveResult(result: QualityGateResult): QualityGateResult {
    const parsed = QualityGateResultSchema.parse(result);
    const state = this.work.read();
    state.qualityGateResults = [
      parsed,
      ...state.qualityGateResults.filter(
        (item) => item.qualityGateResultId !== parsed.qualityGateResultId
      )
    ];
    this.work.write(state);
    return parsed;
  }

  getResult(resultId: string): QualityGateResult | undefined {
    return this.work
      .read()
      .qualityGateResults.find((result) => result.qualityGateResultId === resultId);
  }

  listResults(input: { projectId: string; runId?: string; taskId?: string }): QualityGateResult[] {
    return this.work
      .read()
      .qualityGateResults.filter(
        (result) =>
          result.projectId === input.projectId &&
          (!input.runId || result.runId === input.runId) &&
          (!input.taskId || result.taskId === input.taskId)
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}
