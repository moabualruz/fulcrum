import { describe, expect, test } from "bun:test";

import { stripAnsi } from "../testing/fake-tty.ts";
import {
  MODE_AFFORDANCES,
  ModePicker,
  type ModePickerAction,
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

  test("p opens the Play picker with configured agent, model, policy, and actions", () => {
    const actions: ModePickerAction[] = [];
    const picker = new ModePicker({
      stepId: "AUTH-42",
      agents: [{ id: "codex", label: "Codex" }],
      models: [{ id: "gpt-5.4", label: "GPT-5.4" }],
      policies: [{ id: "review_each_tool", label: "Review each tool" }],
      onAction: (action) => actions.push(action),
    });

    expect(picker.handleKey("p")).toEqual({
      kind: "play-picker",
      stepId: "AUTH-42",
      mode: "play",
      agentId: "codex",
      modelId: "gpt-5.4",
      policyId: "review_each_tool",
    });
    expect(picker.value).toBe("play");
    expect(actions).toEqual([{
      kind: "play-picker",
      stepId: "AUTH-42",
      mode: "play",
      agentId: "codex",
      modelId: "gpt-5.4",
      policyId: "review_each_tool",
    }]);

    const popover = stripAnsi(picker.renderPopover().join("\n"));
    expect(popover).toContain("Play current step");
    expect(popover).toContain("Codex");
    expect(popover).toContain("GPT-5.4");
    expect(popover).toContain("Review each tool");
    expect(popover).toContain("Enter Play");
    expect(popover).toContain("P Preset");
  });

  test("d opens the focused Step discussion thread", () => {
    const actions: ModePickerAction[] = [];
    const picker = new ModePicker({ stepId: "AUTH-42", onAction: (action) => actions.push(action) });

    expect(picker.handleKey("d")).toEqual({
      kind: "discuss-thread",
      stepId: "AUTH-42",
      mode: "discuss",
    });
    expect(picker.value).toBe("discuss");
    expect(actions).toEqual([{ kind: "discuss-thread", stepId: "AUTH-42", mode: "discuss" }]);
    expect(stripAnsi(picker.renderPopover().join("\n"))).toContain("Discuss current step");
  });

  test("m opens the mode picker without committing a mode", () => {
    const actions: ModePickerAction[] = [];
    const selected: WorkflowMode[] = [];
    const picker = new ModePicker({
      stepId: "AUTH-42",
      value: "play",
      onSelect: (mode) => selected.push(mode),
      onAction: (action) => actions.push(action),
    });

    expect(picker.handleKey("m")).toEqual({
      kind: "mode-picker",
      stepId: "AUTH-42",
      mode: "play",
    });
    expect(picker.value).toBe("play");
    expect(selected).toEqual([]);
    expect(actions).toEqual([{ kind: "mode-picker", stepId: "AUTH-42", mode: "play" }]);
    expect(stripAnsi(picker.renderPopover().join("\n"))).toContain("Mode picker");
  });

  test("compatibility handler consumes direct p/d/m picker keys", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    expect(picker.handleChordKey("p")).toBe(true);
    expect(picker.value).toBe("play");
    expect(picker.handleChordKey("x")).toBe(false);
  });

  test("direct selectors do not arm a pending chord", () => {
    const picker = new ModePicker({ stepId: "AUTH-42" });
    expect(picker.handleKey("m")).toEqual({ kind: "mode-picker", stepId: "AUTH-42", mode: "manual" });
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
    expect(picker.handleKey("p")?.kind).toBe("play-picker");
    expect(picker.handleKey("d")?.kind).toBe("discuss-thread");
    expect(picker.handleKey("m")?.kind).toBe("mode-picker");
    expect(picker.handleKey("a")?.kind).toBe("ai-assist");
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
      { key: "m", action: "✋ Open mode picker" },
      { key: "p", action: "▶ Play current step" },
      { key: "d", action: "💬 Discuss current step" },
      { key: "a", action: "⊞ AI Assist current step" },
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
