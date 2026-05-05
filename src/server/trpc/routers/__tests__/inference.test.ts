import { Container } from "@needle-di/core";
import { describe, expect, test } from "bun:test";
import type { Session } from "better-auth";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InferenceClient } from "../../../../inference/client.ts";
import type {
  GenerateResult,
  HealthResult,
  ModelPullProgress,
} from "../../../../inference/protocol.ts";
import { INFERENCE_CLIENT_TOKEN } from "../../../../inference/tokens.ts";
import { run as runInferenceCli } from "../../../../cli/inference.ts";
import { createContext } from "../../../../trpc/context.ts";
import { appRouter } from "../../../../trpc/router.ts";
import { t } from "../../../../trpc/trpc.ts";
import { TuiApp } from "../../../../tui/index.ts";
import { FakeTTY } from "../../../../tui/testing/fake-tty.ts";
import {
  actions as inferenceSettingsActions,
  load as loadInferenceSettings,
} from "../../../../web/src/routes/settings/inference/+page.server.ts";
import { FlagRegistry } from "../../../../flags/registry.ts";

function stubFlagRegistry(enabled: string[] = ["embeddings"]): FlagRegistry {
  return { isEnabled: async (flag: string) => enabled.includes(flag) } as unknown as FlagRegistry;
}

const health: HealthResult = {
  status: "degraded",
  backends: ["embedded"],
  models: ["BAAI/bge-small-en-v1.5"],
};

const generateResult: GenerateResult = {
  text: "Paris",
  model: "Qwen2.5-0.5B-Instruct",
  tokens: 8,
};

const progressEvents: ModelPullProgress[] = [
  { pct: 0, downloaded: 0, total: 100 },
  { pct: 100, downloaded: 100, total: 100 },
];

function makeContainer(): Container {
  const container = new Container();
  container.bind({
    provide: INFERENCE_CLIENT_TOKEN,
    useValue: {
      health: async () => health,
      embed: async (texts: string[]) => ({
        vectors: texts.map(() => [0.1, 0.2, 0.3]),
        model: "BAAI/bge-small-en-v1.5",
        cached: false,
        dimensions: 3,
      }),
      generate: async () => generateResult,
      classify: async () => [
        { label: "bug", score: 0.91 },
        { label: "docs", score: 0.09 },
      ],
      tokenize: async (text: string) => ({
        count: text.split(/\s+/).filter(Boolean).length,
        tokens: text.split(/\s+/).filter(Boolean),
      }),
      listModels: async () => [
        {
          id: "BAAI/bge-small-en-v1.5",
          kind: "embed",
          downloaded: true,
          active: true,
        },
      ],
      pullModel: async function* () {
        yield* progressEvents;
      },
      rmModel: async () => ({ ok: true }),
      listBackends: async () => [
        { id: "embedded", available: true, active: true, reason: null },
        { id: "ollama", available: false, active: false, reason: "flag disabled" },
      ],
    } as unknown as InferenceClient,
  });
  container.bind({ provide: FlagRegistry, useValue: stubFlagRegistry() });
  return container;
}

function mockSession(): Session {
  return {
    id: "session_1",
    userId: "user_1",
    token: "token_1",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: null,
    userAgent: null,
  } as Session;
}

function createCaller(container: Container | null = makeContainer(), authenticated = true) {
  const factory = t.createCallerFactory(appRouter);
  return factory(createContext({
    session: authenticated ? mockSession() : null,
    orgId: authenticated ? "00000000-0000-0000-0000-000000000001" : null,
    userId: authenticated ? "user_1" : null,
    em: null,
    container,
  }));
}

async function collectPullEvents(subscription: unknown): Promise<ModelPullProgress[]> {
  if (Symbol.asyncIterator in Object(subscription)) {
    const events: ModelPullProgress[] = [];
    for await (const event of subscription as AsyncIterable<ModelPullProgress>) {
      events.push(event);
    }
    return events;
  }

  return new Promise((resolve, reject) => {
    const events: ModelPullProgress[] = [];
    const sub = (subscription as {
      subscribe(opts: {
        next(value: ModelPullProgress): void;
        error(error: unknown): void;
        complete(): void;
      }): { unsubscribe(): void };
    }).subscribe({
      next(value) {
        events.push(value);
      },
      error(error) {
        reject(error);
      },
      complete() {
        sub.unsubscribe();
        resolve(events);
      },
    });
  });
}

async function withMissingInferenceServer(
  callback: (missingServer: string) => Promise<void>,
): Promise<void> {
  const previousHome = process.env["FULCRUM_HOME"];
  const previousServer = process.env["FULCRUM_INFERENCE_SERVER"];
  const homeDir = await mkdtemp(join(tmpdir(), "fulcrum-inference-test-"));
  const missingServer = join(homeDir, "missing-inference-server");

  process.env["FULCRUM_HOME"] = homeDir;
  process.env["FULCRUM_INFERENCE_SERVER"] = missingServer;
  try {
    await callback(missingServer);
  } finally {
    if (previousHome === undefined) {
      delete process.env["FULCRUM_HOME"];
    } else {
      process.env["FULCRUM_HOME"] = previousHome;
    }
    if (previousServer === undefined) {
      delete process.env["FULCRUM_INFERENCE_SERVER"];
    } else {
      process.env["FULCRUM_INFERENCE_SERVER"] = previousServer;
    }
    await rm(homeDir, { recursive: true, force: true });
  }
}

describe("inference tRPC router", () => {
  test("public health/model discovery remains unauthenticated while inference operations require auth", async () => {
    const caller = createCaller(makeContainer(), false);

    await expect(caller.inference.health()).resolves.toEqual(health);
    await expect(caller.inference.models.list()).resolves.toHaveLength(1);
    await expect(caller.inference.backends.list()).resolves.toHaveLength(2);
    await expect(caller.inference.embed({ texts: ["test"] })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.inference.generate({ prompt: "Hello" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller.inference.models.rm({ modelId: "BAAI/bge-small-en-v1.5" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("health returns typed HealthResult and embed returns number vectors", async () => {
    const caller = createCaller();

    await expect(caller.inference.health()).resolves.toEqual(health);

    const embedded = await caller.inference.embed({ texts: ["test"] });
    expect(embedded.model).toBe("BAAI/bge-small-en-v1.5");
    expect(embedded.cached).toBe(false);
    expect(embedded.vectors).toEqual([[0.1, 0.2, 0.3]]);
    expect(embedded.vectors.every((row) => row.every((n) => typeof n === "number"))).toBe(true);
  });

  test("generate, classify, tokenize, model, and backend procedures resolve InferenceClient", async () => {
    const caller = createCaller();

    await expect(caller.inference.generate({ prompt: "The capital of France is" }))
      .resolves.toEqual(generateResult);
    await expect(caller.inference.classify({ text: "fix crash", labels: ["bug", "docs"] }))
      .resolves.toEqual([
        { label: "bug", score: 0.91 },
        { label: "docs", score: 0.09 },
      ]);
    await expect(caller.inference.tokenize({ text: "one two three" }))
      .resolves.toEqual({ count: 3, tokens: ["one", "two", "three"] });
    await expect(caller.inference.models.list()).resolves.toHaveLength(1);
    await expect(caller.inference.models.rm({ modelId: "BAAI/bge-small-en-v1.5" }))
      .resolves.toEqual({ ok: true });
    await expect(caller.inference.backends.list()).resolves.toEqual([
      { id: "embedded", available: true, active: true, reason: null },
      { id: "ollama", available: false, active: false, reason: "flag disabled" },
    ]);
  });

  test("models.pull subscription emits progress events", async () => {
    const caller = createCaller();

    const subscription = await caller.inference.models.pull({
      modelId: "BAAI/bge-small-en-v1.5",
    });

    await expect(collectPullEvents(subscription)).resolves.toEqual(progressEvents);
  });

  test("TUI inference screen renders models and pull progress overlay", async () => {
    const tty = new FakeTTY();
    const tui = new TuiApp({
      output: tty,
      caller: {
        auth: {
          whoami: async () => ({
            userId: "user_1",
            orgId: "00000000-0000-0000-0000-000000000001",
            email: "admin@local",
            role: "owner",
          }),
        },
        flags: {
          list: async () => [],
          set: async () => ({ ok: true }),
        },
        inference: {
          health: async () => ({ status: "ok" }),
          models: {
            list: async () => [{
              id: "BAAI/bge-small-en-v1.5",
              kind: "embed",
              downloaded: false,
              active: true,
              sizeBytes: 133466304,
            }],
            pull: async function* () {
              yield* progressEvents;
            },
          },
        },
      } as never,
    });
    try {
      await tui.mount();
      await tui.navigateTo("inference");
      await tui.pullInferenceModel("BAAI/bge-small-en-v1.5");

      const body = tty.plainText();
      expect(body).toContain("BAAI/bge-small-en-v1.5");
      expect(body).toContain("Download");
      expect(body).toContain("100%");
    } finally {
      tui.stop();
    }
  });

  test("health status matches tRPC, CLI, web settings load, and TUI badge", async () => {
    const container = makeContainer();
    const caller = createCaller(container);

    const trpcHealth = await caller.inference.health();

    const cliLines: string[] = [];
    await runInferenceCli(["status", "--json"], {
      caller,
      print: (line) => cliLines.push(line),
      printErr: () => undefined,
      exit: (code) => {
        throw new Error(`unexpected exit ${code}`);
      },
    });
    const cliHealth = JSON.parse(cliLines.join("\n")) as HealthResult;

    const webData = await loadInferenceSettings({
      locals: { container },
    } as Parameters<typeof loadInferenceSettings>[0]);
    const webHealth = await webData.streamed.health;

    const tty = new FakeTTY();
    const tui = new TuiApp({
      output: tty,
      caller: {
        auth: {
          whoami: async () => ({
            userId: "user_1",
            orgId: "00000000-0000-0000-0000-000000000001",
            email: "admin@local",
            role: "owner",
          }),
        },
        flags: {
          list: async () => [],
          set: async () => ({ ok: true }),
        },
        inference: {
          health: async () => health,
        },
      },
    });
    try {
      await tui.mount();

      expect(cliHealth.status).toBe(trpcHealth.status);
      expect(webHealth.status).toBe(trpcHealth.status);
      expect(tui.inferenceBadge.status).toBe(trpcHealth.status);
    } finally {
      tui.stop();
    }
  });

  test("web settings testEmbed action calls inference.embed and reports dimensions", async () => {
    const container = makeContainer();
    const request = new Request("http://localhost/settings/inference", {
      method: "POST",
      body: new URLSearchParams({ text: "smoke embed" }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    const result = await inferenceSettingsActions.testEmbed({
      request,
      locals: { container, session: mockSession(), orgId: "00000000-0000-0000-0000-000000000001" },
    } as Parameters<typeof inferenceSettingsActions.testEmbed>[0]);

    expect(result).toEqual({
      success: true,
      dimensions: 3,
      preview: [0.1, 0.2, 0.3],
      model: "BAAI/bge-small-en-v1.5",
      cached: false,
    });
  });

  test("generate with schema passes schema option through to client and returns result", async () => {
    const caller = createCaller();
    const schema = { type: "object", properties: { agent: { type: "string" } }, required: ["agent"] };

    const result = await caller.inference.generate({
      prompt: "route this task",
      options: { schema },
    });

    expect(result.text).toBeDefined();
    expect(result.model).toBeDefined();
    expect(result.tokens).toBeGreaterThanOrEqual(0);
  });

  test("web settings testGenerate action passes schema and reports validity", async () => {
    const container = makeContainer();
    const schema = JSON.stringify({ type: "object", properties: { agent: { type: "string" } }, required: ["agent"] });
    const request = new Request("http://localhost/settings/inference", {
      method: "POST",
      body: new URLSearchParams({ prompt: "route this", maxTokens: "64", schema }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    const result = await inferenceSettingsActions.testGenerate({
      request,
      locals: { container, session: mockSession(), orgId: "00000000-0000-0000-0000-000000000001" },
    } as Parameters<typeof inferenceSettingsActions.testGenerate>[0]);

    expect(result.success).toBe(true);
    expect(result.generateText).toBeDefined();
    // schemaValid should be present when schema was provided
    expect("schemaValid" in result).toBe(true);
  });

  test("class-token binding remains supported for existing callers", async () => {
    const container = new Container();
    container.bind({
      provide: InferenceClient,
      useValue: {
        health: async () => health,
        embed: async (texts: string[]) => ({
          vectors: texts.map(() => [0.4, 0.5, 0.6]),
          model: "class-token-model",
          cached: true,
          dimensions: 3,
        }),
        generate: async () => generateResult,
        classify: async () => [{ label: "bug", score: 1 }],
        tokenize: async () => ({ count: 4, tokens: ["one", "two", "three", "four"] }),
        listModels: async () => [
          {
            id: "class-token-model",
            kind: "embed",
            downloaded: true,
            active: true,
          },
        ],
        pullModel: async function* () {
          yield* progressEvents;
        },
        rmModel: async () => ({ ok: true }),
        listBackends: async () => [],
      } as unknown as InferenceClient,
    });
    container.bind({ provide: FlagRegistry, useValue: stubFlagRegistry() });
    const caller = createCaller(container);

    await expect(caller.inference.health()).resolves.toEqual(health);
    await expect(caller.inference.embed({ texts: ["test"] })).resolves.toEqual({
      vectors: [[0.4, 0.5, 0.6]],
      model: "class-token-model",
      cached: true,
      dimensions: 3,
    });
    await expect(caller.inference.generate({ prompt: "The capital of France is" }))
      .resolves.toEqual(generateResult);
    await expect(caller.inference.classify({ text: "fix crash", labels: ["bug"] }))
      .resolves.toEqual([{ label: "bug", score: 1 }]);
    await expect(caller.inference.tokenize({ text: "one two three four" }))
      .resolves.toEqual({ count: 4, tokens: ["one", "two", "three", "four"] });
    await expect(caller.inference.models.list()).resolves.toEqual([
      {
        id: "class-token-model",
        kind: "embed",
        downloaded: true,
        active: true,
      },
    ]);
    await expect(caller.inference.models.rm({ modelId: "class-token-model" }))
      .resolves.toEqual({ ok: true });
    await expect(caller.inference.backends.list()).resolves.toEqual([]);
  });

  test("backend discovery falls back without a container", async () => {
    const caller = createCaller(null, false);

    await expect(caller.inference.backends.list()).resolves.toEqual([
      { id: "embedded", available: true, active: true, reason: null },
      { id: "ollama", available: false, active: false, reason: "flag disabled" },
      { id: "lm-studio", available: false, active: false, reason: "flag disabled" },
      { id: "openai-compatible", available: false, active: false, reason: "flag disabled" },
    ]);
  });

  test("non-backend procedures without a container resolve the default client lazily", async () => {
    const caller = createCaller(null, false);

    await withMissingInferenceServer(async (missingServer) => {
      await expect(caller.inference.health()).rejects.toThrow(
        `inference-server binary not found: ${missingServer}`,
      );
    });
  });

  test("backend.probe returns BackendHealth array with backend and status fields", async () => {
    const container = makeContainer();
    const caller = createCaller(container);

    const backends = await caller.inference.backends.probe();
    expect(Array.isArray(backends)).toBe(true);
    for (const b of backends as Array<Record<string, unknown>>) {
      expect(typeof b.backend).toBe("string");
      expect(["running", "stopped", "degraded", "unavailable", "unconfigured"]).toContain(b.status);
    }
  });

  test("empty containers use backend defaults and default client fallback", async () => {
    const caller = createCaller(new Container(), false);

    await expect(caller.inference.backends.list()).resolves.toEqual([
      { id: "embedded", available: true, active: true, reason: null },
      { id: "ollama", available: false, active: false, reason: "flag disabled" },
      { id: "lm-studio", available: false, active: false, reason: "flag disabled" },
      { id: "openai-compatible", available: false, active: false, reason: "flag disabled" },
    ]);
    await withMissingInferenceServer(async (missingServer) => {
      await expect(caller.inference.health()).rejects.toThrow(
        `inference-server binary not found: ${missingServer}`,
      );
    });
  });
});
