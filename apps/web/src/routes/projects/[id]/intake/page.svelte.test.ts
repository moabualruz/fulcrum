import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");

describe("/projects/[id]/intake +page.svelte source", () => {
  test("renders intake create form and table workflow controls", () => {
    expect(source).toContain("data-create-intake-form");
    expect(source).toContain("data-intake-title");
    expect(source).toContain("data-intake-source");
    expect(source).toContain("data-intake-description");
    expect(source).toContain("data-create-intake-submit");
    expect(source).toContain("data-intake-table");
    expect(source).toContain("data-intake-row");
    expect(source).toContain("data-delete-intake");
    expect(source).toContain("request.traceId");
  });
});
