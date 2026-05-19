import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const source = readFileSync("apps/web/src/routes/ai-assist/+page.svelte", "utf8");

describe("ai assist reference route", () => {
  test("renders OD-backed drawer with trace-linked document planning context", () => {
    expect(source).toContain('data-ai-assist-ready="true"');
    expect(source).toContain("AI Assist");
    expect(source).toContain("data-ai-assist-drawer");
    expect(source).toContain("data-ai-assist-agent-picker");
    expect(source).toContain("doc_auth_rewrite");
    expect(source).toContain("ask-on-write");
    expect(source).toContain("create/read persisted");
    expect(source).toContain("attachment downloadable");
    expect(source).toContain("trace refs ready");
    expect(source).toContain("data-ai-assist-agent-registry");
    expect(source).toContain("data-ai-assist-transcript");
    expect(source).toContain("data-ai-assist-composer");
  });

  test("ships drawer agent routing with all role controls and persistence", () => {
    expect(source).toContain("Agent routing");
    expect(source).toContain('data-ai-assist-agent-route={routeRole}');
    expect(source).toContain("Executor");
    expect(source).toContain("Validator");
    expect(source).toContain("Planner");
    expect(source).toContain("fulcrum.ai-assist.agent-routes");
    expect(source).toContain("localStorage.setItem");
    expect(source).toContain("data-ai-assist-token-estimate");
    expect(source).toContain("Agent overrides saved");
  });

  test("ships inline paused prompt edit and re-run provenance", () => {
    expect(source).toContain("data-ai-assist-prompt-edit");
    expect(source).toContain("data-ai-assist-prompt-editor");
    expect(source).toContain("Re-run from this prompt");
    expect(source).toContain("data-ai-assist-edit-trace");
    expect(source).toContain("run_attempt_8f29a4c1b3e0d5f7");
    expect(source).toContain("data-ai-assist-cancel-edit");
  });

  test("keeps the drawer usable on mobile without page-level overflow", () => {
    expect(source).toContain("overflow-x-hidden");
    expect(source).toContain("max-w-full");
    expect(source).toContain("min-w-0");
  });

  test("keeps forbidden protocol and picker wording out of visible AI Assist chrome", () => {
    expect(source).not.toMatch(/>\s*ACP\s*</);
    expect(source).not.toMatch(/>\s*chat\s*</i);
    expect(source).not.toMatch(/model picker/i);
  });
});
