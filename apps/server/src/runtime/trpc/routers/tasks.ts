import { z } from "zod";
import { observable } from "@trpc/server/observable";

import {
  bulkDelete,
  bulkUpdate,
  createTask,
  deleteTask,
  setDependencies,
  setParent,
  updateTask,
} from "@work-management/application/tasks/commands.ts";
import {
  dispatchDependencyRunForTasks,
  previewDependencyRunForTasks,
} from "@execution-orchestration/application/dependency-run-actions.ts";
import {
  dependencyRunLiveFeedbackTopic,
  loadDependencyRunLiveFeedbackForTasks,
  runNextDependencyRunWorkerTickForTasks,
} from "@execution-orchestration/application/dependency-run-live-feedback.ts";
import type { DependencyRunLiveFeedbackOutput } from "@execution-orchestration/application/dependency-run-live-feedback.ts";
import { runAutomatedFeedbackLoopForTasks } from "@execution-orchestration/application/automated-feedback-loop.ts";
import { getEventBus } from "@platform-core/application/subscriptions/event-bus.ts";
import { recordTaskQaReview } from "@execution-orchestration/application/qa-review-actions.ts";
import { buildManualTaskWorkbench } from "@work-management/application/manual-task-workbench.ts";
import { getTask, listChildren, listTasks } from "@work-management/application/tasks/queries.ts";
import {
  BulkDeleteOutputSchema,
  BulkUpdateOutputSchema,
  BulkUpdateTasksInputSchema,
  CreateTaskInputSchema,
  DispatchDependencyRunInputSchema,
  DispatchDependencyRunOutputSchema,
  DependencyRunPreviewOutputSchema,
  DependencyRunLiveFeedbackInputSchema,
  DependencyRunLiveFeedbackOutputSchema,
  DependencyRunWorkerTickInputSchema,
  DependencyRunWorkerTickOutputSchema,
  ListTasksInputSchema,
  ManualTaskWorkbenchInputSchema,
  ManualTaskWorkbenchOutputSchema,
  AutomatedFeedbackLoopInputSchema,
  AutomatedFeedbackLoopOutputSchema,
  PreviewDependencyRunInputSchema,
  RecordTaskQaReviewInputSchema,
  SetDependenciesInputSchema,
  SetParentInputSchema,
  TaskDtoSchema,
  TaskIdInputSchema,
  TaskIdsInputSchema,
  TaskQaReviewOutputSchema,
  TaskRelationIdInputSchema,
  UpdateTaskInputSchema,
} from "@work-management/application/tasks/schema.ts";
import type { AppContext } from "@work-management/application/tasks/types.ts";
import { appErrorToTrpcError } from "@fulcrum/server/trpc/error-mapping.ts";
import { AppError } from "@platform-core/domain/errors.ts";
import { requireTrpcEntityManager } from "@fulcrum/server/trpc/context.ts";
import { permissionedProcedure } from "@fulcrum/server/trpc/middleware.ts";
import { t } from "@fulcrum/server/trpc/trpc.ts";

const taskApplication = {
  createTask,
  updateTask,
  deleteTask,
  bulkUpdate,
  bulkDelete,
  setParent,
  setDependencies,
  listTasks,
  getTask,
  listChildren,
  previewDependencyRunForTasks,
  dispatchDependencyRunForTasks,
  loadDependencyRunLiveFeedbackForTasks,
  runNextDependencyRunWorkerTickForTasks,
  runAutomatedFeedbackLoopForTasks,
  recordTaskQaReview,
  buildManualTaskWorkbench,
};

export function __setTaskApplicationForTest(overrides: Partial<typeof taskApplication>): () => void {
  const previous = { ...taskApplication };
  Object.assign(taskApplication, overrides);
  return () => Object.assign(taskApplication, previous);
}

function appContext(ctx: { orgId: string; userId: string }, projectId: string | null = null): AppContext {
  return { orgId: ctx.orgId, userId: ctx.userId, projectId };
}

async function mapAppError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AppError) throw appErrorToTrpcError(error);
    throw error;
  }
}

// ── Router (thin delegation layer) ─────────────────────────────────

export const tasksRouter = t.router({
  list: permissionedProcedure({ resource: "tasks", action: "list" })
    .input(ListTasksInputSchema)
    .output(z.array(TaskDtoSchema))
    .query(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.listTasks(requireTrpcEntityManager(ctx), appContext(ctx), input ?? {}));
    }),

  get: permissionedProcedure({ resource: "tasks", action: "get" })
    .input(TaskIdInputSchema)
    .output(TaskDtoSchema)
    .query(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.getTask(requireTrpcEntityManager(ctx), appContext(ctx), input.id));
    }),

  create: permissionedProcedure({ resource: "tasks", action: "create" })
    .input(CreateTaskInputSchema)
    .output(TaskDtoSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.createTask(requireTrpcEntityManager(ctx), appContext(ctx), input));
    }),

  update: permissionedProcedure({ resource: "tasks", action: "update" })
    .input(UpdateTaskInputSchema)
    .output(TaskDtoSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...patch } = input;
      return mapAppError(() => taskApplication.updateTask(requireTrpcEntityManager(ctx), appContext(ctx), id, patch));
    }),

  delete: permissionedProcedure({ resource: "tasks", action: "delete" })
    .input(TaskIdInputSchema)
    .output(TaskDtoSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.deleteTask(requireTrpcEntityManager(ctx), appContext(ctx), input.id));
    }),

  bulkUpdate: permissionedProcedure({ resource: "tasks", action: "bulkUpdate" })
    .input(BulkUpdateTasksInputSchema)
    .output(BulkUpdateOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.bulkUpdate(requireTrpcEntityManager(ctx), appContext(ctx), input.ids, input.patch));
    }),

  bulkDelete: permissionedProcedure({ resource: "tasks", action: "bulkDelete" })
    .input(TaskIdsInputSchema)
    .output(BulkDeleteOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.bulkDelete(requireTrpcEntityManager(ctx), appContext(ctx), input.ids));
    }),

  setParent: permissionedProcedure({ resource: "tasks", action: "setParent" })
    .input(SetParentInputSchema)
    .output(TaskDtoSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.setParent(requireTrpcEntityManager(ctx), appContext(ctx), input.taskId, input.parentId));
    }),

  listChildren: permissionedProcedure({ resource: "tasks", action: "listChildren" })
    .input(TaskRelationIdInputSchema)
    .output(z.array(TaskDtoSchema))
    .query(async ({ ctx, input }) => {
      return mapAppError(() => taskApplication.listChildren(requireTrpcEntityManager(ctx), appContext(ctx), input.taskId));
    }),

  setDependencies: permissionedProcedure({ resource: "tasks", action: "setDependencies" })
    .input(SetDependenciesInputSchema)
    .output(TaskDtoSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() =>
        taskApplication.setDependencies(requireTrpcEntityManager(ctx), appContext(ctx), input.taskId, input.dependencies)
      );
    }),

  previewDependencyRun: permissionedProcedure({ resource: "tasks", action: "previewDependencyRun" })
    .input(PreviewDependencyRunInputSchema)
    .output(DependencyRunPreviewOutputSchema)
    .query(async ({ ctx, input }) => {
      return mapAppError(() =>
        taskApplication.previewDependencyRunForTasks(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId ?? null),
          input,
        )
      );
    }),

  dispatchDependencyRun: permissionedProcedure({ resource: "tasks", action: "dispatchDependencyRun" })
    .input(DispatchDependencyRunInputSchema)
    .output(DispatchDependencyRunOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() =>
        taskApplication.dispatchDependencyRunForTasks(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId ?? null),
          input,
        )
      );
    }),

  dependencyRunLiveFeedback: permissionedProcedure({ resource: "tasks", action: "dependencyRunLiveFeedback" })
    .input(DependencyRunLiveFeedbackInputSchema)
    .output(DependencyRunLiveFeedbackOutputSchema)
    .query(async ({ ctx, input }) => {
      return mapAppError(() =>
        taskApplication.loadDependencyRunLiveFeedbackForTasks(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId ?? null),
          input,
        )
      );
    }),

  dependencyRunLiveFeedbackStream: permissionedProcedure({ resource: "tasks", action: "dependencyRunLiveFeedbackStream" })
    .input(DependencyRunLiveFeedbackInputSchema)
    .subscription(({ ctx, input }) => {
      return observable<DependencyRunLiveFeedbackOutput>((emit) => {
        let closed = false;
        let unsubscribe: (() => void) | null = null;

        const close = () => {
          unsubscribe?.();
          unsubscribe = null;
        };

        void (async () => {
          try {
            const initial = await mapAppError(() =>
              taskApplication.loadDependencyRunLiveFeedbackForTasks(
                requireTrpcEntityManager(ctx),
                appContext(ctx, input.projectId ?? null),
                input,
              )
            );
            if (closed) return;
            const parsedInitial = DependencyRunLiveFeedbackOutputSchema.parse(initial);
            emit.next(parsedInitial);

            const topic = dependencyRunLiveFeedbackTopic({
              orgId: ctx.orgId,
              projectId: parsedInitial.projectId,
              traceId: parsedInitial.traceId,
            });
            unsubscribe = getEventBus().subscribe<DependencyRunLiveFeedbackOutput>(topic, (event) => {
              if (closed) return;
              const feedback = DependencyRunLiveFeedbackOutputSchema.parse(event.payload);
              emit.next(feedback);
              if (!feedback.executorStatus.active) {
                close();
                emit.complete();
              }
            });

            if (!parsedInitial.executorStatus.active) {
              close();
              emit.complete();
            }
          } catch (error) {
            if (!closed) emit.error(error);
          }
        })();

        return () => {
          closed = true;
          close();
        };
      });
    }),

  runDependencyRunWorkerTick: permissionedProcedure({ resource: "tasks", action: "runDependencyRunWorkerTick" })
    .input(DependencyRunWorkerTickInputSchema)
    .output(DependencyRunWorkerTickOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() =>
        taskApplication.runNextDependencyRunWorkerTickForTasks(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId ?? null),
          input,
        )
      );
    }),

  recordQaReview: permissionedProcedure({ resource: "tasks", action: "recordQaReview" })
    .input(RecordTaskQaReviewInputSchema)
    .output(TaskQaReviewOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() =>
        taskApplication.recordTaskQaReview(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId ?? null),
          input,
        )
      );
    }),

  runAutomatedFeedbackLoop: permissionedProcedure({ resource: "tasks", action: "runAutomatedFeedbackLoop" })
    .input(AutomatedFeedbackLoopInputSchema)
    .output(AutomatedFeedbackLoopOutputSchema)
    .mutation(async ({ ctx, input }) => {
      return mapAppError(() =>
        taskApplication.runAutomatedFeedbackLoopForTasks(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input.projectId ?? null),
          input,
        )
      );
    }),

  manualWorkbench: permissionedProcedure({ resource: "tasks", action: "manualWorkbench" })
    .input(ManualTaskWorkbenchInputSchema)
    .output(ManualTaskWorkbenchOutputSchema)
    .query(async ({ ctx, input }) => {
      return mapAppError(() =>
        taskApplication.buildManualTaskWorkbench(
          requireTrpcEntityManager(ctx),
          appContext(ctx, input?.projectId ?? null),
          input ?? {},
        )
      );
    }),
});

export type TasksRouter = typeof tasksRouter;
