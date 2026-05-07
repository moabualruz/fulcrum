import { Container } from "@needle-di/core";
import { InferenceClient, type InferenceLifecycleLike } from "@/inference/client.ts";
import {
  InferenceLifecycle,
  type InferenceStatus,
  type InferenceStopResult,
} from "@/inference/lifecycle.ts";
import {
  ClassifyResultSchema,
  EmbedResultSchema,
  GenerateResultSchema,
  TokenizeResultSchema,
  type ClassifyResult,
  type EmbedResult,
  type GenerateOptions,
  type GenerateResult,
  type HealthResult,
  type InferenceModel,
  type ModelPullProgress,
  type TokenizeResult,
} from "@/inference/protocol.ts";
import { INFERENCE_CLIENT_TOKEN } from "@/inference/tokens.ts";
import type { BackendHealth } from "@/inference/backends/types.ts";

const HELP = `fulcrum inference

Usage:
  fulcrum inference start [--json]
  fulcrum inference status [--json]
  fulcrum inference models list [--json]
  fulcrum inference models pull <model-id> [--force]
  fulcrum inference models rm <model-id> [--json]
  fulcrum inference embed <text> [--model <id>] [--json]
  fulcrum inference generate <prompt> [--schema <json>] [--json]
  fulcrum inference classify <text> --labels <csv> [--json]
  fulcrum inference tokenize <text> [--model <id>] [--json]
  fulcrum inference config list [--json]
  fulcrum inference config set <feature> <backend>
  fulcrum inference config set-provider --url <url> --key <key>
  fulcrum inference config test-provider [--json]
  fulcrum inference static-proof [--json]
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
  classify?: (text: string, labels: string[]) => Promise<ClassifyResult>;
  tokenize?: (text: string, model?: string) => Promise<TokenizeResult>;
  listModels?: () => Promise<InferenceModel[]>;
  pullModel?: (modelId: string, options?: { force?: boolean }) => AsyncIterable<ModelPullProgress>;
  rmModel?: (modelId: string) => Promise<{ ok: boolean }>;
}

interface InferenceCliCaller {
  inference: {
    health(): Promise<HealthResult>;
    embed(input: { texts: string[]; model?: string }): Promise<unknown>;
    generate(input: { prompt: string; options?: GenerateOptions }): Promise<unknown>;
    classify?: (input: { text: string; labels: string[] }) => Promise<unknown>;
    tokenize?: (input: { text: string; model?: string }) => Promise<unknown>;
    models?: {
      list(): Promise<unknown>;
      pull(input: { modelId: string; force?: boolean }): ProgressSource | Promise<ProgressSource>;
      rm(input: { modelId: string }): Promise<unknown>;
    };
    config?: {
      get(): Promise<unknown>;
      set(input: { feature: string; backend: string }): Promise<unknown>;
    };
    backends?: {
      probe(): Promise<BackendHealth[]>;
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
  /** Hook for static-proof — defaults to running scripts/static-build-proof.ts. */
  staticProof?: () => Promise<string>;
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
      case "classify":
        await runClassify(rest, { ...opts, print });
        return;
      case "tokenize":
        await runTokenize(rest, { ...opts, print });
        return;
      case "config":
        await runConfig(rest, { ...opts, print });
        return;
      case "static-proof":
        await runStaticProof(rest, { ...opts, print });
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

  let backends: BackendHealth[] | undefined;
  if (opts.caller?.inference.backends) {
    backends = await opts.caller.inference.backends.probe();
  } else {
    try {
      const { probeConfiguredBackends: probe } = await import("@/inference/backend-probes.ts");
      backends = await probe();
    } catch {
      // Non-fatal: backends not available from this context
    }
  }

  if (json) {
    opts.print(JSON.stringify({ ...health, backends }));
  } else {
    const lines = [`inference ${health.status}`];
    if (backends) {
      for (const b of backends) {
        const bits: string[] = [b.backend, b.status];
        if (b.reason) bits.push(`reason=${b.reason}`);
        lines.push(`  ${bits.join(" ")}`);
      }
    } else {
      lines[0] = `inference ${health.status} backends=${health.backends.join(",")}`;
    }
    opts.print(lines.join("\n"));
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
  const { values, schema } = parseGenerateArgs(argv.filter((arg) => arg !== "--json"));
  const prompt = values.join(" ").trim();
  if (!prompt) throw new Error("generate requires prompt");
  const options: GenerateOptions = schema ? { schema } : {};
  const payload = GenerateResultSchema.parse(opts.caller
    ? await opts.caller.inference.generate({ prompt, options })
    : await generateWithClient(resolveServices(opts).client, prompt, options));
  if (json) {
    opts.print(JSON.stringify(payload));
  } else {
    opts.print(payload.text);
  }
}

async function runClassify(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  assertEmbeddingsFeatureEnabled();
  const json = hasFlag(argv, "json");
  const { values, labels } = parseClassifyArgs(argv.filter((arg) => arg !== "--json"));
  const text = values.join(" ").trim();
  if (!text) throw new Error("classify requires text");
  if (labels.length === 0) throw new Error("classify requires --labels");

  const payload = ClassifyResultSchema.parse(opts.caller
    ? await classifyWithCaller(opts.caller, text, labels)
    : await classifyWithClient(resolveServices(opts).client, text, labels));

  if (json) {
    opts.print(JSON.stringify(payload));
  } else {
    for (const result of payload) {
      opts.print(`${result.label}\t${result.score}`);
    }
  }
}

async function runTokenize(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  assertEmbeddingsFeatureEnabled();
  const json = hasFlag(argv, "json");
  const { values, model } = parseModelArgs(argv.filter((arg) => arg !== "--json"));
  const text = values.join(" ").trim();
  if (!text) throw new Error("tokenize requires text");

  const payload = TokenizeResultSchema.parse(opts.caller
    ? await tokenizeWithCaller(opts.caller, text, model)
    : await tokenizeWithClient(resolveServices(opts).client, text, model));

  if (json) {
    opts.print(JSON.stringify(payload));
  } else {
    opts.print(`tokens=${payload.count}`);
    opts.print(payload.tokens.join(" "));
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

function assertEmbeddingsFeatureEnabled(): void {
  const features = (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  if (!features.includes("embeddings")) {
    throw new Error("classify/tokenize require FULCRUM_FEATURES=embeddings");
  }
}

function parseClassifyArgs(argv: readonly string[]): { values: string[]; labels: string[] } {
  const values: string[] = [];
  let labels: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--labels") {
      const csv = argv[index + 1];
      if (!csv) throw new Error("--labels requires a value");
      labels = csv.split(",").map((label) => label.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    if (arg === undefined) continue;
    values.push(arg);
  }
  return { values, labels };
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

async function classifyWithCaller(
  caller: InferenceCliCaller,
  text: string,
  labels: string[],
): Promise<unknown> {
  if (!caller.inference.classify) {
    throw new Error("classify requires inference.classify tRPC caller");
  }
  return caller.inference.classify({ text, labels });
}

async function tokenizeWithCaller(
  caller: InferenceCliCaller,
  text: string,
  model?: string,
): Promise<unknown> {
  if (!caller.inference.tokenize) {
    throw new Error("tokenize requires inference.tokenize tRPC caller");
  }
  return caller.inference.tokenize({ text, model });
}

async function classifyWithClient(
  client: InferenceCliClient,
  text: string,
  labels: string[],
): Promise<ClassifyResult> {
  if (!client.classify) {
    throw new Error("classify requires a tRPC caller or inference client classify method");
  }
  return client.classify(text, labels);
}

async function tokenizeWithClient(
  client: InferenceCliClient,
  text: string,
  model?: string,
): Promise<TokenizeResult> {
  if (!client.tokenize) {
    throw new Error("tokenize requires a tRPC caller or inference client tokenize method");
  }
  return client.tokenize(text, model);
}

function parseGenerateArgs(argv: readonly string[]): { values: string[]; schema?: Record<string, unknown> } {
  const values: string[] = [];
  let schema: Record<string, unknown> | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--schema") {
      const raw = argv[index + 1];
      if (!raw) throw new Error("--schema requires a JSON value");
      try {
        schema = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new Error("--schema value must be valid JSON");
      }
      index += 1;
      continue;
    }
    if (arg === undefined) continue;
    values.push(arg);
  }
  return { values, schema };
}

async function generateWithClient(
  client: InferenceCliClient,
  prompt: string,
  options?: GenerateOptions,
): Promise<GenerateResult> {
  if (!client.generate) {
    throw new Error("generate requires a tRPC caller or inference client generate method");
  }
  return client.generate(prompt, options);
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

async function runConfig(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const [verb = "help", ...rest] = argv;
  switch (verb) {
    case "list":
      await runConfigList(rest, opts);
      return;
    case "set":
      await runConfigSet(rest, opts);
      return;
    case "set-provider":
      await runConfigSetProvider(rest, opts);
      return;
    case "test-provider":
      await runConfigTestProvider(rest, opts);
      return;
    default:
      throw new Error(`unknown config verb '${verb}'`);
  }
}

async function runConfigList(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const json = hasFlag(argv, "json");

  if (opts.caller?.inference.config) {
    const map = await opts.caller.inference.config.get();
    if (json) {
      opts.print(JSON.stringify(map));
    } else {
      for (const [feature, backend] of Object.entries(map as Record<string, string>)) {
        opts.print(`${feature}: ${backend}`);
      }
    }
    return;
  }

  // Fallback: read from routing-config module directly
  const { getRoutingConfig } = await import("@/inference/routing-config.ts");
  const map = getRoutingConfig();
  if (json) {
    opts.print(JSON.stringify(map));
  } else {
    for (const [feature, backend] of Object.entries(map)) {
      opts.print(`${feature}: ${backend}`);
    }
  }
}

async function runConfigSet(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const [feature, backend] = argv;
  if (!feature) throw new Error("config set requires <feature>");
  if (!backend) throw new Error("config set requires <backend>");

  if (opts.caller?.inference.config) {
    await opts.caller.inference.config.set({ feature, backend });
    opts.print(`${feature}: ${backend}`);
    return;
  }

  // Fallback: write to routing-config module directly
  const { setRoutingConfig } = await import("@/inference/routing-config.ts");
  const { BACKEND_IDS } = await import("@/inference/backends/types.ts");
  if (!BACKEND_IDS.includes(backend as never)) {
    throw new Error(`invalid backend '${backend}'; valid: ${BACKEND_IDS.join(", ")}`);
  }
  setRoutingConfig(feature as never, backend as never);
  opts.print(`${feature}: ${backend}`);
}

async function runConfigSetProvider(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  let url: string | undefined;
  let key: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--url") { url = argv[++i]; continue; }
    if (argv[i] === "--key") { key = argv[++i]; continue; }
  }
  if (!url) throw new Error("config set-provider requires --url");
  if (!key) throw new Error("config set-provider requires --key");

  // Persist to env (config store override path per issue notes)
  process.env["FULCRUM_INFERENCE_URL"] = url;
  process.env["FULCRUM_INFERENCE_API_KEY"] = key;
  opts.print(`provider configured url=${url}`);
}

async function runConfigTestProvider(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const json = hasFlag(argv, "json");
  const features = (process.env["FULCRUM_FEATURES"] ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const flagEnabled = features.includes("external-llm-provider");

  const { OpenAICompatibleBackend } = await import("@/inference/backends/openai-compatible.ts");
  const backend = new OpenAICompatibleBackend({ flagEnabled });
  const result = await backend.testConnection();

  if (json) {
    opts.print(JSON.stringify(result));
  } else if (result.ok) {
    opts.print(`provider ok latency=${result.latency_ms}ms`);
  } else {
    opts.print(`provider error: ${result.error}`);
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

async function runStaticProof(
  argv: readonly string[],
  opts: InferenceRunOptions & { print: (line: string) => void },
): Promise<void> {
  const json = hasFlag(argv, "json");

  let output: string;
  if (opts.staticProof) {
    output = await opts.staticProof();
  } else {
    const proc = Bun.spawn(["bun", "run", "scripts/static-build-proof.ts"], {
      stdout: "pipe",
      stderr: "inherit",
    });
    output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (json) {
      opts.print(output.trim());
    } else {
      opts.print(output.trim());
    }
    if (exitCode !== 0 && opts.exit) {
      opts.exit(exitCode);
    }
    return;
  }

  if (json) {
    opts.print(output.trim());
  } else {
    opts.print(output.trim());
  }
}
