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
      props: { data: { q: "kernel", hits: [DOC_HIT], grouped: { doc: [DOC_HIT] } } },
    });
    expect(body).toMatch(/<h1\b[^>]*>\s*Search\s*<\/h1>/);
    expect(body).toContain("data-search-form");
    expect(body).toContain("data-search-input");
    expect(body).toContain('value="kernel"');
  });

  test("renders one section for each non-empty group", () => {
    const { body } = render(Page, {
      props: { data: { q: "kernel", hits: [DOC_HIT], grouped: { doc: [DOC_HIT], task: [] } } },
    });
    const groups = body.match(/data-search-group/g) ?? [];
    expect(groups).toHaveLength(1);
    expect(body).toContain('data-source-kind="doc"');
  });

  test("shows empty state when query has no hits", () => {
    const { body } = render(Page, {
      props: { data: { q: "nothing", hits: [], grouped: {} } },
    });
    expect(body).toContain("data-search-empty");
  });

  test("shows no-query hint when q is empty", () => {
    const { body } = render(Page, {
      props: { data: { q: "", hits: [], grouped: {} } },
    });
    expect(body).toContain("data-search-no-query");
  });
});
