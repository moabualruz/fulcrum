/**
 * StdinInput: real stdin keypress adapter for production TUI use.
 *
 * Puts stdin into raw mode so individual keypresses are received immediately
 * (without waiting for Enter). Emits "keypress" events consumed by TuiApp.
 *
 * Cleanup must be called before process exit to restore stdin to normal mode.
 *
 * Note: In tests, use FakeTTY instead of StdinInput.
 */

import { EventEmitter } from "node:events";
import type { TuiInput } from "./testing/fake-tty.ts";

export class StdinInput extends EventEmitter implements TuiInput {
  private readonly _handler: (data: Buffer) => void;

  constructor() {
    super();

    this._handler = (data: Buffer) => {
      const key = data.toString("utf8");
      this.emit("keypress", key);
    };

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.on("data", this._handler);
  }

  /** Restore stdin to normal mode and stop listening. */
  cleanup(): void {
    process.stdin.off("data", this._handler);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  }
}
