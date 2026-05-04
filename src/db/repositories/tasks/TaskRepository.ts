/**
 * TaskRepository — tasks domain (Pillar 6).
 *
 * Stub repository — Pillar 6 fills in domain methods.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Task>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { EntityData } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";
import { Org } from "../../entities/auth/Org.ts";
import { Task } from "../../entities/tasks/Task.ts";
import { textToTipTapDoc, type TipTapJson } from "../../tasks-rich-text.ts";

export interface TaskCreateInput {
  orgId: string;
  title: string;
  description?: string | null;
  descriptionText?: string;
  tiptapContent?: TipTapJson;
  status?: string | null;
  priority?: number | null;
  points?: number | null;
}

export interface TaskListInput {
  orgId: string;
  includeDeleted?: boolean;
}

export interface TaskGetInput {
  orgId: string;
  id: string;
}

export interface TaskUpdateInput extends TaskGetInput {
  title?: string;
  description?: string | null;
  descriptionText?: string;
  tiptapContent?: TipTapJson;
  status?: string | null;
  priority?: number | null;
  points?: number | null;
}

@injectable()
export class TaskRepository extends EntityRepository<Task> {
  override create(input: TaskCreateInput | EntityData<Task>): Task {
    if (!("orgId" in input)) {
      return super.create(input as never);
    }

    const em = this.getEntityManager();
    const now = new Date();
    const task = super.create({
      id: randomUUID(),
      org: em.getReference(Org, input.orgId),
      title: input.title,
      description: input.description ?? null,
      tiptapContent: input.tiptapContent ?? textToTipTapDoc(input.descriptionText ?? input.description ?? ""),
      status: input.status ?? "todo",
      priority: input.priority ?? null,
      points: input.points ?? null,
      customFields: {},
      dependencies: { blocks: [], blocked_by: [] },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    em.persist(task);
    return task;
  }

  async list(input: TaskListInput): Promise<Task[]> {
    await this.getEntityManager().flush();
    return this.find(
      {
        org: input.orgId,
        ...(input.includeDeleted ? {} : { deletedAt: null }),
      } as never,
      { orderBy: { createdAt: "DESC", id: "ASC" } },
    );
  }

  async get(input: TaskGetInput & { includeDeleted?: boolean }): Promise<Task | null> {
    await this.getEntityManager().flush();
    return this.findOne({
      org: input.orgId,
      id: input.id,
      ...(input.includeDeleted ? {} : { deletedAt: null }),
    } as never);
  }

  async update(input: TaskUpdateInput): Promise<Task | null> {
    const task = await this.get(input);
    if (!task) return null;

    if (input.title !== undefined) task.title = input.title;
    if (input.description !== undefined) task.description = input.description;
    if (input.descriptionText !== undefined) task.tiptapContent = textToTipTapDoc(input.descriptionText);
    if (input.tiptapContent !== undefined) task.tiptapContent = input.tiptapContent;
    if (input.status !== undefined) task.status = input.status;
    if (input.priority !== undefined) task.priority = input.priority;
    if (input.points !== undefined) task.points = input.points;
    task.updatedAt = new Date();

    this.getEntityManager().persist(task);
    await this.getEntityManager().flush();
    return task;
  }

  async delete(input: TaskGetInput): Promise<Task | null> {
    const task = await this.get(input);
    if (!task) return null;

    task.deletedAt = new Date();
    task.updatedAt = task.deletedAt;
    this.getEntityManager().persist(task);
    await this.getEntityManager().flush();
    return task;
  }
}
