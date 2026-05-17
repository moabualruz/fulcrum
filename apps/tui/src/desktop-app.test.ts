import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import {
  TauriKeybindBridge,
  type TauriEvent,
} from "./desktop-app.ts";

describe("TauriKeybindBridge", () => {
  afterEach(() => {
    delete process.env["FULCRUM_FEATURES"];
  });

  test("does not register listener when desktop-app flag OFF", () => {
    delete process.env["FULCRUM_FEATURES"];
    const bridge = new TauriKeybindBridge();
    expect(bridge.isRegistered()).toBe(false);
  });

  test("registers IPC listener when desktop-app flag ON", () => {
    process.env["FULCRUM_FEATURES"] = "desktop-app";
    const bridge = new TauriKeybindBridge();
    bridge.register();
    expect(bridge.isRegistered()).toBe(true);
  });

  test("receives native shortcut from mock Tauri event", () => {
    process.env["FULCRUM_FEATURES"] = "desktop-app";
    const bridge = new TauriKeybindBridge();
    bridge.register();

    const received: TauriEvent[] = [];
    bridge.onKeybind((evt) => received.push(evt));

    bridge.emitMock({ type: "keybind", key: "Ctrl+S", source: "tauri-ipc" });
    expect(received).toHaveLength(1);
    expect(received[0]!.key).toBe("Ctrl+S");
    expect(received[0]!.source).toBe("tauri-ipc");
  });

  test("unregister removes listener", () => {
    process.env["FULCRUM_FEATURES"] = "desktop-app";
    const bridge = new TauriKeybindBridge();
    bridge.register();
    bridge.unregister();
    expect(bridge.isRegistered()).toBe(false);
  });

  test("no-op in standalone mode even after register attempt", () => {
    delete process.env["FULCRUM_FEATURES"];
    const bridge = new TauriKeybindBridge();
    bridge.register(); // should be no-op
    expect(bridge.isRegistered()).toBe(false);

    const received: TauriEvent[] = [];
    bridge.onKeybind((evt) => received.push(evt));
    bridge.emitMock({ type: "keybind", key: "Ctrl+S", source: "tauri-ipc" });
    expect(received).toHaveLength(0);
  });
});
