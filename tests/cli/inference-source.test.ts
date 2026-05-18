import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { run, type InferenceRunOptions } from "../../apps/cli/src/inference.ts";

let previousFeatures: string | undefined;
let previousInferenceUrl: string | undefined;
let previousInferenceKey: string | undefined;

function createHarness(extra: Partial<InferenceRunOptions> = {}) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exits: number[] = [];
  return {
    stdout,
    stderr,
    exits,
    opts: {
      print: (line: string) => stdout.push(line),
      printErr: (line: string) => stderr.push(line),
      exit: (code: number) => exits.push(code),
      ...extra,
    } satisfies InferenceRunOptions,
  };
}

const health = {
  status: "ok",
  backends: ["embedded"],
  models: ["mini"],
  cache: { db_path: "/tmp/inference.db", embed_rows: 1, gen_rows: 2 },
};

beforeEach(() => {
  previousFeatures = process.env["FULCRUM_FEATURES"];
  previousInferenceUrl = process.env["FULCRUM_INFERENCE_URL"];
  previousInferenceKey = process.env["FULCRUM_INFERENCE_API_KEY"];
  delete process.env["FULCRUM_FEATURES"];
  delete process.env["FULCRUM_INFERENCE_URL"];
  delete process.env["FULCRUM_INFERENCE_API_KEY"];
});

afterEach(() => {
  if (previousFeatures === undefined) delete process.env["FULCRUM_FEATURES"];
  else process.env["FULCRUM_FEATURES"] = previousFeatures;
  if (previousInferenceUrl === undefined) delete process.env["FULCRUM_INFERENCE_URL"];
  else process.env["FULCRUM_INFERENCE_URL"] = previousInferenceUrl;
  if (previousInferenceKey === undefined) delete process.env["FULCRUM_INFERENCE_API_KEY"];
  else process.env["FULCRUM_INFERENCE_API_KEY"] = previousInferenceKey;
});

describe("inference CLI source command", () => {
  it("serves help and reports unknown verbs through exit hook", async () => {
    const helpHarness = createHarness();
    await run(["help"], helpHarness.opts);
    expect(helpHarness.stdout.join("\n")).toContain("fulcrum inference");

    const unknownHarness = createHarness();
    await run(["wat"], unknownHarness.opts);
    expect(unknownHarness.stderr.join("\n")).toContain("unknown verb");
    expect(unknownHarness.exits).toEqual([2]);
  });

  it("starts, reports status, and stops via injected lifecycle/client", async () => {
    const lifecycle = {
      ensureRunning: async () => ({ pid: 123, socketPath: "/tmp/fulcrum.sock", started: true }),
      status: async () => ({ status: "ok" as const, pid: 123, socketPath: "/tmp/fulcrum.sock" }),
      stop: async () => ({ status: "stopped" as const, pid: 123, socketPath: "/tmp/fulcrum.sock", socketRemoved: true, pidFileRemoved: true }),
    };
    const client = { call: async () => health };

    const start = createHarness({ lifecycle, client });
    await run(["start", "--json"], start.opts);
    expect(JSON.parse(start.stdout[0]!).pid).toBe(123);

    const status = createHarness({ client });
    await run(["status"], status.opts);
    expect(status.stdout.join("\n")).toContain("inference ok");

    const stop = createHarness({ lifecycle, client });
    await run(["stop"], stop.opts);
    expect(stop.stdout.join("\n")).toContain("socket removed");
  });

  it("uses caller-backed model list, pull progress, and removal paths", async () => {
    async function* progress() {
      yield { type: "download_progress" as const, pct: 25, downloaded: 1, total: 4 };
      yield { type: "download_progress" as const, pct: 100, downloaded: 4, total: 4 };
    }
    const caller = {
      inference: {
        health: async () => health,
        embed: async () => ({ vectors: [[1, 2]], model: "mini", cached: false, dimensions: 2 }),
        generate: async () => ({ text: "ok", model: "mini", tokens: 1 }),
        models: {
          list: async () => [{ id: "mini", kind: "embed", downloaded: true, active: true, sizeBytes: 42 }],
          pull: async () => progress(),
          rm: async () => ({ ok: true }),
        },
      },
    };

    const list = createHarness({ caller });
    await run(["models", "list", "--json"], list.opts);
    expect(JSON.parse(list.stdout[0]!)[0].size_bytes).toBe(42);

    const pull = createHarness({ caller });
    await run(["models", "pull", "mini", "--force"], pull.opts);
    expect(pull.stdout).toEqual(["download mini 25% 1/4", "download mini 100% 4/4"]);

    const rm = createHarness({ caller });
    await run(["models", "rm", "mini"], rm.opts);
    expect(rm.stdout).toEqual(["removed mini"]);
  });

  it("supports subscribable model pull progress and unsubscribes", async () => {
    let unsubscribed = false;
    const caller = {
      inference: {
        health: async () => health,
        embed: async () => ({ vectors: [[1]], model: "mini", cached: false, dimensions: 1 }),
        generate: async () => ({ text: "ok", model: "mini", tokens: 1 }),
        models: {
          list: async () => [],
          rm: async () => ({ ok: true }),
          pull: () => ({
            subscribe(observer: { next(value: unknown): void; complete(): void }) {
              observer.next({ type: "download_progress", pct: 100, downloaded: 10, total: 10 });
              observer.complete();
              return { unsubscribe: () => { unsubscribed = true; } };
            },
          }),
        },
      },
    };

    const harness = createHarness({ caller });
    await run(["models", "pull", "mini"], harness.opts);
    expect(harness.stdout).toEqual(["download mini 100% 10/10"]);
    expect(unsubscribed).toBe(true);
  });

  it("runs embed, generate, classify, and tokenize through caller contracts", async () => {
    process.env["FULCRUM_FEATURES"] = "embeddings";
    const caller = {
      inference: {
        health: async () => health,
        embed: async (input: { texts: string[]; model?: string }) => ({
          vectors: [[0.1, 0.2, 0.3]],
          model: input.model ?? "mini",
          cached: true,
          dimensions: 3,
        }),
        generate: async (input: { prompt: string; options?: { schema?: Record<string, unknown> } }) => ({
          text: input.options?.schema ? "structured" : input.prompt.toUpperCase(),
          model: "mini",
          tokens: 3,
        }),
        classify: async (input: { labels: string[] }) => input.labels.map((label, index) => ({ label, score: index === 0 ? 0.9 : 0.1 })),
        tokenize: async () => ({ count: 2, tokens: ["hello", "world"] }),
      },
    };

    const embed = createHarness({ caller });
    await run(["embed", "hello", "world", "--model", "mini", "--json"], embed.opts);
    expect(JSON.parse(embed.stdout[0]!).dimensions).toBe(3);

    const generate = createHarness({ caller });
    await run(["generate", "hello", "--schema", "{\"type\":\"object\"}"], generate.opts);
    expect(generate.stdout).toEqual(["structured"]);

    const classify = createHarness({ caller });
    await run(["classify", "bug", "--labels", "bug,feature"], classify.opts);
    expect(classify.stdout).toEqual(["bug\t0.9", "feature\t0.1"]);

    const tokenize = createHarness({ caller });
    await run(["tokenize", "hello world", "--json"], tokenize.opts);
    expect(JSON.parse(tokenize.stdout[0]!).tokens).toEqual(["hello", "world"]);
  });

  it("validates missing inputs and feature gates without throwing past the CLI wrapper", async () => {
    const caller = {
      inference: {
        health: async () => health,
        embed: async () => ({ vectors: [[1]], model: "mini", cached: false, dimensions: 1 }),
        generate: async () => ({ text: "ok", model: "mini", tokens: 1 }),
      },
    };

    const embed = createHarness({ caller });
    await run(["embed"], embed.opts);
    expect(embed.stderr.join("\n")).toContain("embed requires text");
    expect(embed.exits).toEqual([1]);

    const schema = createHarness({ caller });
    await run(["generate", "hello", "--schema", "nope"], schema.opts);
    expect(schema.stderr.join("\n")).toContain("valid JSON");
    expect(schema.exits).toEqual([1]);

    const classified = createHarness({ caller });
    await run(["classify", "text", "--labels", "a,b"], classified.opts);
    expect(classified.stderr.join("\n")).toContain("FULCRUM_FEATURES=embeddings");
    expect(classified.exits).toEqual([1]);
  });

  it("manages config through caller and provider env paths", async () => {
    const setCalls: unknown[] = [];
    const caller = {
      inference: {
        health: async () => health,
        embed: async () => ({ vectors: [[1]], model: "mini", cached: false, dimensions: 1 }),
        generate: async () => ({ text: "ok", model: "mini", tokens: 1 }),
        config: {
          get: async () => ({ embeddings: "embedded", classify: "ollama" }),
          set: async (input: unknown) => { setCalls.push(input); },
        },
      },
    };

    const list = createHarness({ caller });
    await run(["config", "list"], list.opts);
    expect(list.stdout).toContain("embeddings: embedded");

    const set = createHarness({ caller });
    await run(["config", "set", "classify", "embedded"], set.opts);
    expect(setCalls).toEqual([{ feature: "classify", backend: "embedded" }]);
    expect(set.stdout).toEqual(["classify: embedded"]);

    const provider = createHarness({ caller });
    await run(["config", "set-provider", "--url", "https://llm.local", "--key", "secret"], provider.opts);
    expect(process.env["FULCRUM_INFERENCE_URL"]).toBe("https://llm.local");
    expect(process.env["FULCRUM_INFERENCE_API_KEY"]).toBe("secret");
  });

  it("prints backend probes from caller status and static proof output", async () => {
    const caller = {
      inference: {
        health: async () => health,
        embed: async () => ({ vectors: [[1]], model: "mini", cached: false, dimensions: 1 }),
        generate: async () => ({ text: "ok", model: "mini", tokens: 1 }),
        backends: {
          probe: async () => [{
            backend: "ollama" as const,
            configured: true,
            enabled: true,
            status: "unavailable" as const,
            reason: "missing",
            model: null,
            embedProbe: null,
            generateProbe: null,
            dimensions: null,
            lastChecked: null,
          }],
        },
      },
    };

    const status = createHarness({ caller });
    await run(["status"], status.opts);
    expect(status.stdout.join("\n")).toContain("ollama unavailable reason=missing");

    const proof = createHarness({ staticProof: async () => "{\"ok\":true}\n" });
    await run(["static-proof", "--json"], proof.opts);
    expect(proof.stdout).toEqual(["{\"ok\":true}"]);
  });

  it("routes remote-capable operations through the configured inference public API", async () => {
    process.env["FULCRUM_FEATURES"] = "embeddings";
    const calls: Array<{ url: string; method: string | undefined; body: unknown }> = [];
    const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = new URL(String(url));
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: String(url), method: init?.method, body });
      switch (requestUrl.pathname) {
        case "/api/v1/inference/health":
          return Response.json(health);
        case "/api/v1/inference/backends/probe":
          return Response.json([]);
        case "/api/v1/inference/models/mini/pull":
          return Response.json([{ type: "download_progress", pct: 100, downloaded: 10, total: 10 }]);
        case "/api/v1/inference/embed":
          return Response.json({ vectors: [[0.1, 0.2]], model: "mini", cached: false, dimensions: 2 });
        case "/api/v1/inference/config":
          return Response.json({ ok: true, config: { embeddings: "embedded" } });
        case "/api/v1/inference/provider":
          return Response.json({ ok: true, url: body?.url });
        case "/api/v1/inference/provider/test":
          return Response.json({ ok: true, latency_ms: 12 });
        default:
          return Response.json({ error: "unexpected route" }, { status: 500 });
      }
    }) as unknown as typeof globalThis.fetch;
    const opts = {
      env: { FULCRUM_SERVER_URL: "http://127.0.0.1:3210/" },
      fetch,
    };

    const status = createHarness(opts);
    await run(["status", "--json"], status.opts);
    expect(JSON.parse(status.stdout[0]!).status).toBe("ok");

    const pull = createHarness(opts);
    await run(["models", "pull", "mini"], pull.opts);
    expect(pull.stdout).toEqual(["download mini 100% 10/10"]);

    const embed = createHarness(opts);
    await run(["embed", "hello", "--model", "mini", "--json"], embed.opts);
    expect(JSON.parse(embed.stdout[0]!).dimensions).toBe(2);

    const config = createHarness(opts);
    await run(["config", "set", "embeddings", "embedded"], config.opts);
    expect(config.stdout).toEqual(["embeddings: embedded"]);

    const provider = createHarness(opts);
    await run(["config", "set-provider", "--url", "https://llm.local", "--key", "secret"], provider.opts);
    await run(["config", "test-provider", "--json"], provider.opts);

    expect(calls).toEqual([
      { method: "GET", url: "http://127.0.0.1:3210/api/v1/inference/health", body: null },
      { method: "GET", url: "http://127.0.0.1:3210/api/v1/inference/backends/probe", body: null },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/inference/models/mini/pull",
        body: { force: false },
      },
      {
        method: "POST",
        url: "http://127.0.0.1:3210/api/v1/inference/embed",
        body: { texts: ["hello"], model: "mini" },
      },
      {
        method: "PATCH",
        url: "http://127.0.0.1:3210/api/v1/inference/config",
        body: { feature: "embeddings", backend: "embedded" },
      },
      {
        method: "PATCH",
        url: "http://127.0.0.1:3210/api/v1/inference/provider",
        body: { url: "https://llm.local", key: "secret" },
      },
      { method: "POST", url: "http://127.0.0.1:3210/api/v1/inference/provider/test", body: null },
    ]);
  });

  it("uses direct client methods for non-caller model and inference operations", async () => {
    process.env["FULCRUM_FEATURES"] = "embeddings";
    async function* pullModel() {
      yield { type: "download_progress" as const, pct: 50, downloaded: 5, total: 10 };
      yield { type: "download_progress" as const, pct: 100, downloaded: 10, total: 10 };
    }
    const client = {
      call: async () => health,
      listModels: async () => [
        { id: "embed-mini", kind: "embed" as const, downloaded: false, active: false },
      ],
      pullModel,
      rmModel: async (modelId: string) => ({ ok: modelId === "embed-mini" }),
      embed: async (texts: string[], options?: { model?: string }) => ({
        vectors: texts.map(() => [0.1, 0.2]),
        model: options?.model ?? "embed-mini",
        cached: false,
        dimensions: 2,
      }),
      generate: async (prompt: string) => ({
        text: `generated:${prompt}`,
        model: "gen-mini",
        tokens: 2,
      }),
      classify: async (_text: string, labels: string[]) =>
        labels.map((label, index) => ({ label, score: index === 0 ? 1 : 0 })),
      tokenize: async (text: string, model?: string) => ({
        count: text.split(" ").length,
        tokens: text.split(" "),
        model,
      }),
    };

    const list = createHarness({ client });
    await run(["models", "list"], list.opts);
    expect(list.stdout).toEqual(["embed-mini kind=embed downloaded=false"]);

    const pull = createHarness({ client });
    await run(["models", "pull", "embed-mini"], pull.opts);
    expect(pull.stdout).toEqual([
      "download embed-mini 50% 5/10",
      "download embed-mini 100% 10/10",
    ]);

    const rm = createHarness({ client });
    await run(["models", "rm", "embed-mini", "--json"], rm.opts);
    expect(JSON.parse(rm.stdout[0]!).ok).toBe(true);

    const embed = createHarness({ client });
    await run(["embed", "hello", "--model", "embed-mini"], embed.opts);
    expect(embed.stdout).toEqual(["embedding model=embed-mini vectors=1 dims=2 cached=false"]);

    const generate = createHarness({ client });
    await run(["generate", "prompt"], generate.opts);
    expect(generate.stdout).toEqual(["generated:prompt"]);

    const classify = createHarness({ client });
    await run(["classify", "issue", "--labels", "bug,task", "--json"], classify.opts);
    expect(JSON.parse(classify.stdout[0]!)[0]).toEqual({ label: "bug", score: 1 });

    const tokenize = createHarness({ client });
    await run(["tokenize", "hello world", "--model", "embed-mini"], tokenize.opts);
    expect(tokenize.stdout).toEqual(["tokens=2", "hello world"]);
  });

  it("reports missing direct client capabilities and malformed command inputs", async () => {
    process.env["FULCRUM_FEATURES"] = "embeddings";
    const client = { call: async () => health };

    const modelList = createHarness({ client });
    await run(["models", "list"], modelList.opts);
    expect(modelList.stderr.join("\n")).toContain("listModels method");
    expect(modelList.exits).toEqual([1]);

    const pullMissingId = createHarness({ client });
    await run(["models", "pull"], pullMissingId.opts);
    expect(pullMissingId.stderr.join("\n")).toContain("models pull requires model id");
    expect(pullMissingId.exits).toEqual([1]);

    const modelRm = createHarness({ client });
    await run(["models", "rm"], modelRm.opts);
    expect(modelRm.stderr.join("\n")).toContain("models rm requires model id");
    expect(modelRm.exits).toEqual([1]);

    const modelArg = createHarness({ client });
    await run(["embed", "hello", "--model"], modelArg.opts);
    expect(modelArg.stderr.join("\n")).toContain("--model requires a value");
    expect(modelArg.exits).toEqual([1]);

    const labelsArg = createHarness({ caller: { inference: { health: async () => health, embed: async () => ({ vectors: [[1]], model: "mini", cached: false, dimensions: 1 }), generate: async () => ({ text: "ok", model: "mini", tokens: 1 }) } } });
    await run(["classify", "hello", "--labels"], labelsArg.opts);
    expect(labelsArg.stderr.join("\n")).toContain("--labels requires a value");
    expect(labelsArg.exits).toEqual([1]);

    const config = createHarness();
    await run(["config", "set"], config.opts);
    expect(config.stderr.join("\n")).toContain("config set requires <feature>");
    expect(config.exits).toEqual([1]);
  });
});
