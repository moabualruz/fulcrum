/**
 * Global widgets TDD tests — P15#02.
 *
 * RED phase: all tests written against not-yet-existing widget implementations.
 * Covers: Palette, VirtualList, StatusBar, HelpOverlay, FilterChips, AsciiChart, wcwidth truncate.
 */

import { describe, it, expect } from "bun:test";
import { FakeTTY, stripAnsi } from "@fulcrum/tui/testing/fake-tty.ts";
import { Renderer } from "@fulcrum/tui/renderer.ts";

// ─── wcwidth-aware truncate ─────────────────────────────────────────────────

import { truncateWide } from "@fulcrum/tui/utils/truncate.ts";

describe("truncateWide (wcwidth)", () => {
  it("truncates CJK double-width chars correctly", () => {
    // 中(2) 文(2) a(1) b(1) c(1) = 7 visual cols
    expect(truncateWide("中文abc", 6)).toBe("中文a…");
  });

  it("handles pure ASCII", () => {
    expect(truncateWide("hello world", 5)).toBe("hell…");
  });

  it("returns string unchanged when it fits", () => {
    expect(truncateWide("abc", 10)).toBe("abc");
  });

  it("handles emoji widths", () => {
    // Most emoji are width 2 in wcwidth
    const result = truncateWide("🎉ab", 4);
    // 🎉=2, a=1, b=1 → total 4, fits exactly
    expect(truncateWide("🎉ab", 4)).toBe("🎉ab");
    // Now truncate to 3: 🎉=2, a=1 → 3, fits
    expect(truncateWide("🎉abc", 3)).toBe("🎉…");
  });

  it("handles empty string", () => {
    expect(truncateWide("", 5)).toBe("");
  });
});

// ─── VirtualList ────────────────────────────────────────────────────────────

import { VirtualList } from "@fulcrum/tui/widgets/VirtualList.ts";

describe("VirtualList", () => {
  it("renders 1000-item list without blank rows", () => {
    const items = Array.from({ length: 1000 }, (_, i) => `Item ${i}`);
    const vl = new VirtualList({ items, visibleRows: 20, renderItem: (item) => item });
    const lines = vl.render();
    expect(lines).toHaveLength(20);
    expect(lines.every((l) => l.length > 0)).toBe(true);
  });

  it("scrolls to last row", () => {
    const items = Array.from({ length: 1000 }, (_, i) => `Item ${i}`);
    const vl = new VirtualList({ items, visibleRows: 20, renderItem: (item) => item });
    vl.scrollToEnd();
    const lines = vl.render();
    expect(lines[lines.length - 1]).toContain("Item 999");
  });

  it("fires select callback on Enter", () => {
    const items = ["a", "b", "c"];
    const selections: string[] = [];
    const vl = new VirtualList({
      items,
      visibleRows: 10,
      renderItem: (item) => item,
      onSelect: (item) => { selections.push(item); },
    });
    vl.selectedIndex = 1;
    vl.select();
    expect(selections.at(-1)).toBe("b");
  });

  it("renders within 16ms for 1000 items", () => {
    const items = Array.from({ length: 1000 }, (_, i) => `Item ${i}`);
    const vl = new VirtualList({ items, visibleRows: 40, renderItem: (item) => item });
    const start = performance.now();
    for (let i = 0; i < 100; i++) vl.render();
    const elapsed = (performance.now() - start) / 100;
    expect(elapsed).toBeLessThan(16);
  });
});

// ─── StatusFooter (StatusBarWidget) ─────────────────────────────────────────
//
// prd-tui-status-footer-od-parity: the TUI StatusFooter mirrors the web
// `@fulcrum/ui-kit` StatusFooter segment-for-segment (CLI-TUI-UX.md §8,
// DESIGN.md §3.1). These tests assert the OD segment contract and explicitly
// no longer assert the legacy org/user/screen StatusBar shape.

import { StatusBarWidget, FOOTER_SEGMENT_ORDER } from "@fulcrum/tui/widgets/StatusBar.ts";

/**
 * Shared web↔TUI footer parity matrix. The web StatusFooter consumer
 * (apps/web TraceFooter.svelte) maps mode·profile·branch·run·agent·mcp into
 * the left cluster and trace·time·help·palette·ai-assist into the right
 * cluster; the TUI `FOOTER_SEGMENT_ORDER` is checked against this exact list
 * so the two surfaces can never drift out of segment order.
 */
const WEB_TUI_FOOTER_SEGMENT_MATRIX = [
  "mode",
  "profile",
  "branch",
  "run",
  "agent",
  "mcp",
  "trace",
  "time",
  "help",
  "palette",
  "ai-assist",
] as const;

describe("StatusFooter (StatusBarWidget)", () => {
  it("renders the eleven OD footer segments in stable web-mirrored order", () => {
    const sb = new StatusBarWidget({
      currentScreen: "Build",
      orgName: "dev",
      branch: "auth/rewrite",
      run: "01HXYZ 12/47",
      agent: "claude-opus-4-7",
      mcpHealth: "7/7",
      traceId: "4f3a1c9e8b2d4a6f",
      runId: "01HXYZ",
      spanId: "8b2d4a6f",
      time: "14:02",
      width: 120,
    });
    expect(sb.segments().map((s) => s.id)).toEqual([...WEB_TUI_FOOTER_SEGMENT_MATRIX]);
  });

  it("FOOTER_SEGMENT_ORDER is the single shared web↔TUI parity matrix", () => {
    expect([...FOOTER_SEGMENT_ORDER]).toEqual([...WEB_TUI_FOOTER_SEGMENT_MATRIX]);
  });

  it("renders mode pill, profile, branch, agent, mcp, trace, time, and AI Assist", () => {
    const sb = new StatusBarWidget({
      currentScreen: "Capture",
      orgName: "dev",
      branch: "auth/rewrite",
      agent: "claude-opus-4-7",
      mcpHealth: "7/7",
      traceId: "4f3a1c9e8b2d4a6f",
      time: "14:02",
      width: 120,
    });
    const line = stripAnsi(sb.render());
    expect(line).toContain("CAPTURE");
    expect(line).toContain("profile: dev");
    expect(line).toContain("auth/rewrite");
    expect(line).toContain("agent: claude-opus-4-7");
    expect(line).toContain("mcp 7/7");
    expect(line).toContain("trace:4f3a1c9e");
    expect(line).toContain("14:02");
    expect(line).toContain(":ai");
  });

  it("renders trace/run/span as mono, copy-keybind-addressable segments", () => {
    const sb = new StatusBarWidget({
      currentScreen: "Runs",
      orgName: "dev",
      traceId: "4f3a1c9e8b2d4a6f9c1e3a5b7d9f1c3e",
      runId: "01HXYZ",
      spanId: "8b2d4a6f",
      width: 120,
    });
    const segs = new Map(sb.segments().map((s) => [s.id, s]));
    expect(segs.get("trace")?.mono).toBe(true);
    expect(segs.get("trace")?.copyKeybind).toBe("y t");
    expect(segs.get("run")?.mono).toBe(true);
    expect(segs.get("run")?.copyKeybind).toBe("y r");
    expect(sb.copyKeybinds()).toEqual({
      "y t": "4f3a1c9e8b2d4a6f9c1e3a5b7d9f1c3e",
      "y r": "01HXYZ",
      "y s": "8b2d4a6f",
    });
  });

  it("shows the bell count in the help hint when > 0", () => {
    const sb = new StatusBarWidget({
      currentScreen: "Build",
      orgName: "dev",
      width: 120,
    });
    sb.setBellCount(3);
    const line = stripAnsi(sb.render());
    expect(line).toContain("🔔3");
  });

  it("flips the mode pill on screen change", () => {
    const sb = new StatusBarWidget({
      currentScreen: "Capture",
      orgName: "dev",
      width: 120,
    });
    sb.setCurrentScreen("Runs");
    expect(stripAnsi(sb.render())).toContain("RUNS");
  });

  it("no longer renders the legacy user-email StatusBar segment", () => {
    const sb = new StatusBarWidget({
      currentScreen: "Build",
      orgName: "dev",
      userEmail: "admin@acme.com",
      width: 120,
    });
    // The OD footer carries `profile`, never a user identity (DESIGN.md §3.1).
    expect(stripAnsi(sb.render())).not.toContain("admin@acme.com");
  });
});

// ─── Palette (Cmd+K) ───────────────────────────────────────────────────────

import { Palette } from "@fulcrum/tui/widgets/Palette.ts";

describe("Palette", () => {
  it("opens and closes with Escape", () => {
    const p = new Palette({ width: 60, height: 20, items: ["task.create", "doc.create"] });
    expect(p.isOpen).toBe(false);
    p.open();
    expect(p.isOpen).toBe(true);
    p.handleKey("escape");
    expect(p.isOpen).toBe(false);
  });

  it(">create-task dispatches task.create action", () => {
    const dispatched: string[] = [];
    const p = new Palette({
      width: 60,
      height: 20,
      items: ["task.create", "doc.create", "project.list"],
      onAction: (action) => { dispatched.push(action); },
    });
    p.open();
    p.setQuery(">create-task");
    // Should fuzzy-match task.create
    const matches = p.filteredItems();
    expect(matches.some((m) => m.includes("task.create"))).toBe(true);
    // Select first match
    p.selectCurrent();
    expect(dispatched).toContain("task.create");
  });

  it("kind:doc filter token filters items", () => {
    const p = new Palette({
      width: 60,
      height: 20,
      items: ["task.create", "doc.create", "doc.edit", "project.list"],
    });
    p.open();
    p.setQuery("kind:doc");
    const matches = p.filteredItems();
    expect(matches.every((m) => m.startsWith("doc."))).toBe(true);
    expect(matches.length).toBe(2);
  });

  it("renders FakeTTY snapshot", () => {
    const tty = new FakeTTY({ columns: 60, rows: 20 });
    const p = new Palette({
      width: 60,
      height: 20,
      items: ["task.create", "doc.create"],
    });
    p.open();
    const lines = p.render();
    expect(lines.length).toBeGreaterThan(0);
    const text = stripAnsi(lines.join("\n"));
    expect(text).toContain(">");
  });
});

// ─── HelpOverlay ────────────────────────────────────────────────────────────

import { HelpOverlay } from "@fulcrum/tui/widgets/HelpOverlay.ts";

describe("HelpOverlay", () => {
  it("renders current screen keybinding map", () => {
    const overlay = new HelpOverlay({
      screenName: "Dashboard",
      bindings: [
        { key: "p", action: "Projects" },
        { key: "r", action: "Recent runs" },
        { key: "n", action: "Notifications" },
      ],
      width: 60,
    });
    const lines = overlay.render();
    const text = stripAnsi(lines.join("\n"));
    expect(text).toContain("Dashboard");
    expect(text).toContain("p");
    expect(text).toContain("Projects");
  });

  it("shows different map for different screen", () => {
    const dash = new HelpOverlay({
      screenName: "Dashboard",
      bindings: [{ key: "p", action: "Projects" }],
      width: 60,
    });
    const tasks = new HelpOverlay({
      screenName: "Tasks",
      bindings: [{ key: "c", action: "Create task" }],
      width: 60,
    });
    const dashText = stripAnsi(dash.render().join("\n"));
    const tasksText = stripAnsi(tasks.render().join("\n"));
    expect(dashText).toContain("Dashboard");
    expect(tasksText).toContain("Tasks");
    expect(dashText).not.toContain("Create task");
    expect(tasksText).not.toContain("Projects");
  });
});

// ─── FilterChips ────────────────────────────────────────────────────────────

import { FilterChips } from "@fulcrum/tui/widgets/FilterChips.ts";

describe("FilterChips", () => {
  it("adds and removes chips", () => {
    const fc = new FilterChips();
    fc.addChip("status:open");
    fc.addChip("priority:high");
    expect(fc.chips).toEqual(["status:open", "priority:high"]);
    fc.removeChip("status:open");
    expect(fc.chips).toEqual(["priority:high"]);
  });

  it("Tab cycles through chips", () => {
    const fc = new FilterChips();
    fc.addChip("a");
    fc.addChip("b");
    fc.addChip("c");
    expect(fc.focusedIndex).toBe(0);
    fc.handleKey("tab");
    expect(fc.focusedIndex).toBe(1);
    fc.handleKey("tab");
    expect(fc.focusedIndex).toBe(2);
    fc.handleKey("tab");
    expect(fc.focusedIndex).toBe(0); // wraps
  });

  it("renders FakeTTY snapshot", () => {
    const fc = new FilterChips();
    fc.addChip("status:open");
    fc.addChip("priority:high");
    const line = stripAnsi(fc.render());
    expect(line).toContain("status:open");
    expect(line).toContain("priority:high");
  });

  it("chips array is correct after operations", () => {
    const fc = new FilterChips();
    fc.addChip("a");
    fc.addChip("b");
    fc.addChip("c");
    fc.removeChip("b");
    expect(fc.chips).toEqual(["a", "c"]);
    fc.addChip("d");
    expect(fc.chips).toEqual(["a", "c", "d"]);
  });
});

// ─── ASCII Charts ───────────────────────────────────────────────────────────

import {
  renderBurndown,
  renderVelocityBar,
  renderSparkline,
  renderHistogram,
} from "@fulcrum/tui/widgets/AsciiChart.ts";

describe("ASCII Charts", () => {
  it("burndown with known data produces deterministic output", () => {
    const data = [10, 8, 7, 5, 3, 1, 0];
    const out1 = stripAnsi(renderBurndown(data, { width: 40, height: 8 }));
    const out2 = stripAnsi(renderBurndown(data, { width: 40, height: 8 }));
    expect(out1).toBe(out2);
    expect(out1.length).toBeGreaterThan(0);
  });

  it("velocity bar renders", () => {
    const data = [5, 8, 13, 8, 21];
    const out = stripAnsi(renderVelocityBar(data, { width: 40 }));
    expect(out.length).toBeGreaterThan(0);
    // Should contain bar chars
    expect(out).toMatch(/[█▓▒░─│┤├┐┘┌└]/);
  });

  it("sparkline renders", () => {
    const data = [1, 3, 5, 2, 7, 4];
    const out = stripAnsi(renderSparkline(data));
    expect(out.length).toBeGreaterThan(0);
    // Sparkline chars
    expect(out).toMatch(/[▁▂▃▄▅▆▇█]/);
  });

  it("histogram renders", () => {
    const data = [3, 7, 2, 5, 1];
    const out = stripAnsi(renderHistogram(data, { width: 30 }));
    expect(out.length).toBeGreaterThan(0);
  });
});
