import { afterAll, afterEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { TRPCError } from "@trpc/server";
import { t } from "@fulcrum/server/trpc/trpc.ts";
import { appRouter } from "@fulcrum/server/trpc/router.ts";
import { createContext } from "@fulcrum/server/trpc/context.ts";
import { buildCaller, TuiApp, type TuiCaller } from "@fulcrum/tui/index.ts";
import { TuiRouter } from "@fulcrum/tui/router.ts";
import { Renderer } from "@fulcrum/tui/renderer.ts";
import { SubscriptionBridge } from "@fulcrum/tui/subscriptions.ts";
import { JsonlCrashLog } from "@fulcrum/tui/crashlog.ts";
import { DbTelemetrySink, MemoryTelemetrySink } from "@fulcrum/tui/telemetry.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";
import {
  BOOT_SPLASH_SUBTITLE,
  BOOT_SPLASH_TITLE,
  FOUNDATION_KEY_BINDINGS,
  SELECTED_ROW_FOCUS_MARKER,
  formatFocusedRowLabel,
  renderBootSplash,
} from "@fulcrum/tui/screens/tui-foundation.ts";
import { Org, User } from "@identity-access/infrastructure/database/entities/auth/index.ts";
import { Account } from "@identity-access/infrastructure/database/entities/auth/Account.ts";
import { TelemetryEvent } from "@platform-core/infrastructure/application-database/entities/platform/TelemetryEvent.ts";
import { createTestOrm, destroyTestOrm, type TestOrm } from "@test-support/application-database.ts";
import { createTestContainer } from "@test-support/application-container.ts";

const createCaller = t.createCallerFactory(appRouter);

afterAll(async () => {
  await destroyTestOrm();
});

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

function testContainer(db: TestOrm) {
  return createTestContainer(db);
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

  it("renders boot splash before launcher nav", async () => {
    const tty = new FakeTTY({ columns: 24, rows: 8 });
    const app = new TuiApp({
      output: tty,
      caller: fakeCaller(),
    });

    await app.mount();

    const text = tty.plainText();
    expect(text).toContain(BOOT_SPLASH_TITLE);
    expect(text).toContain(BOOT_SPLASH_SUBTITLE);
    expect(text.indexOf(BOOT_SPLASH_SUBTITLE)).toBeLessThan(text.indexOf("Domain nav"));
    app.stop();
  });

  it("keeps boot splash title visible on narrow terminals", () => {
    const tty = new FakeTTY({ columns: 8, rows: 6 });
    renderBootSplash(new Renderer(tty));

    expect(tty.plainText()).toContain(BOOT_SPLASH_TITLE);
  });

  it("publishes foundation vim keybinding help", () => {
    expect(FOUNDATION_KEY_BINDINGS.map((binding) => binding.key)).toEqual([
      "j/k",
      "Enter/Space",
      "?",
      "Esc",
      "q",
      "t",
    ]);
  });

  it("handles help, open/select, escape, and q as foundation keys", async () => {
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: {
        ...fakeCaller(),
        projects: { list: async () => [{ id: "proj-1", name: "Roadmap" }] },
      },
    });

    await app.mount();
    tty.inject("?");
    await Bun.sleep(0);
    expect(tty.plainText()).toContain("Launcher");
    expect(tty.plainText()).toContain("Enter/Space");

    tty.inject("\x1b");
    await Bun.sleep(0);
    tty.inject(" ");
    await Bun.sleep(0);
    expect(tty.plainText()).toContain("Projects");

    tty.inject("q");
    await Bun.sleep(0);
    expect(app.screen).toBe("nav");
    expect(tty.plainText()).toContain("Domain nav");
    app.stop();
  });

  it("renders selected nav row with durable focus marker", async () => {
    const tty = new FakeTTY({ columns: 80, rows: 24 });
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: fakeCaller(),
    });

    await app.mount();
    expect(tty.plainText()).toContain(`${SELECTED_ROW_FOCUS_MARKER} Projects`);

    tty.inject("j");
    await Bun.sleep(0);
    // Domain nav order: Projects → Build Board → Tasks. One 'j' moves to Build Board.
    expect(tty.plainText()).toContain(`${SELECTED_ROW_FOCUS_MARKER} Build Board`);
    app.stop();
  });

  it("formats focused rows with marker independent of ANSI color", () => {
    expect(formatFocusedRowLabel("Projects", true)).toContain(`${SELECTED_ROW_FOCUS_MARKER} `);
    expect(formatFocusedRowLabel("Projects", false)).not.toContain(SELECTED_ROW_FOCUS_MARKER);
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

  it("production caller resolves local seeded session, org name, passkeys, and flags from DB context", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const user = await em.findOneOrFail(User, { where: { id: db.seed.userId } });
      await em.getRepository(Account).save({
        userId: user.id,
        providerId: "passkey",
        accountId: "credential-a",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const caller = await buildCaller(testContainer(db));
      const whoami = await caller.auth.whoami();

      expect(whoami.userId).toBe(db.seed.userId);
      expect(whoami.orgId).toBe(db.seed.orgId);
      expect(whoami.email).toBe("admin@local");
      expect(whoami.orgName).toBe("Local");
      expect(whoami.passkeyCount).toBe(1);
      await expect(caller.flags.list()).resolves.toEqual(expect.any(Array));
    } finally {
      await db.close();
    }
  });

  it("status footer and auth screen render local org name from production caller", async () => {
    const db = await createTestOrm();
    try {
      const tty = new FakeTTY();
      const app = new TuiApp({
        output: tty,
        caller: await buildCaller(testContainer(db)),
      });

      await app.mount();
      await app.waitForStartupData();
      // OD StatusFooter renders the org name as the `profile:` segment; it
      // drops the legacy user email: prd-tui-status-footer-od-parity.
      expect(tty.plainText()).toContain("profile: Local");
      expect(tty.plainText()).not.toContain("admin@local");

      tty.clear();
      await app.navigateTo("auth");
      expect(tty.plainText()).toContain("Local");
      expect(tty.plainText()).toContain("0 passkeys enrolled");
      app.stop();
    } finally {
      await db.close();
    }
  });

  it("DB telemetry sink inserts a telemetry_events row per render", async () => {
    const db = await createTestOrm();
    try {
      const em = db.em;
      const org = await em.findOneOrFail(Org, { where: { id: db.seed.orgId } });
      const user = await em.findOneOrFail(User, { where: { id: db.seed.userId } });
      const app = new TuiApp({
        output: new FakeTTY(),
        caller: await buildCaller(testContainer(db)),
        telemetry: new DbTelemetrySink({ em, org, user }),
      });

      await app.mount();
      await app.navigateTo("auth");

      const rows = await em.find(TelemetryEvent, { where: { org: { id: org.id } } });
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.kind)).toEqual(["local_telemetry", "local_telemetry"]);
      expect(rows.map((row) => row.payload["screen_key"])).toContain("nav");
      expect(rows.map((row) => row.payload["screen_key"])).toContain("auth");
      app.stop();
    } finally {
      await db.close();
    }
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
    const receivedAt: number[] = [];

    const sub = bridge.subscribe<number>("runs.onRunUpdate", (value) => {
      received.push(value);
      receivedAt.push(Date.now());
    });
    const sentAt = Date.now();
    bus.emit("runs.onRunUpdate", 1);
    expect(received).toEqual([1]);
    expect(receivedAt[0]! - sentAt).toBeLessThan(200);

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
    const db = await createTestOrm();
    try {
      const authed = createCaller(
        createContext({
          session: {
            ...mockSession(),
            userId: db.seed.userId,
            orgId: db.seed.orgId,
            activeOrganizationId: db.seed.orgId,
          } as unknown as import("better-auth").Session,
          orgId: db.seed.orgId,
          userId: db.seed.userId,
          em: db.em,
          container: testContainer(db),
        }),
      );
      await expect(authed.tasks.list()).resolves.toEqual([]);
    } finally {
      await db.close();
    }

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
