import { describe, expect, test } from "bun:test";

import { stripAnsi } from "../testing/fake-tty.ts";
import { MODE_AFFORDANCES, ModePicker, type WorkflowMode } from "./ModePicker.ts";

/**
 * ModePicker — the TUI per-Step mode affordance row
 * (`prd-web-mode-affordance-system`, DESIGN.md §4.13, CLI-TUI-UX.md §7.4).
 *
 * The compact mode row mirrors the web `ModeRow` primitive: the same four
 * modes, the same OD glyphs, and the canonical §7.4 keybindings. These tests
 * are the TUI snapshot proof for the universal Step affordance.
 */
describe("ModePicker — TUI Step mode row", () => {
  test("declares the four canonical modes with OD glyphs and §7.4 keybindings", () => {
    expect(MODE_AFFORDANCES.map((m) => m.mode)).toEqual([
      "manual",
      "play",
      "discuss",
      "assist",
    ]);
    expect(MODE_AFFORDANCES.map((m) => m.glyph)).toEqual(["✋", "▶", "💬", "⊞"]);
    // CLI-TUI-UX §7.4: `p` Play, `d` Discuss, `m` mode picker; `a` selects Manual.
    expect(MODE_AFFORDANCES.map((m) => m.keybinding)).toEqual(["a", "p", "d", "m"]);
  });

  test("renders the compact row — four mode glyphs, selected reverse-video", () => {
    const picker = new ModePicker({ stepId: "AUTH-42", value: "manual" });
    const line = stripAnsi(picker.render());

    expect(line).toContain("✋ Manual");
    expect(line).toContain("▶ Play");
    expect(line).toContain("💬 Discuss");
    expect(line).toContain("⊞ AI Assist");
    // Keybinding hints are rendered for every mode.
    expect(line).toContain("[a]");
    expect(line).toContain("[p]");
    expect(line).toContain("[d]");
    expect(line).toContain("[m]");
  });

  test("the §7.4 keybindings select each mode on the focused Step", () => {
    const selected: WorkflowMode[] = [];
    const picker = new ModePicker({
      stepId: "AUTH-42",
      onSelect: (mode) => selected.push(mode),
    });

    expect(picker.handleKey("p")).toBe("play");
    expect(picker.handleKey("d")).toBe("discuss");
    expect(picker.handleKey("m")).toBe("assist");
    expect(picker.handleKey("a")).toBe("manual");
    // `h` is the vim-style alias for the leftmost mode (Manual).
    expect(picker.handleKey("h")).toBe("manual");

    expect(selected).toEqual(["play", "discuss", "assist", "manual", "manual"]);
    expect(picker.value).toBe("manual");
  });

  test("an unbound key is not handled — the screen keeps its own key handling", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    expect(picker.handleKey("x")).toBeNull();
    expect(picker.handleKey("j")).toBeNull();
  });

  test("select() updates value and fires onSelect with the Step id", () => {
    const events: Array<[WorkflowMode, string | undefined]> = [];
    const picker = new ModePicker({
      stepId: "REV-7",
      onSelect: (mode, stepId) => events.push([mode, stepId]),
    });

    picker.select("discuss");
    expect(picker.value).toBe("discuss");
    expect(events).toEqual([["discuss", "REV-7"]]);
  });

  test("keybindings() feeds the HelpOverlay so `?` lists the mode keys", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    const bindings = picker.keybindings();

    expect(bindings).toEqual([
      { key: "a", action: "✋ Manual" },
      { key: "p", action: "▶ Play" },
      { key: "d", action: "💬 Discuss" },
      { key: "m", action: "⊞ AI Assist" },
    ]);
  });

  test("defaults to the manual mode — the OD default-pressed mode", () => {
    const picker = new ModePicker();
    expect(picker.value).toBe("manual");
  });
});
