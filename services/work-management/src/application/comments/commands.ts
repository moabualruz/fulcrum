import type { EntityManager } from "typeorm";

import { WorkItemCommentService } from "@work-management/application/work-item-comments.ts";
import type {
  AppContext,
  CommentReactionDto,
  CreateTaskCommentInput,
  TaskCommentDto,
} from "@work-management/application/comments/types.ts";

export async function createTaskComment(
  em: EntityManager,
  ctx: AppContext,
  input: CreateTaskCommentInput,
): Promise<TaskCommentDto> {
  return new WorkItemCommentService(em).createComment(
    ctx.orgId,
    input.taskId,
    ctx.userId,
    input.body,
    input.parentCommentId,
  );
}

export async function deleteTaskComment(em: EntityManager, ctx: AppContext, commentId: string): Promise<void> {
  await new WorkItemCommentService(em).deleteComment(ctx.orgId, commentId);
}

export async function resolveTaskComment(
  em: EntityManager,
  ctx: AppContext,
  commentId: string,
): Promise<TaskCommentDto> {
  return new WorkItemCommentService(em).resolveComment(ctx.orgId, commentId, ctx.userId);
}

export async function unresolveTaskComment(
  em: EntityManager,
  ctx: AppContext,
  commentId: string,
): Promise<TaskCommentDto> {
  return new WorkItemCommentService(em).unresolveComment(ctx.orgId, commentId);
}

export async function addTaskCommentReaction(
  em: EntityManager,
  ctx: AppContext,
  commentId: string,
  emoji: string,
): Promise<CommentReactionDto> {
  return new WorkItemCommentService(em).addReaction(commentId, ctx.userId, emoji);
}

export async function removeTaskCommentReaction(
  em: EntityManager,
  ctx: AppContext,
  commentId: string,
  emoji: string,
): Promise<void> {
  await new WorkItemCommentService(em).removeReaction(commentId, ctx.userId, emoji);
}

export async function subscribeTaskComment(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
): Promise<void> {
  await new WorkItemCommentService(em).subscribe(ctx.orgId, taskId, ctx.userId, "manual");
}

export async function unsubscribeTaskComment(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
): Promise<void> {
  await new WorkItemCommentService(em).unsubscribe(ctx.orgId, taskId, ctx.userId);
}
