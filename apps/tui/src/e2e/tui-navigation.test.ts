import { describe, expect, test } from "bun:test";

import { TuiApp, type TuiCaller } from "../index.ts";
import { FakeTTY } from "../testing/fake-tty.ts";

describe("TUI E2E navigation flow", () => {
  test("opens task list from nav and returns without direct DB access", async () => {
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const app = new TuiApp({ output: tty, input: tty, caller: makeCaller() });
    await app.mount();

    tty.inject("j");
    tty.inject("\r");
    await tick();
    expect(tty.plainText()).toContain("Tasks");
    expect(tty.plainText()).toContain("E2E task");

    tty.clear();
    tty.inject("\x1b");
    await tick();
    expect(tty.plainText()).toContain("Domain nav");
    app.stop();
  });

  test("command palette toggles from nav", async () => {
    const tty = new FakeTTY({ columns: 100, rows: 30 });
    const app = new TuiApp({ output: tty, input: tty, caller: makeCaller() });
    await app.mount();

    tty.clear();
    tty.inject("/");
    await tick();
    expect(tty.plainText()).toContain("Command palette");
    expect(tty.plainText()).toContain("Create task");
    app.stop();
  });
});

function makeCaller(): TuiCaller {
  return {
    auth: { whoami: async () => ({ userId: "u1", orgId: "org1", email: "e2e@example.com", role: "admin" }) },
    flags: { list: async () => [], set: async () => ({ ok: true }) },
    tasks: { list: async () => [{ id: "task-1", orgId: "org1", title: "E2E task", status: "todo" }] },
    notify: { unreadCount: async () => ({ count: 0 }) },
    inference: { health: async () => ({ status: "ok" }) },
  };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
