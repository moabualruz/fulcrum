import type { EntityManager } from "@mikro-orm/postgresql";

import { CommentService } from "../../services/CommentService.ts";
import type { AppContext, CommentWatcherDto, TaskCommentDto } from "./types.ts";

export async function listTaskComments(em: EntityManager, ctx: AppContext, taskId: string): Promise<TaskCommentDto[]> {
  return new CommentService(em).listComments(ctx.orgId, taskId);
}

export async function getThreadedTaskComments(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
): Promise<TaskCommentDto[]> {
  return new CommentService(em).getThreaded(ctx.orgId, taskId);
}

export async function listTaskCommentWatchers(
  em: EntityManager,
  ctx: AppContext,
  taskId: string,
): Promise<CommentWatcherDto[]> {
  return new CommentService(em).listWatchers(ctx.orgId, taskId);
}
