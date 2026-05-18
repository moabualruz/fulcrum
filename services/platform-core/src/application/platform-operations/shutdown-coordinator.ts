export type ShutdownSignal = "SIGINT" | "SIGTERM" | string;

export type ShutdownHookName =
  | "stopWorkers"
  | "closeSubscriptions"
  | "closeHttpServer"
  | "closeDatabase"
  | "cleanupWorkspaces";

export interface GracefulShutdownHooks {
  stopWorkers?: () => Promise<void> | void;
  closeSubscriptions?: () => Promise<void> | void;
  closeHttpServer?: () => Promise<void> | void;
  closeDatabase?: () => Promise<void> | void;
  cleanupWorkspaces?: () => Promise<void> | void;
  log?: (message: string) => void;
}

export type GracefulShutdownResult = {
  ok: true;
  signal: ShutdownSignal;
  completed: ShutdownHookName[];
} | {
  ok: false;
  signal: ShutdownSignal;
  completed: ShutdownHookName[];
  failed: ShutdownHookName;
  error: string;
};

export interface GracefulShutdown {
  shutdown: (signal: ShutdownSignal) => Promise<GracefulShutdownResult>;
}

const ORDER: ShutdownHookName[] = [
  "stopWorkers",
  "closeSubscriptions",
  "closeHttpServer",
  "closeDatabase",
  "cleanupWorkspaces",
];

export function createGracefulShutdown(hooks: GracefulShutdownHooks): GracefulShutdown {
  let inFlight: Promise<GracefulShutdownResult> | null = null;
  let completedResult: GracefulShutdownResult | null = null;

  async function run(signal: ShutdownSignal): Promise<GracefulShutdownResult> {
    const completed: ShutdownHookName[] = [];

    for (const name of ORDER) {
      hooks.log?.(`shutdown:${name}`);
      try {
        await hooks[name]?.();
      } catch (error) {
        return {
          ok: false,
          signal,
          completed,
          failed: name,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      completed.push(name);
    }

    return {
      ok: true,
      signal,
      completed,
    };
  }

  return {
    async shutdown(signal: ShutdownSignal): Promise<GracefulShutdownResult> {
      if (completedResult) return completedResult;
      inFlight ??= run(signal).then((result) => {
        completedResult = result;
        return result;
      });
      return inFlight;
    },
  };
}
