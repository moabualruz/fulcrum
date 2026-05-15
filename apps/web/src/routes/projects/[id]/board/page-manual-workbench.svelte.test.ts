import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("svelte-tiptap", () => ({
  createEditor: () => ({ subscribe: () => () => {} }),
  EditorContent: "div",
}));

mock.module("$app/state", () => ({
  page: {
    url: new URL("http://localhost/projects/project-1/board"),
    params: { id: "project-1" },
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

type PageProps = {
  data: {
    projectId: string;
    sprintFilter: string;
    streamed: {
      data: {
        tasks: [];
        manualWorkbench: {
          traceId: string;
          layout: string;
          filtersApplied: number;
          columns: Array<{ group: string; label: string; count: number }>;
          listRows: Array<{ id: string; title: string; stateLabel: string; traceId?: string }>;
        };
      };
    };
  };
};

describe("/projects/[id]/board manual task workbench surface", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as unknown as {
      default: Component<PageProps>;
    };
    Page = mod.default;
  });

  test("renders manual task workbench summary from server payload", () => {
    const { body } = render(Page, {
      props: {
        data: {
          projectId: "project-1",
          sprintFilter: "",
          streamed: {
            data: {
              tasks: [],
              manualWorkbench: {
                traceId: "trace-web-workbench",
                layout: "kanban",
                filtersApplied: 1,
                columns: [{ group: "started", label: "Started", count: 1 }],
                listRows: [{ id: "task-workbench", title: "Build manual task workbench", stateLabel: "Started", traceId: "trace-web-workbench" }],
              },
            },
          },
        },
      },
    });

    expect(body).toContain("data-manual-workbench");
    expect(body).toContain("trace-web-workbench");
    expect(body).toContain("Started");
    expect(body).toContain("Build manual task workbench");
  });
});
