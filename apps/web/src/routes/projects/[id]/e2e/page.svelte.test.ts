import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");

describe("/projects/[id]/e2e +page.svelte source", () => {
  test("renders generated real-data E2E run controls with runner, trace, and selected files", () => {
    expect(source).toContain('data-testid="e2e-runner-page"');
    expect(source).toContain("data-e2e-run-form");
    expect(source).toContain('name="runner"');
    expect(source).toContain('value="trace-e2e-{data.projectId}"');
    expect(source).toContain('name="testFiles"');
    expect(source).toContain("Run E2E Tests");
  });

  test("renders run result fields needed for approval-to-regression traceability", () => {
    expect(source).toContain("data-e2e-result");
    expect(source).toContain("result.status");
    expect(source).toContain("result.runner");
    expect(source).toContain("result.exitCode");
    expect(source).toContain("result.traceId");
    expect(source).toContain("result.outputRef");
    expect(source).toContain("result.testFiles");
  });

  test("renders generated E2E run history with trace IDs", () => {
    expect(source).toContain("data-e2e-history");
    expect(source).toContain("entry.runner");
    expect(source).toContain("entry.status");
    expect(source).toContain("entry.testFileCount");
    expect(source).toContain("entry.exitCode");
    expect(source).toContain("entry.traceId");
  });
});
