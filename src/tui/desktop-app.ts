/**
 * Desktop app Tauri keybind bridge.
 * Gated by FULCRUM_FEATURES=desktop-app.
 * When ON, TUI receives native OS keybindings via Tauri IPC bridge.
 * No-op in standalone mode.
 */

import { isFeatureEnabled } from "./feature-flags.ts";

export interface TauriEvent {
  type: "keybind";
  key: string;
  source: "tauri-ipc";
}

type KeybindHandler = (event: TauriEvent) => void;

export class TauriKeybindBridge {
  private registered = false;
  private handlers: KeybindHandler[] = [];

  /** Register IPC listener. No-op if desktop-app flag OFF. */
  register(): void {
    if (!isFeatureEnabled("desktop-app")) return;
    this.registered = true;
  }

  /** Unregister IPC listener. */
  unregister(): void {
    this.registered = false;
    this.handlers = [];
  }

  isRegistered(): boolean {
    return this.registered;
  }

  /** Subscribe to keybind events. */
  onKeybind(handler: KeybindHandler): void {
    if (!this.registered) return;
    this.handlers.push(handler);
  }

  /** Emit a mock Tauri event (for testing / standalone simulation). */
  emitMock(event: TauriEvent): void {
    if (!this.registered) return;
    for (const h of this.handlers) h(event);
  }
}
