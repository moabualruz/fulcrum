export class TaskCommentTaskScopeDto {
  orgId!: string;
  userId!: string;
  taskId!: string;
}

export class TaskCommentIdScopeDto {
  orgId!: string;
  userId!: string;
  commentId!: string;
}

export class TaskCommentCreateDto extends TaskCommentTaskScopeDto {
  body!: Record<string, unknown>;
  parentCommentId?: string | null;
}

export class TaskCommentUpdateDto extends TaskCommentIdScopeDto {
  body!: Record<string, unknown>;
}

export class TaskCommentReactionDto extends TaskCommentIdScopeDto {
  emoji!: string;
}
