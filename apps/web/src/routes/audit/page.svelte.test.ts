import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { EventRow } from "./+page.server.ts";

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

type PageProps = {
  data: {
    events: EventRow[];
    total: number;
    page: number;
    actor: string;
    kind: string;
    dateFrom: string;
    dateTo: string;
  };
};

const TASK_EVENT: EventRow = {
  id: "ev-1",
  org_id: "org-1",
  project_id: null,
  actor: "system",
  subject_kind: "task",
  subject_id: "task-1",
  verb: "created",
  payload: {},
  created_at: "2026-04-30T10:00:00.000Z",
};

const DOC_EVENT: EventRow = {
  id: "ev-2",
  org_id: "org-1",
  project_id: null,
  actor: "local",
  subject_kind: "doc",
  subject_id: "doc-1",
  verb: "updated",
  payload: {},
  created_at: "2026-04-29T09:00:00.000Z",
};

const EMPTY_DATA: PageProps["data"] = {
  events: [],
  total: 0,
  page: 1,
  actor: "",
  kind: "",
  dateFrom: "",
  dateTo: "",
};

describe("/audit +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders Audit log heading", () => {
    const { body } = render(Page, { props: { data: EMPTY_DATA } });
    expect(body).toMatch(/<h1\b[^>]*>[\s\S]*Audit log[\s\S]*<\/h1>/);
  });

  test("renders filter toolbar", () => {
    const { body } = render(Page, { props: { data: EMPTY_DATA } });
    expect(body).toContain("data-audit-filter");
    expect(body).toContain("data-audit-kind-input");
  });

  test("shows Export CSV and Export JSON buttons", () => {
    const { body } = render(Page, { props: { data: EMPTY_DATA } });
    expect(body).toContain("data-export-csv");
    expect(body).toContain("data-export-json");
  });

  test("shows empty state when no events", () => {
    const { body } = render(Page, { props: { data: EMPTY_DATA } });
    expect(body).toContain("data-audit-empty");
  });

  test("renders table rows for events", () => {
    const { body } = render(Page, {
      props: {
        data: { ...EMPTY_DATA, events: [TASK_EVENT, DOC_EVENT], total: 2 },
      },
    });
    expect(body).toContain("data-audit-table");
    const rows = body.match(/data-audit-row=/g) ?? [];
    expect(rows).toHaveLength(2);
  });

  test("table row contains actor, kind, subject, verb", () => {
    const { body } = render(Page, {
      props: {
        data: { ...EMPTY_DATA, events: [TASK_EVENT], total: 1 },
      },
    });
    expect(body).toContain("data-audit-actor");
    expect(body).toContain("system");
    expect(body).toContain("data-audit-kind");
    expect(body).toContain("task");
    expect(body).toContain("data-audit-subject");
    expect(body).toContain("task-1");
    expect(body).toContain("data-audit-verb");
    expect(body).toContain("created");
  });
});
