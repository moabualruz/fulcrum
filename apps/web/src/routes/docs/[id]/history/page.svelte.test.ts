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

type PageProps = {
  data: {
    documentId: string;
    title: string;
    versions: Array<{
      id: string;
      versionNum: number;
      createdAt: string;
      authorId: string | null;
      authorName: string | null;
      isRestoreOf: string | null;
    }>;
  };
};

const VERSIONS: PageProps["data"]["versions"] = [
  {
    id: "v2", versionNum: 2, createdAt: "2026-05-01T12:00:00.000Z",
    authorId: "agent-1", authorName: "agent", isRestoreOf: null,
  },
  {
    id: "v1", versionNum: 1, createdAt: "2026-04-30T12:00:00.000Z",
    authorId: "user-1", authorName: "user", isRestoreOf: null,
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

  test("renders history page with header and title", () => {
    const { body } = render(Page, {
      props: { data: { documentId: "doc-1", title: "My Doc", versions: VERSIONS } },
    });
    expect(body).toContain("data-doc-history-header");
    expect(body).toContain("My Doc");
  });

  test("header links back to document", () => {
    const { body } = render(Page, {
      props: { data: { documentId: "doc-1", title: "My Doc", versions: VERSIONS } },
    });
    expect(body).toContain('href="/docs/doc-1"');
    expect(body).toContain("data-back-doc");
  });

  test("renders doc title in heading", () => {
    const { body } = render(Page, {
      props: { data: { documentId: "doc-1", title: "My Doc", versions: [] } },
    });
    expect(body).toContain("data-doc-title");
    expect(body).toContain("My Doc");
  });
});
