import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/runs/r1"),
    params: { id: "r1" },
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

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
  applyAction: async () => {},
  deserialize: (s: string) => JSON.parse(s),
}));

interface RunDetail {
  id: string;
  agent: string;
  model: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  project_id: string | null;
  started_at: string;
  ended_at: string | null;
  transcript_path: string | null;
  prompt: string | null;
  org_id: string;
  parent_run_id: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  last_error_kind: string | null;
}

type PageProps = {
  data: {
    activeProjectId: string | null;
    streamed: {
      data:
        | Promise<{
            run: RunDetail;
            transcript: string | null;
            logs: { entries: Array<{ timestamp?: string; stream: string; text: string }>; cursor: string | null } | null;
            diff: string | null;
            artifacts: Array<{ id: string; title: string; mime: string | null; size: number | null; body_path: string | null }>;
            events: Array<{ id: string; verb: string; created_at: string; payload: unknown }>;
            observability: Observability;
          }>
        | {
            run: RunDetail;
            transcript: string | null;
            logs: { entries: Array<{ timestamp?: string; stream: string; text: string }>; cursor: string | null } | null;
            diff: string | null;
            artifacts: Array<{ id: string; title: string; mime: string | null; size: number | null; body_path: string | null }>;
            events: Array<{ id: string; verb: string; created_at: string; payload: unknown }>;
            observability: Observability;
          };
    };
  };
};

interface Observability {
  context: {
    sourceRefs: Array<{ kind: string; id: string; reason: string; scope: string }>;
    warnings: string[];
    scope: { projectId: string | null; taskId: string | null; includeGlobal: boolean };
  };
  artifacts: Array<{ id: string; filename: string; path: string | null; mime: string | null; lifecycleState: string; createdAt: string }>;
  memoryCandidates: Array<Record<string, unknown>>;
  followUpTasks: Array<Record<string, unknown>>;
  audit: Array<{ id: string; verb: string; actor: string; payload: Record<string, unknown>; createdAt: string }>;
  recovery: { retryable: boolean; retryCount: number; nextRetryAt: string | null; lastErrorKind: string | null };
}

const RUN: RunDetail = {
  id: "01J0RUN0000000000000000001",
  agent: "claude",
  model: "opus",
  status: "running",
  project_id: null,
  started_at: "2026-04-30T10:00:00.000Z",
  ended_at: null,
  transcript_path: null,
  prompt: "Do thing",
  org_id: "org-1",
  parent_run_id: null,
  attempt_count: 0,
  next_retry_at: null,
  last_error_kind: null,
};

function pageData(input: {
  run: RunDetail;
  transcript: string | null;
  events: Array<{ id: string; verb: string; created_at: string; payload: unknown }>;
  observability?: Partial<Observability>;
}): PageProps["data"] {
  const observability: Observability = {
    context: {
      sourceRefs: [{ kind: "task", id: "task-1", reason: "selected-task", scope: "project" }],
      warnings: [],
      scope: { projectId: null, taskId: "task-1", includeGlobal: false },
    },
    artifacts: [],
    memoryCandidates: [],
    followUpTasks: [],
    audit: [],
    recovery: { retryable: true, retryCount: input.run.attempt_count, nextRetryAt: input.run.next_retry_at, lastErrorKind: input.run.last_error_kind },
    ...input.observability,
  };
  return {
    activeProjectId: null,
    streamed: {
      data: {
        run: input.run,
        transcript: input.transcript,
        logs: null,
        diff: null,
        artifacts: [],
        events: input.events,
        observability,
      },
    },
  };
}

describe("/runs/[id] +page.svelte (SSR)", () => {
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
    const pending = new Promise<{
      run: RunDetail;
      transcript: string | null;
      logs: null;
      diff: null;
      artifacts: [];
      events: Array<{ id: string; verb: string; created_at: string; payload: unknown }>;
      observability: Observability;
    }>(() => {});
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { data: pending } } },
    });
    expect(body).toContain("data-route-skeleton");
    expect(body).toContain('data-kind="detail"');
  });

  test("renders review default plus advanced trace tabs", () => {
    const { body } = render(Page, {
      props: { data: pageData({ run: RUN, transcript: null, events: [] }) },
    });
    expect(body).toContain('data-tab="review"');
    expect(body).toContain('data-tab="transcript"');
    expect(body).toContain('data-tab="payload"');
    expect(body).toContain('data-tab="events"');
    expect(body).toContain('data-tab="advanced"');
    expect(body).toContain("data-runs-review");
    expect(body).toContain("source refs");
    expect(body).toContain("data-runs-tabs");
  });

  test("shows transcript empty state when transcript is null", () => {
    const { body } = render(Page, {
      props: { data: pageData({ run: RUN, transcript: null, events: [] }) },
    });
    expect(body).toContain("data-runs-transcript-empty");
    expect(body).toContain("No transcript recorded");
  });

  test("shows transcript content when transcript provided", () => {
    const { body } = render(Page, {
      props: { data: pageData({ run: RUN, transcript: "hello world", events: [] }) },
    });
    expect(body).toContain("data-runs-transcript");
    expect(body).toContain("hello world");
    expect(body).not.toContain("data-runs-transcript-empty");
  });

  test("renders cancel and retry triggers", () => {
    const { body } = render(Page, {
      props: { data: pageData({ run: RUN, transcript: null, events: [] }) },
    });
    expect(body).toContain("data-runs-cancel-trigger");
    expect(body).toContain("data-runs-retry-trigger");
  });

  test("payload tab renders the run JSON", () => {
    const { body } = render(Page, {
      props: { data: pageData({ run: RUN, transcript: null, events: [] }) },
    });
    expect(body).toContain("data-runs-payload");
    expect(body).toContain(RUN.id);
    expect(body).toContain(RUN.agent);
  });

  test("renders retry schedule metadata", () => {
    const run = {
      ...RUN,
      attempt_count: 3,
      next_retry_at: "2026-05-02T10:01:20.000Z",
      last_error_kind: "stall_timeout",
    };
    const { body } = render(Page, {
      props: { data: pageData({ run, transcript: null, events: [] }) },
    });
    expect(body).toContain("data-runs-retry-schedule");
    expect(body).toContain("Attempt");
    expect(body).toContain("3");
    expect(body).toContain("2026-05-02T10:01:20.000Z");
    expect(body).toContain("stall_timeout");
  });

  test("events tab markers present", () => {
    const events = [
      { id: "e1", verb: "created", created_at: "2026-04-30T10:00:00Z", payload: {} },
      { id: "e2", verb: "started", created_at: "2026-04-30T10:00:01Z", payload: {} },
    ];
    const { body } = render(Page, {
      props: { data: pageData({ run: RUN, transcript: null, events }) },
    });
    expect(body).toContain("data-runs-events");
  });
});
