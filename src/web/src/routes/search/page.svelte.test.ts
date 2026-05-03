import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { SearchHit } from "../../../../product-kernel/search";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/search"),
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
  invalidateAll: async () => {},
}));

mock.module("$app/environment", () => ({ browser: false, dev: false, building: false, version: "" }));

type PageProps = {
  data: {
    q: string;
    hits: SearchHit[];
    grouped: Record<string, SearchHit[]>;
    facets: {
      kind: Record<string, number>;
      status: Record<string, number>;
      assignee: Record<string, number>;
      project: Record<string, number>;
      author: Record<string, number>;
      tag: Record<string, number>;
    };
    params: {
      q: string;
      kind: string;
      project: string;
      status: string;
      assignee: string;
      tag: string;
      date_from: string;
      date_to: string;
      author: string;
      page: number;
    };
    pagination: { page: number; perPage: number; total: number; hasMore: boolean };
  };
};

const DOC_HIT: SearchHit = {
  id: "search-doc",
  source_kind: "doc",
  source_id: "doc-1",
  title: "Kernel notes",
  body: "Fulcrum kernel search notes",
  score: 0.5,
  updated_at: "2026-04-30T10:00:00.000Z",
};

function pageData(overrides: Partial<PageProps["data"]> = {}): PageProps["data"] {
  return {
    q: "kernel",
    hits: [DOC_HIT],
    grouped: { doc: [DOC_HIT] },
    facets: {
      kind: { doc: 1, task: 2 },
      status: { open: 1 },
      assignee: { ada: 1 },
      project: { "project-1": 1 },
      author: { grace: 1 },
      tag: { architecture: 1 },
    },
    params: {
      q: "kernel",
      kind: "",
      project: "",
      status: "",
      assignee: "",
      tag: "",
      date_from: "",
      date_to: "",
      author: "",
      page: 1,
    },
    pagination: { page: 1, perPage: 20, total: 1, hasMore: false },
    ...overrides,
  };
}

describe("/search +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as {
      default: Component<PageProps>;
    };
    Page = mod.default;
  });

  test("renders heading, GET form, and populated q input", () => {
    const { body } = render(Page, {
      props: { data: pageData() },
    });
    expect(body).toMatch(/<h1\b[^>]*>\s*Search\s*<\/h1>/);
    expect(body).toContain("data-search-form");
    expect(body).toContain("data-search-input");
    expect(body).toContain('value="kernel"');
  });

  test("renders one section for each non-empty group", () => {
    const { body } = render(Page, {
      props: { data: pageData({ grouped: { doc: [DOC_HIT], task: [] } }) },
    });
    const groups = body.match(/data-search-group/g) ?? [];
    expect(groups).toHaveLength(1);
    expect(body).toContain('data-source-kind="doc"');
  });

  test("shows empty state when query has no hits", () => {
    const { body } = render(Page, {
      props: { data: pageData({ q: "nothing", hits: [], grouped: {} }) },
    });
    expect(body).toContain("data-search-empty");
  });

  test("shows no-query hint when q is empty", () => {
    const { body } = render(Page, {
      props: { data: pageData({ q: "", hits: [], grouped: {} }) },
    });
    expect(body).toContain("data-search-no-query");
  });

  test("renders facet controls with count badges and selected facet chips", () => {
    const { body } = render(Page, {
      props: {
        data: pageData({
          params: {
            q: "kernel",
            kind: "doc",
            project: "project-1",
            status: "open",
            assignee: "ada",
            tag: "architecture",
            date_from: "",
            date_to: "",
            author: "",
            page: 1,
          },
        }),
      },
    });

    expect(body).toContain("data-search-facets");
    expect(body).toContain('name="kind"');
    expect(body).toContain('value="doc"');
    expect(body).toContain("doc");
    expect(body).toContain("1");
    expect(body).toContain("data-search-chip");
    expect(body).toContain("data-remove-facet");
    expect(body).toContain("kind: doc");
  });

  test("renders save-search and load-more controls", () => {
    const { body } = render(Page, {
      props: { data: pageData({ pagination: { page: 1, perPage: 1, total: 2, hasMore: true } }) },
    });
    expect(body).toContain("data-save-search");
    expect(body).toContain("Save this search");
    expect(body).toContain("data-load-more");
    expect(body).toContain('name="page"');
    expect(body).toContain('value="2"');
  });
});
