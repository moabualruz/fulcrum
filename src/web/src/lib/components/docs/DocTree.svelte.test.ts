import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

import type { DocTreeNode } from "./doc-tree";

type DocTreeProps = {
  title: string;
  scope: "project" | "global";
  nodes: DocTreeNode[];
  selectedDocId?: string | null;
  breadcrumbs?: DocTreeNode[];
};

const nodes: DocTreeNode[] = [
  {
    id: "root",
    title: "Root wiki",
    slug: "root-wiki",
    parentId: null,
    projectId: "project-1",
    scope: "project",
    docType: "wiki",
    sortPosition: 10,
    children: [
      {
        id: "child",
        title: "Child spec",
        slug: "child-spec",
        parentId: "root",
        projectId: "project-1",
        scope: "project",
        docType: "spec",
        sortPosition: 20,
        children: [],
      },
    ],
  },
];

describe("DocTree component (SSR)", () => {
  let render: typeof import("svelte/server").render;
  let DocTree: Component<DocTreeProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    DocTree = (await import("./DocTree.svelte")).default as Component<DocTreeProps>;
  });

  test("renders nested tree nodes with doc type icons, color badges, context actions, and breadcrumbs", () => {
    const { body } = render(DocTree, {
      props: {
        title: "Project docs",
        scope: "project",
        nodes,
        selectedDocId: "child",
        breadcrumbs: [nodes[0]!, nodes[0]!.children[0]!],
      },
    });

    expect(body).toContain("data-doc-tree");
    expect(body).toContain('data-scope="project"');
    expect(body).toContain('role="tree"');
    expect(body).toContain('data-doc-node-id="root"');
    expect(body).toContain('data-doc-node-id="child"');
    expect(body).toContain('aria-level="2"');
    expect(body).toContain('data-doc-type-icon="wiki"');
    expect(body).toContain('data-doc-type-badge="spec"');
    expect(body).toContain("bg-purple");
    expect(body).toContain("data-doc-context-menu");
    expect(body).toContain('href="/docs/new?parent_id=child&amp;scope=project"');
    expect(body).toContain("data-doc-breadcrumbs");
    expect(body).toContain('href="/docs/root"');
  });
});
