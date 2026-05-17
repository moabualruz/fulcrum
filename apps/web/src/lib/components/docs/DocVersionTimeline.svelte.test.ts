import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./DocVersionTimeline.svelte", import.meta.url), "utf8");

describe("DocVersionTimeline source", () => {
  test("renders inline version diff and restore controls through route callbacks", () => {
    expect(source).toContain("onFetchDiff");
    expect(source).toContain("data-show-diff");
    expect(source).toContain("data-diff-html");
    expect(source).toContain("{@html diffHtml[version.id]}");
    expect(source).toContain("data-restore-version");
    expect(source).toContain("data-confirm-restore");
  });
});
