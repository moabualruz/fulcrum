import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";
import type { DependencyTreeTask } from "./DependencyTree.svelte";

type Props = {
  tasks: DependencyTreeTask[];
  targetTaskIds: string[];
  warnings?: string[];
  blocked?: boolean;
};

describe("DependencyTree component", () => {
  let render: typeof import("svelte/server").render;
  let DependencyTree: Component<Props>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./DependencyTree.svelte")) as { default: Component<Props> };
    DependencyTree = mod.default;
  });

  test("renders target tasks, blockers, warnings, and dependency depth disclosure", () => {
    const { body } = render(DependencyTree, {
      props: {
        targetTaskIds: ["task-release"],
        warnings: ["Target task-release requires prerequisites."],
        blocked: true,
        tasks: [
          task("task-db", "Provision database", "done", false, 1, [], []),
          task("task-release", "Run release board", "todo", true, 0, ["task-db"], ["blocked by review"]),
        ],
      },
    });

    expect(body).toContain("data-dependency-tree");
    expect(body).toContain("data-dependency-blocked");
    expect(body).toContain("data-dependency-warnings");
    expect(body).toContain('data-task-id="task-db"');
    expect(body).toContain('data-task-id="task-release"');
    expect(body).toContain('data-selected="true"');
    expect(body).toContain("Provision database");
    expect(body).toContain("Run release board");
    expect(body).toContain("1 dep");
    expect(body).toContain("blocked");
  });

  test("renders empty dependency chain state", () => {
    const { body } = render(DependencyTree, {
      props: { targetTaskIds: [], tasks: [] },
    });

    expect(body).toContain("No tasks in dependency chain.");
  });
});

function task(
  id: string,
  title: string,
  column: string,
  selected: boolean,
  dependencyDepth: number,
  dependencyIds: string[],
  blockers: string[],
): DependencyTreeTask {
  return { id, title, column, selected, dependencyDepth, dependencyIds, blockers };
}
