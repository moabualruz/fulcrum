import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, mock } from "bun:test";
import type { InferenceDashboardData } from "./+page.server";

let scratch: string;

function streamedData<T>(result: unknown): Promise<T> {
  const stream = (result as { streamed?: { data?: unknown } }).streamed?.data;
  expect(stream).toBeInstanceOf(Promise);
  return stream as Promise<T>;
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "fulcrum-web-inference-page-"));
  process.env["FULCRUM_HOME"] = scratch;
});

afterEach(() => {
  delete process.env["FULCRUM_HOME"];
  rmSync(scratch, { recursive: true, force: true });
});

describe("/inference +page.server.ts load()", () => {
  test("returns running=false and empty models when sidecar unreachable", async () => {
    // Mock inference-client to simulate unreachable sidecar
    mock.module("$lib/server/inference-client", () => ({
      getHealth: async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:8420"); },
      listModels: async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:8420"); },
    }));

    const mod = await import(`./+page.server.ts?cachebust=${Date.now()}`);
    const result = await mod.load({} as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<InferenceDashboardData>(result);

    expect(payload.running).toBe(false);
    expect(payload.models).toEqual([]);
    expect(payload.health).toBeNull();
  });

  test("returns running=true when sidecar healthy", async () => {
    mock.module("$lib/server/inference-client", () => ({
      getHealth: async () => ({
        status: "healthy",
        backends: [{ name: "embedded", status: "healthy", models_loaded: 1 }],
        cache: { embed_hit_rate: 0.9, gen_hit_rate: 0.8, db_size_bytes: 1024 },
      }),
      listModels: async () => [
        {
          id: "bge-small-en-v1.5",
          name: "bge-small-en-v1.5",
          size_bytes: 33_000_000,
          downloaded: true,
          capabilities: ["embed"],
        },
      ],
    }));

    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 1}`);
    const result = await mod.load({} as Parameters<typeof mod.load>[0]);
    const payload = await streamedData<InferenceDashboardData>(result);

    expect(payload.running).toBe(true);
    expect(payload.models).toHaveLength(1);
    expect(payload.models[0]?.id).toBe("bge-small-en-v1.5");
    expect(payload.health?.status).toBe("healthy");
  });

  test("setBackend action returns ok", async () => {
    const mod = await import(`./+page.server.ts?cachebust=${Date.now() + 2}`);
    const form = new FormData();
    form.set("backend", "ollama");
    form.set("host", "http://localhost:11434");
    const result = await mod.actions.setBackend({ request: { formData: async () => form } } as Parameters<typeof mod.actions.setBackend>[0]);
    expect(result).toBeTruthy();
  });
});
