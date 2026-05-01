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
}

type PageProps = {
  data: {
    run: RunDetail;
    transcript: string | null;
    events: Array<{ id: string; verb: string; created_at: string; payload: unknown }>;
  };
};

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
};

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

  test("renders three tab buttons (transcript, payload, events)", () => {
    const { body } = render(Page, {
      props: { data: { run: RUN, transcript: null, events: [] } },
    });
    expect(body).toContain('data-tab="transcript"');
    expect(body).toContain('data-tab="payload"');
    expect(body).toContain('data-tab="events"');
    expect(body).toContain("data-runs-tabs");
  });

  test("shows transcript empty state when transcript is null", () => {
    const { body } = render(Page, {
      props: { data: { run: RUN, transcript: null, events: [] } },
    });
    expect(body).toContain("data-runs-transcript-empty");
    expect(body).toContain("No transcript recorded");
  });

  test("shows transcript content when transcript provided", () => {
    const { body } = render(Page, {
      props: { data: { run: RUN, transcript: "hello world", events: [] } },
    });
    expect(body).toContain("data-runs-transcript");
    expect(body).toContain("hello world");
    expect(body).not.toContain("data-runs-transcript-empty");
  });

  test("renders cancel and retry triggers", () => {
    const { body } = render(Page, {
      props: { data: { run: RUN, transcript: null, events: [] } },
    });
    expect(body).toContain("data-runs-cancel-trigger");
    expect(body).toContain("data-runs-retry-trigger");
  });

  test("payload tab renders the run JSON", () => {
    const { body } = render(Page, {
      props: { data: { run: RUN, transcript: null, events: [] } },
    });
    expect(body).toContain("data-runs-payload");
    expect(body).toContain(RUN.id);
    expect(body).toContain(RUN.agent);
  });

  test("events tab markers present", () => {
    const events = [
      { id: "e1", verb: "created", created_at: "2026-04-30T10:00:00Z", payload: {} },
      { id: "e2", verb: "started", created_at: "2026-04-30T10:00:01Z", payload: {} },
    ];
    const { body } = render(Page, {
      props: { data: { run: RUN, transcript: null, events } },
    });
    expect(body).toContain("data-runs-events");
  });
});
