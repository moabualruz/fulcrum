/**
 * Global widgets TDD tests — P15#02.
 *
 * RED phase: all tests written against not-yet-existing widget implementations.
 * Covers: Palette, VirtualList, StatusBar, HelpOverlay, FilterChips, AsciiChart, wcwidth truncate.
 */

import { describe, it, expect } from "bun:test";
import { FakeTTY, stripAnsi } from "../../src/tui/testing/fake-tty.ts";
import { Renderer } from "../../src/tui/renderer.ts";

// ─── wcwidth-aware truncate ─────────────────────────────────────────────────

import { truncateWide } from "../../src/tui/utils/truncate.ts";

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

import { VirtualList } from "../../src/tui/widgets/VirtualList.ts";

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

// ─── StatusBar ──────────────────────────────────────────────────────────────

import { StatusBarWidget } from "../../src/tui/widgets/StatusBar.ts";

describe("StatusBar", () => {
  it("renders org name, user email, and current screen", () => {
    const sb = new StatusBarWidget({
      orgName: "Acme",
      userEmail: "admin@acme.com",
      currentScreen: "Dashboard",
      bellCount: 0,
      width: 80,
    });
    const line = stripAnsi(sb.render());
    expect(line).toContain("Acme");
    expect(line).toContain("admin@acme.com");
    expect(line).toContain("Dashboard");
  });

  it("shows bell count badge when > 0", () => {
    const sb = new StatusBarWidget({
      orgName: "Acme",
      userEmail: "admin@acme.com",
      currentScreen: "Dashboard",
      bellCount: 3,
      width: 80,
    });
    const line = stripAnsi(sb.render());
    expect(line).toContain("3");
  });

  it("increments bell count on notification event", () => {
    const sb = new StatusBarWidget({
      orgName: "Acme",
      userEmail: "admin@acme.com",
      currentScreen: "Dashboard",
      bellCount: 0,
      width: 80,
    });
    sb.setBellCount(5);
    const line = stripAnsi(sb.render());
    expect(line).toContain("5");
  });

  it("updates email on session change", () => {
    const sb = new StatusBarWidget({
      orgName: "Acme",
      userEmail: "old@acme.com",
      currentScreen: "Dashboard",
      bellCount: 0,
      width: 80,
    });
    sb.setUserEmail("new@acme.com");
    const line = stripAnsi(sb.render());
    expect(line).toContain("new@acme.com");
    expect(line).not.toContain("old@acme.com");
  });
});

// ─── Palette (Cmd+K) ───────────────────────────────────────────────────────

import { Palette } from "../../src/tui/widgets/Palette.ts";

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

import { HelpOverlay } from "../../src/tui/widgets/HelpOverlay.ts";

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

import { FilterChips } from "../../src/tui/widgets/FilterChips.ts";

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
} from "../../src/tui/widgets/AsciiChart.ts";

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
