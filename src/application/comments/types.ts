import type {
  CommentOutput,
  ReactionOutput,
  WatcherOutput,
} from "../../services/CommentService.ts";

export interface AppContext {
  orgId: string;
  userId: string;
}

export type TaskCommentDto = CommentOutput;
export type CommentReactionDto = ReactionOutput;
export type CommentWatcherDto = WatcherOutput;

export interface CreateTaskCommentInput {
  taskId: string;
  body: Record<string, unknown>;
  parentCommentId?: string;
}
