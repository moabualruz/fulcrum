import { Container } from "@needle-di/core";
import { InferenceClient, type InferenceLifecycleLike } from "../inference/client.ts";
import {
  InferenceLifecycle,
  type InferenceStatus,
  type InferenceStopResult,
} from "../inference/lifecycle.ts";
import type { HealthResult } from "../inference/protocol.ts";

const HELP = `fulcrum inference

Usage:
  fulcrum inference start [--json]
  fulcrum inference status [--json]
  fulcrum inference stop [--json]
`;

interface InferenceCliLifecycle extends Partial<InferenceLifecycleLike> {
  status?: () => Promise<InferenceStatus>;
  stop?: () => Promise<InferenceStopResult>;
}

interface InferenceCliClient {
  call(method: "health", params: Record<string, never>): Promise<HealthResult>;
}

export interface InferenceRunOptions {
  lifecycle?: InferenceCliLifecycle;
  client?: InferenceCliClient;
  container?: Container;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(`--${flag}`);
}

function resolveServices(opts: InferenceRunOptions): {
  lifecycle: Required<InferenceCliLifecycle>;
  client: InferenceCliClient;
} {
  const container = opts.container ?? new Container();
  const lifecycle = opts.lifecycle ?? container.get(InferenceLifecycle);
  const fullLifecycle = lifecycle as Required<InferenceCliLifecycle>;
  const client = opts.client ?? (opts.lifecycle ? new InferenceClient({ lifecycle: fullLifecycle }) : container.get(InferenceClient));
  return { lifecycle: fullLifecycle, client };
}

export async function run(argv: readonly string[], opts: InferenceRunOptions = {}): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [verb = "help", ...rest] = argv;

  try {
    switch (verb) {
      case "start":
        return runStart(rest, { ...opts, print });
      case "status":
        return runStatus(rest, { ...opts, print });
      case "stop":
        return runStop(rest, { ...opts, print });
      case "help":
      case "--help":
      case "-h":
        print(HELP);
        return;
      default:
        printErr(`fulcrum inference: unknown verb '${verb}'`);
        printErr(HELP);
        exit(2);
    }
  } catch (error) {
    printErr(`fulcrum inference ${verb}: ${(error as Error).message}`);
    exit(1);
  }
}

async function runStart(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const json = hasFlag(argv, "json");
  const { lifecycle, client } = resolveServices(opts);
  const running = await lifecycle.ensureRunning();
  const health = await client.call("health", {});
  const payload = { status: health.status, pid: running.pid, socketPath: running.socketPath, health };

  if (json) {
    opts.print(JSON.stringify(payload));
  } else {
    opts.print(`inference ${health.status} pid=${running.pid} socket=${running.socketPath}`);
  }
}

async function runStatus(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const json = hasFlag(argv, "json");
  const { lifecycle, client } = resolveServices(opts);
  const state = await lifecycle.status();
  const health = state.status === "ok" ? await client.call("health", {}) : undefined;
  const payload = {
    status: health?.status ?? state.status,
    pid: state.pid,
    socketPath: state.socketPath,
    health,
  };

  if (json) {
    opts.print(JSON.stringify(payload));
  } else if (health) {
    opts.print(`inference ${health.status} pid=${state.pid ?? "unknown"} socket=${state.socketPath}`);
  } else {
    opts.print(`inference down socket=${state.socketPath}`);
  }
}

async function runStop(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const json = hasFlag(argv, "json");
  const { lifecycle } = resolveServices(opts);
  const stopped = await lifecycle.stop();

  if (json) {
    opts.print(JSON.stringify(stopped));
  } else {
    const pid = stopped.pid ? `pid=${stopped.pid} ` : "";
    const socket = stopped.socketRemoved ? "socket removed" : "socket still present";
    opts.print(`inference ${stopped.status} ${pid}${socket}`);
  }
}
