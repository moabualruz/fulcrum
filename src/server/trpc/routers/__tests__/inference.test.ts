import { Container } from "@needle-di/core";
import { describe, expect, test } from "bun:test";
import type { Session } from "better-auth";

import { InferenceClient } from "../../../../inference/client.ts";
import type {
  GenerateResult,
  HealthResult,
  ModelPullProgress,
} from "../../../../inference/protocol.ts";
import { run as runInferenceCli } from "../../../../cli/inference.ts";
import { createContext } from "../../../../trpc/context.ts";
import { appRouter } from "../../../../trpc/router.ts";
import { t } from "../../../../trpc/trpc.ts";
import { TuiApp } from "../../../../tui/index.ts";
import { FakeTTY } from "../../../../tui/testing/fake-tty.ts";
import { load as loadInferenceSettings } from "../../../../web/src/routes/settings/inference/+page.server.ts";

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
    provide: InferenceClient,
    useValue: {
      health: async () => health,
      embed: async (texts: string[]) => ({
        vectors: texts.map(() => [0.1, 0.2, 0.3]),
        model: "BAAI/bge-small-en-v1.5",
        cached: false,
      }),
      generate: async () => generateResult,
      classify: async () => ({
        results: [
          { label: "bug", score: 0.91 },
          { label: "docs", score: 0.09 },
        ],
      }),
      tokenize: async (text: string) => ({ count: text.split(/\s+/).filter(Boolean).length }),
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
    } satisfies Partial<InferenceClient> as unknown as InferenceClient,
  });
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

function createCaller(container = makeContainer(), authenticated = true) {
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
      .resolves.toEqual({
        results: [
          { label: "bug", score: 0.91 },
          { label: "docs", score: 0.09 },
        ],
      });
    await expect(caller.inference.tokenize({ text: "one two three" }))
      .resolves.toEqual({ count: 3 });
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
});
