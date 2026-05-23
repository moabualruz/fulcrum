import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

// `svelte/server` `render()` needs server-compiled `.svelte` modules: Bun's
// `.svelte` loader is registered globally via `bunfig.toml` `[test] preload`
// (see `apps/web/src/lib/test/svelte-ssr-preload.ts`).

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/docs"),
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

interface DocRow {
  id: string;
  title: string;
  kind: string;
  project_id: string | null;
  updated_at: string;
  body_excerpt: string;
}

interface DocTreeNode {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  projectId: string | null;
  scope: "project" | "global";
  docType: string;
  sortPosition: number;
  children: DocTreeNode[];
}

type PageProps = {
  data: {
    kind: string;
    q: string;
    activeProjectId: string | null;
    streamed: {
      data:
        | Promise<{ documents: DocRow[]; projectTree: DocTreeNode[]; globalTree: DocTreeNode[] }>
        | { documents: DocRow[]; projectTree: DocTreeNode[]; globalTree: DocTreeNode[] };
    };
  };
};

const SAMPLE: DocRow[] = [
  {
    id: "01J0DOC00000000000000000001",
    title: "Kernel decision",
    kind: "decision",
    project_id: null,
    updated_at: "2026-04-30T12:00:00.000Z",
    body_excerpt: "the kernel decided everything",
  },
  {
    id: "01J0DOC00000000000000000002",
    title: "Spec doc",
    kind: "spec",
    project_id: null,
    updated_at: "2026-04-29T08:00:00.000Z",
    body_excerpt: "details about the spec",
  },
  {
    id: "01J0DOC00000000000000000003",
    title: "Random note",
    kind: "note",
    project_id: null,
    updated_at: "2026-04-28T03:00:00.000Z",
    body_excerpt: "no kernel here",
  },
];

function pageData(input: {
  documents: DocRow[];
  projectTree?: DocTreeNode[];
  globalTree?: DocTreeNode[];
  kind?: string;
  q?: string;
  activeProjectId?: string | null;
}): PageProps["data"] {
  return {
    kind: input.kind ?? "",
    q: input.q ?? "",
    activeProjectId: input.activeProjectId ?? null,
    streamed: {
      data: {
        documents: input.documents,
        projectTree: input.projectTree ?? [],
        globalTree: input.globalTree ?? [],
      },
    },
  };
}

describe("/docs +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as {
      default: Component<PageProps>;
    };
    Page = mod.default;
  });

  test("renders list RouteSkeleton while streamed data is pending", () => {
    const pending = new Promise<{ documents: DocRow[] }>(() => {});
    const { body } = render(Page, {
      props: {
        data: {
          kind: "",
          q: "",
          activeProjectId: null,
          streamed: { data: pending },
        },
      },
    });
    expect(body).toContain("data-route-skeleton");
    expect(body).toContain('data-kind="list"');
  });

  test("renders three rows + new-doc CTA + filter bar for three documents", () => {
    const { body } = render(Page, {
      props: { data: pageData({ documents: SAMPLE }) },
    });
    const rows = body.match(/data-slot="table-row"[^>]*data-doc-row/g) ?? [];
    expect(rows).toHaveLength(3);
    const cta = (body.match(/<a\b[^>]*>/g) ?? []).find((a) =>
      a.includes("data-new-doc"),
    );
    expect(cta).toBeDefined();
    expect(cta).toContain('href="/docs/new"');
    expect(body).toContain("data-docs-filter");
    expect(body).toContain("data-in-context-search");
    expect(body).toContain('data-search-kind="doc"');
    expect(body).toContain("data-kind-filter");
    expect(body).toContain("data-q-filter");
    for (const doc of SAMPLE) {
      expect(body).toContain(doc.title);
      const re = new RegExp(`href="/docs/${doc.id}"`);
      expect(body).toMatch(re);
    }
  });

  test("empty default state shows data-empty-docs marker", () => {
    const { body } = render(Page, {
      props: { data: pageData({ documents: [] }) },
    });
    expect(body).toContain("data-empty-docs");
    expect(body).not.toContain("data-empty-filter");
  });

  test("empty filtered state shows data-empty-filter marker", () => {
    const { body } = render(Page, {
      props: { data: pageData({ documents: [], kind: "spec" }) },
    });
    expect(body).toContain("data-empty-filter");
    expect(body).not.toContain("data-empty-docs");
  });

  test("kind select reflects the current kind filter as selected", () => {
    const { body } = render(Page, {
      props: { data: pageData({ documents: SAMPLE, kind: "spec" }) },
    });
    // The selected option for `spec` should carry the `selected` attribute.
    const optionRe = /<option[^>]*value="spec"[^>]*selected[^>]*>|<option[^>]*selected[^>]*value="spec"/;
    expect(body).toMatch(optionRe);
  });

  test("q input value reflects the current data.q", () => {
    const { body } = render(Page, {
      props: { data: pageData({ documents: SAMPLE, q: "kernel" }) },
    });
    const inputs = body.match(/<input\b[^>]*>/g) ?? [];
    const qInput = inputs.find((i) => i.includes("data-q-filter"));
    expect(qInput).toBeDefined();
    expect(qInput).toContain('value="kernel"');
  });

  test("header h1 reads 'Documents'", () => {
    const { body } = render(Page, {
      props: { data: pageData({ documents: [] }) },
    });
    expect(body).toMatch(/<h1\b[^>]*>\s*Documents\s*<\/h1>/);
  });

  test("/docs hub renders project and global doc tree sidebars", () => {
    const projectTree: DocTreeNode[] = [{
      id: "project-root",
      title: "Project handbook",
      slug: "project-handbook",
      parentId: null,
      projectId: "project-1",
      scope: "project",
      docType: "wiki",
      sortPosition: 1,
      children: [],
    }];
    const globalTree: DocTreeNode[] = [{
      id: "global-root",
      title: "Global policy",
      slug: "global-policy",
      parentId: null,
      projectId: null,
      scope: "global",
      docType: "spec",
      sortPosition: 1,
      children: [],
    }];

    const { body } = render(Page, {
      props: { data: pageData({ documents: SAMPLE, projectTree, globalTree }) },
    });

    expect(body).toContain("data-docs-hub");
    expect(body).toContain("data-project-doc-tree");
    expect(body).toContain("data-global-doc-tree");
    expect(body).toContain('data-scope="project"');
    expect(body).toContain('data-scope="global"');
    expect(body).toContain("Project handbook");
    expect(body).toContain("Global policy");
  });
});
