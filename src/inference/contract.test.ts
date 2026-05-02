import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

import { InferenceClient } from "./client.ts";
import { InferenceLifecycle } from "./lifecycle.ts";

let scratch = "";
let lifecycle: InferenceLifecycle | undefined;

async function cargoAvailable(): Promise<boolean> {
  const proc = Bun.spawn(["cargo", "--version"], { stdout: "ignore", stderr: "ignore" });
  return (await proc.exited) === 0;
}

async function buildServer(): Promise<string> {
  const proc = Bun.spawn(["cargo", "build", "--manifest-path", "inference/Cargo.toml", "-p", "inference-server"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  expect(exitCode, stderr).toBe(0);
  return join(process.cwd(), "inference", "target", "debug", "inference-server");
}

beforeAll(async () => {
  scratch = await mkdtemp("/tmp/fulcrum-inference-contract-");
});

afterAll(async () => {
  await lifecycle?.stop();
  await rm(scratch, { recursive: true, force: true });
});

describe("real inference-server health contract", () => {
  test("InferenceClient health round-trips against the Rust sidecar", async () => {
    if (!(await cargoAvailable())) {
      console.warn("SKIP: cargo unavailable; inference-server contract not run");
      return;
    }

    const serverPath = await buildServer();
    lifecycle = new InferenceLifecycle({
      homeDir: join(scratch, ".fulcrum"),
      serverPath,
      readinessIntervalMs: 50,
      readinessTimeoutMs: 5000,
    });
    const client = new InferenceClient({ lifecycle, timeoutMs: 1000, retryDelaysMs: [20, 40, 80] });

    const result = await client.call("health", {});

    expect(result.status).toBe("ok");
    expect(result.backends).toEqual([]);
    expect(result.models).toEqual([]);
  }, 20_000);

  test("InferenceClient embed round-trips against Rust sidecar with deterministic test model", async () => {
    if (!(await cargoAvailable())) {
      console.warn("SKIP: cargo unavailable; inference-server contract not run");
      return;
    }

    const previousSkip = process.env["SKIP_MODEL_DOWNLOAD"];
    process.env["SKIP_MODEL_DOWNLOAD"] = "1";
    const serverPath = await buildServer();
    await lifecycle?.stop();
    lifecycle = new InferenceLifecycle({
      homeDir: join(scratch, ".fulcrum-embed"),
      serverPath,
      readinessIntervalMs: 50,
      readinessTimeoutMs: 5000,
    });
    const client = new InferenceClient({ lifecycle, timeoutMs: 1000, retryDelaysMs: [20, 40, 80] });

    try {
      const first = await client.embed(["alpha", "beta"]);
      const second = await client.embed(["alpha", "beta"]);

      expect(first.model).toBe("BAAI/bge-small-en-v1.5");
      expect(first.cached).toBe(false);
      expect(second.cached).toBe(true);
      expect(first.vectors).toHaveLength(2);
      expect(first.vectors[0]).toHaveLength(384);
      expect(first.vectors[0]).not.toEqual(first.vectors[1]);
      expect(second.vectors).toEqual(first.vectors);
    } finally {
      if (previousSkip === undefined) {
        delete process.env["SKIP_MODEL_DOWNLOAD"];
      } else {
        process.env["SKIP_MODEL_DOWNLOAD"] = previousSkip;
      }
    }
  }, 20_000);
});
