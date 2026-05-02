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
  type InferenceModel,
  type ModelPullProgress,
} from "../inference/protocol.ts";
import { INFERENCE_CLIENT_TOKEN } from "../inference/tokens.ts";

const HELP = `fulcrum inference

Usage:
  fulcrum inference start [--json]
  fulcrum inference status [--json]
  fulcrum inference models list [--json]
  fulcrum inference models pull <model-id> [--force]
  fulcrum inference models rm <model-id> [--json]
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
  listModels?: () => Promise<InferenceModel[]>;
  pullModel?: (modelId: string, options?: { force?: boolean }) => AsyncIterable<ModelPullProgress>;
  rmModel?: (modelId: string) => Promise<{ ok: boolean }>;
}

interface InferenceCliCaller {
  inference: {
    health(): Promise<HealthResult>;
    embed(input: { texts: string[]; model?: string }): Promise<unknown>;
    generate(input: { prompt: string; options?: GenerateOptions }): Promise<unknown>;
    models?: {
      list(): Promise<unknown>;
      pull(input: { modelId: string; force?: boolean }): ProgressSource | Promise<ProgressSource>;
      rm(input: { modelId: string }): Promise<unknown>;
    };
  };
}

type ProgressSource = AsyncIterable<unknown> | {
  subscribe(opts: {
    next(value: unknown): void;
    error(error: unknown): void;
    complete(): void;
  }): { unsubscribe(): void };
};

function isSubscribableProgress(source: ProgressSource): source is Exclude<ProgressSource, AsyncIterable<unknown>> {
  return typeof (source as { subscribe?: unknown }).subscribe === "function";
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
      case "models":
        await runModels(rest, { ...opts, print });
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

async function runModels(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const [verb = "list", ...rest] = argv;
  switch (verb) {
    case "list":
      await runModelsList(rest, opts);
      return;
    case "pull":
      await runModelsPull(rest, opts);
      return;
    case "rm":
      await runModelsRm(rest, opts);
      return;
    default:
      throw new Error(`unknown models verb '${verb}'`);
  }
}

function toCliModel(model: InferenceModel) {
  return {
    id: model.id,
    kind: model.kind,
    downloaded: model.downloaded,
    active: model.active,
    ...(model.sizeBytes === undefined ? {} : { size_bytes: model.sizeBytes }),
  };
}

async function runModelsList(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const json = hasFlag(argv, "json");
  const models = opts.caller
    ? await requireCallerModels(opts.caller).list()
    : await listModelsWithClient(resolveServices(opts).client);
  const payload = (models as InferenceModel[]).map(toCliModel);

  if (json) {
    opts.print(JSON.stringify(payload));
    return;
  }
  if (payload.length === 0) {
    opts.print("No inference models configured.");
    return;
  }
  for (const model of payload) {
    const size = "size_bytes" in model ? ` size=${model.size_bytes}` : "";
    opts.print(`${model.id} kind=${model.kind} downloaded=${model.downloaded}${size}`);
  }
}

async function runModelsPull(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const force = hasFlag(argv, "force");
  const modelId = argv.filter((arg) => arg !== "--force")[0];
  if (!modelId) throw new Error("models pull requires model id");
  const events = opts.caller
    ? await requireCallerModels(opts.caller).pull({ modelId, force })
    : pullModelWithClient(resolveServices(opts).client, modelId, force);

  for await (const event of iterateProgress(events)) {
    const progress = event as ModelPullProgress;
    opts.print(`download ${modelId} ${progress.pct}% ${progress.downloaded}/${progress.total}`);
  }
}

async function runModelsRm(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const json = hasFlag(argv, "json");
  const modelId = argv.filter((arg) => arg !== "--json")[0];
  if (!modelId) throw new Error("models rm requires model id");
  const result = opts.caller
    ? await requireCallerModels(opts.caller).rm({ modelId })
    : await rmModelWithClient(resolveServices(opts).client, modelId);

  if (json) {
    opts.print(JSON.stringify(result));
  } else {
    opts.print(`removed ${modelId}`);
  }
}

function requireCallerModels(caller: InferenceCliCaller): NonNullable<InferenceCliCaller["inference"]["models"]> {
  if (!caller.inference.models) {
    throw new Error("models command requires inference.models tRPC caller");
  }
  return caller.inference.models;
}

async function* iterateProgress(source: ProgressSource): AsyncIterable<unknown> {
  if (Symbol.asyncIterator in Object(source)) {
    yield* (source as AsyncIterable<unknown>);
    return;
  }

  if (!isSubscribableProgress(source)) return;

  const events: unknown[] = [];
  let done = false;
  let failure: unknown;
  const subscription = source.subscribe({
    next(value: unknown) {
      events.push(value);
    },
    error(error: unknown) {
      failure = error;
      done = true;
    },
    complete() {
      done = true;
    },
  });

  try {
    while (!done || events.length > 0) {
      if (failure) throw failure;
      const event = events.shift();
      if (event !== undefined) {
        yield event;
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    subscription.unsubscribe();
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

async function listModelsWithClient(client: InferenceCliClient): Promise<InferenceModel[]> {
  if (!client.listModels) {
    throw new Error("models list requires a tRPC caller or inference client listModels method");
  }
  return client.listModels();
}

function pullModelWithClient(
  client: InferenceCliClient,
  modelId: string,
  force: boolean,
): AsyncIterable<ModelPullProgress> {
  if (!client.pullModel) {
    throw new Error("models pull requires a tRPC caller or inference client pullModel method");
  }
  return client.pullModel(modelId, { force });
}

async function rmModelWithClient(
  client: InferenceCliClient,
  modelId: string,
): Promise<{ ok: boolean }> {
  if (!client.rmModel) {
    throw new Error("models rm requires a tRPC caller or inference client rmModel method");
  }
  return client.rmModel(modelId);
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
