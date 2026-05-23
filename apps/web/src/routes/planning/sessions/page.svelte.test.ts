import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

// `prd-web-plan-session-od-fidelity` folded the guided/freeform AI Assist session
// controls into the canonical `/plan-session` workbench. `/planning/sessions`
// is now a 200 redirect stub that keeps resolving (migration-strategy.md
// value-preservation item 2). The guided/freeform action surface lives on in
// `planning/sessions/+page.server.ts` and is covered by its server test.

const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");

describe("/planning/sessions +page.svelte redirect", () => {
  test("renders the 'Sessions moved' redirect notice", () => {
    expect(source).toContain("data-sessions-page");
    expect(source).toContain('data-route="planning-sessions-redirect"');
    expect(source).toContain("Sessions moved");
  });

  test("forwards to the canonical Plan session workbench", () => {
    expect(source).toContain('const CANONICAL_ROUTE = "/plan-session"');
    expect(source).toContain("goto(CANONICAL_ROUTE");
    expect(source).toContain('content="0; url=/plan-session"');
    expect(source).toContain("Open Plan session");
  });

  test("no longer renders the legacy guided/freeform session forms", () => {
    expect(source).not.toContain("data-guided-session-form");
    expect(source).not.toContain("data-freeform-session-form");
    expect(source).not.toContain('action="?/guidedAcpStart"');
  });
});
