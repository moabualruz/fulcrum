import {
  ExternalWorkItemMirrorSchema,
  SCHEMA_VERSION,
  TaskSchema,
  makeId,
  type ExternalWorkItemMirror,
  type PolicyDecision,
  type Task
} from "@fulcrum/shared";
import { evaluatePolicy } from "@fulcrum/policy";
import type { AdapterPreview } from "../adapters/adapter.js";
import type { TaskRepositoryPort } from "../tasks/service.js";

export interface ExternalPmWorkItem {
  externalId: string;
  title: string;
  body?: string;
  status?: string;
  updatedAt?: string;
  url?: string;
  docs?: Array<{ title: string; url: string; updatedAt?: string }>;
}

export interface ExternalPmAdapterPort {
  metadata: { adapterId: string; name: string };
  healthCheck?: () => Promise<import("@fulcrum/shared").CapabilityHealthRecord>;
  importWorkItems(): Promise<ExternalPmWorkItem[]>;
  previewWriteback(input: ExternalWritebackInput): Promise<AdapterPreview>;
  writeback?: (input: ExternalWritebackInput, policyDecisionId: string) => Promise<unknown>;
  disable(reason: string): Promise<void>;
}

export interface ExternalPmProjectRepositoryPort {
  get(projectId: string): unknown;
}

export interface ExternalWorkItemMirrorRepositoryPort {
  save(mirror: ExternalWorkItemMirror): ExternalWorkItemMirror;
  get(mirrorId: string): ExternalWorkItemMirror | undefined;
  findByExternal(adapterId: string, externalId: string): ExternalWorkItemMirror | undefined;
  list(projectId?: string): ExternalWorkItemMirror[];
}

export interface ExternalPmImportInput {
  projectId: string;
}

export interface ExternalWritebackInput {
  mirrorId?: string;
  externalId: string;
  comment?: string;
  status?: string;
  requester?: string;
  localOnly?: boolean;
}

export interface ExternalWritebackPreview {
  previewId: string;
  mirror?: ExternalWorkItemMirror;
  adapterPreview: AdapterPreview;
  policyDecision: PolicyDecision;
}

const statusMap: Record<string, Task["status"]> = {
  backlog: "pending",
  todo: "pending",
  ready: "ready",
  started: "running",
  in_progress: "running",
  blocked: "blocked",
  review: "review",
  done: "completed",
  completed: "completed",
  cancelled: "failed"
};

export class ExternalPmService {
  constructor(
    private readonly mirrors: ExternalWorkItemMirrorRepositoryPort,
    private readonly tasks: TaskRepositoryPort,
    private readonly adapter: ExternalPmAdapterPort,
    private readonly projects: ExternalPmProjectRepositoryPort
  ) {}

  async importWork(input: ExternalPmImportInput): Promise<ExternalWorkItemMirror[]> {
    if (!this.projects.get(input.projectId)) {
      throw new Error(`Project not found: ${input.projectId}`);
    }
    const now = new Date().toISOString();
    try {
      const items = await this.adapter.importWorkItems();
      return items.map((item) => this.upsertMirror(input.projectId, item, now));
    } catch (error) {
      return this.markFailed(
        error instanceof Error ? error.message : String(error),
        input.projectId
      );
    }
  }

  list(projectId?: string): ExternalWorkItemMirror[] {
    return this.mirrors.list(projectId);
  }

  syncStatus(projectId?: string): Array<ExternalWorkItemMirror & { nextAction: string }> {
    return this.list(projectId).map((mirror) => ({
      ...mirror,
      nextAction: nextActionFor(mirror)
    }));
  }

  adapterHealthPort(): ExternalPmAdapterPort {
    return this.adapter;
  }

  async previewWriteback(input: ExternalWritebackInput): Promise<ExternalWritebackPreview> {
    const mirror =
      input.mirrorId !== undefined
        ? this.mirrors.get(input.mirrorId)
        : this.mirrors.findByExternal(this.adapter.metadata.adapterId, input.externalId);
    const adapterPreview = await this.adapter.previewWriteback(input);
    const policyDecision = evaluatePolicy({
      action: "external_writeback",
      subjectType: "external_work_item",
      subjectId: mirror?.mirrorId ?? input.externalId,
      requester: input.requester ?? "operator",
      taskId: mirror?.taskId,
      preview: true,
      localOnly: input.localOnly ?? false
    });
    const previewId = makeId("preview", `external-writeback-${input.externalId}`);
    const updatedMirror = mirror
      ? this.mirrors.save(
          Object.assign(mirror, {
            writebackPreviewId: previewId,
            updatedAt: new Date().toISOString()
          })
        )
      : undefined;
    return { previewId, mirror: updatedMirror, adapterPreview, policyDecision };
  }

  async disable(reason: string): Promise<ExternalWorkItemMirror[]> {
    await this.adapter.disable(reason);
    const now = new Date().toISOString();
    return this.mirrors.list().map((mirror) =>
      this.mirrors.save({
        ...mirror,
        syncStatus: "disabled",
        lastFailure: reason,
        updatedAt: now
      })
    );
  }

  linkTask(input: { mirrorId: string; taskId: string }): ExternalWorkItemMirror {
    const mirror = this.mirrors.get(input.mirrorId);
    const task = this.tasks.get(input.taskId);
    if (!mirror) {
      throw new Error(`Mirror not found: ${input.mirrorId}`);
    }
    if (!task) {
      throw new Error(`Task not found: ${input.taskId}`);
    }
    return this.mirrors.save({
      ...mirror,
      taskId: task.taskId,
      updatedAt: new Date().toISOString()
    });
  }

  async decideWriteback(input: {
    mirrorId: string;
    decision: "approve" | "deny" | "postpone";
    policyDecisionId?: string;
    comment?: string;
    status?: string;
  }): Promise<ExternalWorkItemMirror> {
    const mirror = this.mirrors.get(input.mirrorId);
    if (!mirror) {
      throw new Error(`Mirror not found: ${input.mirrorId}`);
    }
    if (input.decision === "approve") {
      if (!input.policyDecisionId) {
        throw new Error("policyDecisionId required to approve external writeback");
      }
      await this.adapter.writeback?.(
        {
          mirrorId: input.mirrorId,
          externalId: mirror.externalId,
          comment: input.comment,
          status: input.status
        },
        input.policyDecisionId
      );
      return this.mirrors.save({
        ...mirror,
        lastWritebackAt: new Date().toISOString(),
        syncStatus: "synced",
        updatedAt: new Date().toISOString()
      });
    }
    return this.mirrors.save({
      ...mirror,
      syncStatus: input.decision === "deny" ? "local_newer" : mirror.syncStatus,
      updatedAt: new Date().toISOString()
    });
  }

  private upsertMirror(
    projectId: string,
    item: ExternalPmWorkItem,
    now: string
  ): ExternalWorkItemMirror {
    const existing = this.mirrors.findByExternal(this.adapter.metadata.adapterId, item.externalId);
    const task = existing
      ? this.tasks.get(existing.taskId)
      : this.tasks.save(
          TaskSchema.parse({
            taskId: makeId("task", `${projectId}-${item.externalId}`),
            projectId,
            title: item.title,
            descriptionSnapshot: item.body,
            status: mapExternalStatus(item.status),
            priority: "normal",
            labels: ["external-pm", this.adapter.metadata.name.toLowerCase()],
            createdAt: now,
            updatedAt: now,
            schemaVersion: SCHEMA_VERSION
          })
        );
    if (!task) {
      throw new Error(`Task not found for mirror ${existing?.mirrorId}`);
    }
    const syncStatus = existing ? classifySync(task, item) : "synced";
    const mirror = ExternalWorkItemMirrorSchema.parse({
      mirrorId:
        existing?.mirrorId ?? makeId("mirror", `${this.adapter.metadata.name}-${item.externalId}`),
      taskId: task.taskId,
      adapterId: this.adapter.metadata.adapterId,
      externalSystem: this.adapter.metadata.name,
      externalId: item.externalId,
      externalUrl: item.url,
      sourceTitle: item.title,
      sourceBodySnapshot: item.body,
      sourceStatus: item.status,
      sourceUpdatedAt: item.updatedAt,
      syncStatus,
      conflictStatus: syncStatus === "conflict" ? "local_remote" : "none",
      lastImportAt: now,
      lastWritebackAt: existing?.lastWritebackAt,
      writebackPreviewId: existing?.writebackPreviewId,
      provenance: {
        adapter: this.adapter.metadata.name,
        docs: item.docs ?? [],
        importedAt: now
      },
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION
    });
    return this.mirrors.save(mirror);
  }

  private markFailed(reason: string, projectId: string): ExternalWorkItemMirror[] {
    const now = new Date().toISOString();
    return this.mirrors.list(projectId).map((mirror) =>
      this.mirrors.save({
        ...mirror,
        syncStatus: "failed",
        lastFailure: reason,
        updatedAt: now
      })
    );
  }
}

export function mapExternalStatus(status?: string): Task["status"] {
  return statusMap[(status ?? "").toLowerCase().replace(/\s+/g, "_")] ?? "pending";
}

function classifySync(task: Task, item: ExternalPmWorkItem): ExternalWorkItemMirror["syncStatus"] {
  if (!item.updatedAt) {
    return "synced";
  }
  const remoteTime = Date.parse(item.updatedAt);
  const localTime = Date.parse(task.updatedAt);
  if (Number.isNaN(remoteTime) || Number.isNaN(localTime)) {
    return "synced";
  }
  if (Math.abs(remoteTime - localTime) < 1000) {
    return "synced";
  }
  if (remoteTime > localTime && task.title !== item.title) {
    return "conflict";
  }
  return remoteTime > localTime ? "remote_newer" : "local_newer";
}

function nextActionFor(mirror: ExternalWorkItemMirror): string {
  switch (mirror.syncStatus) {
    case "never_synced":
      return "Import external work item.";
    case "synced":
      return "No action required.";
    case "local_newer":
      return "Preview external writeback.";
    case "remote_newer":
      return "Review remote changes before updating local task.";
    case "conflict":
      return "Resolve local and remote divergence.";
    case "failed":
      return "Check adapter health and retry sync.";
    case "disabled":
      return "Enable adapter to resume sync; local task history remains usable.";
  }
}
