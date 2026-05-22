import { describe, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";

import {
  REQUIRED_SURFACE_DOMAINS,
  listMissingTuiDomains,
} from "@platform-core/application/interface-parity/surface-domain-matrix.ts";
import { FakeTTY } from "../testing/fake-tty.ts";
import { TuiApp, type TuiCaller } from "../index.ts";
import type { Renderer } from "../renderer.ts";

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
    // The legacy footer rendered a raw user email: the OD footer never does.
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
// tests compare CONCRETE labels and order against OD: not placeholder text.
// ───────────────────────────────────────────────────────────────────────────

describe("TUI root navigation: OD stage launcher parity", () => {
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

    // OD tui-runs.html #tui-tabs: sixteen buttons, exact order.
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

  test(":run and :run/<id> open the first-class run detail route", async () => {
    const requestedRunIds: string[] = [];
    const tty = new FakeTTY({ columns: 120, rows: 32 });
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: {
        ...createCaller(),
        agent_runs: {
          list: async () => [{
            id: "run-1",
            agent: "codex",
            status: "running",
            taskTitle: "Ship TUI parity",
            projectName: "Fulcrum",
            logLines: ["boot"],
          }],
          get: async (input) => {
            requestedRunIds.push(input.id);
            return {
              id: input.id,
              agent: "codex",
              status: "running",
              taskTitle: "Ship TUI parity",
              projectName: "Fulcrum",
              logLines: ["boot"],
            };
          },
          create: async (input) => ({ id: "run-2", agent: input.agent, status: "queued" }),
          cancel: async () => ({ ok: true }),
        },
      },
    });
    await app.mount();

    expect(await app.navigateColon(":run")).toBe("run");
    expect(tty.plainText()).toContain("Run › run-1");

    expect(await app.navigateColon(":run/run-42")).toBe("run");
    const rendered = tty.plainText();
    expect(rendered).toContain("Run › run-42");
    for (const tab of ["Shell", "Files", "Browser", "Plan", "Cost"]) {
      expect(rendered).toContain(tab);
    }
    expect(requestedRunIds).toEqual(["run-1", "run-42"]);

    app.stop();
  });

  test("stage chords open canonical capture, plan, and review workbenches", async () => {
    const cases = [
      { chord: "c", heading: "Capture", chrome: "fulcrum · :capture", mode: "CAPTURE" },
      { chord: "p", heading: "Plan", chrome: "fulcrum · :plan", mode: "PLAN" },
      { chord: "r", heading: "Review", chrome: "fulcrum · :review", mode: "REVIEW" },
    ] as const;

    for (const expected of cases) {
      const tty = new FakeTTY({ columns: 120, rows: 32 });
      const app = new TuiApp({ output: tty, input: tty, caller: createCaller() });
      await app.mount();

      await app.handleKey("g");
      await app.handleKey(expected.chord);

      const rendered = tty.plainText();
      expect(rendered).toContain(expected.heading);
      expect(rendered).toContain(expected.chrome);
      expect(rendered).toContain(expected.mode);
      expect(rendered).toContain("AI Assist [:ai]");

      app.stop();
    }
  });

  test("runs and doctor routes open canonical workbenches", async () => {
    const cases = [
      { route: ":runs", chord: "b", chrome: "fulcrum · :runs", heading: "Build", pane: "live agent sessions" },
      { route: ":doctor", chord: "o", chrome: "fulcrum · :doctor", heading: "Operate", pane: "status spine" },
    ] as const;

    for (const expected of cases) {
      const routeTty = new FakeTTY({ columns: 120, rows: 32 });
      const routeApp = new TuiApp({ output: routeTty, input: routeTty, caller: createCaller() });
      await routeApp.mount();
      await routeApp.navigateColon(expected.route);

      const routeRendered = routeTty.plainText();
      expect(routeApp.screen).not.toBe("nav");
      expect(routeRendered).toContain(expected.heading);
      expect(routeRendered).toContain(expected.chrome);
      expect(routeRendered).toContain("step modes");
      expect(routeRendered).toContain(expected.pane);
      routeApp.stop();

      const chordTty = new FakeTTY({ columns: 120, rows: 32 });
      const chordApp = new TuiApp({ output: chordTty, input: chordTty, caller: createCaller() });
      await chordApp.mount();
      await chordApp.handleKey("g");
      await chordApp.handleKey(expected.chord);

      const chordRendered = chordTty.plainText();
      expect(chordApp.screen).not.toBe("nav");
      expect(chordRendered).toContain(expected.heading);
      expect(chordRendered).toContain(expected.chrome);
      expect(chordRendered).toContain("step modes");
      expect(chordRendered).toContain(expected.pane);
      chordApp.stop();
    }
  });

  test("focused run route drives the visible footer and trace yanks", async () => {
    const copied: string[] = [];
    const tty = new FakeTTY({ columns: 140, rows: 40 });
    const app = new TuiApp({
      output: tty,
      input: tty,
      caller: {
        ...createCaller(),
        agent_runs: {
          list: async () => [{
            id: "run-root",
            agent: "codex",
            status: "running",
            taskTitle: "Root run",
            projectName: "Fulcrum",
          }],
          get: async (input) => ({
            id: input.id,
            agent: "codex",
            status: "running",
            taskTitle: "Focused run",
            projectName: "Fulcrum",
            logLines: ["boot"],
            traceId: `trace-${input.id}`,
            spanId: `span-${input.id}`,
          }),
          create: async (input) => ({ id: "run-new", agent: input.agent, status: "queued" }),
          cancel: async () => ({ ok: true }),
        },
      },
      traceContext: {
        projectId: "fulcrum",
        runId: "run-root",
        spanId: "span-root",
        traceId: "trace-root",
      },
      traceYankClipboard: { write: (value) => copied.push(value) },
    });
    await app.mount();
    await app.navigateColon(":run/run-42");

    const rendered = tty.plainText();
    expect(rendered).toContain("RUN DETAIL");
    expect(rendered).toContain("run: run-42");
    expect(rendered).toContain("trace:run-42");
    expect(rendered).toContain("span-run-42");

    for (const key of ["t", "r", "s"] as const) {
      await app.handleKey("y");
      await app.handleKey(key);
    }
    expect(copied).toEqual(["trace-run-42", "run-42", "span-run-42"]);

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

  test("old-path resolution crawl: every tab-strip route and legacy nav entry resolves", async () => {
    // Migration value-preservation: enumerate the full route surface this PRD
    // reshapes and assert each resolves: never a not-found / unknown screen.
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

    // 3. The legacy Domain nav (24 feature buckets) is preserved, not removed -
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

// ───────────────────────────────────────────────────────────────────────────
// prd-tui-stage-workbenches-set: Plan / Review / Board stage workbenches.
//
// Each stage colon route opens a dense workbench rendering the OD
// `tui-runs.html` stage chrome: a `fulcrum · :<route> · <purpose>` header
// carrying the exact stage name, the StatusFooter strip, and the shared
// empty-state / error-frame contract. Snapshots are locked at 80x24 and
// 120x32 so the layout holds at the minimum and a wide terminal.
// ───────────────────────────────────────────────────────────────────────────

describe("TUI stage workbenches: Plan / Review / Board OD parity", () => {
  async function snapshot(
    cols: number,
    rows: number,
    screen: { load: () => Promise<void>; render: (r: Renderer) => void },
  ): Promise<string> {
    const { Renderer } = await import("../renderer.ts");
    await screen.load();
    const tty = new FakeTTY({ columns: cols, rows });
    screen.render(new Renderer(tty));
    return tty.plainText();
  }

  test("Plan workbench (:plan) renders stage chrome + footer at 80x24 and 120x32", async () => {
    const { PlanningScreen } = await import("../screens/planning-screen.ts");
    for (const [cols, rows] of [[80, 24], [120, 32]] as const) {
      const screen = new PlanningScreen({
        projectLabel: "auth/rewrite",
        traceId: "tr_8f29a4c1b3e0",
        mcp: "7/7",
        caller: {
          planning: {
            getState: async () => ({
              activeSessions: [
                { id: "s1", title: "oauth/refresh", status: "planning", mode: "guided", agentName: "claude-opus-4.7" },
              ],
              recentSessions: [],
            }),
            startGuided: async () => ({ id: "s2", title: "guided", status: "planning", mode: "guided" }),
            startFreeform: async () => ({ id: "s3", title: "freeform", status: "planning", mode: "freeform" }),
          },
        },
      });
      const snap = await snapshot(cols, rows, screen);
      expect(snap).toContain("Plan");
      expect(snap).toContain("fulcrum · :plan · live planning");
      expect(snap).toContain("PLAN");
      expect(snap).toContain("trace tr_8f29a4");
    }
  });

  test("Plan workbench empty + error states match the shared contract", async () => {
    const { PlanningScreen } = await import("../screens/planning-screen.ts");
    const empty = new PlanningScreen({
      caller: {
        planning: {
          getState: async () => ({ activeSessions: [], recentSessions: [] }),
          startGuided: async () => ({ id: "x", title: "x", status: "idle", mode: "guided" }),
          startFreeform: async () => ({ id: "x", title: "x", status: "idle", mode: "freeform" }),
        },
      },
    });
    const emptySnap = await snapshot(80, 24, empty);
    expect(emptySnap).toContain("No planning sessions in this stage yet.");
    expect(emptySnap).toContain("Press G for a guided session or F for freeform.");

    const failing = new PlanningScreen({
      traceId: "tr_56e3d12",
      caller: {
        planning: {
          getState: async () => {
            throw new Error("planning service offline");
          },
          startGuided: async () => ({ id: "x", title: "x", status: "idle", mode: "guided" }),
          startFreeform: async () => ({ id: "x", title: "x", status: "idle", mode: "freeform" }),
        },
      },
    });
    const errSnap = await snapshot(120, 32, failing);
    expect(errSnap).toContain("Planning state failed to load.");
    expect(errSnap).toContain("trace=tr_56e3d12");
  });

  test("Review workbench (:review) renders stage chrome + footer at 80x24 and 120x32", async () => {
    const { ReviewScreen } = await import("../screens/review-screen.ts");
    for (const [cols, rows] of [[80, 24], [120, 32]] as const) {
      const screen = new ReviewScreen({
        projectLabel: "auth/rewrite",
        traceId: "tr_8f29a4c1b3e0",
        mcp: "6/7",
        caller: {
          reviews: {
            listSessions: async () => [
              { id: "r1", title: "PR #4218", status: "in_progress", reviewer: "jb" },
            ],
            getSession: async () => ({ id: "r1", title: "PR #4218", status: "in_progress" }),
            startReview: async () => ({ id: "r2", title: "new", status: "draft" }),
            approve: async () => ({ ok: true }),
            requestChanges: async () => ({ ok: true }),
            saveSession: async () => ({ ok: true }),
          },
        },
      });
      const snap = await snapshot(cols, rows, screen);
      expect(snap).toContain("Review");
      expect(snap).toContain("fulcrum · :review · review queue");
      expect(snap).toContain("REVIEW");
      expect(snap).toContain("trace tr_8f29a4");
    }
  });

  test("Review workbench empty state matches the shared contract", async () => {
    const { ReviewScreen } = await import("../screens/review-screen.ts");
    const screen = new ReviewScreen({
      caller: {
        reviews: {
          listSessions: async () => [],
          getSession: async () => ({ id: "x", title: "x", status: "draft" }),
          startReview: async () => ({ id: "x", title: "x", status: "draft" }),
          approve: async () => ({ ok: true }),
          requestChanges: async () => ({ ok: true }),
          saveSession: async () => ({ ok: true }),
        },
      },
    });
    const snap = await snapshot(80, 24, screen);
    expect(snap).toContain("No review sessions in this stage yet.");
    expect(snap).toContain("Press R to start a review.");
  });

  test("Build board workbench (:board) renders stage chrome + footer at 80x24 and 120x32", async () => {
    const { TaskBoardScreen } = await import("../screens/task-board.ts");
    for (const [cols, rows] of [[80, 24], [120, 32]] as const) {
      const screen = new TaskBoardScreen({
        projectLabel: "auth/rewrite",
        cycleLabel: "cycle 24w13",
        traceId: "tr_8f29a4c1b3e0",
        mcp: "7/7",
        caller: {
          tasks: {
            list: async () => [
              { id: "t1", orgId: "o", title: "per-kid rate limit", status: "todo" },
            ],
            update: async (i) => ({ id: i.id, orgId: "o", title: "x", status: i.status }),
            create: async (i) => ({ id: "t2", orgId: "o", title: i.title, status: i.status }),
          },
        },
      });
      const snap = await snapshot(cols, rows, screen);
      expect(snap).toContain("Build");
      expect(snap).toContain("fulcrum · :board · task board");
      expect(snap).toContain("BUILD");
      expect(snap).toContain("cycle 24w13");
    }
  });

  test("Build board workbench empty state matches the shared contract", async () => {
    const { TaskBoardScreen } = await import("../screens/task-board.ts");
    const screen = new TaskBoardScreen({
      caller: {
        tasks: {
          list: async () => [],
          update: async (i) => ({ id: i.id, orgId: "o", title: "x", status: i.status }),
          create: async (i) => ({ id: "t", orgId: "o", title: i.title, status: i.status }),
        },
      },
    });
    const snap = await snapshot(80, 24, screen);
    expect(snap).toContain("No tasks on this board yet.");
    expect(snap).toContain("Press c to create a task.");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// prd-tui-status-empty-error-contract: the shared 8-state status vocabulary
// and empty/error contract on the runs / planning / review screens.
//
// CLI-TUI-UX.md §11 locks an 8-state status badge vocabulary (glyph + label,
// never colour-only); CLI-TUI-UX.md §5 + COPY.md §2/§3 lock the empty-state
// (one sentence + one action) and error-frame (`trace=<id>`) contracts. These
// tests assert the EXACT badge labels and copy shape: not substrings: so the
// vocabulary cannot drift screen to screen.
// ───────────────────────────────────────────────────────────────────────────

describe("TUI status vocabulary + empty/error contract: runs/planning/review", () => {
  async function snapshotScreen(
    cols: number,
    rows: number,
    screen: { load: () => Promise<void>; render: (r: Renderer) => void },
  ): Promise<string> {
    const { Renderer } = await import("../renderer.ts");
    await screen.load();
    const tty = new FakeTTY({ columns: cols, rows });
    screen.render(new Renderer(tty));
    return tty.plainText();
  }

  test("runs screen renders the canonical 8-state badges, not ad hoc bracket labels", async () => {
    const { RunsScreen } = await import("../screens/runs.ts");
    const screen = new RunsScreen({
      caller: {
        agent_runs: {
          list: async () => [
            { id: "r1", agent: "codex", status: "running", taskTitle: "a", projectName: "p" },
            { id: "r2", agent: "claude", status: "succeeded", taskTitle: "b", projectName: "p" },
            { id: "r3", agent: "gemini", status: "failed", taskTitle: "c", projectName: "p" },
          ],
          create: async () => ({ id: "x", agent: "codex", status: "running" }),
        },
      },
    });
    const snap = await snapshotScreen(120, 32, screen);
    // Exact glyph + UPPERCASE label: `succeeded` folds onto COMPLETE.
    expect(snap).toContain("● RUNNING");
    expect(snap).toContain("✓ COMPLETE");
    expect(snap).toContain("✗ FAILED");
    // The legacy ad hoc bracket labels are gone.
    expect(snap).not.toContain("[running]");
    expect(snap).not.toContain("[completed]");
  });

  test("runs screen empty + error states match the shared contract", async () => {
    const { RunsScreen } = await import("../screens/runs.ts");
    const empty = new RunsScreen({
      caller: {
        agent_runs: {
          list: async () => [],
          create: async () => ({ id: "x", agent: "codex", status: "running" }),
        },
      },
    });
    const emptySnap = await snapshotScreen(80, 24, empty);
    expect(emptySnap).toContain("No runs yet in this project.");
    expect(emptySnap).toContain("Press d to dispatch the first run.");

    const failing = new RunsScreen({
      traceId: "tr_4f3a1c9e",
      caller: {
        agent_runs: {
          list: async () => {
            throw new Error("runs service offline");
          },
          create: async () => ({ id: "x", agent: "codex", status: "running" }),
        },
      },
    });
    const errSnap = await snapshotScreen(120, 32, failing);
    expect(errSnap).toContain("Runs feed failed to load.");
    expect(errSnap).toContain("trace=tr_4f3a1c9e");
  });

  test("planning screen renders canonical status badges for session states", async () => {
    const { PlanningScreen } = await import("../screens/planning-screen.ts");
    const screen = new PlanningScreen({
      caller: {
        planning: {
          getState: async () => ({
            activeSessions: [
              { id: "s1", title: "oauth", status: "planning", mode: "guided" },
            ],
            recentSessions: [
              { id: "s2", title: "rbac", status: "approved", mode: "freeform" },
              { id: "s3", title: "audit", status: "awaiting_review", mode: "guided" },
            ],
          }),
          startGuided: async () => ({ id: "x", title: "x", status: "idle", mode: "guided" }),
          startFreeform: async () => ({ id: "x", title: "x", status: "idle", mode: "freeform" }),
        },
      },
    });
    const snap = await snapshotScreen(120, 32, screen);
    // `planning` → RUNNING, `approved` → COMPLETE, `awaiting_review` → AWAITING.
    expect(snap).toContain("● RUNNING");
    expect(snap).toContain("✓ COMPLETE");
    expect(snap).toContain("⌛ AWAITING");
  });

  test("review screen renders canonical badges for QA criteria and sessions", async () => {
    const { ReviewScreen } = await import("../screens/review-screen.ts");
    const screen = new ReviewScreen({
      caller: {
        reviews: {
          listSessions: async () => [
            {
              id: "r1",
              title: "PR #4218",
              status: "changes_requested",
              criteria: [
                { name: "lint", status: "pass" },
                { name: "types", status: "fail" },
                { name: "e2e", status: "pending" },
              ],
            },
          ],
          getSession: async () => ({ id: "r1", title: "PR #4218", status: "in_progress" }),
          startReview: async () => ({ id: "r2", title: "new", status: "draft" }),
          approve: async () => ({ ok: true }),
          requestChanges: async () => ({ ok: true }),
          saveSession: async () => ({ ok: true }),
        },
      },
    });
    const snap = await snapshotScreen(120, 32, screen);
    // QA criteria: `pass` → COMPLETE, `fail` → FAILED, `pending` → PENDING.
    expect(snap).toContain("✓ COMPLETE");
    expect(snap).toContain("✗ FAILED");
    expect(snap).toContain("◌ PENDING");
    // Session status: `changes_requested` → BLOCKED.
    expect(snap).toContain("⏸ BLOCKED");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// prd-tui-step-modepicker-006: the shared per-Step ModePicker row.
//
// Every Step-bearing TUI screen renders one ModePicker row carrying the four
// canonical modes: ✋ Manual / ▶ Play / 💬 Discuss / ⊞ AI Assist: the same
// action set as the web `@fulcrum/ui-kit` ModeRow. The direct p/d/m keys match
// CLI-TUI-UX.md §7.4: Play opens a picker, Discuss opens a thread, and m opens
// the picker without committing a mode.
// ───────────────────────────────────────────────────────────────────────────

describe("TUI per-Step ModePicker: runs / review / board / artifacts / doctor", () => {
  async function renderAsync(
    cols: number,
    rows: number,
    screen: { load: () => Promise<void>; render: (r: Renderer) => void },
  ): Promise<string> {
    const { Renderer } = await import("../renderer.ts");
    await screen.load();
    const tty = new FakeTTY({ columns: cols, rows });
    screen.render(new Renderer(tty));
    return tty.plainText();
  }

  function assertModeRow(snap: string): void {
    // The row label + all four mode labels (copy_assertion).
    expect(snap).toContain("step modes");
    expect(snap).toContain("✋ Manual");
    expect(snap).toContain("▶ Play");
    expect(snap).toContain("💬 Discuss");
    expect(snap).toContain("⊞ AI Assist");
    // CLI-TUI-UX §7.4 bare-key hints (interaction_assertion).
    expect(snap).toContain("[m]");
    expect(snap).toContain("[p]");
    expect(snap).toContain("[d]");
    expect(snap).toContain("[:ai]");
  }

  test("Build runs workbench (runs-screen.ts) renders the ModePicker row", async () => {
    const { RunsControlScreen } = await import("../screens/runs-screen.ts");
    const screen = new RunsControlScreen({
      caller: {
        agent_runs: {
          list: async () => [
            { id: "run-1", agent: "codex", status: "running", taskTitle: "t", projectName: "p" },
          ],
          dispatch: async () => ({ id: "x", agent: "codex", status: "queued" }),
          cancel: async () => ({ ok: true }),
          retry: async () => ({ id: "run-1", agent: "codex", status: "running" }),
          getDeps: async () => [],
        },
      },
    });
    assertModeRow(await renderAsync(120, 32, screen));
  });

  test("Review workbench (review-screen.ts) renders the ModePicker row", async () => {
    const { ReviewScreen } = await import("../screens/review-screen.ts");
    const screen = new ReviewScreen({
      caller: {
        reviews: {
          listSessions: async () => [
            { id: "r1", title: "PR #4218", status: "in_progress", reviewer: "jb" },
          ],
          getSession: async () => ({ id: "r1", title: "PR #4218", status: "in_progress" }),
          startReview: async () => ({ id: "r2", title: "new", status: "draft" }),
          approve: async () => ({ ok: true }),
          requestChanges: async () => ({ ok: true }),
          saveSession: async () => ({ ok: true }),
        },
      },
    });
    assertModeRow(await renderAsync(120, 32, screen));
  });

  test("Build board workbench (task-board.ts) renders the ModePicker row", async () => {
    const { TaskBoardScreen } = await import("../screens/task-board.ts");
    const screen = new TaskBoardScreen({
      caller: {
        tasks: {
          list: async () => [{ id: "t1", orgId: "o", title: "rate limit", status: "todo" }],
          update: async (i) => ({ id: i.id, orgId: "o", title: "x", status: i.status }),
          create: async (i) => ({ id: "t2", orgId: "o", title: i.title, status: i.status }),
        },
      },
    });
    assertModeRow(await renderAsync(120, 32, screen));
  });

  test("Ship artifacts workbench (artifacts.ts) renders the ModePicker row", async () => {
    const { ArtifactsScreen } = await import("../screens/artifacts.ts");
    const screen = new ArtifactsScreen({
      caller: {
        artifacts: {
          list: async () => [
            { id: "a1", filename: "build.log", mime: "text/plain", path: "/a/build.log" },
          ],
          get: async () => null,
          upload: async () => ({ id: "a2", path: "/a/x" }),
          download: async () => ({ ok: true, path: "/a/x" }),
          archive: async () => ({ ok: true, id: "a1" }),
          delete: async () => ({ ok: true, id: "a1" }),
        },
      },
    });
    assertModeRow(await renderAsync(140, 40, screen));
  });

  test("Operate doctor workbench (doctor.ts) renders the ModePicker row", async () => {
    const { DoctorScreen } = await import("../screens/doctor.ts");
    const { Renderer } = await import("../renderer.ts");
    const screen = new DoctorScreen({
      results: [
        {
          name: "tui.render",
          subsystem: "tui",
          status: "ok",
          message: "render gate passes",
          durationMs: 4,
        },
      ],
    });
    const tty = new FakeTTY({ columns: 120, rows: 32 });
    screen.render(new Renderer(tty));
    assertModeRow(tty.plainText());
  });

  test("bare p/d/m execute the Step ModePicker contract on the runs workbench", async () => {
    const { RunsControlScreen } = await import("../screens/runs-screen.ts");
    const screen = new RunsControlScreen({
      caller: {
        agent_runs: {
          list: async () => [
            { id: "run-1", agent: "codex", status: "running", taskTitle: "t", projectName: "p" },
          ],
          dispatch: async () => ({ id: "x", agent: "codex", status: "queued" }),
          cancel: async () => ({ ok: true }),
          retry: async () => ({ id: "run-1", agent: "codex", status: "running" }),
          getDeps: async () => [],
        },
      },
    });
    await screen.load();

    expect(await screen.handleKey("p")).toBe(true);
    expect(screen.currentStepMode).toBe("play");
    expect(await screen.handleKey("d")).toBe(true);
    expect(screen.currentStepMode).toBe("discuss");
    expect(await screen.handleKey("m")).toBe(true);
    expect(screen.currentStepMode).toBe("discuss");
    expect(await screen.handleKey("D")).toBe(true);
    expect(screen.currentStepMode).toBe("discuss");
  });

  test("bare p/d/m execute the Step ModePicker contract on the doctor workbench", async () => {
    const { DoctorScreen } = await import("../screens/doctor.ts");
    const screen = new DoctorScreen({
      results: [
        {
          name: "tui.render",
          subsystem: "tui",
          status: "ok",
          message: "ok",
          durationMs: 2,
        },
      ],
    });
    expect(await screen.handleKey("p")).toBe(true);
    expect(screen.currentStepMode).toBe("play");
    expect(await screen.handleKey("d")).toBe(true);
    expect(screen.currentStepMode).toBe("discuss");
    expect(await screen.handleKey("m")).toBe(true);
    expect(screen.currentStepMode).toBe("discuss");
  });
});
