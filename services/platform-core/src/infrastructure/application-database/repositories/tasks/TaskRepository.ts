/**
 * TaskRepository — tasks domain (Pillar 6).
 *
 * Stub repository — Pillar 6 fills in domain methods.
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { randomUUID } from "node:crypto";
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

@Injectable()
export class TaskRepository {
  constructor(
    @InjectRepository(Task)
    private readonly tasks: Repository<Task>,
  ) {}

  create(input: TaskCreateInput): Task {
    const now = new Date();
    return this.tasks.create({
      id: randomUUID(),
      org: { id: input.orgId } as any,
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
  }

  async list(input: TaskListInput): Promise<Task[]> {
    return this.tasks.find({
      where: {
        org: { id: input.orgId },
        ...(input.includeDeleted ? {} : { deletedAt: IsNull() }),
      },
      order: { createdAt: "DESC", id: "ASC" },
    });
  }

  async get(input: TaskGetInput & { includeDeleted?: boolean }): Promise<Task | null> {
    return this.tasks.findOne({
      where: {
        org: { id: input.orgId },
        id: input.id,
        ...(input.includeDeleted ? {} : { deletedAt: IsNull() }),
      },
    });
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

    return this.tasks.save(task);
  }

  async delete(input: TaskGetInput): Promise<Task | null> {
    const task = await this.get(input);
    if (!task) return null;

    task.deletedAt = new Date();
    task.updatedAt = task.deletedAt;
    return this.tasks.save(task);
  }
}
