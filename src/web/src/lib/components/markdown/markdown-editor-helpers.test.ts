import { describe, expect, test } from "bun:test";

import { extractMarkdownChange } from "./markdown-editor-helpers";

describe("extractMarkdownChange", () => {
  test("returns the string when detail.value is a string", () => {
    expect(extractMarkdownChange({ detail: { value: "hi" } })).toBe("hi");
  });

  test("returns null when detail.value is missing", () => {
    expect(extractMarkdownChange({ detail: {} })).toBeNull();
  });

  test("returns null when detail itself is missing", () => {
    expect(extractMarkdownChange({})).toBeNull();
  });

  test("returns null when detail.value is not a string", () => {
    expect(extractMarkdownChange({ detail: { value: 42 } })).toBeNull();
  });
});
