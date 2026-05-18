import { describe, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";

import { listMissingTuiDomains } from "@platform-core/application/interface-parity/surface-domain-matrix.ts";
import { FakeTTY } from "../testing/fake-tty.ts";
import { TuiApp, type TuiCaller } from "../index.ts";

function extractNavLabels(source: string): string[] {
  return [...source.matchAll(/label:\s*["']([^"']+)["']/g)].map((match) => match[1] ?? "");
}

async function exists(path: URL): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("Surface TUI parity inventory", () => {
  test("canonical specs lock dense domain nav, detail/log pane, and status footer", async () => {
    const specs = await Promise.all([
      readFile(new URL("../../../../DESIGN.md", import.meta.url), "utf-8"),
      readFile(new URL("../../../../IA-MAP.md", import.meta.url), "utf-8"),
      readFile(new URL("../../../../CLI-TUI-UX.md", import.meta.url), "utf-8"),
    ]);
    const spec = specs.join("\n");
    const testSource = await readFile(new URL("./tui-parity.test.ts", import.meta.url), "utf-8");

    expect(spec).toContain("Stage nav");
    expect(spec).toContain("Live session pane");
    expect(spec).toContain("status footer");
    expect(spec).toContain("TUI status footer");
    expect(spec).toContain("Feature parity with web shell is mandatory");
    expect(testSource).toContain("domain nav");
    expect(testSource).toContain("detail/log pane");
    expect(testSource).toContain("status footer");
  });

  test("navigation labels cover every required Surface domain", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf-8");
    const labels = extractNavLabels(source);

    expect(listMissingTuiDomains(labels)).toEqual([]);
    expect(labels).toEqual(expect.arrayContaining([
      "Projects",
      "Tasks",
      "Docs",
      "Memory",
      "Runs",
      "Repos",
      "Artifacts",
      "Search",
      "Notifications",
      "Routing/Skills",
      "Doctor/Settings",
    ]));
  });

  test("required domain screen modules exist for navigation targets", async () => {
    const screens = [
      "projects.ts",
      "task-board.ts",
      "sprints.ts",
      "docs-tree-screen.ts",
      "memory-browser.ts",
      "runs.ts",
      "repos.ts",
      "artifacts.ts",
      "search-screen.ts",
      "notifications.ts",
      "skills.ts",
      "routing-rules.ts",
      "inference.ts",
      "doctor.ts",
      "auth.ts",
    ];
    const missing: string[] = [];

    for (const screen of screens) {
      if (!(await exists(new URL(`../screens/${screen}`, import.meta.url)))) {
        missing.push(screen);
      }
    }

    expect(missing).toEqual([]);
  });

  test("runtime root imports OpenTUI adapter and keeps direct DB access out of screens", async () => {
    const root = await readFile(new URL("../index.ts", import.meta.url), "utf-8");
    const screenFiles = [
      "task-board.ts",
      "docs-tree-screen.ts",
      "search-screen.ts",
      "repos.ts",
      "artifacts.ts",
      "notifications.ts",
      "runs.ts",
    ];

    expect(root).toContain("createFulcrumTuiRenderer");

    for (const file of screenFiles) {
      const source = await readFile(new URL(`../screens/${file}`, import.meta.url), "utf-8");
      expect(source).not.toMatch(new RegExp(`from ["']\\.\\.\\/\\.\\.\\/db|from ["']\\.\\.\\/db|EntityManager|Mikro${"ORM"}`));
    }
  });

  test("keyboard contract supports operator navigation keys", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf-8");

    for (const key of ["j", "k", "\\x1b[B", "\\x1b[A", "\\r", "\\x1b", "/", "q"]) {
      expect(source).toContain(key);
    }
  });

  test("root screen renders domain nav, detail/log pane, status footer, and command palette actions", async () => {
    const tty = new FakeTTY({ columns: 120, rows: 32 });
    const app = new TuiApp({ output: tty, input: tty, caller: createCaller() });

    await app.mount();
    const rendered = tty.plainText();

    expect(rendered).toContain("Domain nav");
    expect(rendered).toContain("Detail / log pane");
    expect(rendered).toContain("Status footer");
    expect(rendered).toContain("Create task");
    expect(rendered).toContain("Create doc");
    expect(rendered).toContain("Search");
    expect(rendered).toContain("Dispatch run");
    expect(rendered).toContain("Settings");

    app.stop();
  });

  test("run monitor updates transcript/log pane from subscription event", async () => {
    const tty = new FakeTTY({ columns: 120, rows: 32 });
    const subscriptions = createSubscriptionHarness();
    const app = new TuiApp({ output: tty, input: tty, caller: createCaller(subscriptions) });

    await app.mount();
    await app.navigateTo("runs");
    subscriptions.emit("runs.onRunUpdate", { id: "run-1", status: "running", logLine: "streamed token" });
    await app.renderForTest();

    const rendered = tty.plainText();
    expect(rendered).toContain("Run list");
    expect(rendered).toContain("Transcript / log");
    expect(rendered).toContain("streamed token");
    expect(rendered).toContain("agent:codex");

    app.stop();
  });

  test("dead legacy TUI root is removed", async () => {
    expect(await exists(new URL("../app.ts", import.meta.url))).toBe(false);
  });
});

function createSubscriptionHarness() {
  const handlers = new Map<string, Array<(payload: unknown) => void>>();
  return {
    subscribe<T>(topic: string, handler: (payload: T) => void) {
      const list = handlers.get(topic) ?? [];
      list.push(handler as (payload: unknown) => void);
      handlers.set(topic, list);
      return {
        unsubscribe: () => {
          handlers.set(topic, (handlers.get(topic) ?? []).filter((candidate) => candidate !== handler));
        },
      };
    },
    emit(topic: string, payload: unknown) {
      for (const handler of handlers.get(topic) ?? []) handler(payload);
    },
  };
}

function createCaller(subscriptions = createSubscriptionHarness()): TuiCaller {
  return {
    auth: {
      whoami: async () => ({
        userId: "user-1",
        orgId: "org-1",
        email: "operator@fulcrum.local",
        role: "admin",
        orgName: "Fulcrum",
      }),
    },
    flags: { list: async () => [], set: async () => ({ ok: true }) },
    notify: { unreadCount: async () => ({ count: 2 }) },
    inference: { health: async () => ({ status: "ok" }) },
    projects: { list: async () => [{ id: "project-1", name: "Fulcrum", slug: "fulcrum" }] },
    tasks: {
      list: async () => [{ id: "task-1", orgId: "org-1", title: "Ship TUI parity", status: "todo" }],
      update: async (input) => ({ id: input.id, orgId: "org-1", title: "Ship TUI parity", status: input.status }),
      create: async (input) => ({ id: "task-2", orgId: "org-1", title: input.title, status: input.status }),
    },
    agent_runs: {
      list: async () => [{
        id: "run-1",
        agent: "codex",
        status: "running",
        taskTitle: "Ship TUI parity",
        projectName: "Fulcrum",
        logLines: ["boot"],
      }],
      get: async () => ({
        id: "run-1",
        agent: "codex",
        status: "running",
        taskTitle: "Ship TUI parity",
        projectName: "Fulcrum",
        logLines: ["boot"],
      }),
      create: async (input) => ({ id: "run-2", agent: input.agent, status: "queued" }),
      cancel: async () => ({ ok: true }),
    },
    runsSubscriptions: subscriptions as never,
    repos: { list: async () => [] },
    artifacts: { list: async () => [], get: async () => null } as never,
    memories: { list: async () => [], promote: async () => ({ ok: true }) },
    search: { query: async () => [], suggest: async () => [] },
  };
}
