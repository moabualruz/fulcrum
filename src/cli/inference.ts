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
  fulcrum inference embed <text> [--json]
  fulcrum inference generate <prompt> [--json]
  fulcrum inference stop [--json]
`;

interface InferenceCliLifecycle extends Partial<InferenceLifecycleLike> {
  status?: () => Promise<InferenceStatus>;
  stop?: () => Promise<InferenceStopResult>;
}

interface InferenceCliClient {
  call(method: "health", params: Record<string, never>): Promise<HealthResult>;
}

interface InferenceCliCaller {
  inference: {
    health(): Promise<HealthResult>;
    embed(input: { texts: string[]; model?: string }): Promise<unknown>;
    generate(input: { prompt: string; options?: unknown }): Promise<unknown>;
  };
}

export interface InferenceRunOptions {
  lifecycle?: InferenceCliLifecycle;
  client?: InferenceCliClient;
  caller?: InferenceCliCaller;
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

async function resolveCaller(opts: InferenceRunOptions): Promise<InferenceCliCaller> {
  if (opts.caller) return opts.caller;

  if (opts.client) {
    return {
      inference: {
        health: () => opts.client!.call("health", {}),
        embed: async ({ texts }) => ({ vectors: texts.map(() => []), model: "embedded", cached: false }),
        generate: async () => ({ text: "", model: "embedded", tokens: 0 }),
      },
    };
  }

  const container = opts.container ?? new Container();
  const [{ appRouter }, { createContext }, { t }] = await Promise.all([
    import("../trpc/router.ts"),
    import("../trpc/context.ts"),
    import("../trpc/trpc.ts"),
  ]);
  const factory = t.createCallerFactory(appRouter);
  return factory(createContext({
    session: null,
    orgId: null,
    userId: null,
    em: null,
    container,
  })) as unknown as InferenceCliCaller;
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
      case "embed":
        return runEmbed(rest, { ...opts, print });
      case "generate":
        return runGenerate(rest, { ...opts, print });
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
  const caller = await resolveCaller(opts);
  const health = opts.client ? await client.call("health", {}) : await caller.inference.health();
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
  const caller = await resolveCaller(opts);
  const health = await caller.inference.health();

  if (json) {
    opts.print(JSON.stringify(health));
  } else {
    opts.print(`inference ${health.status} backends=${health.backends.join(",")}`);
  }
}

async function runEmbed(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const json = hasFlag(argv, "json");
  const text = argv.filter((arg) => arg !== "--json").join(" ").trim();
  if (!text) throw new Error("embed requires text");
  const caller = await resolveCaller(opts);
  const payload = await caller.inference.embed({ texts: [text] });
  opts.print(json ? JSON.stringify(payload) : JSON.stringify(payload));
}

async function runGenerate(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const json = hasFlag(argv, "json");
  const prompt = argv.filter((arg) => arg !== "--json").join(" ").trim();
  if (!prompt) throw new Error("generate requires prompt");
  const caller = await resolveCaller(opts);
  const payload = await caller.inference.generate({ prompt });
  if (json) {
    opts.print(JSON.stringify(payload));
  } else {
    const text = typeof payload === "object" && payload && "text" in payload
      ? String((payload as { text: unknown }).text)
      : JSON.stringify(payload);
    opts.print(text);
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
