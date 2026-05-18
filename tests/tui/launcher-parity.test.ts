/**
 * P15#01 — TUI foundation parity tests (renderer launcher, screen registry,
 * keybinding-driven dispatch, theme contract consumption).
 *
 * RED: registry, launcher, keybinding-action dispatch, theme getter all absent.
 * GREEN: apps/tui/src/screen-registry.ts + launchTui() in apps/tui/src/index.ts +
 *        TuiApp.keybindings + TuiApp.theme.
 */
import { describe, expect, it } from "bun:test";
import {
  TuiApp,
  listTuiNavigationEntries,
  launchTui,
  type TuiCaller,
} from "@fulcrum/tui/index.ts";
import { ScreenRegistry } from "@fulcrum/tui/screen-registry.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";
import { getDefaultKeybindings } from "@platform-core/application/input-bindings/index.ts";
import { buildTheme } from "@fulcrum/tui/theme/index.ts";

function fakeCaller(): TuiCaller {
  return {
    auth: {
      whoami: async () => ({
        userId: "user-x",
        orgId: "org-x",
        email: "x@test.local",
        role: "owner",
      }),
    },
    flags: { list: async () => [], set: async () => ({ ok: true }) },
  };
}

describe("ScreenRegistry", () => {
  it("registers, lists, retrieves, and rejects duplicates", () => {
    const reg = new ScreenRegistry();
    reg.register({ key: "nav", title: "Root" });
    reg.register({ key: "auth", title: "Auth" });

    expect(reg.list().map((s) => s.key)).toEqual(["nav", "auth"]);
    expect(reg.get("auth")?.title).toBe("Auth");
    expect(() => reg.register({ key: "nav", title: "dup" })).toThrow(/already registered/);
  });
});

describe("launchTui", () => {
  it("boots the launcher headlessly, renders root, and exits cleanly", async () => {
    const tty = new FakeTTY();
    let exited = false;
    const app = await launchTui({
      output: tty,
      input: tty,
      caller: fakeCaller(),
      onExit: () => {
        exited = true;
      },
    });

    expect(app.isRunning).toBe(true);
    expect(tty.plainText()).toContain("Fulcrum");

    tty.inject("q");
    await Bun.sleep(1);
    expect(exited).toBe(true);
    app.stop();
  });

  it("exposes every launcher entry with a stable screen key", () => {
    const entries = listTuiNavigationEntries();
    const screens = entries.map((entry) => entry.screen);

    expect(entries.length).toBeGreaterThan(20);
    expect(new Set(screens).has("projects")).toBe(true);
    expect(new Set(screens).has("tasks")).toBe(true);
    expect(new Set(screens).has("doctor")).toBe(true);
    expect(entries.every((entry) => entry.label.length > 0)).toBe(true);
  });

  it("renders status screen names, help overlay, and Ctrl+K palette from FakeTTY", async () => {
    const tty = new FakeTTY();
    const app = await launchTui({
      output: tty,
      input: tty,
      caller: fakeCaller(),
    });

    expect(tty.plainText()).toContain("Screen:Launcher");

    tty.inject("?");
    await Bun.sleep(1);
    expect(tty.plainText()).toContain("Launcher — Keybindings");
    expect(tty.plainText()).toContain("Toggle command palette");

    tty.inject("?");
    await Bun.sleep(1);
    tty.inject("\x0b");
    await Bun.sleep(1);
    expect(tty.plainText()).toContain("Command palette");
    expect(tty.plainText()).toContain("Create task");

    tty.inject("\r");
    await Bun.sleep(1);
    expect(tty.plainText()).toContain("Screen:Projects");

    app.stop();
  });
});

describe("TuiRouter route states", () => {
  it("renders unknown route state without crashing", async () => {
    const tty = new FakeTTY();
    const app = new TuiApp({
      output: tty,
      caller: fakeCaller(),
      routes: [
        {
          path: "/projects",
          screenKey: "projects",
          title: "Projects",
          render: () => "Projects route",
        },
      ],
    });
    await app.mount();

    await app.navigatePath("/missing");
    expect(tty.plainText()).toContain("Unknown route: /missing");
    expect(tty.plainText()).toContain("Screen:Not Found");

    app.stop();
  });
});

describe("TuiApp keybinding registry consumption", () => {
  it("dispatches CreateItem when the resolved task.create key is pressed", async () => {
    const tty = new FakeTTY();
    const fired: string[] = [];
    const map = await getDefaultKeybindings("linux");
    // task.create default is 'C' — case-insensitive single key.
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: fakeCaller(),
      keybindings: map,
      actions: {
        CreateItem: () => {
          fired.push("CreateItem");
        },
      },
    });
    await app.mount();

    tty.inject("c"); // matches 'C' case-insensitively
    await Bun.sleep(1);
    expect(fired).toEqual(["CreateItem"]);
    app.stop();
  });
});

describe("TuiApp theme contract", () => {
  it("accepts a TuiTheme and exposes it via getter", async () => {
    const settings = new Map<string, string>([["tui.theme_preset", "dracula"]]);
    const theme = await buildTheme({
      get: (k) => settings.get(k) ?? null,
    });
    const app = new TuiApp({
      output: new FakeTTY(),
      caller: fakeCaller(),
      theme,
    });
    await app.mount();
    expect(app.theme?.name).toBe("dracula");
    app.stop();
  });
});
