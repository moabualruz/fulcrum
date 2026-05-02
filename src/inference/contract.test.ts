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
});
