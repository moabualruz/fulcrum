import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

// `$app/state` is a SvelteKit virtual; ProjectPicker doesn't import it
// directly but transitive imports may. Stub here for safety.
mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/"),
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
  goto: () => Promise.resolve(),
  invalidateAll: () => Promise.resolve(),
}));

type ProjectPickerProps = {
  activeProjectId: string | null;
  projects: { slug: string; name: string }[];
};

describe("ProjectPicker component", () => {
  let render: typeof import("svelte/server").render;
  let ProjectPicker: Component<ProjectPickerProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./ProjectPicker.svelte")) as {
      default: Component<ProjectPickerProps>;
    };
    ProjectPicker = mod.default;
  });

  test("activeProjectId=null → trigger label 'Select project', no clear item", () => {
    const { body } = render(ProjectPicker, {
      props: {
        activeProjectId: null,
        projects: [
          { slug: "a", name: "Alpha" },
          { slug: "b", name: "Beta" },
        ],
      },
    });
    // Trigger present.
    const triggerMatches =
      body.match(/data-project-picker-trigger/g) ?? [];
    expect(triggerMatches).toHaveLength(1);
    expect(body).toContain("Select project");

    // Two project items rendered.
    const itemMatches =
      body.match(/data-project-picker-item/g) ?? [];
    expect(itemMatches).toHaveLength(2);
    expect(body).toMatch(/data-slug="a"/);
    expect(body).toMatch(/data-slug="b"/);
    expect(body).toContain("Alpha");
    expect(body).toContain("Beta");

    // No clear item when nothing active.
    expect(body).not.toMatch(/data-project-picker-clear/);
  });

  test("activeProjectId='a' → trigger shows 'Alpha', clear item present", () => {
    const { body } = render(ProjectPicker, {
      props: {
        activeProjectId: "a",
        projects: [
          { slug: "a", name: "Alpha" },
          { slug: "b", name: "Beta" },
        ],
      },
    });
    // Trigger label reflects active project name.
    const triggerSection = body.match(
      /data-project-picker-trigger[^>]*>([\s\S]*?)<\/button>/,
    );
    expect(triggerSection).not.toBeNull();
    expect(triggerSection![1]).toContain("Alpha");

    // Clear item present.
    const clearMatches =
      body.match(/data-project-picker-clear/g) ?? [];
    expect(clearMatches).toHaveLength(1);
    expect(body).toContain("Clear active project");
  });
});
