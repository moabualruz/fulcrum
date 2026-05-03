/**
 * P15#01 — TUI foundation parity tests (renderer launcher, screen registry,
 * keybinding-driven dispatch, theme contract consumption).
 *
 * RED: registry, launcher, keybinding-action dispatch, theme getter all absent.
 * GREEN: src/tui/screen-registry.ts + launchTui() in src/tui/index.ts +
 *        TuiApp.keybindings + TuiApp.theme.
 */
import { describe, expect, it } from "bun:test";
import {
  TuiApp,
  launchTui,
  type TuiCaller,
} from "../../src/tui/index.ts";
import { ScreenRegistry } from "../../src/tui/screen-registry.ts";
import { FakeTTY } from "../../src/tui/testing/fake-tty.ts";
import { getDefaultKeybindings } from "../../src/keybindings/index.ts";
import { buildTheme } from "../../src/tui/theme/index.ts";

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
