import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import { auditRoute, mockSvelteKitRoute } from "./runs-helpers";

mockSvelteKitRoute("/boards");

interface BoardTask {
  id: string;
  title: string;
  status: string;
  priority: number;
  project_id: string | null;
  updated_at: string;
}

interface PageProps {
  data: { tasks: BoardTask[]; project: string };
}

const tasks: BoardTask[] = [
  {
    id: "01J0TASK0000000000000000PE1",
    title: "Pending one",
    status: "pending",
    priority: 0,
    project_id: "alpha",
    updated_at: "2026-04-30T01:00:00.000Z",
  },
  {
    id: "01J0TASK0000000000000000IP1",
    title: "In progress one",
    status: "in_progress",
    priority: 1,
    project_id: "alpha",
    updated_at: "2026-04-29T02:00:00.000Z",
  },
];

describe("boards route a11y", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("../../src/routes/boards/+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("no axe-core serious/critical violations on /boards", async () => {
    const { body } = render(Page, {
      props: { data: { tasks, project: "" } },
    });
    const result = await auditRoute(body);
    const severe = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(severe).toEqual([]);
  });
});
