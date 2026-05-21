import { describe, expect, test } from "bun:test";

import { stripAnsi } from "../testing/fake-tty.ts";
import {
  MODE_AFFORDANCES,
  ModePicker,
  type WorkflowMode,
} from "./ModePicker.ts";

/**
 * ModePicker: the TUI per-Step mode affordance row
 * (`prd-web-mode-affordance-system`, `prd-tui-step-modepicker-006`,
 * DESIGN.md §4.13, CLI-TUI-UX.md §7.4).
 *
 * The compact mode row mirrors the web `ModeRow` primitive: the same four
 * modes, the same OD glyphs. The picker owns the direct `m` / `p` / `d`
 * contract from CLI-TUI-UX. These tests are the TUI snapshot proof for the
 * universal Step affordance.
 */
describe("ModePicker: TUI Step mode row", () => {
  test("declares the four canonical modes with OD glyphs and p/d/m selectors", () => {
    expect(MODE_AFFORDANCES.map((m) => m.mode)).toEqual([
      "manual",
      "play",
      "discuss",
      "assist",
    ]);
    expect(MODE_AFFORDANCES.map((m) => m.glyph)).toEqual(["✋", "▶", "💬", "⊞"]);
    expect(MODE_AFFORDANCES.map((m) => m.keybinding)).toEqual(["m", "p", "d", "a"]);
  });

  test("renders the compact row: four labelled modes, selected reverse-video", () => {
    const picker = new ModePicker({ stepId: "AUTH-42", value: "manual" });
    const line = stripAnsi(picker.render());

    expect(line).toContain("✋ Manual");
    expect(line).toContain("▶ Play");
    expect(line).toContain("💬 Discuss");
    expect(line).toContain("⊞ AI Assist");
    expect(line).toContain("[m]");
    expect(line).toContain("[p]");
    expect(line).toContain("[d]");
    expect(line).toContain("[a]");
  });

  test("p/d/m select their modes on the focused Step", () => {
    const selected: WorkflowMode[] = [];
    const picker = new ModePicker({
      stepId: "AUTH-42",
      onSelect: (mode) => selected.push(mode),
    });

    expect(picker.handleKey("p")).toBe("play");
    expect(picker.handleKey("d")).toBe("discuss");
    expect(picker.handleKey("m")).toBe("manual");
    expect(picker.handleKey("a")).toBe("assist");

    expect(selected).toEqual(["play", "discuss", "manual", "assist"]);
    expect(picker.value).toBe("assist");
  });

  test("compatibility handler also consumes direct p/d/m picker keys", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    expect(picker.handleChordKey("p")).toBe(true);
    expect(picker.value).toBe("play");
    expect(picker.handleChordKey("x")).toBe(false);
  });

  test("direct selectors do not arm a pending chord", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    expect(picker.handleKey("m")).toBe("manual");
    expect(picker.value).toBe("manual");
    expect(picker.isChordArmed).toBe(false);
  });

  test("a non-mode key is ignored: the screen keeps its keys", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    expect(picker.handleKey("j")).toBeNull();
    expect(picker.handleKey(":")).toBeNull();
    expect(picker.handleKey("?")).toBeNull();
  });

  test("handleKey resolves bare selector keys", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    expect(picker.handleKey("p")).toBe("play");
    expect(picker.handleKey("d")).toBe("discuss");
    expect(picker.handleKey("m")).toBe("manual");
    expect(picker.handleKey("a")).toBe("assist");
    expect(picker.handleKey("x")).toBeNull();
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

  test("keybindings() feeds the HelpOverlay so `?` lists the direct keys", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    const bindings = picker.keybindings();

    expect(bindings).toEqual([
      { key: "m", action: "✋ Manual" },
      { key: "p", action: "▶ Play" },
      { key: "d", action: "💬 Discuss" },
      { key: "a", action: "⊞ AI Assist" },
    ]);
  });

  test("defaults to the manual mode: the OD default-pressed mode", () => {
    const picker = new ModePicker();
    expect(picker.value).toBe("manual");
  });

  test("resetChord() remains a no-op compatibility method", () => {
    const picker = new ModePicker();
    picker.resetChord();
    expect(picker.isChordArmed).toBe(false);
  });
});
