import { describe, expect, test } from "bun:test";

import { stripAnsi } from "../testing/fake-tty.ts";
import {
  MODE_AFFORDANCES,
  MODE_CHORD_KEYBINDINGS,
  MODE_CHORD_PREFIX,
  ModePicker,
  PALETTE_HELP_NAV_KEYS,
  modeKeyCollidesWith,
  type WorkflowMode,
} from "./ModePicker.ts";

/**
 * ModePicker — the TUI per-Step mode affordance row
 * (`prd-web-mode-affordance-system`, `prd-tui-step-modepicker-006`,
 * DESIGN.md §4.13, CLI-TUI-UX.md §7.4).
 *
 * The compact mode row mirrors the web `ModeRow` primitive: the same four
 * modes, the same OD glyphs. Because every Step-bearing screen already binds
 * bare `a` / `p` / `d`, the picker reaches the four modes through a
 * collision-free `m` chord. These tests are the TUI snapshot proof for the
 * universal Step affordance.
 */
describe("ModePicker — TUI Step mode row", () => {
  test("declares the four canonical modes with OD glyphs and chord selectors", () => {
    expect(MODE_AFFORDANCES.map((m) => m.mode)).toEqual([
      "manual",
      "play",
      "discuss",
      "assist",
    ]);
    expect(MODE_AFFORDANCES.map((m) => m.glyph)).toEqual(["✋", "▶", "💬", "⊞"]);
    // The `m` chord selectors: `m a` Manual, `m p` Play, `m d` Discuss, `m i` AI Assist.
    expect(MODE_AFFORDANCES.map((m) => m.keybinding)).toEqual(["a", "p", "d", "i"]);
    expect(MODE_CHORD_PREFIX).toBe("m");
    expect(MODE_CHORD_KEYBINDINGS).toEqual(["m a", "m p", "m d", "m i"]);
  });

  test("renders the compact row — four labelled modes, selected reverse-video", () => {
    const picker = new ModePicker({ stepId: "AUTH-42", value: "manual" });
    const line = stripAnsi(picker.render());

    expect(line).toContain("✋ Manual");
    expect(line).toContain("▶ Play");
    expect(line).toContain("💬 Discuss");
    expect(line).toContain("⊞ AI Assist");
    // Full `m`-chord key hints are rendered for every mode.
    expect(line).toContain("[m a]");
    expect(line).toContain("[m p]");
    expect(line).toContain("[m d]");
    expect(line).toContain("[m i]");
  });

  test("the `m` chord selects each mode on the focused Step", () => {
    const selected: WorkflowMode[] = [];
    const picker = new ModePicker({
      stepId: "AUTH-42",
      onSelect: (mode) => selected.push(mode),
    });

    // Bare `m` arms the chord and is consumed; the selector key commits.
    expect(picker.handleChordKey("m")).toBe(true);
    expect(picker.isChordArmed).toBe(true);
    expect(picker.handleChordKey("p")).toBe(true);
    expect(picker.isChordArmed).toBe(false);

    expect(picker.handleChordKey("m")).toBe(true);
    expect(picker.handleChordKey("d")).toBe(true);
    expect(picker.handleChordKey("m")).toBe(true);
    expect(picker.handleChordKey("i")).toBe(true);
    expect(picker.handleChordKey("m")).toBe(true);
    expect(picker.handleChordKey("a")).toBe(true);

    expect(selected).toEqual(["play", "discuss", "assist", "manual"]);
    expect(picker.value).toBe("manual");
  });

  test("an unbound key after the `m` chord disarms and is NOT consumed", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    expect(picker.handleChordKey("m")).toBe(true);
    // `x` is not a mode selector — the chord disarms and the screen handles `x`.
    expect(picker.handleChordKey("x")).toBe(false);
    expect(picker.isChordArmed).toBe(false);
  });

  test("a non-`m` key while not armed is ignored — the screen keeps its keys", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    // Without the `m` prefix the picker never steals `a` / `d` / `p` / `j`.
    expect(picker.handleChordKey("a")).toBe(false);
    expect(picker.handleChordKey("d")).toBe(false);
    expect(picker.handleChordKey("p")).toBe(false);
    expect(picker.handleChordKey("j")).toBe(false);
  });

  test("the `m` chord prefix does not collide with palette / help / nav chords", () => {
    // The whole point of the `m` prefix: it is disjoint from `:` `?` `/`
    // `j` `k` `q` `H` `L` `g`. The parity contract (acceptance) is proven here.
    expect(modeKeyCollidesWith(MODE_CHORD_PREFIX)).toBe(false);
    for (const navKey of PALETTE_HELP_NAV_KEYS) {
      expect(navKey).not.toBe(MODE_CHORD_PREFIX);
    }
    // And `m` is not itself one of the global chords.
    expect(PALETTE_HELP_NAV_KEYS).not.toContain("m");
  });

  test("handleKey resolves a bare selector key (chord second key)", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    expect(picker.handleKey("p")).toBe("play");
    expect(picker.handleKey("d")).toBe("discuss");
    expect(picker.handleKey("i")).toBe("assist");
    expect(picker.handleKey("a")).toBe("manual");
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

  test("keybindings() feeds the HelpOverlay so `?` lists the `m`-chord keys", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    const bindings = picker.keybindings();

    expect(bindings).toEqual([
      { key: "m a", action: "✋ Manual" },
      { key: "m p", action: "▶ Play" },
      { key: "m d", action: "💬 Discuss" },
      { key: "m i", action: "⊞ AI Assist" },
    ]);
  });

  test("defaults to the manual mode — the OD default-pressed mode", () => {
    const picker = new ModePicker();
    expect(picker.value).toBe("manual");
  });

  test("resetChord() disarms a half-typed `m` chord", () => {
    const picker = new ModePicker();
    picker.handleChordKey("m");
    expect(picker.isChordArmed).toBe(true);
    picker.resetChord();
    expect(picker.isChordArmed).toBe(false);
  });
});
