import { randomUUID } from "node:crypto";

import { DataSource, In } from "typeorm";

import {
  type WorkManagementCommentReaction,
  WorkManagementCommentReactionEntity,
  WorkManagementNotificationEntity,
  type WorkManagementTaskComment,
  WorkManagementTaskCommentEntity,
  type WorkManagementTaskWatcher,
  WorkManagementTaskWatcherEntity,
} from "@work-management/infrastructure/database/work-structure.entities.ts";
import {
  type FulcrumProject,
  type FulcrumTask,
  FulcrumProjectEntity,
  FulcrumTaskEntity,
} from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";
import { getEventBus } from "@platform-core/application/subscriptions/event-bus.ts";

export interface TaskCommentPublicRow {
  id: string;
  orgId: string;
  taskId: string;
  authorId: string;
  body: Record<string, unknown> | null;
  parentCommentId: string | null;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  reactions: TaskCommentReactionPublicRow[];
  replies?: TaskCommentPublicRow[];
}

export interface TaskCommentReactionPublicRow {
  id: string;
  commentId: string;
  userId: string;
  emoji: string;
  createdAt: string | null;
}

export interface TaskCommentWatcherPublicRow {
  id: string;
  taskId: string;
  userId: string;
  source: string;
  createdAt: string | null;
}

interface CommentScope {
  orgId: string;
}

interface TaskScope extends CommentScope {
  taskId: string;
}

export class TaskCommentStore {
  constructor(private readonly dataSource: DataSource) {}

  async createComment(input: TaskScope & {
    userId: string;
    body: Record<string, unknown>;
    parentCommentId?: string | null;
  }): Promise<TaskCommentPublicRow | null> {
    const task = await this.findTaskInOrg(input);
    if (!task) return null;

    const parentCommentId = input.parentCommentId ?? null;
    if (parentCommentId) {
      const parent = await this.commentRepository().findOneBy({
        id: parentCommentId,
        orgId: input.orgId,
        taskId: input.taskId,
      });
      if (!parent) return null;
    }

    const comment = await this.commentRepository().save({
      id: randomUUID(),
      orgId: input.orgId,
      taskId: task.id,
      authorId: input.userId,
      body: objectValue(input.body),
      parentCommentId,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
    });

    await this.subscribe({ ...input, source: "create" });
    await this.publishCommentEvent("task.comment.created", input.orgId, task, comment, input.userId);

    for (const userId of extractMentionUserIds(comment.body)) {
      await this.subscribe({ orgId: input.orgId, taskId: task.id, userId, source: "mention" });
      await this.createMentionNotification(input.orgId, task, comment, input.userId, userId);
    }

    return serializeComment(comment, []);
  }

  async updateComment(input: CommentScope & {
    commentId: string;
    userId: string;
    body: Record<string, unknown>;
  }): Promise<TaskCommentPublicRow | null> {
    const comment = await this.findCommentInOrg(input);
    if (!comment || comment.authorId !== input.userId) return null;

    const task = await this.findTaskInOrg({ orgId: input.orgId, taskId: comment.taskId });
    if (!task) return null;

    comment.body = objectValue(input.body);
    const updated = await this.commentRepository().save(comment);
    await this.publishCommentEvent("task.comment.updated", input.orgId, task, updated, input.userId);
    for (const userId of extractMentionUserIds(updated.body)) {
      if (userId === input.userId) continue;
      await this.subscribe({ orgId: input.orgId, taskId: task.id, userId, source: "mention" });
      await this.createMentionNotification(input.orgId, task, updated, input.userId, userId);
    }

    return serializeComment(updated, await this.reactionsFor([updated]));
  }

  async listComments(input: TaskScope): Promise<TaskCommentPublicRow[]> {
    const task = await this.findTaskInOrg(input);
    if (!task) return [];

    const comments = await this.commentRepository().find({
      where: { orgId: input.orgId, taskId: task.id },
      order: { createdAt: "ASC", id: "ASC" },
    });
    const reactions = await this.reactionsFor(comments);
    return comments.map((comment) => serializeComment(comment, reactions));
  }

  async threadedComments(input: TaskScope): Promise<TaskCommentPublicRow[]> {
    const task = await this.findTaskInOrg(input);
    if (!task) return [];

    const comments = await this.commentRepository().find({
      where: { orgId: input.orgId, taskId: task.id },
      order: { createdAt: "ASC", id: "ASC" },
    });
    const reactions = await this.reactionsFor(comments);
    const byId = new Map<string, TaskCommentPublicRow>();
    const roots: TaskCommentPublicRow[] = [];

    for (const comment of comments) {
      byId.set(comment.id, serializeComment(comment, reactions, []));
    }
    for (const comment of comments) {
      const row = byId.get(comment.id);
      if (!row) continue;
      if (comment.parentCommentId && byId.has(comment.parentCommentId)) {
        byId.get(comment.parentCommentId)?.replies?.push(row);
      } else {
        roots.push(row);
      }
    }

    return roots;
  }

  async deleteComment(input: CommentScope & { commentId: string; userId: string }): Promise<boolean> {
    const comment = await this.findCommentInOrg(input);
    if (!comment || comment.authorId !== input.userId) return false;
    const task = await this.findTaskInOrg({ orgId: input.orgId, taskId: comment.taskId });
    if (!task) return false;

    const ids = await this.descendantCommentIds(input.orgId, comment.id);
    await this.reactionRepository().delete({ commentId: In(ids) });
    await this.commentRepository().delete({ id: In(ids), orgId: input.orgId });
    await this.publishCommentEvent("task.comment.deleted", input.orgId, task, comment, comment.authorId);
    return true;
  }

  async resolveComment(input: CommentScope & { commentId: string; userId: string }): Promise<TaskCommentPublicRow | null> {
    const comment = await this.findCommentInOrg(input);
    if (!comment) return null;

    comment.resolved = true;
    comment.resolvedBy = input.userId;
    comment.resolvedAt = new Date();
    const updated = await this.commentRepository().save(comment);
    const task = await this.findTaskInOrg({ orgId: input.orgId, taskId: updated.taskId });
    if (task) await this.publishCommentEvent("task.comment.resolved", input.orgId, task, updated, input.userId);
    return serializeComment(updated, await this.reactionsFor([updated]));
  }

  async unresolveComment(input: CommentScope & { commentId: string; userId: string }): Promise<TaskCommentPublicRow | null> {
    const comment = await this.findCommentInOrg(input);
    if (!comment) return null;

    comment.resolved = false;
    comment.resolvedBy = null;
    comment.resolvedAt = null;
    const updated = await this.commentRepository().save(comment);
    const task = await this.findTaskInOrg({ orgId: input.orgId, taskId: updated.taskId });
    if (task) await this.publishCommentEvent("task.comment.unresolved", input.orgId, task, updated, input.userId);
    return serializeComment(updated, await this.reactionsFor([updated]));
  }

  async addReaction(input: CommentScope & {
    commentId: string;
    userId: string;
    emoji: string;
  }): Promise<TaskCommentReactionPublicRow | null> {
    const comment = await this.findCommentInOrg(input);
    if (!comment) return null;

    const existing = await this.reactionRepository().findOneBy({
      commentId: comment.id,
      userId: input.userId,
      emoji: input.emoji,
    });
    if (existing) return serializeReaction(existing);

    const reaction = await this.reactionRepository().save({
      id: randomUUID(),
      commentId: comment.id,
      userId: input.userId,
      emoji: input.emoji,
    });
    const task = await this.findTaskInOrg({ orgId: input.orgId, taskId: comment.taskId });
    if (task) await this.publishCommentEvent("task.comment.reaction_added", input.orgId, task, comment, input.userId, { emoji: input.emoji });
    return serializeReaction(reaction);
  }

  async removeReaction(input: CommentScope & {
    commentId: string;
    userId: string;
    emoji: string;
  }): Promise<boolean> {
    const comment = await this.findCommentInOrg(input);
    if (!comment) return false;

    await this.reactionRepository().delete({
      commentId: comment.id,
      userId: input.userId,
      emoji: input.emoji,
    });
    const task = await this.findTaskInOrg({ orgId: input.orgId, taskId: comment.taskId });
    if (task) await this.publishCommentEvent("task.comment.reaction_removed", input.orgId, task, comment, input.userId, { emoji: input.emoji });
    return true;
  }

  async subscribe(input: TaskScope & {
    userId: string;
    source?: string;
  }): Promise<boolean> {
    const task = await this.findTaskInOrg(input);
    if (!task) return false;

    const existing = await this.watcherRepository().findOneBy({
      taskId: task.id,
      userId: input.userId,
    });
    if (existing) return true;

    await this.watcherRepository().save({
      id: randomUUID(),
      orgId: input.orgId,
      taskId: task.id,
      userId: input.userId,
      source: input.source ?? "manual",
    });
    return true;
  }

  async unsubscribe(input: TaskScope & { userId: string }): Promise<boolean> {
    const task = await this.findTaskInOrg(input);
    if (!task) return false;

    await this.watcherRepository().delete({ taskId: task.id, userId: input.userId });
    return true;
  }

  async listWatchers(input: TaskScope): Promise<TaskCommentWatcherPublicRow[]> {
    const task = await this.findTaskInOrg(input);
    if (!task) return [];

    const watchers = await this.watcherRepository().find({
      where: { orgId: input.orgId, taskId: task.id },
      order: { createdAt: "ASC", id: "ASC" },
    });
    return watchers.map(serializeWatcher);
  }

  private async findTaskInOrg(input: TaskScope): Promise<FulcrumTask | null> {
    const task = await this.taskRepository().findOneBy({ id: input.taskId });
    if (!task) return null;
    const project = await this.projectRepository().findOneBy({
      id: task.projectId,
      workspaceId: input.orgId,
    });
    return project ? task : null;
  }

  private async findCommentInOrg(input: CommentScope & { commentId: string }): Promise<WorkManagementTaskComment | null> {
    return await this.commentRepository().findOneBy({
      id: input.commentId,
      orgId: input.orgId,
    });
  }

  private async descendantCommentIds(orgId: string, rootId: string): Promise<string[]> {
    const ids = [rootId];
    for (let index = 0; index < ids.length; index += 1) {
      const parentId = ids[index];
      if (!parentId) continue;
      const children = await this.commentRepository().find({
        where: { orgId, parentCommentId: parentId },
        select: { id: true },
      });
      ids.push(...children.map((child) => child.id));
    }
    return ids;
  }

  private async reactionsFor(comments: WorkManagementTaskComment[]): Promise<WorkManagementCommentReaction[]> {
    const commentIds = comments.map((comment) => comment.id);
    if (commentIds.length === 0) return [];
    return await this.reactionRepository().find({
      where: { commentId: In(commentIds) },
      order: { createdAt: "ASC", id: "ASC" },
    });
  }

  private commentRepository() {
    return this.dataSource.getRepository(WorkManagementTaskCommentEntity);
  }

  private reactionRepository() {
    return this.dataSource.getRepository(WorkManagementCommentReactionEntity);
  }

  private watcherRepository() {
    return this.dataSource.getRepository(WorkManagementTaskWatcherEntity);
  }

  private notificationRepository() {
    return this.dataSource.getRepository(WorkManagementNotificationEntity);
  }

  private taskRepository() {
    return this.dataSource.getRepository(FulcrumTaskEntity);
  }

  private projectRepository() {
    return this.dataSource.getRepository(FulcrumProjectEntity);
  }

  private async createMentionNotification(
    orgId: string,
    task: FulcrumTask,
    comment: WorkManagementTaskComment,
    actorId: string,
    recipientId: string,
  ): Promise<void> {
    if (recipientId === actorId) return;
    const notification = await this.notificationRepository().save({
      id: randomUUID(),
      workspaceId: orgId,
      projectId: task.projectId,
      taskId: task.id,
      type: "task.comment.mention",
      actorId,
      recipientId,
      readAt: null,
      payload: {
        commentId: comment.id,
        taskId: task.id,
        bodyPreview: commentPreview(comment.body),
      },
      traceId: task.traceId,
    });

    getEventBus().publish(`org.${orgId}.notifications`, {
      type: "notification.created",
      notificationId: notification.id,
      notificationType: notification.type,
      taskId: task.id,
      commentId: comment.id,
      actorId,
      recipientId,
      traceId: task.traceId,
    });
  }

  private async publishCommentEvent(
    type: string,
    orgId: string,
    task: FulcrumTask,
    comment: WorkManagementTaskComment,
    actorId: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    const payload = {
      type,
      orgId,
      projectId: task.projectId,
      taskId: task.id,
      commentId: comment.id,
      actorId,
      traceId: task.traceId,
      ...extra,
    };
    getEventBus().publish(`project.${task.projectId}.tasks`, payload);
    getEventBus().publish(`org.${orgId}.notifications`, payload);
  }
}

function serializeComment(
  comment: WorkManagementTaskComment,
  reactions: WorkManagementCommentReaction[],
  replies?: TaskCommentPublicRow[],
): TaskCommentPublicRow {
  return {
    id: comment.id,
    orgId: comment.orgId,
    taskId: comment.taskId,
    authorId: comment.authorId,
    body: comment.body,
    parentCommentId: comment.parentCommentId,
    resolved: comment.resolved,
    resolvedBy: comment.resolvedBy,
    resolvedAt: dateString(comment.resolvedAt),
    createdAt: dateString(comment.createdAt),
    updatedAt: dateString(comment.updatedAt),
    reactions: reactions
      .filter((reaction) => reaction.commentId === comment.id)
      .map(serializeReaction),
    replies,
  };
}

function serializeReaction(reaction: WorkManagementCommentReaction): TaskCommentReactionPublicRow {
  return {
    id: reaction.id,
    commentId: reaction.commentId,
    userId: reaction.userId,
    emoji: reaction.emoji,
    createdAt: dateString(reaction.createdAt),
  };
}

function serializeWatcher(watcher: WorkManagementTaskWatcher): TaskCommentWatcherPublicRow {
  return {
    id: watcher.id,
    taskId: watcher.taskId,
    userId: watcher.userId,
    source: watcher.source,
    createdAt: dateString(watcher.createdAt),
  };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function dateString(value: Date | string | undefined | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function extractMentionUserIds(value: unknown): string[] {
  const ids = new Set<string>();
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    const attrs = record["attrs"];
    if (record["type"] === "mention" && attrs && typeof attrs === "object") {
      const attrsRecord = attrs as Record<string, unknown>;
      const id = attrsRecord["id"];
      const kind = attrsRecord["type"] ?? attrsRecord["kind"];
      if (typeof id === "string" && id.trim() && (kind === undefined || kind === "user")) {
        ids.add(id);
      }
    }
    for (const child of Object.values(record)) {
      if (Array.isArray(child)) {
        for (const item of child) visit(item);
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return [...ids];
}

function commentPreview(value: unknown): string {
  const text: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record["text"] === "string") text.push(record["text"]);
    for (const child of Object.values(record)) {
      if (Array.isArray(child)) {
        for (const item of child) visit(item);
      } else if (child && typeof child === "object") {
        visit(child);
      }
    }
  };
  visit(value);
  return text.join(" ").replace(/\s+/g, " ").trim().slice(0, 160);
}
