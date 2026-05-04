export type WorkerPayloadAssertion<TPayload> = (payload: unknown) => asserts payload is TPayload;

export type WorkerTaskHandler<TPayload, THelpers = unknown> = (
  payload: TPayload,
  helpers: THelpers,
) => Promise<void> | void;

export interface WorkerTask<TPayload = unknown, THelpers = unknown> {
  name: string;
  assertPayload: WorkerPayloadAssertion<TPayload>;
  handler: WorkerTaskHandler<TPayload, THelpers>;
}

export interface WorkerRegistry {
  registerTask<TPayload, THelpers = unknown>(
    name: string,
    assertPayload: WorkerPayloadAssertion<TPayload>,
    handler: WorkerTaskHandler<TPayload, THelpers>,
  ): WorkerTask<TPayload, THelpers>;
  getTask(name: string): WorkerTask | undefined;
  listTasks(): WorkerTask[];
  runTask<THelpers = unknown>(name: string, payload: unknown, helpers: THelpers): Promise<void>;
}

export class WorkerTaskAlreadyRegisteredError extends Error {
  constructor(name: string) {
    super(`Worker task already registered: ${name}`);
    this.name = "WorkerTaskAlreadyRegisteredError";
  }
}

export class WorkerTaskNotRegisteredError extends Error {
  constructor(name: string) {
    super(`Worker task not registered: ${name}`);
    this.name = "WorkerTaskNotRegisteredError";
  }
}

export function createWorkerRegistry(): WorkerRegistry {
  const tasks = new Map<string, WorkerTask>();

  return {
    registerTask<TPayload, THelpers = unknown>(
      name: string,
      assertPayload: WorkerPayloadAssertion<TPayload>,
      handler: WorkerTaskHandler<TPayload, THelpers>,
    ): WorkerTask<TPayload, THelpers> {
      if (tasks.has(name)) throw new WorkerTaskAlreadyRegisteredError(name);
      const task: WorkerTask<TPayload, THelpers> = { name, assertPayload, handler };
      tasks.set(name, task as WorkerTask);
      return task;
    },

    getTask(name: string): WorkerTask | undefined {
      return tasks.get(name);
    },

    listTasks(): WorkerTask[] {
      return [...tasks.values()];
    },

    async runTask<THelpers = unknown>(name: string, payload: unknown, helpers: THelpers): Promise<void> {
      const task = tasks.get(name);
      if (!task) throw new WorkerTaskNotRegisteredError(name);
      const assertPayload: WorkerPayloadAssertion<unknown> = task.assertPayload;
      assertPayload(payload);
      await task.handler(payload, helpers);
    },
  };
}

export function assertStringField(
  payload: Record<string, unknown>,
  field: string,
  taskName: string,
): asserts payload is Record<string, unknown> {
  if (typeof payload[field] !== "string" || payload[field] === "") {
    throw new Error(`${taskName} payload requires string ${field}`);
  }
}

export function assertRecordPayload(payload: unknown, taskName: string): asserts payload is Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`${taskName} payload must be an object`);
  }
}
