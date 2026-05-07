import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

describe("InContextSearchBar", () => {
  let render: typeof import("svelte/server").render;
  let SearchBar: Component<{
    kind: string;
    projectId?: string | null;
    placeholder?: string;
  }>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./InContextSearchBar.svelte")) as unknown as {
      default: typeof SearchBar;
    };
    SearchBar = mod.default;
  });

  test("renders scoped search input with kind and project context", () => {
    const { body } = render(SearchBar, {
      props: { kind: "task", projectId: "project-1", placeholder: "Search tasks" },
    });

    expect(body).toContain("data-in-context-search");
    expect(body).toContain('data-search-kind="task"');
    expect(body).toContain('data-search-project-id="project-1"');
    expect(body).toContain('name="q"');
    expect(body).toContain('placeholder="Search tasks"');
    expect(body).toContain("data-search-facets");
    expect(body).toContain("data-search-clear");
  });
});
