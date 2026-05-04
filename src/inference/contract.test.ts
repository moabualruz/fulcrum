import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import net from "node:net";

import { InferenceClient } from "./client.ts";
import { InferenceLifecycle } from "./lifecycle.ts";

let scratch = "";
let lifecycle: InferenceLifecycle | undefined;

async function cargoAvailable(): Promise<boolean> {
  const proc = Bun.spawn(["cargo", "--version"], { stdout: "ignore", stderr: "ignore" });
  return (await proc.exited) === 0;
}

async function unixSocketsAvailable(): Promise<boolean> {
  const socketPath = join(scratch, `probe-${Date.now()}.sock`);
  const server = net.createServer();
  let listening = false;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => {
        listening = true;
        resolve();
      });
    });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return false;
    throw error;
  } finally {
    if (listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await rm(socketPath, { force: true });
  }
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
    if (!(await unixSocketsAvailable())) {
      console.warn("SKIP: Unix sockets unavailable in sandbox; inference-server contract not run");
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
    // models list reflects models.toml; assert it is an array (length may vary)
    expect(Array.isArray(result.models)).toBe(true);
  }, 20_000);

  test("InferenceClient embed round-trips against Rust sidecar with deterministic test model", async () => {
    if (!(await cargoAvailable())) {
      console.warn("SKIP: cargo unavailable; inference-server contract not run");
      return;
    }
    if (!(await unixSocketsAvailable())) {
      console.warn("SKIP: Unix sockets unavailable in sandbox; inference-server contract not run");
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

  test("InferenceClient classify and tokenize round-trip against Rust sidecar", async () => {
    if (!(await cargoAvailable())) {
      console.warn("SKIP: cargo unavailable; inference-server contract not run");
      return;
    }
    if (!(await unixSocketsAvailable())) {
      console.warn("SKIP: Unix sockets unavailable in sandbox; inference-server contract not run");
      return;
    }

    const previousSkip = process.env["SKIP_MODEL_DOWNLOAD"];
    process.env["SKIP_MODEL_DOWNLOAD"] = "1";
    const serverPath = await buildServer();
    await lifecycle?.stop();
    lifecycle = new InferenceLifecycle({
      homeDir: join(scratch, ".fulcrum-classify-tokenize"),
      serverPath,
      readinessIntervalMs: 50,
      readinessTimeoutMs: 5000,
    });
    const client = new InferenceClient({ lifecycle, timeoutMs: 1000, retryDelaysMs: [20, 40, 80] });

    try {
      const classified = await client.classify("buy groceries", ["task", "question", "reminder"]);
      const tokenized = await client.tokenize("hello world");

      expect(classified).toHaveLength(3);
      expect(classified.every((item) => typeof item.label === "string" && typeof item.score === "number")).toBe(true);
      expect(classified).toEqual([...classified].sort((a, b) => b.score - a.score));
      expect(tokenized.count).toBe(tokenized.tokens.length);
      expect(tokenized.tokens).toContain("hello");
      expect(tokenized.tokens).toContain("world");
    } finally {
      if (previousSkip === undefined) {
        delete process.env["SKIP_MODEL_DOWNLOAD"];
      } else {
        process.env["SKIP_MODEL_DOWNLOAD"] = previousSkip;
      }
    }
  }, 20_000);
});
