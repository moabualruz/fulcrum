import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

// `svelte/server` `render()` needs server-compiled `.svelte` modules — Bun's
// `.svelte` loader is registered globally via `bunfig.toml` `[test] preload`
// (see `apps/web/src/lib/test/svelte-ssr-preload.ts`).

// `$app/state` is a SvelteKit virtual module; supply a lightweight stub so any
// transitive imports work in this isolated render harness.
mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/projects"),
    params: {},
    route: { id: null },
    status: 200,
    error: null,
    data: {},
    state: {},
    form: null,
  },
}));

// `<SetActiveButton />` imports `goto` from `$app/navigation`; stub here so the
// SSR loader doesn't fault when this page test transitively imports the
// component.
mock.module("$app/navigation", () => ({
  goto: async () => {},
  invalidateAll: async () => {},
}));

interface ProjectListing {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  updated_at: string;
  task_count: number;
  open_task_count: number;
  doc_count: number;
  latest_activity_at: string;
}

type PageProps = {
  data: {
    activeProjectId: string | null;
    streamed: {
      data:
        | Promise<{ projects: ProjectListing[] }>
        | { projects: ProjectListing[] };
    };
  };
};

const SAMPLE: ProjectListing[] = [
  {
    id: "01J0PROJECT0000000000000001",
    slug: "alpha",
    name: "Alpha",
    description: "first sample project",
    updated_at: "2026-04-30T12:00:00.000Z",
    task_count: 8,
    open_task_count: 3,
    doc_count: 4,
    latest_activity_at: "2026-05-01T10:00:00.000Z",
  },
  {
    id: "01J0PROJECT0000000000000002",
    slug: "beta",
    name: "Beta",
    description: null,
    updated_at: "2026-04-29T08:00:00.000Z",
    task_count: 2,
    open_task_count: 0,
    doc_count: 1,
    latest_activity_at: "2026-04-29T08:00:00.000Z",
  },
  {
    id: "01J0PROJECT0000000000000003",
    slug: "gamma",
    name: "Gamma",
    description: "third sample project",
    updated_at: "2026-04-28T03:00:00.000Z",
    task_count: 0,
    open_task_count: 0,
    doc_count: 0,
    latest_activity_at: "2026-04-28T03:00:00.000Z",
  },
];

function pageData(
  projects: ProjectListing[],
  activeProjectId: string | null = null,
): PageProps["data"] {
  return {
    activeProjectId,
    streamed: { data: { projects } },
  };
}

describe("/projects +page.svelte", () => {
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
    const pending = new Promise<{ projects: ProjectListing[] }>(() => {});
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: pending } } },
    });
    expect(body).toContain("data-route-skeleton");
    expect(body).toContain('data-kind="list"');
  });

  test("renders the empty-state marker and zero table-row bodies when no projects", () => {
    const { body } = render(Page, { props: { data: pageData([]) } });
    expect(body).toContain('data-empty-projects');
    expect(body).toContain('data-empty-create-project');
    expect(body).toContain('data-empty-import-projects');
    expect(body).toContain('data-empty-open-existing');
    const rows = body.match(/data-project-row/g) ?? [];
    expect(rows).toHaveLength(0);
  });

  test("renders three dense project rows with names, slugs, counts, activity, and actions", () => {
    const { body } = render(Page, { props: { data: pageData(SAMPLE) } });
    const rows = body.match(/data-project-row/g) ?? [];
    expect(rows).toHaveLength(3);
    for (const project of SAMPLE) {
      expect(body).toContain(project.name);
      expect(body).toContain(project.slug);
      expect(body).toContain(`${project.task_count} task${project.task_count === 1 ? "" : "s"}`);
      expect(body).toContain(`${project.doc_count} doc${project.doc_count === 1 ? "" : "s"}`);
      expect(body).toMatch(new RegExp(`href="/projects/${project.id}"[^>]*data-project-primary-action`));
    }
  });

  test("search, status filter, and reset controls are present", () => {
    const { body } = render(Page, { props: { data: pageData(SAMPLE) } });
    const inputMatch = body.match(/<input\b[^>]*>/g) ?? [];
    const filterInput = inputMatch.find((m) => m.includes("data-projects-filter"));
    expect(filterInput).toBeDefined();
    expect(filterInput).toContain('type="search"');
    expect(body).toContain("data-status-filter");
    expect(body).toContain("data-projects-reset");
  });

  test("new-project CTA points to /projects/new", () => {
    const { body } = render(Page, { props: { data: pageData(SAMPLE) } });
    const anchorMatch = body.match(/<a\b[^>]*>/g) ?? [];
    const cta = anchorMatch.find((a) => a.includes("data-new-project"));
    expect(cta).toBeDefined();
    expect(cta).toContain('href="/projects/new"');
  });

  test("each row links to /projects/<id>", () => {
    const { body } = render(Page, { props: { data: pageData(SAMPLE) } });
    for (const project of SAMPLE) {
      const re = new RegExp(`href="/projects/${project.id}"`);
      expect(body).toMatch(re);
    }
  });

  test("each row renders a SetActiveButton with data-set-active-project + slug", () => {
    const { body } = render(Page, {
      props: { data: pageData(SAMPLE, "alpha") },
    });
    for (const project of SAMPLE) {
      expect(body).toContain(`data-slug="${project.slug}"`);
    }
    // The active-row's button reports aria-pressed="true" exactly once.
    const ariaTrue = body.match(/data-set-active-project[^>]*aria-pressed="true"/g) ?? [];
    expect(ariaTrue).toHaveLength(1);

    // Bind pressed-state to the alpha row specifically; beta row should
    // own an aria-pressed="false" button so the active marker is not
    // accidentally shared across rows.
    function rowSlice(haystack: string, slug: string): string {
      const start = haystack.indexOf(`data-slug="${slug}"`);
      if (start === -1) return "";
      const end = haystack.indexOf(`data-project-row`, start + 1);
      return end === -1 ? haystack.slice(start) : haystack.slice(start, end);
    }

    const alpha = rowSlice(body, "alpha");
    expect(alpha.match(/aria-pressed="true"/g)?.length ?? 0).toBe(1);
    const beta = rowSlice(body, "beta");
    expect(beta.match(/aria-pressed="false"/g)?.length ?? 0).toBe(1);
  });

  test("header h1 reads 'Projects'", () => {
    const { body } = render(Page, { props: { data: pageData([]) } });
    expect(body).toMatch(/<h1\b[^>]*>\s*Projects\s*<\/h1>/);
  });

  test("active project row exposes active status while other rows stay ready", () => {
    const { body } = render(Page, { props: { data: pageData(SAMPLE, "alpha") } });
    expect(body).toContain('data-project-status="active"');
    expect(body).toContain('data-project-status="ready"');
    expect(body.match(/data-project-status-badge/g)).toHaveLength(3);
  });
});
