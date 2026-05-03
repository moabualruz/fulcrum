import type { Component } from "svelte";
import { beforeAll, describe, expect, test } from "bun:test";

interface ArtifactRow {
  id: string;
  project_id: string | null;
  run_id: string | null;
  kind: string;
  title: string;
  mime: string | null;
  preview: string | null;
  thumbnail: boolean;
  created_at: string;
}

type PageProps = {
  data: {
    filter: { kind: string; project: string; run: string };
    streamed: { data: { artifacts: ArtifactRow[] } | Promise<{ artifacts: ArtifactRow[] }> };
  };
};

const ARTIFACTS: ArtifactRow[] = [
  {
    id: "a1",
    project_id: "p1",
    run_id: "r1",
    kind: "image",
    title: "screen.png",
    mime: "image/png",
    preview: null,
    thumbnail: true,
    created_at: "2026-05-01T10:00:00Z",
  },
  {
    id: "a2",
    project_id: "p1",
    run_id: "r1",
    kind: "text",
    title: "summary.txt",
    mime: "text/plain",
    preview: "x".repeat(200),
    thumbnail: false,
    created_at: "2026-05-01T10:01:00Z",
  },
];

describe("/artifacts +page.svelte", () => {
  let render: typeof import("svelte/server").render;
  let Page: Component<PageProps>;

  beforeAll(async () => {
    ({ render } = await import("svelte/server"));
    const mod = (await import("./+page.svelte")) as { default: Component<PageProps> };
    Page = mod.default;
  });

  test("renders filter sidebar, thumbnail marker, and text preview", () => {
    const { body } = render(Page, {
      props: {
        data: {
          filter: { kind: "", project: "p1", run: "" },
          streamed: { data: { artifacts: ARTIFACTS } },
        },
      },
    });
    expect(body).toContain("data-artifacts-filter-sidebar");
    expect(body).toContain("data-artifact-thumbnail");
    expect(body).toContain("data-artifact-preview");
    expect(body).toContain("x".repeat(200));
  });
});
