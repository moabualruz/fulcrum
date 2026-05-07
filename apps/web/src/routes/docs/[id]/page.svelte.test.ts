import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/docs/doc-1"),
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

interface DocDetail {
  id: string;
  org_id: string;
  project_id: string | null;
  kind: string;
  title: string;
  body: string;
  frontmatter: Record<string, unknown>;
  updated_at: string;
}

type PageProps = {
  data: {
    activeProjectId: string | null;
    streamed: {
      data: Promise<{ doc: DocDetail }> | { doc: DocDetail };
    };
  };
};

const DOC: DocDetail = {
  id: "01J0DOC00000000000000000001",
  org_id: "org-1",
  project_id: null,
  kind: "spec",
  title: "Spec doc",
  body: "## Body\n\nDocument content",
  frontmatter: {},
  updated_at: "2026-04-30T12:00:00.000Z",
};

describe("/docs/[id] +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as {
      default: Component<PageProps>;
    };
    Page = mod.default;
  });

  test("renders detail RouteSkeleton while streamed data is pending", () => {
    const pending = new Promise<{ doc: DocDetail }>(() => {});
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: pending } } },
    });
    expect(body).toContain("data-route-skeleton");
    expect(body).toContain('data-kind="detail"');
  });

  test("renders document detail from streamed payload", () => {
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: { doc: DOC } } } },
    });
    expect(body).toContain("data-doc-title");
    expect(body).toContain(DOC.title);
    expect(body).toContain("data-markdown-preview");
    expect(body).toContain('href="/docs/01J0DOC00000000000000000001/edit"');
  });
});
