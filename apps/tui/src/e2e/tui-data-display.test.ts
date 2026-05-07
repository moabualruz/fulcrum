import { describe, expect, test } from "bun:test";

import { TuiApp, type TuiCaller } from "../index.ts";
import { FakeTTY } from "../testing/fake-tty.ts";

describe("TUI E2E data display", () => {
  test("projects screen renders caller data", async () => {
    const text = await renderDomain("projects", makeCaller({
      projects: { list: async () => [{ id: "project-1", name: "Phase 9.5 Project" }] },
    }));
    expect(text).toContain("Projects");
    expect(text).toContain("Phase 9.5 Project");
  });

  test("runs screen renders run list data", async () => {
    const text = await renderDomain("runs", makeCaller({
      agent_runs: {
        list: async () => [{ id: "run-1", agent: "codex", status: "running", taskId: "task-1", projectId: "project-1" }],
        get: async () => ({ id: "run-1", agent: "codex", status: "running", taskId: "task-1", projectId: "project-1" }),
        create: async () => ({ id: "run-1", agent: "codex", status: "running", taskId: "task-1", projectId: "project-1" }),
        cancel: async () => ({ ok: true }),
      },
    }));
    expect(text).toContain("Run list");
    expect(text).toContain("codex");
  });
});

async function renderDomain(screen: "projects" | "runs", caller: TuiCaller): Promise<string> {
  const tty = new FakeTTY({ columns: 100, rows: 30 });
  const app = new TuiApp({ output: tty, input: tty, caller });
  await app.mount();
  tty.clear();
  await app.navigateTo(screen);
  const text = tty.plainText();
  app.stop();
  return text;
}

function makeCaller(overrides: Partial<TuiCaller> = {}): TuiCaller {
  return {
    auth: { whoami: async () => ({ userId: "u1", orgId: "org1", email: "e2e@example.com", role: "admin" }) },
    flags: { list: async () => [], set: async () => ({ ok: true }) },
    notify: { unreadCount: async () => ({ count: 0 }) },
    inference: { health: async () => ({ status: "ok" }) },
    ...overrides,
  };
}
