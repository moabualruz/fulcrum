import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

type DocRow = {
  id: string;
  title: string;
  kind: string;
  updated_at: string;
};

type RecentDocsProps = {
  docs: DocRow[];
};

const SAMPLE_DOCS: DocRow[] = [
  { id: "d1", title: "Architecture overview", kind: "markdown", updated_at: "2026-04-29T12:00:00Z" },
  { id: "d2", title: "API reference", kind: "openapi", updated_at: "2026-04-28T08:00:00Z" },
  { id: "d3", title: "Runbook", kind: "markdown", updated_at: "2026-04-27T15:00:00Z" },
];

describe("RecentDocs component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let RecentDocs: Component<RecentDocsProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./RecentDocs.svelte")) as {
      default: Component<RecentDocsProps>;
    };
    RecentDocs = mod.default;
  });

  test("3 docs yield 3 li[data-recent-doc]", () => {
    const { body } = render(RecentDocs, { props: { docs: SAMPLE_DOCS } });
    const matches = body.match(/data-recent-doc\b/g) ?? [];
    expect(matches).toHaveLength(3);
  });

  test("empty array yields data-recent-docs-empty", () => {
    const { body } = render(RecentDocs, { props: { docs: [] } });
    expect(body).toContain("data-recent-docs-empty");
    expect(body).not.toContain("data-recent-doc\"");
  });

  test("rows include <a href='/docs/<id>'>", () => {
    const { body } = render(RecentDocs, { props: { docs: SAMPLE_DOCS } });
    for (const doc of SAMPLE_DOCS) {
      expect(body).toContain(`href="/docs/${doc.id}"`);
    }
  });

  test("renders section with data-recent-docs and h3 'Recent docs'", () => {
    const { body } = render(RecentDocs, { props: { docs: SAMPLE_DOCS } });
    expect(body).toContain("data-recent-docs");
    expect(body).toMatch(/<h3\b[^>]*>\s*Recent docs\s*<\/h3>/);
  });
});
