import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/runs"),
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

mock.module("$app/forms", () => ({
  enhance: () => {},
}));

mock.module("$app/environment", () => ({ browser: false, dev: false, building: false, version: "" }));

interface RunRow {
  id: string;
  agent: string;
  model: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  project_id: string | null;
  task_id?: string | null;
  task_title?: string | null;
  started_at: string;
  ended_at: string | null;
  last_event_at?: string | null;
  recent_events?: Array<{
    id: string;
    verb: string;
    actor: string;
    created_at: string;
    payload: Record<string, unknown>;
  }>;
}

type PageProps = {
  data: {
    activeProjectId: string | null;
    filter: {
      agent: string;
      status: string;
      range: string;
      project: string;
      dateFrom?: string;
      dateTo?: string;
    };
    streamed: {
      data: Promise<{ runs: RunRow[]; projects?: unknown[]; tasks?: unknown[] }> | { runs: RunRow[]; projects?: unknown[]; tasks?: unknown[] };
    };
  };
};

const SAMPLE: RunRow[] = [
  {
    id: "01J0RUN0000000000000000001",
    agent: "claude",
    model: "opus",
    status: "succeeded",
    project_id: null,
    task_id: "task-alpha",
    task_title: "Design run feed",
    started_at: "2026-04-30T10:00:00.000Z",
    ended_at: "2026-04-30T10:30:00.000Z",
    last_event_at: "2026-04-30T10:29:00.000Z",
    recent_events: [{ id: "event-alpha", verb: "run.succeeded", actor: "system", created_at: "2026-04-30T10:29:00.000Z", payload: { summary: "Run complete" } }],
  },
  {
    id: "01J0RUN0000000000000000002",
    agent: "codex",
    model: "gpt-5",
    status: "running",
    project_id: null,
    task_id: "task-beta",
    task_title: "Wire filters",
    started_at: "2026-04-30T11:00:00.000Z",
    ended_at: null,
    last_event_at: "2026-04-30T11:05:00.000Z",
    recent_events: [{ id: "event-beta", verb: "run.running", actor: "codex", created_at: "2026-04-30T11:05:00.000Z", payload: { status: "running" } }],
  },
  {
    id: "01J0RUN0000000000000000003",
    agent: "gemini",
    model: "pro",
    status: "failed",
    project_id: null,
    task_id: "task-gamma",
    task_title: "Fix event history",
    started_at: "2026-04-30T09:00:00.000Z",
    ended_at: "2026-04-30T09:05:00.000Z",
    last_event_at: "2026-04-30T09:05:00.000Z",
    recent_events: [{ id: "event-gamma", verb: "run.failed", actor: "gemini", created_at: "2026-04-30T09:05:00.000Z", payload: { reason: "failed" } }],
  },
];

function pageData(
  runs: RunRow[],
  filter = { agent: "", status: "", range: "all", project: "__any__" },
): PageProps["data"] {
  return {
    activeProjectId: null,
    filter,
    streamed: { data: { runs } },
  };
}

describe("/runs +page.svelte", () => {
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
    const pending = new Promise<{ runs: RunRow[] }>(() => {});
    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: null,
          filter: { agent: "", status: "", range: "all", project: "__any__", dateFrom: "", dateTo: "" },
          streamed: { data: pending },
        },
      },
    });
    expect(body).toContain("data-route-skeleton");
    expect(body).toContain('data-kind="list"');
  });

  test("renders three run rows via RunsTable", () => {
    const { body } = render(Page, {
      props: { data: pageData(SAMPLE) },
    });
    const rowMatches = body.match(/data-runs-row[^>]*data-run-id="([^"]+)"/g) ?? [];
    expect(rowMatches).toHaveLength(3);
  });

  test("filter pane has live agent, status, range, project, and date controls", () => {
    const { body } = render(Page, {
      props: { data: pageData(SAMPLE) },
    });
    expect(body).toContain("data-runs-agent-filter");
    expect(body).toContain("data-runs-status-filter");
    expect(body).toContain("data-runs-range-filter");
    expect(body).toContain("data-runs-project-filter");
    expect(body).toContain("data-runs-date-from-filter");
    expect(body).toContain("data-runs-date-to-filter");
    expect(body).not.toContain(">Apply</button>");
  });

  test("renders task and event history from the run feed rows", () => {
    const { body } = render(Page, {
      props: { data: pageData(SAMPLE) },
    });
    expect(body).toContain("Design run feed");
    expect(body).toContain("data-run-event-timeline");
    expect(body).toContain("run.succeeded");
  });

  test("renders empty state when there are zero runs", () => {
    const { body } = render(Page, {
      props: { data: pageData([]) },
    });
    expect(body).toContain("data-empty-runs");
  });

  test("header h1 reads 'Agent runs'", () => {
    const { body } = render(Page, {
      props: { data: pageData([]) },
    });
    expect(body).toMatch(/<h1\b[^>]*>\s*Agent runs\s*<\/h1>/);
  });
});
