import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import { auditRoute, mockSvelteKitRoute } from "./runs-helpers";

mockSvelteKitRoute("/");

interface DashboardData {
  counters: { projects: number; openTasks: number; docs: number; runsLast7d: number };
  recentRuns: Array<{ id: string; agent: string; status: string; started_at: string; ended_at: string | null }>;
  recentDocs: Array<{ id: string; title: string; kind: string; updated_at: string }>;
  topTasks: Array<{ id: string; title: string; status: string; priority: number; project_id: string | null }>;
}

interface PageProps {
  data: {
    activeProjectId: string | null;
    streamed: { dashboard: Promise<DashboardData> };
  };
}

const dashboard: DashboardData = {
  counters: { projects: 2, openTasks: 3, docs: 4, runsLast7d: 5 },
  recentRuns: [
    {
      id: "01J0RUN0000000000000000001",
      agent: "codex",
      status: "succeeded",
      started_at: "2026-04-30T10:00:00.000Z",
      ended_at: null,
    },
  ],
  recentDocs: [
    {
      id: "01J0DOC00000000000000000001",
      title: "Architecture note",
      kind: "note",
      updated_at: "2026-04-30T12:00:00.000Z",
    },
  ],
  topTasks: [
    {
      id: "01J0TASK000000000000000001",
      title: "Review shell",
      status: "pending",
      priority: 2,
      project_id: "alpha",
    },
  ],
};

describe("dashboard route a11y", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("../../src/routes/+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("no axe-core serious/critical violations on /", async () => {
    const { body } = render(Page, {
      props: { data: { activeProjectId: null, streamed: { dashboard: Promise.resolve(dashboard) } } },
    });
    const result = await auditRoute(body);
    const severe = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(severe).toEqual([]);
  });
});
