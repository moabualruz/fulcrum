import type { Component } from "svelte";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "bun:test";

interface ArtifactRow {
  id: string;
  project_id: string | null;
  run_id: string | null;
  task_id?: string | null;
  trace_id?: string | null;
  doc_id?: string | null;
  kind: string;
  title: string;
  mime: string | null;
  preview: string | null;
  thumbnail: boolean;
  archived: boolean;
  size: number | null;
  created_at: string;
}

type PageProps = {
  data: {
    activeProjectId?: string | null;
    filter: { kind: string; project: string; run: string; task: string; trace: string; mime: string; archived: string };
    streamed: { data: { artifacts: ArtifactRow[] } | Promise<{ artifacts: ArtifactRow[] }> };
  };
};

const ARTIFACTS: ArtifactRow[] = [
  {
    id: "a1",
    project_id: "p1",
    run_id: "r1",
    task_id: "t1",
    trace_id: "trace-a1",
    doc_id: null,
    kind: "image",
    title: "screen.png",
    mime: "image/png",
    preview: null,
    thumbnail: true,
    archived: false,
    size: 1024,
    created_at: "2026-05-01T10:00:00Z",
  },
  {
    id: "a2",
    project_id: "p1",
    run_id: "r1",
    task_id: null,
    trace_id: "trace-a2",
    doc_id: "d1",
    kind: "text",
    title: "summary.txt",
    mime: "text/plain",
    preview: "x".repeat(200),
    thumbnail: false,
    archived: true,
    size: 200,
    created_at: "2026-05-01T10:01:00Z",
  },
  {
    id: "a3",
    project_id: "p1",
    run_id: "r1",
    task_id: null,
    trace_id: "trace-a3",
    doc_id: null,
    kind: "text",
    title: "notes.md",
    mime: "text/markdown",
    preview: null,
    thumbnail: false,
    archived: false,
    size: 50,
    created_at: "2026-05-01T10:02:00Z",
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

  test("renders artifacts list with checkboxes and archived badge", () => {
    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: "p1",
          filter: { kind: "", project: "p1", run: "", task: "", trace: "", mime: "", archived: "" },
          streamed: { data: { artifacts: ARTIFACTS } },
        },
      },
    });
    expect(body).toContain("data-artifacts-list");
    expect(body).toContain("data-artifact-row");
    // Checkboxes for selection
    expect(body).toContain("data-artifact-checkbox");
    expect(body).toContain("data-select-all");
    expect(body).toContain("data-artifact-upload");
    expect(body).toContain("data-artifacts-run-filter");
    expect(body).toContain("data-artifacts-task-filter");
    expect(body).toContain("data-artifacts-trace-filter");
    expect(body).toContain("data-artifact-trace-id");
    expect(body).toContain("trace-a1");
    // Archived badge on a2
    expect(body).toContain("data-archived-badge");
    expect(body).toContain("Archived");
    // Show archived toggle
    expect(body).toContain("data-show-archived-toggle");
  });

  test("renders filter bar with MIME and kind selects", () => {
    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: null,
          filter: { kind: "", project: "", run: "", task: "", trace: "", mime: "", archived: "" },
          streamed: { data: { artifacts: ARTIFACTS } },
        },
      },
    });
    expect(body).toContain("data-artifacts-filter");
    expect(body).toContain("data-artifacts-mime-filter");
    expect(body).toContain("data-artifacts-kind-filter");
    expect(body).toContain("data-artifacts-project-filter");
  });

  test("keeps protected destructive action controls in the artifact surface", () => {
    const source = readFileSync(new URL("./+page.svelte", import.meta.url), "utf8");
    expect(source).toContain("data-bulk-delete");
    expect(source).toContain("data-confirm-delete-modal");
    expect(source).toContain("data-confirm-delete-yes");
    expect(source).toContain("data-confirm-delete-cancel");
    expect(source).toContain("showConfirmDelete");
  });

  test("renders empty state when no artifacts", () => {
    const { body } = render(Page, {
      props: {
        data: {
          activeProjectId: null,
          filter: { kind: "", project: "", run: "", task: "", trace: "", mime: "", archived: "" },
          streamed: { data: { artifacts: [] } },
        },
      },
    });
    expect(body).toContain("data-empty-artifacts");
    expect(body).toContain("No artifacts match");
  });
});
