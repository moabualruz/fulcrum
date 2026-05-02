import { describe, expect, test } from "bun:test";

import { run } from "./inference.ts";
import type { HealthResult } from "../inference/protocol.ts";

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
          embed: async () => ({ vectors: [[0.1]], model: "BAAI/bge-small-en-v1.5", cached: false }),
          generate: async () => ({ text: "Paris", model: "Qwen2.5-0.5B-Instruct", tokens: 8 }),
        },
      },
    });

    const payload = JSON.parse(cap.lines.join("\n"));
    expect(payload.status).toBe("ok");
    expect(payload.cache).toEqual(cache);
  });

  test("embed --json emits vectors, model, and cached from tRPC caller", async () => {
    const cap = capture();

    await run(["embed", "hello", "--json"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async () => ({ vectors: [[0.1, 0.2]], model: "BAAI/bge-small-en-v1.5", cached: false }),
          generate: async () => ({ text: "Paris", model: "Qwen2.5-0.5B-Instruct", tokens: 8 }),
        },
      },
    });

    expect(JSON.parse(cap.lines.join("\n"))).toEqual({
      vectors: [[0.1, 0.2]],
      model: "BAAI/bge-small-en-v1.5",
      cached: false,
    });
  });

  test("generate --json emits text, model, and token count from tRPC caller", async () => {
    const cap = capture();

    await run(["generate", "The capital of France is", "--json"], {
      ...cap.opts,
      caller: {
        inference: {
          health: async () => health,
          embed: async () => ({ vectors: [[0.1]], model: "BAAI/bge-small-en-v1.5", cached: false }),
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
