import { describe, expect, test } from "bun:test";
import { Container } from "@needle-di/core";

import { run } from "./inference.ts";
import type { InferenceClient } from "@platform-core/application/inference/client.ts";
import type { HealthResult } from "@platform-core/application/inference/protocol.ts";
import { INFERENCE_CLIENT_TOKEN } from "@platform-core/application/inference/tokens.ts";

const health: HealthResult = { status: "ok", backends: ["embedded"], models: [] };
const cache = {
  db_path: "/tmp/fulcrum/inference-cache.db",
  embed_rows: 2,
  gen_rows: 1,
};

function capture() {
  const lines: string[] = [];
  const errors: string[] = [];
  let exitCode: number | undefined;
  return {
    lines,
    errors,
    get exitCode() {
      return exitCode;
    },
    opts: {
      print: (line: string) => lines.push(line),
      printErr: (line: string) => errors.push(line),
      exit: (code: number) => {
        exitCode = code;
      },
    },
  };
}

describe("fulcrum inference CLI", () => {
  test("models list --json emits InferenceModel array with snake-case size", async () => {
    const cap = capture();

    await run(["models", "list", "--json"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async () => ({ vectors: [[0.1]], model: "BAAI/bge-small-en-v1.5", cached: false, dimensions: 384 }),
          generate: async () => ({ text: "Paris", model: "Qwen2.5-0.5B-Instruct", tokens: 8 }),
          models: {
            list: async () => [{
              id: "BAAI/bge-small-en-v1.5",
              kind: "embed",
              downloaded: false,
              active: true,
              sizeBytes: 133466304,
            }],
            pull: async function* () {},
            rm: async () => ({ ok: true }),
          },
        },
      } as never,
    });

    expect(JSON.parse(cap.lines.join("\n"))).toEqual([{
      id: "BAAI/bge-small-en-v1.5",
      kind: "embed",
      downloaded: false,
      active: true,
      size_bytes: 133466304,
    }]);
  });

  test("models pull streams progress and forwards --force", async () => {
    const cap = capture();
    let observedInput: unknown;

    await run(["models", "pull", "fixture-model", "--force"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async () => ({ vectors: [[0.1]], model: "fixture-model", cached: false, dimensions: 384 }),
          generate: async () => ({ text: "Paris", model: "Qwen2.5-0.5B-Instruct", tokens: 8 }),
          models: {
            list: async () => [],
            pull: async function* (input: unknown) {
              observedInput = input;
              yield { type: "download_progress", pct: 0, downloaded: 0, total: 10 };
              yield { type: "download_progress", pct: 100, downloaded: 10, total: 10 };
            },
            rm: async () => ({ ok: true }),
          },
        },
      } as never,
    });

    expect(observedInput).toEqual({ modelId: "fixture-model", force: true });
    expect(cap.lines).toEqual([
      "download fixture-model 0% 0/10",
      "download fixture-model 100% 10/10",
    ]);
  });

  test("models rm deletes model through injected caller", async () => {
    const cap = capture();
    let observedInput: unknown;

    await run(["models", "rm", "fixture-model", "--json"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async () => ({ vectors: [[0.1]], model: "fixture-model", cached: false, dimensions: 384 }),
          generate: async () => ({ text: "Paris", model: "Qwen2.5-0.5B-Instruct", tokens: 8 }),
          models: {
            list: async () => [],
            pull: async function* () {},
            rm: async (input: unknown) => {
              observedInput = input;
              return { ok: true };
            },
          },
        },
      } as never,
    });

    expect(observedInput).toEqual({ modelId: "fixture-model" });
    expect(JSON.parse(cap.lines.join("\n"))).toEqual({ ok: true });
  });

  test("start --json emits parseable JSON with PID, socket path, and health", async () => {
    const cap = capture();

    await run(["start", "--json"], {
      ...cap.opts,
      lifecycle: {
        ensureRunning: async () => ({ pid: 42, socketPath: "/tmp/fulcrum/inference.sock" }),
      },
      client: {
        call: async () => health,
      },
    });

    expect(cap.exitCode).toBeUndefined();
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload).toMatchObject({
      status: "ok",
      pid: 42,
      socketPath: "/tmp/fulcrum/inference.sock",
      health,
    });
  });

  test("status --json emits parseable JSON after health round-trip", async () => {
    const cap = capture();

    await run(["status", "--json"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => ({ ...health, cache }),
          embed: async () => ({ vectors: [[0.1]], model: "BAAI/bge-small-en-v1.5", cached: false, dimensions: 384 }),
          generate: async () => ({ text: "Paris", model: "Qwen2.5-0.5B-Instruct", tokens: 8 }),
        },
      },
    });

    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload.status).toBe("ok");
    expect(payload.cache).toEqual(cache);
  });

  test("embed --json emits vectors, model, and cached from injected caller", async () => {
    const cap = capture();

    await run(["embed", "hello", "--json"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async () => ({ vectors: [[0.1, 0.2]], model: "BAAI/bge-small-en-v1.5", cached: false, dimensions: 384 }),
          generate: async () => ({ text: "Paris", model: "Qwen2.5-0.5B-Instruct", tokens: 8 }),
        },
      },
    });

    expect(JSON.parse(cap.lines.join("\n"))).toMatchObject({
      vectors: [[0.1, 0.2]],
      model: "BAAI/bge-small-en-v1.5",
      cached: false,
      dimensions: 384,
    });
  });

  test("embed --model forwards model id to injected caller", async () => {
    const cap = capture();
    let observedInput: unknown;

    await run(["embed", "hello", "--model", "custom-embed-model", "--json"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async (input) => {
            observedInput = input;
            return { vectors: [[0.1, 0.2]], model: "custom-embed-model", cached: false, dimensions: 384 };
          },
          generate: async () => ({ text: "Paris", model: "Qwen2.5-0.5B-Instruct", tokens: 8 }),
        },
      },
    });

    expect(observedInput).toEqual({ texts: ["hello"], model: "custom-embed-model" });
    expect(JSON.parse(cap.lines.join("\n")).model).toBe("custom-embed-model");
  });

  test("embed without --json emits a concise human summary", async () => {
    const cap = capture();

    await run(["embed", "hello"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async () => ({ vectors: [[0.1, 0.2]], model: "BAAI/bge-small-en-v1.5", cached: false, dimensions: 384 }),
          generate: async () => ({ text: "Paris", model: "Qwen2.5-0.5B-Instruct", tokens: 8 }),
        },
      },
    });

    expect(cap.lines).toEqual([
      "embedding model=BAAI/bge-small-en-v1.5 vectors=1 dims=2 cached=false",
    ]);
  });

  test("embed and generate use the local inference client when no API caller is supplied", async () => {
    const embedCap = capture();
    await run(["embed", "hello", "--json"], {
      ...embedCap.opts,
      client: {
        call: async () => health,
        embed: async () => ({ vectors: [[0.1, 0.2]], model: "local", cached: true, dimensions: 384 }),
        generate: async () => ({ text: "unused", model: "local", tokens: 1 }),
      },
    });
    expect(JSON.parse(embedCap.lines.join("\n"))).toEqual({
      vectors: [[0.1, 0.2]],
      model: "local",
      cached: true,
      dimensions: 384,
    });

    const generateCap = capture();
    await run(["generate", "Hello"], {
      ...generateCap.opts,
      client: {
        call: async () => health,
        embed: async () => ({ vectors: [[0.1]], model: "local", cached: false, dimensions: 1 }),
        generate: async () => ({ text: "Hi", model: "local", tokens: 2 }),
      },
    });
    expect(generateCap.lines).toEqual(["Hi"]);
  });

  test("local inference client resolves token binding before class token", async () => {
    const cap = capture();
    const container = null;
    container.bind({
      provide: INFERENCE_CLIENT_TOKEN,
      useValue: {
        call: async () => health,
        embed: async () => ({ vectors: [[0.3, 0.4]], model: "token-bound", cached: false, dimensions: 384 }),
        generate: async () => ({ text: "unused", model: "token-bound", tokens: 1 }),
      } as unknown as InferenceClient,
    });

    await run(["embed", "hello", "--json"], {
      ...cap.opts,
      container,
    });

    expect(cap.exitCode).toBeUndefined();
    expect(JSON.parse(cap.lines.join("\n"))).toEqual({
      vectors: [[0.3, 0.4]],
      model: "token-bound",
      cached: false,
      dimensions: 384,
    });
  });

  test("generate --json emits text, model, and token count from injected caller", async () => {
    const cap = capture();

    await run(["generate", "The capital of France is", "--json"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async () => ({ vectors: [[0.1]], model: "BAAI/bge-small-en-v1.5", cached: false, dimensions: 384 }),
          generate: async () => ({ text: "Paris", model: "Qwen2.5-0.5B-Instruct", tokens: 8 }),
        },
      },
    });

    expect(JSON.parse(cap.lines.join("\n"))).toEqual({
      text: "Paris",
      model: "Qwen2.5-0.5B-Instruct",
      tokens: 8,
    });
  });

  test("generate rejects malformed caller results instead of printing undefined", async () => {
    const cap = capture();

    await run(["generate", "The capital of France is"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async () => ({ vectors: [[0.1]], model: "BAAI/bge-small-en-v1.5", cached: false, dimensions: 384 }),
          generate: async () => ({ model: "broken" }),
        },
      },
    });

    expect(cap.exitCode).toBe(1);
    expect(cap.lines).toEqual([]);
    expect(cap.errors.join("\n")).toContain("fulcrum inference generate:");
  });

  test("generate --schema passes schema to injected caller and returns structured JSON", async () => {
    const cap = capture();
    let observedInput: unknown;
    const schema = '{"type":"object","properties":{"agent":{"type":"string"}},"required":["agent"]}';

    await run(["generate", "route this task", "--schema", schema, "--json"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async () => ({ vectors: [[0.1]], model: "BAAI/bge-small-en-v1.5", cached: false, dimensions: 384 }),
          generate: async (input: unknown) => {
            observedInput = input;
            return { text: '{"agent": "router"}', model: "Qwen2.5-0.5B-Instruct", tokens: 5 };
          },
        },
      },
    });

    expect(cap.exitCode).toBeUndefined();
    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload.text).toBe('{"agent": "router"}');
    expect(JSON.parse(payload.text)).toEqual({ agent: "router" });
    expect(observedInput).toEqual({
      prompt: "route this task",
      options: { schema: JSON.parse(schema) },
    });
  });

  test("generate --schema rejects invalid JSON schema value", async () => {
    const cap = capture();

    await run(["generate", "test", "--schema", "not-json"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async () => ({ vectors: [[0.1]], model: "BAAI/bge-small-en-v1.5", cached: false, dimensions: 384 }),
          generate: async () => ({ text: "unused", model: "m", tokens: 1 }),
        },
      },
    });

    expect(cap.exitCode).toBe(1);
    expect(cap.errors.join("\n")).toContain("--schema value must be valid JSON");
  });

  test("config list --json returns routing map via injected caller", async () => {
    const cap = capture();
    await run(["config", "list", "--json"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async () => ({ vectors: [[0.1]], model: "m", cached: false, dimensions: 1 }),
          generate: async () => ({ text: "x", model: "m", tokens: 1 }),
          config: {
            get: async () => ({ embeddings: "ollama", "router-llm": "embedded" }),
            set: async () => ({ ok: true }),
          },
        },
      } as never,
    });

    expect(cap.exitCode).toBeUndefined();
    expect(JSON.parse(cap.lines.join("\n"))).toEqual({
      embeddings: "ollama",
      "router-llm": "embedded",
    });
  });

  test("config list without --json prints human-readable output", async () => {
    const cap = capture();
    await run(["config", "list"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async () => ({ vectors: [[0.1]], model: "m", cached: false, dimensions: 1 }),
          generate: async () => ({ text: "x", model: "m", tokens: 1 }),
          config: {
            get: async () => ({ embeddings: "ollama" }),
            set: async () => ({ ok: true }),
          },
        },
      } as never,
    });

    expect(cap.exitCode).toBeUndefined();
    expect(cap.lines).toEqual(["embeddings: ollama"]);
  });

  test("config set updates routing via injected caller", async () => {
    const cap = capture();
    let observedInput: unknown;
    await run(["config", "set", "embeddings", "ollama"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async () => ({ vectors: [[0.1]], model: "m", cached: false, dimensions: 1 }),
          generate: async () => ({ text: "x", model: "m", tokens: 1 }),
          config: {
            get: async () => ({}),
            set: async (input: unknown) => { observedInput = input; return { ok: true }; },
          },
        },
      } as never,
    });

    expect(cap.exitCode).toBeUndefined();
    expect(observedInput).toEqual({ feature: "embeddings", backend: "ollama" });
    expect(cap.lines).toEqual(["embeddings: ollama"]);
  });

  test("config set errors without feature arg", async () => {
    const cap = capture();
    await run(["config", "set"], cap.opts);
    expect(cap.exitCode).toBe(1);
    expect(cap.errors.join("\n")).toContain("config set requires <feature>");
  });

  test("config set-provider sets env vars", async () => {
    const cap = capture();
    const origUrl = process.env["FULCRUM_INFERENCE_URL"];
    const origKey = process.env["FULCRUM_INFERENCE_API_KEY"];

    try {
      await run(["config", "set-provider", "--url", "https://api.openai.com/v1", "--key", "sk-test123"], cap.opts);
      expect(cap.exitCode).toBeUndefined();
      expect(cap.lines.join("\n")).toContain("provider configured");
      expect(process.env["FULCRUM_INFERENCE_URL"]).toBe("https://api.openai.com/v1");
      expect(process.env["FULCRUM_INFERENCE_API_KEY"]).toBe("sk-test123");
    } finally {
      if (origUrl === undefined) delete process.env["FULCRUM_INFERENCE_URL"];
      else process.env["FULCRUM_INFERENCE_URL"] = origUrl;
      if (origKey === undefined) delete process.env["FULCRUM_INFERENCE_API_KEY"];
      else process.env["FULCRUM_INFERENCE_API_KEY"] = origKey;
    }
  });

  test("config set-provider errors without --url", async () => {
    const cap = capture();
    await run(["config", "set-provider", "--key", "sk-test"], cap.opts);
    expect(cap.exitCode).toBe(1);
    expect(cap.errors.join("\n")).toContain("--url");
  });

  test("config test-provider --json returns flag disabled when flag off", async () => {
    const cap = capture();
    const origFeatures = process.env["FULCRUM_FEATURES"];
    delete process.env["FULCRUM_FEATURES"];

    try {
      await run(["config", "test-provider", "--json"], cap.opts);
      expect(cap.exitCode).toBeUndefined();
      const result = JSON.parse(cap.lines.join("\n"));
      expect(result.ok).toBe(false);
      expect(result.error).toContain("flag external-llm-provider disabled");
    } finally {
      if (origFeatures === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = origFeatures;
    }
  });

  test("stop confirms socket removal", async () => {
    const cap = capture();

    await run(["stop"], {
      ...cap.opts,
      lifecycle: {
        stop: async () => ({
          status: "stopped",
          pid: 42,
          socketPath: "/tmp/fulcrum/inference.sock",
          socketRemoved: true,
          pidFileRemoved: true,
        }),
      },
    });

    expect(cap.exitCode).toBeUndefined();
    expect(cap.lines.join("\n")).toContain("socket removed");
  });
});
