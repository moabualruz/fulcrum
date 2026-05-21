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
import {
  ScreenRegistry,
  buildTuiScreenRegistry,
  resolveColonRoute,
} from "@fulcrum/tui/screen-registry.ts";
import { FakeTTY } from "@fulcrum/tui/testing/fake-tty.ts";
import { getDefaultKeybindings } from "@platform-core/application/input-bindings/index.ts";
import { buildTheme } from "@fulcrum/tui/theme/index.ts";
import {
  STAGE_CHORDS,
  STAGE_CHORD_PREFIX,
  TUI_CHORD_PREFIXES,
  createStageChordHandler,
  createChordLatch,
  type TraceYankClipboard,
} from "@fulcrum/tui/keybindings.ts";
import {
  Palette,
  PALETTE_SECTIONS,
  CLI_COMMAND_TREE,
  completeColonCommand,
  isKnownColonCommand,
} from "@fulcrum/tui/widgets/Palette.ts";
import {
  STAGE_CHORD_BINDINGS,
  COMMAND_SURFACE_BINDINGS,
  helpCheatsheetBindings,
  stageChordBindingsCoverChordMap,
} from "@fulcrum/tui/screens/palette.ts";

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
    tasks: {
      list: async () => [],
      update: async () => ({ id: "task-1", title: "Task 1", status: "todo" }),
      create: async () => ({ id: "task-1", title: "Task 1", status: "todo" }),
    },
    agent_runs: {
      list: async () => [
        {
          id: "run-1",
          agent: "codex",
          status: "running",
          taskTitle: "Run build",
          startedAt: "2026-05-21T00:00:00Z",
          traceId: "trace-live",
        },
      ],
      get: async () => ({
        id: "run-1",
        agent: "codex",
        status: "running",
        taskTitle: "Run build",
        startedAt: "2026-05-21T00:00:00Z",
        traceId: "trace-live",
      }),
      create: async () => ({
        id: "run-2",
        projectId: "fulcrum",
        taskId: "task-1",
        agent: "codex",
        status: "queued",
      }),
      cancel: async () => ({ ok: true }),
    },
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

    // OD StatusFooter: the active screen is the reverse-video `mode` pill —
    // an uppercased label, not the legacy `Screen:<label>` segment.
    expect(tty.plainText()).toContain("LAUNCHER");

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
    // "Create task" command-palette action routes to the Build Board screen
    // (where task creation lives) rather than the Projects screen. The OD
    // StatusFooter `mode` pill renders the screen label uppercased.
    expect(tty.plainText()).toContain("BUILD BOARD");

    app.stop();
  });
});

describe("TuiRouter route states", () => {
  it(":run and :run/<id> open the first-class run detail screen with dock tabs", async () => {
    const requestedRunIds: string[] = [];
    const tty = new FakeTTY({ columns: 120, rows: 32 });
    const app = new TuiApp({
      output: tty,
      caller: {
        ...fakeCaller(),
        agent_runs: {
          list: async () => [{
            id: "run-1",
            agent: "codex",
            status: "running",
            taskTitle: "Run build",
            startedAt: "2026-05-21T00:00:00Z",
          }],
          get: async (input) => {
            requestedRunIds.push(input.id);
            return {
              id: input.id,
              agent: "codex",
              status: "running",
              taskTitle: "Run build",
              startedAt: "2026-05-21T00:00:00Z",
              logLines: ["boot"],
            };
          },
          create: async () => ({
            id: "run-2",
            projectId: "fulcrum",
            taskId: "task-1",
            agent: "codex",
            status: "queued",
          }),
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
    // OD StatusFooter `mode` pill renders the screen label uppercased.
    expect(tty.plainText()).toContain("NOT FOUND");

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

// ─── StageChord key map (CLI-TUI-UX.md §7.2) ───────────────────────────────
//
// `g c/g p/g b/g B/g r/g s/g o` is the canonical stage navigation. agent-tui-
// review.md Critical finding 3 names the absent `g`-chord state machine a
// critical gap; these tests lock every chord to its stage screen.

describe("StageChord key map", () => {
  it("maps every g-chord second key to a stage colon route", () => {
    // CLI-TUI-UX.md §7.2 — `g B` is a distinct key from `g b`.
    expect(STAGE_CHORDS).toEqual({
      c: ":capture",
      p: ":plan",
      b: ":runs",
      B: ":board",
      r: ":review",
      s: ":ship",
      o: ":doctor",
    });
    expect(STAGE_CHORD_PREFIX).toBe("g");
  });

  it("every StageChord resolves to a registered stage screen", () => {
    const handler = createStageChordHandler();
    const registry = buildTuiScreenRegistry();
    for (const key of Object.keys(STAGE_CHORDS)) {
      const resolved = handler.resolve(key);
      expect(resolved).not.toBeNull();
      const screenKey = resolveColonRoute(resolved!.route);
      expect(screenKey).toBeDefined();
      // The chord opens a screen the canonical registry knows.
      expect(registry.has(screenKey!)).toBe(true);
    }
  });

  it("g b opens the runs feed and g B opens the Build board", () => {
    const handler = createStageChordHandler();
    expect(resolveColonRoute(handler.resolve("b")!.route)).toBe("runs");
    expect(resolveColonRoute(handler.resolve("B")!.route)).toBe("build-board");
  });

  it("rejects a stray second key instead of navigating", () => {
    const handler = createStageChordHandler();
    expect(handler.resolve("x")).toBeNull();
    expect(handler.resolve("z")).toBeNull();
    expect(handler.isChordKey("c")).toBe(true);
    expect(handler.isChordKey("x")).toBe(false);
  });
});

describe("chord-prefix latch — g / y two-key sequencing", () => {
  it("arms on g, then resolves g c as a StageChord", () => {
    const latch = createChordLatch(TUI_CHORD_PREFIXES);
    const handler = createStageChordHandler();

    const armed = latch.feed("g");
    expect(armed.kind).toBe("armed");
    expect(latch.armed).toBe(true);

    const chord = latch.feed("c");
    expect(chord.kind).toBe("chord");
    if (chord.kind === "chord") {
      expect(chord.prefix).toBe("g");
      expect(handler.resolve(chord.key)?.route).toBe(":capture");
    }
    expect(latch.armed).toBe(false);
  });

  it("Esc while armed cancels the chord without navigating", () => {
    const latch = createChordLatch(TUI_CHORD_PREFIXES);
    latch.feed("g");
    const cancelled = latch.feed("\x1b");
    expect(cancelled.kind).toBe("cancelled");
    expect(latch.armed).toBe(false);
  });

  it("a bare list-navigation key passes through, never latching", () => {
    const latch = createChordLatch(TUI_CHORD_PREFIXES);
    for (const key of ["j", "k", "Enter", "x", "/"]) {
      const out = latch.feed(key);
      expect(out.kind).toBe("passthrough");
      expect(latch.armed).toBe(false);
    }
  });

  it("the y trace-yank prefix latches independently of g", () => {
    // CLI-TUI-UX.md §7.6 — `y` is the second chord family; it must not collide
    // with the `g` StageChord prefix or with list navigation.
    const latch = createChordLatch(TUI_CHORD_PREFIXES);
    expect(TUI_CHORD_PREFIXES).toEqual(["g", "y"]);
    const armed = latch.feed("y");
    expect(armed.kind).toBe("armed");
    if (armed.kind === "armed") expect(armed.prefix).toBe("y");
    const chord = latch.feed("t");
    expect(chord.kind).toBe("chord");
    if (chord.kind === "chord") expect(chord.prefix).toBe("y");
  });
});

describe("FulcrumTui live shell StageChord wiring", () => {
  for (const [secondKey, expectedText] of [
    ["c", "fulcrum · :capture"],
    ["p", "fulcrum · :plan"],
    ["b", "RUNS"],
    ["B", "BUILD BOARD"],
    ["r", "fulcrum · :review"],
    ["s", "ARTIFACTS"],
    ["o", "DOCTOR"],
  ] as const) {
    it(`routes g ${secondKey} through FulcrumTui.handleKey`, async () => {
      const tty = new FakeTTY();
      const app = await launchTui({ output: tty, input: tty, caller: fakeCaller() });

      await app.handleKey("g");
      const before = tty.plainText();
      await app.handleKey(secondKey);

      expect(before).toContain("LAUNCHER");
      expect(tty.plainText()).toContain(expectedText);
      app.stop();
    });
  }

  it("bare g and y only arm chords and do not move the root selection", async () => {
    const tty = new FakeTTY();
    const app = await launchTui({ output: tty, input: tty, caller: fakeCaller() });
    const before = tty.plainText();

    await app.handleKey("g");
    await app.handleKey("\x1b");
    await app.handleKey("y");
    await app.handleKey("\x1b");

    expect(tty.plainText()).toContain("LAUNCHER");
    expect(tty.plainText()).toContain("Stage: Capture  route::capture  chord:g c");
    expect(before).toContain("Stage: Capture  route::capture  chord:g c");
    app.stop();
  });
});

describe("FulcrumTui live shell ColonPalette wiring", () => {
  it("opens with : and routes a known command through navigateColon", async () => {
    const tty = new FakeTTY({ columns: 100, rows: 40 });
    const app = await launchTui({ output: tty, input: tty, caller: fakeCaller() });

    await app.handleKey(":");
    expect(tty.plainText()).toContain("palette · type to filter");

    for (const key of ["d", "o", "c", "t"]) await app.handleKey(key);
    await app.handleKey("\t");
    await app.handleKey("\r");

    expect(tty.plainText()).toContain("DOCTOR");
    app.stop();
  });

  it("Esc cancels the : palette without routing", async () => {
    const tty = new FakeTTY({ columns: 100, rows: 40 });
    const app = await launchTui({ output: tty, input: tty, caller: fakeCaller() });

    await app.handleKey(":");
    tty.clear();
    await app.handleKey("\x1b");

    expect(tty.plainText()).toContain("LAUNCHER");
    expect(tty.plainText()).not.toContain("palette · type to filter");
    app.stop();
  });
});

describe("FulcrumTui live shell TraceYank wiring", () => {
  it("copies trace, run, span, and project identities through y chords", async () => {
    const copied: string[] = [];
    const clipboard: TraceYankClipboard = { write: (text) => copied.push(text) };
    const tty = new FakeTTY();
    const app = await launchTui({
      output: tty,
      input: tty,
      caller: fakeCaller(),
      traceContext: {
        projectId: "/Users/mkh/workspace/fulcrum",
        runId: "run-live",
        spanId: "span-live",
        traceId: "trace-live",
      },
      traceYankClipboard: clipboard,
    });

    for (const key of ["t", "r", "s", "p"] as const) {
      await app.handleKey("y");
      await app.handleKey(key);
    }

    expect(copied).toEqual([
      "trace-live",
      "run-live",
      "span-live",
      "/Users/mkh/workspace/fulcrum",
    ]);
    expect(tty.plainText()).toContain("Yanked trace trace-live");
    expect(tty.plainText()).toContain("Yanked project /Users/mkh/workspace/fulcrum");
    app.stop();
  });
});

// ─── ColonPalette command grammar (CLI-TUI-UX.md §7.1, §9) ──────────────────

describe("ColonPalette CLI command grammar", () => {
  it("tab-completes a partial verb against the CLI command tree", () => {
    // `:run` → run, runs — every tree verb with that prefix.
    const runCandidates = completeColonCommand(":run");
    expect(runCandidates).toContain("run");
    expect(runCandidates).toContain("runs");
    // `:r` → run, runs, routing, routes, repos, review — real fulcrum verbs.
    const rCandidates = completeColonCommand(":r");
    expect(rCandidates).toContain("routing");
    expect(rCandidates).toContain("routes");
    expect(rCandidates).toContain("review");
  });

  it("tab-completes a subcommand after a verb", () => {
    // `:run n` → `run new` (CLI-TUI-UX.md §9.1 `:run new`).
    expect(completeColonCommand(":run n")).toEqual(["run new"]);
    // `:agent invoke` is the §9.1 example command.
    expect(completeColonCommand(":agent i")).toEqual(["agent invoke"]);
  });

  it("recognises the §9.1 example commands as known", () => {
    expect(isKnownColonCommand(":run new")).toBe(true);
    expect(isKnownColonCommand(":doctor")).toBe(true);
    expect(isKnownColonCommand(":agent invoke")).toBe(true);
    // An unknown command is never runnable.
    expect(isKnownColonCommand(":frobnicate")).toBe(false);
    expect(isKnownColonCommand(":run bogus")).toBe(false);
  });

  it("mirrors the workflow stages — every stage verb is in the tree", () => {
    const verbs = new Set(CLI_COMMAND_TREE.map((n) => n.verb));
    for (const verb of ["capture", "runs", "review", "artifacts", "doctor", "ai"]) {
      expect(verbs.has(verb)).toBe(true);
    }
  });

  it("Tab completes the query and Enter only fires a known command", () => {
    const fired: string[] = [];
    const palette = new Palette({
      width: 64,
      height: 24,
      items: [],
      mode: "colon",
      onAction: (cmd) => fired.push(cmd),
    });
    palette.open();
    palette.setQuery(":doct");
    palette.handleKey("tab"); // completes to the single matching verb
    expect(palette.currentQuery).toBe("doctor");
    palette.handleKey("enter");
    expect(fired).toEqual(["doctor"]);

    // Unknown command — Enter must not fire onAction.
    fired.length = 0;
    palette.setQuery(":frobnicate");
    palette.handleKey("enter");
    expect(fired).toEqual([]);
  });

  it("Esc cancels the ColonPalette without running anything", () => {
    const fired: string[] = [];
    const palette = new Palette({
      width: 64,
      height: 24,
      items: [],
      mode: "colon",
      onAction: (cmd) => fired.push(cmd),
    });
    palette.open();
    palette.setQuery(":doctor");
    palette.handleKey("escape");
    expect(palette.isOpen).toBe(false);
    expect(fired).toEqual([]);
  });
});

describe("ColonPalette OD section structure (tui-runs.html)", () => {
  it("renders the five OD section headers in order", () => {
    expect(PALETTE_SECTIONS.map((s) => s.header)).toEqual([
      "stages",
      "step actions",
      "search",
      "agents · MCP · plugins · routes",
      "system",
    ]);
  });

  it("the stages section lists every StageChord with its g-chord hint", () => {
    const stages = PALETTE_SECTIONS.find((s) => s.header === "stages")!;
    const hints = stages.commands.map((c) => c.hint);
    expect(hints).toEqual([
      "g c",
      "g p",
      "g b",
      "g B",
      "g r",
      "g s",
      "g o",
      ":run",
    ]);
  });

  it("renders the OD section structure as a snapshot when opened empty", () => {
    // Height budget large enough to render every OD section + chrome.
    const palette = new Palette({ width: 70, height: 40, items: [], mode: "colon" });
    palette.open();
    const text = palette.render().join("\n");
    // OD `tui-runs.html` palette copy — section headers + the `›` prompt.
    expect(text).toContain("palette · type to filter");
    expect(text).toContain("stages");
    expect(text).toContain("step actions");
    expect(text).toContain("search");
    expect(text).toContain("agents · MCP · plugins · routes");
    expect(text).toContain("system");
    expect(text).toContain("open Capture");
    expect(text).toContain("g c");
    expect(text).toContain("keyboard cheatsheet");
  });

  it("renders CLI-command completions once a query is typed", () => {
    const palette = new Palette({ width: 70, height: 28, items: [], mode: "colon" });
    palette.open();
    palette.setQuery(":r");
    const text = palette.render().join("\n");
    expect(text).toContain(":run");
    expect(text).toContain(":runs");
    expect(text).toContain(":routing");
  });
});

describe("help cheatsheet StageChord coverage", () => {
  it("the help cheatsheet lists every StageChord", () => {
    expect(STAGE_CHORD_BINDINGS.map((b) => b.key)).toEqual([
      "g c",
      "g p",
      "g b",
      "g B",
      "g r",
      "g s",
      "g o",
    ]);
    // The cheatsheet rows agree with the keybindings.ts STAGE_CHORDS map.
    expect(stageChordBindingsCoverChordMap()).toBe(true);
  });

  it("the help cheatsheet separates `:` palette from `/` search", () => {
    const surfaces = COMMAND_SURFACE_BINDINGS.map((b) => `${b.key}=${b.action}`);
    // `:` is the command palette; `/` (foundation) is in-screen search.
    expect(surfaces.some((s) => s.startsWith(":=Open command palette"))).toBe(true);
    const cheatsheet = helpCheatsheetBindings();
    const slash = cheatsheet.find((b) => b.key === "/");
    expect(slash?.action).toBe("Search/filter current screen");
    // The full cheatsheet carries the StageChord rows.
    expect(cheatsheet.some((b) => b.key === "g b")).toBe(true);
  });
});
