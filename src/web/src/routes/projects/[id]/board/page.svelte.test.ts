import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

type PageProps = {
  data: {
    project: { id: string; name: string };
    tasks: [];
  };
};

describe("/projects/[id]/board +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as {
      default: Component<PageProps>;
    };
    Page = mod.default;
  });

  test("renders project view switcher and kanban board", () => {
    const { body } = render(Page, {
      props: { data: { project: { id: "project-1", name: "Alpha" }, tasks: [] } },
    });

    expect(body).toMatch(/data-project-view-switcher/);
    expect(body).toMatch(/data-project-view="board"[^>]*aria-current="page"/);
    expect(body).toMatch(/data-kanban-board/);
  });
});
