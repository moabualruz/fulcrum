import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import { auditRoute, mockSvelteKitRoute } from "./runs-helpers";

mockSvelteKitRoute("/docs");

interface DocRow {
  id: string;
  title: string;
  kind: string;
  project_id: string | null;
  updated_at: string;
  body_excerpt: string;
}

interface PageProps {
  data: {
    documents: DocRow[];
    kind: string;
    q: string;
    activeProjectId: string | null;
  };
}

const documents: DocRow[] = [
  {
    id: "01J0DOC00000000000000000001",
    title: "Kernel decision",
    kind: "decision",
    project_id: "alpha",
    updated_at: "2026-04-30T12:00:00.000Z",
    body_excerpt: "the kernel decided everything",
  },
];

describe("docs route a11y", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("../../src/routes/docs/+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("no axe-core serious/critical violations on /docs", async () => {
    const { body } = render(Page, {
      props: { data: { documents, kind: "", q: "", activeProjectId: null } },
    });
    const result = await auditRoute(body);
    const severe = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(severe).toEqual([]);
  });
});
