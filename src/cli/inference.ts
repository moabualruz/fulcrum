import { Container } from "@needle-di/core";
import { InferenceClient, type InferenceLifecycleLike } from "../inference/client.ts";
import {
  InferenceLifecycle,
  type InferenceStatus,
  type InferenceStopResult,
} from "../inference/lifecycle.ts";
import {
  EmbedResultSchema,
  GenerateResultSchema,
  type EmbedResult,
  type GenerateOptions,
  type GenerateResult,
  type HealthResult,
} from "../inference/protocol.ts";
import { INFERENCE_CLIENT_TOKEN } from "../inference/tokens.ts";

const HELP = `fulcrum inference

Usage:
  fulcrum inference start [--json]
  fulcrum inference status [--json]
  fulcrum inference embed <text> [--model <id>] [--json]
  fulcrum inference generate <prompt> [--json]
  fulcrum inference stop [--json]
`;

interface InferenceCliLifecycle extends Partial<InferenceLifecycleLike> {
  status?: () => Promise<InferenceStatus>;
  stop?: () => Promise<InferenceStopResult>;
}

interface InferenceCliClient {
  call(method: "health", params: Record<string, never>): Promise<HealthResult>;
  embed?: (texts: string[], options?: { model?: string }) => Promise<EmbedResult>;
  generate?: (prompt: string, options?: GenerateOptions) => Promise<GenerateResult>;
}

interface InferenceCliCaller {
  inference: {
    health(): Promise<HealthResult>;
    embed(input: { texts: string[]; model?: string }): Promise<unknown>;
    generate(input: { prompt: string; options?: GenerateOptions }): Promise<unknown>;
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

function resolveContainerClient(container: Container): InferenceCliClient {
  if (container.has(INFERENCE_CLIENT_TOKEN)) {
    return container.get(INFERENCE_CLIENT_TOKEN);
  }
  if (container.has(InferenceClient)) {
    return container.get(InferenceClient);
  }
  return container.get(InferenceClient);
}

function resolveServices(opts: InferenceRunOptions): {
  lifecycle: Required<InferenceCliLifecycle>;
  client: InferenceCliClient;
} {
  const container = opts.container ?? new Container();
  const lifecycle = opts.lifecycle ?? container.get(InferenceLifecycle);
  const fullLifecycle = lifecycle as Required<InferenceCliLifecycle>;
  const client = opts.client ?? (opts.lifecycle ? new InferenceClient({ lifecycle: fullLifecycle }) : resolveContainerClient(container));
  return { lifecycle: fullLifecycle, client };
}

export async function run(argv: readonly string[], opts: InferenceRunOptions = {}): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [verb = "help", ...rest] = argv;

  try {
    switch (verb) {
      case "start":
        await runStart(rest, { ...opts, print });
        return;
      case "status":
        await runStatus(rest, { ...opts, print });
        return;
      case "embed":
        await runEmbed(rest, { ...opts, print });
        return;
      case "generate":
        await runGenerate(rest, { ...opts, print });
        return;
      case "stop":
        await runStop(rest, { ...opts, print });
        return;
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
  const health = opts.caller
    ? await opts.caller.inference.health()
    : await resolveServices(opts).client.call("health", {});

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
  const { values, model } = parseModelArgs(argv.filter((arg) => arg !== "--json"));
  const text = values.join(" ").trim();
  if (!text) throw new Error("embed requires text");
  const payload = EmbedResultSchema.parse(opts.caller
    ? await opts.caller.inference.embed({ texts: [text], model })
    : await embedWithClient(resolveServices(opts).client, text, model));

  if (json) {
    opts.print(JSON.stringify(payload));
  } else {
    const dims = payload.vectors[0]?.length ?? 0;
    opts.print(`embedding model=${payload.model} vectors=${payload.vectors.length} dims=${dims} cached=${payload.cached}`);
  }
}

async function runGenerate(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const json = hasFlag(argv, "json");
  const prompt = argv.filter((arg) => arg !== "--json").join(" ").trim();
  if (!prompt) throw new Error("generate requires prompt");
  const payload = GenerateResultSchema.parse(opts.caller
    ? await opts.caller.inference.generate({ prompt })
    : await generateWithClient(resolveServices(opts).client, prompt));
  if (json) {
    opts.print(JSON.stringify(payload));
  } else {
    opts.print(payload.text);
  }
}

async function embedWithClient(
  client: InferenceCliClient,
  text: string,
  model?: string,
): Promise<EmbedResult> {
  if (!client.embed) {
    throw new Error("embed requires a tRPC caller or inference client embed method");
  }
  return client.embed([text], { model });
}

function parseModelArgs(argv: readonly string[]): { values: string[]; model?: string } {
  const values: string[] = [];
  let model: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--model") {
      model = argv[index + 1];
      if (!model) throw new Error("--model requires a value");
      index += 1;
      continue;
    }
    if (arg === undefined) continue;
    values.push(arg);
  }
  return { values, model };
}

async function generateWithClient(
  client: InferenceCliClient,
  prompt: string,
): Promise<GenerateResult> {
  if (!client.generate) {
    throw new Error("generate requires a tRPC caller or inference client generate method");
  }
  return client.generate(prompt);
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
