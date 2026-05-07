import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: number;
  project_id: string | null;
};

type TopTasksProps = {
  tasks: TaskRow[];
};

const SAMPLE_TASKS: TaskRow[] = [
  { id: "t1", title: "Fix auth bug", status: "open", priority: 1, project_id: "p1" },
  { id: "t2", title: "Write docs", status: "in_progress", priority: 2, project_id: null },
  { id: "t3", title: "Deploy pipeline", status: "open", priority: 3, project_id: "p2" },
];

describe("TopTasks component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let TopTasks: Component<TopTasksProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./TopTasks.svelte")) as {
      default: Component<TopTasksProps>;
    };
    TopTasks = mod.default;
  });

  test("3 tasks yield 3 li[data-top-task]", () => {
    const { body } = render(TopTasks, { props: { tasks: SAMPLE_TASKS } });
    const matches = body.match(/data-top-task\b/g) ?? [];
    expect(matches).toHaveLength(3);
  });

  test("priority rendered as P<n>", () => {
    const { body } = render(TopTasks, { props: { tasks: SAMPLE_TASKS } });
    expect(body).toContain("P1");
    expect(body).toContain("P2");
    expect(body).toContain("P3");
  });

  test("empty array yields data-top-tasks-empty", () => {
    const { body } = render(TopTasks, { props: { tasks: [] } });
    expect(body).toContain("data-top-tasks-empty");
    expect(body).not.toContain("data-top-task\"");
  });

  test("renders section with data-top-tasks and h3 'Top tasks'", () => {
    const { body } = render(TopTasks, { props: { tasks: SAMPLE_TASKS } });
    expect(body).toContain("data-top-tasks");
    expect(body).toMatch(/<h3\b[^>]*>\s*Top tasks\s*<\/h3>/);
  });
});
