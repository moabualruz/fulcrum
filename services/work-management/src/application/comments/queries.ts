import type { EntityManager } from "typeorm";

import { WorkItemCommentService } from "@work-management/application/work-item-comments.ts";
import type { AppContext, CommentWatcherDto, TaskCommentDto } from "@work-management/application/comments/types.ts";

export async function listTaskComments(em: EntityManager, ctx: AppContext, taskId: string): Promise<TaskCommentDto[]> {
  return new WorkItemCommentService(em).listComments(ctx.orgId, taskId);
}

export async function getThreadedTaskComments(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
): Promise<TaskCommentDto[]> {
  return new WorkItemCommentService(em).getThreaded(ctx.orgId, taskId);
}

export async function listTaskCommentWatchers(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
): Promise<CommentWatcherDto[]> {
  return new WorkItemCommentService(em).listWatchers(ctx.orgId, taskId);
}
