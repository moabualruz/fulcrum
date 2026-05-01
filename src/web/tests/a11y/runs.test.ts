import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import { auditRoute, mockSvelteKitRoute } from "./runs-helpers";

mockSvelteKitRoute("/runs");

interface RunRow {
  id: string;
  agent: string;
  model: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  project_id: string | null;
  started_at: string;
  ended_at: string | null;
}

interface PageProps {
  data: {
    runs: RunRow[];
    filter: { agent: string; status: string; range: string; project: string };
  };
}

const runs: RunRow[] = [
  {
    id: "01J0RUN0000000000000000001",
    agent: "codex",
    model: "gpt-5",
    status: "running",
    project_id: "alpha",
    started_at: "2026-04-30T11:00:00.000Z",
    ended_at: null,
  },
];

describe("runs route a11y", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("../../src/routes/runs/+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("no axe-core serious/critical violations on /runs", async () => {
    const { body } = render(Page, {
      props: { data: { runs, filter: { agent: "", status: "", range: "all", project: "__any__" } } },
    });
    const result = await auditRoute(body);
    const severe = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(severe).toEqual([]);
  });
});
