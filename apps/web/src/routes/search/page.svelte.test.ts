import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { SearchHit } from "@test-support/product-workspace-fixtures.ts";
import type { SavedSearch } from "./+page.server.ts";

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
    kinds: string[];
    dateFrom: string;
    dateTo: string;
    hits: SearchHit[];
    grouped: Record<string, SearchHit[]>;
    savedSearches: SavedSearch[];
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

const ARTIFACT_HIT: SearchHit = {
  id: "search-artifact",
  source_kind: "artifact",
  source_id: "artifact-1",
  title: "handoff.md",
  body: "trace-abc source apps/web/src/routes/search/+page.svelte",
  score: 0.8,
  updated_at: "2026-04-30T10:02:00.000Z",
};

const EMPTY_DATA: PageProps["data"] = {
  q: "",
  kinds: [],
  dateFrom: "",
  dateTo: "",
  hits: [],
  grouped: {},
  savedSearches: [],
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
      props: {
        data: { ...EMPTY_DATA, q: "kernel", hits: [DOC_HIT], grouped: { doc: [DOC_HIT] } },
      },
    });
    expect(body).toMatch(/<h1\b[^>]*>\s*Search\s*<\/h1>/);
    expect(body).toContain("data-search-form");
    expect(body).toContain("data-search-input");
    expect(body).toContain('value="kernel"');
  });

  test("renders one section for each non-empty group", () => {
    const { body } = render(Page, {
      props: {
        data: { ...EMPTY_DATA, q: "kernel", hits: [DOC_HIT], grouped: { doc: [DOC_HIT], task: [] } },
      },
    });
    const groups = body.match(/data-search-group/g) ?? [];
    expect(groups).toHaveLength(1);
    expect(body).toContain('data-source-kind="doc"');
  });

  test("shows empty state when query has no hits", () => {
    const { body } = render(Page, {
      props: { data: { ...EMPTY_DATA, q: "nothing" } },
    });
    expect(body).toContain("data-search-empty");
  });

  test("shows no-query hint when q is empty", () => {
    const { body } = render(Page, {
      props: { data: EMPTY_DATA },
    });
    expect(body).toContain("data-search-no-query");
  });

  test("renders facet panel with kind checkboxes", () => {
    const { body } = render(Page, {
      props: { data: EMPTY_DATA },
    });
    expect(body).toContain("data-facet-panel");
    expect(body).toContain("data-facet-kinds");
    expect(body).toContain('data-kind-checkbox="doc"');
    expect(body).toContain('data-kind-checkbox="task"');
    expect(body).toContain('data-kind-checkbox="run"');
    expect(body).toContain('data-kind-checkbox="artifact"');
  });

  test("renders date range inputs", () => {
    const { body } = render(Page, {
      props: { data: EMPTY_DATA },
    });
    expect(body).toContain("data-facet-date");
    expect(body).toContain("data-date-from");
    expect(body).toContain("data-date-to");
  });

  test("renders saved searches section when savedSearches non-empty", () => {
    const saved: SavedSearch = {
      id: "ss-1",
      name: "My search",
      params: { q: "kernel", kinds: ["doc"], dateFrom: "", dateTo: "" },
    };
    const { body } = render(Page, {
      props: { data: { ...EMPTY_DATA, savedSearches: [saved] } },
    });
    expect(body).toContain("data-saved-searches");
    expect(body).toContain('data-saved-search="My search"');
  });

  test("renders fast actions and no-result recovery actions", () => {
    const { body } = render(Page, {
      props: { data: { ...EMPTY_DATA, q: "missing-trace" } },
    });
    expect(body).toContain("data-search-fast-actions");
    expect(body).toContain('data-search-command-action="open-palette"');
    expect(body).toContain("Try a trace ID");
    expect(body).toContain('data-search-empty-action="palette"');
  });

  test("links artifact results and labels workflow context", () => {
    const { body } = render(Page, {
      props: {
        data: { ...EMPTY_DATA, q: "trace-abc", hits: [ARTIFACT_HIT], grouped: { artifact: [ARTIFACT_HIT] } },
      },
    });
    expect(body).toContain('data-source-kind="artifact"');
    expect(body).toContain('href="/artifacts/artifact-1"');
    expect(body).toContain("data-hit-workflow-context");
    expect(body).toContain("Trace-linked");
  });
});
