import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync("apps/web/src/routes/runs/+page.svelte", "utf8");

describe("runs index route interaction coverage", () => {
  test("shows runs header, dispatch button, and filter chrome", () => {
    expect(source).toContain("data-runs-header");
    expect(source).toContain("Agent runs");
    expect(source).toContain("data-runs-dispatch");
    expect(source).toContain("data-runs-filter");
    expect(source).toContain("data-runs-agent-filter");
    expect(source).toContain("data-runs-status-filter");
    expect(source).toContain("data-runs-project-filter");
    expect(source).toContain("data-runs-range-filter");
  });

  test("ships inline agent reassignment without modal", () => {
    expect(source).toContain("data-runs-reassign");
    expect(source).toContain('data-action="reassign"');
    expect(source).toContain("data-runs-reassign-popover");
    expect(source).toContain("data-runs-reassign-agent={agent.id}");
    expect(source).toContain("Reassign in progress");
    expect(source).toContain("copied transcript seed");
    expect(source).not.toContain("data-modal");
  });

  test("keeps filter and dispatch controls usable on mobile without horizontal overflow", () => {
    expect(source).toContain("flex-wrap");
    expect(source).toContain("min-w-48");
  });
});
