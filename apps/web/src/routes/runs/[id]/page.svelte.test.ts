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
            artifacts: Array<RunArtifact>;
            events: Array<{ id: string; verb: string; created_at: string; payload: Record<string, unknown> }>;
            observability: Observability;
          }>
        | {
            run: RunDetail;
            transcript: string | null;
            logs: { entries: Array<{ timestamp?: string; stream: string; text: string }>; cursor: string | null } | null;
            diff: string | null;
            artifacts: Array<RunArtifact>;
            events: Array<{ id: string; verb: string; created_at: string; payload: Record<string, unknown> }>;
            observability: Observability;
          };
    };
  };
};

interface RunArtifact {
  id: string;
  project_id: string | null;
  run_id: string | null;
  task_id: string | null;
  doc_id: string | null;
  kind: string;
  title: string;
  mime: string | null;
  size: number | null;
  body_path: string | null;
  archived: boolean;
  lifecycle_state: string;
  retention_until: string | null;
  preview_kind: string;
  linked_doc_id: string | null;
  promoted_to_memory: boolean;
}

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
  artifacts?: RunArtifact[];
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
        artifacts: input.artifacts ?? [],
        events: input.events.map((event) => ({
          ...event,
          payload: event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {},
        })),
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
      events: Array<{ id: string; verb: string; created_at: string; payload: Record<string, unknown> }>;
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

  test("renders live workflow summary, stream recovery, tool timeline, and diff pane", () => {
    const events = [
      {
        id: "e-tool",
        verb: "tool.completed",
        created_at: "2026-04-30T10:00:01Z",
        payload: { toolName: "apply_patch", args: { file: "apps/web/src/routes/runs/[id]/+page.svelte" }, status: "0", summary: "patched" },
      },
      {
        id: "e-diff",
        verb: "workspace.diff",
        created_at: "2026-04-30T10:00:02Z",
        payload: { diff: "diff --git a/a.ts b/a.ts" },
      },
    ];
    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: null,
          streamed: {
            data: {
              run: { ...RUN, project_id: "project-1" },
              transcript: null,
              logs: null,
              diff: "diff --git a/apps/web/src/routes/runs/[id]/+page.svelte b/apps/web/src/routes/runs/[id]/+page.svelte\n@@ -1 +1 @@\n-old\n+new",
              artifacts: [],
              events,
              observability: {
                context: {
                  sourceRefs: [{ kind: "task", id: "task-1", reason: "selected-task", scope: "project" }],
                  warnings: [],
                  scope: { projectId: "project-1", taskId: "task-1", includeGlobal: false },
                },
                artifacts: [],
                memoryCandidates: [],
                followUpTasks: [],
                audit: [],
                recovery: { retryable: true, retryCount: 0, nextRetryAt: null, lastErrorKind: null },
              },
            },
          },
        },
      },
    });
    expect(body).toContain("data-run-workflow-summary");
    expect(body).toContain("data-run-live-state");
    expect(body).toContain('href="/projects/project-1/runs"');
    expect(body).toContain("data-ai-assist-live-session");
    expect(body).toContain("data-live-session-disconnect");
    expect(body).toContain("data-tool-call-timeline");
    expect(body).toContain("data-tool-call-card");
    expect(body).toContain("apply_patch");
    expect(body).toContain("data-diff-preview");
    expect(body).toContain("data-live-file-diff-pane");
    expect(body).toContain("data-file-scope-validation");
    expect(body).toContain("data-live-unified-diff");
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

  test("renders artifact pane with preview, retention, provenance, and promotion actions", () => {
    const artifacts: RunArtifact[] = [
      {
        id: "artifact-diff",
        project_id: "project-1",
        run_id: RUN.id,
        task_id: "task-1",
        doc_id: "doc-existing",
        kind: "diff",
        title: "workspace.diff",
        mime: "text/x-diff",
        size: 128,
        body_path: "runs/workspace.diff",
        archived: false,
        lifecycle_state: "linked",
        retention_until: "2026-06-01T00:00:00.000Z",
        preview_kind: "code",
        linked_doc_id: "doc-existing",
        promoted_to_memory: false,
      },
    ];
    const { body } = render(Page, {
      props: { data: pageData({ run: RUN, transcript: null, events: [], artifacts }) },
    });
    expect(body).toContain("data-runs-artifacts");
    expect(body).toContain("workspace.diff");
    expect(body).toContain("diff");
    expect(body).toContain("data-runs-artifact-preview");
    expect(body).toContain("code preview");
    expect(body).toContain("data-runs-artifact-retention");
    expect(body).toContain("Retains until 2026-06-01T00:00:00.000Z");
    expect(body).toContain('href="/tasks/task-1"');
    expect(body).toContain('href="/projects/project-1"');
    expect(body).toContain('href="/runs/01J0RUN0000000000000000001"');
    expect(body).toContain("data-runs-artifact-archive");
    expect(body).toContain("data-runs-artifact-doc-link");
    expect(body).toContain("data-runs-artifact-promote-memory");
    expect(body).toContain("doc-existing");
  });
});
