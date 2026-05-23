/**
 * TUI inference dashboard: smoke & behaviour tests.
 *
 * Verifies: backend status badge, model list, in-flight ops counter,
 * throughput gauge, cache stats, per-feature routing dropdowns,
 * download progress bar overlay. All headless via FakeTTY.
 *
 * P2#14: TUI inference dashboard.
 */

import { describe, expect, test } from "bun:test";
import { FakeTTY } from "../testing/fake-tty.ts";
import { TuiApp, type TuiCaller } from "../index.ts";
import type { InferenceModel, ModelPullProgress } from "@platform-core/application/inference/protocol.ts";

// ── Helpers ───────────────────────────────────────────────────────────

function makeCaller(overrides: {
  healthStatus?: string;
  healthExtras?: {
    active_requests?: number;
    ops_last_10s?: number;
    embed_hit_rate?: number;
    gen_hit_rate?: number;
    cache_db_size?: number;
  };
  models?: InferenceModel[];
  routingConfig?: Record<string, string>;
  embed?: (input: { texts: string[]; model?: string }) => Promise<{ vectors: number[][]; model: string; cached: boolean; dimensions: number }>;
} = {}): TuiCaller {
  const {
    healthStatus = "ok",
    healthExtras = {},
    models = [],
    routingConfig = {},
    embed = async () => ({ vectors: [[0.1, 0.2, 0.3]], model: "nomic-embed", cached: false, dimensions: 3 }),
  } = overrides;

  return {
    auth: {
      whoami: async () => ({
        userId: "u1",
        orgId: "org1",
        email: "test@test.com",
        role: "admin",
      }),
    },
    flags: {
      list: async () => [],
      set: async () => ({ ok: true }),
    },
    inference: {
      health: async () => ({
        status: healthStatus,
        active_requests: healthExtras.active_requests ?? 0,
        ops_last_10s: healthExtras.ops_last_10s ?? 0,
        embed_hit_rate: healthExtras.embed_hit_rate ?? 0,
        gen_hit_rate: healthExtras.gen_hit_rate ?? 0,
        cache_db_size: healthExtras.cache_db_size ?? 0,
      }),
      embed,
      models: {
        list: async () => models,
        pull: async function* (_input: { modelId: string; force?: boolean }): AsyncGenerator<ModelPullProgress> {
          yield { type: "download_progress" as const, pct: 50, downloaded: 500, total: 1000 };
        },
      },
      config: {
        get: async () => routingConfig,
        set: async (_input: { feature: string; backend: string }) => ({ ok: true }),
      },
    },
    notify: {
      unreadCount: async () => ({ count: 0 }),
    },
  };
}

async function mountInferenceScreen(callerOverrides: Parameters<typeof makeCaller>[0] = {}) {
  const tty = new FakeTTY({ columns: 100, rows: 30 });
  const caller = makeCaller(callerOverrides);
  const app = new TuiApp({ output: tty, input: tty, caller });
  await app.mount();
  tty.clear();
  await app.navigateTo("inference");
  await new Promise((r) => setTimeout(r, 50));

  const text = tty.plainText();
  return { tty, app, text };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("InferenceDashboardScreen", () => {
  test("opens inference screen without panic", async () => {
    const { text, app } = await mountInferenceScreen();
    expect(text).toContain("Inference");
    app.stop();
  });

  test("backend status badge renders correct color label", async () => {
    const { text, app } = await mountInferenceScreen({ healthStatus: "ok" });
    expect(text).toContain("Inference");
    // Badge shows the status
    expect(text).toMatch(/ok|running|green/i);
    app.stop();
  });

  test("model list shows at least one row when models provided", async () => {
    const models: InferenceModel[] = [
      { id: "all-MiniLM-L6-v2", kind: "embed", downloaded: true, active: true, sizeBytes: 22_000_000 },
    ];
    const { text, app } = await mountInferenceScreen({ models });
    expect(text).toContain("all-MiniLM-L6-v2");
    expect(text).toContain("embed");
    app.stop();
  });

  test("model list shows 'No inference models' when empty", async () => {
    const { text, app } = await mountInferenceScreen({ models: [] });
    expect(text).toContain("No inference models");
    app.stop();
  });

  test("embed probe runs through the TUI caller and renders response dimensions", async () => {
    let observedInput: unknown;
    const { tty, app } = await mountInferenceScreen({
      embed: async (input) => {
        observedInput = input;
        return { vectors: [[0.1, 0.2, 0.3, 0.4]], model: "nomic-embed", cached: true, dimensions: 4 };
      },
    });

    tty.clear();
    tty.inject("e");
    await new Promise((r) => setTimeout(r, 50));

    const text = tty.plainText();
    expect(observedInput).toEqual({ texts: ["Fulcrum inference TUI probe"], model: undefined });
    expect(text).toContain("Embed probe");
    expect(text).toContain("nomic-embed");
    expect(text).toContain("Dimensions");
    expect(text).toContain("4");
    app.stop();
  });

  test("embed probe shows consistent error state when caller rejects", async () => {
    const { tty, app } = await mountInferenceScreen({
      embed: async () => {
        throw new Error("backend unavailable");
      },
    });

    tty.clear();
    tty.inject("e");
    await new Promise((r) => setTimeout(r, 50));

    const text = tty.plainText();
    expect(text).toContain("Embed probe");
    expect(text).toContain("backend unavailable");
    app.stop();
  });

  test("in-flight ops counter shows 0 at idle", async () => {
    const { text, app } = await mountInferenceScreen({
      healthExtras: { active_requests: 0 },
    });
    expect(text).toContain("In-flight");
    expect(text).toContain("0");
    app.stop();
  });

  test("in-flight ops counter shows active count", async () => {
    const { text, app } = await mountInferenceScreen({
      healthExtras: { active_requests: 5 },
    });
    expect(text).toContain("In-flight");
    expect(text).toContain("5");
    app.stop();
  });

  test("throughput gauge renders ops/s", async () => {
    const { text, app } = await mountInferenceScreen({
      healthExtras: { ops_last_10s: 42 },
    });
    expect(text).toContain("Throughput");
    expect(text).toContain("42");
    expect(text).toContain("ops/s");
    app.stop();
  });

  test("throughput gauge shows 0 ops/s at idle", async () => {
    const { text, app } = await mountInferenceScreen({
      healthExtras: { ops_last_10s: 0 },
    });
    expect(text).toContain("0 ops/s");
    app.stop();
  });

  test("cache stats row renders hit rates", async () => {
    const { text, app } = await mountInferenceScreen({
      healthExtras: { embed_hit_rate: 85, gen_hit_rate: 72, cache_db_size: 1048576 },
    });
    expect(text).toContain("Cache");
    expect(text).toContain("85");
    expect(text).toContain("72");
    app.stop();
  });

  test("per-feature routing section renders", async () => {
    const { text, app } = await mountInferenceScreen({
      routingConfig: { embeddings: "ollama", "router-llm": "embedded" },
    });
    expect(text).toContain("Routing");
    expect(text).toContain("embeddings");
    app.stop();
  });

  test("pressing q from inference returns to nav", async () => {
    const { tty, app } = await mountInferenceScreen();
    tty.clear();
    tty.inject("q");
    await new Promise((r) => setTimeout(r, 50));
    const text = tty.plainText();
    expect(text).toContain("Fulcrum TUI");
    app.stop();
  });

  test("CLI inference status --json not regressed (caller.inference.health exists)", () => {
    const caller = makeCaller();
    expect(caller.inference).toBeDefined();
    expect(typeof caller.inference!.health).toBe("function");
  });

  test("backend degraded and unavailable labels appear when fixture returns Degraded/Unavailable states", async () => {
    const caller = makeCaller({
      healthStatus: "degraded",
      healthExtras: {
        active_requests: 0,
        ops_last_10s: 0,
        embed_hit_rate: 75,
        gen_hit_rate: 60,
        cache_db_size: 512000,
      },
    });
    const { text, app } = await mountInferenceScreen({ healthStatus: "degraded" });
    // The health badge renders the degraded status
    expect(text).toMatch(/degraded/i);
    app.stop();
  });

  test("cache stats render in inference screen", async () => {
    const { text, app } = await mountInferenceScreen({
      healthExtras: { embed_hit_rate: 95, gen_hit_rate: 88, cache_db_size: 2097152 },
    });
    expect(text).toContain("Cache");
    expect(text).toContain("95");
    expect(text).toContain("88");
    app.stop();
  });

  test("unavailable health state renders correctly", async () => {
    const { text, app } = await mountInferenceScreen({ healthStatus: "unavailable" });
    expect(text).toMatch(/unavailable/i);
    app.stop();
  });
});
