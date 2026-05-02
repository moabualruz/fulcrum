import { afterEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TRPCError } from "@trpc/server";

import { t } from "../../src/trpc/trpc.ts";
import { appRouter } from "../../src/trpc/router.ts";
import { createContext } from "../../src/trpc/context.ts";
import { TuiApp, type TuiCaller } from "../../src/tui/index.ts";
import { TuiRouter } from "../../src/tui/router.ts";
import { SubscriptionBridge } from "../../src/tui/subscriptions.ts";
import { JsonlCrashLog } from "../../src/tui/crashlog.ts";
import { MemoryTelemetrySink } from "../../src/tui/telemetry.ts";
import { FakeTTY } from "../../src/tui/testing/fake-tty.ts";

const createCaller = t.createCallerFactory(appRouter);

function mockSession() {
  return {
    id: "sess-tui-foundation",
    userId: "user-tui",
    orgId: "org-tui",
    activeOrganizationId: "org-tui",
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    token: "tok-tui",
    ipAddress: null,
    userAgent: null,
  };
}

function fakeCaller(): TuiCaller {
  return {
    auth: {
      whoami: async () => ({
        userId: "user-tui",
        orgId: "org-tui",
        email: "tui@test.local",
        role: "owner",
      }),
    },
    flags: {
      list: async () => [],
      set: async () => ({ ok: true }),
    },
    tasks: {
      list: async () => [],
    },
  };
}

describe("TuiRouter", () => {
  it("navigates, goes back, bounds history at five entries, and falls back", () => {
    const router = new TuiRouter({
      routes: [
        { path: "/", screenKey: "root", title: "Root", render: () => "root" },
        { path: "/projects", screenKey: "projects", title: "Projects", render: () => "projects" },
        { path: "/tasks", screenKey: "tasks", title: "Tasks", render: () => "tasks" },
      ],
    });

    expect(router.current.screenKey).toBe("root");

    router.navigate("/projects");
    expect(router.current.screenKey).toBe("projects");
    expect(router.render()).toBe("projects");

    router.goBack();
    expect(router.current.screenKey).toBe("root");

    for (const path of ["/projects", "/tasks", "/projects", "/tasks", "/projects", "/tasks"]) {
      router.navigate(path);
    }
    expect(router.history).toHaveLength(5);

    router.navigate("/missing");
    expect(router.current.screenKey).toBe("not-found");
    expect(router.render()).toContain("Unknown route: /missing");
  });
});

describe("TuiApp foundation behavior", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("renders root, dispatches CreateItem from c, and exits on q", async () => {
    const tty = new FakeTTY();
    const actions: string[] = [];
    let exited = false;
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: fakeCaller(),
      actions: {
        CreateItem: () => {
          actions.push("CreateItem");
        },
      },
      onExit: () => {
        exited = true;
        app.stop();
      },
    });

    await app.mount();
    expect(tty.plainText()).toContain("Fulcrum");

    tty.inject("c");
    await Bun.sleep(1);
    expect(actions).toEqual(["CreateItem"]);

    tty.inject("q");
    await Bun.sleep(1);
    expect(exited).toBe(true);
    expect(app.isRunning).toBe(false);
  });

  it("writes telemetry per screen render", async () => {
    const telemetry = new MemoryTelemetrySink();
    const app = new TuiApp({
      output: new FakeTTY(),
      caller: fakeCaller(),
      telemetry,
    });

    await app.mount();
    await app.navigateTo("auth");

    expect(telemetry.rows.map((row) => row.screenKey)).toContain("nav");
    expect(telemetry.rows.map((row) => row.screenKey)).toContain("auth");
    expect(telemetry.rows.every((row) => row.renderMs >= 0)).toBe(true);
    app.stop();
  });

  it("renders fallback screen and writes crashlog when screen render throws", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "fulcrum-tui-crash-"));
    const crashLog = new JsonlCrashLog({ rootDir: tempDir });
    const tty = new FakeTTY();
    const app = new TuiApp({
      output: tty,
      caller: fakeCaller(),
      crashLog,
      routes: [
        {
          path: "/boom",
          screenKey: "boom",
          title: "Boom",
          render: () => {
            throw new Error("render exploded");
          },
        },
      ],
    });

    await app.mount();
    await app.navigatePath("/boom");

    expect(tty.plainText()).toContain("TUI error");

    const date = new Date().toISOString().slice(0, 10);
    const jsonl = await readFile(join(tempDir, "errors", `${date}.jsonl`), "utf8");
    expect(jsonl).toContain("render exploded");
    app.stop();
  });
});

describe("SubscriptionBridge", () => {
  it("delivers events, unsubscribes, and leaves no listeners after cycles", () => {
    const bus = new EventEmitter();
    const bridge = new SubscriptionBridge(bus);
    const received: number[] = [];

    const sub = bridge.subscribe<number>("runs.onRunUpdate", (value) => {
      received.push(value);
    });
    bus.emit("runs.onRunUpdate", 1);
    expect(received).toEqual([1]);

    sub.unsubscribe();
    bus.emit("runs.onRunUpdate", 2);
    expect(received).toEqual([1]);

    for (let i = 0; i < 1000; i++) {
      bridge.subscribe("runs.onRunUpdate", () => {}).unsubscribe();
    }
    expect(bus.listenerCount("runs.onRunUpdate")).toBe(0);
  });
});

describe("TUI in-process tRPC caller smoke", () => {
  it("tasks.list returns typed data with session and is forbidden without session", async () => {
    const authed = createCaller(
      createContext({
        session: mockSession() as unknown as import("better-auth").Session,
        orgId: "org-tui",
        userId: "user-tui",
        em: null,
        container: null,
      }),
    );
    await expect(authed.tasks.list()).resolves.toEqual([]);

    const bad = createCaller(
      createContext({
        session: null,
        orgId: null,
        userId: null,
        em: null,
        container: null,
      }),
    );

    let error: TRPCError | null = null;
    try {
      await bad.tasks.list();
    } catch (e) {
      if (e instanceof TRPCError) error = e;
    }
    expect(error?.code).toBe("UNAUTHORIZED");
  });
});
