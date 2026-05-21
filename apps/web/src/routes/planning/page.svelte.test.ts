import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

// `prd-web-plan-session-od-fidelity` (`feat(web): plan-session OD Live Session
// Pane workbench`) consolidated the legacy form-based `/planning` route into
// the canonical `/plan-session` workbench. `/planning` is now a 200 redirect
// stub — it must keep resolving and forward to the workbench. The legacy
// planning *form* behaviour (preview / materialize / freeform / guided AI Assist /
// continuous-update / generate / artifact-execution / workflow-cycle actions)
// lives on in `planning/+page.server.ts` and is covered by
// `planning/page.server.test.ts`; this file verifies the redirect contract.

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/planning"),
    params: {},
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    state: {},
    form: null,
  },
}));

mock.module("$app/navigation", () => ({
  goto: async () => {},
  invalidate: async () => {},
  invalidateAll: async () => {},
}));

const CANONICAL_ROUTE = "/plan-session";

describe("/planning +page.svelte redirect", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<Record<string, never>>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<Record<string, never>> };
    Page = mod.default;
  });

  test("renders the 'Planning moved' notice instead of the legacy form", () => {
    const { body } = render(Page, { props: {} });
    expect(body).toMatch(/<h1\b[^>]*>\s*Planning moved\s*<\/h1>/);
    expect(body).toContain('data-route="planning-redirect"');
    expect(body).toContain("data-planning-page");
    // The legacy planning form must be gone from the rendered route.
    expect(body).not.toContain("?/preview");
    expect(body).not.toContain("?/materialize");
  });

  test("links to the canonical Plan session workbench", () => {
    const { body } = render(Page, { props: {} });
    expect(body).toContain(`href="${CANONICAL_ROUTE}"`);
    expect(body).toContain("Open Plan session");
  });

  test("emits a meta-refresh fallback to the canonical route", () => {
    const { head } = render(Page, { props: {} });
    expect(head).toContain(`url=${CANONICAL_ROUTE}`);
  });
});
