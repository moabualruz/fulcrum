import { randomUUID } from "node:crypto";
import { DataSource } from "typeorm";

import {
  type WorkManagementCycle,
  WorkManagementCycleEntity,
  WorkManagementCycleTaskEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";

export type SprintPublicStatus = "planning" | "active" | "completed" | "cancelled";

export interface SprintPublicRow {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  traceId: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SprintTaskPublicRow {
  id: string;
  orgId: string;
  projectId: string;
  sprintId: string;
  taskId: string;
  traceId: string;
  createdAt: string | null;
}

export class SprintPublicStore {
  constructor(private readonly dataSource: DataSource) {}

  async listSprints(input: { orgId: string; projectId: string; status?: string }): Promise<{ data: SprintPublicRow[] }> {
    const cycles = await this.repository().find({
      where: { projectId: input.projectId, ...(input.status ? { status: input.status } : {}) },
      order: { startsAt: "ASC", createdAt: "ASC", id: "ASC" },
    });

    return { data: cycles.map((cycle) => toPublicRow(input.orgId, cycle)) };
  }

  async createSprint(input: {
    orgId: string;
    projectId?: string;
    name: string;
    status?: SprintPublicStatus;
  }): Promise<SprintPublicRow> {
    const projectId = input.projectId ?? "";
    const id = randomUUID();
    const cycle = await this.repository().save({
      id,
      projectId,
      name: input.name,
      status: input.status ?? "planning",
      startsAt: null,
      endsAt: null,
      traceId: `trace-sprint-${id}`,
    });

    return toPublicRow(input.orgId, cycle);
  }

  async getSprint(input: { orgId: string; id: string }): Promise<SprintPublicRow | null> {
    const cycle = await this.repository().findOneBy({ id: input.id });
    return cycle ? toPublicRow(input.orgId, cycle) : null;
  }

  async patchSprint(input: {
    orgId: string;
    id: string;
    name?: string;
    status?: SprintPublicStatus;
  }): Promise<SprintPublicRow | null> {
    const cycle = await this.repository().findOneBy({ id: input.id });
    if (!cycle) return null;

    if (input.name !== undefined) cycle.name = input.name;
    if (input.status !== undefined) cycle.status = input.status;
    const saved = await this.repository().save(cycle);
    return toPublicRow(input.orgId, saved);
  }

  async deleteSprint(input: { orgId: string; id: string }): Promise<void> {
    const cycle = await this.repository().findOneBy({ id: input.id });
    if (!cycle) return;
    await this.repository().remove(cycle);
  }

  async startSprint(input: { orgId: string; id: string }): Promise<SprintPublicRow | null> {
    const cycle = await this.repository().findOneBy({ id: input.id });
    if (!cycle) return null;
    if (cycle.status === "active") throw new Error("sprint_already_active");

    const active = await this.repository().findOneBy({ projectId: cycle.projectId, status: "active" });
    if (active) throw new Error("at_most_one_active");

    cycle.status = "active";
    const saved = await this.repository().save(cycle);
    return toPublicRow(input.orgId, saved);
  }

  async closeSprint(input: { orgId: string; id: string; unfinishedDisposition?: "backlog" }): Promise<{
    closed: true;
    sprint: SprintPublicRow;
    unfinishedDisposition: "backlog";
  } | null> {
    const cycle = await this.repository().findOneBy({ id: input.id });
    if (!cycle) return null;
    if (cycle.status !== "active") throw new Error("sprint_must_be_active");

    cycle.status = "completed";
    const saved = await this.repository().save(cycle);
    return {
      closed: true,
      sprint: toPublicRow(input.orgId, saved),
      unfinishedDisposition: input.unfinishedDisposition ?? "backlog",
    };
  }

  async addTask(input: { orgId: string; id: string; taskId: string }): Promise<SprintTaskPublicRow | null> {
    const cycle = await this.repository().findOneBy({ id: input.id });
    if (!cycle) return null;
    const row = await this.taskRepository().save({
      id: randomUUID(),
      projectId: cycle.projectId,
      cycleId: cycle.id,
      taskId: input.taskId,
      traceId: `trace-sprint-task-${cycle.id}-${input.taskId}`,
    });
    return toTaskPublicRow(input.orgId, row);
  }

  async removeTask(input: { orgId: string; id: string; taskId: string }): Promise<SprintTaskPublicRow | null> {
    const row = await this.taskRepository().findOneBy({ cycleId: input.id, taskId: input.taskId });
    if (!row) return null;
    await this.taskRepository().remove(row);
    return toTaskPublicRow(input.orgId, row);
  }

  private repository() {
    return this.dataSource.getRepository(WorkManagementCycleEntity);
  }

  private taskRepository() {
    return this.dataSource.getRepository(WorkManagementCycleTaskEntity);
  }
}

function toPublicRow(orgId: string, cycle: WorkManagementCycle): SprintPublicRow {
  return {
    id: cycle.id,
    orgId,
    projectId: cycle.projectId,
    name: cycle.name,
    status: cycle.status,
    startsAt: cycle.startsAt?.toISOString() ?? null,
    endsAt: cycle.endsAt?.toISOString() ?? null,
    traceId: cycle.traceId,
    createdAt: cycle.createdAt?.toISOString() ?? null,
    updatedAt: cycle.updatedAt?.toISOString() ?? null,
  };
}

function toTaskPublicRow(orgId: string, row: {
  id: string;
  projectId: string;
  cycleId: string;
  taskId: string;
  traceId: string;
  createdAt?: Date;
}): SprintTaskPublicRow {
  return {
    id: row.id,
    orgId,
    projectId: row.projectId,
    sprintId: row.cycleId,
    taskId: row.taskId,
    traceId: row.traceId,
    createdAt: row.createdAt?.toISOString() ?? null,
  };
}
