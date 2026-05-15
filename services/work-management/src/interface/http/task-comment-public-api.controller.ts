import "reflect-metadata";

import { Body, Controller, Inject, InternalServerErrorException, Module, NotFoundException, Post } from "@nestjs/common";
import type { DynamicModule as NestDynamicModule } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TypeOrmModule } from "@nestjs/typeorm";
import { IsObject, IsOptional, IsString, MinLength } from "class-validator";
import { DataSource } from "typeorm";

import { isFeatureEnabled } from "@platform-core/infrastructure/product-store/features.ts";
import { TaskCommentStore } from "@work-management/infrastructure/database/task-comment-store.ts";
import { WORK_MANAGEMENT_ENTITIES } from "@work-management/infrastructure/database/work-structure.entities.ts";
import { FULCRUM_WORKFLOW_SPINE_ENTITIES } from "@workflow-coordination/infrastructure/database/workflow-spine.entities.ts";

import { TaskCommentTaskScopeDto, TaskCommentIdScopeDto, TaskCommentCreateDto, TaskCommentReactionDto } from "./dto/task-comment.dto.ts";
export { TaskCommentTaskScopeDto, TaskCommentIdScopeDto, TaskCommentCreateDto, TaskCommentReactionDto };

export const TASK_COMMENT_PUBLIC_API_OPTIONS = Symbol.for("fulcrum.taskCommentPublicApi.options");

export interface TaskCommentPublicApiOptions {
  featuresEnv?: string;
}

export class TaskCommentPublicApiService {
  constructor(
    private readonly options: TaskCommentPublicApiOptions | null = null,
    private readonly store: TaskCommentStore | null = null,
  ) {}

  async createComment(input: TaskCommentCreateDto): Promise<unknown> {
    return await this.requireResult(this.requireStore().createComment(input));
  }

  async deleteComment(input: TaskCommentIdScopeDto): Promise<{ ok: true; commentId: string }> {
    await this.requireBoolean(this.requireStore().deleteComment(input));
    return { ok: true, commentId: input.commentId };
  }

  async listComments(input: TaskCommentTaskScopeDto): Promise<unknown[]> {
    return await this.requireStore().listComments(input);
  }

  async threadedComments(input: TaskCommentTaskScopeDto): Promise<unknown[]> {
    return await this.requireStore().threadedComments(input);
  }

  async resolveComment(input: TaskCommentIdScopeDto): Promise<unknown> {
    return await this.requireResult(this.requireStore().resolveComment(input));
  }

  async unresolveComment(input: TaskCommentIdScopeDto): Promise<unknown> {
    return await this.requireResult(this.requireStore().unresolveComment(input));
  }

  async addReaction(input: TaskCommentReactionDto): Promise<unknown> {
    return await this.requireResult(this.requireStore().addReaction(input));
  }

  async removeReaction(input: TaskCommentReactionDto): Promise<{ ok: true }> {
    await this.requireBoolean(this.requireStore().removeReaction(input));
    return { ok: true };
  }

  async listWatchers(input: TaskCommentTaskScopeDto): Promise<unknown[]> {
    return await this.requireStore().listWatchers(input);
  }

  async subscribe(input: TaskCommentTaskScopeDto): Promise<{ ok: true }> {
    await this.requireBoolean(this.requireStore().subscribe({ ...input, source: "manual" }));
    return { ok: true };
  }

  async unsubscribe(input: TaskCommentTaskScopeDto): Promise<{ ok: true }> {
    await this.requireBoolean(this.requireStore().unsubscribe(input));
    return { ok: true };
  }

  private async requireResult<T>(promise: Promise<T | null>): Promise<T> {
    const result = await promise;
    if (!result) throw new NotFoundException({ error: "Comment target not found." });
    return result;
  }

  private async requireBoolean(promise: Promise<boolean>): Promise<void> {
    if (!(await promise)) throw new NotFoundException({ error: "Comment target not found." });
  }

  private requireStore(): TaskCommentStore {
    const env = this.options?.featuresEnv ?? process.env.FULCRUM_FEATURES;
    if (!isFeatureEnabled("public-api", env)) {
      throw new NotFoundException({ error: "not found" });
    }
    if (!this.store) {
      throw new InternalServerErrorException("Task comment public API TypeORM store is not configured.");
    }
    return this.store;
  }
}

export class TaskCommentPublicApiController {
  constructor(private readonly comments: TaskCommentPublicApiService) {}

  async createComment(body: TaskCommentCreateDto): Promise<unknown> {
    return await this.comments.createComment(body);
  }

  async deleteComment(body: TaskCommentIdScopeDto): Promise<{ ok: true; commentId: string }> {
    return await this.comments.deleteComment(body);
  }

  async listComments(body: TaskCommentTaskScopeDto): Promise<unknown[]> {
    return await this.comments.listComments(body);
  }

  async threadedComments(body: TaskCommentTaskScopeDto): Promise<unknown[]> {
    return await this.comments.threadedComments(body);
  }

  async resolveComment(body: TaskCommentIdScopeDto): Promise<unknown> {
    return await this.comments.resolveComment(body);
  }

  async unresolveComment(body: TaskCommentIdScopeDto): Promise<unknown> {
    return await this.comments.unresolveComment(body);
  }

  async addReaction(body: TaskCommentReactionDto): Promise<unknown> {
    return await this.comments.addReaction(body);
  }

  async removeReaction(body: TaskCommentReactionDto): Promise<{ ok: true }> {
    return await this.comments.removeReaction(body);
  }

  async listWatchers(body: TaskCommentTaskScopeDto): Promise<unknown[]> {
    return await this.comments.listWatchers(body);
  }

  async subscribe(body: TaskCommentTaskScopeDto): Promise<{ ok: true }> {
    return await this.comments.subscribe(body);
  }

  async unsubscribe(body: TaskCommentTaskScopeDto): Promise<{ ok: true }> {
    return await this.comments.unsubscribe(body);
  }
}

export class TaskCommentPublicApiModule {
  static register(options: TaskCommentPublicApiOptions): NestDynamicModule {
    return {
      module: TaskCommentPublicApiModule,
      imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
      controllers: [TaskCommentPublicApiController],
      providers: [
        { provide: TASK_COMMENT_PUBLIC_API_OPTIONS, useValue: options },
        TaskCommentStore,
        TaskCommentPublicApiService,
      ],
      exports: [TaskCommentPublicApiService],
    };
  }
}

Inject(TASK_COMMENT_PUBLIC_API_OPTIONS)(TaskCommentPublicApiService, undefined, 0);
Inject(TaskCommentStore)(TaskCommentPublicApiService, undefined, 1);
Inject(DataSource)(TaskCommentStore, undefined, 0);
Inject(TaskCommentPublicApiService)(TaskCommentPublicApiController, undefined, 0);

for (const target of [TaskCommentTaskScopeDto, TaskCommentIdScopeDto, TaskCommentCreateDto, TaskCommentReactionDto] as const) {
  for (const property of ["orgId", "userId"] as const) {
    IsString()(target.prototype, property);
    MinLength(1)(target.prototype, property);
  }
}

for (const target of [TaskCommentTaskScopeDto, TaskCommentCreateDto] as const) {
  IsString()(target.prototype, "taskId");
  MinLength(1)(target.prototype, "taskId");
}

for (const target of [TaskCommentIdScopeDto, TaskCommentReactionDto] as const) {
  IsString()(target.prototype, "commentId");
  MinLength(1)(target.prototype, "commentId");
}

IsObject()(TaskCommentCreateDto.prototype, "body");
IsOptional()(TaskCommentCreateDto.prototype, "parentCommentId");
IsString()(TaskCommentCreateDto.prototype, "parentCommentId");
MinLength(1)(TaskCommentCreateDto.prototype, "parentCommentId");
IsString()(TaskCommentReactionDto.prototype, "emoji");
MinLength(1)(TaskCommentReactionDto.prototype, "emoji");

const routeDescriptors = {
  createComment: Object.getOwnPropertyDescriptor(TaskCommentPublicApiController.prototype, "createComment"),
  deleteComment: Object.getOwnPropertyDescriptor(TaskCommentPublicApiController.prototype, "deleteComment"),
  listComments: Object.getOwnPropertyDescriptor(TaskCommentPublicApiController.prototype, "listComments"),
  threadedComments: Object.getOwnPropertyDescriptor(TaskCommentPublicApiController.prototype, "threadedComments"),
  resolveComment: Object.getOwnPropertyDescriptor(TaskCommentPublicApiController.prototype, "resolveComment"),
  unresolveComment: Object.getOwnPropertyDescriptor(TaskCommentPublicApiController.prototype, "unresolveComment"),
  addReaction: Object.getOwnPropertyDescriptor(TaskCommentPublicApiController.prototype, "addReaction"),
  removeReaction: Object.getOwnPropertyDescriptor(TaskCommentPublicApiController.prototype, "removeReaction"),
  listWatchers: Object.getOwnPropertyDescriptor(TaskCommentPublicApiController.prototype, "listWatchers"),
  subscribe: Object.getOwnPropertyDescriptor(TaskCommentPublicApiController.prototype, "subscribe"),
  unsubscribe: Object.getOwnPropertyDescriptor(TaskCommentPublicApiController.prototype, "unsubscribe"),
} as const;

if (Object.values(routeDescriptors).some((descriptor) => !descriptor)) {
  throw new Error("TaskCommentPublicApiController route descriptors are missing");
}

Controller("api/v1/comments")(TaskCommentPublicApiController);
ApiTags("comments")(TaskCommentPublicApiController);

applyPostRoute("createComment", "create", TaskCommentCreateDto, "Create task comment");
applyPostRoute("deleteComment", "delete", TaskCommentIdScopeDto, "Delete task comment");
applyPostRoute("listComments", "list", TaskCommentTaskScopeDto, "List task comments");
applyPostRoute("threadedComments", "threaded", TaskCommentTaskScopeDto, "List threaded task comments");
applyPostRoute("resolveComment", "resolve", TaskCommentIdScopeDto, "Resolve task comment");
applyPostRoute("unresolveComment", "unresolve", TaskCommentIdScopeDto, "Unresolve task comment");
applyPostRoute("addReaction", "add-reaction", TaskCommentReactionDto, "Add task comment reaction");
applyPostRoute("removeReaction", "remove-reaction", TaskCommentReactionDto, "Remove task comment reaction");
applyPostRoute("listWatchers", "watchers", TaskCommentTaskScopeDto, "List task comment watchers");
applyPostRoute("subscribe", "subscribe", TaskCommentTaskScopeDto, "Subscribe to task comments");
applyPostRoute("unsubscribe", "unsubscribe", TaskCommentTaskScopeDto, "Unsubscribe from task comments");

Module({
  imports: [TypeOrmModule.forFeature([...FULCRUM_WORKFLOW_SPINE_ENTITIES, ...WORK_MANAGEMENT_ENTITIES])],
  controllers: [TaskCommentPublicApiController],
  providers: [
    { provide: TASK_COMMENT_PUBLIC_API_OPTIONS, useValue: null },
    TaskCommentStore,
    TaskCommentPublicApiService,
  ],
  exports: [TaskCommentPublicApiService],
})(TaskCommentPublicApiModule);

function applyPostRoute(
  method: keyof typeof routeDescriptors,
  path: string,
  bodyType: new () => unknown,
  summary: string,
): void {
  const descriptor = routeDescriptors[method]!;
  Post(path)(TaskCommentPublicApiController.prototype, method, descriptor);
  Body()(TaskCommentPublicApiController.prototype, method, 0);
  ApiOperation({ summary })(TaskCommentPublicApiController.prototype, method, descriptor);
  ApiBody({ type: bodyType })(TaskCommentPublicApiController.prototype, method, descriptor);
  ApiOkResponse({ description: summary })(TaskCommentPublicApiController.prototype, method, descriptor);
}
