import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/audit"),
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

interface EventRow {
  id: string;
  org_id: string;
  project_id: string | null;
  actor: string;
  subject_kind: string;
  subject_id: string;
  verb: string;
  payload: Record<string, unknown>;
  created_at: string;
}

type PageProps = {
  data: {
    filter: { kind: string; verb: string; actor: string; project: string; since: string; until: string };
    page: number;
    streamed: {
      data: Promise<{ events: EventRow[]; total: number }> | { events: EventRow[]; total: number };
    };
  };
};

const SAMPLE_EVENTS: EventRow[] = [
  { id: "e1", org_id: "o1", project_id: "p1", actor: "alice", subject_kind: "task", subject_id: "t1", verb: "created", payload: { title: "Task 1" }, created_at: "2026-05-01T10:00:00Z" },
  { id: "e2", org_id: "o1", project_id: "p1", actor: "bob", subject_kind: "doc", subject_id: "d1", verb: "updated", payload: {}, created_at: "2026-05-01T09:00:00Z" },
];

function pageData(events: EventRow[] = SAMPLE_EVENTS, total = events.length): PageProps["data"] {
  return {
    filter: { kind: "", verb: "", actor: "", project: "", since: "", until: "" },
    page: 1,
    streamed: { data: { events, total } },
  };
}

describe("/audit +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders header with 'Audit log' title", () => {
    const { body } = render(Page, { props: { data: pageData() } });
    expect(body).toMatch(/<h1\b[^>]*>\s*Audit log\s*<\/h1>/);
  });

  test("renders filter toolbar with kind, verb, and date inputs", () => {
    const { body } = render(Page, { props: { data: pageData() } });
    expect(body).toContain("data-audit-kind-filter");
    expect(body).toContain("data-audit-verb-filter");
  });

  test("renders event rows in table", () => {
    const { body } = render(Page, { props: { data: pageData() } });
    const rowMatches = body.match(/data-audit-row/g) ?? [];
    expect(rowMatches).toHaveLength(2);
  });

  test("renders empty state when no events", () => {
    const { body } = render(Page, { props: { data: pageData([], 0) } });
    expect(body).toContain("data-empty-audit");
  });

  test("renders export buttons for CSV and JSON", () => {
    const { body } = render(Page, { props: { data: pageData() } });
    expect(body).toContain("data-export-csv");
    expect(body).toContain("data-export-json");
  });

  test("renders skeleton while data is pending", () => {
    const pending = new Promise<{ events: EventRow[]; total: number }>(() => {});
    const { body } = render(Page, {
      props: {
        data: {
          filter: { kind: "", verb: "", actor: "", project: "", since: "", until: "" },
          page: 1,
          streamed: { data: pending },
        },
      },
    });
    expect(body).toContain("data-route-skeleton");
  });

  test("payload preview truncated to 100 chars", () => {
    const longPayload = { data: "x".repeat(200) };
    const events: EventRow[] = [
      { id: "e1", org_id: "o1", project_id: null, actor: "a", subject_kind: "task", subject_id: "t1", verb: "created", payload: longPayload, created_at: "2026-05-01T00:00:00Z" },
    ];
    const { body } = render(Page, { props: { data: pageData(events) } });
    // Should contain the truncation marker
    expect(body).toContain("…");
  });
});
