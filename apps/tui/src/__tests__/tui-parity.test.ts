import { describe, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";

import {
  REQUIRED_SURFACE_DOMAINS,
  listMissingTuiDomains,
} from "@platform-core/application/interface-parity/surface-domain-matrix.ts";
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

  test("parity matrix names TUI action state and known TUI gaps", () => {
    const byName = new Map(REQUIRED_SURFACE_DOMAINS.map((domain) => [domain.name, domain]));

    expect(byName.get("tasks")?.state.tui).toBe("interactive");
    expect(byName.get("runs")?.workflows[0]?.tui).toContain("Run detail transcript/log pane");
    expect(byName.get("docs")?.state.tui).toBe("display-only");
    expect(byName.get("reports")?.state.tui).toBe("gap");
    expect(byName.get("review")?.gaps.map((gap) => gap.id)).toContain("review:tui-display-gap");
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

  test("mounted root renders the OD StatusFooter segments, not the legacy org/user/screen bar", async () => {
    // prd-tui-status-footer-od-parity: index.ts wires StatusBarWidget so the
    // always-on bottom strip mirrors the web StatusFooter (CLI-TUI-UX.md §8).
    const tty = new FakeTTY({ columns: 120, rows: 32 });
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: createCaller(),
      traceContext: {
        projectId: "auth/rewrite",
        runId: "01HXYZ",
        spanId: "8b2d4a6f",
        traceId: "4f3a1c9e8b2d4a6f9c1e3a5b7d9f1c3e",
      },
    });

    await app.mount();
    const rendered = tty.plainText();

    // OD footer segments are present (mode pill, profile, branch, mcp, trace).
    expect(rendered).toContain("LAUNCHER");
    expect(rendered).toContain("profile:");
    expect(rendered).toContain("auth/rewrite");
    expect(rendered).toMatch(/mcp \S+/);
    expect(rendered).toContain("trace:4f3a1c9e");
    expect(rendered).toContain(":ai");
    // The legacy footer rendered a raw user email — the OD footer never does.
    expect(rendered).not.toContain("operator@fulcrum.local");

    app.stop();
  });

  test("index.ts consumes the StatusBarWidget for footer rendering", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf-8");
    // Consumed-by proof: the footer widget is imported and constructed, not
    // a hand-rolled route-local bar (snapshot-fidelity done_mode).
    expect(source).toContain('from "./widgets/StatusBar.ts"');
    expect(source).toContain("new StatusBarWidget(");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// prd-tui-root-navigation-od-parity
//
// The TUI root must launch the six workflow-stage screens (Capture / Plan /
// Build / Review / Ship / Operate) and render the OD `tui-runs.html` #tui-tabs
// strip as always-visible root chrome, and colon routes must resolve. These
// tests compare CONCRETE labels and order against OD — not placeholder text.
// ───────────────────────────────────────────────────────────────────────────

describe("TUI root navigation — OD stage launcher parity", () => {
  test("root renders the six-stage nav with exact OD stage labels in order", async () => {
    const tty = new FakeTTY({ columns: 120, rows: 40 });
    const app = new TuiApp({ output: tty, input: tty, caller: createCaller() });

    await app.mount();
    const rendered = tty.plainText();

    // Stage nav section header and the six exact stage labels are present.
    expect(rendered).toContain("Stage nav");
    for (const stage of ["Capture", "Plan", "Build", "Review", "Ship", "Operate"]) {
      expect(rendered).toContain(stage);
    }

    // Order is Capture → Operate, not alphabetical or arbitrary.
    const order = ["Capture", "Plan", "Build", "Review", "Ship", "Operate"];
    const indices = order.map((label) => rendered.indexOf(`${label}  :`));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }

    app.stop();
  });

  test("root renders the OD #tui-tabs strip with exact labels and order", async () => {
    const tty = new FakeTTY({ columns: 160, rows: 44 });
    const app = new TuiApp({ output: tty, input: tty, caller: createCaller() });

    await app.mount();
    const rendered = tty.plainText();

    // OD tui-runs.html #tui-tabs — sixteen buttons, exact order.
    const odTabOrder = [
      ":capture", ":plan", ":runs", ":board", ":review", ":ship", ":doctor",
      ":run", ":ai", ":agents", ":mcp", ":plugins", ":routes", ":settings",
      ":K", "?",
    ];
    expect(rendered).toContain("Stage tab strip");
    let cursor = -1;
    for (const tab of odTabOrder) {
      const at = rendered.indexOf(tab, cursor);
      expect(at).toBeGreaterThan(cursor);
      cursor = at + tab.length;
    }

    app.stop();
  });

  test("colon routes :capture/:plan/:runs/:board/:review/:ship/:doctor/:ai resolve", async () => {
    const app = new TuiApp({
      output: new FakeTTY({ columns: 120, rows: 32 }),
      input: new FakeTTY({ columns: 120, rows: 32 }),
      caller: createCaller(),
    });
    await app.mount();

    for (const route of [
      ":capture", ":plan", ":runs", ":board", ":review", ":ship", ":doctor", ":ai",
    ]) {
      const resolved = await app.navigateColon(route);
      expect(resolved).toBeDefined();
    }

    // An unknown colon route does not resolve and does not crash the launcher.
    expect(await app.navigateColon(":nonexistent")).toBeUndefined();

    app.stop();
  });

  test("palette and help are visible from the root launcher", async () => {
    const tty = new FakeTTY({ columns: 120, rows: 40 });
    const app = new TuiApp({ output: tty, input: tty, caller: createCaller() });

    await app.mount();
    const rendered = tty.plainText();

    expect(rendered).toContain("Command palette");
    expect(rendered).toMatch(/Help: \?/);

    app.stop();
  });

  test("screen registry is the canonical catalog for stage nav and colon routes", async () => {
    const { TUI_STAGE_NAV, TUI_TAB_STRIP, buildTuiScreenRegistry, resolveColonRoute } =
      await import("../screen-registry.ts");

    // Stage nav labels are exactly the six workflow stages, in order.
    expect(TUI_STAGE_NAV.map((s) => s.label)).toEqual([
      "Capture", "Plan", "Build", "Review", "Ship", "Operate",
    ]);

    // Tab strip labels and order match OD tui-runs.html #tui-tabs exactly.
    expect(TUI_TAB_STRIP.map((t) => t.label)).toEqual([
      ":capture", ":plan", ":runs", ":board", ":review", ":ship", ":doctor",
      ":run", ":ai", ":agents", ":mcp", ":plugins", ":routes", ":settings",
      ":K", "?",
    ]);

    // Every stage colon route resolves to a registered screen.
    const registry = buildTuiScreenRegistry();
    for (const route of [":capture", ":plan", ":runs", ":board", ":review", ":ship", ":doctor", ":ai"]) {
      const key = resolveColonRoute(route);
      expect(key).toBeDefined();
      expect(registry.has(key as string)).toBe(true);
    }
  });

  test("consumed-by: index.ts and router.ts both import the screen registry", async () => {
    const indexSrc = await readFile(new URL("../index.ts", import.meta.url), "utf-8");
    const routerSrc = await readFile(new URL("../router.ts", import.meta.url), "utf-8");
    // The screen registry is the deliverable; both the launcher and router must
    // consume it, or the registry is built-but-unused (snapshot-fidelity rule).
    expect(indexSrc).toContain('from "./screen-registry.ts"');
    expect(indexSrc).toContain("buildTuiScreenRegistry");
    expect(routerSrc).toContain('from "./screen-registry.ts"');
    expect(routerSrc).toContain("resolveColonRoute");
  });

  test("old-path resolution crawl — every tab-strip route and legacy nav entry resolves", async () => {
    // Migration value-preservation: enumerate the full route surface this PRD
    // reshapes and assert each resolves — never a not-found / unknown screen.
    const { TUI_TAB_STRIP, buildTuiScreenRegistry, resolveColonRoute } =
      await import("../screen-registry.ts");
    const { TuiRouter } = await import("../router.ts");
    const { listTuiNavigationEntries } = await import("../index.ts");

    const registry = buildTuiScreenRegistry();
    const router = new TuiRouter({
      routes: [{ path: "/", screenKey: "nav", title: "Root", render: () => "" }],
      screenRegistry: registry,
    });

    // 1. Every OD #tui-tabs route resolves to a registered screen.
    for (const tab of TUI_TAB_STRIP) {
      const key = resolveColonRoute(tab.label);
      expect(key).toBe(tab.screenKey);
      expect(router.resolveColon(tab.label)).toBe(tab.screenKey);
    }

    // 2. CLI-TUI-UX.md §6 colon aliases resolve (no 404 on alias routes).
    for (const alias of [":inbox", ":plans", ":tasks", ":list", ":artifacts"]) {
      expect(resolveColonRoute(alias)).toBeDefined();
    }

    // 3. The legacy Domain nav (24 feature buckets) is preserved, not removed —
    //    the stage nav is additive root chrome above it.
    const legacy = listTuiNavigationEntries();
    expect(legacy.length).toBeGreaterThanOrEqual(24);
    for (const label of ["Projects", "Tasks", "Docs", "Runs", "Doctor", "Audit"]) {
      expect(legacy.some((e) => e.label === label)).toBe(true);
    }
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
