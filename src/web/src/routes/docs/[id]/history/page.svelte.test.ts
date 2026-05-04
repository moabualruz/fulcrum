import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/docs/doc-1/history"),
    params: { id: "doc-1" },
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    state: {},
    form: null,
  },
}));

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
  applyAction: async () => {},
  deserialize: (s: string) => JSON.parse(s),
}));

interface VersionRow {
  id: string;
  doc_id: string;
  org_id: string;
  version: number;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
  author: string;
  created_at: string;
}

type PageProps = {
  data: {
    doc: { id: string; title: string };
    versions: VersionRow[];
  };
};

const VERSIONS: VersionRow[] = [
  {
    id: "v2", doc_id: "doc-1", org_id: "org-1", version: 2,
    title: "Title v2", body: "body v2", frontmatter: {},
    author: "agent", created_at: "2026-05-01T12:00:00.000Z",
  },
  {
    id: "v1", doc_id: "doc-1", org_id: "org-1", version: 1,
    title: "Title v1", body: "body v1", frontmatter: {},
    author: "user", created_at: "2026-04-30T12:00:00.000Z",
  },
];

describe("/docs/[id]/history +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders version list with version numbers and authors", () => {
    const { body } = render(Page, {
      props: { data: { doc: { id: "doc-1", title: "My Doc" }, versions: VERSIONS } },
    });
    expect(body).toContain("data-version-list");
    expect(body).toContain("data-version-item");
    expect(body).toContain("Version 2");
    expect(body).toContain("Version 1");
    expect(body).toContain("agent");
    expect(body).toContain("user");
  });

  test("renders empty state when no versions", () => {
    const { body } = render(Page, {
      props: { data: { doc: { id: "doc-1", title: "My Doc" }, versions: [] } },
    });
    expect(body).toContain("data-empty-history");
  });

  test("header links back to document", () => {
    const { body } = render(Page, {
      props: { data: { doc: { id: "doc-1", title: "My Doc" }, versions: VERSIONS } },
    });
    expect(body).toContain('href="/docs/doc-1"');
    expect(body).toContain("My Doc");
  });
});
