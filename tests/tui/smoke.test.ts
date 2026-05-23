/**
 * TUI smoke tests: TDD RED → GREEN (P1#15 issue acceptance criteria).
 *
 * Tests run the TUI components in headless mode (no TTY) using FakeTTY.
 * No DB, no real stdin, no subprocess: all in-process.
 *
 * Acceptance criteria from issue #15:
 *   1. Instantiate TUI in headless mode with a test container.
 *   2. Assert status bar renders "admin@local" (email from auth.whoami).
 *   3. Assert flags screen renders without throwing (zero or more flags).
 *   4. Assert toggle calls flags.set (and the flag state changes).
 *   5. TUI renders without crash with zero flags enabled.
 */

import { describe, it, expect } from "bun:test";
import { FakeTTY, stripAnsi } from "@fulcrum/tui/testing/fake-tty.ts";
import { launchTui, TuiApp } from "@fulcrum/tui/index.ts";
import type { TuiCaller } from "@fulcrum/tui/index.ts";
import { AuthScreen } from "@fulcrum/tui/screens/auth.ts";
import { FlagsScreen } from "@fulcrum/tui/screens/flags.ts";
import { Renderer } from "@fulcrum/tui/renderer.ts";
import { MemoryTelemetrySink } from "@fulcrum/tui/telemetry.ts";
import type { TuiCrashLog } from "@fulcrum/tui/crashlog.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Test doubles
// ─────────────────────────────────────────────────────────────────────────────

interface FlagItem {
  name: string;
  enabled: boolean;
  description: string;
}

interface SetCall {
  flag: string;
  enabled: boolean;
}

/** Build a minimal fake tRPC caller for TUI tests. */
function fakeCaller(
  overrides: {
    email?: string;
    orgId?: string;
    flags?: FlagItem[];
  } = {},
): TuiCaller & { _setCalls: SetCall[] } {
  const email = overrides.email ?? "admin@local";
  const orgId = overrides.orgId ?? "local";
  let flags: FlagItem[] = overrides.flags ?? [
    { name: "router-llm", enabled: false, description: "Enable LLM-based task router." },
    { name: "embeddings", enabled: true, description: "Enable vector embeddings." },
  ];

  const setCalls: SetCall[] = [];

  return {
    _setCalls: setCalls,
    auth: {
      whoami: async () => ({
        userId: "user-01",
        orgId,
        email,
        role: "owner",
      }),
    },
    flags: {
      list: async () => [...flags],
      set: async (input: SetCall) => {
        setCalls.push(input);
        // Mutate state so subsequent list() reflects the change
        flags = flags.map((f) =>
          f.name === input.flag ? { ...f, enabled: input.enabled } : f,
        );
        return { ok: true };
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. TuiApp: headless mount, status bar
// ─────────────────────────────────────────────────────────────────────────────

describe("TuiApp: headless mount", () => {
  it("renders the first frame within the startup budget before slow data resolves", async () => {
    const tty = new FakeTTY();
    const caller = fakeCaller();
    const slow = () => new Promise((resolve) => setTimeout(resolve, 250));
    caller.auth.whoami = async () => {
      await slow();
      return { userId: "u1", email: "admin@local", orgId: "local", orgName: "local", role: "owner" };
    };
    caller.inference = {
      health: async () => {
        await slow();
        return { status: "ok" };
      },
    };
    caller.notify = {
      unreadCount: async () => {
        await slow();
        return { count: 3 };
      },
    };

    const started = performance.now();
    const app = await launchTui({ output: tty, caller });
    const firstFrameMs = performance.now() - started;

    expect(firstFrameMs).toBeLessThan(100);
    expect(tty.plainText()).toContain("Fulcrum TUI");
    app.stop();
  });

  it("mounts without throwing", async () => {
    const tty = new FakeTTY();
    const caller = fakeCaller();

    const app = new TuiApp({
      output: tty,
      caller,
    });

    await app.mount();
    expect(app.isRunning).toBe(true);
    app.stop();
  });

  it("status footer shows the workspace profile after mount", async () => {
    const tty = new FakeTTY();
    const caller = fakeCaller({ email: "admin@local", orgId: "local" });

    const app = new TuiApp({
      output: tty,
      caller,
    });

    await app.mount();

    const text = tty.plainText();
    // OD StatusFooter carries `profile:` (workspace scope), not a user email -
    // the legacy org/user/screen bar is gone (prd-tui-status-footer-od-parity).
    expect(text).toContain("profile: local");
    expect(text).not.toContain("admin@local");
    app.stop();
  });

  it("status bar shows org name", async () => {
    const tty = new FakeTTY();
    const caller = fakeCaller({ orgId: "acme-corp" });

    const app = new TuiApp({ output: tty, caller });
    await app.mount();
    await app.waitForStartupData();

    const text = tty.plainText();
    expect(text).toContain("acme-corp");
    app.stop();
  });

  it("renders navigation menu", async () => {
    const tty = new FakeTTY();
    const app = new TuiApp({ output: tty, caller: fakeCaller() });
    await app.mount();

    const text = tty.plainText();
    expect(text).toContain("Auth");
    expect(text).toContain("Feature Flags");
    expect(text).toContain("Artifacts");
    app.stop();
  });

  it("starts on nav screen", async () => {
    const tty = new FakeTTY();
    const app = new TuiApp({ output: tty, caller: fakeCaller() });
    await app.mount();

    expect(app.screen).toBe("nav");
    app.stop();
  });

  it("falls back to local unauthenticated status when whoami fails", async () => {
    const tty = new FakeTTY();
    const app = new TuiApp({
      output: tty,
      caller: {
        ...fakeCaller(),
        auth: {
          whoami: async () => {
            throw new Error("auth service unavailable");
          },
        },
      },
    });

    await app.mount();

    expect(app.statusBarInfo).toEqual({ email: "(unauthenticated)", orgId: "local" });
    // OD StatusFooter renders the `profile:` scope, not a user email; the
    // unauthenticated fallback surfaces as the `local` workspace profile.
    expect(tty.plainText()).toContain("profile: local");
    app.stop();
  });

  it("mount attaches input and stop detaches it", async () => {
    const tty = new FakeTTY();
    let exits = 0;
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: fakeCaller(),
      onExit: () => {
        exits += 1;
      },
    });

    await app.mount();
    tty.inject("q");
    await Bun.sleep(0);

    expect(exits).toBe(1);
    app.stop();
    tty.inject("q");
    await Bun.sleep(0);
    expect(exits).toBe(1);
    expect(app.isRunning).toBe(false);
  });

  it("launchTui mounts the supplied headless output", async () => {
    const tty = new FakeTTY();

    const app = await launchTui({ output: tty, caller: fakeCaller() });

    expect(app.isRunning).toBe(true);
    expect(tty.plainText()).toContain("Fulcrum TUI");
    app.stop();
  });

  it("records telemetry for normal and crashed renders", async () => {
    const tty = new FakeTTY();
    const telemetry = new MemoryTelemetrySink();
    const crashRows: Array<{ message: string; screenKey: string; route?: string }> = [];
    const crashLog: TuiCrashLog = {
      write: async (error, context) => {
        crashRows.push({
          message: error instanceof Error ? error.message : String(error),
          screenKey: context.screenKey,
          route: context.route,
        });
      },
    };
    const app = new TuiApp({
      output: tty,
      caller: fakeCaller(),
      telemetry,
      crashLog,
      traceContext: { traceId: "tui-planning" },
      routes: [{
        path: "/broken",
        screenKey: "broken-route",
        title: "Broken",
        render: () => {
          throw new Error("route render failed");
        },
      }],
    });

    await app.mount();
    await app.navigatePath("/broken");

    expect(tty.plainText()).toContain("TUI error");
    expect(tty.plainText()).toContain("route render failed");
    expect(tty.plainText()).toContain("Recovery: press r to retry, b to go back, or q to quit");
    expect(tty.plainText()).toContain("trace=tui-planning");
    expect(crashRows).toEqual([{ message: "route render failed", screenKey: "broken-route", route: "/broken" }]);
    expect(telemetry.rows.some((row) => row.screenKey === "broken-route" && row.route === "/broken")).toBe(true);
    app.stop();
  });
});

describe("TuiApp: real keyboard workflows", () => {
  it("uses j/k/enter to open a domain screen and escape back to navigation", async () => {
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: {
        ...fakeCaller(),
        projects: { list: async () => [{ id: "proj-1", name: "Roadmap" }] },
        tasks: { list: async () => [{ id: "task-1", title: "Manual audit", status: "open" }] },
      },
    });

    await app.mount();
    // Domain nav: Projects → Build Board → Tasks. Two 'j' presses to reach Tasks.
    tty.inject("j");
    await Bun.sleep(0);
    tty.inject("j");
    await Bun.sleep(0);
    tty.inject("\r");
    await Bun.sleep(0);

    expect(tty.plainText()).toContain("Tasks");
    expect(tty.plainText()).toContain("Manual audit  [open]  task-1");

    tty.inject("/");
    await Bun.sleep(0);
    expect(tty.plainText()).toContain("Command palette");

    tty.inject("\x1b");
    await Bun.sleep(0);
    expect(tty.plainText()).toContain("Domain nav");
    app.stop();
  });

  it("runs configured single-key actions before screen routing", async () => {
    const tty = new FakeTTY();
    let created = 0;
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: fakeCaller(),
      keybindings: {
        "task.create": { context: "global", key: "x" },
      },
      actions: {
        CreateItem: async () => {
          created += 1;
        },
      },
    });

    await app.mount();
    tty.inject("x");
    await Bun.sleep(0);

    expect(created).toBe(1);
    expect(app.screen).toBe("nav");
    app.stop();
  });

  it("opens new document fallback and returns to nav from keyboard", async () => {
    const tty = new FakeTTY();
    const app = new TuiApp({ output: tty, input: tty, caller: fakeCaller() });

    await app.mount();
    tty.inject("n");
    await Bun.sleep(0);

    expect(app.screen).toBe("new-doc");
    expect(tty.plainText()).toContain("Docs service not available");

    tty.inject("q");
    await Bun.sleep(0);
    expect(app.screen).toBe("nav");
    app.stop();
  });
});

describe("TuiApp: path router", () => {
  it("renders configured routes and not-found routes through navigatePath", async () => {
    const tty = new FakeTTY();
    const telemetry = new MemoryTelemetrySink();
    const app = new TuiApp({
      output: tty,
      caller: fakeCaller(),
      telemetry,
      routes: [{
        path: "/projects/proj-1",
        screenKey: "project-detail",
        title: "Project detail",
        render: () => "Project detail: Roadmap",
      }],
    });

    await app.mount();
    await app.navigatePath("/projects/proj-1");
    expect(tty.plainText()).toContain("Project detail: Roadmap");

    await app.navigatePath("/missing");
    expect(tty.plainText()).toContain("Unknown route: /missing");
    expect(telemetry.rows.some((row) => row.screenKey === "not-found" && row.route === "/missing")).toBe(true);
    app.stop();
  });

  it("throws a clear error when path navigation is used without routes", async () => {
    const app = new TuiApp({ output: new FakeTTY(), caller: fakeCaller() });

    await expect(app.navigatePath("/anything")).rejects.toThrow("TUI path router has no routes.");
    app.stop();
  });
});

describe("TuiApp: inference workflow", () => {
  it("renders health extras, models, routing, external provider state, and pull progress", async () => {
    const previousFeatures = process.env["FULCRUM_FEATURES"];
    const previousUrl = process.env["FULCRUM_INFERENCE_URL"];
    const previousKey = process.env["FULCRUM_INFERENCE_API_KEY"];
    process.env["FULCRUM_FEATURES"] = "external-llm-provider";
    process.env["FULCRUM_INFERENCE_URL"] = "http://127.0.0.1:11434";
    process.env["FULCRUM_INFERENCE_API_KEY"] = "secret";

    async function* pullEvents() {
      yield { type: "download_progress" as const, pct: 50, downloaded: 5, total: 10 };
      yield { type: "download_progress" as const, pct: 100, downloaded: 10, total: 10 };
    }

    const tty = new FakeTTY({ columns: 120, rows: 40 });
    const app = new TuiApp({
      output: tty,
      caller: {
        ...fakeCaller(),
        inference: {
          health: async () => ({
            status: "ok",
            active_requests: 2,
            ops_last_10s: 11,
            embed_hit_rate: 75,
            gen_hit_rate: 50,
            cache_db_size: 4096,
          }),
          models: {
            list: async () => [{ id: "llama3", kind: "generate", downloaded: false, active: false, sizeBytes: 2048 }],
            pull: async () => pullEvents(),
          },
          config: {
            get: async () => ({ tasks: "local", docs: "external" }),
            set: async () => ({ ok: true }),
          },
        },
      },
    });

    try {
      await app.navigateTo("inference");
      let text = tty.plainText();
      expect(text).toContain("Inference:ok");
      expect(text).toContain("In-flight:");
      expect(text).toContain("2");
      expect(text).toContain("11 ops/s");
      expect(text).toContain("75%");
      expect(text).toContain("4 KiB");
      expect(text).toContain("llama3  generate  Download 2048 bytes");
      expect(text).toContain("tasks: local");
      expect(text).toContain("http://127.0.0.1:11434");
      expect(text).toContain("API Key");

      await app.pullInferenceModel("llama3");
      text = tty.plainText();
      expect(text).toContain("Last download llama3 100%");
      expect(text).toContain("llama3  generate  downloaded 2048 bytes");
    } finally {
      if (previousFeatures === undefined) delete process.env["FULCRUM_FEATURES"];
      else process.env["FULCRUM_FEATURES"] = previousFeatures;
      if (previousUrl === undefined) delete process.env["FULCRUM_INFERENCE_URL"];
      else process.env["FULCRUM_INFERENCE_URL"] = previousUrl;
      if (previousKey === undefined) delete process.env["FULCRUM_INFERENCE_API_KEY"];
      else process.env["FULCRUM_INFERENCE_API_KEY"] = previousKey;
      app.stop();
    }
  });
});

describe("TuiApp: artifacts pane", () => {
  it("navigateTo('artifacts') renders artifact list from in-process caller", async () => {
    const tty = new FakeTTY();
    const app = new TuiApp({
      output: tty,
      caller: {
        ...fakeCaller(),
        artifacts: {
          list: async () => [{
            id: "artifact-1",
            filename: "run.txt",
            mime: "text/plain",
            path: "logs/run.txt",
            sizeBytes: "12",
            runId: "run-1",
          }],
          get: async () => ({
            kind: "text",
            artifact: { id: "artifact-1", filename: "run.txt", mime: "text/plain", path: "logs/run.txt" },
            language: "text",
            content: "hello",
            truncated: false,
          }),
          upload: async () => ({ id: "artifact-2", filename: "next.txt", mime: "text/plain", path: "next.txt", sizeBytes: "1" }),
          download: async () => ({ ok: true, path: "/tmp/run.txt" }),
          archive: async (input) => ({ ok: true, id: input.id }),
          delete: async (input) => ({ ok: true, id: input.id }),
        },
      },
    });

    await app.navigateTo("artifacts");
    expect(tty.plainText()).toContain("run.txt");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. AuthScreen: direct render
// ─────────────────────────────────────────────────────────────────────────────

describe("AuthScreen: headless render", () => {
  it("renders user email", () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);

    const screen = new AuthScreen(renderer, {
      userId: "user-01",
      orgId: "local",
      email: "admin@local",
      role: "owner",
    });

    screen.render();
    const text = tty.plainText();
    expect(text).toContain("admin@local");
  });

  it("renders org name", () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);

    const screen = new AuthScreen(renderer, {
      userId: "user-01",
      orgId: "org-123",
      orgName: "Acme Corp",
      email: "user@acme.com",
      role: "admin",
    });

    screen.render();
    const text = tty.plainText();
    expect(text).toContain("Acme Corp");
  });

  it("renders role", () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);

    const screen = new AuthScreen(renderer, {
      userId: "user-01",
      orgId: "local",
      email: "admin@local",
      role: "owner",
    });

    screen.render();
    const text = tty.plainText();
    expect(text).toContain("owner");
  });

  it("renders passkey count", () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);

    const screen = new AuthScreen(renderer, {
      userId: "user-01",
      orgId: "local",
      email: "admin@local",
      role: "owner",
      passkeyCount: 2,
    });

    screen.render();
    const text = tty.plainText();
    expect(text).toContain("2 passkeys enrolled");
  });

  it("renders zero passkeys enrolled", () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);

    const screen = new AuthScreen(renderer, {
      userId: "user-01",
      orgId: "local",
      email: "admin@local",
      role: "owner",
      passkeyCount: 0,
    });

    screen.render();
    const text = tty.plainText();
    expect(text).toContain("0 passkeys enrolled");
  });

  it("renders saas-auth providers when flag ON", () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);

    const screen = new AuthScreen(renderer, {
      userId: "user-01",
      orgId: "local",
      email: "admin@local",
      role: "owner",
      saasAuthEnabled: true,
      authProviders: ["GitHub", "Google"],
    });

    screen.render();
    const text = tty.plainText();
    expect(text).toContain("GitHub");
    expect(text).toContain("Google");
  });

  it("does not render providers section when saas-auth OFF", () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);

    const screen = new AuthScreen(renderer, {
      userId: "user-01",
      orgId: "local",
      email: "admin@local",
      role: "owner",
      saasAuthEnabled: false,
    });

    screen.render();
    const text = tty.plainText();
    expect(text).not.toContain("Active Auth Providers");
  });

  it("handles q keypress by calling onExit", () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);

    let exited = false;
    const screen = new AuthScreen(
      renderer,
      { userId: "u1", orgId: "o1", email: "a@b.com", role: "owner" },
      { onExit: () => { exited = true; } },
    );

    const consumed = screen.handleKey("q");
    expect(consumed).toBe(true);
    expect(exited).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. FlagsScreen: headless render + toggle
// ─────────────────────────────────────────────────────────────────────────────

describe("FlagsScreen: headless render", () => {
  it("renders without throwing with zero flags", async () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);

    const screen = new FlagsScreen(renderer, {
      caller: {
        flags: {
          list: async () => [],
          set: async () => ({ ok: true }),
        },
      },
    });

    await screen.load();
    expect(() => screen.render()).not.toThrow();
    const text = tty.plainText();
    expect(text).toContain("Feature Flags");
  });

  it("renders flag names", async () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);
    const caller = fakeCaller();

    const screen = new FlagsScreen(renderer, { caller });
    await screen.load();
    screen.render();

    const text = tty.plainText();
    expect(text).toContain("router-llm");
    expect(text).toContain("embeddings");
  });

  it("renders ON/OFF status", async () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);
    const caller = fakeCaller({
      flags: [
        { name: "router-llm", enabled: false, description: "LLM router." },
        { name: "embeddings", enabled: true, description: "Embeddings." },
      ],
    });

    const screen = new FlagsScreen(renderer, { caller });
    await screen.load();
    screen.render();

    // Strip ANSI and check raw text
    const text = stripAnsi(tty.raw());
    expect(text).toContain("[ON ]");
    expect(text).toContain("[OFF]");
  });

  it("toggles selected flag on Space and calls flags.set", async () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);
    const caller = fakeCaller({
      flags: [
        { name: "router-llm", enabled: false, description: "LLM router." },
      ],
    });

    const screen = new FlagsScreen(renderer, { caller });
    await screen.load();

    // Cursor is at 0 (router-llm, currently OFF)
    expect(screen.currentFlags[0]?.enabled).toBe(false);

    // Press Space to toggle
    await screen.handleKey(" ");

    // flags.set should have been called
    expect(caller._setCalls).toHaveLength(1);
    expect(caller._setCalls[0]?.flag).toBe("router-llm");
    expect(caller._setCalls[0]?.enabled).toBe(true);

    // Subsequent list() should reflect the change
    expect(screen.currentFlags[0]?.enabled).toBe(true);
  });

  it("j/k keyboard moves cursor", async () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);
    const caller = fakeCaller({
      flags: [
        { name: "flag-a", enabled: false, description: "A." },
        { name: "flag-b", enabled: false, description: "B." },
        { name: "flag-c", enabled: false, description: "C." },
      ],
    });

    const screen = new FlagsScreen(renderer, { caller });
    await screen.load();

    expect(screen.cursorIndex).toBe(0);
    await screen.handleKey("j");
    expect(screen.cursorIndex).toBe(1);
    await screen.handleKey("j");
    expect(screen.cursorIndex).toBe(2);
    await screen.handleKey("k");
    expect(screen.cursorIndex).toBe(1);
  });

  it("cursor does not go below 0 or above flags.length-1", async () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);
    const caller = fakeCaller({
      flags: [
        { name: "flag-a", enabled: false, description: "A." },
      ],
    });

    const screen = new FlagsScreen(renderer, { caller });
    await screen.load();

    // Move up from 0: should stay at 0
    await screen.handleKey("k");
    expect(screen.cursorIndex).toBe(0);

    // Move down from 0: only 1 item, should stay at 0
    await screen.handleKey("j");
    expect(screen.cursorIndex).toBe(0);
  });

  it("q keypress calls onExit", async () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);
    const caller = fakeCaller();

    let exited = false;
    const screen = new FlagsScreen(renderer, {
      caller,
      onExit: () => { exited = true; },
    });

    await screen.load();
    await screen.handleKey("q");
    expect(exited).toBe(true);
  });

  it("Enter also toggles selected flag", async () => {
    const tty = new FakeTTY();
    const renderer = new Renderer(tty);
    const caller = fakeCaller({
      flags: [
        { name: "router-llm", enabled: true, description: "LLM router." },
      ],
    });

    const screen = new FlagsScreen(renderer, { caller });
    await screen.load();

    await screen.handleKey("\r");

    expect(caller._setCalls).toHaveLength(1);
    expect(caller._setCalls[0]?.enabled).toBe(false); // was true, toggled to false
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. TuiApp: navigation to screens
// ─────────────────────────────────────────────────────────────────────────────

describe("TuiApp: screen navigation", () => {
  it("navigateTo('auth') renders auth screen", async () => {
    const tty = new FakeTTY();
    const caller = fakeCaller({ email: "admin@local" });
    const app = new TuiApp({ output: tty, caller });

    await app.mount();
    tty.clear();
    await app.navigateTo("auth");

    const text = tty.plainText();
    expect(text).toContain("admin@local");
    expect(app.screen).toBe("auth");
    app.stop();
  });

  it("navigateTo('flags') renders flags screen", async () => {
    const tty = new FakeTTY();
    const caller = fakeCaller();
    const app = new TuiApp({ output: tty, caller });

    await app.mount();
    tty.clear();
    await app.navigateTo("flags");

    const text = tty.plainText();
    expect(text).toContain("Feature Flags");
    expect(app.screen).toBe("flags");
    app.stop();
  });

  it("renders without crash with zero flags enabled", async () => {
    const tty = new FakeTTY();
    const caller = fakeCaller({
      flags: [
        { name: "router-llm", enabled: false, description: "LLM router." },
        { name: "embeddings", enabled: false, description: "Embeddings." },
      ],
    });
    const app = new TuiApp({ output: tty, caller });

    await app.mount();
    await expect(app.navigateTo("flags")).resolves.toBeUndefined();
    app.stop();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. FakeTTY utilities
// ─────────────────────────────────────────────────────────────────────────────

describe("FakeTTY utilities", () => {
  it("captures written output", () => {
    const tty = new FakeTTY();
    tty.write("hello ");
    tty.write("world");
    expect(tty.raw()).toBe("hello world");
  });

  it("stripAnsi removes colour codes", () => {
    const coloured = "\x1b[32mGreen\x1b[0m text";
    expect(stripAnsi(coloured)).toBe("Green text");
  });

  it("plainText strips ANSI from accumulated output", () => {
    const tty = new FakeTTY();
    tty.write("\x1b[1mBold\x1b[0m");
    expect(tty.plainText()).toBe("Bold");
  });

  it("inject emits keypress event", (done) => {
    const tty = new FakeTTY();
    tty.on("keypress", (key: string) => {
      expect(key).toBe("j");
      done();
    });
    tty.inject("j");
  });

  it("clear resets chunks", () => {
    const tty = new FakeTTY();
    tty.write("first");
    tty.clear();
    expect(tty.raw()).toBe("");
  });

  it("isTTY is true in headless mode", () => {
    const tty = new FakeTTY();
    expect(tty.isTTY).toBe(true);
  });

  it("columns defaults to 80", () => {
    const tty = new FakeTTY();
    expect(tty.columns).toBe(80);
  });

  it("rows defaults to 24", () => {
    const tty = new FakeTTY();
    expect(tty.rows).toBe(24);
  });
});
