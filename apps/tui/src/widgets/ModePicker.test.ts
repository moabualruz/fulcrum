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
 * modes, the same OD glyphs. CLI-TUI-UX.md §7.4 owns the exact key contract:
 * bare `p` opens Play, bare `d` opens Discuss, and bare `m` opens the picker
 * without committing a mode.
 */
describe("ModePicker: TUI Step mode row", () => {
  test("declares the four canonical modes with OD glyphs and spec selectors", () => {
    expect(MODE_AFFORDANCES.map((m) => m.mode)).toEqual([
      "manual",
      "play",
      "discuss",
      "assist",
    ]);
    expect(MODE_AFFORDANCES.map((m) => m.glyph)).toEqual(["✋", "▶", "💬", "⊞"]);
    expect(MODE_AFFORDANCES.map((m) => m.keybinding)).toEqual(["m", "p", "d", ":ai"]);
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
    expect(line).toContain("[:ai]");
  });

  test("bare p/d execute Play and Discuss while bare m opens picker without selecting", () => {
    const selected: WorkflowMode[] = [];
    const picker = new ModePicker({
      stepId: "AUTH-42",
      onSelect: (mode) => selected.push(mode),
    });

    expect(picker.handleKey("p")).toBe("play");
    expect(picker.handleKey("d")).toBe("discuss");
    expect(picker.handleKey("m")).toBe("picker");
    expect(picker.isPickerOpen).toBe(true);

    expect(selected).toEqual(["play", "discuss"]);
    expect(picker.value).toBe("discuss");
  });

  test("compatibility handler consumes spec picker keys", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    expect(picker.handleChordKey("p")).toBe(true);
    expect(picker.value).toBe("play");
    expect(picker.handleChordKey("m")).toBe(true);
    expect(picker.value).toBe("play");
    expect(picker.handleChordKey("x")).toBe(false);
  });

  test("bare m opens the picker without committing Manual", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    picker.select("play");
    expect(picker.handleKey("m")).toBe("picker");
    expect(picker.value).toBe("play");
    expect(picker.isPickerOpen).toBe(true);
  });

  test("a non-mode key is ignored: the screen keeps its keys", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    expect(picker.handleKey("j")).toBeNull();
    expect(picker.handleKey(":")).toBeNull();
    expect(picker.handleKey("?")).toBeNull();
  });

  test("handleKey resolves only spec mode keys", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    expect(picker.handleKey("p")).toBe("play");
    expect(picker.handleKey("d")).toBe("discuss");
    expect(picker.handleKey("a")).toBeNull();
    expect(picker.handleKey("i")).toBeNull();
    expect(picker.handleKey("m")).toBe("picker");
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

  test("keybindings() feeds the HelpOverlay so `?` lists the spec keys", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    const bindings = picker.keybindings();

    expect(bindings).toEqual([
      { key: "m", action: "Open mode picker" },
      { key: "p", action: "▶ Play" },
      { key: "d", action: "💬 Discuss" },
      { key: ":ai", action: "⊞ AI Assist" },
    ]);
  });

  test("defaults to the manual mode: the OD default-pressed mode", () => {
    const picker = new ModePicker();
    expect(picker.value).toBe("manual");
  });

  test("resetChord() closes the picker compatibility state", () => {
    const picker = new ModePicker();
    picker.handleKey("m");
    picker.resetChord();
    expect(picker.isPickerOpen).toBe(false);
  });
});
