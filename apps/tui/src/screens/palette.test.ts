import { describe, expect, test } from "bun:test";

import {
  FOUNDATION_HELP_BINDINGS,
  HELP_TOGGLE_KEY,
  bindingsForContext,
  isHelpToggleKey,
} from "./palette.ts";

describe("palette help bindings", () => {
  test("HELP_TOGGLE_KEY is '?'", () => {
    expect(HELP_TOGGLE_KEY).toBe("?");
    expect(isHelpToggleKey("?")).toBe(true);
    expect(isHelpToggleKey("/")).toBe(false);
  });

  test("foundation bindings cover vim keys, palette, multi-select, and detail pane", () => {
    const keys = FOUNDATION_HELP_BINDINGS.map((entry) => entry.key);
    expect(keys).toEqual(["j/k", "gg / G", "/", "V", "Enter", "?"]);
  });

  test("bindingsForContext returns only foundation entries without a context", () => {
    const fallback = bindingsForContext(null);
    expect(fallback).toEqual(FOUNDATION_HELP_BINDINGS);
  });

  test("bindingsForContext appends contextual entries when known", () => {
    const captureBindings = bindingsForContext("capture");
    const keys = captureBindings.map((entry) => entry.key);
    expect(keys).toContain("a");
    expect(keys).toContain("b");
    expect(keys).toContain("e");
    expect(keys).toContain("@");
    expect(captureBindings[0]).toEqual(FOUNDATION_HELP_BINDINGS[0]!);
  });

  test("bindingsForContext returns foundation only for unknown contexts", () => {
    expect(bindingsForContext("unknown-screen")).toEqual(FOUNDATION_HELP_BINDINGS);
  });
});
