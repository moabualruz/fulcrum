import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");

describe("/projects/[id]/modules +page.svelte source", () => {
  test("renders module create form and table workflow controls", () => {
    expect(source).toContain("data-create-module-form");
    expect(source).toContain("data-module-name");
    expect(source).toContain("data-module-status");
    expect(source).toContain("data-module-lead");
    expect(source).toContain("data-create-module-submit");
    expect(source).toContain("data-modules-table");
    expect(source).toContain("data-module-row");
    expect(source).toContain("data-delete-module");
    expect(source).toContain("module.traceId");
  });
});
