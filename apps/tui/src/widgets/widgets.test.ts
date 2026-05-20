import { describe, expect, test } from "bun:test";

import { Renderer } from "../renderer.ts";
import { FakeTTY, stripAnsi } from "../testing/fake-tty.ts";
import { renderBurndown, renderHistogram, renderSparkline, renderVelocityBar } from "./AsciiChart.ts";
import { FilterChips } from "./FilterChips.ts";
import { HelpOverlay } from "./HelpOverlay.ts";
import { Palette } from "./Palette.ts";
import { StatusBarWidget } from "./StatusBar.ts";
import { VirtualList } from "./VirtualList.ts";

function visibleLines(output: string | string[]): string[] {
  const lines = Array.isArray(output) ? output : output.split("\n");
  return lines.map((line) => stripAnsi(line));
}

function expectWithinWidth(output: string | string[], width: number): void {
  for (const line of visibleLines(output)) {
    expect(line.length).toBeLessThanOrEqual(width);
  }
}

describe("TUI widgets", () => {
  test("StatusBar renders the OD StatusFooter segments in stable order", () => {
    const status = new StatusBarWidget({
      currentScreen: "Capture",
      orgName: "dev",
      branch: "auth/rewrite",
      run: "01HXYZ 12/47",
      agent: "claude-opus-4-7",
      mcpHealth: "7/7",
      traceId: "4f3a1c9e8b2d4a6f",
      runId: "01HXYZ",
      spanId: "8b2d4a6f",
      time: "14:02",
      bellCount: 0,
      width: 160,
    });

    // Segment order mirrors the web StatusFooter (FOOTER_SEGMENT_ORDER).
    expect(status.segments().map((s) => s.id)).toEqual([
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
    ]);

    const line = stripAnsi(status.render());
    expectWithinWidth(line, 160);
    expect(line).toContain("CAPTURE");
    expect(line).toContain("profile: dev");
    expect(line).toContain("auth/rewrite");
    expect(line).toContain("agent: claude-opus-4-7");
    expect(line).toContain("mcp 7/7");
    expect(line).toContain("trace:4f3a1c9e");
    expect(line).toContain("14:02");
    expect(line).toContain(":ai");
  });

  test("StatusBar never drops a segment in a width-starved terminal", () => {
    const status = new StatusBarWidget({
      currentScreen: "Build",
      orgName: "dev",
      branch: "auth/rewrite",
      run: "01HXYZ 12/47",
      agent: "claude-opus-4-7-with-a-very-long-id",
      mcpHealth: "7/7",
      traceId: "4f3a1c9e8b2d4a6f",
      time: "14:02",
      width: 120,
    });
    const line = stripAnsi(status.render());
    expectWithinWidth(line, 120);
    // CLI-TUI-UX §8: the footer never collapses — every segment stays present,
    // only the long agent value is ellipsized.
    expect(line).toContain("BUILD");
    expect(line).toContain("profile:");
    expect(line).toContain("auth/rewrite");
    expect(line).toContain("agent:");
    expect(line).toContain("mcp 7/7");
    expect(line).toContain("trace:4f3a1c9e");
    expect(line).toContain(":ai");
  });

  test("StatusBar trace/run/span segments are mono and copy-keybind addressable", () => {
    const status = new StatusBarWidget({
      currentScreen: "Runs",
      orgName: "dev",
      traceId: "4f3a1c9e8b2d4a6f9c1e3a5b7d9f1c3e",
      runId: "01HXYZ",
      spanId: "8b2d4a6f",
      bellCount: 0,
      width: 120,
    });

    const segs = new Map(status.segments().map((s) => [s.id, s]));
    expect(segs.get("trace")?.mono).toBe(true);
    expect(segs.get("trace")?.copyKeybind).toBe("y t");
    expect(segs.get("run")?.mono).toBe(true);
    expect(segs.get("run")?.copyKeybind).toBe("y r");

    // Copy keybinds yank the exact identity the footer displays.
    expect(status.copyKeybinds()).toEqual({
      "y t": "4f3a1c9e8b2d4a6f9c1e3a5b7d9f1c3e",
      "y r": "01HXYZ",
      "y s": "8b2d4a6f",
    });
  });

  test("StatusBar updates mode pill and bell hint on state change", () => {
    const status = new StatusBarWidget({
      currentScreen: "Capture",
      orgName: "dev",
      bellCount: 0,
      width: 120,
    });

    status.setCurrentScreen("Runs");
    status.setBellCount(7);
    const updated = stripAnsi(status.render());
    expect(updated).toContain("RUNS");
    expect(updated).toContain("🔔7");
    expectWithinWidth(updated, 120);
  });

  test("VirtualList keeps cursor and visible window bounded", () => {
    const selected: Array<{ item: string; index: number }> = [];
    const list = new VirtualList({
      items: ["a", "b", "c", "d", "e"],
      visibleRows: 3,
      renderItem: (item, index) => `${index}:${item}`,
      onSelect: (item, index) => selected.push({ item, index }),
    });

    list.moveDown();
    list.moveDown();
    list.moveDown();
    expect(list.selectedIndex).toBe(3);
    expect(list.render()).toEqual(["  1:b", "  2:c", "▸ 3:d"]);

    list.moveUp();
    list.select();
    expect(selected).toEqual([{ item: "c", index: 2 }]);

    list.scrollToEnd();
    expect(list.selectedIndex).toBe(4);
    expect(list.render()).toEqual(["  2:c", "  3:d", "▸ 4:e"]);
  });

  test("Palette handles down/up/enter/escape and narrow rendering", () => {
    const actions: string[] = [];
    const palette = new Palette({
      width: 40,
      height: 8,
      items: ["task.create", "task.assign", "repo.sync.with-a-very-long-name"],
      onAction: (action) => actions.push(action),
    });

    palette.open();
    palette.setQuery("kind:task");
    expect(palette.filteredItems()).toEqual(["task.create", "task.assign"]);

    palette.handleKey("down");
    palette.handleKey("enter");
    expect(actions).toEqual(["task.assign"]);
    expectWithinWidth(palette.render(), 40);

    palette.handleKey("up");
    palette.handleKey("escape");
    expect(palette.isOpen).toBe(false);
    expect(palette.render()).toEqual([]);
  });

  test("FilterChips cycles focus with visible non-color marker", () => {
    const chips = new FilterChips();
    chips.addChip("task");
    chips.addChip("repo");
    expect(stripAnsi(chips.render())).toContain("> task <");

    chips.handleKey("tab");
    expect(chips.focusedIndex).toBe(1);
    expect(stripAnsi(chips.render())).toContain("> repo <");

    chips.removeChip("repo");
    expect(chips.focusedIndex).toBe(0);
  });

  test("HelpOverlay truncates long actions inside narrow terminals", () => {
    const help = new HelpOverlay({
      screenName: "Repos",
      width: 40,
      bindings: [
        { key: "Enter", action: "Open selected Repo with a very long description that must not overflow" },
        { key: "s", action: "Sync Repo" },
      ],
    });

    const lines = help.render();
    expect(lines.join("\n")).toContain("Repos");
    expectWithinWidth(lines, 40);
  });

  test("AsciiChart renderers stay within requested width", () => {
    expectWithinWidth(renderBurndown([100, 80, 40, 10], { width: 40, height: 5 }), 40);
    expectWithinWidth(renderVelocityBar([1, 10, 1_000_000], { width: 24 }), 24);
    expectWithinWidth(renderHistogram([1, 3, 9], { width: 16 }), 16);
    expect(renderSparkline([1, 2, 3, 4])).toHaveLength(4);
  });

  test("Renderer test output strips ANSI while raw output keeps color escapes", () => {
    const tty = new FakeTTY({ columns: 40, rows: 10 });
    const renderer = new Renderer(tty);

    renderer.writeln("\x1b[32mready\x1b[39m");

    expect(tty.raw()).toContain("\x1b[");
    expect(tty.plainText()).toBe("ready\n");
  });
});
