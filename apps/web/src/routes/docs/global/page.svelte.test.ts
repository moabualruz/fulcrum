import type { Component } from "svelte";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, mock, test } from "bun:test";

mock.module("$app/forms", () => ({
  enhance: () => ({ destroy() {} }),
}));

type GlobalDocsProps = {
  data: {
    tree: Array<{
      id: string;
      title: string;
      kind: string;
      parent_id: string | null;
      sort_order: number;
      updated_at: string;
      children: GlobalDocsProps["data"]["tree"];
    }>;
  };
};

describe("/docs/global +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<GlobalDocsProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<GlobalDocsProps> };
    Page = mod.default;
  });

  test("renders drag-enabled document tree with accessible reorder controls", () => {
    const { body } = render(Page, {
      props: {
        data: {
          tree: [
            { id: "doc-a", title: "Alpha", kind: "note", parent_id: null, sort_order: 1, updated_at: "", children: [] },
            { id: "doc-b", title: "Beta", kind: "note", parent_id: null, sort_order: 2, updated_at: "", children: [] },
          ],
        },
      },
    });

    expect(body).toContain("data-doc-tree");
    expect(body).toContain("draggable=\"true\"");
    expect(body).toContain("data-tree-move-up");
    expect(body).toContain("data-tree-move-down");
    expect(body).toContain("name=\"sortPosition\"");
    expect(body).toContain("name=\"parentId\"");
  });

  test("keeps drop reorder wired to the public reorder action", () => {
    const source = readFileSync(join(import.meta.dir, "+page.svelte"), "utf8");

    expect(source).toContain("ondragstart");
    expect(source).toContain("ondrop");
    expect(source).toContain("?/reorder");
    expect(source).toContain("application/x-fulcrum-doc-id");
  });
});
